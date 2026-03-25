import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('ResetUserChallengesPayload')
export class ResetUserChallengesPayloadModel {
  @Field(() => Boolean)
  ok: boolean;

  @Field(() => String)
  message: string;

  @Field(() => Int, { name: 'cleared_days', nullable: true })
  clearedDays: number | null;
}
