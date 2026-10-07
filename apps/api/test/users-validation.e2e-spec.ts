import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { CreateClientDto } from '../src/users/dto/create-client.dto';
import type { CreateEmployeeDto } from '../src/users/dto/create-employee.dto';

// Load the build without Jest's transformer to exercise production decorator metadata.
const runtime = process
  .getBuiltinModule('node:module')
  .createRequire(__filename);
const { Test } = runtime('@nestjs/testing') as typeof import('@nestjs/testing');
const { ValidationPipe } = runtime(
  '@nestjs/common',
) as typeof import('@nestjs/common');
const { ConfigModule, ConfigService } = runtime(
  '@nestjs/config',
) as typeof import('@nestjs/config');
const { JwtService } = runtime('@nestjs/jwt') as typeof import('@nestjs/jwt');
const { AuthModule } = runtime(
  '../dist/auth/auth.module.js',
) as typeof import('../src/auth/auth.module');
const { EmailVerificationSender } = runtime(
  '../dist/auth/notifications/email-verification-sender.js',
) as typeof import('../src/auth/notifications/email-verification-sender');
const { UsersController } = runtime(
  '../dist/users/users.controller.js',
) as typeof import('../src/users/users.controller');
const { UsersService } = runtime(
  '../dist/users/users.service.js',
) as typeof import('../src/users/users.service');
const { UsersRepository } = runtime(
  '../dist/users/users.repository.js',
) as typeof import('../src/users/users.repository');
const { DatabaseService } = runtime(
  '../dist/database/database.service.js',
) as typeof import('../src/database/database.service');
const { CreateUserValidationPipe } = runtime(
  '../dist/users/pipes/create-user-validation.pipe.js',
) as typeof import('../src/users/pipes/create-user-validation.pipe');
const { EMPLOYEE_SESSION_COOKIE } = runtime(
  '../dist/auth/employee-session.service.js',
) as typeof import('../src/auth/employee-session.service');

describe('Compiled user creation validation', () => {
  let app: INestApplication<App>;
  let browser: ReturnType<typeof request.agent>;
  const origin = 'http://localhost:5173';
  const service = { create: jest.fn() };
  const repository = {
    findEmployeeIdentityById: jest.fn(),
    findEmployeeCredentialsStatus: jest.fn(),
  };
  const client = {
    role: 'CLIENT',
    email: 'client@example.com',
    firstName: 'Ana',
  };
  const employee = {
    role: 'EMPLOYEE',
    email: 'employee@example.com',
    firstName: 'Ana',
    firstSurname: 'Solano',
    secondSurname: 'Rojas',
    hireDate: '2026-10-01',
    birthday: '2000-02-29',
    phoneNumber: '88888888',
    branchId: 1,
    address: { districtId: 7, details: 'Casa azul' },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
      ],
      controllers: [UsersController],
      providers: [
        CreateUserValidationPipe,
        { provide: UsersService, useValue: service },
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => ({ FRONTEND_URL: origin, NODE_ENV: 'test' })[key],
        getOrThrow: () => 'compiled-validation-test-secret',
      })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(EmailVerificationSender)
      .useValue({ send: jest.fn() })
      .overrideProvider(UsersRepository)
      .useValue(repository)
      .compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    browser = request
      .agent(app.getHttpServer())
      .set('Origin', origin)
      .set(
        'Cookie',
        `${EMPLOYEE_SESSION_COOKIE}=${module.get(JwtService).sign({ sub: 21, type: 'employee' })}`,
      );
  });

  beforeEach(() => {
    repository.findEmployeeIdentityById
      .mockReset()
      .mockResolvedValue({ id: 21, role: 'ADMINISTRATOR', firstName: 'Ana' });
    repository.findEmployeeCredentialsStatus
      .mockReset()
      .mockResolvedValue({ setAt: new Date(), expirationDays: 90 });
    service.create
      .mockReset()
      .mockImplementation((data: CreateClientDto | CreateEmployeeDto) =>
        Promise.resolve({ id: 42, role: data.role, email: data.email }),
      );
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([client, employee, { ...employee, role: 'ADMINISTRATOR' }])(
    'accepts a valid $role through both pipes in the compiled application',
    async (body) => {
      await browser
        .post('/api/users')
        .send(body)
        .expect(201, { id: 42, role: body.role, email: body.email });
      expect(service.create).toHaveBeenCalledTimes(1);
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining(body),
      );
    },
  );

  it.each([
    { ...client, email: 'invalid' },
    { ...client, phoneNumber: '22222222' },
    { ...employee, phoneNumber: '+1 88888888' },
    { ...employee, branchId: 0 },
    { ...employee, branchId: '1' },
    { ...employee, hireDate: undefined },
    { ...employee, hireDate: '2026-02-30' },
    { ...employee, hireDate: '0000-01-01' },
    { ...employee, address: { districtId: '7' } },
    { ...employee, address: { districtId: 0 } },
    { ...client, role: 'UNKNOWN' },
  ])('rejects invalid input before persistence: %p', async (body) => {
    const response = await browser.post('/api/users').send(body).expect(400);
    expect(response.body.error).toBe('Solicitud inválida');
    expect(service.create).not.toHaveBeenCalled();
  });

  it.each([
    { ...client, password: randomUUID() },
    { ...employee, passwordHash: randomUUID() },
    { ...employee, address: { districtId: 7, extra: 'not-allowed' } },
  ])('still rejects unexpected fields: %p', async (body) => {
    const response = await browser.post('/api/users').send(body).expect(400);
    expect(response.body.message).toEqual([
      'La solicitud contiene campos no permitidos.',
    ]);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('still rejects unauthenticated creation', async () => {
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Origin', origin)
      .send(client)
      .expect(401);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('still rejects creation by an employee', async () => {
    repository.findEmployeeIdentityById.mockResolvedValue({
      id: 21,
      role: 'EMPLOYEE',
      firstName: 'Ana',
    });
    await browser.post('/api/users').send(client).expect(403);
    expect(service.create).not.toHaveBeenCalled();
  });
});
