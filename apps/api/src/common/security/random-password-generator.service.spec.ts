import { Test, type TestingModule } from '@nestjs/testing';
import crypto from 'node:crypto';
import { PasswordGenerator } from './password-generator';
import { RandomPasswordGenerator } from './random-password-generator.service';

describe('RandomPasswordGenerator', () => {
  let module: TestingModule;
  let generator: PasswordGenerator;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        { provide: PasswordGenerator, useClass: RandomPasswordGenerator },
      ],
    }).compile();

    generator = module.get(PasswordGenerator);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await module.close();
  });

  it('encodes 24 random bytes as a 32-character base64url password', () => {
    const randomBytes = jest
      .spyOn(crypto, 'randomBytes')
      .mockImplementation(() => Buffer.alloc(24, 0xfb));

    const password = generator.generate();

    expect(randomBytes).toHaveBeenCalledTimes(1);
    expect(randomBytes).toHaveBeenCalledWith(24);
    expect(password).toBe('-_v7'.repeat(8));
    expect(password).toMatch(/^[A-Za-z0-9_-]{32}$/u);
  });

  it('requests fresh random bytes for each password without reusing a previous result', () => {
    const randomBytes = jest
      .spyOn(crypto, 'randomBytes')
      .mockImplementationOnce(() => Buffer.alloc(24, 0))
      .mockImplementationOnce(() => Buffer.alloc(24, 0xff));

    expect(generator.generate()).toBe('A'.repeat(32));
    expect(generator.generate()).toBe('_'.repeat(32));
    expect(randomBytes).toHaveBeenCalledTimes(2);
    expect(randomBytes).toHaveBeenNthCalledWith(1, 24);
    expect(randomBytes).toHaveBeenNthCalledWith(2, 24);
  });

  it('propagates a random generation error instead of returning a fallback password', () => {
    const failure = new Error('Random number generation failed');
    const randomBytes = jest
      .spyOn(crypto, 'randomBytes')
      .mockImplementation(() => {
        throw failure;
      });

    expect(() => generator.generate()).toThrow(failure);
    expect(randomBytes).toHaveBeenCalledTimes(1);
  });
});
