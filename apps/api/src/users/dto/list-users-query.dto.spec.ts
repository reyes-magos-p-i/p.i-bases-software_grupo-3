import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ListClientsQueryDto,
  ListEmployeesQueryDto,
} from './list-users-query.dto';

describe('User list queries', () => {
  it('defaults to a bounded first page and stable ID ordering', async () => {
    const query = plainToInstance(ListClientsQueryDto, {});
    expect(await validate(query)).toEqual([]);
    expect(query).toMatchObject({
      page: 1,
      pageSize: 10,
      sortBy: 'id',
      sortDirection: 'asc',
    });
  });
  it('normalizes full names and converts only integer query strings', async () => {
    const query = plainToInstance(ListEmployeesQueryDto, {
      search: '  Ana   María Núñez  ',
      page: '2',
      pageSize: '25',
      branchId: '3',
      role: 'ADMINISTRATOR',
      sortBy: 'hireDate',
      sortDirection: 'desc',
    });
    expect(await validate(query)).toEqual([]);
    expect(query).toMatchObject({
      search: 'Ana María Núñez',
      page: 2,
      pageSize: 25,
      branchId: [3],
      role: ['ADMINISTRATOR'],
    });
  });
  it('accepts comma-separated filters and converts each branch independently', async () => {
    const query = plainToInstance(ListEmployeesQueryDto, {
      role: 'EMPLOYEE, ADMINISTRATOR',
      branchId: '3, 5',
    });
    expect(await validate(query)).toEqual([]);
    expect(query.role).toEqual(['EMPLOYEE', 'ADMINISTRATOR']);
    expect(query.branchId).toEqual([3, 5]);
  });
  it('accepts repeated query parameters as arrays', async () => {
    const query = plainToInstance(ListEmployeesQueryDto, {
      role: ['EMPLOYEE', 'ADMINISTRATOR'],
      branchId: ['3', '5'],
    });
    expect(await validate(query)).toEqual([]);
    expect(query.branchId).toEqual([3, 5]);
  });
  it.each(['hireDate', 'role', 'branch'])(
    'allows employee sorting by %s but rejects it for clients',
    async (sortBy) => {
      expect(
        await validate(plainToInstance(ListEmployeesQueryDto, { sortBy })),
      ).toEqual([]);
      expect(
        await validate(plainToInstance(ListClientsQueryDto, { sortBy })),
      ).not.toEqual([]);
    },
  );
  it.each([
    { search: '' },
    { search: '   ' },
    { search: ['Ana', 'María'] },
    { search: 12 },
    { search: '\ud800' },
    { search: 'é'.repeat(201) },
    { search: 'Ana\u0000' },
    { search: 'Ana\u0085María' },
    { page: '1.5' },
    { page: '1e2' },
    { page: '0' },
    { page: '-1' },
    { page: '1000001' },
    { pageSize: '500' },
    { sortBy: 'id; DROP TABLE CLIENTS' },
    { sortDirection: 'DESC' },
    { branchId: '1.5' },
    { branchId: '0' },
    { branchId: '9007199254740992' },
    { role: 'CLIENT' },
    { role: '' },
    { role: 'EMPLOYEE,CLIENT' },
    { role: 'EMPLOYEE,EMPLOYEE' },
    { role: [] },
    { role: ['EMPLOYEE', 'ADMINISTRATOR', 'EMPLOYEE'] },
    { role: 1 },
    { branchId: '' },
    { branchId: '3,' },
    { branchId: '3,3' },
    { branchId: '3,1e2' },
    { branchId: '3,0' },
    { branchId: '3,9007199254740992' },
    { branchId: [] },
    { branchId: [3, {}] },
    { branchId: Array.from({ length: 1001 }, (_, index) => index + 1) },
  ])('rejects an invalid query %p', async (payload) => {
    expect(
      await validate(plainToInstance(ListEmployeesQueryDto, payload)),
    ).not.toEqual([]);
  });
  it('preserves literal wildcards and names accepted by the creation contract', async () => {
    expect(
      await validate(
        plainToInstance(ListClientsQueryDto, { search: "O'Connor 100%_" }),
      ),
    ).toEqual([]);
  });
});
