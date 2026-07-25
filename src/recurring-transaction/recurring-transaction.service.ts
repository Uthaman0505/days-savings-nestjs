import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { AccountService } from '../account/account.service';
import { CategoryService } from '../category/category.service';
import { CreditCardPaymentService } from '../credit-card-payment/credit-card-payment.service';
import { ExpenseService } from '../expense/expense.service';
import { FamilyLoanPaymentService } from '../family-loan-payment/family-loan-payment.service';
import { GoalsService } from '../goals/goals.service';
import { HouseLoanPaymentService } from '../house-loan-payment/house-loan-payment.service';
import { IncomeService } from '../income/income.service';
import { InsurancePaymentService } from '../insurance-payment/insurance-payment.service';
import { SavingsService } from '../savings/savings.service';
import { TransferService } from '../transfer/transfer.service';
import {
  CreateRecurringTransactionInput,
  RECURRING_FREQUENCIES,
  RECURRING_TARGET_MODULES,
  RECURRING_TRANSACTION_TYPES,
} from './dto/create-recurring-transaction.input';
import { RecurringTransactionFilterInput } from './dto/recurring-transaction-filter.input';
import { UpdateRecurringTransactionInput } from './dto/update-recurring-transaction.input';
import { RecurringTransactionModel } from './models/recurring-transaction.model';
import {
  RecurringExecutionPayload,
  RecurringFrequency,
  RecurringTargetModule,
  RecurringTransaction,
  RecurringTransactionType,
} from './recurring-transaction.entity';

@Injectable()
export class RecurringTransactionService {
  private readonly logger = new Logger(RecurringTransactionService.name);

  constructor(
    @InjectRepository(RecurringTransaction)
    private readonly recurringRepo: Repository<RecurringTransaction>,
    private readonly accountService: AccountService,
    private readonly categoryService: CategoryService,
    private readonly incomeService: IncomeService,
    private readonly expenseService: ExpenseService,
    private readonly transferService: TransferService,
    private readonly savingsService: SavingsService,
    private readonly goalsService: GoalsService,
    private readonly creditCardPaymentService: CreditCardPaymentService,
    private readonly houseLoanPaymentService: HouseLoanPaymentService,
    private readonly insurancePaymentService: InsurancePaymentService,
    private readonly familyLoanPaymentService: FamilyLoanPaymentService,
  ) {}

  async findMyRecurring(
    userId: string,
    filter?: RecurringTransactionFilterInput,
  ): Promise<RecurringTransactionModel[]> {
    return this.queryRecurring(userId, filter ?? {});
  }

