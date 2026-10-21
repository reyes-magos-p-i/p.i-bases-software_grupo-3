import { revokeAccountSessions } from '../common/security/session-revocation';
import type { UserStatus } from '../users/types/user-status.type';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import oracle from 'oracledb';
import { buildUserSearch } from '../users/user-search.util';
import { DatabaseService } from '../database/database.service';
import { UserRole } from '../users/enums/user-role.enum';
import type { ClientDetailDto } from '../users/dto/user-detail.dto';
import type {
  UpdateClientDto,
  UpdatedUserDto,
} from '../users/dto/update-user.dto';
import type { NewClient, NewClientWithLocalCredentials } from './client.model';
import type { ListClientsQueryDto } from '../users/dto/list-users-query.dto';
import type {
  ListedClientDto,
  ListedUsersDto,
} from '../users/dto/listed-users.dto';

@Injectable()
export class ClientsRepository {
  constructor(private readonly db: DatabaseService) {}

  deactivateClient(id: number): Promise<void> {
    return this.changeClientStatus(id, 'INACTIVE');
  }

  activateClient(id: number): Promise<void> {
    return this.changeClientStatus(id, 'ACTIVE');
  }

  private async changeClientStatus(
    id: number,
    status: UserStatus,
  ): Promise<void> {
    await this.db.transaction(async (connection) => {
      const selected = await connection.execute<{ STATUS: string }>(
        'SELECT STATUS FROM CLIENTS WHERE CLIENT_ID = :id FOR UPDATE',
        { id: { val: id, type: oracle.NUMBER } },
        { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false },
      );
      const client = selected.rows?.[0];
      if (!client)
        throw new NotFoundException('El cliente seleccionado no existe.');
      if (client.STATUS === status)
        throw new ConflictException(
          status === 'ACTIVE'
            ? 'El cliente ya está activo.'
            : 'El cliente ya está desactivado.',
        );
      if (client.STATUS !== 'ACTIVE' && client.STATUS !== 'INACTIVE')
        throw new Error('Invalid client status.');
      const result = await connection.execute(
        'UPDATE CLIENTS SET STATUS = :status WHERE CLIENT_ID = :id AND STATUS = :previousStatus',
        {
          id: { val: id, type: oracle.NUMBER },
          status,
          previousStatus: client.STATUS,
        },
        { autoCommit: false },
      );
      if (result.rowsAffected !== 1)
        throw new Error('Oracle did not change the status of a single client.');
      await revokeAccountSessions(connection, 'client', id);
    });
  }

  async updateClient(
    id: number,
    data: UpdateClientDto & { gender?: string | null },
  ): Promise<UpdatedUserDto> {
    try {
      return await this.db.transaction(async (connection) => {
        const current = await connection.execute<{
          EMAIL: string;
          STATUS: UserStatus;
        }>(
          'SELECT EMAIL, STATUS FROM CLIENTS WHERE CLIENT_ID = :id FOR UPDATE',
          { id: { val: id, type: oracle.NUMBER } },
          { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false },
        );
        const row = current.rows?.[0];
        if (!row)
          throw new NotFoundException('El usuario seleccionado no existe.');
        if (row.STATUS !== 'ACTIVE')
          throw new ConflictException({
            statusCode: 409,
            code: 'USER_INACTIVE',
            message: 'No se puede modificar un usuario inactivo.',
          });
        if (data.email !== undefined) {
          const duplicate = await connection.execute(
            'SELECT 1 FROM CLIENTS WHERE EMAIL = :email AND CLIENT_ID <> :id AND ROWNUM = 1',
            { email: data.email, id },
            { autoCommit: false },
          );
          if (duplicate.rows?.length)
            throw new ConflictException(
              'El correo electrónico ya está registrado para otro cliente.',
            );
        }
        const changes: string[] = [];
        const binds: oracle.BindParameters = {
          id: { val: id, type: oracle.NUMBER },
        };
        for (const [field, column] of [
          ['firstName', 'FIRST_NAME'],
          ['secondName', 'SECOND_NAME'],
          ['firstSurname', 'FIRST_SURNAME'],
          ['secondSurname', 'SECOND_SURNAME'],
          ['email', 'EMAIL'],
          ['phoneNumber', 'PHONE_NUMBER'],
          ['gender', 'GENDER'],
        ] as const) {
          if (data[field] !== undefined) {
            changes.push(`${column} = :${field}`);
            binds[field] = { val: data[field], type: oracle.STRING };
          }
        }
        if (data.address !== undefined) {
          const addressId =
            data.address === null
              ? null
              : await this.insertAddress(connection, data.address);
          changes.push('ID_ADDRESS = :addressId');
          binds.addressId = { val: addressId, type: oracle.NUMBER };
        }
        const result = await connection.execute(
          `UPDATE CLIENTS SET ${changes.join(', ')} WHERE CLIENT_ID = :id AND STATUS = 'ACTIVE'`,
          binds,
          { autoCommit: false },
        );
        if (result.rowsAffected !== 1)
          throw new Error('Oracle did not update a single client.');
        return { id, email: data.email ?? row.EMAIL, role: UserRole.CLIENT };
      });
    } catch (error) {
      const failure = error as { errorNum?: number; message?: string } | null;
      if (
        failure?.errorNum === 1 &&
        /\bUQ_CLIENTS_EMAIL\b/u.test(failure.message ?? '')
      ) {
        throw new ConflictException(
          'El correo electrónico ya está registrado para otro cliente.',
        );
      }
      this.rethrowCatalogError(error);
    }
  }

