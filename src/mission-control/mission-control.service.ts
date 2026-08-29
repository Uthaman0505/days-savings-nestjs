import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Account } from '../account/account.entity';
import { CreditCard } from '../credit-card/credit-card.entity';
import { Expense } from '../expense/expense.entity';
import { FamilyLoan } from '../family-loan/family-loan.entity';
import { GoalsService } from '../goals/goals.service';
import { HouseLoan } from '../house-loan/house-loan.entity';
import { HouseLoanPayment } from '../house-loan-payment/house-loan-payment.entity';
import { Income } from '../income/income.entity';
import { Insurance } from '../insurance/insurance.entity';
import { CreditCardPayment } from '../credit-card-payment/credit-card-payment.entity';
import { FamilyLoanPayment } from '../family-loan-payment/family-loan-payment.entity';
import { PawnLoan } from '../pawn-loan/pawn-loan.entity';
import { RecurringTransaction } from '../recurring-transaction/recurring-transaction.entity';
import { Savings } from '../savings/savings.entity';
import { DebtPriority } from './debt-priority.entity';
import { FinancialMission } from './financial-mission.entity';
import {
  AllocateExtraDebtPaymentInput,
  ComputeProjectionInput,
  CreateManualDebtPriorityInput,
  CreateSalaryPlanInput,
  ReorderDebtPrioritiesInput,
  SyncDebtPrioritiesInput,
  UpdateSalaryAllocationsInput,
  UpsertProjectionSettingsInput,
} from './dto/mission-control.input';
import {
  computeHealthScore,
  currentMonthKey,
  healthBandForScore,
  progressPercent,
  projectDebtPayoff,
  sortDebtsByMethod,
  toDebtLike,
} from './mission-control.engine';
import {
  DEFAULT_SALARY_ALLOCATION_PERCENTS,
  SALARY_ALLOCATION_CATEGORIES,
  type DebtPriorityMethod,
  type DebtSourceType,
  type SalaryAllocationCategory,
} from './mission-control.enums';
import {
  DebtPriorityModel,
  FinancialMissionModel,
  FinancialProjectionModel,
  MissionDashboardModel,
  MissionTimelineEventModel,
  MonthlySnapshotModel,
  ProjectionSettingsModel,
  SalaryAllocationModel,
  SalaryPlanModel,
  UpcomingBillModel,
} from './models/mission-control.model';
import { MonthlySnapshot } from './monthly-snapshot.entity';
import { ProjectionSettings } from './projection-settings.entity';
import { SalaryAllocation } from './salary-allocation.entity';
import { SalaryPlan } from './salary-plan.entity';

@Injectable()
export class MissionControlService {
  constructor(
    @InjectRepository(SalaryPlan)
    private readonly salaryPlanRepo: Repository<SalaryPlan>,
    @InjectRepository(SalaryAllocation)
    private readonly allocationRepo: Repository<SalaryAllocation>,
    @InjectRepository(DebtPriority)
    private readonly debtPriorityRepo: Repository<DebtPriority>,
    @InjectRepository(FinancialMission)
    private readonly missionRepo: Repository<FinancialMission>,
    @InjectRepository(MonthlySnapshot)
    private readonly snapshotRepo: Repository<MonthlySnapshot>,
    @InjectRepository(ProjectionSettings)
    private readonly projectionRepo: Repository<ProjectionSettings>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(CreditCard)
    private readonly creditCardRepo: Repository<CreditCard>,
    @InjectRepository(HouseLoan)
    private readonly houseLoanRepo: Repository<HouseLoan>,
    @InjectRepository(FamilyLoan)
    private readonly familyLoanRepo: Repository<FamilyLoan>,
    @InjectRepository(PawnLoan)
    private readonly pawnLoanRepo: Repository<PawnLoan>,
    @InjectRepository(Insurance)
    private readonly insuranceRepo: Repository<Insurance>,
    @InjectRepository(Income)
    private readonly incomeRepo: Repository<Income>,
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(Savings)
    private readonly savingsRepo: Repository<Savings>,
    @InjectRepository(RecurringTransaction)
    private readonly recurringRepo: Repository<RecurringTransaction>,
    @InjectRepository(CreditCardPayment)
    private readonly ccPaymentRepo: Repository<CreditCardPayment>,
    @InjectRepository(HouseLoanPayment)
    private readonly hlPaymentRepo: Repository<HouseLoanPayment>,
    @InjectRepository(FamilyLoanPayment)
    private readonly flPaymentRepo: Repository<FamilyLoanPayment>,
    private readonly goalsService: GoalsService,
  ) {}

  // —— Salary plans ——

  async createSalaryPlan(
    userId: string,
    input: CreateSalaryPlanInput,
  ): Promise<SalaryPlanModel> {
    const monthKey = input.month_key ?? currentMonthKey();
    const existing = await this.salaryPlanRepo.findOne({
      where: { userId, monthKey },
      relations: ['allocations'],
    });
    if (existing) {
      existing.salaryAmountCents = input.salary_amount_cents;
      existing.currency = input.currency ?? existing.currency;
      existing.notes = input.notes ?? existing.notes;
      await this.salaryPlanRepo.save(existing);
      await this.rebuildDefaultAllocations(existing);
      const reloaded = await this.salaryPlanRepo.findOneOrFail({
        where: { id: existing.id },
        relations: ['allocations'],
      });
      return this.toSalaryPlanModel(reloaded);
    }

    const plan = this.salaryPlanRepo.create({
      userId,
      monthKey,
      salaryAmountCents: input.salary_amount_cents,
      currency: input.currency ?? 'MYR',
      notes: input.notes ?? null,
    });
    const saved = await this.salaryPlanRepo.save(plan);
    await this.rebuildDefaultAllocations(saved);
    const reloaded = await this.salaryPlanRepo.findOneOrFail({
      where: { id: saved.id },
      relations: ['allocations'],
    });
    return this.toSalaryPlanModel(reloaded);
  }

