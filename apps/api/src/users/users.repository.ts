import { Inject, Injectable } from '@nestjs/common';
import oracle from 'oracledb';
import { UserCreationOptionsDto } from './dto/user-creation-options.dto';
import { UserRole } from './enums/user-role.enum';
import type { UserIdentity } from './types/user-identity.type';
import { ORACLE_POOL } from '../database/database.module';
import type { CreateClientRecord } from './types/create-client-record.type';
import type { CreateEmployeeRecord } from './types/create-employee-record.type';
import type { CreateAddressDto } from './dto/create-address.dto';

@Injectable()
export class UsersRepository {
  constructor(@Inject(ORACLE_POOL) private readonly oraclePool: oracle.Pool) {}

  async getCreationOptions(): Promise<UserCreationOptionsDto> {
    const connection = await this.oraclePool.getConnection();
    try {
      const options = { outFormat: oracle.OUT_FORMAT_OBJECT };
      const provinces = await connection.execute<{
        ID_PROVINCE: number;
        NAME: string;
      }>(
        'SELECT ID_PROVINCE, NAME FROM PROVINCES ORDER BY NAME, ID_PROVINCE',
        {},
        options,
      );
      const cantons = await connection.execute<{
        ID_CANTON: number;
        NAME: string;
        ID_PROVINCE: number;
      }>(
        'SELECT ID_CANTON, NAME, ID_PROVINCE FROM CANTONS ORDER BY NAME, ID_CANTON',
        {},
        options,
      );
      const districts = await connection.execute<{
        ID_DISTRICT: number;
        NAME: string;
        ID_CANTON: number;
      }>(
        'SELECT ID_DISTRICT, NAME, ID_CANTON FROM DISTRICTS ORDER BY NAME, ID_DISTRICT',
        {},
        options,
      );
      const branches = await connection.execute<{
        BRANCH_ID: number;
        NAME: string;
      }>(
        'SELECT BRANCH_ID, NAME FROM CINEMAS ORDER BY NAME, BRANCH_ID',
        {},
        options,
      );

      return new UserCreationOptionsDto({
        provinces: (provinces.rows ?? []).map((row) => ({
          id: row.ID_PROVINCE,
          label: row.NAME,
        })),
        cantons: (cantons.rows ?? []).map((row) => ({
          id: row.ID_CANTON,
          label: row.NAME,
          provinceId: row.ID_PROVINCE,
        })),
        districts: (districts.rows ?? []).map((row) => ({
          id: row.ID_DISTRICT,
          label: row.NAME,
          cantonId: row.ID_CANTON,
        })),
        branches: (branches.rows ?? []).map((row) => ({
          id: row.BRANCH_ID,
          label: row.NAME,
        })),
      });
    } finally {
      await connection.close();
    }
  }

  async clientEmailExists(email: string): Promise<boolean> {
    const connection = await this.oraclePool.getConnection();

    try {
      const result = await connection.execute(
        'SELECT 1 AS FOUND FROM CLIENTS WHERE EMAIL = :email AND ROWNUM = 1',
        { email },
      );

      return !!result.rows?.length;
    } finally {
      await connection.close();
    }
  }

  async findEmployeeIdentityById(
    employeeId: number,
  ): Promise<UserIdentity | null> {
    const connection = await this.oraclePool.getConnection();
    try {
      const result = await connection.execute<{
        EMPLOYEE_ID: unknown;
        ROLE: unknown;
      }>(
        'SELECT EMPLOYEE_ID, ROLE FROM EMPLOYEES WHERE EMPLOYEE_ID = :employeeId',
        { employeeId: { val: employeeId, type: oracle.NUMBER } },
        { outFormat: oracle.OUT_FORMAT_OBJECT },
      );
      if (result.rows?.length !== 1) {
        return null;
      }

      const row = result.rows[0];
      if (
        typeof row.EMPLOYEE_ID !== 'number' ||
        !Number.isSafeInteger(row.EMPLOYEE_ID) ||
        row.EMPLOYEE_ID < 1 ||
        row.EMPLOYEE_ID !== employeeId ||
        (row.ROLE !== UserRole.ADMINISTRATOR && row.ROLE !== UserRole.EMPLOYEE)
      ) {
        return null;
      }
      return { id: row.EMPLOYEE_ID, role: row.ROLE };
    } finally {
      await connection.close();
    }
  }

