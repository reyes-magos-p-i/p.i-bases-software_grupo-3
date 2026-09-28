import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PasswordHasher } from '../common/security/password-hasher';
import { AuthService } from './auth.service';
import { ClientsService } from '../clients/clients.service';
import { RegisterDto } from './dto/register.dto';

const hasher = { hash: jest.fn() };
const salt = 'AAECAwQFBgcICQoLDA0ODw';

describe('AuthService', () => {
  let service: AuthService;
  let clients: {
    findByEmail: jest.Mock;
    createWithLocalCredentials: jest.Mock;
  };
  let jwt: { sign: jest.Mock };

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
    };
    jwt = { sign: jest.fn().mockReturnValue('signed-token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PasswordHasher, useValue: hasher },
        { provide: ClientsService, useValue: clients },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    hasher.hash.mockResolvedValue({ passwordHash: 'hashed-password', salt });
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
});
