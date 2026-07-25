import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../account/account.entity';
import { AccountModule } from '../account/account.module';
import { CategoryModule } from '../category/category.module';
import { FamilyLoanModule } from '../family-loan/family-loan.module';
import { TransactionModule } from '../transaction/transaction.module';
import { FamilyLoanPayment } from './family-loan-payment.entity';
import { FamilyLoanPaymentResolver } from './family-loan-payment.resolver';
import { FamilyLoanPaymentService } from './family-loan-payment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FamilyLoanPayment, Account]),
    TransactionModule,
    FamilyLoanModule,
    AccountModule,
    CategoryModule,
  ],
  providers: [FamilyLoanPaymentService, FamilyLoanPaymentResolver],
  exports: [FamilyLoanPaymentService],
})
export class FamilyLoanPaymentModule {}
