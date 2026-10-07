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
import { EmailVerificationSender } from './notifications/email-verification-sender';

jest.mock('argon2');
// mock for google lib
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(),
}));

import { OAuth2Client } from 'google-auth-library';
import { UsersRepository } from '../users/users.repository';
import { UserRole } from '../users/enums/user-role.enum';
import type { EmployeeWithLocalCredentials } from '../users/types/employee-with-local-credentials.type';

const hasher = { hash: jest.fn(), verify: jest.fn() };
const salt = 'AAECAwQFBgcICQoLDA0ODw';

describe('AuthService', () => {
  let service: AuthService;
  let clients: {
    findByEmail: jest.Mock;
    findWithLocalCredentials: jest.Mock;
    isEmailVerificationPending: jest.Mock;
    deleteExpiredPendingClientByEmail: jest.Mock;
    createWithLocalCredentials: jest.Mock;
    createPendingWithLocalCredentials: jest.Mock;
    findPendingLocalClientByEmail: jest.Mock;
    replaceEmailVerification: jest.Mock;
    consumeEmailVerification: jest.Mock;
    findOrCreateSocial: jest.Mock; // for google auth
  };
  let jwt: { sign: jest.Mock; signAsync: jest.Mock };
  let users: {
    findEmployeeWithLocalCredentialsByEmail: jest.Mock;
    findEmployeePasswordCredentials: jest.Mock;
    saveEmployeePassword: jest.Mock;
  };
  let config: { getOrThrow: jest.Mock; get: jest.Mock };
  let verificationSender: { send: jest.Mock };

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
      findWithLocalCredentials: jest.fn(),
      isEmailVerificationPending: jest.fn().mockResolvedValue(false),
      deleteExpiredPendingClientByEmail: jest.fn(),
      createWithLocalCredentials: jest.fn(),
      createPendingWithLocalCredentials: jest.fn(),
      findPendingLocalClientByEmail: jest.fn(),
      replaceEmailVerification: jest.fn(),
      consumeEmailVerification: jest.fn(),
      findOrCreateSocial: jest.fn(),
    };
    jwt = {
      sign: jest.fn().mockReturnValue('signed-token'),
      signAsync: jest.fn().mockResolvedValue('employee-token'),
    };
    users = {
      findEmployeeWithLocalCredentialsByEmail: jest.fn(),
      findEmployeePasswordCredentials: jest.fn(),
      saveEmployeePassword: jest.fn(),
    };
    config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'FRONTEND_URL' ? 'http://localhost:5173' : `test-${key}`,
      ),
      get: jest.fn(),
    };
    verificationSender = { send: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PasswordHasher, useValue: hasher },
        { provide: ClientsService, useValue: clients },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: UsersRepository, useValue: users },
        { provide: EmailVerificationSender, useValue: verificationSender },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    hasher.hash.mockResolvedValue({ passwordHash: 'hashed-password', salt });
    hasher.verify.mockReset().mockResolvedValue(true);
  });

  describe('client login', () => {
    const credentials = {
      email: 'client@example.com',
      password: ' Exact password ',
    };
    const client = {
      id: 7,
      email: credentials.email,
      firstName: 'Ana',
      firstSurname: 'Rojas',
      status: 'ACTIVE',
      passwordHash: 'stored-hash',
    };

    it('verifies the exact password and returns only the safe profile with a client token', async () => {
      clients.findWithLocalCredentials.mockResolvedValue(client);
      await expect(service.loginClient(credentials)).resolves.toEqual({
        accessToken: 'signed-token',
        client: {
          id: 7,
          email: credentials.email,
          firstName: 'Ana',
          lastName: 'Rojas',
        },
      });
      expect(hasher.verify).toHaveBeenCalledWith(
        credentials.password,
        'stored-hash',
      );
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 7,
        email: credentials.email,
        type: 'client',
      });
      expect(
        users.findEmployeeWithLocalCredentialsByEmail,
      ).not.toHaveBeenCalled();
      expect(verificationSender.send).not.toHaveBeenCalled();
    });

    it.each([null, { ...client, status: 'INACTIVE' }])(
      'rejects unavailable accounts without issuing tokens: %p',
      async (account) => {
        clients.findWithLocalCredentials.mockResolvedValue(account);
        await expect(service.loginClient(credentials)).rejects.toThrow(
          'Correo o contraseña incorrectos',
        );
        expect(hasher.verify).toHaveBeenCalledWith(
          credentials.password,
          expect.any(String),
        );
        expect(jwt.sign).not.toHaveBeenCalled();
        expect(clients.isEmailVerificationPending).not.toHaveBeenCalled();
      },
    );

    it('uses the same credential error for incorrect passwords without exposing verification status', async () => {
      clients.findWithLocalCredentials.mockResolvedValue(client);
      hasher.verify.mockResolvedValue(false);
      await expect(service.loginClient(credentials)).rejects.toThrow(
        'Correo o contraseña incorrectos',
      );
      expect(clients.isEmailVerificationPending).not.toHaveBeenCalled();
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('requires email confirmation after validating the password', async () => {
      clients.findWithLocalCredentials.mockResolvedValue(client);
      clients.isEmailVerificationPending.mockResolvedValue(true);
      await expect(service.loginClient(credentials)).rejects.toMatchObject({
        status: 403,
        response: { code: 'EMAIL_VERIFICATION_REQUIRED' },
      });
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('propagates persistence failures without attempting to issue a token', async () => {
      const failure = new Error('Database unavailable');
      clients.findWithLocalCredentials.mockRejectedValue(failure);
      await expect(service.loginClient(credentials)).rejects.toBe(failure);
      expect(jwt.sign).not.toHaveBeenCalled();
    });
  });

  describe('changeEmployeePassword', () => {
    const employee = {
      email: 'ana@example.com',
      firstName: 'Ana',
      passwordHash: 'current-hash',
    };
    const input = {
      currentPassword: 'Current!Password9',
      newPassword: 'Cr0wn!River77',
      confirmNewPassword: 'Cr0wn!River77',
      expirationDays: 90,
    };

    beforeEach(() => {
      users.findEmployeePasswordCredentials.mockResolvedValue(employee);
      hasher.verify.mockResolvedValue(false);
    });

    it('validates the current password and policy, then saves the new hash and expiration', async () => {
      hasher.verify.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      await expect(
        service.changeEmployeePassword(21, input),
      ).resolves.toBeUndefined();

      expect(hasher.verify).toHaveBeenNthCalledWith(
        1,
        input.currentPassword,
        employee.passwordHash,
      );
      expect(hasher.verify).toHaveBeenNthCalledWith(
        2,
        input.newPassword,
        employee.passwordHash,
      );
      expect(hasher.hash).toHaveBeenCalledWith(input.newPassword);
      expect(users.saveEmployeePassword).toHaveBeenCalledWith(
        21,
        'hashed-password',
        salt,
        90,
      );
    });

    it('rejects an incorrect current password without hashing or saving', async () => {
      hasher.verify.mockResolvedValue(false);
      await expect(
        service.changeEmployeePassword(21, input),
      ).rejects.toMatchObject({
        response: { code: 'CURRENT_PASSWORD_INCORRECT' },
      });
      expect(hasher.hash).not.toHaveBeenCalled();
      expect(users.saveEmployeePassword).not.toHaveBeenCalled();
    });

    it('rejects new passwords that do not match', async () => {
      hasher.verify.mockResolvedValueOnce(true);
      await expect(
        service.changeEmployeePassword(21, {
          ...input,
          confirmNewPassword: 'Different!Password9',
        }),
      ).rejects.toMatchObject({ response: { code: 'PASSWORDS_DO_NOT_MATCH' } });
      expect(hasher.hash).not.toHaveBeenCalled();
    });

    it('rejects reusing the current password', async () => {
      hasher.verify.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
      await expect(
        service.changeEmployeePassword(21, {
          ...input,
          newPassword: input.currentPassword,
          confirmNewPassword: input.currentPassword,
        }),
      ).rejects.toMatchObject({
        response: { code: 'NEW_PASSWORD_SAME_AS_CURRENT' },
      });
      expect(hasher.hash).not.toHaveBeenCalled();
    });

    it('rejects passwords that violate the policy and passes employee identity context', async () => {
      hasher.verify.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      await expect(
        service.changeEmployeePassword(21, {
          ...input,
          newPassword: 'password',
          confirmNewPassword: 'password',
        }),
      ).rejects.toMatchObject({
        response: { code: 'PASSWORD_POLICY_VIOLATION' },
      });
      expect(hasher.hash).not.toHaveBeenCalled();
      expect(users.saveEmployeePassword).not.toHaveBeenCalled();
    });
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
      expect(clients.createPendingWithLocalCredentials).not.toHaveBeenCalled();
      expect(hasher.hash).not.toHaveBeenCalled();
    });

    it('splits first/last name and creates the client with a hashed password', async () => {
      clients.findByEmail.mockResolvedValue(null);
      clients.createPendingWithLocalCredentials.mockResolvedValue({
        id: 5,
        email: registerDto.email,
      });

      const result = await service.register(registerDto);

      expect(hasher.hash).toHaveBeenCalledWith(registerDto.password);
      expect(clients.createPendingWithLocalCredentials).toHaveBeenCalledWith(
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
        expect.stringMatching(/^[a-f0-9]{64}$/u),
        30,
      );
      expect(result).toEqual({
        status: 'pending_verification',
        email: registerDto.email,
      });
      expect(
        clients.createPendingWithLocalCredentials.mock.calls[0][3],
      ).toMatch(/^[a-f0-9]{64}$/u);
      expect(clients.createPendingWithLocalCredentials.mock.calls[0][4]).toBe(
        30,
      );
      expect(verificationSender.send).toHaveBeenCalledWith({
        email: registerDto.email,
        confirmationUrl: expect.stringMatching(
          /^http:\/\/localhost:5173\/verify-email\?token=[a-f0-9]{64}$/u,
        ),
        expiresInMinutes: 30,
      });
    });

    it('resends confirmation for an existing pending registration instead of reporting a duplicate', async () => {
      const pendingClient = { id: 5, email: registerDto.email };
      clients.findByEmail.mockResolvedValue(pendingClient);
      clients.findPendingLocalClientByEmail.mockResolvedValue(pendingClient);

      await expect(service.register(registerDto)).resolves.toEqual({
        status: 'pending_verification',
        email: pendingClient.email,
      });

      expect(clients.replaceEmailVerification).toHaveBeenCalledWith(
        pendingClient.id,
        expect.stringMatching(/^[a-f0-9]{64}$/u),
        30,
      );
      expect(verificationSender.send).toHaveBeenCalledTimes(1);
      expect(clients.createPendingWithLocalCredentials).not.toHaveBeenCalled();
      expect(hasher.hash).not.toHaveBeenCalled();
    });

    it('keeps the account pending and reports email delivery failure for resend', async () => {
      clients.findByEmail.mockResolvedValue(null);
      clients.createPendingWithLocalCredentials.mockResolvedValue({
        id: 5,
        email: registerDto.email,
      });
      verificationSender.send.mockRejectedValue(
        new Error('SMTP private details'),
      );

      await expect(service.register(registerDto)).rejects.toMatchObject({
        response: {
          code: 'EMAIL_DELIVERY_FAILED',
          message: expect.stringContaining('reenvíe'),
        },
      });
      expect(clients.createPendingWithLocalCredentials).toHaveBeenCalledTimes(
        1,
      );
    });

    it('persists a pending account before attempting email delivery', async () => {
      clients.findByEmail.mockResolvedValue(null);
      clients.createPendingWithLocalCredentials.mockResolvedValue({
        id: 5,
        email: registerDto.email,
      });

      await service.register(registerDto);

      expect(
        clients.createPendingWithLocalCredentials.mock.invocationCallOrder[0],
      ).toBeLessThan(verificationSender.send.mock.invocationCallOrder[0]!);
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
    clients.createPendingWithLocalCredentials.mockRejectedValue(
      new ConflictException(),
    );
    await expect(service.register(registerDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(clients.createPendingWithLocalCredentials).toHaveBeenCalledTimes(1);
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  describe('email verification', () => {
    const client = {
      status: 'ACTIVE',
      id: 8,
      email: 'ana@example.com',
      firstName: 'Ana',
      firstSurname: 'Perez',
    };

    it('rotates the one-use token before resending confirmation', async () => {
      clients.findPendingLocalClientByEmail.mockResolvedValue(client);

      await expect(
        service.resendEmailVerification(client.email),
      ).resolves.toMatchObject({
        message: expect.stringContaining('Si existe'),
      });

      expect(clients.replaceEmailVerification).toHaveBeenCalledWith(
        client.id,
        expect.stringMatching(/^[a-f0-9]{64}$/u),
        30,
      );
      expect(verificationSender.send).toHaveBeenCalledWith({
        email: client.email,
        confirmationUrl: expect.stringMatching(
          /^http:\/\/localhost:5173\/verify-email\?token=[a-f0-9]{64}$/u,
        ),
        expiresInMinutes: 30,
      });
    });

    it('does not disclose whether a resend email belongs to a pending account', async () => {
      clients.findPendingLocalClientByEmail.mockResolvedValue(null);

      await expect(
        service.resendEmailVerification('unknown@example.com'),
      ).resolves.toEqual({
        message:
          'Si existe una cuenta pendiente con ese correo, enviaremos un nuevo enlace.',
      });
      expect(clients.replaceEmailVerification).not.toHaveBeenCalled();
      expect(verificationSender.send).not.toHaveBeenCalled();
    });

    it('consumes a valid token once and then signs a client session', async () => {
      clients.consumeEmailVerification.mockResolvedValue(client);

      await expect(
        service.confirmEmailVerification('a'.repeat(64)),
      ).resolves.toEqual({
        accessToken: 'signed-token',
        client: {
          id: 8,
          email: 'ana@example.com',
          firstName: 'Ana',
          lastName: 'Perez',
        },
      });
      expect(clients.consumeEmailVerification).toHaveBeenCalledWith(
        expect.stringMatching(/^[a-f0-9]{64}$/u),
      );
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 8,
        email: 'ana@example.com',
        type: 'client',
      });
    });

    it('rejects expired, unknown, or used tokens without issuing a client session', async () => {
      clients.consumeEmailVerification.mockResolvedValue(null);

      await expect(
        service.confirmEmailVerification('b'.repeat(64)),
      ).rejects.toMatchObject({
        response: {
          code: 'EMAIL_VERIFICATION_INVALID',
          message: 'Este enlace ya no es válido',
        },
      });
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('does not issue a session if the client was deactivated before confirmation', async () => {
      clients.consumeEmailVerification.mockResolvedValue({
        ...client,
        status: 'INACTIVE',
      });
      await expect(
        service.confirmEmailVerification('c'.repeat(64)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('does not resend or replace credentials when an inactive email is already registered', async () => {
      clients.findByEmail.mockResolvedValue({ ...client, status: 'INACTIVE' });
      clients.findPendingLocalClientByEmail.mockResolvedValue(null);
      await expect(service.register(registerDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(
        service.resendEmailVerification(client.email),
      ).resolves.toMatchObject({ message: expect.any(String) });
      expect(verificationSender.send).not.toHaveBeenCalled();
      expect(clients.replaceEmailVerification).not.toHaveBeenCalled();
      expect(clients.createPendingWithLocalCredentials).not.toHaveBeenCalled();
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('rejects invalid expiration configuration rather than accepting it', async () => {
      clients.findByEmail.mockResolvedValue(null);
      config.get.mockReturnValue('0');

      await expect(service.register(registerDto)).rejects.toThrow(
        'EMAIL_VERIFICATION_TTL_MINUTES',
      );
      expect(clients.createPendingWithLocalCredentials).not.toHaveBeenCalled();
    });
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

  it('does not issue a Google token for a deactivated social client', async () => {
    const denied = new UnauthorizedException('blocked');
    (OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({
      getToken: jest
        .fn()
        .mockResolvedValue({ tokens: { id_token: 'provider-token' } }),
      verifyIdToken: jest.fn().mockResolvedValue({
        getPayload: () => ({
          sub: 'google-id',
          email: 'user@example.com',
          email_verified: true,
        }),
      }),
    }));
    clients.findOrCreateSocial.mockRejectedValue(denied);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(service.googleLogin('authorization-code')).rejects.toBe(
        denied,
      );
      expect(jwt.sign).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
  it('keeps the email of a deactivated client reserved at registration', async () => {
    clients.findByEmail.mockResolvedValue({
      id: 42,
      status: 'INACTIVE',
      email: registerDto.email,
    });
    await expect(service.register(registerDto)).rejects.toThrow(
      ConflictException,
    );
    expect(hasher.hash).not.toHaveBeenCalled();
    expect(clients.createWithLocalCredentials).not.toHaveBeenCalled();
  });
  describe('issueToken', () => {
    it('signs a payload with type: client', () => {
      const result = service.issueToken({
        id: 9,
        email: 'x@y.com',
        status: 'ACTIVE',
      } as never);

      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 9,
        email: 'x@y.com',
        type: 'client',
      });
      expect(result).toEqual({ accessToken: 'signed-token' });
    });
    it('rejects inactive clients before signing a token', () => {
      expect(() =>
        service.issueToken({ id: 9, status: 'INACTIVE' } as never),
      ).toThrow(UnauthorizedException);
      expect(jwt.sign).not.toHaveBeenCalled();
    });
    it.each(['UNKNOWN', '', null, undefined, 1])(
      'rejects invalid client status %p without exposing its value',
      (status) => {
        expect(() => service.issueToken({ id: 9, status } as never)).toThrow(
          'Invalid client status.',
        );
        expect(jwt.sign).not.toHaveBeenCalled();
      },
    );
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
        status: 'ACTIVE',
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
