import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import oracle from 'oracledb';
import { ClientsRepository } from './clients.repository';
import { DatabaseService } from '../database/database.service';
import {
  Client,
  ClientWithPassword,
  NewClient,
  Provider,
  SocialProfile,
} from './client.model';
import { splitFirstWord } from './name.util';

// "C" alias
const CLIENT_COLUMNS = `
  c.status AS "status",
  c.client_id AS "id",
  c.email AS "email",
  c.first_name AS "firstName",
  c.second_name AS "secondName",
  c.first_surname AS "firstSurname",
  c.second_surname AS "secondSurname",
  TO_CHAR(c.birthday, 'YYYY-MM-DD') AS "birthday",
  c.phone_number AS "phoneNumber",
  c.gender AS "gender",
  c.language AS "language"`;

export const PENDING_CLIENT_RETENTION_DAYS = 7;

@Injectable()
export class ClientsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly clientsRepository: ClientsRepository,
  ) {}

  // ---------- QUERYS ----------
  async findById(id: number): Promise<Client | null> {
    const r = await this.db.query<Client>(
      `SELECT ${CLIENT_COLUMNS} FROM Clients c WHERE c.client_id = :id AND c.status = 'ACTIVE'`,
      { id },
    );
    return r.rows?.[0] ?? null;
  }

  async findByEmail(email: string): Promise<Client | null> {
    const r = await this.db.query<Client>(
      `SELECT ${CLIENT_COLUMNS} FROM Clients c WHERE c.email = :email`,
      { email },
    );
    return r.rows?.[0] ?? null;
  }

  async findByExternal(
    provider: Provider,
    providerUserId: string,
  ): Promise<Client | null> {
    const r = await this.db.query<Client>(
      `SELECT ${CLIENT_COLUMNS}
         FROM Clients c
         JOIN Client_external_credentials x ON x.client_id = c.client_id
        WHERE x.provider_name = :provider AND x.provider_user_id = :providerUserId`,
      { provider, providerUserId },
    );
    return r.rows?.[0] ?? null;
  }

  // For login component, the INNER JOIN excludes accounts without local credentials.
  async findWithLocalCredentials(
    email: string,
  ): Promise<ClientWithPassword | null> {
    const r = await this.db.query<ClientWithPassword>(
      `SELECT ${CLIENT_COLUMNS}, l.password_hash AS "passwordHash"
         FROM Clients c
         JOIN Client_local_credentials l ON l.client_id = c.client_id
        WHERE c.email = :email AND c.status = 'ACTIVE'`,
      { email },
    );
    return r.rows?.[0] ?? null;
  }

  // ATOMIC
  async createWithLocalCredentials(
    data: NewClient,
    passwordHash: string,
    salt: string,
  ): Promise<Client> {
    const id = await this.clientsRepository.createClient({
      ...data,
      language: data.language ?? 'es',
      passwordHash,
      salt,
    });
    return (await this.findById(id))!;
  }

  async createPendingWithLocalCredentials(
    data: NewClient,
    passwordHash: string,
    salt: string,
    tokenHash: string,
    expiresInMinutes: number,
  ): Promise<Client> {
    const id = await this.clientsRepository.createClient(
      {
        ...data,
        language: data.language ?? 'es',
        passwordHash,
        salt,
      },
      { tokenHash, expiresInMinutes },
    );
    return (await this.findById(id))!;
  }

  async findPendingLocalClientByEmail(email: string): Promise<Client | null> {
    const result = await this.db.query<Client>(
      `SELECT ${CLIENT_COLUMNS}
         FROM CLIENTS c
         JOIN CLIENT_LOCAL_CREDENTIALS l ON l.CLIENT_ID = c.CLIENT_ID
         JOIN CLIENT_EMAIL_VERIFICATIONS v ON v.CLIENT_ID = c.CLIENT_ID
        WHERE c.EMAIL = :email AND c.STATUS = 'ACTIVE'`,
      { email },
    );
    return result.rows?.[0] ?? null;
  }

  async deleteExpiredPendingClientByEmail(email: string): Promise<void> {
    await this.purgeExpiredPendingClients(email);
  }

  async deleteExpiredPendingClients(): Promise<void> {
    await this.purgeExpiredPendingClients();
  }

  private async purgeExpiredPendingClients(email?: string): Promise<void> {
    await this.db.transaction(async (connection) => {
      const result = await connection.execute<{ clientId?: unknown }>(
        `SELECT v.CLIENT_ID AS "clientId"
           FROM CLIENT_EMAIL_VERIFICATIONS v
           JOIN CLIENT_LOCAL_CREDENTIALS l ON l.CLIENT_ID = v.CLIENT_ID
           JOIN CLIENTS c ON c.CLIENT_ID = v.CLIENT_ID
          WHERE c.STATUS = 'ACTIVE' AND v.CREATED_AT <=
                SYSTIMESTAMP - NUMTODSINTERVAL(:retentionDays, 'DAY')
            ${email === undefined ? '' : 'AND EXISTS (SELECT 1 FROM CLIENTS c WHERE c.CLIENT_ID = v.CLIENT_ID AND c.EMAIL = :email)'}
          FOR UPDATE OF v.CLIENT_ID, c.STATUS SKIP LOCKED`,
        email === undefined
          ? { retentionDays: PENDING_CLIENT_RETENTION_DAYS }
          : { retentionDays: PENDING_CLIENT_RETENTION_DAYS, email },
        { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false },
      );

      const clientIds = (result.rows ?? []).map(({ clientId }) => {
        if (
          typeof clientId !== 'number' ||
          !Number.isSafeInteger(clientId) ||
          clientId < 1
        ) {
          throw new Error(
            'Oracle returned an invalid pending client identifier.',
          );
        }
        return clientId;
      });

      await clientIds.reduce<Promise<void>>(async (previous, clientId) => {
        await previous;
        await this.deleteExpiredPendingClient(connection, clientId);
      }, Promise.resolve());
    });
  }

  private async deleteExpiredPendingClient(
    connection: oracle.Connection,
    clientId: number,
  ): Promise<void> {
    const credentials = await connection.execute(
      'DELETE FROM CLIENT_LOCAL_CREDENTIALS WHERE CLIENT_ID = :clientId',
      { clientId: { val: clientId, type: oracle.NUMBER } },
      { autoCommit: false },
    );
    if (credentials.rowsAffected !== 1) {
      throw new Error('Oracle did not delete a single pending credential.');
    }

    const client = await connection.execute(
      `DELETE FROM CLIENTS
        WHERE CLIENT_ID = :clientId
          AND STATUS = 'ACTIVE'
          AND EXISTS (
            SELECT 1 FROM CLIENT_EMAIL_VERIFICATIONS
             WHERE CLIENT_ID = :clientId
          )`,
      { clientId: { val: clientId, type: oracle.NUMBER } },
      { autoCommit: false },
    );
    if (client.rowsAffected !== 1) {
      throw new Error('Oracle did not delete a single expired pending client.');
    }
  }

  async replaceEmailVerification(
    clientId: number,
    tokenHash: string,
    expiresInMinutes: number,
  ): Promise<void> {
    const result = await this.db.query(
      `MERGE INTO CLIENT_EMAIL_VERIFICATIONS target
       USING (SELECT CLIENT_ID FROM CLIENTS
               WHERE CLIENT_ID = :clientId AND STATUS = 'ACTIVE') source
          ON (target.CLIENT_ID = source.client_id)
       WHEN MATCHED THEN UPDATE SET
         target.TOKEN_HASH = :tokenHash,
         target.EXPIRES_AT =
           SYSTIMESTAMP + NUMTODSINTERVAL(:expiresInMinutes, 'MINUTE')
       WHEN NOT MATCHED THEN INSERT (
         CLIENT_ID, TOKEN_HASH, EXPIRES_AT, CREATED_AT
       ) VALUES (
         :clientId, :tokenHash,
         SYSTIMESTAMP + NUMTODSINTERVAL(:expiresInMinutes, 'MINUTE'),
         SYSTIMESTAMP
       )`,
      { clientId, tokenHash, expiresInMinutes },
    );
    if (result.rowsAffected !== 1) {
      throw new Error('Oracle did not rotate a single email verification.');
    }
  }

  async consumeEmailVerification(tokenHash: string): Promise<Client | null> {
    return this.db.transaction(async (connection) => {
      const result = await connection.execute<{ clientId?: unknown }>(
        `DELETE FROM CLIENT_EMAIL_VERIFICATIONS
          WHERE TOKEN_HASH = :tokenHash
            AND EXPIRES_AT > SYSTIMESTAMP
            AND EXISTS (
              SELECT 1 FROM CLIENTS c
               WHERE c.CLIENT_ID = CLIENT_EMAIL_VERIFICATIONS.CLIENT_ID
                 AND c.STATUS = 'ACTIVE'
            )
        RETURNING CLIENT_ID INTO :clientId`,
        {
          tokenHash: { val: tokenHash, type: oracle.STRING },
          clientId: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
        },
        { autoCommit: false },
      );
      const ids = result.outBinds?.clientId;
      const clientId = Array.isArray(ids) ? ids[0] : undefined;
      if (
        result.rowsAffected !== 1 ||
        typeof clientId !== 'number' ||
        !Number.isSafeInteger(clientId) ||
        clientId < 1
      ) {
        return null;
      }
      const clientResult = await connection.execute<Client>(
        `SELECT ${CLIENT_COLUMNS} FROM CLIENTS c WHERE c.CLIENT_ID = :clientId AND c.STATUS = 'ACTIVE'`,
        { clientId },
        { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false },
      );
      return clientResult.rows?.[0] ?? null;
    });
  }

  async isEmailVerificationPending(clientId: number): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 AS "pending"
         FROM CLIENT_EMAIL_VERIFICATIONS
        WHERE CLIENT_ID = :clientId AND ROWNUM = 1`,
      { clientId },
    );
    return !!result.rows?.length;
  }

  async clearPendingEmailVerification(clientId: number): Promise<void> {
    await this.db.query(
      'DELETE FROM CLIENT_EMAIL_VERIFICATIONS WHERE CLIENT_ID = :clientId',
      { clientId },
    );
  }

  // ---------- Google / Facebook  ----------
  async findOrCreateSocial(p: SocialProfile): Promise<Client> {
    // 1. the user is already registered?
    const linked = await this.findByExternal(p.provider, p.providerUserId);
    if (linked) {
      this.requireActive(linked);
      await this.clearPendingEmailVerification(linked.id);
      return linked;
    }

    // 2. Exists a local account linked with the email? If so,
    const existing = await this.findByEmail(p.email);
    if (existing) {
      this.requireActive(existing);
      try {
        await this.db.query(
          `INSERT INTO Client_external_credentials
             (client_id, provider_name, provider_user_id, email)
           VALUES (:clientId, :provider, :providerUserId, :email)`,
          {
            clientId: existing.id,
            provider: p.provider,
            providerUserId: p.providerUserId,
            email: p.email,
          },
        );
      } catch (err) {
        // UNIQUE (client_id, provider): this account id is already binded to a provider
        if ((err as { errorNum?: number }).errorNum === 1) {
          throw new ConflictException(
            `Esta cuenta ya tiene otra cuenta de ${p.provider} vinculada`,
          );
        }
        throw err;
      }
      await this.clearPendingEmailVerification(existing.id);
      return existing;
    }

    // otherwise creates a Social account in Client_external_credentials
    return this.createSocial(p);
  }

  private requireActive(client: Client) {
    if (client.status !== 'ACTIVE')
      throw new UnauthorizedException(
        'No se pudo iniciar sesión con esta cuenta.',
      );
  }

  private async createSocial(p: SocialProfile): Promise<Client> {
    // SAFEGUARDS: in Oracle ''=NULL, if firstName is '' we take the name before the @ in the email
    const [firstName, secondName] = splitFirstWord(
      p.firstName || p.email.split('@')[0],
    );
    const [firstSurname, secondSurname] = p.lastName
      ? splitFirstWord(p.lastName)
      : [null, null];
    const id = await this.db.transaction(async (conn) => {
      // this reuses the connection on insertClient call to maintain 'atomicity'
      const clientId = await this.clientsRepository.insertClient(conn, {
        email: p.email,
        firstName,
        secondName,
        firstSurname,
        secondSurname,
        language: 'es',
      });
      await conn.execute(
        `INSERT INTO Client_external_credentials
           (client_id, provider_name, provider_user_id, email)
         VALUES (:clientId, :provider, :providerUserId, :email)`,
        {
          clientId,
          provider: p.provider,
          providerUserId: p.providerUserId,
          email: p.email,
        },
      );
      return clientId;
    });
    return (await this.findById(id))!;
  }
}