  async getSalaryPlan(
    userId: string,
    monthKey?: string,
  ): Promise<SalaryPlanModel | null> {
    const key = monthKey ?? currentMonthKey();
    const plan = await this.salaryPlanRepo.findOne({
      where: { userId, monthKey: key },
      relations: ['allocations'],
    });
    return plan ? this.toSalaryPlanModel(plan) : null;
  }

  async updateSalaryAllocations(
    userId: string,
    input: UpdateSalaryAllocationsInput,
  ): Promise<SalaryPlanModel> {
    const plan = await this.salaryPlanRepo.findOne({
      where: { id: input.salary_plan_id, userId },
      relations: ['allocations'],
    });
    if (!plan) {
      throw new NotFoundException('Salary plan not found');
    }

    const total = input.allocations.reduce((s, a) => s + a.amount_cents, 0);
    if (total > plan.salaryAmountCents) {
      throw new BadRequestException(
        'Allocations cannot exceed the salary amount.',
      );
    }

    await this.allocationRepo.delete({ salaryPlanId: plan.id });
    const rows = input.allocations.map((line, index) =>
      this.allocationRepo.create({
        salaryPlanId: plan.id,
        category: line.category as SalaryAllocationCategory,
        amountCents: line.amount_cents,
        percentShare: String(
          line.percent_share ??
            (plan.salaryAmountCents > 0
              ? (line.amount_cents / plan.salaryAmountCents) * 100
              : 0),
        ),
        sortOrder: index,
        isLocked: line.is_locked ?? false,
        notes: line.notes ?? null,
      }),
    );
    await this.allocationRepo.save(rows);

    // Keep remaining cash in sync if not provided.
    const hasRemaining = input.allocations.some(
      (a) => a.category === 'REMAINING_CASH',
    );
    if (!hasRemaining) {
      const remaining = plan.salaryAmountCents - total;
      await this.allocationRepo.save(
        this.allocationRepo.create({
          salaryPlanId: plan.id,
          category: 'REMAINING_CASH',
          amountCents: Math.max(0, remaining),
          percentShare: String(
            plan.salaryAmountCents > 0
              ? (Math.max(0, remaining) / plan.salaryAmountCents) * 100
              : 0,
          ),
          sortOrder: SALARY_ALLOCATION_CATEGORIES.length,
          isLocked: false,
          notes: null,
        }),
      );
    }

    const reloaded = await this.salaryPlanRepo.findOneOrFail({
      where: { id: plan.id },
      relations: ['allocations'],
    });
    return this.toSalaryPlanModel(reloaded);
  }

  private async rebuildDefaultAllocations(plan: SalaryPlan): Promise<void> {
    await this.allocationRepo.delete({ salaryPlanId: plan.id });
    const rows = SALARY_ALLOCATION_CATEGORIES.map((category, index) => {
      const percent = DEFAULT_SALARY_ALLOCATION_PERCENTS[category];
      const amount = Math.round((plan.salaryAmountCents * percent) / 100);
      return this.allocationRepo.create({
        salaryPlanId: plan.id,
        category,
        amountCents: amount,
        percentShare: String(percent),
        sortOrder: index,
        isLocked: false,
        notes: null,
      });
    });
    // Fix rounding drift into REMAINING_CASH.
    const sum = rows.reduce((s, r) => s + r.amountCents, 0);
    const drift = plan.salaryAmountCents - sum;
    const remaining = rows.find((r) => r.category === 'REMAINING_CASH');
    if (remaining) {
      remaining.amountCents = Math.max(0, remaining.amountCents + drift);
    }
    await this.allocationRepo.save(rows);
  }

  // —— Debt priorities ——

  async syncDebtPriorities(
    userId: string,
    input: SyncDebtPrioritiesInput,
  ): Promise<DebtPriorityModel[]> {
    const method = input.priority_method as DebtPriorityMethod;
    const discovered = await this.discoverDebts(userId);

    for (const debt of discovered) {
      const existing = await this.debtPriorityRepo.findOne({
        where: {
          userId,
          sourceType: debt.sourceType,
          sourceId: debt.sourceId,
        },
      });
      if (existing) {
        existing.debtName = debt.debtName;
        existing.outstandingCents = debt.outstandingCents;
        existing.originalAmountCents = Math.max(
          existing.originalAmountCents,
          debt.originalAmountCents,
        );
        existing.interestRate = String(debt.interestRate);
        existing.minimumPaymentCents = debt.minimumPaymentCents;
        existing.currentPaymentCents = debt.currentPaymentCents;
        existing.currency = debt.currency;
        existing.priorityMethod = method;
        if (debt.outstandingCents <= 0) {
          existing.status = 'PAID_OFF';
        } else if (existing.status === 'PAID_OFF') {
          existing.status = 'QUEUED';
        }
        await this.debtPriorityRepo.save(existing);
      } else {
        await this.debtPriorityRepo.save(
          this.debtPriorityRepo.create({
            userId,
            sourceType: debt.sourceType,
            sourceId: debt.sourceId,
            debtName: debt.debtName,
            outstandingCents: debt.outstandingCents,
            originalAmountCents: debt.originalAmountCents,
            interestRate: String(debt.interestRate),
            minimumPaymentCents: debt.minimumPaymentCents,
            currentPaymentCents: debt.currentPaymentCents,
            priorityRank: 999,
            status: debt.outstandingCents <= 0 ? 'PAID_OFF' : 'QUEUED',
            priorityMethod: method,
            currency: debt.currency,
            notes: null,
          }),
        );
      }
    }

    await this.recomputeRanksAndMissions(userId, method);
    return this.listDebtPriorities(userId);
  }

