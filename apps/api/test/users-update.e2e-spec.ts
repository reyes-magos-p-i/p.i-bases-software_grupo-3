import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

// Compiled decorators preserve the DTO metadata used by the production validation pipe.
const runtime = process
  .getBuiltinModule('node:module')
  .createRequire(__filename);
const { Test } = runtime('@nestjs/testing') as typeof import('@nestjs/testing');
const { ValidationPipe, NotFoundException, ConflictException } = runtime(
  '@nestjs/common',
) as typeof import('@nestjs/common');
const { ConfigModule, ConfigService } = runtime(
  '@nestjs/config',
) as typeof import('@nestjs/config');
const { JwtService } = runtime('@nestjs/jwt') as typeof import('@nestjs/jwt');
const { AuthModule } = runtime(
  '../dist/auth/auth.module.js',
) as typeof import('../src/auth/auth.module');
const { UsersUpdateController } = runtime(
  '../dist/users/users-update.controller.js',
) as typeof import('../src/users/users-update.controller');
const { UsersService } = runtime(
  '../dist/users/users.service.js',
) as typeof import('../src/users/users.service');
const { UsersRepository } = runtime(
  '../dist/users/users.repository.js',
) as typeof import('../src/users/users.repository');
const { ClientsRepository } = runtime(
  '../dist/clients/clients.repository.js',
) as typeof import('../src/clients/clients.repository');
const { ClientsService } = runtime(
  '../dist/clients/clients.service.js',
) as typeof import('../src/clients/clients.service');
const { DatabaseService } = runtime(
  '../dist/database/database.service.js',
) as typeof import('../src/database/database.service');
const { PasswordGenerator } = runtime(
  '../dist/common/security/password-generator.js',
) as typeof import('../src/common/security/password-generator');
const { PasswordHasher } = runtime(
  '../dist/common/security/password-hasher.js',
) as typeof import('../src/common/security/password-hasher');
const { InitialCredentialsSender } = runtime(
  '../dist/users/notifications/initial-credentials-sender.js',
) as typeof import('../src/users/notifications/initial-credentials-sender');
const { EMPLOYEE_SESSION_COOKIE } = runtime(
  '../dist/auth/employee-session.service.js',
) as typeof import('../src/auth/employee-session.service');

