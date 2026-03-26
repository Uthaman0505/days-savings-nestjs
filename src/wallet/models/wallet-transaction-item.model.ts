import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('WalletTransactionItem')
export class WalletTransactionItemModel {
  @Field(() => String, { name: 'id' })
  id: string;

  @Field(() => String, { name: 'wallet_type' })
  walletType: string;

  @Field(() => String, { name: 'type' })
  type: string;

  @Field(() => Int, { name: 'amount' })
  amount: number;

  @Field(() => Int, { name: 'balance_after' })
  balanceAfter: number;

  @Field(() => String, { name: 'reference_type' })
  referenceType: string;

  @Field(() => String, { name: 'created_at' })
  createdAt: string;
}
