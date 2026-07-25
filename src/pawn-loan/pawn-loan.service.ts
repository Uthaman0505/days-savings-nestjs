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
  ILike,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { AddCollateralInput, UpdateCollateralInput } from './dto/add-collateral.input';
import { CreatePawnCollateralInput, CreatePawnLoanInput } from './dto/create-pawn-loan.input';
import {
  DeletePawnLoanInput,
  ForfeitPawnLoanInput,
  RedeemPawnLoanInput,
  UpdatePawnLoanStatusInput,
} from './dto/pawn-loan-actions.input';
import { PawnLoanFilterInput } from './dto/pawn-loan-filter.input';
import { RecordPawnPaymentInput } from './dto/record-pawn-payment.input';
import { RenewPawnLoanInput } from './dto/renew-pawn-loan.input';
import { UpdatePawnLoanInput } from './dto/update-pawn-loan.input';
import {
  PawnCollateralItemType,
  PawnCollateralStatus,
  PawnInterestType,
  PawnLoanStatus,
  PawnPaymentMethod,
  PawnPaymentType,
  PawnTransactionType,
  PAWN_CLOSED_STATUSES,
  PAWN_COLLATERAL_ITEM_TYPES,
  PAWN_COLLATERAL_STATUSES,
  PAWN_INTEREST_TYPES,
  PAWN_LOAN_STATUSES,
  PAWN_PAYMENT_METHODS,
  PAWN_PAYMENT_TYPES,
} from './pawn-loan.enums';
import { PawnCollateral } from './pawn-collateral.entity';
import { PawnLoan } from './pawn-loan.entity';
import { PawnPayment } from './pawn-payment.entity';
import { PawnRenewal } from './pawn-renewal.entity';
import { PawnTransaction } from './pawn-transaction.entity';
import {
  PawnCollateralModel,
  PawnLoanModel,
  PawnPaymentModel,
  PawnRenewalModel,
  PawnTransactionModel,
} from './models/pawn-loan.model';

@Injectable()
export class PawnLoanService {
  constructor(
    @InjectRepository(PawnLoan)
    private readonly loansRepo: Repository<PawnLoan>,
    @InjectRepository(PawnCollateral)
    private readonly collateralsRepo: Repository<PawnCollateral>,
    @InjectRepository(PawnPayment)
    private readonly paymentsRepo: Repository<PawnPayment>,
    @InjectRepository(PawnRenewal)
    private readonly renewalsRepo: Repository<PawnRenewal>,
    @InjectRepository(PawnTransaction)
    private readonly transactionsRepo: Repository<PawnTransaction>,
  ) {}

  async findPawnLoans(
    userId: string,
    filter?: PawnLoanFilterInput,
  ): Promise<PawnLoanModel[]> {
    const where: FindOptionsWhere<PawnLoan> = { userId };

    if (filter?.status) {
      where.status = this.requireStatus(filter.status);
    }
    if (filter?.pawn_shop_name?.trim()) {
      where.pawnShopName = ILike(`%${filter.pawn_shop_name.trim()}%`);
    }
    if (filter?.start_date && filter?.end_date) {
      where.loanStartDate = Between(
        this.requireDateString(filter.start_date, 'Start date'),
        this.requireDateString(filter.end_date, 'End date'),
      );
    } else if (filter?.start_date) {
      where.loanStartDate = MoreThanOrEqual(
        this.requireDateString(filter.start_date, 'Start date'),
      );
    } else if (filter?.end_date) {
      where.loanStartDate = LessThanOrEqual(
        this.requireDateString(filter.end_date, 'End date'),
      );
    }

    const sortNewest = (filter?.sort_order ?? 'NEWEST') !== 'OLDEST';
    const rows = await this.loansRepo.find({
      where,
      order: {
        createdAt: sortNewest ? 'DESC' : 'ASC',
        loanStartDate: sortNewest ? 'DESC' : 'ASC',
      },
      take: filter?.limit ?? 50,
      skip: filter?.offset ?? 0,
    });
    return rows.map((r) => this.toLoanModel(r));
  }

  async findPawnLoan(userId: string, id: string): Promise<PawnLoanModel> {
    const loan = await this.requireOwnedLoan(userId, id);
    return this.toLoanModel(loan);
  }