  async listDebtPriorities(userId: string): Promise<DebtPriorityModel[]> {
    const rows = await this.debtPriorityRepo.find({
      where: { userId },
      order: { priorityRank: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((r) => this.toDebtPriorityModel(r));
  }

  async reorderDebtPriorities(
    userId: string,
    input: ReorderDebtPrioritiesInput,
  ): Promise<DebtPriorityModel[]> {
    const rows = await this.debtPriorityRepo.find({
      where: { userId, id: In(input.ordered_ids) },
    });
    if (rows.length !== input.ordered_ids.length) {
      throw new BadRequestException(
        'One or more debt priorities were not found.',
      );
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    input.ordered_ids.forEach((id, index) => {
      const row = byId.get(id)!;
      row.priorityRank = index + 1;
      row.priorityMethod = 'CUSTOM';
      row.status =
        row.outstandingCents <= 0
          ? 'PAID_OFF'
          : index === 0
            ? 'CURRENT_TARGET'
            : 'QUEUED';
    });
    await this.debtPriorityRepo.save([...byId.values()]);
    await this.syncMissionsFromDebts(userId);
    return this.listDebtPriorities(userId);
  }

  async allocateExtraPayment(
    userId: string,
    input: AllocateExtraDebtPaymentInput,
  ): Promise<DebtPriorityModel> {
    const row = await this.debtPriorityRepo.findOne({
      where: { id: input.debt_priority_id, userId },
    });
    if (!row) {
      throw new NotFoundException('Debt priority not found');
    }
    if (row.outstandingCents <= 0) {
      throw new BadRequestException('This debt is already paid off.');
    }

    row.currentPaymentCents += input.extra_amount_cents;
    row.outstandingCents = Math.max(
      0,
      row.outstandingCents - input.extra_amount_cents,
    );
    if (row.outstandingCents <= 0) {
      row.status = 'PAID_OFF';
      row.outstandingCents = 0;
    }
    await this.debtPriorityRepo.save(row);

    if (row.status === 'PAID_OFF') {
      await this.recomputeRanksAndMissions(userId, row.priorityMethod);
    } else {
      await this.syncMissionsFromDebts(userId);
    }

    const refreshed = await this.debtPriorityRepo.findOneOrFail({
      where: { id: row.id },
    });
    return this.toDebtPriorityModel(refreshed);
  }

  async createManualDebtPriority(
    userId: string,
    input: CreateManualDebtPriorityInput,
  ): Promise<DebtPriorityModel> {
    const settings = await this.getOrCreateProjectionSettings(userId);
    const row = await this.debtPriorityRepo.save(
      this.debtPriorityRepo.create({
        userId,
        sourceType: input.source_type as DebtSourceType,
        sourceId: input.source_id,
        debtName: input.debt_name,
        outstandingCents: input.outstanding_cents,
        originalAmountCents:
          input.original_amount_cents ?? input.outstanding_cents,
        interestRate: String(input.interest_rate ?? 0),
        minimumPaymentCents: input.minimum_payment_cents ?? 0,
        currentPaymentCents:
          input.current_payment_cents ?? input.minimum_payment_cents ?? 0,
        priorityRank: 999,
        status: input.outstanding_cents <= 0 ? 'PAID_OFF' : 'QUEUED',
        priorityMethod: settings.priorityMethod,
        currency: settings.currency,
        notes: null,
      }),
    );
    await this.recomputeRanksAndMissions(userId, settings.priorityMethod);
    return this.toDebtPriorityModel(
      await this.debtPriorityRepo.findOneOrFail({ where: { id: row.id } }),
    );
  }

  private async discoverDebts(userId: string) {
    const [cards, houseLoans, familyLoans, pawns] = await Promise.all([
      this.creditCardRepo.find({ where: { userId, isActive: true } }),
      this.houseLoanRepo.find({ where: { userId, isActive: true } }),
      this.familyLoanRepo.find({ where: { userId, isActive: true } }),
      this.pawnLoanRepo.find({ where: { userId } }),
    ]);

    const debts: Array<{
      sourceType: DebtSourceType;
      sourceId: string;
      debtName: string;
      outstandingCents: number;
      originalAmountCents: number;
      interestRate: number;
      minimumPaymentCents: number;
      currentPaymentCents: number;
      currency: string;
    }> = [];

    for (const card of cards) {
      debts.push({
        sourceType: 'CREDIT_CARD',
        sourceId: card.id,
        debtName: card.cardName,
        outstandingCents: card.outstandingBalanceCents,
        originalAmountCents: card.creditLimitCents,
        interestRate: 0,
        minimumPaymentCents: Math.max(
          5000,
          Math.round(card.outstandingBalanceCents * 0.05),
        ),
        currentPaymentCents: Math.max(
          5000,
          Math.round(card.outstandingBalanceCents * 0.05),
        ),
        currency: card.currency,
      });
    }

    for (const loan of houseLoans) {
      debts.push({
        sourceType: 'HOUSE_LOAN',
        sourceId: loan.id,
        debtName: loan.loanName,
        outstandingCents: loan.currentBalanceCents,
        originalAmountCents: loan.principalAmountCents,
        interestRate: Number(loan.interestRate) || 0,
        minimumPaymentCents: loan.monthlyInstallmentCents,
        currentPaymentCents: loan.monthlyInstallmentCents,
        currency: loan.currency,
      });
    }

    for (const loan of familyLoans) {
      if (loan.loanType !== 'BORROWED') continue;
      debts.push({
        sourceType: 'FAMILY_LOAN',
        sourceId: loan.id,
        debtName: `Family — ${loan.personName}`,
        outstandingCents: loan.outstandingBalanceCents,
        originalAmountCents: loan.principalAmountCents,
        interestRate: Number(loan.interestRate) || 0,
        minimumPaymentCents: Math.max(
          0,
          Math.round(loan.outstandingBalanceCents / 12),
        ),
        currentPaymentCents: Math.max(
          0,
          Math.round(loan.outstandingBalanceCents / 12),
        ),
        currency: loan.currency,
      });
    }

    for (const pawn of pawns) {
      if (['REDEEMED', 'FORFEITED', 'CLOSED'].includes(pawn.status)) continue;
      debts.push({
        sourceType: 'PAWN_LOAN',
        sourceId: pawn.id,
        debtName: `Pawn — ${pawn.pawnShopName}`,
        outstandingCents: pawn.outstandingPrincipalCents,
        originalAmountCents: pawn.principalAmountCents,
        interestRate: Number(pawn.interestRate) || 0,
        minimumPaymentCents: 0,
        currentPaymentCents: 0,
        currency: pawn.currency,
      });
    }

    return debts;
  }

  private async recomputeRanksAndMissions(
    userId: string,
    method: DebtPriorityMethod,
  ): Promise<void> {
    const rows = await this.debtPriorityRepo.find({ where: { userId } });
    const ordered = sortDebtsByMethod(rows.map(toDebtLike), method);
    const byId = new Map(rows.map((r) => [r.id, r]));
    ordered.forEach((item, index) => {
      const row = byId.get(item.id)!;
      row.priorityRank = index + 1;
      row.priorityMethod = method;
      row.status =
        row.outstandingCents <= 0
          ? 'PAID_OFF'
          : index === 0
            ? 'CURRENT_TARGET'
            : 'QUEUED';
    });
    // Paid off / archived keep rank at end.
    for (const row of rows) {
      if (row.outstandingCents <= 0) {
        row.status = 'PAID_OFF';
      }
    }
    await this.debtPriorityRepo.save(rows);
    await this.syncMissionsFromDebts(userId);
  }

  private async syncMissionsFromDebts(userId: string): Promise<void> {
    const debts = await this.debtPriorityRepo.find({
      where: { userId },
      order: { priorityRank: 'ASC' },
    });
    const active = debts.filter((d) => d.outstandingCents > 0);
    const current = active[0] ?? null;
    const next = active[1] ?? null;

    // Archive completed debt missions.
    const activeMissions = await this.missionRepo.find({
      where: { userId, status: 'ACTIVE', missionKind: 'DEBT_PAYOFF' },
    });
    for (const mission of activeMissions) {
      const debt = debts.find((d) => d.id === mission.debtPriorityId);
      if (!debt || debt.outstandingCents <= 0) {
        mission.status = 'COMPLETED';
        mission.progressPercent = 100;
        mission.completedAt = new Date();
        await this.missionRepo.save(mission);
      }
    }

    if (current) {
      await this.upsertDebtMission(userId, current, 0);
    }
    if (next) {
      await this.upsertDebtMission(userId, next, 1);
    }
  }

  private async upsertDebtMission(
    userId: string,
    debt: DebtPriority,
    sortOrder: number,
  ): Promise<void> {
    let mission = await this.missionRepo.findOne({
      where: {
        userId,
        debtPriorityId: debt.id,
        missionKind: 'DEBT_PAYOFF',
      },
    });
    const pct = progressPercent(
      debt.originalAmountCents,
      debt.outstandingCents,
    );
    if (!mission) {
      mission = this.missionRepo.create({
        userId,
        title: debt.debtName,
        description: `Pay off ${debt.debtName}`,
        missionKind: 'DEBT_PAYOFF',
        status: 'ACTIVE',
        debtPriorityId: debt.id,
        goalId: null,
        sortOrder,
        progressPercent: pct,
        targetAmountCents: debt.originalAmountCents,
        currentAmountCents: Math.max(
          0,
          debt.originalAmountCents - debt.outstandingCents,
        ),
        startedAt: new Date(),
        completedAt: null,
      });
    } else {
      mission.title = debt.debtName;
      mission.status = 'ACTIVE';
      mission.sortOrder = sortOrder;
      mission.progressPercent = pct;
      mission.targetAmountCents = debt.originalAmountCents;
      mission.currentAmountCents = Math.max(
        0,
        debt.originalAmountCents - debt.outstandingCents,
      );
      mission.completedAt = null;
    }
    await this.missionRepo.save(mission);
  }

  // —— Missions ——

  async listMissions(
    userId: string,
    includeArchived = false,
  ): Promise<FinancialMissionModel[]> {
    const rows = await this.missionRepo.find({
      where: includeArchived ? { userId } : { userId, status: In(['ACTIVE']) },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
    // Also include completed for progress screen when requested.
    if (includeArchived) {
      return rows.map((r) => this.toMissionModel(r));
    }
    const completed = await this.missionRepo.find({
      where: { userId, status: 'COMPLETED' },
      order: { completedAt: 'DESC' },
      take: 20,
    });
    return [...rows, ...completed].map((r) => this.toMissionModel(r));
  }

  async archiveCompletedMissions(userId: string): Promise<number> {
    const completed = await this.missionRepo.find({
      where: { userId, status: 'COMPLETED' },
    });
    for (const row of completed) {
      row.status = 'ARCHIVED';
    }
    await this.missionRepo.save(completed);
    return completed.length;
  }

  // —— Projection ——

  async getOrCreateProjectionSettings(
    userId: string,
  ): Promise<ProjectionSettings> {
    let row = await this.projectionRepo.findOne({ where: { userId } });
    if (!row) {
      row = await this.projectionRepo.save(
        this.projectionRepo.create({
          userId,
          monthlyExtraPaymentCents: 0,
          priorityMethod: 'AVALANCHE',
          currency: 'MYR',
        }),
      );
    }
    return row;
  }

  async upsertProjectionSettings(
    userId: string,
    input: UpsertProjectionSettingsInput,
  ): Promise<ProjectionSettingsModel> {
    const row = await this.getOrCreateProjectionSettings(userId);
    row.monthlyExtraPaymentCents = input.monthly_extra_payment_cents;
    if (input.priority_method) {
      row.priorityMethod = input.priority_method as DebtPriorityMethod;
    }
    if (input.currency) {
      row.currency = input.currency;
    }
    await this.projectionRepo.save(row);
    if (input.priority_method) {
      await this.recomputeRanksAndMissions(
        userId,
        input.priority_method as DebtPriorityMethod,
      );
    }
    return this.toProjectionSettingsModel(row);
  }

  async computeProjection(
    userId: string,
    input: ComputeProjectionInput = {},
  ): Promise<FinancialProjectionModel> {
    const settings = await this.getOrCreateProjectionSettings(userId);
    const extra =
      input.monthly_extra_payment_cents ?? settings.monthlyExtraPaymentCents;
    const method = (input.priority_method ??
      settings.priorityMethod) as DebtPriorityMethod;

    const debts = await this.debtPriorityRepo.find({ where: { userId } });
    const active = debts.filter((d) => d.outstandingCents > 0);
    const result = projectDebtPayoff(
      active.map((d) => ({
        outstandingCents: d.outstandingCents,
        interestRate: Number(d.interestRate) || 0,
        minimumPaymentCents: d.minimumPaymentCents,
        currentPaymentCents: d.currentPaymentCents,
      })),
      extra,
      method,
    );

    return {
      debtFreeDate: result.debtFreeDate,
      monthsRemaining: result.monthsRemaining,
      interestSavedCents: result.interestSavedCents,
      totalInterestCents: result.totalInterestCents,
      totalDebtCents: result.totalDebtCents,
      monthlyExtraPaymentCents: extra,
      months: result.months,
    };
  }

  // —— Dashboard ——

  async getMissionDashboard(userId: string): Promise<MissionDashboardModel> {
    const monthKey = currentMonthKey();
    const [
      salaryPlan,
      accounts,
      debts,
      missions,
      incomes,
      expenses,
      savings,
      bills,
      debtPaid,
    ] = await Promise.all([
      this.getSalaryPlan(userId, monthKey),
      this.accountRepo.find({ where: { userId, isArchived: false } }),
      this.listDebtPriorities(userId),
      this.missionRepo.find({
        where: { userId, status: 'ACTIVE' },
        order: { sortOrder: 'ASC' },
      }),
      this.sumIncomeThisMonth(userId),
      this.sumExpenseThisMonth(userId),
      this.savingsRepo.find({ where: { userId, isActive: true } }),
      this.getUpcomingBills(userId),
      this.sumDebtPaidThisMonth(userId),
    ]);

    const cashAvailableCents = accounts.reduce(
      (s, a) => s + (a.currentBalanceCents || 0),
      0,
    );
    const totalDebtCents = debts
      .filter((d) => d.outstandingCents > 0)
      .reduce((s, d) => s + d.outstandingCents, 0);
    const savingsCents = savings.reduce(
      (s, row) => s + row.currentBalanceCents,
      0,
    );
    const salaryCents = salaryPlan?.salaryAmountCents ?? incomes;
    const remainingFromPlan =
      salaryPlan?.allocations.find((a) => a.category === 'REMAINING_CASH')
        ?.amountCents ?? Math.max(0, salaryCents - expenses);

    const overdueCount = bills.filter((b) => b.isOverdue).length;
    const onTimeRatio =
      bills.length === 0 ? 1 : (bills.length - overdueCount) / bills.length;
    const budgetRatio =
      salaryCents > 0
        ? Math.max(0, 1 - expenses / salaryCents)
        : expenses === 0
          ? 1
          : 0.4;

    const healthScore = computeHealthScore({
      cashAvailableCents,
      monthlyExpensesCents: expenses || 1,
      totalDebtCents,
      monthlyIncomeCents: salaryCents || incomes || 1,
      savingsCents,
      onTimePaymentRatio: onTimeRatio,
      budgetPerformanceRatio: budgetRatio,
    });

    const currentMission = missions[0]
      ? this.toMissionModel(missions[0])
      : null;
    const nextMission = missions[1] ? this.toMissionModel(missions[1]) : null;

    // Persist snapshot (upsert).
    await this.upsertSnapshot(userId, {
      monthKey,
      salaryCents,
      cashAvailableCents,
      totalDebtCents,
      debtPaidCents: debtPaid,
      expensesCents: expenses,
      incomeCents: incomes,
      savingsCents,
      remainingCashCents: remainingFromPlan,
      healthScore,
      healthBand: healthBandForScore(healthScore),
    });

    return {
      monthKey,
      salaryCents,
      cashAvailableCents,
      totalDebtCents,
      debtPaidThisMonthCents: debtPaid,
      remainingCashCents: remainingFromPlan,
      incomeCents: incomes,
      expensesCents: expenses,
      healthScore,
      healthBand: healthBandForScore(healthScore),
      currentMission,
      nextMission,
      upcomingBills: bills.slice(0, 12),
      debtProgress: debts.filter((d) => d.status !== 'ARCHIVED'),
      currency: salaryPlan?.currency ?? 'MYR',
    };
  }

  async getUpcomingBills(userId: string): Promise<UpcomingBillModel[]> {
    const now = new Date();
    const bills: UpcomingBillModel[] = [];

    const [houseLoans, insurances, cards, recurring] = await Promise.all([
      this.houseLoanRepo.find({ where: { userId, isActive: true } }),
      this.insuranceRepo.find({ where: { userId, isActive: true } }),
      this.creditCardRepo.find({ where: { userId, isActive: true } }),
      this.recurringRepo.find({ where: { userId, isActive: true } }),
    ]);

    for (const loan of houseLoans) {
      const due = this.nextDueDate(loan.paymentDueDay, now);
      const days = this.daysUntil(due, now);
      bills.push({
        id: `hl-${loan.id}`,
        name: loan.loanName,
        billKind: 'HOUSE_LOAN',
        amountCents: loan.monthlyInstallmentCents,
        dueDate: due.toISOString().slice(0, 10),
        isPaid: false,
        daysRemaining: days,
        isOverdue: days < 0,
        currency: loan.currency,
        sourceType: 'HOUSE_LOAN',
        sourceId: loan.id,
      });
    }

    for (const policy of insurances) {
      const dueRaw = policy.renewalDate || policy.policyEndDate;
      if (!dueRaw) continue;
      const due = new Date(`${String(dueRaw).slice(0, 10)}T12:00:00`);
      const days = this.daysUntil(due, now);
      bills.push({
        id: `ins-${policy.id}`,
        name: policy.policyName,
        billKind: 'INSURANCE',
        amountCents: policy.monthlyPremiumCents ?? 0,
        dueDate: due.toISOString().slice(0, 10),
        isPaid: false,
        daysRemaining: days,
        isOverdue: days < 0,
        currency: policy.currency,
        sourceType: 'INSURANCE',
        sourceId: policy.id,
      });
    }

    for (const card of cards) {
      if (card.outstandingBalanceCents <= 0) continue;
      const due = this.nextDueDate(card.paymentDueDay, now);
      const days = this.daysUntil(due, now);
      bills.push({
        id: `cc-${card.id}`,
        name: card.cardName,
        billKind: 'CREDIT_CARD',
        amountCents: Math.max(
          5000,
          Math.round(card.outstandingBalanceCents * 0.05),
        ),
        dueDate: due.toISOString().slice(0, 10),
        isPaid: false,
        daysRemaining: days,
        isOverdue: days < 0,
        currency: card.currency,
        sourceType: 'CREDIT_CARD',
        sourceId: card.id,
      });
    }

    for (const row of recurring) {
      if (!row.nextExecutionDate) continue;
      const due = new Date(row.nextExecutionDate);
      const days = this.daysUntil(due, now);
      const kind = this.mapRecurringBillKind(row.name, row.targetModule);
      bills.push({
        id: `rec-${row.id}`,
        name: row.name,
        billKind: kind,
        amountCents: row.amountCents,
        dueDate: due.toISOString().slice(0, 10),
        isPaid: false,
        daysRemaining: days,
        isOverdue: days < 0,
        currency: row.currency,
        sourceType: 'RECURRING',
        sourceId: row.id,
      });
    }

    return bills.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  async getTimeline(userId: string): Promise<MissionTimelineEventModel[]> {
    const monthKey = currentMonthKey();
    const [start, end] = this.monthBounds(monthKey);
    const events: MissionTimelineEventModel[] = [];

    const [incomes, expenses, ccPays, hlPays, flPays, missions, snapshot] =
      await Promise.all([
        this.incomeRepo
          .createQueryBuilder('i')
          .where('i.user_id = :userId', { userId })
          .andWhere('i.received_date >= :start AND i.received_date <= :end', {
            start,
            end,
          })
          .orderBy('i.received_date', 'DESC')
          .take(20)
          .getMany(),
        this.expenseRepo
          .createQueryBuilder('e')
          .where('e.user_id = :userId', { userId })
          .andWhere('e.expense_date >= :start AND e.expense_date <= :end', {
            start,
            end,
          })
          .orderBy('e.expense_date', 'DESC')
          .take(20)
          .getMany(),
        this.ccPaymentRepo
          .createQueryBuilder('p')
          .where('p.user_id = :userId', { userId })
          .andWhere('p.payment_date >= :start AND p.payment_date <= :end', {
            start,
            end,
          })
          .orderBy('p.payment_date', 'DESC')
          .take(20)
          .getMany(),
        this.hlPaymentRepo
          .createQueryBuilder('p')
          .where('p.user_id = :userId', { userId })
          .andWhere('p.payment_date >= :start AND p.payment_date <= :end', {
            start,
            end,
          })
          .orderBy('p.payment_date', 'DESC')
          .take(20)
          .getMany(),
        this.flPaymentRepo
          .createQueryBuilder('p')
          .where('p.user_id = :userId', { userId })
          .andWhere('p.payment_date >= :start AND p.payment_date <= :end', {
            start,
            end,
          })
          .orderBy('p.payment_date', 'DESC')
          .take(20)
          .getMany(),
        this.missionRepo.find({
          where: { userId },
          order: { updatedAt: 'DESC' },
          take: 10,
        }),
        this.snapshotRepo.findOne({ where: { userId, monthKey } }),
      ]);

    for (const row of incomes) {
      events.push({
        id: `income-${row.id}`,
        title: 'Salary / Income received',
        eventType: 'SALARY_RECEIVED',
        occurredAt: new Date(row.receivedDate),
        amountCents: row.amountCents,
        description: row.description,
      });
    }
    for (const row of expenses) {
      events.push({
        id: `expense-${row.id}`,
        title: 'Bill / expense paid',
        eventType: 'BILL_PAID',
        occurredAt: new Date(row.expenseDate),
        amountCents: row.amountCents,
        description: row.description ?? row.merchantName,
      });
    }
    for (const row of [...ccPays, ...hlPays, ...flPays]) {
      events.push({
        id: `debt-${row.id}`,
        title: 'Debt payment',
        eventType: 'DEBT_PAYMENT',
        occurredAt: new Date(row.paymentDate),
        amountCents: row.amountCents,
        description: null,
      });
    }
    for (const mission of missions) {
      if (mission.status === 'COMPLETED' && mission.completedAt) {
        events.push({
          id: `mission-${mission.id}`,
          title: `Mission completed — ${mission.title}`,
          eventType: 'GOAL_PROGRESS',
          occurredAt: mission.completedAt,
          amountCents: mission.targetAmountCents,
          description: mission.description,
        });
      }
    }
    if (snapshot) {
      events.push({
        id: `snap-${snapshot.id}`,
        title: `Monthly snapshot ${monthKey}`,
        eventType: 'MONTHLY_SNAPSHOT',
        occurredAt: snapshot.updatedAt,
        amountCents: snapshot.remainingCashCents,
        description: `Health ${snapshot.healthBand} (${snapshot.healthScore})`,
      });
    }

    return events.sort(
      (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
    );
  }

  async listSnapshots(userId: string): Promise<MonthlySnapshotModel[]> {
    const rows = await this.snapshotRepo.find({
      where: { userId },
      order: { monthKey: 'DESC' },
      take: 24,
    });
    return rows.map((r) => this.toSnapshotModel(r));
  }

  async listGoals(userId: string) {
    return this.goalsService.findActiveGoals(userId);
  }

  // —— helpers ——

  private async upsertSnapshot(
    userId: string,
    data: {
      monthKey: string;
      salaryCents: number;
      cashAvailableCents: number;
      totalDebtCents: number;
      debtPaidCents: number;
      expensesCents: number;
      incomeCents: number;
      savingsCents: number;
      remainingCashCents: number;
      healthScore: number;
      healthBand: string;
    },
  ): Promise<void> {
    let row = await this.snapshotRepo.findOne({
      where: { userId, monthKey: data.monthKey },
    });
    if (!row) {
      row = this.snapshotRepo.create({ userId, monthKey: data.monthKey });
    }
    Object.assign(row, data, { payloadJson: null });
    await this.snapshotRepo.save(row);
  }

  private async sumIncomeThisMonth(userId: string): Promise<number> {
    const [start, end] = this.monthBounds(currentMonthKey());
    const raw = await this.incomeRepo
      .createQueryBuilder('i')
      .select('COALESCE(SUM(i.amount_cents), 0)', 'total')
      .where('i.user_id = :userId', { userId })
      .andWhere('i.received_date >= :start AND i.received_date <= :end', {
        start,
        end,
      })
      .getRawOne<{ total: string }>();
    return Number(raw?.total ?? 0);
  }

  private async sumExpenseThisMonth(userId: string): Promise<number> {
    const [start, end] = this.monthBounds(currentMonthKey());
    const raw = await this.expenseRepo
      .createQueryBuilder('e')
      .select('COALESCE(SUM(e.amount_cents), 0)', 'total')
      .where('e.user_id = :userId', { userId })
      .andWhere('e.expense_date >= :start AND e.expense_date <= :end', {
        start,
        end,
      })
      .getRawOne<{ total: string }>();
    return Number(raw?.total ?? 0);
  }

  private async sumDebtPaidThisMonth(userId: string): Promise<number> {
    const [start, end] = this.monthBounds(currentMonthKey());
    const [cc, hl, fl] = await Promise.all([
      this.ccPaymentRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount_cents), 0)', 'total')
        .where('p.user_id = :userId', { userId })
        .andWhere('p.payment_date >= :start AND p.payment_date <= :end', {
          start,
          end,
        })
        .getRawOne<{ total: string }>(),
      this.hlPaymentRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount_cents), 0)', 'total')
        .where('p.user_id = :userId', { userId })
        .andWhere('p.payment_date >= :start AND p.payment_date <= :end', {
          start,
          end,
        })
        .getRawOne<{ total: string }>(),
      this.flPaymentRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount_cents), 0)', 'total')
        .where('p.user_id = :userId', { userId })
        .andWhere('p.payment_date >= :start AND p.payment_date <= :end', {
          start,
          end,
        })
        .getRawOne<{ total: string }>(),
    ]);
    return (
      Number(cc?.total ?? 0) + Number(hl?.total ?? 0) + Number(fl?.total ?? 0)
    );
  }

  private monthBounds(monthKey: string): [string, string] {
    const [y, m] = monthKey.split('-').map(Number);
    const start = `${monthKey}-01`;
    const endDate = new Date(y, m, 0);
    const end = `${monthKey}-${String(endDate.getDate()).padStart(2, '0')}`;
    return [start, end];
  }

  private nextDueDate(dayOfMonth: number, from: Date): Date {
    const clamped = Math.min(Math.max(dayOfMonth || 1, 1), 28);
    let candidate = new Date(
      from.getFullYear(),
      from.getMonth(),
      clamped,
      12,
      0,
      0,
      0,
    );
    if (
      candidate < new Date(from.getFullYear(), from.getMonth(), from.getDate())
    ) {
      candidate = new Date(
        from.getFullYear(),
        from.getMonth() + 1,
        clamped,
        12,
        0,
        0,
        0,
      );
    }
    return candidate;
  }

  private daysUntil(date: Date, from: Date): number {
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((end.getTime() - start.getTime()) / 86_400_000);
  }

  private mapRecurringBillKind(name: string, targetModule: string): string {
    const n = name.toLowerCase();
    if (n.includes('internet')) return 'INTERNET';
    if (n.includes('phone') || n.includes('mobile')) return 'PHONE';
    if (n.includes('utilit') || n.includes('electric') || n.includes('water')) {
      return 'UTILITIES';
    }
    if (n.includes('road tax')) return 'ROAD_TAX';
    if (n.includes('ptptn')) return 'PTPTN';
    if (n.includes('subscri')) return 'SUBSCRIPTION';
    if (targetModule === 'INSURANCE_PAYMENT') return 'INSURANCE';
    if (targetModule === 'HOUSE_LOAN_PAYMENT') return 'HOUSE_LOAN';
    if (targetModule === 'CREDIT_CARD_PAYMENT') return 'CREDIT_CARD';
    return 'OTHER';
  }

  // —— mappers ——

  private toSalaryPlanModel(plan: SalaryPlan): SalaryPlanModel {
    const allocations = [...(plan.allocations ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((a) => this.toAllocationModel(a));
    return {
      id: plan.id,
      userId: plan.userId,
      monthKey: plan.monthKey,
      salaryAmountCents: plan.salaryAmountCents,
      currency: plan.currency,
      notes: plan.notes,
      allocations,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  private toAllocationModel(row: SalaryAllocation): SalaryAllocationModel {
    return {
      id: row.id,
      salaryPlanId: row.salaryPlanId,
      category: row.category,
      amountCents: row.amountCents,
      percentShare: Number(row.percentShare) || 0,
      sortOrder: row.sortOrder,
      isLocked: row.isLocked,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toDebtPriorityModel(row: DebtPriority): DebtPriorityModel {
    return {
      id: row.id,
      userId: row.userId,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      debtName: row.debtName,
      outstandingCents: row.outstandingCents,
      originalAmountCents: row.originalAmountCents,
      interestRate: Number(row.interestRate) || 0,
      minimumPaymentCents: row.minimumPaymentCents,
      currentPaymentCents: row.currentPaymentCents,
      priorityRank: row.priorityRank,
      status: row.status,
      priorityMethod: row.priorityMethod,
      currency: row.currency,
      progressPercent: progressPercent(
        row.originalAmountCents,
        row.outstandingCents,
      ),
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toMissionModel(row: FinancialMission): FinancialMissionModel {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      description: row.description,
      missionKind: row.missionKind,
      status: row.status,
      debtPriorityId: row.debtPriorityId,
      goalId: row.goalId,
      sortOrder: row.sortOrder,
      progressPercent: row.progressPercent,
      targetAmountCents: row.targetAmountCents,
      currentAmountCents: row.currentAmountCents,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toProjectionSettingsModel(
    row: ProjectionSettings,
  ): ProjectionSettingsModel {
    return {
      id: row.id,
      userId: row.userId,
      monthlyExtraPaymentCents: row.monthlyExtraPaymentCents,
      priorityMethod: row.priorityMethod,
      currency: row.currency,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toSnapshotModel(row: MonthlySnapshot): MonthlySnapshotModel {
    return {
      id: row.id,
      userId: row.userId,
      monthKey: row.monthKey,
      salaryCents: row.salaryCents,
      cashAvailableCents: row.cashAvailableCents,
      totalDebtCents: row.totalDebtCents,
      debtPaidCents: row.debtPaidCents,
      expensesCents: row.expensesCents,
      incomeCents: row.incomeCents,
      savingsCents: row.savingsCents,
      remainingCashCents: row.remainingCashCents,
      healthScore: row.healthScore,
      healthBand: row.healthBand,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
