import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../account/account.entity';
import { AccountModule } from '../account/account.module';
import { CategoryModule } from '../category/category.module';
import { InsuranceModule } from '../insurance/insurance.module';
import { TransactionModule } from '../transaction/transaction.module';
import { InsurancePayment } from './insurance-payment.entity';
import { InsurancePaymentResolver } from './insurance-payment.resolver';
import { InsurancePaymentService } from './insurance-payment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InsurancePayment, Account]),
    TransactionModule,
    InsuranceModule,
    AccountModule,
    CategoryModule,
  ],
  providers: [InsurancePaymentService, InsurancePaymentResolver],
  exports: [InsurancePaymentService],
})
export class InsurancePaymentModule {}