  async findHistory(
    userId: string,
    pawnLoanId: string,
  ): Promise<PawnTransactionModel[]> {
    await this.requireOwnedLoan(userId, pawnLoanId);
    const rows = await this.transactionsRepo.find({
      where: { pawnLoanId },
      order: { transactionDate: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((r) => this.toTxnModel(r));
  }

  async findCollateral(
    userId: string,
    pawnLoanId: string,
  ): Promise<PawnCollateralModel[]> {
    await this.requireOwnedLoan(userId, pawnLoanId);
    const rows = await this.collateralsRepo.find({
      where: { pawnLoanId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => this.toCollateralModel(r));
  }

  async findPayments(
    userId: string,
    pawnLoanId: string,
  ): Promise<PawnPaymentModel[]> {
    await this.requireOwnedLoan(userId, pawnLoanId);
    const rows = await this.paymentsRepo.find({
      where: { pawnLoanId },
      order: { paymentDate: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((r) => this.toPaymentModel(r));
  }

  async findRenewals(
    userId: string,
    pawnLoanId: string,
  ): Promise<PawnRenewalModel[]> {
    await this.requireOwnedLoan(userId, pawnLoanId);
    const rows = await this.renewalsRepo.find({
      where: { pawnLoanId },
      order: { renewalDate: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((r) => this.toRenewalModel(r));
  }

  async create(
    userId: string,
    input: CreatePawnLoanInput,
  ): Promise<PawnLoanModel> {
    const pawnShopName = this.normalizeName(input.pawn_shop_name, 'Pawn shop name');
    const receiptNumber = this.normalizeName(input.receipt_number, 'Receipt number');
    const principal = this.requirePositiveCents(
      input.principal_amount_cents,
      'Principal amount',
    );
    const interestRate = this.requireInterestRate(input.interest_rate ?? 0);
    const interestType = this.requireInterestType(input.interest_type ?? 'FLAT');
    const loanTermMonths = this.requirePositiveInt(
      input.loan_term_months ?? 6,
      'Loan term',
    );
    const gracePeriodDays = this.requireNonNegativeInt(
      input.grace_period_days ?? 14,
      'Grace period days',
    );
    const loanStartDate = this.requireDateString(
      input.loan_start_date,
      'Loan start date',
    );
    const maturityDate =
      input.maturity_date !== undefined
        ? this.requireDateString(input.maturity_date, 'Maturity date')
        : this.addMonths(loanStartDate, loanTermMonths);
    this.assertDateAfter(
      maturityDate,
      loanStartDate,
      'Maturity date must be after loan start date.',
    );
    const gracePeriodEndDate = this.addDays(maturityDate, gracePeriodDays);
    this.assertDateOnOrAfter(
      gracePeriodEndDate,
      maturityDate,
      'Grace period end must be on or after maturity date.',
    );

    await this.assertUniqueReceipt(userId, receiptNumber);

    const saved = await this.loansRepo.manager.transaction(async (manager) => {
      const loansRepo = manager.getRepository(PawnLoan);
      const collateralsRepo = manager.getRepository(PawnCollateral);

      const loan = await loansRepo.save(
        loansRepo.create({
          userId,
          pawnShopName,
          receiptNumber,
          principalAmountCents: principal,
          outstandingPrincipalCents: principal,
          interestRate: interestRate.toFixed(4),
          interestType,
          loanTermMonths,
          gracePeriodDays,
          loanStartDate,
          maturityDate,
          gracePeriodEndDate,
          status: 'ACTIVE',
          currency: (input.currency ?? 'MYR').toUpperCase(),
          remarks: input.remarks?.trim() || null,
        }),
      );

      const collateralInputs = input.collaterals ?? [];
      for (const c of collateralInputs) {
        await collateralsRepo.save(
          this.buildCollateralEntity(collateralsRepo, loan.id, c),
        );
      }

      await this.writeAudit(manager, {
        pawnLoanId: loan.id,
        transactionType: 'CREATE',
        description: `Pawn loan created at ${pawnShopName}`,
        payload: {
          principal_amount_cents: principal,
          maturity_date: maturityDate,
          grace_period_end_date: gracePeriodEndDate,
          collateral_count: collateralInputs.length,
        },
        createdBy: userId,
      });

      await this.writeAudit(manager, {
        pawnLoanId: loan.id,
        transactionType: 'STATUS_CHANGE',
        description: 'Status set to ACTIVE',
        payload: { from: 'CREATED', to: 'ACTIVE' },
        createdBy: userId,
      });

      return loan;
    });

    return this.toLoanModel(saved);
  }

  async update(
    userId: string,
    id: string,
    input: UpdatePawnLoanInput,
  ): Promise<PawnLoanModel> {
    const loan = await this.requireOwnedLoan(userId, id);
    this.assertNotClosed(loan, 'update');

    if (input.pawn_shop_name !== undefined) {
      loan.pawnShopName = this.normalizeName(
        input.pawn_shop_name,
        'Pawn shop name',
      );
    }
    if (input.receipt_number !== undefined) {
      const next = this.normalizeName(input.receipt_number, 'Receipt number');
      await this.assertUniqueReceipt(userId, next, id);
      loan.receiptNumber = next;
    }
    if (input.interest_rate !== undefined) {
      loan.interestRate = this.requireInterestRate(input.interest_rate).toFixed(
        4,
      );
    }
    if (input.interest_type !== undefined) {
      loan.interestType = this.requireInterestType(input.interest_type);
    }
    if (input.loan_term_months !== undefined) {
      loan.loanTermMonths = this.requirePositiveInt(
        input.loan_term_months,
        'Loan term',
      );
    }
    if (input.grace_period_days !== undefined) {
      loan.gracePeriodDays = this.requireNonNegativeInt(
        input.grace_period_days,
        'Grace period days',
      );
    }
    if (input.loan_start_date !== undefined) {
      loan.loanStartDate = this.requireDateString(
        input.loan_start_date,
        'Loan start date',
      );
    }
    if (input.maturity_date !== undefined) {
      loan.maturityDate = this.requireDateString(
        input.maturity_date,
        'Maturity date',
      );
    }
    if (input.grace_period_end_date !== undefined) {
      loan.gracePeriodEndDate = this.requireDateString(
        input.grace_period_end_date,
        'Grace period end date',
      );
    } else if (
      input.maturity_date !== undefined ||
      input.grace_period_days !== undefined
    ) {
      loan.gracePeriodEndDate = this.addDays(
        loan.maturityDate,
        loan.gracePeriodDays,
      );
    }

    this.assertDateAfter(
      loan.maturityDate,
      loan.loanStartDate,
      'Maturity date must be after loan start date.',
    );
    this.assertDateOnOrAfter(
      loan.gracePeriodEndDate,
      loan.maturityDate,
      'Grace period end must be on or after maturity date.',
    );

    if (input.currency !== undefined) {
      loan.currency = input.currency.toUpperCase();
    }
    if (input.remarks !== undefined) {
      loan.remarks =
        input.remarks === null ? null : input.remarks.trim() || null;
    }

    const previousStatus = loan.status;
    if (input.status !== undefined) {
      loan.status = this.requireStatus(input.status);
    }

    const saved = await this.loansRepo.manager.transaction(async (manager) => {
      const loansRepo = manager.getRepository(PawnLoan);
      const updated = await loansRepo.save(loan);
      if (input.status !== undefined && input.status !== previousStatus) {
        await this.writeAudit(manager, {
          pawnLoanId: loan.id,
          transactionType: 'STATUS_CHANGE',
          description: `Status changed from ${previousStatus} to ${loan.status}`,
          payload: { from: previousStatus, to: loan.status },
          createdBy: userId,
        });
      }
      return updated;
    });

    return this.toLoanModel(saved);
  }

  async addCollateral(
    userId: string,
    input: AddCollateralInput,
  ): Promise<PawnCollateralModel> {
    const loan = await this.requireOwnedLoan(userId, input.pawn_loan_id);
    this.assertNotClosed(loan, 'add collateral to');

    const saved = await this.collateralsRepo.manager.transaction(
      async (manager) => {
        const collateralsRepo = manager.getRepository(PawnCollateral);
        const entity = this.buildCollateralEntity(
          collateralsRepo,
          loan.id,
          input.collateral,
        );
        const collateral = await collateralsRepo.save(entity);
        await this.writeAudit(manager, {
          pawnLoanId: loan.id,
          transactionType: 'NOTE',
          description: `Collateral added: ${collateral.itemType}`,
          payload: { collateral_id: collateral.id },
          createdBy: userId,
        });
        return collateral;
      },
    );

    return this.toCollateralModel(saved);
  }

  async updateCollateral(
    userId: string,
    collateralId: string,
    input: UpdateCollateralInput,
  ): Promise<PawnCollateralModel> {
    const collateral = await this.collateralsRepo.findOne({
      where: { id: collateralId },
    });
    if (!collateral) {
      throw new NotFoundException('Collateral not found.');
    }
    const loan = await this.requireOwnedLoan(userId, collateral.pawnLoanId);
    this.assertNotClosed(loan, 'update collateral on');

    if (input.item_type !== undefined) {
      collateral.itemType = this.requireItemType(input.item_type);
    }
    if (input.description !== undefined) {
      collateral.description = this.normalizeName(
        input.description,
        'Description',
      );
    }
    if (input.owner_name !== undefined) {
      collateral.ownerName = this.normalizeName(input.owner_name, 'Owner name');
    }
    if (input.estimated_value_cents !== undefined) {
      collateral.estimatedValueCents = this.requirePositiveCents(
        input.estimated_value_cents,
        'Estimated value',
      );
    }
    if (input.weight !== undefined) {
      collateral.weight =
        input.weight === null ? null : Number(input.weight).toFixed(3);
    }
    if (input.quantity !== undefined) {
      collateral.quantity = this.requirePositiveInt(input.quantity, 'Quantity');
    }
    if (input.serial_number !== undefined) {
      collateral.serialNumber =
        input.serial_number === null
          ? null
          : input.serial_number.trim() || null;
    }
    if (input.image_urls !== undefined) {
      collateral.imageUrls = input.image_urls;
    }
    if (input.current_status !== undefined) {
      collateral.currentStatus = this.requireCollateralStatus(
        input.current_status,
      );
    }

    const saved = await this.collateralsRepo.save(collateral);
    return this.toCollateralModel(saved);
  }

  async recordPayment(
    userId: string,
    input: RecordPawnPaymentInput,
  ): Promise<PawnPaymentModel> {
    const loan = await this.requireOwnedLoan(userId, input.pawn_loan_id);
    this.assertNotClosed(loan, 'pay');

    const paymentType = this.requirePaymentType(input.payment_type);
    const paymentMethod = this.requirePaymentMethod(input.payment_method);
    let principalPaid = this.requireNonNegativeCents(
      input.principal_paid_cents ?? 0,
      'Principal paid',
    );
    let interestPaid = this.requireNonNegativeCents(
      input.interest_paid_cents ?? 0,
      'Interest paid',
    );

    if (paymentType === 'FULL_REDEMPTION') {
      principalPaid = loan.outstandingPrincipalCents;
      if (principalPaid + interestPaid <= 0) {
        throw new BadRequestException(
          'Full redemption requires a positive payment amount.',
        );
      }
    }

    if (paymentType === 'INTEREST_PAYMENT' && principalPaid > 0) {
      throw new BadRequestException(
        'INTEREST_PAYMENT cannot include principal.',
      );
    }
    if (paymentType === 'PRINCIPAL_PAYMENT' && interestPaid > 0) {
      throw new BadRequestException(
        'PRINCIPAL_PAYMENT cannot include interest.',
      );
    }
    if (principalPaid + interestPaid <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }
    if (principalPaid > loan.outstandingPrincipalCents) {
      throw new BadRequestException(
        'Principal paid cannot exceed outstanding principal.',
      );
    }

    const saved = await this.loansRepo.manager.transaction(async (manager) => {
      const loansRepo = manager.getRepository(PawnLoan);
      const paymentsRepo = manager.getRepository(PawnPayment);
      const collateralsRepo = manager.getRepository(PawnCollateral);

      const locked = await loansRepo.findOne({ where: { id: loan.id } });
      if (!locked) throw new NotFoundException('Pawn loan not found.');

      locked.outstandingPrincipalCents -= principalPaid;
      if (locked.outstandingPrincipalCents < 0) {
        throw new BadRequestException('Outstanding principal cannot be negative.');
      }

      const isFullRedemption =
        paymentType === 'FULL_REDEMPTION' ||
        locked.outstandingPrincipalCents === 0;

      if (isFullRedemption) {
        locked.outstandingPrincipalCents = 0;
        locked.status = 'REDEEMED';
        const held = await collateralsRepo.find({
          where: { pawnLoanId: locked.id, currentStatus: 'HELD' },
        });
        for (const c of held) {
          c.currentStatus = 'RETURNED';
          await collateralsRepo.save(c);
        }
      }

      await loansRepo.save(locked);

      const payment = await paymentsRepo.save(
        paymentsRepo.create({
          pawnLoanId: locked.id,
          paymentType: isFullRedemption ? 'FULL_REDEMPTION' : paymentType,
          paymentDate: input.payment_date,
          principalPaidCents: principalPaid,
          interestPaidCents: interestPaid,
          totalPaidCents: principalPaid + interestPaid,
          paymentMethod,
          referenceNumber: input.reference_number?.trim() || null,
          remarks: input.remarks?.trim() || null,
        }),
      );

      const auditType: PawnTransactionType =
        principalPaid > 0 && interestPaid > 0
          ? 'INTEREST_PAYMENT'
          : principalPaid > 0
            ? 'PRINCIPAL_PAYMENT'
            : 'INTEREST_PAYMENT';

      await this.writeAudit(manager, {
        pawnLoanId: locked.id,
        transactionType: isFullRedemption ? 'REDEMPTION' : auditType,
        description: isFullRedemption
          ? 'Loan fully redeemed'
          : `Payment recorded (${paymentType})`,
        payload: {
          payment_id: payment.id,
          principal_paid_cents: principalPaid,
          interest_paid_cents: interestPaid,
          outstanding_principal_cents: locked.outstandingPrincipalCents,
        },
        createdBy: userId,
      });

      return payment;
    });

    return this.toPaymentModel(saved);
  }

  async renew(
    userId: string,
    input: RenewPawnLoanInput,
  ): Promise<PawnLoanModel> {
    const loan = await this.requireOwnedLoan(userId, input.pawn_loan_id);
    this.assertNotClosed(loan, 'renew');

    const interestPaid = this.requireNonNegativeCents(
      input.interest_paid_cents,
      'Interest paid',
    );
    const principalReduction = this.requireNonNegativeCents(
      input.principal_reduction_cents ?? 0,
      'Principal reduction',
    );
    if (interestPaid + principalReduction <= 0) {
      throw new BadRequestException(
        'Renewal requires interest payment and/or principal reduction.',
      );
    }
    if (principalReduction > loan.outstandingPrincipalCents) {
      throw new BadRequestException(
        'Principal reduction cannot exceed outstanding principal.',
      );
    }

    const termMonths = this.requirePositiveInt(
      input.loan_term_months ?? loan.loanTermMonths,
      'Loan term',
    );
    const previousMaturity = loan.maturityDate;
    const renewalBase = input.renewal_date.toISOString().slice(0, 10);
    const newMaturity = this.addMonths(renewalBase, termMonths);
    const newGraceEnd = this.addDays(newMaturity, loan.gracePeriodDays);
    const paymentMethod = this.requirePaymentMethod(
      input.payment_method ?? 'CASH',
    );

    const saved = await this.loansRepo.manager.transaction(async (manager) => {
      const loansRepo = manager.getRepository(PawnLoan);
      const paymentsRepo = manager.getRepository(PawnPayment);
      const renewalsRepo = manager.getRepository(PawnRenewal);

      const locked = await loansRepo.findOne({ where: { id: loan.id } });
      if (!locked) throw new NotFoundException('Pawn loan not found.');

      locked.outstandingPrincipalCents -= principalReduction;
      locked.maturityDate = newMaturity;
      locked.gracePeriodEndDate = newGraceEnd;
      locked.loanTermMonths = termMonths;
      locked.status = 'RENEWED';
      await loansRepo.save(locked);

      // After renewal cycle starts, move to ACTIVE for the new term.
      locked.status = 'ACTIVE';
      await loansRepo.save(locked);

      await paymentsRepo.save(
        paymentsRepo.create({
          pawnLoanId: locked.id,
          paymentType:
            principalReduction > 0
              ? 'INTEREST_AND_PRINCIPAL'
              : 'INTEREST_PAYMENT',
          paymentDate: input.renewal_date,
          principalPaidCents: principalReduction,
          interestPaidCents: interestPaid,
          totalPaidCents: interestPaid + principalReduction,
          paymentMethod,
          referenceNumber: input.reference_number?.trim() || null,
          remarks: input.remarks?.trim() || null,
        }),
      );

      await renewalsRepo.save(
        renewalsRepo.create({
          pawnLoanId: locked.id,
          renewalDate: input.renewal_date,
          previousMaturityDate: previousMaturity,
          newMaturityDate: newMaturity,
          interestPaidCents: interestPaid,
          principalReductionCents: principalReduction,
          remarks: input.remarks?.trim() || null,
        }),
      );

      await this.writeAudit(manager, {
        pawnLoanId: locked.id,
        transactionType: 'RENEWAL',
        description: `Loan renewed until ${newMaturity}`,
        payload: {
          previous_maturity_date: previousMaturity,
          new_maturity_date: newMaturity,
          interest_paid_cents: interestPaid,
          principal_reduction_cents: principalReduction,
          outstanding_principal_cents: locked.outstandingPrincipalCents,
        },
        createdBy: userId,
      });

      return locked;
    });

    return this.toLoanModel(saved);
  }

  async redeem(
    userId: string,
    input: RedeemPawnLoanInput,
  ): Promise<PawnLoanModel> {
    return this.recordPayment(userId, {
      pawn_loan_id: input.pawn_loan_id,
      payment_type: 'FULL_REDEMPTION',
      payment_date: input.payment_date,
      principal_paid_cents: 0,
      interest_paid_cents: 0,
      payment_method: input.payment_method ?? 'CASH',
      reference_number: input.reference_number,
      remarks: input.remarks,
    }).then(async () => this.findPawnLoan(userId, input.pawn_loan_id));
  }

  async forfeit(
    userId: string,
    input: ForfeitPawnLoanInput,
  ): Promise<PawnLoanModel> {
    const loan = await this.requireOwnedLoan(userId, input.pawn_loan_id);
    if (loan.status === 'REDEEMED') {
      throw new BadRequestException('Cannot forfeit a redeemed loan.');
    }
    if (PAWN_CLOSED_STATUSES.includes(loan.status)) {
      throw new BadRequestException('Cannot forfeit a closed loan.');
    }

    const saved = await this.loansRepo.manager.transaction(async (manager) => {
      const loansRepo = manager.getRepository(PawnLoan);
      const collateralsRepo = manager.getRepository(PawnCollateral);

      const locked = await loansRepo.findOne({ where: { id: loan.id } });
      if (!locked) throw new NotFoundException('Pawn loan not found.');

      locked.status = 'FORFEITED';
      if (input.remarks?.trim()) {
        locked.remarks = input.remarks.trim();
      }
      await loansRepo.save(locked);

      const held = await collateralsRepo.find({
        where: { pawnLoanId: locked.id },
      });
      for (const c of held) {
        if (c.currentStatus === 'HELD') {
          c.currentStatus = 'FORFEITED';
          await collateralsRepo.save(c);
        }
      }

      locked.status = 'CLOSED';
      await loansRepo.save(locked);

      await this.writeAudit(manager, {
        pawnLoanId: locked.id,
        transactionType: 'FORFEIT',
        description: 'Loan forfeited; collateral ownership lost',
        payload: { remarks: input.remarks ?? null },
        createdBy: userId,
      });

      return locked;
    });

    return this.toLoanModel(saved);
  }

  async updateStatus(
    userId: string,
    input: UpdatePawnLoanStatusInput,
  ): Promise<PawnLoanModel> {
    const loan = await this.requireOwnedLoan(userId, input.pawn_loan_id);
    const next = this.requireStatus(input.status);
    const previous = loan.status;

    if (previous === next) {
      return this.toLoanModel(loan);
    }

    loan.status = next;
    if (input.remarks?.trim()) {
      loan.remarks = input.remarks.trim();
    }

    const saved = await this.loansRepo.manager.transaction(async (manager) => {
      const loansRepo = manager.getRepository(PawnLoan);
      const updated = await loansRepo.save(loan);
      await this.writeAudit(manager, {
        pawnLoanId: loan.id,
        transactionType: 'STATUS_CHANGE',
        description: `Status changed from ${previous} to ${next}`,
        payload: { from: previous, to: next },
        createdBy: userId,
      });
      return updated;
    });

    return this.toLoanModel(saved);
  }

  async delete(
    userId: string,
    input: DeletePawnLoanInput,
  ): Promise<boolean> {
    const loan = await this.requireOwnedLoan(userId, input.id);
    await this.loansRepo.softRemove(loan);
    return true;
  }

  // --- helpers ---

  private buildCollateralEntity(
    repo: Repository<PawnCollateral>,
    pawnLoanId: string,
    input: CreatePawnCollateralInput,
  ): PawnCollateral {
    return repo.create({
      pawnLoanId,
      itemType: this.requireItemType(input.item_type),
      description: this.normalizeName(input.description, 'Description'),
      ownerName: this.normalizeName(input.owner_name, 'Owner name'),
      estimatedValueCents: this.requirePositiveCents(
        input.estimated_value_cents,
        'Estimated value',
      ),
      weight:
        input.weight !== undefined ? Number(input.weight).toFixed(3) : null,
      quantity: this.requirePositiveInt(input.quantity ?? 1, 'Quantity'),
      serialNumber: input.serial_number?.trim() || null,
      imageUrls: input.image_urls ?? null,
      currentStatus: 'HELD',
    });
  }

  private async writeAudit(
    manager: EntityManager,
    data: {
      pawnLoanId: string;
      transactionType: PawnTransactionType;
      description: string;
      payload?: Record<string, unknown> | null;
      createdBy: string;
    },
  ): Promise<void> {
    const repo = manager.getRepository(PawnTransaction);
    await repo.save(
      repo.create({
        pawnLoanId: data.pawnLoanId,
        transactionType: data.transactionType,
        transactionDate: new Date(),
        description: data.description,
        payload: data.payload ?? null,
        createdBy: data.createdBy,
      }),
    );
  }

  private async requireOwnedLoan(
    userId: string,
    id: string,
  ): Promise<PawnLoan> {
    const loan = await this.loansRepo.findOne({ where: { id } });
    if (!loan) {
      throw new NotFoundException('Pawn loan not found.');
    }
    if (loan.userId !== userId) {
      throw new ForbiddenException('You do not own this pawn loan.');
    }
    return loan;
  }

  private async assertUniqueReceipt(
    userId: string,
    receiptNumber: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.loansRepo.findOne({
      where: excludeId
        ? { userId, receiptNumber, id: Not(excludeId) }
        : { userId, receiptNumber },
    });
    if (existing) {
      throw new BadRequestException(
        'A pawn loan with this receipt number already exists.',
      );
    }
  }

  private assertNotClosed(loan: PawnLoan, action: string): void {
    if (PAWN_CLOSED_STATUSES.includes(loan.status)) {
      throw new BadRequestException(
        `Cannot ${action} a ${loan.status.toLowerCase()} pawn loan.`,
      );
    }
  }

  private addMonths(dateStr: string, months: number): string {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  private addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  private assertDateAfter(later: string, earlier: string, message: string): void {
    if (later <= earlier) {
      throw new BadRequestException(message);
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

  private requireStatus(value: string): PawnLoanStatus {
    if (!PAWN_LOAN_STATUSES.includes(value as PawnLoanStatus)) {
      throw new BadRequestException('Invalid pawn loan status.');
    }
    return value as PawnLoanStatus;
  }

  private requireInterestType(value: string): PawnInterestType {
    if (!PAWN_INTEREST_TYPES.includes(value as PawnInterestType)) {
      throw new BadRequestException('Invalid interest type.');
    }
    return value as PawnInterestType;
  }

  private requirePaymentType(value: string): PawnPaymentType {
    if (!PAWN_PAYMENT_TYPES.includes(value as PawnPaymentType)) {
      throw new BadRequestException('Invalid payment type.');
    }
    return value as PawnPaymentType;
  }

  private requirePaymentMethod(value: string): PawnPaymentMethod {
    if (!PAWN_PAYMENT_METHODS.includes(value as PawnPaymentMethod)) {
      throw new BadRequestException('Invalid payment method.');
    }
    return value as PawnPaymentMethod;
  }

  private requireItemType(value: string): PawnCollateralItemType {
    if (!PAWN_COLLATERAL_ITEM_TYPES.includes(value as PawnCollateralItemType)) {
      throw new BadRequestException('Invalid collateral item type.');
    }
    return value as PawnCollateralItemType;
  }

  private requireCollateralStatus(value: string): PawnCollateralStatus {
    if (!PAWN_COLLATERAL_STATUSES.includes(value as PawnCollateralStatus)) {
      throw new BadRequestException('Invalid collateral status.');
    }
    return value as PawnCollateralStatus;
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

  private requireInterestRate(value: number): number {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
      throw new BadRequestException('Interest rate cannot be negative.');
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

  private normalizeName(value: string, label: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`${label} is required.`);
    }
    return trimmed;
  }

  private toDateField(value: string | Date): string {
    if (typeof value === 'string') return value.slice(0, 10);
    return new Date(value).toISOString().slice(0, 10);
  }

  private toLoanModel(row: PawnLoan): PawnLoanModel {
    return {
      id: row.id,
      userId: row.userId,
      pawnShopName: row.pawnShopName,
      receiptNumber: row.receiptNumber,
      principalAmountCents: row.principalAmountCents,
      outstandingPrincipalCents: row.outstandingPrincipalCents,
      interestRate: Number(row.interestRate),
      interestType: row.interestType,
      loanTermMonths: row.loanTermMonths,
      gracePeriodDays: row.gracePeriodDays,
      loanStartDate: this.toDateField(row.loanStartDate),
      maturityDate: this.toDateField(row.maturityDate),
      gracePeriodEndDate: this.toDateField(row.gracePeriodEndDate),
      status: row.status,
      currency: row.currency,
      remarks: row.remarks,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as PawnLoanModel;
  }

  private toCollateralModel(row: PawnCollateral): PawnCollateralModel {
    return {
      id: row.id,
      pawnLoanId: row.pawnLoanId,
      itemType: row.itemType,
      description: row.description,
      ownerName: row.ownerName,
      estimatedValueCents: row.estimatedValueCents,
      weight: row.weight !== null ? Number(row.weight) : null,
      quantity: row.quantity,
      serialNumber: row.serialNumber,
      imageUrls: row.imageUrls,
      currentStatus: row.currentStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as PawnCollateralModel;
  }

  private toPaymentModel(row: PawnPayment): PawnPaymentModel {
    return {
      id: row.id,
      pawnLoanId: row.pawnLoanId,
      paymentType: row.paymentType,
      paymentDate: row.paymentDate,
      principalPaidCents: row.principalPaidCents,
      interestPaidCents: row.interestPaidCents,
      totalPaidCents: row.totalPaidCents,
      paymentMethod: row.paymentMethod,
      referenceNumber: row.referenceNumber,
      remarks: row.remarks,
      createdAt: row.createdAt,
    } as PawnPaymentModel;
  }

  private toRenewalModel(row: PawnRenewal): PawnRenewalModel {
    return {
      id: row.id,
      pawnLoanId: row.pawnLoanId,
      renewalDate: row.renewalDate,
      previousMaturityDate: this.toDateField(row.previousMaturityDate),
      newMaturityDate: this.toDateField(row.newMaturityDate),
      interestPaidCents: row.interestPaidCents,
      principalReductionCents: row.principalReductionCents,
      remarks: row.remarks,
      createdAt: row.createdAt,
    } as PawnRenewalModel;
  }

  private toTxnModel(row: PawnTransaction): PawnTransactionModel {
    return {
      id: row.id,
      pawnLoanId: row.pawnLoanId,
      transactionType: row.transactionType,
      transactionDate: row.transactionDate,
      description: row.description,
      payload: row.payload ? JSON.stringify(row.payload) : null,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    } as PawnTransactionModel;
  }
}
