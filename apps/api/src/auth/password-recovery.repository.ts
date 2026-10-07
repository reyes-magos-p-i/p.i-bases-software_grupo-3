import { Injectable } from '@nestjs/common';
import oracle from 'oracledb';
import { DatabaseService } from '../database/database.service';
import { ClientsRepository } from '../clients/clients.repository';
import { UsersRepository } from '../users/users.repository';
import type { PasswordHashResult } from '../common/security/password-hasher';

export type RecoveryAccountType = 'client' | 'employee';
interface Account {
  ID: number;
  EMAIL: string;
  FIRST_NAME: string;
  PASSWORD_HASH: string;
}
interface RecoveryRow {
  CLIENT_ID: number | null;
  EMPLOYEE_ID: number | null;
  TOKEN_HASH: string;
  TEMPORARY_HASH: string;
  CREDENTIAL_HASH: string;
  EMAIL: string;
  EXPIRES_AT: Date;
}
export interface Recovery extends Account {
  accountType: RecoveryAccountType;
  tokenHash: string;
  temporaryHash: string;
  expiresAt: Date;
}

const ACCOUNT_TABLES = {
  client: {
    table: 'CLIENTS',
    credentials: 'CLIENT_LOCAL_CREDENTIALS',
    id: 'CLIENT_ID',
  },
  employee: {
    table: 'EMPLOYEES',
    credentials: 'EMPLOYEE_LOCAL_CREDENTIALS',
    id: 'EMPLOYEE_ID',
  },
} as const;

