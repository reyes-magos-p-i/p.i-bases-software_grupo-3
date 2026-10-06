import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import oracle from 'oracledb';
import { buildUserSearch } from './user-search.util';
import { UserCreationOptionsDto } from './dto/user-creation-options.dto';
import { UserRole } from './enums/user-role.enum';
import type { EmployeeDetailDto } from './dto/user-detail.dto';
import { DatabaseService } from '../database/database.service';
import type { CreateEmployeeRecord } from './types/create-employee-record.type';
import type { CreateAddressDto } from './dto/create-address.dto';
import type { UpdateEmployeeDto, UpdatedUserDto } from './dto/update-user.dto';
import type { EmployeeWithLocalCredentials } from './types/employee-with-local-credentials.type';
import type { ListEmployeesQueryDto } from './dto/list-users-query.dto';
import type {
  EmployeeListOptionsDto,
  ListedEmployeeDto,
  ListedUsersDto,
} from './dto/listed-users.dto';

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  async deactivateEmployee(id: number, actorId: number): Promise<void> {
    if (id === actorId)
      throw new ConflictException('No puedes desactivar tu propia cuenta.');
    await this.db.transaction(async (connection) => {
      await this.lockEmployeeLifecycle(connection);
      const actor = await connection.execute<{ ROLE: string }>(
        "SELECT ROLE FROM EMPLOYEES WHERE EMPLOYEE_ID = :actorId AND STATUS = 'ACTIVE'",
        { actorId: { val: actorId, type: oracle.NUMBER } },
        { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false },
      );
      if (actor.rows?.[0]?.ROLE !== UserRole.ADMINISTRATOR)
        throw new ForbiddenException(
          'No tienes permiso para desactivar personal.',
        );
      const selected = await connection.execute<{
        ROLE: string;
        STATUS: string;
      }>(
        'SELECT ROLE, STATUS FROM EMPLOYEES WHERE EMPLOYEE_ID = :id FOR UPDATE',
        { id: { val: id, type: oracle.NUMBER } },
        { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false },
      );
      const employee = selected.rows?.[0];
      if (!employee)
        throw new NotFoundException('El empleado seleccionado no existe.');
      if (employee.STATUS === 'INACTIVE')
        throw new ConflictException('El empleado ya está desactivado.');
      if (employee.STATUS !== 'ACTIVE')
        throw new Error('Invalid employee status.');
      if (employee.ROLE === UserRole.ADMINISTRATOR)
        await this.requireAnotherAdministrator(connection);
      const result = await connection.execute(
        "UPDATE EMPLOYEES SET STATUS = 'INACTIVE' WHERE EMPLOYEE_ID = :id AND STATUS = 'ACTIVE'",
        { id: { val: id, type: oracle.NUMBER } },
        { autoCommit: false },
      );
      if (result.rowsAffected !== 1)
        throw new Error('Oracle did not deactivate a single employee.');
    });
  }

  private lockEmployeeLifecycle(connection: oracle.Connection) {
    // Serialize role changes and deactivation before locking individual employees.
    return connection.execute(
      'LOCK TABLE EMPLOYEES IN SHARE ROW EXCLUSIVE MODE',
      {},
      { autoCommit: false },
    );
  }

  private async requireAnotherAdministrator(connection: oracle.Connection) {
    const administrators = await connection.execute<{ TOTAL: number }>(
      "SELECT COUNT(*) AS TOTAL FROM EMPLOYEES WHERE ROLE = 'ADMINISTRATOR' AND STATUS = 'ACTIVE'",
      {},
      { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false },
    );
    if ((administrators.rows?.[0]?.TOTAL ?? 0) <= 1)
      throw new ConflictException(
        'Debe permanecer al menos un administrador activo.',
      );
  }

  async updateEmployee(
    id: number,
    data: UpdateEmployeeDto,
  ): Promise<UpdatedUserDto> {
    try {
      return await this.db.transaction(async (connection) => {
        if (data.role !== undefined)
          await this.lockEmployeeLifecycle(connection);
        const current = await connection.execute<{
          EMAIL: string;
          ROLE: UserRole.EMPLOYEE | UserRole.ADMINISTRATOR;
        }>(
          "SELECT EMAIL, ROLE FROM EMPLOYEES WHERE EMPLOYEE_ID = :id AND STATUS = 'ACTIVE' FOR UPDATE",
          { id: { val: id, type: oracle.NUMBER } },
          { outFormat: oracle.OUT_FORMAT_OBJECT, autoCommit: false },
        );
        const row = current.rows?.[0];
        if (!row)
          throw new NotFoundException('El usuario seleccionado no existe.');
        if (
          row.ROLE === UserRole.ADMINISTRATOR &&
          data.role === UserRole.EMPLOYEE
        )
          await this.requireAnotherAdministrator(connection);
        if (data.email !== undefined) {
          const duplicate = await connection.execute(
            'SELECT 1 FROM EMPLOYEES WHERE LOWER(TRIM(EMAIL)) = :email AND EMPLOYEE_ID <> :id AND ROWNUM = 1',
            { email: data.email, id },
            { autoCommit: false },
          );
          if (duplicate.rows?.length)
            throw new ConflictException(
              'El correo electrónico ya está registrado para otro empleado.',
            );
        }
        const changes: string[] = [];
        const binds: oracle.BindParameters = {
          id: { val: id, type: oracle.NUMBER },
        };
        if (data.branchId !== undefined) {
          const branch = await connection.execute(
            'SELECT 1 FROM CINEMAS WHERE BRANCH_ID = :branchId FOR UPDATE',
            { branchId: { val: data.branchId, type: oracle.NUMBER } },
            { autoCommit: false },
          );
          if (!branch.rows?.length)
            throw new BadRequestException(
              'La sucursal seleccionada no existe.',
            );
          changes.push('BRANCH_ID = :branchId');
          binds.branchId = { val: data.branchId, type: oracle.NUMBER };
        }
        for (const [field, column] of [
          ['firstName', 'FIRST_NAME'],
          ['secondName', 'SECOND_NAME'],
          ['firstSurname', 'FIRST_SURNAME'],
          ['secondSurname', 'SECOND_SURNAME'],
          ['email', 'EMAIL'],
          ['phoneNumber', 'PHONE_NUMBER'],
          ['role', 'ROLE'],
        ] as const) {
          if (data[field] !== undefined) {
            changes.push(`${column} = :${field}`);
            binds[field] = { val: data[field], type: oracle.STRING };
          }
        }
        if (data.address !== undefined) {
          const addressId = await this.insertAddress(connection, data.address);
          changes.push('ID_ADDRESS = :addressId');
          binds.addressId = { val: addressId, type: oracle.NUMBER };
        }
        const result = await connection.execute(
          `UPDATE EMPLOYEES SET ${changes.join(', ')} WHERE EMPLOYEE_ID = :id AND STATUS = 'ACTIVE'`,
          binds,
          { autoCommit: false },
        );
        if (result.rowsAffected !== 1)
          throw new Error('Oracle did not update a single employee.');
        return {
          id,
          email: data.email ?? row.EMAIL,
          role: data.role ?? row.ROLE,
        };
      });
    } catch (error) {
      const failure = error as { errorNum?: number; message?: string } | null;
      if (
        failure?.errorNum === 1 &&
        /\bUQ_EMPLOYEES_EMAIL\b/u.test(failure.message ?? '')
      ) {
        throw new ConflictException(
          'El correo electrónico ya está registrado para otro empleado.',
        );
      }
      if (failure?.errorNum === 2291)
        throw new BadRequestException('El distrito de la dirección no existe.');
      throw error;
    }
  }

  async findEmployeeDetailById(id: number): Promise<EmployeeDetailDto | null> {
    const result = await this.db.query<{
      ID: number;
      FIRST_NAME: string;
      SECOND_NAME: string | null;
      FIRST_SURNAME: string;
      SECOND_SURNAME: string;
      BIRTHDAY: string;
      PHONE_NUMBER: string;
      EMAIL: string;
      ROLE: UserRole.EMPLOYEE | UserRole.ADMINISTRATOR;
      BRANCH_ID: number;
      BRANCH_NAME: string;
      CREATED_AT: string | null;
      HIRE_DATE: string | null;
      ADDRESS_ID: number | null;
      ADDRESS_DETAILS: string | null;
      DISTRICT_ID: number;
      DISTRICT_NAME: string;
      CANTON_ID: number;
      CANTON_NAME: string;
      PROVINCE_ID: number;
      PROVINCE_NAME: string;
    }>(
      `SELECT e.EMPLOYEE_ID AS ID, e.FIRST_NAME, e.SECOND_NAME, e.FIRST_SURNAME, e.SECOND_SURNAME,
              TO_CHAR(e.BIRTHDAY, 'YYYY-MM-DD') AS BIRTHDAY, e.PHONE_NUMBER, e.EMAIL,
              e.ROLE, e.BRANCH_ID, b.NAME AS BRANCH_NAME,
              TO_CHAR(e.HIRE_DATE, 'YYYY-MM-DD') AS HIRE_DATE,
              TO_CHAR(e.CREATED_AT AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"') AS CREATED_AT,
              a.ID_ADDRESS AS ADDRESS_ID, a.DETAILS AS ADDRESS_DETAILS,
              d.ID_DISTRICT AS DISTRICT_ID, d.NAME AS DISTRICT_NAME,
              k.ID_CANTON AS CANTON_ID, k.NAME AS CANTON_NAME,
              p.ID_PROVINCE AS PROVINCE_ID, p.NAME AS PROVINCE_NAME
       FROM EMPLOYEES e
       JOIN CINEMAS b ON b.BRANCH_ID = e.BRANCH_ID
       LEFT JOIN ADDRESSES a ON a.ID_ADDRESS = e.ID_ADDRESS
       LEFT JOIN DISTRICTS d ON d.ID_DISTRICT = a.ID_DISTRICT
       LEFT JOIN CANTONS k ON k.ID_CANTON = d.ID_CANTON
       LEFT JOIN PROVINCES p ON p.ID_PROVINCE = k.ID_PROVINCE
       WHERE e.EMPLOYEE_ID = :id AND e.STATUS = 'ACTIVE'`,
      { id: { val: id, type: oracle.NUMBER } },
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return {
      id: row.ID,
      role: row.ROLE,
      firstName: row.FIRST_NAME,
      secondName: row.SECOND_NAME,
      firstSurname: row.FIRST_SURNAME,
      secondSurname: row.SECOND_SURNAME,
      birthday: row.BIRTHDAY,
      phoneNumber: row.PHONE_NUMBER,
      email: row.EMAIL,
      createdAt: row.CREATED_AT,
      branchId: row.BRANCH_ID,
      branchName: row.BRANCH_NAME,
      hireDate: row.HIRE_DATE,
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

  async getEmployeeListOptions(): Promise<EmployeeListOptionsDto> {
    const result = await this.db.query<{ BRANCH_ID: number; NAME: string }>(
      'SELECT BRANCH_ID, NAME FROM CINEMAS ORDER BY NAME, BRANCH_ID',
    );
    return {
      branches: (result.rows ?? []).map((row) => ({
        id: row.BRANCH_ID,
        label: row.NAME,
      })),
    };
  }

  async listEmployees(
    query: ListEmployeesQueryDto,
  ): Promise<ListedUsersDto<ListedEmployeeDto>> {
    const name =
      "REGEXP_REPLACE(TRIM(e.FIRST_NAME || ' ' || e.SECOND_NAME || ' ' || e.FIRST_SURNAME || ' ' || e.SECOND_SURNAME), '[[:space:]]+', ' ')";
    const conditions: string[] = ["e.STATUS = 'ACTIVE'"];
    const binds: oracle.BindParameters = {};
    if (query.search) {
      conditions.push(buildUserSearch(query.search, 'employees', name, binds));
    }
    if (query.role?.length) {
      const parameters = query.role.map((role, index) => {
        binds[`role${index}`] = { val: role, type: oracle.STRING };
        return `:role${index}`;
      });
      conditions.push(`e.ROLE IN (${parameters.join(', ')})`);
    }
    if (query.branchId?.length) {
      const parameters = query.branchId.map((branchId, index) => {
        binds[`branchId${index}`] = { val: branchId, type: oracle.NUMBER };
        return `:branchId${index}`;
      });
      conditions.push(`e.BRANCH_ID IN (${parameters.join(', ')})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const from = `FROM EMPLOYEES e JOIN CINEMAS b ON b.BRANCH_ID = e.BRANCH_ID ${where}`;
    const count = await this.db.query<{ TOTAL: number }>(
      `SELECT COUNT(*) AS TOTAL ${from}`,
      binds,
    );
    const total = count.rows?.[0]?.TOTAL ?? 0;
    const totalPages = Math.ceil(total / query.pageSize);
    const page = Math.min(query.page, Math.max(1, totalPages));
    if (total === 0)
      return { items: [], total, page, pageSize: query.pageSize, totalPages };
    const sort =
      {
        id: 'e.EMPLOYEE_ID',
        name,
        email: 'LOWER(e.EMAIL)',
        createdAt: 'e.CREATED_AT',
        hireDate: 'e.HIRE_DATE',
        role: 'e.ROLE',
        branch: 'LOWER(b.NAME)',
      }[query.sortBy] ?? 'e.EMPLOYEE_ID';
    const result = await this.db.query<{
      ID: number;
      NAME: string;
      EMAIL: string;
      PHONE_NUMBER: string;
      CREATED_AT: string | null;
      ROLE: UserRole.EMPLOYEE | UserRole.ADMINISTRATOR;
      BRANCH_ID: number;
      BRANCH_NAME: string;
      HIRE_DATE: string | null;
    }>(
      `SELECT e.EMPLOYEE_ID AS ID, ${name} AS NAME, e.EMAIL, e.PHONE_NUMBER,
              TO_CHAR(e.CREATED_AT AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"') AS CREATED_AT,
              e.ROLE, e.BRANCH_ID, b.NAME AS BRANCH_NAME, TO_CHAR(e.HIRE_DATE, 'YYYY-MM-DD') AS HIRE_DATE
       ${from}
       ORDER BY ${sort} ${query.sortDirection === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, e.EMPLOYEE_ID ASC
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
        role: row.ROLE,
        branchId: row.BRANCH_ID,
        branchName: row.BRANCH_NAME,
        hireDate: row.HIRE_DATE,
      })),
      total,
      page,
      pageSize: query.pageSize,
      totalPages,
    };
  }

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
       WHERE LOWER(TRIM(e.EMAIL)) = :email AND e.STATUS = 'ACTIVE'
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
    'id' | 'role' | 'firstName' | 'email'
  > | null> {
    const result = await this.db.query<{
      EMPLOYEE_ID: unknown;
      ROLE: unknown;
      FIRST_NAME: unknown;
      EMAIL: unknown;
    }>(
      "SELECT EMPLOYEE_ID, ROLE, FIRST_NAME, EMAIL FROM EMPLOYEES WHERE EMPLOYEE_ID = :employeeId AND STATUS = 'ACTIVE'",
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
      !row.FIRST_NAME.trim() ||
      typeof row.EMAIL !== 'string' ||
      !row.EMAIL.trim()
    ) {
      return null;
    }
    return {
      id: row.EMPLOYEE_ID,
      role: row.ROLE,
      firstName: row.FIRST_NAME,
      email: row.EMAIL,
    };
  }

  async createEmployee(data: CreateEmployeeRecord): Promise<number> {
    try {
      return await this.db.transaction(async (connection) => {
        const addressId = await this.insertAddress(connection, data.address);
        const result = await connection.execute<{ employeeId?: unknown }>(
          `INSERT INTO EMPLOYEES (
          FIRST_NAME, SECOND_NAME, FIRST_SURNAME, SECOND_SURNAME,
          BIRTHDAY, PHONE_NUMBER, EMAIL, ROLE, ID_ADDRESS, BRANCH_ID, HIRE_DATE
        ) VALUES (
          :firstName, :secondName, :firstSurname, :secondSurname,
          TO_DATE(:birthday, 'FXYYYY-MM-DD'), :phoneNumber, :email, :role,
          :addressId, :branchId, TO_DATE(:hireDate, 'FXYYYY-MM-DD')
        ) RETURNING EMPLOYEE_ID INTO :employeeId`,
          {
            firstName: { val: data.firstName, type: oracle.STRING },
            secondName: { val: data.secondName ?? null, type: oracle.STRING },
            firstSurname: { val: data.firstSurname, type: oracle.STRING },
            secondSurname: { val: data.secondSurname, type: oracle.STRING },
            birthday: { val: data.birthday, type: oracle.STRING },
            hireDate: { val: data.hireDate, type: oracle.STRING },
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
    } catch (error) {
      const failure = error as { errorNum?: number; message?: string } | null;
      if (
        failure?.errorNum === 1 &&
        /\bUQ_EMPLOYEES_EMAIL\b/u.test(failure.message ?? '')
      ) {
        throw new ConflictException(
          'El correo electrónico ya está registrado para otro empleado.',
        );
      }
      throw error;
    }
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

  async findEmployeeCredentialsStatus(
    employeeId: number,
  ): Promise<{ setAt: Date; expirationDays: number } | null> {
    const result = await this.db.query<{
      PASSWORD_SET_AT: Date;
      EXPIRATION_DAYS: number;
    }>(
      `SELECT PASSWORD_SET_AT, EXPIRATION_DAYS FROM EMPLOYEE_LOCAL_CREDENTIALS WHERE EMPLOYEE_ID = :employeeId`,
      { employeeId: { val: employeeId, type: oracle.NUMBER } },
      { outFormat: oracle.OUT_FORMAT_OBJECT },
    );
    const row = result.rows?.[0];
    if (!row) {
      // Employee always has local credentials because they are created in a transactionwith the employee record.
      throw new Error(`Employee ${employeeId} is missing local credentials.`);
    }
    return { setAt: row.PASSWORD_SET_AT, expirationDays: row.EXPIRATION_DAYS };
  }

  async findEmployeePasswordCredentials(
    employeeId: number,
  ): Promise<{
    email: string;
    firstName: string;
    passwordHash: string;
  } | null> {
    const result = await this.db.query<{
      EMAIL: unknown;
      FIRST_NAME: unknown;
      PASSWORD_HASH: unknown;
    }>(
      `SELECT e.EMAIL, e.FIRST_NAME, c.PASSWORD_HASH
         FROM EMPLOYEES e
         JOIN EMPLOYEE_LOCAL_CREDENTIALS c ON c.EMPLOYEE_ID = e.EMPLOYEE_ID
        WHERE e.EMPLOYEE_ID = :employeeId AND e.STATUS = 'ACTIVE'`,
      { employeeId: { val: employeeId, type: oracle.NUMBER } },
      { outFormat: oracle.OUT_FORMAT_OBJECT },
    );
    const row = result.rows?.[0];
    if (!row) return null;
    if (
      typeof row.EMAIL !== 'string' ||
      !row.EMAIL.trim() ||
      typeof row.FIRST_NAME !== 'string' ||
      !row.FIRST_NAME.trim() ||
      typeof row.PASSWORD_HASH !== 'string' ||
      !row.PASSWORD_HASH.trim()
    ) {
      throw new Error('Oracle returned invalid employee password credentials.');
    }
    return {
      email: row.EMAIL,
      firstName: row.FIRST_NAME,
      passwordHash: row.PASSWORD_HASH,
    };
  }

  async saveEmployeePassword(
    employeeId: number,
    passwordHash: string,
    salt: string,
    expirationDays: number,
  ): Promise<void> {
    const result = await this.db.query(
      `UPDATE EMPLOYEE_LOCAL_CREDENTIALS
          SET PASSWORD_HASH = :passwordHash,
              SALT = :salt,
              PASSWORD_SET_AT = SYSTIMESTAMP,
              EXPIRATION_DAYS = :expirationDays
        WHERE EMPLOYEE_ID = :employeeId
          AND EXISTS (
            SELECT 1 FROM EMPLOYEES
             WHERE EMPLOYEE_ID = :employeeId AND STATUS = 'ACTIVE'
          )`,
      {
        employeeId: { val: employeeId, type: oracle.NUMBER },
        passwordHash: { val: passwordHash, type: oracle.STRING },
        salt: { val: salt, type: oracle.STRING },
        expirationDays: { val: expirationDays, type: oracle.NUMBER },
      },
    );
    if (result.rowsAffected !== 1) {
      throw new Error('Oracle did not update a single employee password.');
    }
  }
}
