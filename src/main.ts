import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Railway (and similar) set PORT; prefer it over APP_PORT so the proxy matches the listen port.
  const port = process.env.PORT ?? process.env.APP_PORT ?? '5000';
  await app.listen(port, '0.0.0.0', () => {
    console.log(`Your app runs on http://localhost:${port}/graphql`);
  });
}

void bootstrap();
