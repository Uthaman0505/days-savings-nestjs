import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('SalaryAllocation')
export class SalaryAllocationModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'salary_plan_id' })
  salaryPlanId: string;

  @Field(() => String)
  category: string;

  @Field(() => Int, { name: 'amount_cents' })
  amountCents: number;

  @Field(() => Float, { name: 'percent_share' })
  percentShare: number;

  @Field(() => Int, { name: 'sort_order' })
  sortOrder: number;

  @Field(() => Boolean, { name: 'is_locked' })
  isLocked: boolean;

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}

@ObjectType('SalaryPlan')
export class SalaryPlanModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => String, { name: 'month_key' })
  monthKey: string;

  @Field(() => Int, { name: 'salary_amount_cents' })
  salaryAmountCents: number;

  @Field(() => String)
  currency: string;

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => [SalaryAllocationModel])
  allocations: SalaryAllocationModel[];

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}

@ObjectType('DebtPriority')
export class DebtPriorityModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => String, { name: 'source_type' })
  sourceType: string;

  @Field(() => ID, { name: 'source_id' })
  sourceId: string;

  @Field(() => String, { name: 'debt_name' })
  debtName: string;

  @Field(() => Int, { name: 'outstanding_cents' })
  outstandingCents: number;

  @Field(() => Int, { name: 'original_amount_cents' })
  originalAmountCents: number;

  @Field(() => Float, { name: 'interest_rate' })
  interestRate: number;

  @Field(() => Int, { name: 'minimum_payment_cents' })
  minimumPaymentCents: number;

  @Field(() => Int, { name: 'current_payment_cents' })
  currentPaymentCents: number;

  @Field(() => Int, { name: 'priority_rank' })
  priorityRank: number;

  @Field(() => String)
  status: string;

  @Field(() => String, { name: 'priority_method' })
  priorityMethod: string;

  @Field(() => String)
  currency: string;

  @Field(() => Int, { name: 'progress_percent' })
  progressPercent: number;

  @Field(() => String, { nullable: true })
  notes: string | null;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}

@ObjectType('FinancialMission')
export class FinancialMissionModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => String)
  title: string;

  @Field(() => String, { nullable: true })
  description: string | null;

  @Field(() => String, { name: 'mission_kind' })
  missionKind: string;

  @Field(() => String)
  status: string;

  @Field(() => ID, { name: 'debt_priority_id', nullable: true })
  debtPriorityId: string | null;

  @Field(() => ID, { name: 'goal_id', nullable: true })
  goalId: string | null;

  @Field(() => Int, { name: 'sort_order' })
  sortOrder: number;

  @Field(() => Int, { name: 'progress_percent' })
  progressPercent: number;

  @Field(() => Int, { name: 'target_amount_cents' })
  targetAmountCents: number;

  @Field(() => Int, { name: 'current_amount_cents' })
  currentAmountCents: number;

  @Field(() => Date, { name: 'started_at', nullable: true })
  startedAt: Date | null;

  @Field(() => Date, { name: 'completed_at', nullable: true })
  completedAt: Date | null;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}

@ObjectType('MonthlySnapshot')
export class MonthlySnapshotModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => String, { name: 'month_key' })
  monthKey: string;

  @Field(() => Int, { name: 'salary_cents' })
  salaryCents: number;

  @Field(() => Int, { name: 'cash_available_cents' })
  cashAvailableCents: number;

  @Field(() => Int, { name: 'total_debt_cents' })
  totalDebtCents: number;

  @Field(() => Int, { name: 'debt_paid_cents' })
  debtPaidCents: number;

  @Field(() => Int, { name: 'expenses_cents' })
  expensesCents: number;

  @Field(() => Int, { name: 'income_cents' })
  incomeCents: number;

  @Field(() => Int, { name: 'savings_cents' })
  savingsCents: number;

  @Field(() => Int, { name: 'remaining_cash_cents' })
  remainingCashCents: number;

  @Field(() => Int, { name: 'health_score' })
  healthScore: number;

  @Field(() => String, { name: 'health_band' })
  healthBand: string;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}

@ObjectType('ProjectionSettings')
export class ProjectionSettingsModel {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { name: 'user_id' })
  userId: string;

  @Field(() => Int, { name: 'monthly_extra_payment_cents' })
  monthlyExtraPaymentCents: number;

  @Field(() => String, { name: 'priority_method' })
  priorityMethod: string;

  @Field(() => String)
  currency: string;

  @Field(() => Date, { name: 'created_at' })
  createdAt: Date;

  @Field(() => Date, { name: 'updated_at' })
  updatedAt: Date;
}

