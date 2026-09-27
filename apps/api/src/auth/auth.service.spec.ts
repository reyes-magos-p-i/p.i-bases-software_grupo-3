import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { ClientsService } from '../clients/clients.service';
import { RegisterDto } from './dto/register.dto';

jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;
  let clients: { findByEmail: jest.Mock; createWithLocalCredentials: jest.Mock };
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
        { provide: ClientsService, useValue: clients },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    (argon2.hash as jest.Mock).mockResolvedValue('hashed-password');
  });

  describe('register', () => {
    it('throws ConflictException when the email already exists', async () => {
      clients.findByEmail.mockResolvedValue({ id: 1, email: registerDto.email });

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(clients.createWithLocalCredentials).not.toHaveBeenCalled();
    });

    it('splits first/last name and creates the client with a hashed password', async () => {
      clients.findByEmail.mockResolvedValue(null);
      clients.createWithLocalCredentials.mockResolvedValue({ id: 5, email: registerDto.email });

      const result = await service.register(registerDto);

      expect(argon2.hash).toHaveBeenCalledWith(
        registerDto.password,
        expect.objectContaining({ salt: expect.any(Buffer) }),
      );
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
        expect.any(String),
      );
      expect(result).toEqual({ id: 5, email: registerDto.email });
    });
  });

  describe('issueToken', () => {
    it('signs a payload with type: client', () => {
      const result = service.issueToken({ id: 9, email: 'x@y.com' } as never);

      expect(jwt.sign).toHaveBeenCalledWith({ sub: 9, email: 'x@y.com', type: 'client' });
      expect(result).toEqual({ accessToken: 'signed-token' });
    });
  });
});