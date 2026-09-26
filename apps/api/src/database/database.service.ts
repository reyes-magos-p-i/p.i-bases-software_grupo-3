import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import * as oracledb from 'oracledb';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: oracledb.Pool;
  private readonly logger = new Logger('Database');

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const walletDir = resolve(this.config.getOrThrow<string>('DB_WALLET_DIR'));

    const schema = this.config.get<string>('DB_SCHEMA');
    if (schema && !/^[A-Za-z][A-Za-z0-9_$#]*$/.test(schema)) {
      throw new Error('DB_SCHEMA tiene caracteres no permitidos');
    }  // safeguard to prevent SQL injection in ALTER SESSION
    
    this.pool = await oracledb.createPool({
      user: this.config.getOrThrow<string>('DB_USER'),
      password: this.config.getOrThrow<string>('DB_PASSWORD'),
      connectString: this.config.getOrThrow<string>('DB_CONNECT_STRING'),  // tnsnames.ora alias
      configDir: walletDir,        // donde está tnsnames.ora
      walletLocation: walletDir,   // donde está ewallet.pem
      walletPassword: this.config.getOrThrow<string>('DB_WALLET_PASSWORD'),
      poolMin: 1,
      poolMax: 5,
      // Executes while creating and setting the current schema for each connection in the pool
      sessionCallback: (conn, _tag, done) => {
        if (!schema) return done();
        conn
          .execute(`ALTER SESSION SET CURRENT_SCHEMA = ${schema}`)
          .then(() => done(), (e) => done(e));
      },
    });

    // SAFEGUARD: Check if the connection is working and log the current schema
    const r = await this.query<{ schema: string }>(
      `SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') AS "schema" FROM dual`,
    );  // (?.) to avoid error if r.rows is undefined
    this.logger.log(`Conectado a Oracle. Esquema activo: ${r.rows?.[0]?.schema}`);
  }


  async query<T = unknown>(
    sql: string,
    binds: oracledb.BindParameters = {},
    options: oracledb.ExecuteOptions = {},
  ) {
    const conn = await this.pool.getConnection();
    try {
      return await conn.execute<T>(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,  // return rows as objects instead of arrays
        autoCommit: true,
        ...options,  // allow overriding defaults
      });
    } finally {
      // No matter if the query succeeded or failed, we must close the connection
      await conn.close();
    }
  }

  // Multiple queries in a single transaction. If any query fails, the whole transaction is rolled back.
  async transaction<T>(work: (conn: oracledb.Connection) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;  // rethrow the error to be handled by the caller
    } finally {
      await conn.close();
    }
  }

  async onModuleDestroy() {
    await this.pool?.close(5);
  }
}
