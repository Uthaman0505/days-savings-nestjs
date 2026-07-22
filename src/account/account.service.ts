import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Account, AccountType } from './account.entity';
import { CreateAccountInput } from './dto/create-account.input';
import { UpdateAccountInput } from './dto/update-account.input';
import { AccountModel } from './models/account.model';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Account)
    private readonly accountsRepo: Repository<Account>,
  ) {}

  async findMyAccounts(userId: string): Promise<AccountModel[]> {
    const rows = await this.accountsRepo.find({
      where: { userId },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findByIdForUser(userId: string, accountId: string): Promise<AccountModel> {
    const row = await this.requireOwnedAccount(userId, accountId);
    return this.toModel(row);
  }

  async create(userId: string, input: CreateAccountInput): Promise<AccountModel> {
    const accountName = this.normalizeName(input.account_name);
    await this.assertUniqueName(userId, accountName);

    const wantDefault = input.is_default === true;
    const openingBalanceCents = this.rmToCents(input.opening_balance ?? 0);

    if (wantDefault) {
      await this.clearDefaultFlags(userId);
    }

    const existingCount = await this.accountsRepo.count({ where: { userId } });
    // First account is always default; otherwise honor is_default input.
    const isDefault = wantDefault || existingCount === 0;

    const entity = this.accountsRepo.create({
      userId,
      accountName,
      accountType: input.account_type as AccountType,
      bankName: input.bank_name?.trim() || null,
      accountNumber: input.account_number?.trim() || null,
      currencyCode: (input.currency_code ?? 'MYR').toUpperCase(),
      openingBalanceCents,
      currentBalanceCents: openingBalanceCents,
      color: input.color?.trim() || null,
      icon: input.icon?.trim() || null,
      displayOrder: input.display_order ?? 0,
      isDefault,
      isArchived: false,
    });

    const saved = await this.accountsRepo.save(entity);
    return this.toModel(saved);
  }

  async update(
    userId: string,
    accountId: string,
    input: UpdateAccountInput,
  ): Promise<AccountModel> {
    const account = await this.requireOwnedAccount(userId, accountId);

    if (input.account_name !== undefined) {
      const accountName = this.normalizeName(input.account_name);
      await this.assertUniqueName(userId, accountName, accountId);
      account.accountName = accountName;
    }

    if (input.account_type !== undefined) {
      account.accountType = input.account_type as AccountType;
    }
    if (input.bank_name !== undefined) {
      account.bankName =
        input.bank_name === null ? null : input.bank_name.trim() || null;
    }
    if (input.account_number !== undefined) {
      account.accountNumber =
        input.account_number === null
          ? null
          : input.account_number.trim() || null;
    }
    if (input.currency_code !== undefined) {
      account.currencyCode = input.currency_code.toUpperCase();
    }
    if (input.color !== undefined) {
      account.color =
        input.color === null ? null : input.color.trim() || null;
    }
    if (input.icon !== undefined) {
      account.icon = input.icon === null ? null : input.icon.trim() || null;
    }
    if (input.display_order !== undefined) {
      account.displayOrder = input.display_order;
    }

    if (input.is_default === true) {
      if (account.isArchived) {
        throw new BadRequestException('Archived accounts cannot become default.');
      }
      await this.clearDefaultFlags(userId);
      account.isDefault = true;
    } else if (input.is_default === false) {
      account.isDefault = false;
    }

    const saved = await this.accountsRepo.save(account);
    return this.toModel(saved);
  }

  async archive(userId: string, accountId: string): Promise<AccountModel> {
    const account = await this.requireOwnedAccount(userId, accountId);
    account.isArchived = true;
    account.isDefault = false;
    const saved = await this.accountsRepo.save(account);
    return this.toModel(saved);
  }

  async delete(userId: string, accountId: string): Promise<boolean> {
    const account = await this.requireOwnedAccount(userId, accountId);
    await this.accountsRepo.remove(account);
    return true;
  }

  async setDefault(userId: string, accountId: string): Promise<AccountModel> {
    const account = await this.requireOwnedAccount(userId, accountId);
    if (account.isArchived) {
      throw new BadRequestException('Archived accounts cannot become default.');
    }
    await this.clearDefaultFlags(userId);
    account.isDefault = true;
    const saved = await this.accountsRepo.save(account);
    return this.toModel(saved);
  }

  private async requireOwnedAccount(
    userId: string,
    accountId: string,
  ): Promise<Account> {
    const account = await this.accountsRepo.findOne({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException('Account not found.');
    }
    if (account.userId !== userId) {
      throw new ForbiddenException('You do not own this account.');
    }
    return account;
  }

  private async assertUniqueName(
    userId: string,
    accountName: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.accountsRepo.findOne({
      where: excludeId
        ? { userId, accountName, id: Not(excludeId) }
        : { userId, accountName },
    });
    if (existing) {
      throw new BadRequestException(
        'An account with this name already exists.',
      );
    }
  }

  private async clearDefaultFlags(userId: string): Promise<void> {
    await this.accountsRepo.update(
      { userId, isDefault: true },
      { isDefault: false },
    );
  }

  private normalizeName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException('Account name is required.');
    }
    return trimmed;
  }

  private rmToCents(value: number): number {
    return Math.round(value * 100);
  }

  private centsToRm(value: number): number {
    return Number((value / 100).toFixed(2));
  }

  private toModel(row: Account): AccountModel {
    return {
      id: row.id,
      accountName: row.accountName,
      accountType: row.accountType,
      bankName: row.bankName,
      accountNumber: row.accountNumber,
      currencyCode: row.currencyCode,
      openingBalance: this.centsToRm(row.openingBalanceCents),
      currentBalance: this.centsToRm(row.currentBalanceCents),
      color: row.color,
      icon: row.icon,
      displayOrder: row.displayOrder,
      isDefault: row.isDefault,
      isArchived: row.isArchived,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as AccountModel;
  }
}
