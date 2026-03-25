import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('TodayClaim')
export class TodayClaimModel {
  @Field(() => Boolean, { name: 'is_claimed' })
  isClaimed: boolean;

  @Field(() => Int, { name: 'claimed_day_number', nullable: true })
  claimedDayNumber: number | null;

  @Field(() => Date, { name: 'next_available_at' })
  nextAvailableAt: Date;
}
