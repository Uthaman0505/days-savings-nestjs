import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  ILike,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { AccountService } from '../account/account.service';
import { CategoryService } from '../category/category.service';
import { TransactionService } from '../transaction/transaction.service';
import { CreateExpenseInput } from './dto/create-expense.input';
import { ExpenseFilterInput } from './dto/expense-filter.input';
import { UpdateExpenseInput } from './dto/update-expense.input';
import { Expense } from './expense.entity';
import { ExpenseModel } from './models/expense.model';

@Injectable()
export class ExpenseService {
  constructor(
    @InjectRepository(Expense)
    private readonly expensesRepo: Repository<Expense>,
    private readonly transactionService: TransactionService,
    private readonly accountService: AccountService,
    private readonly categoryService: CategoryService,
  ) {}

  async findMyExpenses(
    userId: string,
    filter?: ExpenseFilterInput,
  ): Promise<ExpenseModel[]> {
    return this.queryExpenses(userId, filter ?? {});
  }

  async findByIdForUser(
    userId: string,
    expenseId: string,
  ): Promise<ExpenseModel> {
    const row = await this.requireOwnedExpense(userId, expenseId);
    return this.toModel(row);
  }

  async findByAccount(
    userId: string,
    accountId: string,
    filter?: ExpenseFilterInput,
  ): Promise<ExpenseModel[]> {
    await this.accountService.findByIdForUser(userId, accountId);
    return this.queryExpenses(userId, {
      ...filter,
      account_id: accountId,
    });
  }

  async findByCategory(
    userId: string,
    categoryId: string,
    filter?: ExpenseFilterInput,
  ): Promise<ExpenseModel[]> {
    await this.categoryService.findByIdForUser(userId, categoryId);
    return this.queryExpenses(userId, {
      ...filter,
      category_id: categoryId,
    });
  }

