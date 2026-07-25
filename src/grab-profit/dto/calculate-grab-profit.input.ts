import { Field, Float, InputType } from '@nestjs/graphql';
import { IsDateString, IsNumber, Min } from 'class-validator';

@InputType()
export class CalculateGrabProfitInput {
  @Field()
  @IsDateString()
  work_date: string;

  @Field(() => Float)
  @IsNumber()
  @Min(0)
  daily_km: number;

  @Field(() => Float)
  @IsNumber()
  @Min(0)
  earning: number;

  @Field(() => Float)
  @IsNumber()
  @Min(0)
  fuel_cost: number;

  @Field(() => Float, { nullable: true, defaultValue: 0.12 })
  @IsNumber()
  @Min(0)
  maintenance_per_km?: number;
}
