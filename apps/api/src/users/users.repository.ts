import { Injectable } from '@nestjs/common';
import oracle from 'oracledb';
import { UserCreationOptionsDto } from './dto/user-creation-options.dto';
import { UserRole } from './enums/user-role.enum';
import { DatabaseService } from '../database/database.service';
import type { CreateEmployeeRecord } from './types/create-employee-record.type';
import type { CreateAddressDto } from './dto/create-address.dto';
import type { EmployeeWithLocalCredentials } from './types/employee-with-local-credentials.type';

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findEmployeeWithLocalCredentialsByEmail(
    email: string,
  ): Promise<EmployeeWithLocalCredentials | null> {
    const result = await this.db.query<{
      EMPLOYEE_ID: number;
      ROLE: UserRole;
      EMAIL: string;
      FIRST_NAME: string;
      SECOND_NAME: string | null;
      FIRST_SURNAME: string;
      SECOND_SURNAME: string;
      CREDENTIALS_EMPLOYEE_ID: number | null;
      PASSWORD_HASH: string | null;
    }>(
      `SELECT e.EMPLOYEE_ID, e.ROLE, e.EMAIL, e.FIRST_NAME, e.SECOND_NAME,
              e.FIRST_SURNAME, e.SECOND_SURNAME,
              c.EMPLOYEE_ID AS CREDENTIALS_EMPLOYEE_ID, c.PASSWORD_HASH
       FROM EMPLOYEES e
       LEFT JOIN EMPLOYEE_LOCAL_CREDENTIALS c ON c.EMPLOYEE_ID = e.EMPLOYEE_ID
       WHERE LOWER(TRIM(e.EMAIL)) = :email
       FETCH FIRST 2 ROWS ONLY`,
      { email: { val: email.trim().toLowerCase(), type: oracle.STRING } },
      { outFormat: oracle.OUT_FORMAT_OBJECT },
    );
    const rows = result.rows ?? [];
    if (rows.length === 0) return null;
    // Count employees without credentials too: they must not hide an ambiguous email.
    if (rows.length !== 1) {
      throw new Error('Employee email lookup returned multiple accounts.');
    }
    const row = rows[0];
    if (
      !Number.isSafeInteger(row.EMPLOYEE_ID) ||
      row.EMPLOYEE_ID < 1 ||
      (row.ROLE !== UserRole.EMPLOYEE && row.ROLE !== UserRole.ADMINISTRATOR)
    ) {
      throw new Error('Oracle returned an invalid employee identity.');
    }
    if (row.CREDENTIALS_EMPLOYEE_ID === null) return null;
    if (
      row.CREDENTIALS_EMPLOYEE_ID !== row.EMPLOYEE_ID ||
      typeof row.PASSWORD_HASH !== 'string' ||
      !row.PASSWORD_HASH.trim()
    ) {
      throw new Error('Oracle returned invalid employee credentials.');
    }
    return {
      id: row.EMPLOYEE_ID,
      role: row.ROLE,
      email: row.EMAIL,
      firstName: row.FIRST_NAME,
      secondName: row.SECOND_NAME,
      firstSurname: row.FIRST_SURNAME,
      secondSurname: row.SECOND_SURNAME,
      passwordHash: row.PASSWORD_HASH,
    };
  }

  async getCreationOptions(): Promise<UserCreationOptionsDto> {
    const options = { outFormat: oracle.OUT_FORMAT_OBJECT };
    const provinces = await this.db.query<{
      ID_PROVINCE: number;
      NAME: string;
    }>(
      'SELECT ID_PROVINCE, NAME FROM PROVINCES ORDER BY NAME, ID_PROVINCE',
      {},
      options,
    );
    const cantons = await this.db.query<{
      ID_CANTON: number;
      NAME: string;
      ID_PROVINCE: number;
    }>(
      'SELECT ID_CANTON, NAME, ID_PROVINCE FROM CANTONS ORDER BY NAME, ID_CANTON',
      {},
      options,
    );
    const districts = await this.db.query<{
      ID_DISTRICT: number;
      NAME: string;
      ID_CANTON: number;
    }>(
      'SELECT ID_DISTRICT, NAME, ID_CANTON FROM DISTRICTS ORDER BY NAME, ID_DISTRICT',
      {},
      options,
    );
    const branches = await this.db.query<{
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
  }

  async findEmployeeIdentityById(
    employeeId: number,
  ): Promise<Pick<
    EmployeeWithLocalCredentials,
    'id' | 'role' | 'firstName'
  > | null> {
    const result = await this.db.query<{
      EMPLOYEE_ID: unknown;
      ROLE: unknown;
      FIRST_NAME: unknown;
    }>(
      'SELECT EMPLOYEE_ID, ROLE, FIRST_NAME FROM EMPLOYEES WHERE EMPLOYEE_ID = :employeeId',
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
      (row.ROLE !== UserRole.ADMINISTRATOR && row.ROLE !== UserRole.EMPLOYEE) ||
      typeof row.FIRST_NAME !== 'string' ||
      !row.FIRST_NAME.trim()
    ) {
      return null;
    }
    return { id: row.EMPLOYEE_ID, role: row.ROLE, firstName: row.FIRST_NAME };
  }

  async createEmployee(data: CreateEmployeeRecord): Promise<number> {
    return this.db.transaction(async (connection) => {
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
}
