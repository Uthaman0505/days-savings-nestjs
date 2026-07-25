import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../account/account.entity';
import { AccountModule } from '../account/account.module';
import { CategoryModule } from '../category/category.module';
import { SavingsModule } from '../savings/savings.module';
import { TransactionModule } from '../transaction/transaction.module';
import { GoalContribution } from './goal-contribution.entity';
import { Goal } from './goals.entity';
import { GoalsResolver } from './goals.resolver';
import { GoalsService } from './goals.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Goal, GoalContribution, Account]),
    TransactionModule,
    AccountModule,
    CategoryModule,
    SavingsModule,
  ],
  providers: [GoalsService, GoalsResolver],
  exports: [GoalsService],
})
export class GoalsModule {}
