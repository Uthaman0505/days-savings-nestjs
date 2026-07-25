import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../auth/roles.guard';
import { PawnCollateral } from './pawn-collateral.entity';
import { PawnLoan } from './pawn-loan.entity';
import { PawnLoanResolver } from './pawn-loan.resolver';
import { PawnLoanService } from './pawn-loan.service';
import { PawnPayment } from './pawn-payment.entity';
import { PawnRenewal } from './pawn-renewal.entity';
import { PawnTransaction } from './pawn-transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PawnLoan,
      PawnCollateral,
      PawnPayment,
      PawnRenewal,
      PawnTransaction,
    ]),
  ],
  providers: [PawnLoanService, PawnLoanResolver, RolesGuard],
  exports: [PawnLoanService],
})
export class PawnLoanModule {}
