import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { AppResolver } from './app.resolver';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { PlansModule } from './plans/plans.module';
import { UserModule } from './user/user.module';
import { WalletModule } from './wallet/wallet.module';
import { ProfileMediaModule } from './profile-media/profile-media.module';
import { GrabProfitModule } from './grab-profit/grab-profit.module';
import { AccountModule } from './account/account.module';
import { CategoryModule } from './category/category.module';
import { TransactionModule } from './transaction/transaction.module';
import { IncomeModule } from './income/income.module';
import { ExpenseModule } from './expense/expense.module';
import { TransferModule } from './transfer/transfer.module';
import { CreditCardModule } from './credit-card/credit-card.module';
import { CreditCardPaymentModule } from './credit-card-payment/credit-card-payment.module';
import { HouseLoanModule } from './house-loan/house-loan.module';
import { HouseLoanPaymentModule } from './house-loan-payment/house-loan-payment.module';
import { InsuranceModule } from './insurance/insurance.module';
import { InsurancePaymentModule } from './insurance-payment/insurance-payment.module';
import { FamilyLoanModule } from './family-loan/family-loan.module';
import { FamilyLoanPaymentModule } from './family-loan-payment/family-loan-payment.module';
import { SavingsModule } from './savings/savings.module';
import { GoalsModule } from './goals/goals.module';
import { RecurringTransactionModule } from './recurring-transaction/recurring-transaction.module';
import { PawnLoanModule } from './pawn-loan/pawn-loan.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      context: ({ req }: { req: unknown }) => ({ req }),
      playground: process.env.NODE_ENV === 'production' ? false : true,
      // Default CSRF rules reject many GET /graphql requests; disable for public API + browser sandbox.
      csrfPrevention: false,
    }),
    AuthModule,
    PlansModule,
    WalletModule,
    UserModule,
    ProfileMediaModule,
    GrabProfitModule,
    AccountModule,
    CategoryModule,
    TransactionModule,
    IncomeModule,
    ExpenseModule,
    TransferModule,
    CreditCardModule,
    CreditCardPaymentModule,
    HouseLoanModule,
    HouseLoanPaymentModule,
    InsuranceModule,
    InsurancePaymentModule,
    FamilyLoanModule,
    FamilyLoanPaymentModule,
    SavingsModule,
    GoalsModule,
    RecurringTransactionModule,
    PawnLoanModule,
  ],
  providers: [AppService, AppResolver],
})
export class AppModule {}
