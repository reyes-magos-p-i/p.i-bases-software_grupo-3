// SCRUM-436: measures the main read queries of the API on DEVELOPMENT (never on PRODUCTION).
//   node database/performance/benchmark.cjs measure <out.json>          capture + time + plans
//   node database/performance/benchmark.cjs inserts <out.json>          purchase and projection INSERTs (rolled back)
//   node database/performance/benchmark.cjs compare <before.json> <after.json>
// It needs `npm run build` in apps/api: the scenarios call the compiled repositories, so the SQL
// and binds measured are exactly the ones the API sends. Each statement runs on the server
// (DBMS_SQL in PL/SQL) once to warm up and then 10 times, fetching every row; the median of the
// 10 is kept. Measuring from Node would mostly measure the network round trip.
// It connects with DB_CONNECT_STRING from apps/api/.env; set DB_CONNECT_STRING in the shell to
// measure another service (for example <db>_high against <db>_tp).
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')

const repo = path.resolve(__dirname, '..', '..')
const api = path.join(repo, 'apps', 'api')
const req = require('node:module').createRequire(path.join(api, 'package.json'))
req('dotenv').config({ path: path.join(api, '.env'), quiet: true })
const oracledb = req('oracledb')
// The repositories log every query; keep the benchmark output readable.
req('@nestjs/common').Logger.overrideLogger(false)
const RUNS = 10
const OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT }

async function connect() {
  const wallet = path.resolve(api, process.env.DB_WALLET_DIR)
  const connection = await oracledb.getConnection({
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectString: process.env.DB_CONNECT_STRING,
    configDir: wallet, walletLocation: wallet, walletPassword: process.env.DB_WALLET_PASSWORD,
  })
  await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${process.env.DB_SCHEMA}`)
  const schema = (await connection.execute(`SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') S FROM DUAL`, [], OBJECT)).rows[0].S
  if (schema !== 'DEVELOPMENT') throw new Error(`The benchmark only runs on DEVELOPMENT (session schema: ${schema})`)
  connection.callTimeout = 120000
  return connection
}

// Runs every scenario through the compiled repositories, in a read-only transaction, and keeps
// each SELECT with its binds and a hash of its rows (to prove an optimization returns the same).
async function capture(connection) {
  const statements = []
  let current = null
  const record = async (sql, binds = {}, options = {}) => {
    const result = await connection.execute(sql, binds, { ...OBJECT, ...options, autoCommit: false })
    if (current && /^\s*(WITH|SELECT)\b/i.test(sql)) {
      const rows = JSON.stringify(result.rows ?? [])
      statements.push({ ...current, index: statements.filter((s) => s.scenario === current.scenario).length + 1,
        sql, binds, rowCount: result.rows?.length ?? 0, rowsHash: crypto.createHash('sha256').update(rows).digest('hex'),
        sortedRowsHash: crypto.createHash('sha256').update(JSON.stringify((result.rows ?? []).map((r) => JSON.stringify(r)).sort())).digest('hex') })
    }
    return result
  }
  const transactionConnection = new Proxy(connection, {
    get: (target, prop) => (prop === 'execute' ? record : prop === 'commit' || prop === 'rollback'
      ? async () => {} : typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop]),
  })
  const db = { query: record, transaction: (work) => work(transactionConnection) }
  await connection.execute('SET TRANSACTION READ ONLY')
  const { repos, list } = require('./scenarios.cjs')(path.join(api, 'dist'))
  const repositories = repos(db)
  for (const [module, scenario, call] of list) {
    current = { module, scenario }
    await call(repositories)
  }
  current = null
  await connection.rollback()
  return statements
}

const literal = (value) => {
  if (value && typeof value === 'object' && 'val' in value) return literal(value.val)
  if (value === null || value === undefined) return 'CAST(NULL AS VARCHAR2(10))'
  if (typeof value === 'number') return String(value)
  if (value instanceof Date) return `TIMESTAMP '${value.toISOString().slice(0, 23).replace('T', ' ')}'`
  return `q'[${String(value)}]'`
}

