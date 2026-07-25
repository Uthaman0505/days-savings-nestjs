import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountModule } from '../account/account.module';
import { CategoryModule } from '../category/category.module';
import { CreditCardPaymentModule } from '../credit-card-payment/credit-card-payment.module';
import { ExpenseModule } from '../expense/expense.module';
import { FamilyLoanPaymentModule } from '../family-loan-payment/family-loan-payment.module';
import { GoalsModule } from '../goals/goals.module';
import { HouseLoanPaymentModule } from '../house-loan-payment/house-loan-payment.module';
import { IncomeModule } from '../income/income.module';
import { InsurancePaymentModule } from '../insurance-payment/insurance-payment.module';
import { SavingsModule } from '../savings/savings.module';
import { TransferModule } from '../transfer/transfer.module';
import { RecurringTransactionJobService } from './recurring-transaction-job.service';
import { RecurringTransaction } from './recurring-transaction.entity';
import { RecurringTransactionResolver } from './recurring-transaction.resolver';
import { RecurringTransactionService } from './recurring-transaction.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecurringTransaction]),
    AccountModule,
    CategoryModule,
    IncomeModule,
    ExpenseModule,
    TransferModule,
    SavingsModule,
    GoalsModule,
    CreditCardPaymentModule,
    HouseLoanPaymentModule,
    InsurancePaymentModule,
    FamilyLoanPaymentModule,
  ],
  providers: [
    RecurringTransactionService,
    RecurringTransactionResolver,
    RecurringTransactionJobService,
  ],
  exports: [RecurringTransactionService],
})
export class RecurringTransactionModule {}
