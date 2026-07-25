import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GrabProfitEntry } from './grab-profit-entry.entity';
import { GrabProfitResolver } from './grab-profit.resolver';
import { GrabProfitService } from './grab-profit.service';

@Module({
  imports: [TypeOrmModule.forFeature([GrabProfitEntry])],
  providers: [GrabProfitService, GrabProfitResolver],
})
export class GrabProfitModule {}
