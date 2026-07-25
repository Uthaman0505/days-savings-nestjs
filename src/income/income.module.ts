import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountModule } from '../account/account.module';
import { CategoryModule } from '../category/category.module';
import { TransactionModule } from '../transaction/transaction.module';
import { Income } from './income.entity';
import { IncomeResolver } from './income.resolver';
import { IncomeService } from './income.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Income]),
    TransactionModule,
    AccountModule,
    CategoryModule,
  ],
  providers: [IncomeService, IncomeResolver],
  exports: [IncomeService],
})
export class IncomeModule {}
