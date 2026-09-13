import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LunoAccount } from './entities/luno-account.entity';
import { LunoBalance } from './entities/luno-balance.entity';
import { LunoOrderRow } from './entities/luno-order.entity';
import { LunoSyncRun } from './entities/luno-sync-run.entity';
import { LunoTransactionRow } from './entities/luno-transaction.entity';
import { LunoTransferRow } from './entities/luno-transfer.entity';
import { LunoWithdrawalRow } from './entities/luno-withdrawal.entity';
import { LunoApiService } from './luno-api.service';
import { LunoConfigService } from './luno-config.service';
import { LunoHealthService } from './luno-health.service';
import { LunoSyncService } from './luno-sync.service';
import { LunoController } from './luno.controller';

export const LUNO_ENTITIES = [
  LunoSyncRun,
  LunoAccount,
  LunoBalance,
  LunoTransactionRow,
  LunoOrderRow,
  LunoWithdrawalRow,
  LunoTransferRow,
];

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature(LUNO_ENTITIES),
  ],
  controllers: [LunoController],
  providers: [
    LunoConfigService,
    LunoApiService,
    LunoSyncService,
    LunoHealthService,
  ],
  exports: [LunoApiService, LunoSyncService, LunoHealthService],
})
export class LunoModule {}
