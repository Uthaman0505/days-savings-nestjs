import { Field, GraphQLISODateTime, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('RecurringTransaction')
export class RecurringTransactionModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => ID, { name: 'account_id' })
  accountId: string;

  @Field(() => ID, { name: 'category_id', nullable: true })
  categoryId: string | null;

  @Field(() => String, { name: 'target_module' })
  targetModule: string;

  @Field(() => ID, { name: 'target_reference_id', nullable: true })
  targetReferenceId: string | null;

  @Field(() => String)
  name: string;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field(() => String, { name: 'transaction_type' })
  transactionType: string;

  @Field(() => Int, { name: 'amount_cents' })
  amountCents: number;

  @Field(() => String)
  currency: string;

  @Field(() => String)
  frequency: string;

  @Field(() => Int, { name: 'interval_value' })
  intervalValue: number;

  @Field(() => String, { name: 'start_date' })
  startDate: string;

  @Field(() => String, { name: 'end_date', nullable: true })
  endDate: string | null;

  @Field(() => GraphQLISODateTime, { name: 'next_execution_date' })
  nextExecutionDate: Date;

  @Field(() => GraphQLISODateTime, {
    name: 'last_execution_date',
    nullable: true,
  })
  lastExecutionDate: Date | null;

  @Field(() => String)
  timezone: string;

  @Field(() => Boolean, { name: 'is_active' })
  isActive: boolean;

  @Field(() => Boolean, { name: 'auto_execute' })
  autoExecute: boolean;

  @Field(() => Int, { name: 'retry_count' })
  retryCount: number;

  @Field(() => Int, { name: 'max_retry_count' })
  maxRetryCount: number;

  @Field(() => String, { name: 'last_error', nullable: true })
  lastError: string | null;

  @Field(() => GraphQLISODateTime, { name: 'created_at' })
  createdAt: Date;

  @Field(() => GraphQLISODateTime, { name: 'updated_at' })
  updatedAt: Date;
}
