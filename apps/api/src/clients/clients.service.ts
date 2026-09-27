import { ConflictException, Injectable } from '@nestjs/common';
import * as oracledb from 'oracledb';
import { DatabaseService } from '../database/database.service';
import { Client, ClientWithPassword, NewClient, Provider, SocialProfile } from './client.model';
import { splitFirstWord } from './name.util';

// "C" alias
const CLIENT_COLUMNS = `
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

@Injectable()
export class ClientsService {
  constructor(private readonly db: DatabaseService) {}

  // ---------- QUERYS ----------
  async findById(id: number): Promise<Client | null> {
    const r = await this.db.query<Client>(
      `SELECT ${CLIENT_COLUMNS} FROM Clients c WHERE c.client_id = :id`,
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

  
  async findByExternal(provider: Provider, providerUserId: string): Promise<Client | null> {
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
  async findWithLocalCredentials(email: string): Promise<ClientWithPassword | null> {
    const r = await this.db.query<ClientWithPassword>(
      `SELECT ${CLIENT_COLUMNS}, l.password_hash AS "passwordHash"
         FROM Clients c
         JOIN Client_local_credentials l ON l.client_id = c.client_id
        WHERE c.email = :email`,
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
    try {
      const id = await this.db.transaction(async (conn) => {
        const clientId = await this.insertClient(conn, data);
        await conn.execute(
          `INSERT INTO Client_local_credentials (client_id, password_hash, salt)
           VALUES (:clientId, :passwordHash, :salt)`,
          { clientId, passwordHash, salt },
        );
        return clientId;
      });
      return (await this.findById(id))!;
    } catch (err) {
      // ORA-00001= UNIQUE constraint violation
      const e = err as { errorNum?: number; message?: string };
      if (e.errorNum === 1 && e.message?.includes('UQ_CLIENTS_EMAIL')) {
        throw new ConflictException('Este correo ya está registrado');
      }
      throw err;
    }
  }

  // ---------- Google / Facebook  ----------
  async findOrCreateSocial(p: SocialProfile): Promise<Client> {
    // 1. the user is already registered?
    const linked = await this.findByExternal(p.provider, p.providerUserId);
    if (linked) return linked;

    // 2. Exists a local account linked with the email? If so, 
    const existing = await this.findByEmail(p.email);
    if (existing) {
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
      return existing;
    }

    // otherwise creates a Social account in Client_external_credentials 
    return this.createSocial(p);
  }

  private async createSocial(p: SocialProfile): Promise<Client> {
    // SAFEGUARDS: in Oracle ''=NULL, if firstName is '' we take the name before the @ in the email
    const [firstName, secondName] = splitFirstWord(p.firstName || p.email.split('@')[0]);
    const [firstSurname, secondSurname] = p.lastName ? splitFirstWord(p.lastName) : [null, null];
    const id = await this.db.transaction(async (conn) => {
      // this reuses the connection on insertClient call to maintain 'atomicity'
      const clientId = await this.insertClient(conn, {
        email: p.email, firstName, secondName, firstSurname, secondSurname,
      });
      await conn.execute(
        `INSERT INTO Client_external_credentials
           (client_id, provider_name, provider_user_id, email)
         VALUES (:clientId, :provider, :providerUserId, :email)`,
        { clientId, provider: p.provider, providerUserId: p.providerUserId, email: p.email },
      );
      return clientId;
    });
    return (await this.findById(id))!;
  }

  // ---------- Shared usage ----------
  private async insertClient(conn: oracledb.Connection, d: NewClient): Promise<number> {
    const r = await conn.execute(
      `INSERT INTO Clients
         (email, first_name, second_name, first_surname, second_surname,
          birthday, phone_number, gender, language, accepted_terms_at)
       VALUES
         (:email, :firstName, :secondName, :firstSurname, :secondSurname,
          TO_DATE(:birthday, 'YYYY-MM-DD'), :phoneNumber, :gender, :language,
          CASE WHEN :terms = 1 THEN SYSTIMESTAMP END)
       RETURNING client_id INTO :id`,
      {
        email: d.email,
        firstName: d.firstName,
        secondName: d.secondName ?? null,
        firstSurname: d.firstSurname ?? null,
        secondSurname: d.secondSurname ?? null,
        birthday: d.birthday ?? null,
        phoneNumber: d.phoneNumber ?? null,
        gender: d.gender ?? null,
        language: d.language ?? 'es',
        terms: d.acceptedTerms ? 1 : 0,
        id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
      },
    );
    return (r.outBinds as { id: number[] }).id[0];
  }
}