  async findActiveRecurring(userId: string): Promise<RecurringTransactionModel[]> {
    const rows = await this.recurringRepo.find({
      where: { userId, isActive: true },
      order: { nextExecutionDate: 'ASC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findUpcoming(
    userId: string,
    withinDays = 30,
  ): Promise<RecurringTransactionModel[]> {
    const now = new Date();
    const until = new Date(now);
    until.setUTCDate(until.getUTCDate() + withinDays);

    const rows = await this.recurringRepo.find({
      where: {
        userId,
        isActive: true,
        nextExecutionDate: Between(now, until),
      },
      order: { nextExecutionDate: 'ASC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findByIdForUser(
    userId: string,
    id: string,
  ): Promise<RecurringTransactionModel> {
    const row = await this.requireOwned(userId, id);
    return this.toModel(row);
  }

  async create(
    userId: string,
    input: CreateRecurringTransactionInput,
  ): Promise<RecurringTransactionModel> {
    const name = this.normalizeName(input.name);
    const targetModule = this.requireTargetModule(input.target_module);
    const transactionType = this.requireTransactionType(input.transaction_type);
    const frequency = this.requireFrequency(input.frequency);
    const intervalValue = this.requirePositiveInt(
      input.interval_value ?? 1,
      'Interval value',
    );
    const amountCents = this.requirePositiveInt(input.amount_cents, 'Amount');
    const startDate = this.requireDateString(input.start_date, 'Start date');
    const endDate =
      input.end_date !== undefined
        ? this.requireDateString(input.end_date, 'End date')
        : null;
    if (endDate) {
      this.assertDateOnOrAfter(
        endDate,
        startDate,
        'End date must not be before start date.',
      );
    }

    await this.accountService.findByIdForUser(userId, input.account_id);
    if (input.category_id) {
      await this.categoryService.assertAssignable(input.category_id, userId);
    }

    this.assertModuleRequirements(targetModule, input);

    const payload = this.buildPayloadFromCreate(input);
    const nextExecutionDate =
      input.next_execution_date ?? new Date(`${startDate}T00:00:00.000Z`);

    const entity = this.recurringRepo.create({
      userId,
      accountId: input.account_id,
      categoryId: input.category_id ?? null,
      targetModule,
      targetReferenceId: input.target_reference_id ?? null,
      name,
      description: input.description?.trim() || null,
      transactionType,
      amountCents,
      currency: (input.currency ?? 'MYR').toUpperCase(),
      frequency,
      intervalValue,
      startDate,
      endDate,
      nextExecutionDate,
      lastExecutionDate: null,
      timezone: input.timezone?.trim() || 'UTC',
      isActive: true,
      autoExecute: input.auto_execute ?? true,
      retryCount: 0,
      maxRetryCount: input.max_retry_count ?? 3,
      executionPayload: payload,
      lastError: null,
      reminderEnabled: false,
      alertOnFailure: true,
    });

    const saved = await this.recurringRepo.save(entity);
    return this.toModel(saved);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateRecurringTransactionInput,
  ): Promise<RecurringTransactionModel> {
    const row = await this.requireOwned(userId, id);

    if (input.account_id !== undefined) {
      await this.accountService.findByIdForUser(userId, input.account_id);
      row.accountId = input.account_id;
    }
    if (input.category_id !== undefined) {
      if (input.category_id) {
        await this.categoryService.assertAssignable(input.category_id, userId);
      }
      row.categoryId = input.category_id;
    }
    if (input.target_module !== undefined) {
      row.targetModule = this.requireTargetModule(input.target_module);
    }
    if (input.target_reference_id !== undefined) {
      row.targetReferenceId = input.target_reference_id;
    }
    if (input.name !== undefined) row.name = this.normalizeName(input.name);
    if (input.description !== undefined) {
      row.description =
        input.description === null ? null : input.description.trim() || null;
    }
    if (input.transaction_type !== undefined) {
      row.transactionType = this.requireTransactionType(input.transaction_type);
    }
    if (input.amount_cents !== undefined) {
      row.amountCents = this.requirePositiveInt(input.amount_cents, 'Amount');
    }
    if (input.currency !== undefined) {
      row.currency = input.currency.toUpperCase();
    }
    if (input.frequency !== undefined) {
      row.frequency = this.requireFrequency(input.frequency);
    }
    if (input.interval_value !== undefined) {
      row.intervalValue = this.requirePositiveInt(
        input.interval_value,
        'Interval value',
      );
    }
    if (input.start_date !== undefined) {
      row.startDate = this.requireDateString(input.start_date, 'Start date');
    }
    if (input.end_date !== undefined) {
      row.endDate =
        input.end_date === null
          ? null
          : this.requireDateString(input.end_date, 'End date');
    }
    if (row.endDate) {
      this.assertDateOnOrAfter(
        row.endDate,
        row.startDate,
        'End date must not be before start date.',
      );
    }
    if (input.next_execution_date !== undefined) {
      row.nextExecutionDate = input.next_execution_date;
    }
    if (input.timezone !== undefined) {
      row.timezone = input.timezone.trim() || 'UTC';
    }
    if (input.auto_execute !== undefined) row.autoExecute = input.auto_execute;
    if (input.max_retry_count !== undefined) {
      row.maxRetryCount = this.requireNonNegativeInt(
        input.max_retry_count,
        'Max retry count',
      );
    }

    row.executionPayload = this.mergePayload(row.executionPayload, input);

    const saved = await this.recurringRepo.save(row);
    return this.toModel(saved);
  }

  async pause(userId: string, id: string): Promise<RecurringTransactionModel> {
    const row = await this.requireOwned(userId, id);
    row.isActive = false;
    const saved = await this.recurringRepo.save(row);
    return this.toModel(saved);
  }

  async resume(userId: string, id: string): Promise<RecurringTransactionModel> {
    const row = await this.requireOwned(userId, id);
    row.isActive = true;
    row.retryCount = 0;
    row.lastError = null;
    if (row.nextExecutionDate < new Date()) {
      row.nextExecutionDate = new Date();
    }
    const saved = await this.recurringRepo.save(row);
    return this.toModel(saved);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const row = await this.requireOwned(userId, id);
    await this.recurringRepo.remove(row);
    return true;
  }

  async runNow(
    userId: string,
    id: string,
  ): Promise<RecurringTransactionModel> {
    const row = await this.requireOwned(userId, id);
    await this.executeOne(row, { force: true });
    const refreshed = await this.requireOwned(userId, id);
    return this.toModel(refreshed);
  }

  /**
   * Cron entry point: execute all due auto-execute recurring schedules.
   */
  async processDueRecurring(now = new Date()): Promise<number> {
    const due = await this.recurringRepo
      .createQueryBuilder('rt')
      .where('rt.is_active = true')
      .andWhere('rt.auto_execute = true')
      .andWhere('rt.next_execution_date <= :now', { now })
      .andWhere('(rt.end_date IS NULL OR rt.end_date >= :today)', {
        today: now.toISOString().slice(0, 10),
      })
      .andWhere('rt.retry_count < rt.max_retry_count')
      .orderBy('rt.next_execution_date', 'ASC')
      .take(100)
      .getMany();

    let executed = 0;
    for (const row of due) {
      try {
        await this.executeOne(row, { force: false });
        executed += 1;
      } catch (error) {
        this.logger.error(
          `Recurring ${row.id} failed: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }
    return executed;
  }

  /**
   * Executes the domain action, then atomically advances the schedule.
   */
  async executeOne(
    row: RecurringTransaction,
    options: { force: boolean },
  ): Promise<void> {
    const executionDate = options.force ? new Date() : row.nextExecutionDate;

    try {
      await this.dispatchToDomain(row, executionDate);

      const nextExecutionDate = this.calculateNextExecutionDate(
        executionDate,
        row.frequency,
        row.intervalValue,
      );

      const pastEnd =
        row.endDate !== null &&
        nextExecutionDate.toISOString().slice(0, 10) > row.endDate;

      await this.recurringRepo.manager.transaction(async (manager) => {
        const repo = manager.getRepository(RecurringTransaction);
        const locked = await repo.findOne({ where: { id: row.id } });
        if (!locked) return;

        locked.lastExecutionDate = executionDate;
        locked.nextExecutionDate = nextExecutionDate;
        locked.retryCount = 0;
        locked.lastError = null;
        if (pastEnd) {
          locked.isActive = false;
        }
        await repo.save(locked);
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown execution error';

      await this.recurringRepo.manager.transaction(async (manager) => {
        const repo = manager.getRepository(RecurringTransaction);
        const locked = await repo.findOne({ where: { id: row.id } });
        if (!locked) return;

        locked.retryCount += 1;
        locked.lastError = message.slice(0, 2000);
        if (locked.retryCount >= locked.maxRetryCount) {
          locked.isActive = false;
          this.logger.warn(
            `Recurring ${locked.id} paused after ${locked.retryCount} failures`,
          );
        }
        await repo.save(locked);
      });

      throw error;
    }
  }

  calculateNextExecutionDate(
    from: Date,
    frequency: RecurringFrequency,
    intervalValue: number,
  ): Date {
    const next = new Date(from);
    const step = Math.max(1, intervalValue);

    switch (frequency) {
      case 'DAILY':
      case 'CUSTOM':
        next.setUTCDate(next.getUTCDate() + step);
        break;
      case 'WEEKLY':
        next.setUTCDate(next.getUTCDate() + 7 * step);
        break;
      case 'MONTHLY':
        next.setUTCMonth(next.getUTCMonth() + step);
        break;
      case 'QUARTERLY':
        next.setUTCMonth(next.getUTCMonth() + 3 * step);
        break;
      case 'YEARLY':
        next.setUTCFullYear(next.getUTCFullYear() + step);
        break;
      default:
        next.setUTCDate(next.getUTCDate() + step);
    }
    return next;
  }

  private async dispatchToDomain(
    row: RecurringTransaction,
    executionDate: Date,
  ): Promise<void> {
    const payload = row.executionPayload ?? {};
    const categoryId = this.requireCategoryId(row);
    const description = row.description ?? row.name;

    switch (row.targetModule) {
      case 'INCOME':
        await this.incomeService.create(row.userId, {
          account_id: row.accountId,
          category_id: categoryId,
          income_source: String(payload.income_source ?? 'OTHER'),
          amount_cents: row.amountCents,
          received_date: executionDate,
          description,
          notes: description,
        });
        return;

      case 'EXPENSE':
        await this.expenseService.create(row.userId, {
          account_id: row.accountId,
          category_id: categoryId,
          amount_cents: row.amountCents,
          expense_date: executionDate,
          merchant_name: payload.merchant_name
            ? String(payload.merchant_name)
            : undefined,
          description,
          notes: description,
        });
        return;

      case 'TRANSFER': {
        const toAccountId = payload.to_account_id
          ? String(payload.to_account_id)
          : null;
        if (!toAccountId) {
          throw new BadRequestException(
            'TRANSFER recurring requires to_account_id.',
          );
        }
        await this.transferService.create(row.userId, {
          from_account_id: row.accountId,
          to_account_id: toAccountId,
          category_id: categoryId,
          amount_cents: row.amountCents,
          transfer_date: executionDate,
          description,
          notes: description,
        });
        return;
      }

      case 'SAVINGS': {
        const savingsId = row.targetReferenceId;
        if (!savingsId) {
          throw new BadRequestException(
            'SAVINGS recurring requires target_reference_id (savings id).',
          );
        }
        await this.savingsService.deposit(row.userId, {
          savings_id: savingsId,
          category_id: categoryId,
          amount_cents: row.amountCents,
          transaction_date: executionDate,
          notes: description,
        });
        return;
      }

      case 'GOAL': {
        const goalId = row.targetReferenceId;
        if (!goalId) {
          throw new BadRequestException(
            'GOAL recurring requires target_reference_id (goal id).',
          );
        }
        const sourceType =
          payload.goal_source_type === 'SAVINGS' ? 'SAVINGS' : 'ACCOUNT';
        await this.goalsService.contribute(row.userId, {
          goal_id: goalId,
          source_type: sourceType,
          account_id: sourceType === 'ACCOUNT' ? row.accountId : undefined,
          savings_id:
            sourceType === 'SAVINGS'
              ? String(payload.savings_id ?? '')
              : undefined,
          category_id: categoryId,
          amount_cents: row.amountCents,
          contribution_date: executionDate,
          notes: description,
        });
        return;
      }

      case 'CREDIT_CARD_PAYMENT': {
        const creditCardId = row.targetReferenceId;
        if (!creditCardId) {
          throw new BadRequestException(
            'CREDIT_CARD_PAYMENT recurring requires target_reference_id.',
          );
        }
        await this.creditCardPaymentService.create(row.userId, {
          credit_card_id: creditCardId,
          payment_account_id: row.accountId,
          category_id: categoryId,
          amount_cents: row.amountCents,
          payment_date: executionDate,
          payment_method: String(payload.payment_method ?? 'AUTO_DEBIT'),
          notes: description,
        });
        return;
      }

      case 'HOUSE_LOAN_PAYMENT': {
        const houseLoanId = row.targetReferenceId;
        if (!houseLoanId) {
          throw new BadRequestException(
            'HOUSE_LOAN_PAYMENT recurring requires target_reference_id.',
          );
        }
        await this.houseLoanPaymentService.create(row.userId, {
          house_loan_id: houseLoanId,
          payment_account_id: row.accountId,
          category_id: categoryId,
          amount_cents: row.amountCents,
          payment_date: executionDate,
          payment_type: String(payload.payment_type ?? 'MONTHLY_INSTALLMENT'),
          notes: description,
        });
        return;
      }

      case 'INSURANCE_PAYMENT': {
        const insuranceId = row.targetReferenceId;
        if (!insuranceId) {
          throw new BadRequestException(
            'INSURANCE_PAYMENT recurring requires target_reference_id.',
          );
        }
        const coverageDays = Number(payload.coverage_period_days ?? 30);
        const coverageStart = executionDate.toISOString().slice(0, 10);
        const coverageEndDate = new Date(executionDate);
        coverageEndDate.setUTCDate(coverageEndDate.getUTCDate() + coverageDays);
        await this.insurancePaymentService.create(row.userId, {
          insurance_id: insuranceId,
          payment_account_id: row.accountId,
          category_id: categoryId,
          amount_cents: row.amountCents,
          payment_date: executionDate,
          payment_type: String(payload.payment_type ?? 'MONTHLY'),
          coverage_period_start: coverageStart,
          coverage_period_end: coverageEndDate.toISOString().slice(0, 10),
          notes: description,
        });
        return;
      }

      case 'FAMILY_LOAN_PAYMENT': {
        const familyLoanId = row.targetReferenceId;
        if (!familyLoanId) {
          throw new BadRequestException(
            'FAMILY_LOAN_PAYMENT recurring requires target_reference_id.',
          );
        }
        await this.familyLoanPaymentService.create(row.userId, {
          family_loan_id: familyLoanId,
          payment_account_id: row.accountId,
          category_id: categoryId,
          amount_cents: row.amountCents,
          payment_date: executionDate,
          notes: description,
        });
        return;
      }

      default:
        throw new BadRequestException(
          `Unsupported target module: ${row.targetModule}`,
        );
    }
  }

  private async queryRecurring(
    userId: string,
    filter: RecurringTransactionFilterInput,
  ): Promise<RecurringTransactionModel[]> {
    const where: FindOptionsWhere<RecurringTransaction> = { userId };

    if (filter.frequency) {
      where.frequency = this.requireFrequency(filter.frequency);
    }
    if (filter.target_module) {
      where.targetModule = this.requireTargetModule(filter.target_module);
    }
    if (filter.is_active !== undefined) {
      where.isActive = filter.is_active;
    }

    if (filter.start_date && filter.end_date) {
      where.startDate = Between(
        this.requireDateString(filter.start_date, 'Start date'),
        this.requireDateString(filter.end_date, 'End date'),
      );
    } else if (filter.start_date) {
      where.startDate = MoreThanOrEqual(
        this.requireDateString(filter.start_date, 'Start date'),
      );
    } else if (filter.end_date) {
      where.startDate = LessThanOrEqual(
        this.requireDateString(filter.end_date, 'End date'),
      );
    }

    const sortNewest = (filter.sort_order ?? 'NEWEST') !== 'OLDEST';
    const rows = await this.recurringRepo.find({
      where,
      order: {
        nextExecutionDate: sortNewest ? 'DESC' : 'ASC',
        createdAt: sortNewest ? 'DESC' : 'ASC',
      },
      take: filter.limit ?? 50,
      skip: filter.offset ?? 0,
    });

    return rows.map((row) => this.toModel(row));
  }

  private async requireOwned(
    userId: string,
    id: string,
  ): Promise<RecurringTransaction> {
    const row = await this.recurringRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Recurring transaction not found.');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException(
        'You do not own this recurring transaction.',
      );
    }
    return row;
  }

  private assertModuleRequirements(
    targetModule: RecurringTargetModule,
    input: CreateRecurringTransactionInput,
  ): void {
    const needsReference = [
      'SAVINGS',
      'GOAL',
      'CREDIT_CARD_PAYMENT',
      'HOUSE_LOAN_PAYMENT',
      'INSURANCE_PAYMENT',
      'FAMILY_LOAN_PAYMENT',
    ].includes(targetModule);

    if (needsReference && !input.target_reference_id) {
      throw new BadRequestException(
        `${targetModule} requires target_reference_id.`,
      );
    }
    if (targetModule === 'TRANSFER' && !input.to_account_id) {
      throw new BadRequestException('TRANSFER requires to_account_id.');
    }
    if (targetModule === 'INCOME' && !input.income_source) {
      throw new BadRequestException('INCOME requires income_source.');
    }
    if (!input.category_id) {
      throw new BadRequestException(
        'category_id is required for recurring execution.',
      );
    }
  }

  private requireCategoryId(row: RecurringTransaction): string {
    if (!row.categoryId) {
      throw new BadRequestException(
        'Recurring transaction is missing category_id.',
      );
    }
    return row.categoryId;
  }

  private buildPayloadFromCreate(
    input: CreateRecurringTransactionInput,
  ): RecurringExecutionPayload | null {
    const payload: RecurringExecutionPayload = {};
    if (input.to_account_id) payload.to_account_id = input.to_account_id;
    if (input.income_source) payload.income_source = input.income_source;
    if (input.payment_method) payload.payment_method = input.payment_method;
    if (input.payment_type) payload.payment_type = input.payment_type;
    if (input.merchant_name) payload.merchant_name = input.merchant_name;
    if (input.coverage_period_days) {
      payload.coverage_period_days = input.coverage_period_days;
    }
    if (input.goal_source_type) {
      payload.goal_source_type = input.goal_source_type as 'ACCOUNT' | 'SAVINGS';
    }
    if (input.savings_id) payload.savings_id = input.savings_id;
    return Object.keys(payload).length ? payload : null;
  }

  private mergePayload(
    existing: RecurringExecutionPayload | null,
    input: UpdateRecurringTransactionInput,
  ): RecurringExecutionPayload | null {
    const payload: RecurringExecutionPayload = { ...(existing ?? {}) };

    const assign = (
      key: keyof RecurringExecutionPayload,
      value: unknown,
    ): void => {
      if (value === undefined) return;
      if (value === null) {
        delete payload[key];
        return;
      }
      payload[key] = value as never;
    };

    assign('to_account_id', input.to_account_id);
    assign('income_source', input.income_source);
    assign('payment_method', input.payment_method);
    assign('payment_type', input.payment_type);
    assign('merchant_name', input.merchant_name);
    assign('coverage_period_days', input.coverage_period_days);
    assign('goal_source_type', input.goal_source_type);
    assign('savings_id', input.savings_id);

    return Object.keys(payload).length ? payload : null;
  }

  private requireTargetModule(value: string): RecurringTargetModule {
    if (
      !RECURRING_TARGET_MODULES.includes(
        value as (typeof RECURRING_TARGET_MODULES)[number],
      )
    ) {
      throw new BadRequestException('Invalid target module.');
    }
    return value as RecurringTargetModule;
  }

  private requireTransactionType(value: string): RecurringTransactionType {
    if (
      !RECURRING_TRANSACTION_TYPES.includes(
        value as (typeof RECURRING_TRANSACTION_TYPES)[number],
      )
    ) {
      throw new BadRequestException('Invalid transaction type.');
    }
    return value as RecurringTransactionType;
  }

  private requireFrequency(value: string): RecurringFrequency {
    if (
      !RECURRING_FREQUENCIES.includes(
        value as (typeof RECURRING_FREQUENCIES)[number],
      )
    ) {
      throw new BadRequestException('Invalid frequency.');
    }
    return value as RecurringFrequency;
  }

  private requirePositiveInt(value: number, label: string): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`${label} must be greater than zero.`);
    }
    return value;
  }

  private requireNonNegativeInt(value: number, label: string): number {
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException(`${label} cannot be negative.`);
    }
    return value;
  }

  private requireDateString(value: string, label: string): string {
    const trimmed = value?.trim();
    if (!trimmed || Number.isNaN(Date.parse(trimmed))) {
      throw new BadRequestException(`${label} is required.`);
    }
    return trimmed.slice(0, 10);
  }

  private assertDateOnOrAfter(
    later: string,
    earlier: string,
    message: string,
  ): void {
    if (later < earlier) {
      throw new BadRequestException(message);
    }
  }

  private normalizeName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Name is required.');
    }
    return trimmed;
  }

  private toDateField(value: string | Date): string {
    if (typeof value === 'string') return value.slice(0, 10);
    return new Date(value).toISOString().slice(0, 10);
  }

  private toModel(row: RecurringTransaction): RecurringTransactionModel {
    return {
      id: row.id,
      userId: row.userId,
      accountId: row.accountId,
      categoryId: row.categoryId,
      targetModule: row.targetModule,
      targetReferenceId: row.targetReferenceId,
      name: row.name,
      description: row.description,
      transactionType: row.transactionType,
      amountCents: row.amountCents,
      currency: row.currency,
      frequency: row.frequency,
      intervalValue: row.intervalValue,
      startDate: this.toDateField(row.startDate),
      endDate: row.endDate ? this.toDateField(row.endDate) : null,
      nextExecutionDate: row.nextExecutionDate,
      lastExecutionDate: row.lastExecutionDate,
      timezone: row.timezone,
      isActive: row.isActive,
      autoExecute: row.autoExecute,
      retryCount: row.retryCount,
      maxRetryCount: row.maxRetryCount,
      lastError: row.lastError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as RecurringTransactionModel;
  }
}
