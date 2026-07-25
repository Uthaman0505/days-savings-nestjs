import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  EntityManager,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { Account } from '../account/account.entity';
import { AccountService } from '../account/account.service';
import { CategoryService } from '../category/category.service';
import { TransactionService } from '../transaction/transaction.service';
import {
  CreateSavingsInput,
  SAVING_TYPES,
  SAVINGS_STATUSES,
} from './dto/create-savings.input';
import { DepositToSavingsInput } from './dto/deposit-to-savings.input';
import { SavingsFilterInput } from './dto/savings-filter.input';
import { UpdateSavingsInput } from './dto/update-savings.input';
import { WithdrawFromSavingsInput } from './dto/withdraw-from-savings.input';
import { SavingsModel } from './models/savings.model';
import { SavingType, Savings, SavingsStatus } from './savings.entity';

@Injectable()
export class SavingsService {
  constructor(
    @InjectRepository(Savings)
    private readonly savingsRepo: Repository<Savings>,
    @InjectRepository(Account)
    private readonly accountsRepo: Repository<Account>,
    private readonly transactionService: TransactionService,
    private readonly accountService: AccountService,
    private readonly categoryService: CategoryService,
  ) {}

  async findMySavings(
    userId: string,
    filter?: SavingsFilterInput,
  ): Promise<SavingsModel[]> {
    return this.querySavings(userId, filter ?? {});
  }

