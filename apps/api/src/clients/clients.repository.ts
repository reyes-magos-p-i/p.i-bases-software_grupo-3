import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import oracle from 'oracledb';
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

  async deactivateClient(id: number): Promise<void> {
    await this.db.transaction(async (connection) => {
      const result = await connection.execute(
        "UPDATE CLIENTS SET STATUS = 'INACTIVE' WHERE CLIENT_ID = :id AND STATUS = 'ACTIVE'",
        { id: { val: id, type: oracle.NUMBER } },
        { autoCommit: false },
      );
      if (result.rowsAffected === 0)
        throw new NotFoundException(
          'El usuario seleccionado no existe o ya está inactivo.',
        );
      if (result.rowsAffected !== 1)
        throw new Error('Oracle did not deactivate a single client.');
    });
  }

  async updateClient(
    id: number,
    data: UpdateClientDto,
  ): Promise<UpdatedUserDto> {
    try {
      return await this.db.transaction(async (connection) => {
        const current = await connection.execute<{ EMAIL: string }>(
          "SELECT EMAIL FROM CLIENTS WHERE CLIENT_ID = :id AND STATUS = 'ACTIVE' FOR UPDATE",
          { id: { val: id, type: oracle.NUMBER } },
          { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false },
        );
        const row = current.rows?.[0];
        if (!row)
          throw new NotFoundException('El usuario seleccionado no existe.');
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
      if (failure?.errorNum === 2291)
        throw new BadRequestException('El distrito de la dirección no existe.');
      throw error;
    }
  }

  async findClientDetailById(id: number): Promise<ClientDetailDto | null> {
    const result = await this.db.query<{
      ID: number;
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
      `SELECT c.CLIENT_ID AS ID, c.FIRST_NAME, c.SECOND_NAME, c.FIRST_SURNAME, c.SECOND_SURNAME,
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
       WHERE c.CLIENT_ID = :id AND c.STATUS = 'ACTIVE'`,
      { id: { val: id, type: oracle.NUMBER } },
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return {
      id: row.ID,
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
    let where = "WHERE c.STATUS = 'ACTIVE'";
    if (query.search) {
      const terms = query.search.split(' ').map((term, index) => {
        binds[`name${index}`] = {
          val: `%${term.toLowerCase().replace(/[\\%_]/gu, '\\$&')}%`,
          type: oracle.STRING,
        };
        return `LOWER(${name}) LIKE :name${index} ESCAPE '\\'`;
      });
      binds.search = {
        val: `%${query.search.toLowerCase().replace(/[\\%_]/gu, '\\$&')}%`,
        type: oracle.STRING,
      };
      where += ` AND ((${terms.join(' AND ')}) OR LOWER(c.EMAIL) LIKE :search ESCAPE '\\' OR c.PHONE_NUMBER LIKE :search ESCAPE '\\' OR TO_CHAR(c.CLIENT_ID) LIKE :search ESCAPE '\\')`;
    }
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
      }[query.sortBy] ?? 'c.CLIENT_ID';
    const result = await this.db.query<{
      ID: number;
      NAME: string;
      EMAIL: string;
      PHONE_NUMBER: string | null;
      CREATED_AT: string | null;
    }>(
      `SELECT c.CLIENT_ID AS ID, ${name} AS NAME, c.EMAIL, c.PHONE_NUMBER,
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

  async createClient(data: NewClientWithLocalCredentials): Promise<number> {
    try {
      return await this.db.transaction(async (connection) => {
        const clientId = await this.insertClient(connection, data);
        const credentialsResult = await connection.execute(
          `INSERT INTO CLIENT_LOCAL_CREDENTIALS (
          CLIENT_ID, PASSWORD_HASH, SALT
        ) VALUES (:clientId, :passwordHash, :salt)`,
          {
            clientId: { val: clientId, type: oracle.NUMBER },
            passwordHash: { val: data.passwordHash, type: oracle.STRING },
            salt: { val: data.salt, type: oracle.STRING },
          },
          { autoCommit: false },
        );
        if (credentialsResult.rowsAffected !== 1) {
          throw new Error('Oracle did not create a single credentials record.');
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
      throw error;
    }
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
}
