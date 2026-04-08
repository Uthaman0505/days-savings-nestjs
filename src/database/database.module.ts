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

        return {
          type: 'postgres' as const,
          url: isProduction
            ? configService.get<string>('DB_PRODUCTION_URL')
            : configService.get<string>('DB_DEVELOPMENT_URL'),
          entities: [...entities],
          logging: !isProduction,
          synchronize: typeormSync,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