  async createClient(data: CreateClientRecord): Promise<number> {
    return this.withTransaction(async (connection) => {
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
        clientId: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
      };
      const hasLanguage = data.language !== undefined;
      if (hasLanguage) {
        binds.language = { val: data.language, type: oracle.STRING };
      }

      const result = await connection.execute<{ clientId?: unknown }>(
        `INSERT INTO CLIENTS (
          EMAIL, FIRST_NAME, SECOND_NAME, FIRST_SURNAME, SECOND_SURNAME,
          BIRTHDAY, PHONE_NUMBER, ID_ADDRESS${hasLanguage ? ', LANGUAGE' : ''}
        ) VALUES (
          :email, :firstName, :secondName, :firstSurname, :secondSurname,
          TO_DATE(:birthday, 'FXYYYY-MM-DD'), :phoneNumber, :addressId${hasLanguage ? ', :language' : ''}
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
  }

  async createEmployee(data: CreateEmployeeRecord): Promise<number> {
    return this.withTransaction(async (connection) => {
      const addressId = await this.insertAddress(connection, data.address);
      const result = await connection.execute<{ employeeId?: unknown }>(
        `INSERT INTO EMPLOYEES (
          FIRST_NAME, SECOND_NAME, FIRST_SURNAME, SECOND_SURNAME,
          BIRTHDAY, PHONE_NUMBER, EMAIL, ROLE, ID_ADDRESS, BRANCH_ID
        ) VALUES (
          :firstName, :secondName, :firstSurname, :secondSurname,
          TO_DATE(:birthday, 'FXYYYY-MM-DD'), :phoneNumber, :email, :role,
          :addressId, :branchId
        ) RETURNING EMPLOYEE_ID INTO :employeeId`,
        {
          firstName: { val: data.firstName, type: oracle.STRING },
          secondName: { val: data.secondName ?? null, type: oracle.STRING },
          firstSurname: { val: data.firstSurname, type: oracle.STRING },
          secondSurname: { val: data.secondSurname, type: oracle.STRING },
          birthday: { val: data.birthday, type: oracle.STRING },
          phoneNumber: { val: data.phoneNumber, type: oracle.STRING },
          email: { val: data.email, type: oracle.STRING },
          role: { val: data.role, type: oracle.STRING },
          addressId: { val: addressId, type: oracle.NUMBER },
          branchId: { val: data.branchId, type: oracle.NUMBER },
          employeeId: { dir: oracle.BIND_OUT, type: oracle.NUMBER },
        },
        { autoCommit: false },
      );

      const returnedIds = result.outBinds?.employeeId;
      if (
        result.rowsAffected !== 1 ||
        !Array.isArray(returnedIds) ||
        returnedIds.length !== 1
      ) {
        throw new Error('Oracle did not return a single created employee.');
      }

      const employeeId: unknown = returnedIds[0];
      if (
        typeof employeeId !== 'number' ||
        !Number.isSafeInteger(employeeId) ||
        employeeId < 1
      ) {
        throw new Error('Oracle returned an invalid employee identifier.');
      }

      const credentialsResult = await connection.execute(
        `INSERT INTO EMPLOYEE_LOCAL_CREDENTIALS (
          EMPLOYEE_ID, PASSWORD_HASH, SALT
        ) VALUES (:employeeId, :passwordHash, :salt)`,
        {
          employeeId: { val: employeeId, type: oracle.NUMBER },
          passwordHash: { val: data.passwordHash, type: oracle.STRING },
          salt: { val: data.salt, type: oracle.STRING },
        },
        { autoCommit: false },
      );
      if (credentialsResult.rowsAffected !== 1) {
        throw new Error('Oracle did not create a single credentials record.');
      }

      return employeeId;
    });
  }

  private async insertAddress(
    connection: oracle.Connection,
    data: CreateAddressDto,
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

  private async withTransaction<T>(
    operation: (connection: oracle.Connection) => Promise<T>,
  ): Promise<T> {
    const connection = await this.oraclePool.getConnection();
    let result: T;
    let closeFailed = false;
    let closeError: unknown;

    try {
      result = await operation(connection);
      await connection.commit();
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // Preserve the operation error if rollback also fails.
      }
      throw error;
    } finally {
      try {
        await connection.close();
      } catch (error) {
        // Defer this error so it cannot replace an operation error in flight.
        closeFailed = true;
        closeError = error;
      }
    }

    if (closeFailed) {
      throw closeError;
    }
    return result;
  }
}