  async findByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    filter?: ExpenseFilterInput,
  ): Promise<ExpenseModel[]> {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('startDate is required.');
    }
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('endDate is required.');
    }
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be on or before endDate.');
    }
    return this.queryExpenses(userId, {
      ...filter,
      start_date: startDate,
      end_date: endDate,
    });
  }

  async create(
    userId: string,
    input: CreateExpenseInput,
  ): Promise<ExpenseModel> {
    const amountCents = this.requirePositiveAmount(input.amount_cents);
    const expenseDate = this.requireExpenseDate(input.expense_date);
    const merchantName = this.normalizeOptionalText(input.merchant_name);

    await this.assertWritableAccount(userId, input.account_id);
    await this.assertExpenseCategory(userId, input.category_id);

    const saved = await this.expensesRepo.manager.transaction(
      async (manager) => {
        const expenseRepo = manager.getRepository(Expense);

        const ledger = await this.transactionService.create(
          userId,
          {
            account_id: input.account_id,
            category_id: input.category_id,
            transaction_type: 'EXPENSE',
            amount_cents: amountCents,
            transaction_date: expenseDate,
            description: input.description,
            reference_number: input.reference_number,
            notes: input.notes,
            status: 'COMPLETED',
          },
          manager,
        );

        const entity = expenseRepo.create({
          userId,
          transactionId: ledger.id,
          accountId: input.account_id,
          categoryId: input.category_id,
          merchantName,
          amountCents,
          expenseDate,
          description: input.description?.trim() || null,
          referenceNumber: input.reference_number?.trim() || null,
          notes: input.notes?.trim() || null,
        });

        return expenseRepo.save(entity);
      },
    );

    return this.toModel(saved);
  }

  async update(
    userId: string,
    expenseId: string,
    input: UpdateExpenseInput,
  ): Promise<ExpenseModel> {
    const existing = await this.requireOwnedExpense(userId, expenseId);

    const nextAccountId = input.account_id ?? existing.accountId;
    const nextCategoryId = input.category_id ?? existing.categoryId;
    const nextAmount =
      input.amount_cents !== undefined
        ? this.requirePositiveAmount(input.amount_cents)
        : existing.amountCents;
    const nextDate =
      input.expense_date !== undefined
        ? this.requireExpenseDate(input.expense_date)
        : existing.expenseDate;

    if (input.account_id !== undefined) {
      await this.assertWritableAccount(userId, nextAccountId);
    }
    if (input.category_id !== undefined) {
      await this.assertExpenseCategory(userId, nextCategoryId);
    }

    const saved = await this.expensesRepo.manager.transaction(
      async (manager) => {
        const expenseRepo = manager.getRepository(Expense);

        const row = await expenseRepo.findOne({ where: { id: expenseId } });
        if (!row || row.userId !== userId) {
          throw new NotFoundException('Expense not found.');
        }

        await this.transactionService.update(
          userId,
          row.transactionId,
          {
            account_id: input.account_id,
            category_id: input.category_id,
            amount_cents: input.amount_cents,
            transaction_date: input.expense_date,
            description: input.description,
            reference_number: input.reference_number,
            notes: input.notes,
          },
          manager,
        );

        if (input.account_id !== undefined) row.accountId = nextAccountId;
        if (input.category_id !== undefined) row.categoryId = nextCategoryId;
        if (input.amount_cents !== undefined) row.amountCents = nextAmount;
        if (input.expense_date !== undefined) row.expenseDate = nextDate;
        if (input.merchant_name !== undefined) {
          row.merchantName =
            input.merchant_name === null
              ? null
              : this.normalizeOptionalText(input.merchant_name);
        }
        if (input.description !== undefined) {
          row.description =
            input.description === null
              ? null
              : input.description.trim() || null;
        }
        if (input.reference_number !== undefined) {
          row.referenceNumber =
            input.reference_number === null
              ? null
              : input.reference_number.trim() || null;
        }
        if (input.notes !== undefined) {
          row.notes =
            input.notes === null ? null : input.notes.trim() || null;
        }

        return expenseRepo.save(row);
      },
    );

    return this.toModel(saved);
  }

  async delete(userId: string, expenseId: string): Promise<boolean> {
    await this.requireOwnedExpense(userId, expenseId);

    await this.expensesRepo.manager.transaction(async (manager) => {
      const expenseRepo = manager.getRepository(Expense);

      const row = await expenseRepo.findOne({ where: { id: expenseId } });
      if (!row || row.userId !== userId) {
        throw new NotFoundException('Expense not found.');
      }

      const transactionId = row.transactionId;
      await expenseRepo.remove(row);
      await this.transactionService.delete(userId, transactionId, manager);
    });

    return true;
  }

  private async queryExpenses(
    userId: string,
    filter: ExpenseFilterInput,
  ): Promise<ExpenseModel[]> {
    const where: FindOptionsWhere<Expense> = { userId };

    if (filter.account_id) {
      where.accountId = filter.account_id;
    }
    if (filter.category_id) {
      where.categoryId = filter.category_id;
    }
    if (filter.merchant_name?.trim()) {
      where.merchantName = ILike(`%${filter.merchant_name.trim()}%`);
    }

    if (filter.start_date && filter.end_date) {
      where.expenseDate = Between(filter.start_date, filter.end_date);
    } else if (filter.start_date) {
      where.expenseDate = MoreThanOrEqual(filter.start_date);
    } else if (filter.end_date) {
      where.expenseDate = LessThanOrEqual(filter.end_date);
    }

    const sortNewest = (filter.sort_order ?? 'NEWEST') !== 'OLDEST';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const rows = await this.expensesRepo.find({
      where,
      order: {
        expenseDate: sortNewest ? 'DESC' : 'ASC',
        createdAt: sortNewest ? 'DESC' : 'ASC',
      },
      take: limit,
      skip: offset,
    });

    return rows.map((row) => this.toModel(row));
  }

  private async requireOwnedExpense(
    userId: string,
    expenseId: string,
  ): Promise<Expense> {
    const row = await this.expensesRepo.findOne({ where: { id: expenseId } });
    if (!row) {
      throw new NotFoundException('Expense not found.');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not own this expense.');
    }
    return row;
  }

  private async assertWritableAccount(
    userId: string,
    accountId: string,
  ): Promise<void> {
    const account = await this.accountService.findByIdForUser(userId, accountId);
    if (account.isArchived) {
      throw new BadRequestException(
        'Archived accounts cannot be used for expenses.',
      );
    }
  }

  private async assertExpenseCategory(
    userId: string,
    categoryId: string,
  ): Promise<void> {
    const category = await this.categoryService.assertAssignable(
      categoryId,
      userId,
    );
    if (category.type !== 'EXPENSE') {
      throw new BadRequestException('Category type must be EXPENSE.');
    }
  }

  private requirePositiveAmount(amountCents: number): number {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('Amount must be greater than zero.');
    }
    return amountCents;
  }

  private requireExpenseDate(value: Date): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new BadRequestException('Expense date is required.');
    }
    return value;
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    return value.trim() || null;
  }

  private toModel(row: Expense): ExpenseModel {
    return {
      id: row.id,
      userId: row.userId,
      transactionId: row.transactionId,
      accountId: row.accountId,
      categoryId: row.categoryId,
      merchantName: row.merchantName,
      amountCents: row.amountCents,
      expenseDate: row.expenseDate,
      description: row.description,
      referenceNumber: row.referenceNumber,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as ExpenseModel;
  }
}
