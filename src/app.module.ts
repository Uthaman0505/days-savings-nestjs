import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { AppResolver } from './app.resolver';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { UserModule } from './user/user.module';
import { ProfileMediaModule } from './profile-media/profile-media.module';
import { GoldModule } from './gold/gold.module';
import { LunoModule } from './luno/luno.module';
import { StorageModule } from './storage/storage.module';

/**
 * Gold + Luno runtime registration.
 *
 * Parked business modules remain on disk (source, entities, migrations).
 * Re-add their `*Module` imports here to reactivate. Do not delete folders.
 *
 * Luno is a separate module beside Gold. Do not mix Luno logic into Gold.
 *
 * Parked (not registered):
 * PlansModule, WalletModule, GrabProfitModule, AccountModule,
 * CategoryModule, TransactionModule, IncomeModule, ExpenseModule,
 * TransferModule, CreditCardModule, CreditCardPaymentModule,
 * HouseLoanModule, HouseLoanPaymentModule, InsuranceModule,
 * InsurancePaymentModule, FamilyLoanModule, FamilyLoanPaymentModule,
 * SavingsModule, GoalsModule, RecurringTransactionModule,
 * PawnLoanModule, MissionControlModule
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    StorageModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      context: ({ req }: { req: unknown }) => ({ req }),
      playground: process.env.NODE_ENV === 'production' ? false : true,
      // Default CSRF rules reject many GET /graphql requests; disable for public API + browser sandbox.
      csrfPrevention: false,
    }),
    AuthModule,
    UserModule,
    ProfileMediaModule,
    GoldModule,
    LunoModule,
  ],
  providers: [AppService, AppResolver],
})
export class AppModule {}
