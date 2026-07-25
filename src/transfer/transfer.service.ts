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
import { Account } from '../account/account.entity';
import { AccountService } from '../account/account.service';
import { CategoryService } from '../category/category.service';
import { TransactionService } from '../transaction/transaction.service';
import { CreateTransferInput } from './dto/create-transfer.input';
import { TransferFilterInput } from './dto/transfer-filter.input';
import { UpdateTransferInput } from './dto/update-transfer.input';
import { TransferModel } from './models/transfer.model';
import { Transfer } from './transfer.entity';

@Injectable()
export class TransferService {
  constructor(
    @InjectRepository(Transfer)
    private readonly transfersRepo: Repository<Transfer>,
    @InjectRepository(Account)
    private readonly accountsRepo: Repository<Account>,
    private readonly transactionService: TransactionService,
    private readonly accountService: AccountService,
    private readonly categoryService: CategoryService,
  ) {}

  async findMyTransfers(
    userId: string,
    filter?: TransferFilterInput,
  ): Promise<TransferModel[]> {
    return this.queryTransfers(userId, filter ?? {});
  }

  async findByIdForUser(
    userId: string,
    transferId: string,
  ): Promise<TransferModel> {
    const row = await this.requireOwnedTransfer(userId, transferId);
    return this.toModel(row);
  }

  async findByAccount(
    userId: string,
    accountId: string,
    filter?: TransferFilterInput,
  ): Promise<TransferModel[]> {
    await this.accountService.findByIdForUser(userId, accountId);

    const sortNewest = (filter?.sort_order ?? 'NEWEST') !== 'OLDEST';
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const qb = this.transfersRepo
      .createQueryBuilder('transfer')
      .where('transfer.user_id = :userId', { userId })
      .andWhere(
        '(transfer.from_account_id = :accountId OR transfer.to_account_id = :accountId)',
        { accountId },
      );

    if (filter?.from_account_id) {
      qb.andWhere('transfer.from_account_id = :fromAccountId', {
        fromAccountId: filter.from_account_id,
      });
    }
    if (filter?.to_account_id) {
      qb.andWhere('transfer.to_account_id = :toAccountId', {
        toAccountId: filter.to_account_id,
      });
    }
    if (filter?.start_date && filter?.end_date) {
      qb.andWhere('transfer.transfer_date BETWEEN :startDate AND :endDate', {
        startDate: filter.start_date,
        endDate: filter.end_date,
      });
    } else if (filter?.start_date) {
      qb.andWhere('transfer.transfer_date >= :startDate', {
        startDate: filter.start_date,
      });
    } else if (filter?.end_date) {
      qb.andWhere('transfer.transfer_date <= :endDate', {
        endDate: filter.end_date,
      });
    }

    qb.orderBy('transfer.transfer_date', sortNewest ? 'DESC' : 'ASC')
      .addOrderBy('transfer.created_at', sortNewest ? 'DESC' : 'ASC')
      .take(limit)
      .skip(offset);

    const rows = await qb.getMany();
    return rows.map((row) => this.toModel(row));
  }

