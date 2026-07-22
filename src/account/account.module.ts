import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './account.entity';
import { AccountResolver } from './account.resolver';
import { AccountService } from './account.service';

@Module({
  imports: [TypeOrmModule.forFeature([Account])],
  providers: [AccountService, AccountResolver],
  exports: [AccountService],
})
export class AccountModule {}
