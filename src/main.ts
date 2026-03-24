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
  const PORT = process.env.APP_PORT || process.env.PORT as string
  await app.listen(PORT, '0.0.0.0', () => { console.log(`${`Your app runs on http://localhost:${PORT}/graphql`}`) });
  // await app.listen(PORT, '0.0.0.0', () => { console.log(`${`Your app runs on http://localhost:${PORT}/graphql`}`) }
}

void bootstrap();
