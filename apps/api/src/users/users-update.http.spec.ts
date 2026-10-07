import {
  ConflictException,
  NotFoundException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthModule } from '../auth/auth.module';
import { EmailVerificationSender } from '../auth/notifications/email-verification-sender';
import { EMPLOYEE_SESSION_COOKIE } from '../auth/employee-session.service';
import { ClientsRepository } from '../clients/clients.repository';
import { ClientsService } from '../clients/clients.service';
import { DatabaseService } from '../database/database.service';
import { PasswordGenerator } from '../common/security/password-generator';
import { PasswordHasher } from '../common/security/password-hasher';
import { InitialCredentialsSender } from './notifications/initial-credentials-sender';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { UsersUpdateController } from './users-update.controller';

const secret = randomUUID();

describe('User update and deactivation HTTP contracts', () => {
  let app: INestApplication<App>;
  let jwt: InstanceType<typeof JwtService>;
  const origin = 'http://localhost:5173';
  const repository = {
    findEmployeeIdentityById: jest.fn(),
    findEmployeeCredentialsStatus: jest.fn(),
    updateEmployee: jest.fn(),
    deactivateEmployee: jest.fn(),
    getCreationOptions: jest.fn(),
  };
  const clientsRepository = {
    updateClient: jest.fn(),
    deactivateClient: jest.fn(),
  };
  const clients = {
    findById: jest.fn(),
    isEmailVerificationPending: jest.fn(),
    findPasswordStatus: jest.fn(),
  };
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
  const deactivate = (section = 'clients', id = '42') =>
    patch(section, id + '/deactivate');

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
        getOrThrow: () => secret,
      })
      .overrideProvider(DatabaseService)
      .useValue({})
      .overrideProvider(EmailVerificationSender)
      .useValue({ send: jest.fn() })
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
    repository.findEmployeeCredentialsStatus.mockResolvedValue({
      setAt: new Date(),
      expirationDays: 90,
    });
    clients.findById.mockResolvedValue({ id: 99, firstName: 'Cliente' });
    clients.isEmailVerificationPending.mockResolvedValue(false);
    clients.findPasswordStatus.mockResolvedValue({
      setAt: new Date(),
      expirationDays: 90,
    });
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

  describe('deactivation', () => {
    it.each(['ADMINISTRATOR', 'EMPLOYEE'])(
      'allows %s to deactivate clients without changing credentials',
      async (role) => {
        repository.findEmployeeIdentityById.mockResolvedValue({
          id: 21,
          role,
          firstName: 'Ana',
        });
        const response = await deactivate().send({}).expect(204);
        expect(response.text).toBe('');
        expect(clientsRepository.deactivateClient).toHaveBeenCalledWith(42);
        expect(generator.generate).not.toHaveBeenCalled();
        expect(hasher.hash).not.toHaveBeenCalled();
        expect(sender.send).not.toHaveBeenCalled();
      },
    );
    it('passes the authenticated administrator to staff deactivation', async () => {
      await deactivate('employees').expect(204);
      expect(repository.deactivateEmployee).toHaveBeenCalledWith(42, 21);
    });
    it('rejects employees on staff deactivation', async () => {
      repository.findEmployeeIdentityById.mockResolvedValue({
        id: 21,
        role: 'EMPLOYEE',
        firstName: 'Ana',
      });
      await deactivate('employees').expect(403);
      expect(repository.deactivateEmployee).not.toHaveBeenCalled();
    });
    it.each(['clients', 'employees'])(
      'rejects missing sessions and client tokens for %s',
      async (section) => {
        await deactivate(section).unset('Cookie').expect(401);
        await deactivate(section)
          .unset('Cookie')
          .set(
            'Authorization',
            `Bearer ${jwt.sign({ sub: 99, type: 'client' })}`,
          )
          .expect(403);
        expect(clientsRepository.deactivateClient).not.toHaveBeenCalled();
        expect(repository.deactivateEmployee).not.toHaveBeenCalled();
      },
    );
    it.each([undefined, 'https://external.example'])(
      'rejects origin %p before deactivation',
      async (originValue) => {
        const call = deactivate();
        if (originValue) call.set('Origin', originValue);
        else call.unset('Origin');
        await call.expect(403);
        expect(clientsRepository.deactivateClient).not.toHaveBeenCalled();
      },
    );
    it.each(['0', '-1', '1.5', 'ADM42', '9007199254740992'])(
      'rejects invalid target %s',
      async (id) => {
        await deactivate('clients', id).expect(400);
        expect(clientsRepository.deactivateClient).not.toHaveBeenCalled();
      },
    );
    it.each([
      { status: 'ACTIVE' },
      { actorId: 42 },
      { password: randomUUID() },
      [],
    ])('rejects a nonempty or invalid body %p', async (body) => {
      await deactivate().send(body).expect(400);
      expect(clientsRepository.deactivateClient).not.toHaveBeenCalled();
    });
    it.each(['clients', 'employees'])(
      'distinguishes missing and already inactive %s',
      async (section) => {
        const remove =
          section === 'clients'
            ? clientsRepository.deactivateClient
            : repository.deactivateEmployee;
        const name = section === 'clients' ? 'cliente' : 'empleado';
        remove.mockRejectedValueOnce(
          new NotFoundException(`El ${name} seleccionado no existe.`),
        );
        const missing = await deactivate(section).expect(404);
        expect(missing.body.message).toBe(`El ${name} seleccionado no existe.`);
        remove.mockRejectedValueOnce(
          new ConflictException(`El ${name} ya está desactivado.`),
        );
        const inactive = await deactivate(section).expect(409);
        expect(inactive.body.message).toBe(`El ${name} ya está desactivado.`);
      },
    );
    it.each([
      'No puedes desactivar tu propia cuenta.',
      'Debe permanecer al menos un administrador activo.',
    ])('preserves the protected-account conflict: %s', async (message) => {
      repository.deactivateEmployee.mockRejectedValueOnce(
        new ConflictException(message),
      );
      const response = await deactivate('employees').expect(409);
      expect(response.body.message).toBe(message);
    });
    it('rejects the same employee cookie when its identity is no longer active', async () => {
      await deactivate().expect(204);
      repository.findEmployeeIdentityById.mockResolvedValue(null);
      clientsRepository.deactivateClient.mockClear();
      await deactivate().expect(401);
      expect(clientsRepository.deactivateClient).not.toHaveBeenCalled();
    });
    it('keeps persistence errors private', async () => {
      clientsRepository.deactivateClient.mockRejectedValueOnce(
        new Error('Private Oracle details'),
      );
      const response = await deactivate().expect(500);
      expect(response.body).toEqual({
        statusCode: 500,
        message: 'Internal server error',
      });
      expect(response.text).not.toContain('Oracle');
    });
  });
});
