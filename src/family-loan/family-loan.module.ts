import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../account/account.entity';
import { AccountModule } from '../account/account.module';
import { CategoryModule } from '../category/category.module';
import { TransactionModule } from '../transaction/transaction.module';
import { FamilyLoan } from './family-loan.entity';
import { FamilyLoanResolver } from './family-loan.resolver';
import { FamilyLoanService } from './family-loan.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FamilyLoan, Account]),
    TransactionModule,
    AccountModule,
    CategoryModule,
  ],
  providers: [FamilyLoanService, FamilyLoanResolver],
  exports: [FamilyLoanService],
})
export class FamilyLoanModule {}
