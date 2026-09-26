import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PasswordGenerator } from '../common/security/password-generator';
import { PasswordHasher } from '../common/security/password-hasher';
import type { CreateClientDto } from './dto/create-client.dto';
import type { CreateEmployeeDto } from './dto/create-employee.dto';
import { CreatedUserDto } from './dto/created-user.dto';
import { UserRole } from './enums/user-role.enum';
import { InitialCredentialsSender } from './notifications/initial-credentials-sender';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let module: TestingModule;
  let service: UsersService;
  const repository = {
    clientEmailExists: jest.fn(),
    createClient: jest.fn(),
    createEmployee: jest.fn(),
  };
  const generator = { generate: jest.fn() };
  const hasher = { hash: jest.fn() };
  const sender = { send: jest.fn() };
  const password = 'test-generated-password';
  const credentials = { passwordHash: 'test-hash', salt: 'test-salt' };
  const client: CreateClientDto = {
    role: UserRole.CLIENT,
    email: 'cliente@example.com',
    firstName: 'Ana',
    secondName: 'María',
    firstSurname: 'Núñez',
    secondSurname: 'Solano',
    birthday: '2000-02-29',
    phoneNumber: '88888888',
    address: { districtId: 7, details: 'Casa azul' },
    language: 'es',
  };
  const employee: CreateEmployeeDto = {
    role: UserRole.EMPLOYEE,
    email: 'empleado@example.com',
    firstName: 'José',
    secondName: null,
    firstSurname: 'Núñez',
    secondSurname: 'Solano',
    birthday: '2000-02-29',
    phoneNumber: '88888888',
    address: { districtId: 7, details: 'Casa azul' },
    branchId: 3,
  };
  const profiles = [
    client,
    employee,
    { ...employee, role: UserRole.ADMINISTRATOR },
  ] satisfies Array<CreateClientDto | CreateEmployeeDto>;

  beforeEach(async () => {
    jest.resetAllMocks();
    repository.clientEmailExists.mockResolvedValue(false);
    repository.createClient.mockResolvedValue(42);
    repository.createEmployee.mockResolvedValue(84);
    generator.generate.mockReturnValue(password);
    hasher.hash.mockResolvedValue(credentials);
    sender.send.mockResolvedValue(undefined);

    module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repository },
        { provide: PasswordGenerator, useValue: generator },
        { provide: PasswordHasher, useValue: hasher },
        { provide: InitialCredentialsSender, useValue: sender },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  afterEach(async () => {
    await module.close();
  });

  it.each(profiles)(
    'creates a $role and returns only public fields',
    async (profile) => {
      const response = await service.create(profile);
      const isClient = profile.role === UserRole.CLIENT;
      const create = isClient
        ? repository.createClient
        : repository.createEmployee;
      const unusedCreate = isClient
        ? repository.createEmployee
        : repository.createClient;
      const { role, ...clientFields } = profile;

      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({
        ...(isClient ? clientFields : profile),
        ...credentials,
      });
      expect(unusedCreate).not.toHaveBeenCalled();
      if (isClient) {
        expect(repository.clientEmailExists).toHaveBeenCalledWith(
          profile.email,
        );
        expect(
          repository.clientEmailExists.mock.invocationCallOrder[0],
        ).toBeLessThan(generator.generate.mock.invocationCallOrder[0]);
      } else {
        expect(repository.clientEmailExists).not.toHaveBeenCalled();
      }
      expect(generator.generate).toHaveBeenCalledTimes(1);
      expect(hasher.hash).toHaveBeenCalledTimes(1);
      expect(hasher.hash).toHaveBeenCalledWith(password);
      expect(sender.send).toHaveBeenCalledTimes(1);
      expect(sender.send).toHaveBeenCalledWith({
        email: profile.email,
        password,
      });
      expect(hasher.hash.mock.invocationCallOrder[0]).toBeLessThan(
        create.mock.invocationCallOrder[0],
      );
      expect(create.mock.invocationCallOrder[0]).toBeLessThan(
        sender.send.mock.invocationCallOrder[0],
      );
      expect(response).toBeInstanceOf(CreatedUserDto);
      expect({ ...response }).toEqual({
        id: isClient ? 42 : 84,
        role,
        email: profile.email,
      });
    },
  );

  it('preserves a null client address', async () => {
    await service.create({ ...client, address: null });
    expect(repository.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ address: null }),
    );
  });

  it.each(profiles)(
    'maps only allowed address fields for $role',
    async (profile) => {
      await service.create({
        ...profile,
        address: Object.assign(
          { districtId: 7, details: 'Casa azul' },
          { id: 999, privateField: 'secret' },
        ),
      });
      const create =
        profile.role === UserRole.CLIENT
          ? repository.createClient
          : repository.createEmployee;
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          address: { districtId: 7, details: 'Casa azul' },
        }),
      );
    },
  );

  it('creates a client with only the required profile fields', async () => {
    await expect(
      service.create({
        role: UserRole.CLIENT,
        email: client.email,
        firstName: client.firstName,
      }),
    ).resolves.toEqual(
      new CreatedUserDto({
        id: 42,
        role: UserRole.CLIENT,
        email: client.email,
      }),
    );
    expect(repository.createClient).toHaveBeenCalledWith({
      email: client.email,
      firstName: client.firstName,
      secondName: undefined,
      firstSurname: undefined,
      secondSurname: undefined,
      birthday: undefined,
      phoneNumber: undefined,
      address: undefined,
      language: undefined,
      ...credentials,
    });
  });

  it.each(profiles)(
    'ignores extra sensitive input fields for $role',
    async (profile) => {
      const supplied = {
        ...profile,
        password: 'caller-supplied-password',
        passwordHash: 'caller-supplied-hash',
        salt: 'caller-supplied-salt',
        internalData: 'not-part-of-the-contract',
      };
      const response = await service.create(supplied);
      const create =
        profile.role === UserRole.CLIENT
          ? repository.createClient
          : repository.createEmployee;
      expect(create.mock.calls[0][0]).not.toHaveProperty('password');
      expect(create.mock.calls[0][0]).not.toHaveProperty('internalData');
      expect(create.mock.calls[0][0]).toMatchObject(credentials);
      expect(hasher.hash).toHaveBeenCalledWith(password);
      expect(JSON.stringify(response)).not.toContain(password);
      expect(response).not.toHaveProperty('passwordHash');
      expect(response).not.toHaveProperty('salt');
    },
  );

  it('rejects an existing client email before generating credentials', async () => {
    repository.clientEmailExists.mockResolvedValue(true);
    await expect(service.create(client)).rejects.toThrow(
      new ConflictException('Ya existe un cliente con ese correo electrónico.'),
    );
    expect(generator.generate).not.toHaveBeenCalled();
    expect(hasher.hash).not.toHaveBeenCalled();
    expect(repository.createClient).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('propagates lookup failures without generating credentials', async () => {
    const error = new Error('Lookup failed');
    repository.clientEmailExists.mockRejectedValue(error);
    await expect(service.create(client)).rejects.toBe(error);
    expect(generator.generate).not.toHaveBeenCalled();
    expect(hasher.hash).not.toHaveBeenCalled();
    expect(repository.createClient).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it.each(profiles)(
    'stops when password generation fails for $role',
    async (profile) => {
      const error = new Error('Generation failed');
      generator.generate.mockImplementation(() => {
        throw error;
      });
      await expect(service.create(profile)).rejects.toBe(error);
      expect(hasher.hash).not.toHaveBeenCalled();
      expect(repository.createClient).not.toHaveBeenCalled();
      expect(repository.createEmployee).not.toHaveBeenCalled();
      expect(sender.send).not.toHaveBeenCalled();
    },
  );

  it.each(profiles)('stops when hashing fails for $role', async (profile) => {
    const error = new Error('Hashing failed');
    hasher.hash.mockRejectedValue(error);
    await expect(service.create(profile)).rejects.toBe(error);
    expect(repository.createClient).not.toHaveBeenCalled();
    expect(repository.createEmployee).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it.each(profiles)(
    'does not send credentials when persistence fails for $role',
    async (profile) => {
      const error = new Error('Persistence failed');
      repository.createClient.mockRejectedValue(error);
      repository.createEmployee.mockRejectedValue(error);
      await expect(service.create(profile)).rejects.toBe(error);
      expect(sender.send).not.toHaveBeenCalled();
    },
  );

  it.each(profiles)(
    'reports a persisted account when delivery fails for $role',
    async (profile) => {
      sender.send.mockRejectedValue(
        new Error('Mail failure with secret: ' + password),
      );
      const failure: unknown = await service
        .create(profile)
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(BadGatewayException);
      const exception = failure as BadGatewayException;
      expect(exception.getStatus()).toBe(502);
      expect(exception.message).toBe(
        'El usuario fue creado, pero no se pudo enviar el correo con sus credenciales.',
      );
      expect(JSON.stringify(exception.getResponse())).not.toContain(password);
      expect(repository.createClient).toHaveBeenCalledTimes(
        profile.role === UserRole.CLIENT ? 1 : 0,
      );
      expect(repository.createEmployee).toHaveBeenCalledTimes(
        profile.role === UserRole.CLIENT ? 0 : 1,
      );
      expect(sender.send).toHaveBeenCalledTimes(1);
    },
  );

  it('waits for persistence to finish before sending credentials', async () => {
    let finishCreation!: (id: number) => void;
    let notifyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    repository.createEmployee.mockImplementation(() => {
      notifyStarted();
      return new Promise<number>((resolve) => {
        finishCreation = resolve;
      });
    });
    const creation = service.create(employee);
    await started;
    expect(sender.send).not.toHaveBeenCalled();
    finishCreation(84);
    await creation;
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsupported role before performing any work', async () => {
    const profile = {
      ...employee,
      role: 'UNKNOWN',
    } as unknown as CreateEmployeeDto;
    await expect(service.create(profile)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.clientEmailExists).not.toHaveBeenCalled();
    expect(generator.generate).not.toHaveBeenCalled();
    expect(hasher.hash).not.toHaveBeenCalled();
    expect(repository.createClient).not.toHaveBeenCalled();
    expect(repository.createEmployee).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });
});
