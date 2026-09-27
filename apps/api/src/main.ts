import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

export async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' });
  app.enableShutdownHooks();  // To ensure a gently close

  await app.listen(process.env.PORT ?? 3000);
}
// Safeguard for the unit test in CI to avoid the test suite starting the real nest server
// when main.ts is imported by main.spec.ts (require.main !== module in that case).
if (require.main === module) {
  void bootstrap();
}