  async getEmailChangeSnapshot(
    id: number,
  ): Promise<{ email: string; sessionVersion: string | null } | null> {
    const result = await this.db.query<{
      EMAIL: string;
      SESSION_VERSION: string | null;
    }>(
      `SELECT c.EMAIL, TO_CHAR(r.RESET_AT AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.FF9') AS SESSION_VERSION
       FROM CLIENTS c LEFT JOIN PASSWORD_RECOVERIES r ON r.CLIENT_ID = c.CLIENT_ID
       WHERE c.CLIENT_ID = :id AND c.STATUS = 'ACTIVE'`,
      { id },
      { outFormat: oracle.OUT_FORMAT_OBJECT },
    );
    const row = result.rows?.[0];
    return row
      ? { email: row.EMAIL, sessionVersion: row.SESSION_VERSION }
      : null;
  }

  async isClientEmailTaken(email: string, id: number): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM CLIENTS WHERE EMAIL = :email AND CLIENT_ID <> :id AND ROWNUM = 1',
      { email, id },
    );
    return Boolean(result.rows?.length);
  }

  async confirmEmailChange(
    id: number,
    email: string,
    newEmail: string,
    sessionVersion: string | null,
  ): Promise<void> {
    try {
      await this.db.transaction(async (connection) => {
        const current = await connection.execute<{
          EMAIL: string;
          STATUS: string;
        }>(
          'SELECT EMAIL, STATUS FROM CLIENTS WHERE CLIENT_ID = :id FOR UPDATE',
          { id },
          { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false },
        );
        const version = await connection.execute<{
          SESSION_VERSION: string | null;
        }>(
          `SELECT TO_CHAR(RESET_AT AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.FF9') AS SESSION_VERSION FROM PASSWORD_RECOVERIES WHERE CLIENT_ID = :id`,
          { id },
          { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false },
        );
        const row = current.rows?.[0];
        if (
          !row ||
          row.STATUS !== 'ACTIVE' ||
          row.EMAIL !== email ||
          (version.rows?.[0]?.SESSION_VERSION ?? null) !== sessionVersion
        ) {
          throw new BadRequestException(
            'El enlace ya no es válido. Solicita otro cambio de correo desde tu perfil.',
          );
        }
        const duplicate = await connection.execute(
          'SELECT 1 FROM CLIENTS WHERE EMAIL = :email AND CLIENT_ID <> :id AND ROWNUM = 1',
          { email: newEmail, id },
          { autoCommit: false },
        );
        if (duplicate.rows?.length)
          throw new ConflictException(
            'Ese correo ya está registrado para otro cliente.',
          );
        const result = await connection.execute(
          'UPDATE CLIENTS SET EMAIL = :email WHERE CLIENT_ID = :id',
          { email: newEmail, id },
          { autoCommit: false },
        );
        if (result.rowsAffected !== 1)
          throw new Error('Oracle did not update a single client email.');
        await revokeAccountSessions(connection, 'client', id);
      });
    } catch (error) {
      const failure = error as { errorNum?: number; message?: string } | null;
      if (
        failure?.errorNum === 1 &&
        /\bUQ_CLIENTS_EMAIL\b/u.test(failure.message ?? '')
      ) {
        throw new ConflictException(
          'Ese correo ya está registrado para otro cliente.',
        );
      }
      throw error;
    }
  }

  async findClientDetailById(id: number): Promise<ClientDetailDto | null> {
    const result = await this.db.query<{
      ID: number;
      STATUS: UserStatus;
      FIRST_NAME: string;
      SECOND_NAME: string | null;
      FIRST_SURNAME: string | null;
      SECOND_SURNAME: string | null;
      BIRTHDAY: string | null;
      PHONE_NUMBER: string | null;
      EMAIL: string;
      GENDER: string | null;
      LANGUAGE: string;
      CREATED_AT: string | null;
      ADDRESS_ID: number | null;
      ADDRESS_DETAILS: string | null;
      DISTRICT_ID: number;
      DISTRICT_NAME: string;
      CANTON_ID: number;
      CANTON_NAME: string;
      PROVINCE_ID: number;
      PROVINCE_NAME: string;
    }>(
      `SELECT c.CLIENT_ID AS ID, c.STATUS, c.FIRST_NAME, c.SECOND_NAME, c.FIRST_SURNAME, c.SECOND_SURNAME,
              TO_CHAR(c.BIRTHDAY, 'YYYY-MM-DD') AS BIRTHDAY, c.PHONE_NUMBER, c.EMAIL,
              c.GENDER, c.LANGUAGE,
              TO_CHAR(c.CREATED_AT AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"') AS CREATED_AT,
              a.ID_ADDRESS AS ADDRESS_ID, a.DETAILS AS ADDRESS_DETAILS,
              d.ID_DISTRICT AS DISTRICT_ID, d.NAME AS DISTRICT_NAME,
              k.ID_CANTON AS CANTON_ID, k.NAME AS CANTON_NAME,
              p.ID_PROVINCE AS PROVINCE_ID, p.NAME AS PROVINCE_NAME
       FROM CLIENTS c
       LEFT JOIN ADDRESSES a ON a.ID_ADDRESS = c.ID_ADDRESS
       LEFT JOIN DISTRICTS d ON d.ID_DISTRICT = a.ID_DISTRICT
       LEFT JOIN CANTONS k ON k.ID_CANTON = d.ID_CANTON
       LEFT JOIN PROVINCES p ON p.ID_PROVINCE = k.ID_PROVINCE
       WHERE c.CLIENT_ID = :id`,
      { id: { val: id, type: oracle.NUMBER } },
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return {
      id: row.ID,
      status: row.STATUS,
      role: UserRole.CLIENT,
      firstName: row.FIRST_NAME,
      secondName: row.SECOND_NAME,
      firstSurname: row.FIRST_SURNAME,
      secondSurname: row.SECOND_SURNAME,
      birthday: row.BIRTHDAY,
      phoneNumber: row.PHONE_NUMBER,
      email: row.EMAIL,
      gender: row.GENDER,
      language: row.LANGUAGE,
      createdAt: row.CREATED_AT,
      address:
        row.ADDRESS_ID === null
          ? null
          : {
              id: row.ADDRESS_ID,
              provinceId: row.PROVINCE_ID,
              provinceName: row.PROVINCE_NAME,
              cantonId: row.CANTON_ID,
              cantonName: row.CANTON_NAME,
              districtId: row.DISTRICT_ID,
              districtName: row.DISTRICT_NAME,
              details: row.ADDRESS_DETAILS,
            },
    };
  }

  async listClients(
    query: ListClientsQueryDto,
  ): Promise<ListedUsersDto<ListedClientDto>> {
    const name =
      "REGEXP_REPLACE(TRIM(c.FIRST_NAME || ' ' || c.SECOND_NAME || ' ' || c.FIRST_SURNAME || ' ' || c.SECOND_SURNAME), '[[:space:]]+', ' ')";
    const binds: oracle.BindParameters = {};
    const conditions: string[] = [];
    if (query.search) {
      conditions.push(buildUserSearch(query.search, 'clients', name, binds));
    }
    if (query.status?.length) {
      const parameters = query.status.map((status, index) => {
        binds[`status${index}`] = { val: status, type: oracle.STRING };
        return `:status${index}`;
      });
      conditions.push(`c.STATUS IN (${parameters.join(', ')})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await this.db.query<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL FROM CLIENTS c ${where}`,
      binds,
    );
    const total = count.rows?.[0]?.TOTAL ?? 0;
    const totalPages = Math.ceil(total / query.pageSize);
    const page = Math.min(query.page, Math.max(1, totalPages));
    if (total === 0)
      return { items: [], total, page, pageSize: query.pageSize, totalPages };
    const sort =
      {
        id: 'c.CLIENT_ID',
        name,
        email: 'LOWER(c.EMAIL)',
        createdAt: 'c.CREATED_AT',
        status: 'c.STATUS',
      }[query.sortBy] ?? 'c.CLIENT_ID';
    const result = await this.db.query<{
      ID: number;
      STATUS: UserStatus;
      NAME: string;
      EMAIL: string;
      PHONE_NUMBER: string | null;
      CREATED_AT: string | null;
    }>(
      `SELECT c.CLIENT_ID AS ID, c.STATUS, ${name} AS NAME, c.EMAIL, c.PHONE_NUMBER,
              TO_CHAR(c.CREATED_AT AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"') AS CREATED_AT
       FROM CLIENTS c ${where}
       ORDER BY ${sort} ${query.sortDirection === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, c.CLIENT_ID ASC
       OFFSET :offset ROWS FETCH NEXT :pageSize ROWS ONLY`,
      {
        ...binds,
        offset: { val: (page - 1) * query.pageSize, type: oracle.NUMBER },
        pageSize: { val: query.pageSize, type: oracle.NUMBER },
      },
    );
    return {
      items: (result.rows ?? []).map((row) => ({
        id: row.ID,
        status: row.STATUS,
        name: row.NAME,
        email: row.EMAIL,
        phoneNumber: row.PHONE_NUMBER,
        createdAt: row.CREATED_AT,
      })),
      total,
      page,
      pageSize: query.pageSize,
      totalPages,
    };
  }

  async clientEmailExists(email: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 AS FOUND FROM CLIENTS WHERE EMAIL = :email AND ROWNUM = 1',
      { email },
    );

    return !!result.rows?.length;
  }

  async createClient(
    data: NewClientWithLocalCredentials,
    emailVerification?: { tokenHash: string; expiresInMinutes: number },
  ): Promise<number> {
    try {
      return await this.db.transaction(async (connection) => {
        const clientId = await this.insertClient(connection, data);
        const credentialsResult = await connection.execute(
          `INSERT INTO CLIENT_LOCAL_CREDENTIALS (
          CLIENT_ID, PASSWORD_HASH, SALT, PASSWORD_SET_AT, EXPIRATION_DAYS
        ) VALUES (:clientId, :passwordHash, :salt, SYSTIMESTAMP, :expirationDays)`,
          {
            clientId: { val: clientId, type: oracle.NUMBER },
            passwordHash: { val: data.passwordHash, type: oracle.STRING },
            salt: { val: data.salt, type: oracle.STRING },
            expirationDays: { val: 90, type: oracle.NUMBER },
          },
          { autoCommit: false },
        );
        if (credentialsResult.rowsAffected !== 1) {
          throw new Error('Oracle did not create a single credentials record.');
        }

        if (emailVerification) {
          const verificationResult = await connection.execute(
            `INSERT INTO CLIENT_EMAIL_VERIFICATIONS (
               CLIENT_ID, TOKEN_HASH, EXPIRES_AT
             ) VALUES (
               :clientId, :tokenHash,
               SYSTIMESTAMP + NUMTODSINTERVAL(:expiresInMinutes, 'MINUTE')
             )`,
            {
              clientId: { val: clientId, type: oracle.NUMBER },
              tokenHash: {
                val: emailVerification.tokenHash,
                type: oracle.STRING,
              },
              expiresInMinutes: {
                val: emailVerification.expiresInMinutes,
                type: oracle.NUMBER,
              },
            },
            { autoCommit: false },
          );
          if (verificationResult.rowsAffected !== 1) {
            throw new Error(
              'Oracle did not create a single email verification.',
            );
          }
        }

        return clientId;
      });
    } catch (error) {
      const oracleError = error as {
        errorNum?: number;
        message?: string;
      } | null;
      if (
        oracleError?.errorNum === 1 &&
        /\bUQ_CLIENTS_EMAIL\b/u.test(oracleError.message ?? '')
      ) {
        throw new ConflictException('Este correo ya está registrado');
      }
      this.rethrowCatalogError(error);
    }
  }

  private rethrowCatalogError(error: unknown): never {
    const failure = error as { errorNum?: number; message?: string } | null;
    if (
      failure?.errorNum === 2291 &&
      /\bFK_ADDRESS_DISTRICT\b/u.test(failure.message ?? '')
    )
      throw new BadRequestException(
        'El distrito seleccionado ya no existe. Selecciona otro distrito.',
      );
    throw error;
  }

  async insertClient(
    connection: oracle.Connection,
    data: NewClient,
  ): Promise<number> {
    const addressId =
      data.address == null
        ? null
        : await this.insertAddress(connection, data.address);
    const binds: Record<string, oracle.BindParameter> = {
      email: { val: data.email, type: oracle.STRING },
      firstName: { val: data.firstName, type: oracle.STRING },
      secondName: { val: data.secondName ?? null, type: oracle.STRING },
      firstSurname: { val: data.firstSurname ?? null, type: oracle.STRING },
      secondSurname: { val: data.secondSurname ?? null, type: oracle.STRING },
      birthday: { val: data.birthday ?? null, type: oracle.STRING },
      phoneNumber: { val: data.phoneNumber ?? null, type: oracle.STRING },
      addressId: { val: addressId, type: oracle.NUMBER },
      gender: { val: data.gender ?? null, type: oracle.STRING },
      terms: { val: data.acceptedTerms === true ? 1 : 0, type: oracle.NUMBER },
      clientId: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
    };
    const hasLanguage = data.language !== undefined;
    if (hasLanguage) {
      binds.language = { val: data.language, type: oracle.STRING };
    }

    const result = await connection.execute<{ clientId?: unknown }>(
      `INSERT INTO CLIENTS (
          EMAIL, FIRST_NAME, SECOND_NAME, FIRST_SURNAME, SECOND_SURNAME,
          BIRTHDAY, PHONE_NUMBER, ID_ADDRESS, GENDER, ACCEPTED_TERMS_AT${hasLanguage ? ', LANGUAGE' : ''}
        ) VALUES (
          :email, :firstName, :secondName, :firstSurname, :secondSurname,
          TO_DATE(:birthday, 'FXYYYY-MM-DD'), :phoneNumber, :addressId, :gender, CASE WHEN :terms = 1 THEN SYSTIMESTAMP END${hasLanguage ? ', :language' : ''}
        ) RETURNING CLIENT_ID INTO :clientId`,
      binds,
      { autoCommit: false },
    );

    const returnedIds = result.outBinds?.clientId;
    if (
      result.rowsAffected !== 1 ||
      !Array.isArray(returnedIds) ||
      returnedIds.length !== 1
    ) {
      throw new Error('Oracle did not return a single created client.');
    }

    const clientId: unknown = returnedIds[0];
    if (
      typeof clientId !== 'number' ||
      !Number.isSafeInteger(clientId) ||
      clientId < 1
    ) {
      throw new Error('Oracle returned an invalid client identifier.');
    }

    return clientId;
  }

  private async insertAddress(
    connection: oracle.Connection,
    data: NonNullable<NewClient['address']>,
  ): Promise<number> {
    const result = await connection.execute<{ addressId?: unknown }>(
      `INSERT INTO ADDRESSES (ID_DISTRICT, DETAILS)
       VALUES (:districtId, :details)
       RETURNING ID_ADDRESS INTO :addressId`,
      {
        districtId: { val: data.districtId, type: oracle.NUMBER },
        details: { val: data.details ?? null, type: oracle.STRING },
        addressId: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
      },
      { autoCommit: false },
    );

    const returnedIds = result.outBinds?.addressId;
    if (
      result.rowsAffected !== 1 ||
      !Array.isArray(returnedIds) ||
      returnedIds.length !== 1
    ) {
      throw new Error('Oracle did not return a single created address.');
    }

    const addressId: unknown = returnedIds[0];
    if (
      typeof addressId !== 'number' ||
      !Number.isSafeInteger(addressId) ||
      addressId < 1
    ) {
      throw new Error('Oracle returned an invalid address identifier.');
    }

    return addressId;
  }

  async findPasswordStatus(
    clientId: number,
  ): Promise<{ setAt: Date; expirationDays: number } | null> {
    const result = await this.db.query<{
      PASSWORD_SET_AT: Date;
      EXPIRATION_DAYS: number;
    }>(
      `SELECT PASSWORD_SET_AT, EXPIRATION_DAYS FROM CLIENT_LOCAL_CREDENTIALS WHERE CLIENT_ID = :clientId`,
      { clientId: { val: clientId, type: oracle.NUMBER } },
      { outFormat: oracle.OUT_FORMAT_OBJECT },
    );
    const row = result.rows?.[0];
    if (!row) return null;
    if (
      !(row.PASSWORD_SET_AT instanceof Date) ||
      !Number.isFinite(row.PASSWORD_SET_AT.getTime()) ||
      ![30, 60, 90, 120].includes(row.EXPIRATION_DAYS)
    ) {
      throw new Error('Oracle returned invalid client password status.');
    }
    return { setAt: row.PASSWORD_SET_AT, expirationDays: row.EXPIRATION_DAYS };
  }

  async findPasswordHash(
    clientId: number,
  ): Promise<{ passwordHash: string; salt: string } | null> {
    const result = await this.db.query<{ PASSWORD_HASH: string; SALT: string }>(
      `SELECT PASSWORD_HASH, SALT FROM CLIENT_LOCAL_CREDENTIALS WHERE CLIENT_ID = :clientId`,
      { clientId: { val: clientId, type: oracle.NUMBER } },
      { outFormat: oracle.OUT_FORMAT_OBJECT },
    );
    const row = result.rows?.[0];
    return row ? { passwordHash: row.PASSWORD_HASH, salt: row.SALT } : null;
  }

  async savePassword(
    clientId: number,
    passwordHash: string,
    salt: string,
    expirationDays: number,
    connection?: oracle.Connection,
  ): Promise<void> {
    const save = async (connection: oracle.Connection) => {
      const active = await connection.execute(
        "SELECT CLIENT_ID FROM CLIENTS WHERE CLIENT_ID = :clientId AND STATUS = 'ACTIVE' FOR UPDATE",
        { clientId: { val: clientId, type: oracle.NUMBER } },
        { autoCommit: false },
      );
      if (!active.rows?.length)
        throw new UnauthorizedException(
          'La sesión ha expirado. Inicia sesión nuevamente.',
        );
      const result = await connection.execute(
        `MERGE INTO CLIENT_LOCAL_CREDENTIALS t
        USING (SELECT :clientId AS client_id FROM dual) s
        ON (t.client_id = s.client_id)
        WHEN MATCHED THEN UPDATE SET
          t.password_hash = :passwordHash, t.salt = :salt,
          t.password_set_at = SYSTIMESTAMP, t.expiration_days = :expirationDays
        WHEN NOT MATCHED THEN INSERT (client_id, password_hash, salt, password_set_at, expiration_days)
        VALUES (:clientId, :passwordHash, :salt, SYSTIMESTAMP, :expirationDays)`,
        {
          clientId: { val: clientId, type: oracle.NUMBER },
          passwordHash: { val: passwordHash, type: oracle.STRING },
          salt: { val: salt, type: oracle.STRING },
          expirationDays: { val: expirationDays, type: oracle.NUMBER },
        },
        { autoCommit: false },
      );
      if (result.rowsAffected !== 1) {
        throw new Error(
          'Oracle did not upsert exactly one credentials record.',
        );
      }
    };
    if (connection) await save(connection);
    else await this.db.transaction(save);
  }
}
