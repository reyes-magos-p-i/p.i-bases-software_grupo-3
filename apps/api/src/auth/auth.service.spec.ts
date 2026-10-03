import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PasswordHasher } from '../common/security/password-hasher';
import { AuthService } from './auth.service';
import { ClientsService } from '../clients/clients.service';
import { RegisterDto } from './dto/register.dto';
import { ConfigService } from '@nestjs/config';

jest.mock('argon2');
// mock for google lib
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(),
}));

import { UsersRepository } from '../users/users.repository';
import { UserRole } from '../users/enums/user-role.enum';
import type { EmployeeWithLocalCredentials } from '../users/types/employee-with-local-credentials.type';

const hasher = { hash: jest.fn(), verify: jest.fn() };
const salt = 'AAECAwQFBgcICQoLDA0ODw';

describe('AuthService', () => {
  let service: AuthService;
  let clients: {
    findByEmail: jest.Mock;
    createWithLocalCredentials: jest.Mock;
    findOrCreateSocial: jest.Mock; // for google auth
  };
  let jwt: { sign: jest.Mock; signAsync: jest.Mock };
  let users: { findEmployeeWithLocalCredentialsByEmail: jest.Mock };
  let config: { getOrThrow: jest.Mock };

  const registerDto: RegisterDto = {
    email: 'user@example.com',
    firstName: 'Ana Maria',
    lastName: 'Perez Mora',
    phone: '88881234',
    gender: 'F',
    birthDate: '2000-05-10',
    language: 'es',
    password: 'Abcdef1!',
    acceptTerms: true,
  };

  beforeEach(async () => {
    clients = {
      findByEmail: jest.fn(),
      createWithLocalCredentials: jest.fn(),
      findOrCreateSocial: jest.fn(),
    };
    jwt = {
      sign: jest.fn().mockReturnValue('signed-token'),
      signAsync: jest.fn().mockResolvedValue('employee-token'),
    };
    users = { findEmployeeWithLocalCredentialsByEmail: jest.fn() };
    config = { getOrThrow: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PasswordHasher, useValue: hasher },
        { provide: ClientsService, useValue: clients },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: UsersRepository, useValue: users },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    hasher.hash.mockResolvedValue({ passwordHash: 'hashed-password', salt });
    hasher.verify.mockReset().mockResolvedValue(true);
  });

  describe('register', () => {
    it('throws ConflictException when the email already exists', async () => {
      clients.findByEmail.mockResolvedValue({
        id: 1,
        email: registerDto.email,
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      expect(clients.createWithLocalCredentials).not.toHaveBeenCalled();
      expect(hasher.hash).not.toHaveBeenCalled();
    });

    it('splits first/last name and creates the client with a hashed password', async () => {
      clients.findByEmail.mockResolvedValue(null);
      clients.createWithLocalCredentials.mockResolvedValue({
        id: 5,
        email: registerDto.email,
      });

      const result = await service.register(registerDto);

      expect(hasher.hash).toHaveBeenCalledWith(registerDto.password);
      expect(clients.createWithLocalCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registerDto.email,
          firstName: 'Ana',
          secondName: 'Maria',
          firstSurname: 'Perez',
          secondSurname: 'Mora',
          birthday: registerDto.birthDate,
          phoneNumber: registerDto.phone,
        }),
        'hashed-password',
        'AAECAwQFBgcICQoLDA0ODw==',
      );
      expect(result).toEqual({ id: 5, email: registerDto.email });
    });
  });

  it('does not persist a client if hashing fails', async () => {
    clients.findByEmail.mockResolvedValue(null);
    const failure = new Error('Hashing unavailable');
    hasher.hash.mockRejectedValueOnce(failure);
    await expect(service.register(registerDto)).rejects.toBe(failure);
    expect(clients.createWithLocalCredentials).not.toHaveBeenCalled();
  });

  it('propagates a persistence conflict without retrying or issuing a token', async () => {
    clients.findByEmail.mockResolvedValue(null);
    clients.createWithLocalCredentials.mockRejectedValue(
      new ConflictException(),
    );
    await expect(service.register(registerDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(clients.createWithLocalCredentials).toHaveBeenCalledTimes(1);
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  describe('loginEmployee', () => {
    const dto = { email: 'staff@example.com', password: ' Staff password 🎬 ' };
    const employee: EmployeeWithLocalCredentials = {
      id: 21,
      role: UserRole.EMPLOYEE,
      email: dto.email,
      firstName: 'Ana',
      secondName: null,
      firstSurname: 'Solano',
      secondSurname: 'Rojas',
      passwordHash: 'stored-password-hash',
    };

    it.each([UserRole.EMPLOYEE, UserRole.ADMINISTRATOR])(
      'authenticates %s and returns an explicit profile without credentials',
      async (role) => {
        users.findEmployeeWithLocalCredentialsByEmail.mockResolvedValue({
          ...employee,
          role,
          salt: 'private-salt',
          privateField: 'must-not-escape',
        });
        await expect(service.loginEmployee(dto)).resolves.toEqual({
          accessToken: 'employee-token',
          user: {
            id: 21,
            role,
            email: dto.email,
            firstName: 'Ana',
            secondName: null,
            firstSurname: 'Solano',
            secondSurname: 'Rojas',
          },
        });
        expect(
          users.findEmployeeWithLocalCredentialsByEmail,
        ).toHaveBeenCalledTimes(1);
        expect(
          users.findEmployeeWithLocalCredentialsByEmail,
        ).toHaveBeenCalledWith(dto.email);
        expect(hasher.verify).toHaveBeenCalledTimes(1);
        expect(hasher.verify).toHaveBeenCalledWith(
          dto.password,
          employee.passwordHash,
        );
        expect(jwt.signAsync).toHaveBeenCalledTimes(1);
        expect(jwt.signAsync).toHaveBeenCalledWith({
          sub: 21,
          type: 'employee',
        });
        expect(hasher.hash).not.toHaveBeenCalled();
        expect(clients.findByEmail).not.toHaveBeenCalled();
        expect(clients.createWithLocalCredentials).not.toHaveBeenCalled();
      },
    );

    it.each([
      { account: employee, matches: false },
      { account: null, matches: false },
      { account: null, matches: true },
    ])(
      'returns the same 401 for invalid credentials: %p',
      async ({ account, matches }) => {
        users.findEmployeeWithLocalCredentialsByEmail.mockResolvedValue(
          account,
        );
        hasher.verify.mockResolvedValue(matches);
        const result = service.loginEmployee(dto);
        await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
        await expect(result).rejects.toMatchObject({
          response: {
            statusCode: 401,
            message: 'Correo o contraseña incorrectos',
            error: 'Unauthorized',
          },
        });
        expect(hasher.verify).toHaveBeenCalledTimes(1);
        expect(hasher.verify).toHaveBeenCalledWith(
          dto.password,
          account
            ? employee.passwordHash
            : expect.stringMatching(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/u),
        );
        expect(jwt.signAsync).not.toHaveBeenCalled();
        expect(jwt.sign).not.toHaveBeenCalled();
      },
    );

    it('propagates repository failures without verifying or signing', async () => {
      const failure = new Error('Database lookup failed');
      users.findEmployeeWithLocalCredentialsByEmail.mockRejectedValue(failure);
      await expect(service.loginEmployee(dto)).rejects.toBe(failure);
      expect(hasher.verify).not.toHaveBeenCalled();
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it.each([employee, null])(
      'propagates verifier failures without signing: %p',
      async (account) => {
        const failure = new Error('Password verification failed');
        users.findEmployeeWithLocalCredentialsByEmail.mockResolvedValue(
          account,
        );
        hasher.verify.mockRejectedValue(failure);
        await expect(service.loginEmployee(dto)).rejects.toBe(failure);
        expect(jwt.signAsync).not.toHaveBeenCalled();
      },
    );

    it('propagates signing failures without returning a successful login', async () => {
      const failure = new Error('Signing failed');
      users.findEmployeeWithLocalCredentialsByEmail.mockResolvedValue(employee);
      jwt.signAsync.mockRejectedValue(failure);
      await expect(service.loginEmployee(dto)).rejects.toBe(failure);
      expect(jwt.signAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('issueToken', () => {
    it('signs a payload with type: client', () => {
      const result = service.issueToken({ id: 9, email: 'x@y.com' } as never);

      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 9,
        email: 'x@y.com',
        type: 'client',
      });
      expect(result).toEqual({ accessToken: 'signed-token' });
    });
  });

  describe('facebookLogin', () => {
    const accessToken = 'facebook-user-token';

    beforeEach(() => {
      config.getOrThrow.mockImplementation((key: string) => {
        const values = {
          FACEBOOK_APP_ID: 'facebook-app-id',
          FACEBOOK_APP_SECRET: 'facebook-app-secret',
        };
        return values[key as keyof typeof values];
      });
    });

    it('verifies the token, loads the profile, persists the social client, and issues a JWT', async () => {
      const fetchMock = jest.spyOn(global, 'fetch');
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              app_id: 'facebook-app-id',
              user_id: 'facebook-user-id',
              is_valid: true,
            },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'facebook-user-id',
            email: 'facebook@example.com',
            first_name: 'Ana',
            last_name: 'Perez',
          }),
        } as Response);
      clients.findOrCreateSocial.mockResolvedValue({
        id: 12,
        email: 'facebook@example.com',
        firstName: 'Ana',
        firstSurname: 'Perez',
      });

      await expect(service.facebookLogin(accessToken)).resolves.toEqual({
        accessToken: 'signed-token',
        client: {
          id: 12,
          email: 'facebook@example.com',
          firstName: 'Ana',
          lastName: 'Perez',
        },
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const debugUrl = new URL(fetchMock.mock.calls[0]![0] as string);
      expect(debugUrl.pathname).toBe('/v21.0/debug_token');
      expect(debugUrl.searchParams.get('input_token')).toBe(accessToken);
      expect(debugUrl.searchParams.get('access_token')).toBe(
        'facebook-app-id|facebook-app-secret',
      );
      const profileUrl = new URL(fetchMock.mock.calls[1]![0] as string);
      expect(profileUrl.pathname).toBe('/v21.0/me');
      expect(profileUrl.searchParams.get('access_token')).toBe(accessToken);
      expect(clients.findOrCreateSocial).toHaveBeenCalledWith({
        provider: 'FACEBOOK',
        providerUserId: 'facebook-user-id',
        email: 'facebook@example.com',
        firstName: 'Ana',
        lastName: 'Perez',
      });
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 12,
        email: 'facebook@example.com',
        type: 'client',
      });
    });

    it('rejects a missing access token before calling Facebook', async () => {
      const fetchMock = jest.spyOn(global, 'fetch');

      await expect(service.facebookLogin('')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
