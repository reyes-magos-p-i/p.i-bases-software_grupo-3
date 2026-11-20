import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import * as oracledb from 'oracledb';

/**
 * Everything the API needs to reach Oracle. DB_SCHEMA is required so every environment says
 * explicitly whether it works on DEVELOPMENT or PRODUCTION (SCRUM-435).
 */
export const REQUIRED_DATABASE_VARIABLES = [
  'DB_USER',
  'DB_PASSWORD',
  'DB_CONNECT_STRING',
  'DB_WALLET_DIR',
  'DB_WALLET_PASSWORD',
  'DB_SCHEMA',
] as const;

type DatabaseVariable = (typeof REQUIRED_DATABASE_VARIABLES)[number];

/** Names the missing variables, never their values. */
export function missingDatabaseVariablesMessage(missing: string[]): string {
  return missing.length === 1
    ? `Falta la variable de entorno ${missing[0]}. Configúrala en apps/api/.env.`
    : `Faltan las variables de entorno ${missing.join(', ')}. Configúralas en apps/api/.env.`;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: oracledb.Pool;
  private readonly logger = new Logger('Database');

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    // Fail fast, before opening any connection, so a missing variable never falls back to a default schema.
    const missing = REQUIRED_DATABASE_VARIABLES.filter(
      (name) => !this.config.get<string>(name)?.trim(),
    );
    if (missing.length)
      throw new Error(missingDatabaseVariablesMessage(missing));
    const value = (name: DatabaseVariable) => this.config.get<string>(name)!;

    const walletDir = resolve(value('DB_WALLET_DIR'));

    const schema = value('DB_SCHEMA').trim();
    if (!/^[A-Za-z][A-Za-z0-9_$#]*$/.test(schema)) {
      throw new Error('DB_SCHEMA tiene caracteres no permitidos');
    } // safeguard to prevent SQL injection in ALTER SESSION

    this.pool = await oracledb.createPool({
      user: value('DB_USER'),
      password: value('DB_PASSWORD'),
      connectString: value('DB_CONNECT_STRING'), // tnsnames.ora alias
      configDir: walletDir,
      walletLocation: walletDir,
      walletPassword: value('DB_WALLET_PASSWORD'),
      poolMin: 1,
      poolMax: 5,
      // Executes while creating and setting the current schema for each connection in the pool
      sessionCallback: (conn, _tag, done) => {
        conn.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${schema}`).then(
          () => done(),
          (e) => done(e),
        );
      },
    });

    // SAFEGUARD: Check if the connection is working and log the current schema
    const r = await this.query<{ schema: string }>(
      `SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') AS "schema" FROM dual`,
    ); // (?.) to avoid error if r.rows is undefined
    this.logger.log(
      `Conectado a Oracle. Esquema activo: ${r.rows?.[0]?.schema}`,
    );
  }

  async query<T = unknown>(
    sql: string,
    binds: oracledb.BindParameters = {},
    options: oracledb.ExecuteOptions = {},
  ) {
    const conn = await this.pool.getConnection();
    try {
      return await conn.execute<T>(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT, // return rows as objects instead of arrays
        autoCommit: true,
        ...options, // allow overriding defaults
      });
    } finally {
      // No matter if the query succeeded or failed, we must close the connection
      await conn.close();
    }
  }

  // Multiple queries in a single transaction. If any query fails, the whole transaction is rolled back.
  async transaction<T>(
    work: (conn: oracledb.Connection) => Promise<T>,
  ): Promise<T> {
    const conn = await this.pool.getConnection();
    let result: T;
    let closeFailed = false;
    let closeError: unknown;
    try {
      result = await work(conn);
      await conn.commit();
    } catch (err) {
      try {
        await conn.rollback();
      } catch {
        // Preserve the operation error if cleanup also fails.
      }
      throw err;
    } finally {
      try {
        await conn.close();
      } catch (err) {
        // Report a close failure only when it cannot replace the operation error.
        closeFailed = true;
        closeError = err;
      }
    }
    if (closeFailed) throw closeError;
    return result;
  }

  async onModuleDestroy() {
    await this.pool?.close(5);
  }
}
