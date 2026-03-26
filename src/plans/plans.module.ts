import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavingPlan } from './saving-plan.entity';
import { PlansResolver } from './plans.resolver';
import { PlansService } from './plans.service';
import { UserSavingPlan } from './user-saving-plan.entity';
import { GlobalWallet } from '../wallet/global-wallet.entity';
import { ChallengeWallet } from '../wallet/challenge-wallet.entity';
import { CompletedChallenge } from '../wallet/completed-challenge.entity';
import { GiveUpChallenge } from '../wallet/give-up-challenge.entity';
import { WalletTransaction } from '../wallet/wallet-transaction.entity';
import { YearlyChallengeReset } from '../wallet/yearly-challenge-reset.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SavingPlan,
      UserSavingPlan,
      GlobalWallet,
      ChallengeWallet,
      CompletedChallenge,
      GiveUpChallenge,
      WalletTransaction,
      YearlyChallengeReset,
    ]),
  ],
  providers: [PlansService, PlansResolver],
})
export class PlansModule {}
