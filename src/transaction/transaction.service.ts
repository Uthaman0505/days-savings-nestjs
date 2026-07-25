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
  Repository,
} from 'typeorm';
import { Account } from '../account/account.entity';
import { Category } from '../category/category.entity';
import { CreateTransactionInput } from './dto/create-transaction.input';
import { TransactionFilterInput } from './dto/transaction-filter.input';
import { UpdateTransactionInput } from './dto/update-transaction.input';
import { TransactionModel } from './models/transaction.model';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from './transaction.entity';

const TRANSACTION_TYPES: TransactionType[] = [
  'INCOME',
  'EXPENSE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'LOAN_PAYMENT',
  'LOAN_RECEIVED',
  'LOAN_GIVEN',
  'FAMILY_LOAN_PAYMENT',
  'FAMILY_LOAN_COLLECTION',
  'INSURANCE_PAYMENT',
  'SAVING_DEPOSIT',
  'SAVING_WITHDRAW',
  'GOAL_CONTRIBUTION',
  'GOAL_WITHDRAW',
  'CREDIT_CARD_PAYMENT',
  'ADJUSTMENT',
];

const TRANSACTION_STATUSES: TransactionStatus[] = [
  'PENDING',
  'COMPLETED',
  'CANCELLED',
];

/** Signed balance delta multiplier for completed ledger entries. */
const BALANCE_SIGN: Record<TransactionType, number> = {
  INCOME: 1,
  EXPENSE: -1,
  TRANSFER_IN: 1,
  TRANSFER_OUT: -1,
  LOAN_PAYMENT: -1,
  LOAN_RECEIVED: 1,
  LOAN_GIVEN: -1,
  FAMILY_LOAN_PAYMENT: -1,
  FAMILY_LOAN_COLLECTION: 1,
  INSURANCE_PAYMENT: -1,
  SAVING_DEPOSIT: -1,
  SAVING_WITHDRAW: 1,
  GOAL_CONTRIBUTION: -1,
  GOAL_WITHDRAW: 1,
  CREDIT_CARD_PAYMENT: -1,
  ADJUSTMENT: 0,
};

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepo: Repository<Transaction>,
    @InjectRepository(Account)
    private readonly accountsRepo: Repository<Account>,
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,
  ) {}

  async findMyTransactions(
    userId: string,
    filter?: TransactionFilterInput,
  ): Promise<TransactionModel[]> {
    return this.queryTransactions(userId, filter ?? {});
  }

  async findByIdForUser(
    userId: string,
    transactionId: string,
  ): Promise<TransactionModel> {
    const row = await this.requireOwnedTransaction(userId, transactionId);
    return this.toModel(row);
  }

  async findByAccount(
    userId: string,
    accountId: string,
    filter?: TransactionFilterInput,
  ): Promise<TransactionModel[]> {
    await this.requireOwnedAssignableAccount(userId, accountId, {
      allowArchived: true,
    });
    return this.queryTransactions(userId, {
      ...filter,
      account_id: accountId,
    });
  }

  async findByCategory(
    userId: string,
    categoryId: string,
    filter?: TransactionFilterInput,
  ): Promise<TransactionModel[]> {
    await this.requireAssignableCategory(userId, categoryId, {
      allowArchived: true,
    });
    return this.queryTransactions(userId, {
      ...filter,
      category_id: categoryId,
    });
  }

  async findByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    filter?: TransactionFilterInput,
  ): Promise<TransactionModel[]> {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('startDate is required.');
    }
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('endDate is required.');
    }
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be on or before endDate.');
    }
    return this.queryTransactions(userId, {
      ...filter,
      start_date: startDate,
      end_date: endDate,
    });
  }

  /**
   * Creates a ledger entry and updates account balance.
   * Pass `manager` to participate in a caller-owned database transaction
   * (e.g. Income / Expense domain modules).
   * Set `options.applyBalance` to false for allocation transfers (e.g. Savings → Goal)
   * that must record a ledger type without changing spendable account balance.
   */
  async create(
    userId: string,
    input: CreateTransactionInput,
    manager?: EntityManager,
    options?: { applyBalance?: boolean },
  ): Promise<TransactionModel> {
    const amountCents = this.requirePositiveAmount(input.amount_cents);
    const transactionType = this.requireTransactionType(input.transaction_type);
    const status = this.requireStatus(input.status ?? 'COMPLETED');
    const transactionDate = this.requireTransactionDate(input.transaction_date);
    const applyBalance = options?.applyBalance !== false;

    const account = await this.requireOwnedAssignableAccount(
      userId,
      input.account_id,
    );
    await this.requireAssignableCategory(userId, input.category_id);

    const run = async (mgr: EntityManager): Promise<Transaction> => {
      const txRepo = mgr.getRepository(Transaction);
      const accountRepo = mgr.getRepository(Account);

      const entity = txRepo.create({
        userId,
        accountId: account.id,
        categoryId: input.category_id,
        transactionType,
        amountCents,
        transactionDate,
        description: input.description?.trim() || null,
        referenceNumber: input.reference_number?.trim() || null,
        notes: input.notes?.trim() || null,
        status,
      });

      const created = await txRepo.save(entity);
      if (applyBalance) {
        await this.applyBalanceDelta(
          accountRepo,
          account.id,
          this.balanceDelta(transactionType, amountCents, status),
        );
      }
      return created;
    };

    const saved = manager
      ? await run(manager)
      : await this.transactionsRepo.manager.transaction(run);

    return this.toModel(saved);
  }

  /**
   * Updates a ledger entry and adjusts account balance.
   * Pass `manager` to participate in a caller-owned database transaction.
   */
  async update(
    userId: string,
    transactionId: string,
    input: UpdateTransactionInput,
    manager?: EntityManager,
  ): Promise<TransactionModel> {
    const existing = await this.requireOwnedTransaction(userId, transactionId);

    const nextAccountId = input.account_id ?? existing.accountId;
    const nextCategoryId = input.category_id ?? existing.categoryId;
    const nextType =
      input.transaction_type !== undefined
        ? this.requireTransactionType(input.transaction_type)
        : existing.transactionType;
    const nextAmount =
      input.amount_cents !== undefined
        ? this.requirePositiveAmount(input.amount_cents)
        : existing.amountCents;
    const nextStatus =
      input.status !== undefined
        ? this.requireStatus(input.status)
        : existing.status;
    const nextDate =
      input.transaction_date !== undefined
        ? this.requireTransactionDate(input.transaction_date)
        : existing.transactionDate;

    if (input.account_id !== undefined) {
      await this.requireOwnedAssignableAccount(userId, nextAccountId);
    }
    if (input.category_id !== undefined) {
      await this.requireAssignableCategory(userId, nextCategoryId);
    }

    const run = async (mgr: EntityManager): Promise<Transaction> => {
      const txRepo = mgr.getRepository(Transaction);
      const accountRepo = mgr.getRepository(Account);

      const row = await txRepo.findOne({ where: { id: transactionId } });
      if (!row || row.userId !== userId) {
        throw new NotFoundException('Transaction not found.');
      }

      const oldDelta = this.balanceDelta(
        row.transactionType,
        row.amountCents,
        row.status,
      );
      const newDelta = this.balanceDelta(nextType, nextAmount, nextStatus);

      if (input.account_id !== undefined) row.accountId = nextAccountId;
      if (input.category_id !== undefined) row.categoryId = nextCategoryId;
      if (input.transaction_type !== undefined) row.transactionType = nextType;
      if (input.amount_cents !== undefined) row.amountCents = nextAmount;
      if (input.status !== undefined) row.status = nextStatus;
      if (input.transaction_date !== undefined) {
        row.transactionDate = nextDate;
      }
      if (input.description !== undefined) {
        row.description =
          input.description === null ? null : input.description.trim() || null;
      }
      if (input.reference_number !== undefined) {
        row.referenceNumber =
          input.reference_number === null
            ? null
            : input.reference_number.trim() || null;
      }
      if (input.notes !== undefined) {
        row.notes = input.notes === null ? null : input.notes.trim() || null;
      }

      const updated = await txRepo.save(row);

      if (existing.accountId === nextAccountId) {
        await this.applyBalanceDelta(
          accountRepo,
          nextAccountId,
          newDelta - oldDelta,
        );
      } else {
        await this.applyBalanceDelta(
          accountRepo,
          existing.accountId,
          -oldDelta,
        );
        await this.applyBalanceDelta(accountRepo, nextAccountId, newDelta);
      }

      return updated;
    };

    const saved = manager
      ? await run(manager)
      : await this.transactionsRepo.manager.transaction(run);

    return this.toModel(saved);
  }

  /**
   * Deletes a ledger entry and reverses account balance.
   * Pass `manager` to participate in a caller-owned database transaction.
   * Set `options.applyBalance` to false when the original create skipped balance updates.
   */
  async delete(
    userId: string,
    transactionId: string,
    manager?: EntityManager,
    options?: { applyBalance?: boolean },
  ): Promise<boolean> {
    const existing = await this.requireOwnedTransaction(userId, transactionId);
    const applyBalance = options?.applyBalance !== false;

    const run = async (mgr: EntityManager): Promise<void> => {
      const txRepo = mgr.getRepository(Transaction);
      const accountRepo = mgr.getRepository(Account);

      const row = await txRepo.findOne({ where: { id: transactionId } });
      if (!row || row.userId !== userId) {
        throw new NotFoundException('Transaction not found.');
      }

      const delta = this.balanceDelta(
        row.transactionType,
        row.amountCents,
        row.status,
      );
      await txRepo.remove(row);
      if (applyBalance) {
        await this.applyBalanceDelta(accountRepo, existing.accountId, -delta);
      }
    };

    if (manager) {
      await run(manager);
    } else {
      await this.transactionsRepo.manager.transaction(run);
    }

    return true;
  }

  private async queryTransactions(
    userId: string,
    filter: TransactionFilterInput,
  ): Promise<TransactionModel[]> {
    const where: FindOptionsWhere<Transaction> = { userId };

    if (filter.account_id) {
      where.accountId = filter.account_id;
    }
    if (filter.category_id) {
      where.categoryId = filter.category_id;
    }
    if (filter.transaction_type) {
      where.transactionType = this.requireTransactionType(
        filter.transaction_type,
      );
    }
    if (filter.status) {
      where.status = this.requireStatus(filter.status);
    }

    if (filter.start_date && filter.end_date) {
      where.transactionDate = Between(filter.start_date, filter.end_date);
    } else if (filter.start_date) {
      where.transactionDate = MoreThanOrEqual(filter.start_date);
    } else if (filter.end_date) {
      where.transactionDate = LessThanOrEqual(filter.end_date);
    }

    const sortNewest = (filter.sort_order ?? 'NEWEST') !== 'OLDEST';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const rows = await this.transactionsRepo.find({
      where,
      order: {
        transactionDate: sortNewest ? 'DESC' : 'ASC',
        createdAt: sortNewest ? 'DESC' : 'ASC',
      },
      take: limit,
      skip: offset,
    });

    return rows.map((row) => this.toModel(row));
  }

  private async requireOwnedTransaction(
    userId: string,
    transactionId: string,
  ): Promise<Transaction> {
    const row = await this.transactionsRepo.findOne({
      where: { id: transactionId },
    });
    if (!row) {
      throw new NotFoundException('Transaction not found.');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not own this transaction.');
    }
    return row;
  }

  private async requireOwnedAssignableAccount(
    userId: string,
    accountId: string,
    options?: { allowArchived?: boolean },
  ): Promise<Account> {
    const account = await this.accountsRepo.findOne({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException('Account not found.');
    }
    if (account.userId !== userId) {
      throw new ForbiddenException('You do not own this account.');
    }
    if (!options?.allowArchived && account.isArchived) {
      throw new BadRequestException(
        'Archived accounts cannot be used for transactions.',
      );
    }
    return account;
  }

  private async requireAssignableCategory(
    userId: string,
    categoryId: string,
    options?: { allowArchived?: boolean },
  ): Promise<Category> {
    const category = await this.categoriesRepo.findOne({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException('Category not found.');
    }

    const isOwn = category.userId === userId;
    const isSystem = category.isSystem && category.userId === null;
    if (!isOwn && !isSystem) {
      throw new ForbiddenException('You do not own this category.');
    }

    if (!options?.allowArchived && category.isArchived) {
      throw new BadRequestException(
        'Archived categories cannot be assigned to new transactions.',
      );
    }

    return category;
  }

  private balanceDelta(
    type: TransactionType,
    amountCents: number,
    status: TransactionStatus,
  ): number {
    if (status !== 'COMPLETED') {
      return 0;
    }
    return BALANCE_SIGN[type] * amountCents;
  }

  private async applyBalanceDelta(
    accountRepo: Repository<Account>,
    accountId: string,
    deltaCents: number,
  ): Promise<void> {
    if (deltaCents === 0) {
      return;
    }

    const account = await accountRepo.findOne({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException('Account not found.');
    }

    account.currentBalanceCents += deltaCents;
    await accountRepo.save(account);
  }

  private requirePositiveAmount(amountCents: number): number {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('Amount must be greater than zero.');
    }
    return amountCents;
  }

  private requireTransactionDate(value: Date): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new BadRequestException('Transaction date is required.');
    }
    return value;
  }

  private requireTransactionType(type: string): TransactionType {
    if (!TRANSACTION_TYPES.includes(type as TransactionType)) {
      throw new BadRequestException('Invalid transaction type.');
    }
    return type as TransactionType;
  }

  private requireStatus(status: string): TransactionStatus {
    if (!TRANSACTION_STATUSES.includes(status as TransactionStatus)) {
      throw new BadRequestException('Invalid transaction status.');
    }
    return status as TransactionStatus;
  }

  private toModel(row: Transaction): TransactionModel {
    return {
      id: row.id,
      userId: row.userId,
      accountId: row.accountId,
      categoryId: row.categoryId,
      transactionType: row.transactionType,
      amountCents: row.amountCents,
      transactionDate: row.transactionDate,
      description: row.description,
      referenceNumber: row.referenceNumber,
      notes: row.notes,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as TransactionModel;
  }
}
