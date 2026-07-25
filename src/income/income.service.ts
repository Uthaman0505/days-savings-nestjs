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
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { AccountService } from '../account/account.service';
import { CategoryService } from '../category/category.service';
import { TransactionService } from '../transaction/transaction.service';
import { CreateIncomeInput, INCOME_SOURCES } from './dto/create-income.input';
import { IncomeFilterInput } from './dto/income-filter.input';
import { UpdateIncomeInput } from './dto/update-income.input';
import { Income, IncomeSource } from './income.entity';
import { IncomeModel } from './models/income.model';

@Injectable()
export class IncomeService {
  constructor(
    @InjectRepository(Income)
    private readonly incomesRepo: Repository<Income>,
    private readonly transactionService: TransactionService,
    private readonly accountService: AccountService,
    private readonly categoryService: CategoryService,
  ) {}

  async findMyIncome(
    userId: string,
    filter?: IncomeFilterInput,
  ): Promise<IncomeModel[]> {
    return this.queryIncomes(userId, filter ?? {});
  }

  async findByIdForUser(
    userId: string,
    incomeId: string,
  ): Promise<IncomeModel> {
    const row = await this.requireOwnedIncome(userId, incomeId);
    return this.toModel(row);
  }

  async findByAccount(
    userId: string,
    accountId: string,
    filter?: IncomeFilterInput,
  ): Promise<IncomeModel[]> {
    await this.accountService.findByIdForUser(userId, accountId);
    return this.queryIncomes(userId, {
      ...filter,
      account_id: accountId,
    });
  }

  async findByCategory(
    userId: string,
    categoryId: string,
    filter?: IncomeFilterInput,
  ): Promise<IncomeModel[]> {
    await this.categoryService.findByIdForUser(userId, categoryId);
    return this.queryIncomes(userId, {
      ...filter,
      category_id: categoryId,
    });
  }

