import { Field, Float, ObjectType } from '@nestjs/graphql';

@ObjectType('GrabProfitResult')
export class GrabProfitResultModel {
  @Field()
  id: string;

  @Field({ name: 'work_date' })
  workDate: string;

  @Field(() => Float, { name: 'daily_km' })
  dailyKm: number;

  @Field(() => Float)
  earning: number;

  @Field(() => Float, { name: 'fuel_cost' })
  fuelCost: number;

  @Field(() => Float, { name: 'maintenance_per_km' })
  maintenancePerKm: number;

  @Field(() => Float, { name: 'maintenance_cost' })
  maintenanceCost: number;

  @Field(() => Float, { name: 'total_cost' })
  totalCost: number;

  @Field(() => Float, { name: 'net_profit' })
  netProfit: number;

  @Field(() => Float, { name: 'daily_profit' })
  dailyProfit: number;

  @Field(() => Float, { name: 'weekly_profit' })
  weeklyProfit: number;

  @Field(() => Float, { name: 'monthly_profit' })
  monthlyProfit: number;
}
