import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountModule } from '../account/account.module';
import { CreditCard } from './credit-card.entity';
import { CreditCardResolver } from './credit-card.resolver';
import { CreditCardService } from './credit-card.service';

@Module({
  imports: [TypeOrmModule.forFeature([CreditCard]), AccountModule],
  providers: [CreditCardService, CreditCardResolver],
  exports: [CreditCardService],
})
export class CreditCardModule {}
