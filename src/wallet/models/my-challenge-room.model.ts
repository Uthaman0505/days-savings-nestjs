import { Field, Int, ObjectType } from '@nestjs/graphql';
import { ActiveSavingPlanModel } from '../../plans/models/active-saving-plan.model';
import { TodayClaimModel } from './today-claim.model';

@ObjectType('MyChallengeRoom')
export class MyChallengeRoomModel {
  @Field(() => ActiveSavingPlanModel, {
    name: 'active_challenge',
    nullable: true,
  })
  activeChallenge: ActiveSavingPlanModel | null;

  @Field(() => Int, { name: 'global_wallet_balance' })
  globalWalletBalance: number;

  @Field(() => Int, { name: 'challenge_wallet_balance' })
  challengeWalletBalance: number;

  @Field(() => [Int], { name: 'claimed_day_numbers' })
  claimedDayNumbers: number[];

  @Field(() => TodayClaimModel, { name: 'today_claim' })
  todayClaim: TodayClaimModel;

  @Field(() => Boolean, { name: 'can_stop' })
  canStop: boolean;
}