  async findByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    filter?: TransferFilterInput,
  ): Promise<TransferModel[]> {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('startDate is required.');
    }
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('endDate is required.');
    }
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be on or before endDate.');
    }
    return this.queryTransfers(userId, {
      ...filter,
      start_date: startDate,
      end_date: endDate,
    });
  }

  async create(
    userId: string,
    input: CreateTransferInput,
  ): Promise<TransferModel> {
    const amountCents = this.requirePositiveAmount(input.amount_cents);
    const transferDate = this.requireTransferDate(input.transfer_date);
    this.assertDifferentAccounts(input.from_account_id, input.to_account_id);

    await this.assertWritableAccount(userId, input.from_account_id);
    await this.assertWritableAccount(userId, input.to_account_id);
    await this.assertTransferCategory(userId, input.category_id);
    await this.assertSufficientBalance(input.from_account_id, amountCents);

    const description = input.description?.trim() || null;
    const referenceNumber = input.reference_number?.trim() || null;
    const notes = input.notes?.trim() || null;

    const saved = await this.transfersRepo.manager.transaction(
      async (manager) => {
        const transferRepo = manager.getRepository(Transfer);

        const outLedger = await this.transactionService.create(
          userId,
          {
            account_id: input.from_account_id,
            category_id: input.category_id,
            transaction_type: 'TRANSFER_OUT',
            amount_cents: amountCents,
            transaction_date: transferDate,
            description: description ?? undefined,
            reference_number: referenceNumber ?? undefined,
            notes: notes ?? undefined,
            status: 'COMPLETED',
          },
          manager,
        );

        const inLedger = await this.transactionService.create(
          userId,
          {
            account_id: input.to_account_id,
            category_id: input.category_id,
            transaction_type: 'TRANSFER_IN',
            amount_cents: amountCents,
            transaction_date: transferDate,
            description: description ?? undefined,
            reference_number: referenceNumber ?? undefined,
            notes: notes ?? undefined,
            status: 'COMPLETED',
          },
          manager,
        );

        const entity = transferRepo.create({
          userId,
          fromAccountId: input.from_account_id,
          toAccountId: input.to_account_id,
          outTransactionId: outLedger.id,
          inTransactionId: inLedger.id,
          amountCents,
          transferDate,
          referenceNumber,
          description,
          notes,
        });

        return transferRepo.save(entity);
      },
    );

    return this.toModel(saved);
  }

  async update(
    userId: string,
    transferId: string,
    input: UpdateTransferInput,
  ): Promise<TransferModel> {
    const existing = await this.requireOwnedTransfer(userId, transferId);

    const nextFromAccountId = input.from_account_id ?? existing.fromAccountId;
    const nextToAccountId = input.to_account_id ?? existing.toAccountId;
    const nextAmount =
      input.amount_cents !== undefined
        ? this.requirePositiveAmount(input.amount_cents)
        : existing.amountCents;
    const nextDate =
      input.transfer_date !== undefined
        ? this.requireTransferDate(input.transfer_date)
        : existing.transferDate;

    this.assertDifferentAccounts(nextFromAccountId, nextToAccountId);

    if (input.from_account_id !== undefined) {
      await this.assertWritableAccount(userId, nextFromAccountId);
    }
    if (input.to_account_id !== undefined) {
      await this.assertWritableAccount(userId, nextToAccountId);
    }
    if (input.category_id !== undefined) {
      await this.assertTransferCategory(userId, input.category_id);
    }

    const creditBack =
      nextFromAccountId === existing.fromAccountId ? existing.amountCents : 0;
    await this.assertSufficientBalance(
      nextFromAccountId,
      nextAmount,
      creditBack,
    );

    const saved = await this.transfersRepo.manager.transaction(
      async (manager) => {
        const transferRepo = manager.getRepository(Transfer);

        const row = await transferRepo.findOne({ where: { id: transferId } });
        if (!row || row.userId !== userId) {
          throw new NotFoundException('Transfer not found.');
        }

        await this.transactionService.update(
          userId,
          row.outTransactionId,
          {
            account_id: input.from_account_id,
            category_id: input.category_id,
            amount_cents: input.amount_cents,
            transaction_date: input.transfer_date,
            description: input.description,
            reference_number: input.reference_number,
            notes: input.notes,
          },
          manager,
        );

        await this.transactionService.update(
          userId,
          row.inTransactionId,
          {
            account_id: input.to_account_id,
            category_id: input.category_id,
            amount_cents: input.amount_cents,
            transaction_date: input.transfer_date,
            description: input.description,
            reference_number: input.reference_number,
            notes: input.notes,
          },
          manager,
        );

        if (input.from_account_id !== undefined) {
          row.fromAccountId = nextFromAccountId;
        }
        if (input.to_account_id !== undefined) {
          row.toAccountId = nextToAccountId;
        }
        if (input.amount_cents !== undefined) row.amountCents = nextAmount;
        if (input.transfer_date !== undefined) row.transferDate = nextDate;
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

        return transferRepo.save(row);
      },
    );

    return this.toModel(saved);
  }

  async delete(userId: string, transferId: string): Promise<boolean> {
    await this.requireOwnedTransfer(userId, transferId);

    await this.transfersRepo.manager.transaction(async (manager) => {
      const transferRepo = manager.getRepository(Transfer);

      const row = await transferRepo.findOne({ where: { id: transferId } });
      if (!row || row.userId !== userId) {
        throw new NotFoundException('Transfer not found.');
      }

      const { outTransactionId, inTransactionId } = row;
      await transferRepo.remove(row);
      await this.transactionService.delete(userId, outTransactionId, manager);
      await this.transactionService.delete(userId, inTransactionId, manager);
    });

    return true;
  }

  private async queryTransfers(
    userId: string,
    filter: TransferFilterInput,
  ): Promise<TransferModel[]> {
    const where: FindOptionsWhere<Transfer> = { userId };

    if (filter.from_account_id) {
      where.fromAccountId = filter.from_account_id;
    }
    if (filter.to_account_id) {
      where.toAccountId = filter.to_account_id;
    }

    if (filter.start_date && filter.end_date) {
      where.transferDate = Between(filter.start_date, filter.end_date);
    } else if (filter.start_date) {
      where.transferDate = MoreThanOrEqual(filter.start_date);
    } else if (filter.end_date) {
      where.transferDate = LessThanOrEqual(filter.end_date);
    }

    const sortNewest = (filter.sort_order ?? 'NEWEST') !== 'OLDEST';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const rows = await this.transfersRepo.find({
      where,
      order: {
        transferDate: sortNewest ? 'DESC' : 'ASC',
        createdAt: sortNewest ? 'DESC' : 'ASC',
      },
      take: limit,
      skip: offset,
    });

    return rows.map((row) => this.toModel(row));
  }

  private async requireOwnedTransfer(
    userId: string,
    transferId: string,
  ): Promise<Transfer> {
    const row = await this.transfersRepo.findOne({
      where: { id: transferId },
    });
    if (!row) {
      throw new NotFoundException('Transfer not found.');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not own this transfer.');
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
        'Archived accounts cannot be used for transfers.',
      );
    }
  }

  private async assertTransferCategory(
    userId: string,
    categoryId: string,
  ): Promise<void> {
    const category = await this.categoryService.assertAssignable(
      categoryId,
      userId,
    );
    if (category.type !== 'TRANSFER') {
      throw new BadRequestException('Category type must be TRANSFER.');
    }
  }

  private async assertSufficientBalance(
    accountId: string,
    amountCents: number,
    creditBackCents = 0,
  ): Promise<void> {
    const account = await this.accountsRepo.findOne({
      where: { id: accountId },
    });
    if (!account) {
      throw new NotFoundException('Account not found.');
    }

    const available = account.currentBalanceCents + creditBackCents;
    if (available < amountCents) {
      throw new BadRequestException('Insufficient account balance.');
    }
  }

  private assertDifferentAccounts(fromId: string, toId: string): void {
    if (fromId === toId) {
      throw new BadRequestException(
        'Source and destination accounts must be different.',
      );
    }
  }

  private requirePositiveAmount(amountCents: number): number {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('Amount must be greater than zero.');
    }
    return amountCents;
  }

  private requireTransferDate(value: Date): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new BadRequestException('Transfer date is required.');
    }
    return value;
  }

  private toModel(row: Transfer): TransferModel {
    return {
      id: row.id,
      userId: row.userId,
      fromAccountId: row.fromAccountId,
      toAccountId: row.toAccountId,
      outTransactionId: row.outTransactionId,
      inTransactionId: row.inTransactionId,
      amountCents: row.amountCents,
      transferDate: row.transferDate,
      referenceNumber: row.referenceNumber,
      description: row.description,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as TransferModel;
  }
}
