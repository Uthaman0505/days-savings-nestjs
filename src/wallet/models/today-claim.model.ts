import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('TodayClaim')
export class TodayClaimModel {
  @Field(() => Boolean, { name: 'is_claimed' })
  isClaimed: boolean;

  @Field(() => Int, { name: 'claimed_day_number', nullable: true })
  claimedDayNumber: number | null;

  @Field(() => Int, { name: 'claims_today_count' })
  claimsTodayCount: number;

  @Field(() => Int, { name: 'allowed_claims_today' })
  allowedClaimsToday: number;

  @Field(() => Int, { name: 'remaining_claims_today' })
  remainingClaimsToday: number;

  @Field(() => Date, { name: 'next_available_at' })
  nextAvailableAt: Date;
}
