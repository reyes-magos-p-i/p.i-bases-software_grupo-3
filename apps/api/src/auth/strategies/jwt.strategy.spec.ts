import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { ClientsService } from '../../clients/clients.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let clients: { findById: jest.Mock };

  beforeEach(async () => {
    clients = { findById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ClientsService, useValue: clients },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn(() => 'mock-secret') },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('rejects a payload whose type is not client', async () => {
    await expect(strategy.validate({ sub: 1, type: 'employee' })).rejects.toThrow(UnauthorizedException);
    expect(clients.findById).not.toHaveBeenCalled();
  });

  it('rejects when the client no longer exists', async () => {
    clients.findById.mockResolvedValue(null);

    await expect(strategy.validate({ sub: 1, type: 'client' })).rejects.toThrow(UnauthorizedException);
  });

  it('returns the client when the token is valid and the client still exists', async () => {
    const client = { id: 1, email: 'ana@example.com' };
    clients.findById.mockResolvedValue(client);

    await expect(strategy.validate({ sub: 1, type: 'client' })).resolves.toEqual(client);
  });
});