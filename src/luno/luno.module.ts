import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LunoAccount } from './entities/luno-account.entity';
import { LunoBalance } from './entities/luno-balance.entity';
import { LunoOrderRow } from './entities/luno-order.entity';
import { LunoSyncRun } from './entities/luno-sync-run.entity';
import { LunoTransactionRow } from './entities/luno-transaction.entity';
import { LunoTransferRow } from './entities/luno-transfer.entity';
import { LunoUserTradeRow } from './entities/luno-user-trade.entity';
import { LunoWithdrawalRow } from './entities/luno-withdrawal.entity';
import { LunoApiService } from './luno-api.service';
import { LunoConfigService } from './luno-config.service';
import { LunoHealthService } from './luno-health.service';
import { LunoSyncService } from './luno-sync.service';
import { LunoBtcAccountingService } from './luno-btc-accounting.service';
import { LunoController } from './luno.controller';
import { LunoBtcLot } from './entities/luno-btc-lot.entity';
import { LunoBtcDisposal } from './entities/luno-btc-disposal.entity';
import { LunoBtcDisposalLot } from './entities/luno-btc-disposal-lot.entity';
import { LunoBtcAccountingSnapshot } from './entities/luno-btc-snapshot.entity';

export const LUNO_ENTITIES = [
  LunoSyncRun,
  LunoAccount,
  LunoBalance,
  LunoTransactionRow,
  LunoOrderRow,
  LunoWithdrawalRow,
  LunoTransferRow,
  LunoUserTradeRow,
  LunoBtcLot,
  LunoBtcDisposal,
  LunoBtcDisposalLot,
  LunoBtcAccountingSnapshot,
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
    LunoBtcAccountingService,
  ],
  exports: [
    LunoApiService,
    LunoSyncService,
    LunoHealthService,
    LunoBtcAccountingService,
  ],
})
export class LunoModule {}