describe('Compiled user updates', () => {
  let app: INestApplication<App>;
  let jwt: InstanceType<typeof JwtService>;
  const origin = 'http://localhost:5173';
  const repository = {
    findEmployeeIdentityById: jest.fn(),
    updateEmployee: jest.fn(),
    getCreationOptions: jest.fn(),
  };
  const clientsRepository = { updateClient: jest.fn() };
  const clients = { findById: jest.fn() };
  const generator = { generate: jest.fn() };
  const hasher = { hash: jest.fn() };
  const sender = { send: jest.fn() };
  const patch = (section = 'clients', id = '42') =>
    request(app.getHttpServer())
      .patch(`/api/users/${section}/${id}`)
      .set('Origin', origin)
      .set(
        'Cookie',
        `${EMPLOYEE_SESSION_COOKIE}=${jwt.sign({ sub: 21, type: 'employee' })}`,
      );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
      ],
      controllers: [UsersUpdateController],
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repository },
        { provide: ClientsRepository, useValue: clientsRepository },
        { provide: PasswordGenerator, useValue: generator },
        { provide: PasswordHasher, useValue: hasher },
        { provide: InitialCredentialsSender, useValue: sender },
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => ({ NODE_ENV: 'test', FRONTEND_URL: origin })[key],
        getOrThrow: () => 'update-test-secret',
      })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(UsersRepository)
      .useValue(repository)
      .overrideProvider(ClientsRepository)
      .useValue(clientsRepository)
      .overrideProvider(ClientsService)
      .useValue(clients)
      .compile();
    jwt = module.get(JwtService);
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    repository.findEmployeeIdentityById.mockResolvedValue({
      id: 21,
      role: 'ADMINISTRATOR',
      firstName: 'Ana',
    });
    clients.findById.mockResolvedValue({ id: 99, firstName: 'Cliente' });
    clientsRepository.updateClient.mockResolvedValue({
      id: 42,
      email: 'ana@example.com',
      role: 'CLIENT',
    });
    repository.updateEmployee.mockResolvedValue({
      id: 42,
      email: 'ana@example.com',
      role: 'EMPLOYEE',
    });
    repository.getCreationOptions.mockResolvedValue({
      provinces: [],
      cantons: [],
      districts: [],
      branches: [{ id: 1 }],
    });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('normalizes a partial update and does not touch credentials', async () => {
    await patch()
      .send({ email: ' ANA@Example.com ', phoneNumber: '+506 8888-8888' })
      .expect(200);
    expect(clientsRepository.updateClient).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        email: 'ana@example.com',
        phoneNumber: '88888888',
      }),
    );
    expect(generator.generate).not.toHaveBeenCalled();
    expect(hasher.hash).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });
  it('allows employees to edit clients while rejecting staff editing', async () => {
    repository.findEmployeeIdentityById.mockResolvedValue({
      id: 21,
      role: 'EMPLOYEE',
      firstName: 'Ana',
    });
    await patch().send({ phoneNumber: null, address: null }).expect(200);
    await patch('employees').send({ email: 'ana@example.com' }).expect(403);
    expect(repository.updateEmployee).not.toHaveBeenCalled();
  });
  it('allows administrators to change the staff role', async () => {
    await patch('employees').send({ role: 'ADMINISTRATOR' }).expect(200);
    expect(repository.updateEmployee).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ role: 'ADMINISTRATOR' }),
    );
  });
  it.each(['clients', 'employees'])(
    'accepts partial name changes for %s',
    async (section) => {
      await patch(section)
        .send({
          firstName: ' María ',
          secondName: '',
          firstSurname: ' Núñez ',
          secondSurname: ' Rojas ',
        })
        .expect(200);
      const update =
        section === 'clients'
          ? clientsRepository.updateClient
          : repository.updateEmployee;
      expect(update).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          firstName: 'María',
          secondName: null,
          firstSurname: 'Núñez',
          secondSurname: 'Rojas',
        }),
      );
      const data = update.mock.calls[0][1] as {
        email?: unknown;
        role?: unknown;
      };
      expect(data.email).toBeUndefined();
      expect(data.role).toBeUndefined();
    },
  );
  it('accepts a staff branch change for administrators', async () => {
    await patch('employees').send({ branchId: 6 }).expect(200);
    expect(repository.updateEmployee).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ branchId: 6 }),
    );
  });
  it.each([
    { firstName: '' },
    { firstName: null },
    { firstSurname: null },
    { secondSurname: ' ' },
    { secondName: 'é'.repeat(51) },
  ])('rejects invalid staff name changes %p', async (body) => {
    await patch('employees').send(body).expect(400);
    expect(repository.updateEmployee).not.toHaveBeenCalled();
  });
  it('returns address-only catalogs for an employee', async () => {
    repository.findEmployeeIdentityById.mockResolvedValue({
      id: 21,
      role: 'EMPLOYEE',
      firstName: 'Ana',
    });
    const response = await request(app.getHttpServer())
      .get('/api/users/edit-options')
      .set(
        'Cookie',
        `${EMPLOYEE_SESSION_COOKIE}=${jwt.sign({ sub: 21, type: 'employee' })}`,
      )
      .expect(200);
    expect(response.body).toEqual({
      provinces: [],
      cantons: [],
      districts: [],
    });
  });
  it.each([
    'birthday',
    'hireDate',
    'createdAt',
    'branchId',
    'gender',
    'password',
    'role',
  ])('rejects unsupported client field %s', async (field) => {
    await patch()
      .send({ email: 'ana@example.com', [field]: 'changed' })
      .expect(400);
    expect(clientsRepository.updateClient).not.toHaveBeenCalled();
  });
  it.each([
    { role: 'CLIENT' },
    { phoneNumber: null },
    { address: null },
    { email: null },
    { address: { districtId: 7, details: 'é'.repeat(128) } },
    { address: { districtId: 0 } },
    { phoneNumber: '22222222' },
    {},
  ])('rejects invalid employee update %p', async (body) => {
    await patch('employees').send(body).expect(400);
    expect(repository.updateEmployee).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '1.5', 'ADM42', '9007199254740992'])(
    'rejects malformed selected ID %s',
    async (id) => {
      await patch('employees', id).send({ role: 'EMPLOYEE' }).expect(400);
      expect(repository.updateEmployee).not.toHaveBeenCalled();
    },
  );
  it('requires an authenticated staff session', async () => {
    await request(app.getHttpServer())
      .patch('/api/users/clients/42')
      .set('Origin', origin)
      .send({ email: 'ana@example.com' })
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/users/clients/42')
      .set('Origin', origin)
      .set('Authorization', `Bearer ${jwt.sign({ sub: 99, type: 'client' })}`)
      .send({ email: 'ana@example.com' })
      .expect(403);
    expect(clientsRepository.updateClient).not.toHaveBeenCalled();
  });
  it.each([undefined, 'https://external.example'])(
    'rejects missing or foreign origin %p',
    async (value) => {
      const call = patch();
      if (value) call.set('Origin', value);
      else call.unset('Origin');
      await call.send({ phoneNumber: null }).expect(403);
      expect(clientsRepository.updateClient).not.toHaveBeenCalled();
    },
  );
  it('reports missing users and duplicate emails', async () => {
    clientsRepository.updateClient.mockRejectedValueOnce(
      new NotFoundException('El usuario seleccionado no existe.'),
    );
    const missingUser = await patch()
      .send({ email: 'ana@example.com' })
      .expect(404);
    expect(missingUser.body).toMatchObject({
      statusCode: 404,
      message: 'El usuario seleccionado no existe.',
    });
    clientsRepository.updateClient.mockRejectedValueOnce(
      new ConflictException('El correo electrónico ya está registrado.'),
    );
    const duplicateEmail = await patch()
      .send({ email: 'ana@example.com' })
      .expect(409);
    expect(duplicateEmail.body).toMatchObject({
      statusCode: 409,
      message: 'El correo electrónico ya está registrado.',
    });
  });
  it('does not expose unexpected persistence failures', async () => {
    clientsRepository.updateClient.mockRejectedValueOnce(
      new Error('private database details'),
    );
    const response = await patch().send({ phoneNumber: null }).expect(500);
    expect(response.text).not.toContain('private database details');
  });
});
