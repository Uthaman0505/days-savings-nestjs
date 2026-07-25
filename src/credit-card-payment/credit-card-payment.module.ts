import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../account/account.entity';
import { AccountModule } from '../account/account.module';
import { CategoryModule } from '../category/category.module';
import { CreditCardModule } from '../credit-card/credit-card.module';
import { TransactionModule } from '../transaction/transaction.module';
import { CreditCardPayment } from './credit-card-payment.entity';
import { CreditCardPaymentResolver } from './credit-card-payment.resolver';
import { CreditCardPaymentService } from './credit-card-payment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CreditCardPayment, Account]),
    TransactionModule,
    CreditCardModule,
    AccountModule,
    CategoryModule,
  ],
  providers: [CreditCardPaymentService, CreditCardPaymentResolver],
  exports: [CreditCardPaymentService],
})
export class CreditCardPaymentModule {}