// Times one statement on the server: parse once, warm up once, then RUNS executions + fetches.
async function time(connection, statement) {
  const binds = Array.isArray(statement.binds) ? [] : Object.entries(statement.binds)
  const bindCalls = binds
    .filter(([name]) => new RegExp(`:${name}\\b`, 'i').test(statement.sql))
    .map(([name, value]) => `DBMS_SQL.BIND_VARIABLE(c, ':${name}', ${literal(value)});`).join('\n')
  const block = `
DECLARE
  c INTEGER := DBMS_SQL.OPEN_CURSOR; n INTEGER; cols INTEGER; d DBMS_SQL.DESC_TAB2;
  v VARCHAR2(32767); cl CLOB; t0 TIMESTAMP WITH TIME ZONE; e INTERVAL DAY TO SECOND; result VARCHAR2(4000); fetched NUMBER;
BEGIN
  DBMS_SQL.PARSE(c, :sql, DBMS_SQL.NATIVE);
  ${bindCalls}
  DBMS_SQL.DESCRIBE_COLUMNS2(c, cols, d);
  FOR i IN 1 .. cols LOOP
    IF d(i).col_type = 112 THEN DBMS_SQL.DEFINE_COLUMN(c, i, cl); ELSE DBMS_SQL.DEFINE_COLUMN(c, i, v, 32767); END IF;
  END LOOP;
  FOR r IN 0 .. ${RUNS} LOOP
    t0 := SYSTIMESTAMP; n := DBMS_SQL.EXECUTE(c); fetched := 0;
    WHILE DBMS_SQL.FETCH_ROWS(c) > 0 LOOP fetched := fetched + 1; END LOOP;
    e := SYSTIMESTAMP - t0;
    IF r > 0 THEN
      result := result || CASE WHEN r > 1 THEN ',' END
        || TO_CHAR(ROUND((EXTRACT(MINUTE FROM e) * 60 + EXTRACT(SECOND FROM e)) * 1000, 3), 'FM9999990.000');
    END IF;
  END LOOP;
  DBMS_SQL.CLOSE_CURSOR(c);
  :times := result; :fetched := fetched;
END;`
  const out = await connection.execute(block, {
    sql: { val: statement.sql, type: oracledb.CLOB },
    times: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
    fetched: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
  })
  const times = out.outBinds.times.split(',').map(Number)
  const sorted = [...times].sort((a, b) => a - b)
  return { times, median: (sorted[RUNS / 2 - 1] + sorted[RUNS / 2]) / 2, fetched: out.outBinds.fetched }
}

async function plan(connection, statement, id) {
  await connection.execute(`DELETE FROM PLAN_TABLE WHERE STATEMENT_ID = :id`, { id })
  await connection.execute(`EXPLAIN PLAN SET STATEMENT_ID = '${id}' FOR ${statement.sql}`, statement.binds)
  const rows = await connection.execute(
    `SELECT PLAN_TABLE_OUTPUT AS LINE FROM TABLE(DBMS_XPLAN.DISPLAY(NULL, :id, 'BASIC +ROWS +COST +PREDICATE'))`, { id }, OBJECT)
  await connection.rollback()
  return rows.rows.map((r) => r.LINE).join('\n')
}

async function measure(out) {
  const connection = await connect()
  const statements = await capture(connection)
  for (const [i, statement] of statements.entries()) {
    Object.assign(statement, await time(connection, statement))
    statement.plan = await plan(connection, statement, `Q436_${i}`)
    process.stdout.write(`${String(statement.median.toFixed(3)).padStart(9)} ms  ${statement.module} · ${statement.scenario} #${statement.index}\n`)
  }
  await connection.close()
  fs.writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), runs: RUNS, statements }, null, 2))
  console.log(`\n${statements.length} statements -> ${out}`)
}

function compare(beforeFile, afterFile) {
  const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8')).statements
  const after = JSON.parse(fs.readFileSync(afterFile, 'utf8')).statements
  const key = (s) => `${s.module} · ${s.scenario} #${s.index}`
  const byKey = new Map(after.map((s) => [key(s), s]))
  console.log('| Consulta | Antes (ms) | Después (ms) | Cambio | Mismas filas |\n| --- | --: | --: | --: | :-: |')
  for (const b of [...before].sort((x, y) => y.median - x.median)) {
    const a = byKey.get(key(b))
    if (!a) { console.log(`| ${key(b)} | ${b.median.toFixed(3)} | (no medida) | | |`); continue }
    const change = ((a.median - b.median) / b.median) * 100
    console.log(`| ${key(b)} | ${b.median.toFixed(3)} | ${a.median.toFixed(3)} | ${change > 0 ? '+' : ''}${change.toFixed(1)} % | ${a.rowsHash === b.rowsHash ? 'sí' : a.sortedRowsHash === b.sortedRowsHash ? 'sí (otro orden)' : 'NO'} |`)
  }
}

