import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountModule } from '../account/account.module';
import { CategoryModule } from '../category/category.module';
import { TransactionModule } from '../transaction/transaction.module';
import { Expense } from './expense.entity';
import { ExpenseResolver } from './expense.resolver';
import { ExpenseService } from './expense.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Expense]),
    TransactionModule,
    AccountModule,
    CategoryModule,
  ],
  providers: [ExpenseService, ExpenseResolver],
  exports: [ExpenseService],
})
export class ExpenseModule {}
