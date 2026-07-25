import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../account/account.entity';
import { AccountModule } from '../account/account.module';
import { CategoryModule } from '../category/category.module';
import { HouseLoanModule } from '../house-loan/house-loan.module';
import { TransactionModule } from '../transaction/transaction.module';
import { HouseLoanPayment } from './house-loan-payment.entity';
import { HouseLoanPaymentResolver } from './house-loan-payment.resolver';
import { HouseLoanPaymentService } from './house-loan-payment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([HouseLoanPayment, Account]),
    TransactionModule,
    HouseLoanModule,
    AccountModule,
    CategoryModule,
  ],
  providers: [HouseLoanPaymentService, HouseLoanPaymentResolver],
  exports: [HouseLoanPaymentService],
})
export class HouseLoanPaymentModule {}
