import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('AdminCompleteChallengePayload')
export class AdminCompleteChallengePayloadModel {
  @Field(() => Boolean)
  ok: boolean;

  @Field(() => String)
  message: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => Int, { name: 'total_days' })
  totalDays: number;

  /** Challenge wallet balance moved to global wallet (whole MYR, floor). */
  @Field(() => Int, { name: 'transferred_myr' })
  transferredMyr: number;
}
