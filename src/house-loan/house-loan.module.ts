import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HouseLoan } from './house-loan.entity';
import { HouseLoanResolver } from './house-loan.resolver';
import { HouseLoanService } from './house-loan.service';

@Module({
  imports: [TypeOrmModule.forFeature([HouseLoan])],
  providers: [HouseLoanService, HouseLoanResolver],
  exports: [HouseLoanService],
})
export class HouseLoanModule {}
