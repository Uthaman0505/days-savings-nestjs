import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { entities } from '../entities/entities';

@Injectable()
export class ProductionConfigService implements TypeOrmOptionsFactory {
  private readonly logger = new Logger(ProductionConfigService.name);

  constructor(private readonly configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions | Promise<TypeOrmModuleOptions> {
    const typeormSync = this.configService.get<string>('TYPEORM_SYNC') === 'true';

    return {
      type: 'postgres',
      url: this.configService.get<string>('DB_PRODUCTION_URL'),
      entities: [...entities],
      logging: process.env.NODE_ENV === 'production' ? false : true,
      synchronize: typeormSync,
    };
  }
}
