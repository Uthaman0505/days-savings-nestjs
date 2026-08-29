import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../account/account.entity';
import { CreditCard } from '../credit-card/credit-card.entity';
import { CreditCardPayment } from '../credit-card-payment/credit-card-payment.entity';
import { Expense } from '../expense/expense.entity';
import { FamilyLoan } from '../family-loan/family-loan.entity';
import { FamilyLoanPayment } from '../family-loan-payment/family-loan-payment.entity';
import { GoalsModule } from '../goals/goals.module';
import { HouseLoan } from '../house-loan/house-loan.entity';
import { HouseLoanPayment } from '../house-loan-payment/house-loan-payment.entity';
import { Income } from '../income/income.entity';
import { Insurance } from '../insurance/insurance.entity';
import { PawnLoan } from '../pawn-loan/pawn-loan.entity';
import { RecurringTransaction } from '../recurring-transaction/recurring-transaction.entity';
import { Savings } from '../savings/savings.entity';
import { DebtPriority } from './debt-priority.entity';
import { FinancialMission } from './financial-mission.entity';
import { MissionControlResolver } from './mission-control.resolver';
import { MissionControlService } from './mission-control.service';
import { MonthlySnapshot } from './monthly-snapshot.entity';
import { ProjectionSettings } from './projection-settings.entity';
import { SalaryAllocation } from './salary-allocation.entity';
import { SalaryPlan } from './salary-plan.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalaryPlan,
      SalaryAllocation,
      DebtPriority,
      FinancialMission,
      MonthlySnapshot,
      ProjectionSettings,
      Account,
      CreditCard,
      HouseLoan,
      FamilyLoan,
      PawnLoan,
      Insurance,
      Income,
      Expense,
      Savings,
      RecurringTransaction,
      CreditCardPayment,
      HouseLoanPayment,
      FamilyLoanPayment,
    ]),
    GoalsModule,
  ],
  providers: [MissionControlService, MissionControlResolver],
  exports: [MissionControlService],
})
export class MissionControlModule {}
