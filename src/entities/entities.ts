import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { SavingPlan } from '../plans/saving-plan.entity';
import { User } from '../user/user.entity';
import { UserSavingPlan } from '../plans/user-saving-plan.entity';
import { GlobalWallet } from '../wallet/global-wallet.entity';
import { ChallengeWallet } from '../wallet/challenge-wallet.entity';
import { WalletTransaction } from '../wallet/wallet-transaction.entity';
import { DailyChallengeClaim } from '../wallet/daily-challenge-claim.entity';
import { CompletedChallenge } from '../wallet/completed-challenge.entity';
import { GiveUpChallenge } from '../wallet/give-up-challenge.entity';

export const entities = [
  User,
  RefreshToken,
  SavingPlan,
  UserSavingPlan,
  GlobalWallet,
  ChallengeWallet,
  WalletTransaction,
  DailyChallengeClaim,
  CompletedChallenge,
  GiveUpChallenge,
];
