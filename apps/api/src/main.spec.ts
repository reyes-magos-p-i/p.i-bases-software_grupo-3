jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

jest.mock('./app.module', () => ({
  AppModule: class AppModule {},
}));

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { bootstrap } from './main';

describe('function bootstrap', () => {
  const createMockApp = () => ({
    useGlobalPipes: jest.fn(),
    enableCors: jest.fn(),
    enableShutdownHooks: jest.fn(),
    listen: jest.fn().mockResolvedValue(undefined),
  });

  afterEach(() => {
    delete process.env.PORT;
  });

  it('creates the app, applies global config and listens on 3000 by default', async () => {
    const app = createMockApp();
    (NestFactory.create as jest.Mock).mockResolvedValue(app);

    await bootstrap();

    expect(NestFactory.create).toHaveBeenCalledWith(AppModule);
    expect(app.useGlobalPipes).toHaveBeenCalled();
    expect(app.enableCors).toHaveBeenCalled();
    expect(app.enableShutdownHooks).toHaveBeenCalled();
    expect(app.listen).toHaveBeenCalledWith(3000);
  });

  it('listens on PORT when it is set', async () => {
    process.env.PORT = '8080';
    const app = createMockApp();
    (NestFactory.create as jest.Mock).mockResolvedValue(app);

    await bootstrap();

    expect(app.listen).toHaveBeenCalledWith('8080');
  });
});