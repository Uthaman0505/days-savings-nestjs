import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../account/account.entity';
import { AccountModule } from '../account/account.module';
import { CategoryModule } from '../category/category.module';
import { TransactionModule } from '../transaction/transaction.module';
import { Transfer } from './transfer.entity';
import { TransferResolver } from './transfer.resolver';
import { TransferService } from './transfer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transfer, Account]),
    TransactionModule,
    AccountModule,
    CategoryModule,
  ],
  providers: [TransferService, TransferResolver],
  exports: [TransferService],
})
export class TransferModule {}
