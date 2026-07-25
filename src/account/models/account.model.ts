import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('Account')
export class AccountModel {
  @Field(() => ID)
  id: string;

  @Field(() => String, { name: 'account_name' })
  accountName: string;

  @Field(() => String, { name: 'account_type' })
  accountType: string;

  @Field(() => String, { name: 'bank_name', nullable: true })
  bankName: string | null;

  @Field(() => String, { name: 'account_number', nullable: true })
  accountNumber: string | null;

  @Field(() => String, { name: 'currency_code' })
  currencyCode: string;

  @Field(() => Float, { name: 'opening_balance' })
  openingBalance: number;

  @Field(() => Float, { name: 'current_balance' })
  currentBalance: number;

  @Field(() => String, { nullable: true })
  color: string | null;

  @Field(() => String, { nullable: true })
  icon: string | null;

  @Field(() => Int, { name: 'display_order' })
  displayOrder: number;

  @Field(() => Boolean, { name: 'is_default' })
  isDefault: boolean;

  @Field(() => Boolean, { name: 'is_archived' })
  isArchived: boolean;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}