  async findActiveSavings(userId: string): Promise<SavingsModel[]> {
    const rows = await this.savingsRepo.find({
      where: { userId, isActive: true },
      order: { startDate: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findByType(userId: string, type: string): Promise<SavingsModel[]> {
    const savingType = this.requireSavingType(type);
    const rows = await this.savingsRepo.find({
      where: { userId, savingType },
      order: { startDate: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findByIdForUser(
    userId: string,
    savingsId: string,
  ): Promise<SavingsModel> {
    const row = await this.requireOwnedSavings(userId, savingsId);
    return this.toModel(row);
  }

  async create(
    userId: string,
    input: CreateSavingsInput,
  ): Promise<SavingsModel> {
    const name = this.normalizeName(input.name, 'Savings name');
    const savingType = this.requireSavingType(input.saving_type);
    const currentBalanceCents = this.requireNonNegativeCents(
      input.current_balance_cents ?? 0,
      'Current balance',
    );
    const targetAmountCents =
      input.target_amount_cents !== undefined
        ? this.requirePositiveCents(input.target_amount_cents, 'Target amount')
        : null;
    this.assertTargetCoversBalance(targetAmountCents, currentBalanceCents);

    const startDate = this.requireDateString(input.start_date, 'Start date');
    const targetDate =
      input.target_date !== undefined
        ? this.requireDateString(input.target_date, 'Target date')
        : null;
    if (targetDate) {
      this.assertDateOnOrAfter(
        targetDate,
        startDate,
        'Target date must not be before start date.',
      );
    }

    await this.assertWritableAccount(userId, input.account_id);
    await this.assertUniqueName(userId, name);

    const status = this.resolveStatus(
      'ACTIVE',
      currentBalanceCents,
      targetAmountCents,
    );

    const entity = this.savingsRepo.create({
      userId,
      accountId: input.account_id,
      name,
      description: input.description?.trim() || null,
      savingType,
      targetAmountCents,
      currentBalanceCents,
      currency: (input.currency ?? 'MYR').toUpperCase(),
      startDate,
      targetDate,
      status,
      isActive: true,
      monthlyDepositCents: null,
      interestRate: null,
      maturityDate: null,
      linkedGoalId: null,
      penaltyRate: null,
    });

    const saved = await this.savingsRepo.save(entity);
    return this.toModel(saved);
  }

  async update(
    userId: string,
    savingsId: string,
    input: UpdateSavingsInput,
  ): Promise<SavingsModel> {
    const row = await this.requireOwnedSavings(userId, savingsId);

    const nextName =
      input.name !== undefined
        ? this.normalizeName(input.name, 'Savings name')
        : row.name;
    const nextBalance =
      input.current_balance_cents !== undefined
        ? this.requireNonNegativeCents(
            input.current_balance_cents,
            'Current balance',
          )
        : row.currentBalanceCents;
    const nextTarget =
      input.target_amount_cents !== undefined
        ? input.target_amount_cents === null
          ? null
          : this.requirePositiveCents(
              input.target_amount_cents,
              'Target amount',
            )
        : row.targetAmountCents;
    this.assertTargetCoversBalance(nextTarget, nextBalance);

    const nextStart =
      input.start_date !== undefined
        ? this.requireDateString(input.start_date, 'Start date')
        : row.startDate;
    const nextTargetDate =
      input.target_date !== undefined
        ? input.target_date === null
          ? null
          : this.requireDateString(input.target_date, 'Target date')
        : row.targetDate;
    if (nextTargetDate) {
      this.assertDateOnOrAfter(
        nextTargetDate,
        nextStart,
        'Target date must not be before start date.',
      );
    }

    if (input.name !== undefined) {
      await this.assertUniqueName(userId, nextName, savingsId);
      row.name = nextName;
    }
    if (input.account_id !== undefined) {
      await this.assertWritableAccount(userId, input.account_id);
      row.accountId = input.account_id;
    }
    if (input.description !== undefined) {
      row.description =
        input.description === null ? null : input.description.trim() || null;
    }
    if (input.saving_type !== undefined) {
      row.savingType = this.requireSavingType(input.saving_type);
    }
    if (input.target_amount_cents !== undefined) {
      row.targetAmountCents = nextTarget;
    }
    if (input.current_balance_cents !== undefined) {
      row.currentBalanceCents = nextBalance;
    }
    if (input.currency !== undefined) {
      row.currency = input.currency.toUpperCase();
    }
    if (input.start_date !== undefined) row.startDate = nextStart;
    if (input.target_date !== undefined) row.targetDate = nextTargetDate;

    if (input.status !== undefined) {
      row.status = this.requireStatus(input.status);
      if (row.status === 'ARCHIVED') {
        row.isActive = false;
      }
    } else if (
      input.current_balance_cents !== undefined ||
      input.target_amount_cents !== undefined
    ) {
      row.status = this.resolveStatus(
        row.status,
        row.currentBalanceCents,
        row.targetAmountCents,
      );
    }

    const saved = await this.savingsRepo.save(row);
    return this.toModel(saved);
  }

  async archive(userId: string, savingsId: string): Promise<SavingsModel> {
    const row = await this.requireOwnedSavings(userId, savingsId);
    row.isActive = false;
    row.status = 'ARCHIVED';
    const saved = await this.savingsRepo.save(row);
    return this.toModel(saved);
  }

  async delete(userId: string, savingsId: string): Promise<boolean> {
    const row = await this.requireOwnedSavings(userId, savingsId);
    if (row.currentBalanceCents > 0) {
      throw new BadRequestException(
        'Withdraw the savings balance before deleting this pot.',
      );
    }
    await this.savingsRepo.remove(row);
    return true;
  }

  /**
   * Adjust savings balance without creating a ledger row (used by Goals allocation).
   * Positive amountCents increases the pot; negative decreases it.
   */
  async applyBalanceAdjustment(
    userId: string,
    savingsId: string,
    amountCents: number,
    manager?: EntityManager,
  ): Promise<SavingsModel> {
    if (!Number.isInteger(amountCents) || amountCents === 0) {
      throw new BadRequestException(
        'Savings adjustment amount must be a non-zero integer.',
      );
    }

    const run = async (mgr: EntityManager) => {
      const savingsRepo = mgr.getRepository(Savings);
      const row = await savingsRepo.findOne({ where: { id: savingsId } });
      if (!row) {
        throw new NotFoundException('Savings not found.');
      }
      if (row.userId !== userId) {
        throw new ForbiddenException('You do not own this savings pot.');
      }
      if (row.status === 'ARCHIVED' || !row.isActive) {
        throw new BadRequestException(
          'Archived savings cannot be used for goal transfers.',
        );
      }

      const nextBalance = row.currentBalanceCents + amountCents;
      if (nextBalance < 0) {
        throw new BadRequestException('Insufficient savings balance.');
      }

      row.currentBalanceCents = nextBalance;
      row.status = this.resolveStatus(
        'ACTIVE',
        row.currentBalanceCents,
        row.targetAmountCents,
      );
      return savingsRepo.save(row);
    };

    const saved = manager
      ? await run(manager)
      : await this.savingsRepo.manager.transaction(run);

    return this.toModel(saved);
  }

  async deposit(
    userId: string,
    input: DepositToSavingsInput,
  ): Promise<SavingsModel> {
    const amountCents = this.requirePositiveCents(input.amount_cents, 'Amount');
    const transactionDate = this.requireTransactionDate(input.transaction_date);
    const savings = await this.requireOwnedSavings(userId, input.savings_id);

    if (savings.status === 'ARCHIVED' || !savings.isActive) {
      throw new BadRequestException(
        'Archived savings cannot receive deposits.',
      );
    }

    await this.assertWritableAccount(userId, savings.accountId);
    await this.assertSufficientAccountBalance(savings.accountId, amountCents);
    await this.categoryService.assertAssignable(input.category_id, userId);

    const saved = await this.savingsRepo.manager.transaction(
      async (manager) => {
        const savingsRepo = manager.getRepository(Savings);
        const row = await savingsRepo.findOne({
          where: { id: input.savings_id },
        });
        if (!row || row.userId !== userId) {
          throw new NotFoundException('Savings not found.');
        }

        await this.transactionService.create(
          userId,
          {
            account_id: row.accountId,
            category_id: input.category_id,
            transaction_type: 'SAVING_DEPOSIT',
            amount_cents: amountCents,
            transaction_date: transactionDate,
            description: `Deposit to ${row.name}`,
            reference_number: input.reference_number,
            notes: input.notes,
            status: 'COMPLETED',
          },
          manager,
        );

        row.currentBalanceCents += amountCents;
        row.status = this.resolveStatus(
          row.status,
          row.currentBalanceCents,
          row.targetAmountCents,
        );
        return savingsRepo.save(row);
      },
    );

    return this.toModel(saved);
  }

  async withdraw(
    userId: string,
    input: WithdrawFromSavingsInput,
  ): Promise<SavingsModel> {
    const amountCents = this.requirePositiveCents(input.amount_cents, 'Amount');
    const transactionDate = this.requireTransactionDate(input.transaction_date);
    const savings = await this.requireOwnedSavings(userId, input.savings_id);

    if (savings.status === 'ARCHIVED' || !savings.isActive) {
      throw new BadRequestException(
        'Archived savings cannot be withdrawn from.',
      );
    }
    if (amountCents > savings.currentBalanceCents) {
      throw new BadRequestException('Insufficient savings balance.');
    }

    await this.assertWritableAccount(userId, savings.accountId);
    await this.categoryService.assertAssignable(input.category_id, userId);

    const saved = await this.savingsRepo.manager.transaction(
      async (manager) => {
        const savingsRepo = manager.getRepository(Savings);
        const row = await savingsRepo.findOne({
          where: { id: input.savings_id },
        });
        if (!row || row.userId !== userId) {
          throw new NotFoundException('Savings not found.');
        }
        if (amountCents > row.currentBalanceCents) {
          throw new BadRequestException('Insufficient savings balance.');
        }

        await this.transactionService.create(
          userId,
          {
            account_id: row.accountId,
            category_id: input.category_id,
            transaction_type: 'SAVING_WITHDRAW',
            amount_cents: amountCents,
            transaction_date: transactionDate,
            description: `Withdrawal from ${row.name}`,
            reference_number: input.reference_number,
            notes: input.notes,
            status: 'COMPLETED',
          },
          manager,
        );

        row.currentBalanceCents -= amountCents;
        row.status = this.resolveStatus(
          row.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
          row.currentBalanceCents,
          row.targetAmountCents,
        );
        return savingsRepo.save(row);
      },
    );

    return this.toModel(saved);
  }

  private async querySavings(
    userId: string,
    filter: SavingsFilterInput,
  ): Promise<SavingsModel[]> {
    const where: FindOptionsWhere<Savings> = { userId };

    if (filter.saving_type) {
      where.savingType = this.requireSavingType(filter.saving_type);
    }
    if (filter.status) {
      where.status = this.requireStatus(filter.status);
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
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const rows = await this.savingsRepo.find({
      where,
      order: {
        startDate: sortNewest ? 'DESC' : 'ASC',
        createdAt: sortNewest ? 'DESC' : 'ASC',
      },
      take: limit,
      skip: offset,
    });

    return rows.map((row) => this.toModel(row));
  }

  private async requireOwnedSavings(
    userId: string,
    savingsId: string,
  ): Promise<Savings> {
    const row = await this.savingsRepo.findOne({ where: { id: savingsId } });
    if (!row) {
      throw new NotFoundException('Savings not found.');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not own this savings pot.');
    }
    return row;
  }

  private async assertWritableAccount(
    userId: string,
    accountId: string,
  ): Promise<void> {
    const account = await this.accountService.findByIdForUser(
      userId,
      accountId,
    );
    if (account.isArchived) {
      throw new BadRequestException(
        'Archived accounts cannot be linked to savings.',
      );
    }
  }

  private async assertSufficientAccountBalance(
    accountId: string,
    amountCents: number,
  ): Promise<void> {
    const account = await this.accountsRepo.findOne({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException('Account not found.');
    }
    if (account.currentBalanceCents < amountCents) {
      throw new BadRequestException('Insufficient account balance.');
    }
  }

  private async assertUniqueName(
    userId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.savingsRepo.findOne({
      where: excludeId
        ? { userId, name, id: Not(excludeId) }
        : { userId, name },
    });
    if (existing) {
      throw new BadRequestException(
        'A savings pot with this name already exists.',
      );
    }
  }

  private resolveStatus(
    currentStatus: SavingsStatus,
    currentBalanceCents: number,
    targetAmountCents: number | null,
  ): SavingsStatus {
    if (currentStatus === 'ARCHIVED') {
      return 'ARCHIVED';
    }
    if (
      targetAmountCents !== null &&
      currentBalanceCents >= targetAmountCents
    ) {
      return 'COMPLETED';
    }
    return 'ACTIVE';
  }

  private assertTargetCoversBalance(
    targetAmountCents: number | null,
    currentBalanceCents: number,
  ): void {
    if (targetAmountCents !== null && currentBalanceCents > targetAmountCents) {
      throw new BadRequestException(
        'Current balance cannot exceed target amount.',
      );
    }
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

  private requireSavingType(type: string): SavingType {
    if (!SAVING_TYPES.includes(type as (typeof SAVING_TYPES)[number])) {
      throw new BadRequestException('Invalid saving type.');
    }
    return type as SavingType;
  }

  private requireStatus(status: string): SavingsStatus {
    if (
      !SAVINGS_STATUSES.includes(status as (typeof SAVINGS_STATUSES)[number])
    ) {
      throw new BadRequestException('Invalid savings status.');
    }
    return status as SavingsStatus;
  }

  private requirePositiveCents(value: number, label: string): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`${label} must be greater than zero.`);
    }
    return value;
  }

  private requireNonNegativeCents(value: number, label: string): number {
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

  private requireTransactionDate(value: Date): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new BadRequestException('Transaction date is required.');
    }
    return value;
  }

  private normalizeName(name: string, label: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException(`${label} is required.`);
    }
    return trimmed;
  }

  private toDateField(value: string | Date): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    return new Date(value).toISOString().slice(0, 10);
  }

  private toModel(row: Savings): SavingsModel {
    return {
      id: row.id,
      userId: row.userId,
      accountId: row.accountId,
      name: row.name,
      description: row.description,
      savingType: row.savingType,
      targetAmountCents: row.targetAmountCents,
      currentBalanceCents: row.currentBalanceCents,
      currency: row.currency,
      startDate: this.toDateField(row.startDate),
      targetDate: row.targetDate ? this.toDateField(row.targetDate) : null,
      status: row.status,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as SavingsModel;
  }
}