  async findByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    filter?: IncomeFilterInput,
  ): Promise<IncomeModel[]> {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('startDate is required.');
    }
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('endDate is required.');
    }
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be on or before endDate.');
    }
    return this.queryIncomes(userId, {
      ...filter,
      start_date: startDate,
      end_date: endDate,
    });
  }

  async create(userId: string, input: CreateIncomeInput): Promise<IncomeModel> {
    const amountCents = this.requirePositiveAmount(input.amount_cents);
    const incomeSource = this.requireIncomeSource(input.income_source);
    const receivedDate = this.requireReceivedDate(input.received_date);

    await this.assertWritableAccount(userId, input.account_id);
    await this.assertIncomeCategory(userId, input.category_id);

    const saved = await this.incomesRepo.manager.transaction(async (manager) => {
      const incomeRepo = manager.getRepository(Income);

      const ledger = await this.transactionService.create(
        userId,
        {
          account_id: input.account_id,
          category_id: input.category_id,
          transaction_type: 'INCOME',
          amount_cents: amountCents,
          transaction_date: receivedDate,
          description: input.description,
          reference_number: input.reference_number,
          notes: input.notes,
          status: 'COMPLETED',
        },
        manager,
      );

      const entity = incomeRepo.create({
        userId,
        transactionId: ledger.id,
        accountId: input.account_id,
        categoryId: input.category_id,
        incomeSource,
        amountCents,
        receivedDate,
        description: input.description?.trim() || null,
        referenceNumber: input.reference_number?.trim() || null,
        notes: input.notes?.trim() || null,
      });

      return incomeRepo.save(entity);
    });

    return this.toModel(saved);
  }

  async update(
    userId: string,
    incomeId: string,
    input: UpdateIncomeInput,
  ): Promise<IncomeModel> {
    const existing = await this.requireOwnedIncome(userId, incomeId);

    const nextAccountId = input.account_id ?? existing.accountId;
    const nextCategoryId = input.category_id ?? existing.categoryId;
    const nextAmount =
      input.amount_cents !== undefined
        ? this.requirePositiveAmount(input.amount_cents)
        : existing.amountCents;
    const nextSource =
      input.income_source !== undefined
        ? this.requireIncomeSource(input.income_source)
        : existing.incomeSource;
    const nextDate =
      input.received_date !== undefined
        ? this.requireReceivedDate(input.received_date)
        : existing.receivedDate;

    if (input.account_id !== undefined) {
      await this.assertWritableAccount(userId, nextAccountId);
    }
    if (input.category_id !== undefined) {
      await this.assertIncomeCategory(userId, nextCategoryId);
    }

    const saved = await this.incomesRepo.manager.transaction(async (manager) => {
      const incomeRepo = manager.getRepository(Income);

      const row = await incomeRepo.findOne({ where: { id: incomeId } });
      if (!row || row.userId !== userId) {
        throw new NotFoundException('Income not found.');
      }

      await this.transactionService.update(
        userId,
        row.transactionId,
        {
          account_id: input.account_id,
          category_id: input.category_id,
          amount_cents: input.amount_cents,
          transaction_date: input.received_date,
          description: input.description,
          reference_number: input.reference_number,
          notes: input.notes,
        },
        manager,
      );

      if (input.account_id !== undefined) row.accountId = nextAccountId;
      if (input.category_id !== undefined) row.categoryId = nextCategoryId;
      if (input.income_source !== undefined) row.incomeSource = nextSource;
      if (input.amount_cents !== undefined) row.amountCents = nextAmount;
      if (input.received_date !== undefined) row.receivedDate = nextDate;
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
        row.notes = input.notes === null ? null : input.notes.trim() || null;
      }

      return incomeRepo.save(row);
    });

    return this.toModel(saved);
  }

  async delete(userId: string, incomeId: string): Promise<boolean> {
    await this.requireOwnedIncome(userId, incomeId);

    await this.incomesRepo.manager.transaction(async (manager) => {
      const incomeRepo = manager.getRepository(Income);

      const row = await incomeRepo.findOne({ where: { id: incomeId } });
      if (!row || row.userId !== userId) {
        throw new NotFoundException('Income not found.');
      }

      const transactionId = row.transactionId;
      await incomeRepo.remove(row);
      await this.transactionService.delete(userId, transactionId, manager);
    });

    return true;
  }

  private async queryIncomes(
    userId: string,
    filter: IncomeFilterInput,
  ): Promise<IncomeModel[]> {
    const where: FindOptionsWhere<Income> = { userId };

    if (filter.account_id) {
      where.accountId = filter.account_id;
    }
    if (filter.category_id) {
      where.categoryId = filter.category_id;
    }
    if (filter.income_source) {
      where.incomeSource = this.requireIncomeSource(filter.income_source);
    }

    if (filter.start_date && filter.end_date) {
      where.receivedDate = Between(filter.start_date, filter.end_date);
    } else if (filter.start_date) {
      where.receivedDate = MoreThanOrEqual(filter.start_date);
    } else if (filter.end_date) {
      where.receivedDate = LessThanOrEqual(filter.end_date);
    }

    const sortNewest = (filter.sort_order ?? 'NEWEST') !== 'OLDEST';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const rows = await this.incomesRepo.find({
      where,
      order: {
        receivedDate: sortNewest ? 'DESC' : 'ASC',
        createdAt: sortNewest ? 'DESC' : 'ASC',
      },
      take: limit,
      skip: offset,
    });

    return rows.map((row) => this.toModel(row));
  }

  private async requireOwnedIncome(
    userId: string,
    incomeId: string,
  ): Promise<Income> {
    const row = await this.incomesRepo.findOne({ where: { id: incomeId } });
    if (!row) {
      throw new NotFoundException('Income not found.');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not own this income.');
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
        'Archived accounts cannot be used for income.',
      );
    }
  }

  private async assertIncomeCategory(
    userId: string,
    categoryId: string,
  ): Promise<void> {
    const category = await this.categoryService.assertAssignable(
      categoryId,
      userId,
    );
    if (category.type !== 'INCOME') {
      throw new BadRequestException('Category type must be INCOME.');
    }
  }

  private requirePositiveAmount(amountCents: number): number {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('Amount must be greater than zero.');
    }
    return amountCents;
  }

  private requireReceivedDate(value: Date): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new BadRequestException('Received date is required.');
    }
    return value;
  }

  private requireIncomeSource(source: string): IncomeSource {
    if (!INCOME_SOURCES.includes(source as (typeof INCOME_SOURCES)[number])) {
      throw new BadRequestException('Invalid income source.');
    }
    return source as IncomeSource;
  }

  private toModel(row: Income): IncomeModel {
    return {
      id: row.id,
      userId: row.userId,
      transactionId: row.transactionId,
      accountId: row.accountId,
      categoryId: row.categoryId,
      incomeSource: row.incomeSource,
      amountCents: row.amountCents,
      receivedDate: row.receivedDate,
      description: row.description,
      referenceNumber: row.referenceNumber,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as IncomeModel;
  }
}
