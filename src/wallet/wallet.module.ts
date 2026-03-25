import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlobalWallet } from './global-wallet.entity';
import { ChallengeWallet } from './challenge-wallet.entity';
import { WalletTransaction } from './wallet-transaction.entity';
import { DailyChallengeClaim } from './daily-challenge-claim.entity';
import { CompletedChallenge } from './completed-challenge.entity';
import { UserSavingPlan } from '../plans/user-saving-plan.entity';
import { WalletResolver } from './wallet.resolver';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GlobalWallet,
      ChallengeWallet,
      WalletTransaction,
      DailyChallengeClaim,
      CompletedChallenge,
      UserSavingPlan,
    ]),
  ],
  providers: [WalletService, WalletResolver],
})
export class WalletModule {}
