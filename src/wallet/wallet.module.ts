import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlobalWallet } from './global-wallet.entity';
import { ChallengeWallet } from './challenge-wallet.entity';
import { WalletTransaction } from './wallet-transaction.entity';
import { DailyChallengeClaim } from './daily-challenge-claim.entity';
import { CompletedChallenge } from './completed-challenge.entity';
import { GiveUpChallenge } from './give-up-challenge.entity';
import { DailyTransactionLeverage } from './daily-transaction-leverage.entity';
import { YearlyChallengeReset } from './yearly-challenge-reset.entity';
import { UserSavingPlan } from '../plans/user-saving-plan.entity';
import { WalletResolver } from './wallet.resolver';
import { WalletService } from './wallet.service';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GlobalWallet,
      ChallengeWallet,
      WalletTransaction,
      DailyChallengeClaim,
      CompletedChallenge,
      GiveUpChallenge,
      DailyTransactionLeverage,
      YearlyChallengeReset,
      UserSavingPlan,
    ]),
  ],
  providers: [WalletService, WalletResolver, RolesGuard],
})
export class WalletModule {}
