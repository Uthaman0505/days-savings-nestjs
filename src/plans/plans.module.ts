import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavingPlan } from './saving-plan.entity';
import { PlansResolver } from './plans.resolver';
import { PlansService } from './plans.service';
import { UserSavingPlan } from './user-saving-plan.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SavingPlan, UserSavingPlan])],
  providers: [PlansService, PlansResolver],
})
export class PlansModule {}
