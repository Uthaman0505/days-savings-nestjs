import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoldPrice } from './gold-price.entity';
import { GoldPurchase } from './gold-purchase.entity';
import { GoldResolver } from './gold.resolver';
import { GoldService } from './gold.service';

@Module({
  imports: [TypeOrmModule.forFeature([GoldPurchase, GoldPrice])],
  providers: [GoldService, GoldResolver],
  exports: [GoldService],
})
export class GoldModule {}