@Injectable()
export class PasswordRecoveryRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly clients: ClientsRepository,
    private readonly users: UsersRepository,
  ) {}

  private async account(
    connection: oracle.Connection,
    type: RecoveryAccountType,
    email: string | null,
    id: number | null,
    lock = false,
  ): Promise<Account | null> {
    const tables = ACCOUNT_TABLES[type];
    const pending =
      type === 'client'
        ? 'AND NOT EXISTS (SELECT 1 FROM CLIENT_EMAIL_VERIFICATIONS v WHERE v.CLIENT_ID = a.CLIENT_ID)'
        : '';
    const result = await connection.execute<Account>(
      `SELECT a.${tables.id} AS ID, a.EMAIL, a.FIRST_NAME, c.PASSWORD_HASH
       FROM ${tables.table} a JOIN ${tables.credentials} c ON c.${tables.id} = a.${tables.id}
       WHERE a.STATUS = 'ACTIVE'
         AND (:email IS NULL OR LOWER(a.EMAIL) = :email)
         AND (:accountId IS NULL OR a.${tables.id} = :accountId)
         ${pending} ${lock ? 'FOR UPDATE OF a.STATUS, c.PASSWORD_HASH' : ''}`,
      {
        email: { val: email, type: oracle.STRING },
        accountId: { val: id, type: oracle.NUMBER },
      },
      { outFormat: oracle.OUT_FORMAT_OBJECT },
    );
    return result.rows?.[0] ?? null;
  }

  async request(
    type: RecoveryAccountType,
    email: string,
    tokenHash: string,
    temporaryHash: string,
  ): Promise<Account | null> {
    return this.db.transaction(async (connection) => {
      const account = await this.account(connection, type, email, null, true);
      if (!account) return null;
      const idColumn = ACCOUNT_TABLES[type].id;
      const recent = await connection.execute(
        `SELECT 1 FROM PASSWORD_RECOVERIES WHERE ${idColumn} = :accountId
         AND REQUESTED_AT > SYSTIMESTAMP - INTERVAL '1' MINUTE`,
        { accountId: account.ID },
      );
      if (recent.rows?.length) return null;
      await connection.execute(
        `MERGE INTO PASSWORD_RECOVERIES r
         USING (SELECT :accountId AS ACCOUNT_ID FROM DUAL) source
         ON (r.${idColumn} = source.ACCOUNT_ID)
         WHEN MATCHED THEN UPDATE SET TOKEN_HASH = :tokenHash, TEMPORARY_HASH = :temporaryHash,
           CREDENTIAL_HASH = :credentialHash, EMAIL = :email, ATTEMPTS = 0,
           REQUESTED_AT = SYSTIMESTAMP, EXPIRES_AT = SYSTIMESTAMP + INTERVAL '30' MINUTE
         WHEN NOT MATCHED THEN INSERT (${idColumn}, TOKEN_HASH, TEMPORARY_HASH, CREDENTIAL_HASH,
           EMAIL, ATTEMPTS, REQUESTED_AT, EXPIRES_AT)
         VALUES (:accountId, :tokenHash, :temporaryHash, :credentialHash, :email, 0,
           SYSTIMESTAMP, SYSTIMESTAMP + INTERVAL '30' MINUTE)`,
        {
          accountId: account.ID,
          tokenHash,
          temporaryHash,
          credentialHash: account.PASSWORD_HASH,
          email: account.EMAIL,
        },
        { autoCommit: false },
      );
      return account;
    });
  }

  private async row(
    connection: oracle.Connection,
    tokenHash: string,
    lock = false,
  ) {
    const result = await connection.execute<RecoveryRow>(
      `SELECT CLIENT_ID, EMPLOYEE_ID, TOKEN_HASH, TEMPORARY_HASH, CREDENTIAL_HASH, EMAIL, EXPIRES_AT
       FROM PASSWORD_RECOVERIES WHERE TOKEN_HASH = :tokenHash
       AND EXPIRES_AT > SYSTIMESTAMP AND ATTEMPTS < 5 ${lock ? 'FOR UPDATE' : ''}`,
      { tokenHash },
      { outFormat: oracle.OUT_FORMAT_OBJECT },
    );
    return result.rows?.[0];
  }

  async find(tokenHash: string): Promise<Recovery | null> {
    return this.db.transaction(async (connection) => {
      const row = await this.row(connection, tokenHash);
      if (!row) return null;
      const type = row.CLIENT_ID === null ? 'employee' : 'client';
      const account = await this.account(
        connection,
        type,
        null,
        row.CLIENT_ID ?? row.EMPLOYEE_ID,
      );
      if (
        !account ||
        account.PASSWORD_HASH !== row.CREDENTIAL_HASH ||
        account.EMAIL !== row.EMAIL
      )
        return null;
      return {
        ...account,
        accountType: type,
        tokenHash,
        temporaryHash: row.TEMPORARY_HASH,
        expiresAt: row.EXPIRES_AT,
      };
    });
  }

  async failAttempt(tokenHash: string): Promise<void> {
    await this.db.query(
      `UPDATE PASSWORD_RECOVERIES SET ATTEMPTS = ATTEMPTS + 1
       WHERE TOKEN_HASH = :tokenHash AND ATTEMPTS < 5`,
      { tokenHash },
    );
  }

  async invalidate(tokenHash: string): Promise<void> {
    await this.db.query(
      'UPDATE PASSWORD_RECOVERIES SET TOKEN_HASH = NULL, TEMPORARY_HASH = NULL WHERE TOKEN_HASH = :tokenHash',
      { tokenHash },
    );
  }

  async complete(
    recovery: Recovery,
    credentials: PasswordHashResult,
    expirationDays: number,
  ): Promise<boolean> {
    return this.db.transaction(async (connection) => {
      // Lock credentials first, matching request creation and serializing simultaneous resets.
      const account = await this.account(
        connection,
        recovery.accountType,
        null,
        recovery.ID,
        true,
      );
      const row = await this.row(connection, recovery.tokenHash, true);
      if (
        !account ||
        !row ||
        account.EMAIL !== row.EMAIL ||
        account.PASSWORD_HASH !== row.CREDENTIAL_HASH ||
        row.CREDENTIAL_HASH !== recovery.PASSWORD_HASH ||
        row.TEMPORARY_HASH !== recovery.temporaryHash
      )
        return false;
      const args = [
        account.ID,
        credentials.passwordHash,
        credentials.salt,
        expirationDays,
        connection,
      ] as const;
      if (recovery.accountType === 'client')
        await this.clients.savePassword(...args);
      else await this.users.saveEmployeePassword(...args);
      await connection.execute(
        `UPDATE PASSWORD_RECOVERIES SET TOKEN_HASH = NULL, TEMPORARY_HASH = NULL,
         CREDENTIAL_HASH = NULL, EMAIL = NULL, EXPIRES_AT = NULL, RESET_AT = SYSTIMESTAMP
         WHERE TOKEN_HASH = :tokenHash`,
        { tokenHash: recovery.tokenHash },
        { autoCommit: false },
      );
      return true;
    });
  }

  async sessionRevoked(
    type: RecoveryAccountType,
    id: number,
    issuedAt: unknown,
  ): Promise<boolean> {
    const result = await this.db.query<{ RESET_AT: Date | null }>(
      `SELECT RESET_AT FROM PASSWORD_RECOVERIES WHERE ${ACCOUNT_TABLES[type].id} = :accountId`,
      { accountId: id },
    );
    const resetAt = result.rows?.[0]?.RESET_AT;
    return (
      !!resetAt &&
      (typeof issuedAt !== 'number' ||
        !Number.isFinite(issuedAt) ||
        issuedAt * 1000 <= resetAt.getTime())
    );
  }
}
