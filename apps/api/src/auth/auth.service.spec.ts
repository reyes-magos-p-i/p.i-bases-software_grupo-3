import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PasswordHasher } from '../common/security/password-hasher';
import { AuthService } from './auth.service';
import { ClientsService } from '../clients/clients.service';
import { RegisterDto } from './dto/register.dto';
import { OAuth2Client } from 'google-auth-library'; //google login testing

jest.mock('argon2');
// mock for google lib
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(),
}));
const hasher = { hash: jest.fn() };
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PasswordHasher, useValue: hasher },
        { provide: ClientsService, useValue: clients },
        { provide: JwtService, useValue: jwt },
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

  describe('googleLogin', () => {
  let googleClient: {
    getToken: jest.Mock;
    verifyIdToken: jest.Mock;
  };

  beforeEach(() => {
    googleClient = {
      getToken: jest.fn(),
      verifyIdToken: jest.fn(),
    };

    (OAuth2Client as unknown as jest.Mock).mockImplementation(() => googleClient);

    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  });

  it('logs in an existing/new Google client and returns an access token', async () => {
    const googlePayload = {
      sub: 'google-123',
      email: 'google@example.com',
      given_name: 'Juan',
      family_name: 'Perez',
    };

    const client = {
      id: 10,
      email: 'google@example.com',
      firstName: 'Juan',
    };

    googleClient.getToken.mockResolvedValue({
      tokens: {
        id_token: 'google-id-token',
      },
    });

    googleClient.verifyIdToken.mockResolvedValue({
      getPayload: jest.fn().mockReturnValue(googlePayload),
    });

    clients.findOrCreateSocial.mockResolvedValue(client);

    const result = await service.googleLogin('google-auth-code');

    expect(googleClient.getToken).toHaveBeenCalledWith('google-auth-code');

    expect(googleClient.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'google-id-token',
      audience: 'test-client-id',
    });

    expect(clients.findOrCreateSocial).toHaveBeenCalledWith({
      provider: 'GOOGLE',
      providerUserId: 'google-123',
      email: 'google@example.com',
      firstName: 'Juan',
      lastName: 'Perez',
    });

    expect(jwt.sign).toHaveBeenCalledWith({
      sub: 10,
      email: 'google@example.com',
      type: 'client',
    });

    expect(result).toEqual({
      message: 'authentication success',
      client: {
        id: 10,
        email: 'google@example.com',
        firstName: 'Juan',
      },
      accessToken: 'signed-token',
    });
  });

  it('throws ConflictException when Google does not return an ID token', async () => {
    googleClient.getToken.mockResolvedValue({
      tokens: {},
    });

    await expect(
      service.googleLogin('invalid-code'),
    ).rejects.toThrow(ConflictException);

    expect(googleClient.verifyIdToken).not.toHaveBeenCalled();
    expect(clients.findOrCreateSocial).not.toHaveBeenCalled();
  });

  it('throws ConflictException when Google payload has no email', async () => {
    googleClient.getToken.mockResolvedValue({
      tokens: {
        id_token: 'google-id-token',
      },
    });

    googleClient.verifyIdToken.mockResolvedValue({
      getPayload: jest.fn().mockReturnValue({
        sub: 'google-123',
        given_name: 'Juan',
        family_name: 'Perez',
      }),
    });

    await expect(
      service.googleLogin('google-auth-code'),
    ).rejects.toThrow(ConflictException);

    expect(clients.findOrCreateSocial).not.toHaveBeenCalled();
  });

  it('converts unexpected Google errors into ConflictException', async () => {
    googleClient.getToken.mockRejectedValue(
      new Error('Google API error'),
    );

    await expect(
      service.googleLogin('google-auth-code'),
    ).rejects.toThrow(
      'Error trying to validated google credentials',
    );

    expect(clients.findOrCreateSocial).not.toHaveBeenCalled();
  });

  it('uses empty strings when Google does not provide given_name or family_name', async () => {
    googleClient.getToken.mockResolvedValue({
      tokens: {
        id_token: 'google-id-token',
      },
    });

    googleClient.verifyIdToken.mockResolvedValue({
      getPayload: jest.fn().mockReturnValue({
        sub: 'google-123',
        email: 'google@example.com',
      }),
    });

    clients.findOrCreateSocial.mockResolvedValue({
      id: 20,
      email: 'google@example.com',
      firstName: '',
    });

    await service.googleLogin('google-auth-code');

    expect(clients.findOrCreateSocial).toHaveBeenCalledWith({
      provider: 'GOOGLE',
      providerUserId: 'google-123',
      email: 'google@example.com',
      firstName: '',
      lastName: '',
    });
  });
});
});