@ObjectType('UpcomingBill')
export class UpcomingBillModel {
  @Field(() => ID)
  id: string;

  @Field(() => String)
  name: string;

  @Field(() => String, { name: 'bill_kind' })
  billKind: string;

  @Field(() => Int, { name: 'amount_cents' })
  amountCents: number;

  @Field(() => String, { name: 'due_date' })
  dueDate: string;

  @Field(() => Boolean, { name: 'is_paid' })
  isPaid: boolean;

  @Field(() => Int, { name: 'days_remaining' })
  daysRemaining: number;

  @Field(() => Boolean, { name: 'is_overdue' })
  isOverdue: boolean;

  @Field(() => String)
  currency: string;

  @Field(() => String, { name: 'source_type', nullable: true })
  sourceType: string | null;

  @Field(() => ID, { name: 'source_id', nullable: true })
  sourceId: string | null;
}

@ObjectType('ProjectionMonthPoint')
export class ProjectionMonthPointModel {
  @Field(() => String, { name: 'month_key' })
  monthKey: string;

  @Field(() => Int, { name: 'debt_remaining_cents' })
  debtRemainingCents: number;

  @Field(() => Int, { name: 'payment_cents' })
  paymentCents: number;

  @Field(() => Int, { name: 'interest_cents' })
  interestCents: number;

  @Field(() => Int, { name: 'cash_flow_cents' })
  cashFlowCents: number;
}

@ObjectType('FinancialProjection')
export class FinancialProjectionModel {
  @Field(() => String, { name: 'debt_free_date', nullable: true })
  debtFreeDate: string | null;

  @Field(() => Int, { name: 'months_remaining' })
  monthsRemaining: number;

  @Field(() => Int, { name: 'interest_saved_cents' })
  interestSavedCents: number;

  @Field(() => Int, { name: 'total_interest_cents' })
  totalInterestCents: number;

  @Field(() => Int, { name: 'total_debt_cents' })
  totalDebtCents: number;

  @Field(() => Int, { name: 'monthly_extra_payment_cents' })
  monthlyExtraPaymentCents: number;

  @Field(() => [ProjectionMonthPointModel])
  months: ProjectionMonthPointModel[];
}

@ObjectType('MissionTimelineEvent')
export class MissionTimelineEventModel {
  @Field(() => ID)
  id: string;

  @Field(() => String)
  title: string;

  @Field(() => String, { name: 'event_type' })
  eventType: string;

  @Field(() => Date, { name: 'occurred_at' })
  occurredAt: Date;

  @Field(() => Int, { name: 'amount_cents', nullable: true })
  amountCents: number | null;

  @Field(() => String, { nullable: true })
  description: string | null;
}

@ObjectType('MissionDashboard')
export class MissionDashboardModel {
  @Field(() => String, { name: 'month_key' })
  monthKey: string;

  @Field(() => Int, { name: 'salary_cents' })
  salaryCents: number;

  @Field(() => Int, { name: 'cash_available_cents' })
  cashAvailableCents: number;

  @Field(() => Int, { name: 'total_debt_cents' })
  totalDebtCents: number;

  @Field(() => Int, { name: 'debt_paid_this_month_cents' })
  debtPaidThisMonthCents: number;

  @Field(() => Int, { name: 'remaining_cash_cents' })
  remainingCashCents: number;

  @Field(() => Int, { name: 'income_cents' })
  incomeCents: number;

  @Field(() => Int, { name: 'expenses_cents' })
  expensesCents: number;

  @Field(() => Int, { name: 'health_score' })
  healthScore: number;

  @Field(() => String, { name: 'health_band' })
  healthBand: string;

  @Field(() => FinancialMissionModel, {
    name: 'current_mission',
    nullable: true,
  })
  currentMission: FinancialMissionModel | null;

  @Field(() => FinancialMissionModel, {
    name: 'next_mission',
    nullable: true,
  })
  nextMission: FinancialMissionModel | null;

  @Field(() => [UpcomingBillModel], { name: 'upcoming_bills' })
  upcomingBills: UpcomingBillModel[];

  @Field(() => [DebtPriorityModel], { name: 'debt_progress' })
  debtProgress: DebtPriorityModel[];

  @Field(() => String)
  currency: string;
}
