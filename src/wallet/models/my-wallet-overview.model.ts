import { Field, Int, ObjectType } from '@nestjs/graphql';
import { WalletTransactionItemModel } from './wallet-transaction-item.model';

@ObjectType('MyWalletOverview')
export class MyWalletOverviewModel {
  @Field(() => Int, { name: 'global_wallet_balance' })
  globalWalletBalance: number;

  @Field(() => Int, { name: 'challenge_wallet_balance' })
  challengeWalletBalance: number;

  @Field(() => Int, { name: 'total_wallet_balance' })
  totalWalletBalance: number;

  @Field(() => [WalletTransactionItemModel], { name: 'recent_transactions' })
  recentTransactions: WalletTransactionItemModel[];
}
