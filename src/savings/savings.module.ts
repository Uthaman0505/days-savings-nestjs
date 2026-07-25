import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../account/account.entity';
import { AccountModule } from '../account/account.module';
import { CategoryModule } from '../category/category.module';
import { TransactionModule } from '../transaction/transaction.module';
import { Savings } from './savings.entity';
import { SavingsResolver } from './savings.resolver';
import { SavingsService } from './savings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Savings, Account]),
    TransactionModule,
    AccountModule,
    CategoryModule,
  ],
  providers: [SavingsService, SavingsResolver],
  exports: [SavingsService],
})
export class SavingsModule {}
