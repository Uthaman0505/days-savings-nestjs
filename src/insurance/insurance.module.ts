import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Insurance } from './insurance.entity';
import { InsuranceResolver } from './insurance.resolver';
import { InsuranceService } from './insurance.service';

@Module({
  imports: [TypeOrmModule.forFeature([Insurance])],
  providers: [InsuranceService, InsuranceResolver],
  exports: [InsuranceService],
})
export class InsuranceModule {}
