import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { entities } from '../entities/entities';

@Injectable()
export class DevelopmentConfigService implements TypeOrmOptionsFactory {
  private readonly logger = new Logger(DevelopmentConfigService.name);

  constructor(private readonly configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions | Promise<TypeOrmModuleOptions> {
    return {
      type: 'postgres',
      url: this.configService.get<string>('DB_DEVELOPMENT_URL'),
      entities: [...entities],
      logging: process.env.NODE_ENV === 'development' ? true : false,
      synchronize: process.env.NODE_ENV === 'development' ? true : false,
    };
  }
}
