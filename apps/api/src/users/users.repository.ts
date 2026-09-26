import { Inject, Injectable } from '@nestjs/common';
import oracle from 'oracledb';
import { ORACLE_POOL } from '../database/database.module';
import type { CreateClientRecord } from './types/create-client-record.type';
import type { CreateEmployeeRecord } from './types/create-employee-record.type';
import type { CreateAddressDto } from './dto/create-address.dto';

@Injectable()
export class UsersRepository {
  constructor(@Inject(ORACLE_POOL) private readonly oraclePool: oracle.Pool) {}

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