// Times the INSERTs of a ticket purchase (invoice, line, ticket) and of a projection, the writes the
// new indexes affect. Each run is undone with ROLLBACK, so nothing is left in DEVELOPMENT.
async function inserts(out) {
  const connection = await connect()
  const block = `
DECLARE
  v_function NUMBER; v_theater NUMBER; v_row NUMBER; v_column NUMBER; v_client NUMBER; v_product NUMBER;
  v_employee NUMBER; v_movie NUMBER; v_invoice NUMBER; t0 TIMESTAMP WITH TIME ZONE; e INTERVAL DAY TO SECOND;
  purchase VARCHAR2(4000); projection VARCHAR2(4000);
  FUNCTION ms RETURN VARCHAR2 IS
  BEGIN
    e := SYSTIMESTAMP - t0;
    RETURN TO_CHAR(ROUND((EXTRACT(MINUTE FROM e) * 60 + EXTRACT(SECOND FROM e)) * 1000, 3), 'FM9999990.000');
  END;
BEGIN
  SELECT f.MOVIE_FUNCTION_ID, f.THEATER_ID, s.ROW_NUMBER, s.COLUMN_NUMBER INTO v_function, v_theater, v_row, v_column
    FROM MOVIE_FUNCTIONS f JOIN SEATS s ON s.THEATER_ID = f.THEATER_ID
   WHERE f.STATUS = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM TICKETS t WHERE t.MOVIE_FUNCTION_ID = f.MOVIE_FUNCTION_ID
         AND t.SEAT_ROW = s.ROW_NUMBER AND t.SEAT_COLUMN = s.COLUMN_NUMBER)
   ORDER BY f.MOVIE_FUNCTION_ID, s.ROW_NUMBER, s.COLUMN_NUMBER FETCH FIRST 1 ROW ONLY;
  SELECT MIN(CLIENT_ID) INTO v_client FROM CLIENTS;
  SELECT MIN(PRODUCT_ID) INTO v_product FROM PRODUCTS WHERE PRODUCT_TYPE = 'TICKET';
  SELECT MIN(e.EMPLOYEE_ID) INTO v_employee FROM EMPLOYEES e JOIN EMPLOYEE_LOCAL_CREDENTIALS c ON c.EMPLOYEE_ID = e.EMPLOYEE_ID;
  SELECT MIN(MOVIE_ID) INTO v_movie FROM MOVIES;
  FOR r IN 0 .. ${RUNS} LOOP
    SAVEPOINT run_start;
    t0 := SYSTIMESTAMP;
    INSERT INTO INVOICES (CLIENT_ID, MOVIE_FUNCTION_ID, STATUS, PAYMENT_METHOD, TOTAL)
    VALUES (v_client, v_function, 'PAID', 'SIMULATED', 3500) RETURNING INVOICE_ID INTO v_invoice;
    INSERT INTO INVOICE_PRODUCTS (INVOICE_ID, PRODUCT_ID, QUANTITY, UNIT_PRICE) VALUES (v_invoice, v_product, 1, 3500);
    INSERT INTO TICKETS (MOVIE_FUNCTION_ID, THEATER_ID, SEAT_ROW, SEAT_COLUMN, INVOICE_ID, PRODUCT_ID)
    VALUES (v_function, v_theater, v_row, v_column, v_invoice, v_product);
    IF r > 0 THEN purchase := purchase || CASE WHEN r > 1 THEN ',' END || ms; END IF;
    t0 := SYSTIMESTAMP;
    INSERT INTO MOVIE_FUNCTIONS (MOVIE_ID, THEATER_ID, START_TIME, END_TIME, SCREENING_DATE, CREATED_BY, PRICE, STATUS,
                                 PROJECTION_FORMAT, TECHNOLOGY, IS_PREMIERE)
    VALUES (v_movie, v_theater, TIMESTAMP '2031-01-01 10:00:00' + NUMTODSINTERVAL(r, 'DAY'),
            TIMESTAMP '2031-01-01 13:00:00' + NUMTODSINTERVAL(r, 'DAY'), DATE '2031-01-01' + r, v_employee,
            3500, 'ACTIVE', '2D', 'STANDARD', 0);
    IF r > 0 THEN projection := projection || CASE WHEN r > 1 THEN ',' END || ms; END IF;
    ROLLBACK TO run_start;
  END LOOP;
  ROLLBACK;
  :purchase := purchase; :projection := projection;
END;`
  await connection.execute('ALTER SESSION DISABLE PARALLEL DML')
  const r = await connection.execute(block, {
    purchase: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
    projection: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
  })
  await connection.rollback()
  await connection.close()
  const median = (list) => { const s = [...list].sort((a, b) => a - b); return (s[RUNS / 2 - 1] + s[RUNS / 2]) / 2 }
  const result = Object.fromEntries(Object.entries(r.outBinds).map(([k, v]) => {
    const times = v.split(',').map(Number); return [k, { times, median: median(times) }]
  }))
  fs.writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), runs: RUNS, inserts: result }, null, 2))
  console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.median]))))
}

const [mode, ...args] = process.argv.slice(2)
;(mode === 'measure' ? measure(args[0]) : mode === 'inserts' ? inserts(args[0]) : mode === 'compare' ? Promise.resolve(compare(args[0], args[1]))
  : Promise.reject(new Error('Usage: benchmark.cjs measure <out.json> | inserts <out.json> | compare <before.json> <after.json>')))
  .catch((error) => { console.error(error.message); process.exit(1) })
