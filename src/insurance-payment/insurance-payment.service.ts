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
import { InsuranceService } from '../insurance/insurance.service';
import { TransactionService } from '../transaction/transaction.service';
import {
  CreateInsurancePaymentInput,
  INSURANCE_PAYMENT_TYPES,
} from './dto/create-insurance-payment.input';
import { InsurancePaymentFilterInput } from './dto/insurance-payment-filter.input';
import { UpdateInsurancePaymentInput } from './dto/update-insurance-payment.input';
import {
  InsurancePayment,
  InsurancePaymentType,
} from './insurance-payment.entity';
import { InsurancePaymentModel } from './models/insurance-payment.model';

@Injectable()
export class InsurancePaymentService {
  constructor(
    @InjectRepository(InsurancePayment)
    private readonly paymentsRepo: Repository<InsurancePayment>,
    @InjectRepository(Account)
    private readonly accountsRepo: Repository<Account>,
    private readonly transactionService: TransactionService,
    private readonly insuranceService: InsuranceService,
    private readonly accountService: AccountService,
    private readonly categoryService: CategoryService,
  ) {}

  async findMyPayments(
    userId: string,
    filter?: InsurancePaymentFilterInput,
  ): Promise<InsurancePaymentModel[]> {
    return this.queryPayments(userId, filter ?? {});
  }

  async findByIdForUser(
    userId: string,
    paymentId: string,
  ): Promise<InsurancePaymentModel> {
    const row = await this.requireOwnedPayment(userId, paymentId);
    return this.toModel(row);
  }

  async findByInsurance(
    userId: string,
    insuranceId: string,
    filter?: InsurancePaymentFilterInput,
  ): Promise<InsurancePaymentModel[]> {
    await this.insuranceService.findByIdForUser(userId, insuranceId);
    return this.queryPayments(userId, {
      ...filter,
      insurance_id: insuranceId,
    });
  }

