import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { entities } from '../entities/entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV');
        const isProduction = nodeEnv === 'production';
        const typeormSync =
          configService.get<string>('TYPEORM_SYNC') === 'true';

        const databaseUrl = isProduction
          ? (configService.get<string>('DB_PRODUCTION_URL') ??
            configService.get<string>('DATABASE_URL'))
          : (configService.get<string>('DB_DEVELOPMENT_URL') ??
            configService.get<string>('DATABASE_URL'));

        if (!databaseUrl) {
          throw new Error(
            isProduction
              ? 'Missing DB: set DB_PRODUCTION_URL or DATABASE_URL (Railway Postgres usually provides DATABASE_URL).'
              : 'Missing DB: set DB_DEVELOPMENT_URL or DATABASE_URL.',
          );
        }

        return {
          type: 'postgres' as const,
          url: databaseUrl,
          entities: [...entities],
          logging: !isProduction,
          synchronize: typeormSync,
          // Default is 9 retries × 3s — Railway health checks time out before listen().
          retryAttempts: 3,
          retryDelay: 2000,
          verboseRetryLog: true,
          extra: {
            connectionTimeoutMillis: 15000,
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