  async findByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    filter?: InsurancePaymentFilterInput,
  ): Promise<InsurancePaymentModel[]> {
    if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('startDate is required.');
    }
    if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('endDate is required.');
    }
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be on or before endDate.');
    }
    return this.queryPayments(userId, {
      ...filter,
      start_date: startDate,
      end_date: endDate,
    });
  }

  async create(
    userId: string,
    input: CreateInsurancePaymentInput,
  ): Promise<InsurancePaymentModel> {
    const amountCents = this.requirePositiveAmount(input.amount_cents);
    const paymentDate = this.requirePaymentDate(input.payment_date);
    const paymentType = this.requirePaymentType(input.payment_type);
    const coveragePeriodStart = this.requireDateString(
      input.coverage_period_start,
      'Coverage period start',
    );
    const coveragePeriodEnd = this.requireDateString(
      input.coverage_period_end,
      'Coverage period end',
    );
    this.assertCoveragePeriod(coveragePeriodStart, coveragePeriodEnd);

    const policy = await this.insuranceService.findByIdForUser(
      userId,
      input.insurance_id,
    );
    if (!policy.isActive) {
      throw new BadRequestException(
        'Inactive insurance policies cannot receive payments.',
      );
    }

    await this.assertWritablePaymentAccount(userId, input.payment_account_id);
    await this.assertSufficientAccountBalance(
      input.payment_account_id,
      amountCents,
    );
    await this.categoryService.assertAssignable(input.category_id, userId);

    const referenceNumber = input.reference_number?.trim() || null;
    const notes = input.notes?.trim() || null;
    const paymentDateStr = paymentDate.toISOString().slice(0, 10);

    const saved = await this.paymentsRepo.manager.transaction(
      async (manager) => {
        const paymentRepo = manager.getRepository(InsurancePayment);

        const ledger = await this.transactionService.create(
          userId,
          {
            account_id: input.payment_account_id,
            category_id: input.category_id,
            transaction_type: 'INSURANCE_PAYMENT',
            amount_cents: amountCents,
            transaction_date: paymentDate,
            description: `Insurance payment (${paymentType})`,
            reference_number: referenceNumber ?? undefined,
            notes: notes ?? undefined,
            status: 'COMPLETED',
          },
          manager,
        );

        const applied = await this.insuranceService.applyPremiumPayment(
          userId,
          input.insurance_id,
          {
            paymentDate: paymentDateStr,
            coveragePeriodEnd,
          },
          manager,
        );

        const entity = paymentRepo.create({
          userId,
          insuranceId: input.insurance_id,
          paymentAccountId: input.payment_account_id,
          transactionId: ledger.id,
          amountCents,
          paymentDate,
          paymentType,
          coveragePeriodStart,
          coveragePeriodEnd,
          previousRenewalDate: applied.previousRenewalDate,
          previousLastPaymentDate: applied.previousLastPaymentDate,
          referenceNumber,
          notes,
        });

        return paymentRepo.save(entity);
      },
    );

    return this.toModel(saved);
  }

  async update(
    userId: string,
    paymentId: string,
    input: UpdateInsurancePaymentInput,
  ): Promise<InsurancePaymentModel> {
    const existing = await this.requireOwnedPayment(userId, paymentId);

    const nextInsuranceId = input.insurance_id ?? existing.insuranceId;
    const nextAccountId =
      input.payment_account_id ?? existing.paymentAccountId;
    const nextAmount =
      input.amount_cents !== undefined
        ? this.requirePositiveAmount(input.amount_cents)
        : existing.amountCents;
    const nextDate =
      input.payment_date !== undefined
        ? this.requirePaymentDate(input.payment_date)
        : existing.paymentDate;
    const nextType =
      input.payment_type !== undefined
        ? this.requirePaymentType(input.payment_type)
        : existing.paymentType;
    const nextCoverageStart =
      input.coverage_period_start !== undefined
        ? this.requireDateString(
            input.coverage_period_start,
            'Coverage period start',
          )
        : this.toDateField(existing.coveragePeriodStart);
    const nextCoverageEnd =
      input.coverage_period_end !== undefined
        ? this.requireDateString(
            input.coverage_period_end,
            'Coverage period end',
          )
        : this.toDateField(existing.coveragePeriodEnd);

    this.assertCoveragePeriod(nextCoverageStart, nextCoverageEnd);

    if (input.insurance_id !== undefined) {
      const policy = await this.insuranceService.findByIdForUser(
        userId,
        nextInsuranceId,
      );
      if (!policy.isActive) {
        throw new BadRequestException(
          'Inactive insurance policies cannot receive payments.',
        );
      }
    }
    if (input.payment_account_id !== undefined) {
      await this.assertWritablePaymentAccount(userId, nextAccountId);
    }
    if (input.category_id !== undefined) {
      await this.categoryService.assertAssignable(input.category_id, userId);
    }

    const accountCreditBack =
      nextAccountId === existing.paymentAccountId ? existing.amountCents : 0;
    await this.assertSufficientAccountBalance(
      nextAccountId,
      nextAmount,
      accountCreditBack,
    );

    const paymentDateStr = nextDate.toISOString().slice(0, 10);

    const saved = await this.paymentsRepo.manager.transaction(
      async (manager) => {
        const paymentRepo = manager.getRepository(InsurancePayment);

        const row = await paymentRepo.findOne({ where: { id: paymentId } });
        if (!row || row.userId !== userId) {
          throw new NotFoundException('Insurance payment not found.');
        }

        await this.insuranceService.reversePremiumPayment(
          userId,
          row.insuranceId,
          {
            previousRenewalDate:
              row.previousRenewalDate ??
              this.toDateField(row.coveragePeriodStart),
            previousLastPaymentDate: row.previousLastPaymentDate,
          },
          manager,
        );

        const applied = await this.insuranceService.applyPremiumPayment(
          userId,
          nextInsuranceId,
          {
            paymentDate: paymentDateStr,
            coveragePeriodEnd: nextCoverageEnd,
          },
          manager,
        );

        await this.transactionService.update(
          userId,
          row.transactionId,
          {
            account_id: input.payment_account_id,
            category_id: input.category_id,
            amount_cents: input.amount_cents,
            transaction_date: input.payment_date,
            description:
              input.payment_type !== undefined ||
              input.amount_cents !== undefined
                ? `Insurance payment (${nextType})`
                : undefined,
            reference_number: input.reference_number,
            notes: input.notes,
          },
          manager,
        );

        if (input.insurance_id !== undefined) {
          row.insuranceId = nextInsuranceId;
        }
        if (input.payment_account_id !== undefined) {
          row.paymentAccountId = nextAccountId;
        }
        if (input.amount_cents !== undefined) row.amountCents = nextAmount;
        if (input.payment_date !== undefined) row.paymentDate = nextDate;
        if (input.payment_type !== undefined) row.paymentType = nextType;
        if (input.coverage_period_start !== undefined) {
          row.coveragePeriodStart = nextCoverageStart;
        }
        if (input.coverage_period_end !== undefined) {
          row.coveragePeriodEnd = nextCoverageEnd;
        }
        row.previousRenewalDate = applied.previousRenewalDate;
        row.previousLastPaymentDate = applied.previousLastPaymentDate;
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

        return paymentRepo.save(row);
      },
    );

    return this.toModel(saved);
  }

  async delete(userId: string, paymentId: string): Promise<boolean> {
    await this.requireOwnedPayment(userId, paymentId);

    await this.paymentsRepo.manager.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(InsurancePayment);

      const row = await paymentRepo.findOne({ where: { id: paymentId } });
      if (!row || row.userId !== userId) {
        throw new NotFoundException('Insurance payment not found.');
      }

      const {
        transactionId,
        insuranceId,
        previousRenewalDate,
        previousLastPaymentDate,
        coveragePeriodStart,
      } = row;

      await paymentRepo.remove(row);
      await this.transactionService.delete(userId, transactionId, manager);
      await this.insuranceService.reversePremiumPayment(
        userId,
        insuranceId,
        {
          previousRenewalDate:
            previousRenewalDate ?? this.toDateField(coveragePeriodStart),
          previousLastPaymentDate,
        },
        manager,
      );
    });

    return true;
  }

  private async queryPayments(
    userId: string,
    filter: InsurancePaymentFilterInput,
  ): Promise<InsurancePaymentModel[]> {
    const where: FindOptionsWhere<InsurancePayment> = { userId };

    if (filter.insurance_id) {
      where.insuranceId = filter.insurance_id;
    }
    if (filter.payment_account_id) {
      where.paymentAccountId = filter.payment_account_id;
    }
    if (filter.payment_type) {
      where.paymentType = this.requirePaymentType(filter.payment_type);
    }

    if (filter.start_date && filter.end_date) {
      where.paymentDate = Between(filter.start_date, filter.end_date);
    } else if (filter.start_date) {
      where.paymentDate = MoreThanOrEqual(filter.start_date);
    } else if (filter.end_date) {
      where.paymentDate = LessThanOrEqual(filter.end_date);
    }

    const sortNewest = (filter.sort_order ?? 'NEWEST') !== 'OLDEST';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const rows = await this.paymentsRepo.find({
      where,
      order: {
        paymentDate: sortNewest ? 'DESC' : 'ASC',
        createdAt: sortNewest ? 'DESC' : 'ASC',
      },
      take: limit,
      skip: offset,
    });

    return rows.map((row) => this.toModel(row));
  }

  private async requireOwnedPayment(
    userId: string,
    paymentId: string,
  ): Promise<InsurancePayment> {
    const row = await this.paymentsRepo.findOne({ where: { id: paymentId } });
    if (!row) {
      throw new NotFoundException('Insurance payment not found.');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('You do not own this insurance payment.');
    }
    return row;
  }

  private async assertWritablePaymentAccount(
    userId: string,
    accountId: string,
  ): Promise<void> {
    const account = await this.accountService.findByIdForUser(userId, accountId);
    if (account.isArchived) {
      throw new BadRequestException(
        'Archived accounts cannot be used for insurance payments.',
      );
    }
  }

  private async assertSufficientAccountBalance(
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

  private assertCoveragePeriod(start: string, end: string): void {
    if (end < start) {
      throw new BadRequestException(
        'Coverage period end must be on or after coverage period start.',
      );
    }
  }

  private requirePositiveAmount(amountCents: number): number {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new BadRequestException('Amount must be greater than zero.');
    }
    return amountCents;
  }

  private requirePaymentDate(value: Date): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new BadRequestException('Payment date is required.');
    }
    return value;
  }

  private requirePaymentType(type: string): InsurancePaymentType {
    if (
      !INSURANCE_PAYMENT_TYPES.includes(
        type as (typeof INSURANCE_PAYMENT_TYPES)[number],
      )
    ) {
      throw new BadRequestException('Invalid payment type.');
    }
    return type as InsurancePaymentType;
  }

  private requireDateString(value: string, label: string): string {
    const trimmed = value?.trim();
    if (!trimmed || Number.isNaN(Date.parse(trimmed))) {
      throw new BadRequestException(`${label} is required.`);
    }
    return trimmed.slice(0, 10);
  }

  private toDateField(value: string | Date): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    return new Date(value).toISOString().slice(0, 10);
  }

  private toModel(row: InsurancePayment): InsurancePaymentModel {
    return {
      id: row.id,
      userId: row.userId,
      insuranceId: row.insuranceId,
      paymentAccountId: row.paymentAccountId,
      transactionId: row.transactionId,
      amountCents: row.amountCents,
      paymentDate: row.paymentDate,
      paymentType: row.paymentType,
      coveragePeriodStart: this.toDateField(row.coveragePeriodStart),
      coveragePeriodEnd: this.toDateField(row.coveragePeriodEnd),
      referenceNumber: row.referenceNumber,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as InsurancePaymentModel;
  }
}
