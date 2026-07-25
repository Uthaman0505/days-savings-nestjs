import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';
import {
  CreateInsuranceInput,
  INSURANCE_TYPES,
  PAYMENT_FREQUENCIES,
} from './dto/create-insurance.input';
import { UpdateInsuranceInput } from './dto/update-insurance.input';
import { Insurance, InsuranceType, PaymentFrequency } from './insurance.entity';
import { InsuranceModel } from './models/insurance.model';

@Injectable()
export class InsuranceService {
  constructor(
    @InjectRepository(Insurance)
    private readonly insurancesRepo: Repository<Insurance>,
  ) {}

  async findMyPolicies(userId: string): Promise<InsuranceModel[]> {
    const rows = await this.insurancesRepo.find({
      where: { userId },
      order: { policyName: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findActivePolicies(userId: string): Promise<InsuranceModel[]> {
    const rows = await this.insurancesRepo.find({
      where: { userId, isActive: true },
      order: { policyName: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findByType(userId: string, type: string): Promise<InsuranceModel[]> {
    const insuranceType = this.requireInsuranceType(type);
    const rows = await this.insurancesRepo.find({
      where: { userId, insuranceType },
      order: { policyName: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((row) => this.toModel(row));
  }

  async findByIdForUser(
    userId: string,
    insuranceId: string,
  ): Promise<InsuranceModel> {
    const row = await this.requireOwnedPolicy(userId, insuranceId);
    return this.toModel(row);
  }

  async create(
    userId: string,
    input: CreateInsuranceInput,
  ): Promise<InsuranceModel> {
    const policyName = this.normalizeName(input.policy_name, 'Policy name');
    const insuranceCompany = this.normalizeName(
      input.insurance_company,
      'Insurance company',
    );
    const policyNumber = this.normalizeName(
      input.policy_number,
      'Policy number',
    );
    const insuranceType = this.requireInsuranceType(input.insurance_type);
    const paymentFrequency = this.requirePaymentFrequency(
      input.payment_frequency,
    );
    const coverageAmountCents = this.requirePositiveCents(
      input.coverage_amount_cents,
      'Coverage amount',
    );
    const annualPremiumCents = this.requirePositiveCents(
      input.annual_premium_cents,
      'Annual premium',
    );
    const monthlyPremiumCents =
      input.monthly_premium_cents !== undefined
        ? this.requirePositiveCents(
            input.monthly_premium_cents,
            'Monthly premium',
          )
        : null;

    const policyStartDate = this.requireDateString(
      input.policy_start_date,
      'Policy start date',
    );
    const policyEndDate = this.requireDateString(
      input.policy_end_date,
      'Policy end date',
    );
    const renewalDate = this.requireDateString(
      input.renewal_date,
      'Renewal date',
    );

    this.assertDateOnOrAfter(
      policyEndDate,
      policyStartDate,
      'Policy end date must not be before policy start date.',
    );
    this.assertDateOnOrAfter(
      renewalDate,
      policyStartDate,
      'Renewal date must not be before policy start date.',
    );
    await this.assertUniquePolicyNumber(userId, policyNumber);

    const entity = this.insurancesRepo.create({
      userId,
      policyName,
      insuranceCompany,
      policyNumber,
      insuranceType,
      coverageAmountCents,
      annualPremiumCents,
      monthlyPremiumCents,
      paymentFrequency,
      policyStartDate,
      policyEndDate,
      renewalDate,
      lastPaymentDate: null,
      currency: (input.currency ?? 'MYR').toUpperCase(),
      isActive: true,
    });

    const saved = await this.insurancesRepo.save(entity);
    return this.toModel(saved);
  }

  async update(
    userId: string,
    insuranceId: string,
    input: UpdateInsuranceInput,
  ): Promise<InsuranceModel> {
    const policy = await this.requireOwnedPolicy(userId, insuranceId);

    const nextStart =
      input.policy_start_date !== undefined
        ? this.requireDateString(input.policy_start_date, 'Policy start date')
        : policy.policyStartDate;
    const nextEnd =
      input.policy_end_date !== undefined
        ? this.requireDateString(input.policy_end_date, 'Policy end date')
        : policy.policyEndDate;
    const nextRenewal =
      input.renewal_date !== undefined
        ? this.requireDateString(input.renewal_date, 'Renewal date')
        : policy.renewalDate;

    this.assertDateOnOrAfter(
      nextEnd,
      nextStart,
      'Policy end date must not be before policy start date.',
    );
    this.assertDateOnOrAfter(
      nextRenewal,
      nextStart,
      'Renewal date must not be before policy start date.',
    );

    if (input.policy_name !== undefined) {
      policy.policyName = this.normalizeName(input.policy_name, 'Policy name');
    }
    if (input.insurance_company !== undefined) {
      policy.insuranceCompany = this.normalizeName(
        input.insurance_company,
        'Insurance company',
      );
    }
    if (input.policy_number !== undefined) {
      const policyNumber = this.normalizeName(
        input.policy_number,
        'Policy number',
      );
      await this.assertUniquePolicyNumber(userId, policyNumber, insuranceId);
      policy.policyNumber = policyNumber;
    }
    if (input.insurance_type !== undefined) {
      policy.insuranceType = this.requireInsuranceType(input.insurance_type);
    }
    if (input.coverage_amount_cents !== undefined) {
      policy.coverageAmountCents = this.requirePositiveCents(
        input.coverage_amount_cents,
        'Coverage amount',
      );
    }
    if (input.annual_premium_cents !== undefined) {
      policy.annualPremiumCents = this.requirePositiveCents(
        input.annual_premium_cents,
        'Annual premium',
      );
    }
    if (input.monthly_premium_cents !== undefined) {
      policy.monthlyPremiumCents =
        input.monthly_premium_cents === null
          ? null
          : this.requirePositiveCents(
              input.monthly_premium_cents,
              'Monthly premium',
            );
    }
    if (input.payment_frequency !== undefined) {
      policy.paymentFrequency = this.requirePaymentFrequency(
        input.payment_frequency,
      );
    }
    if (input.policy_start_date !== undefined) {
      policy.policyStartDate = nextStart;
    }
    if (input.policy_end_date !== undefined) {
      policy.policyEndDate = nextEnd;
    }
    if (input.renewal_date !== undefined) {
      policy.renewalDate = nextRenewal;
    }
    if (input.currency !== undefined) {
      policy.currency = input.currency.toUpperCase();
    }

    const saved = await this.insurancesRepo.save(policy);
    return this.toModel(saved);
  }

  async archive(userId: string, insuranceId: string): Promise<InsuranceModel> {
    const policy = await this.requireOwnedPolicy(userId, insuranceId);
    policy.isActive = false;
    const saved = await this.insurancesRepo.save(policy);
    return this.toModel(saved);
  }

  async delete(userId: string, insuranceId: string): Promise<boolean> {
    const policy = await this.requireOwnedPolicy(userId, insuranceId);
    await this.insurancesRepo.remove(policy);
    return true;
  }

  /**
   * Record a premium payment against the policy.
   * Updates last_payment_date and advances renewal_date when coverage extends it.
   * Pass `manager` to participate in a caller-owned database transaction.
   */
  async applyPremiumPayment(
    userId: string,
    insuranceId: string,
    input: {
      paymentDate: string;
      coveragePeriodEnd: string;
    },
    manager?: EntityManager,
  ): Promise<{
    policy: InsuranceModel;
    previousRenewalDate: string;
    previousLastPaymentDate: string | null;
  }> {
    const paymentDate = this.requireDateString(
      input.paymentDate,
      'Payment date',
    );
    const coveragePeriodEnd = this.requireDateString(
      input.coveragePeriodEnd,
      'Coverage period end',
    );

    const run = async (
      mgr: EntityManager,
    ): Promise<{
      policy: Insurance;
      previousRenewalDate: string;
      previousLastPaymentDate: string | null;
    }> => {
      const policyRepo = mgr.getRepository(Insurance);
      const policy = await policyRepo.findOne({ where: { id: insuranceId } });
      if (!policy) {
        throw new NotFoundException('Insurance policy not found.');
      }
      if (policy.userId !== userId) {
        throw new ForbiddenException('You do not own this insurance policy.');
      }

      const previousRenewalDate = this.toDateField(policy.renewalDate);
      const previousLastPaymentDate = policy.lastPaymentDate
        ? this.toDateField(policy.lastPaymentDate)
        : null;

      policy.lastPaymentDate = paymentDate;
      if (coveragePeriodEnd >= previousRenewalDate) {
        policy.renewalDate = coveragePeriodEnd;
      }

      const saved = await policyRepo.save(policy);
      return {
        policy: saved,
        previousRenewalDate,
        previousLastPaymentDate,
      };
    };

    const result = manager
      ? await run(manager)
      : await this.insurancesRepo.manager.transaction(run);

    return {
      policy: this.toModel(result.policy),
      previousRenewalDate: result.previousRenewalDate,
      previousLastPaymentDate: result.previousLastPaymentDate,
    };
  }

  /**
   * Restore renewal / last-payment metadata after a premium payment is reversed.
   * Pass `manager` to participate in a caller-owned database transaction.
   */
  async reversePremiumPayment(
    userId: string,
    insuranceId: string,
    input: {
      previousRenewalDate: string;
      previousLastPaymentDate: string | null;
    },
    manager?: EntityManager,
  ): Promise<InsuranceModel> {
    const previousRenewalDate = this.requireDateString(
      input.previousRenewalDate,
      'Previous renewal date',
    );

    const run = async (mgr: EntityManager): Promise<Insurance> => {
      const policyRepo = mgr.getRepository(Insurance);
      const policy = await policyRepo.findOne({ where: { id: insuranceId } });
      if (!policy) {
        throw new NotFoundException('Insurance policy not found.');
      }
      if (policy.userId !== userId) {
        throw new ForbiddenException('You do not own this insurance policy.');
      }

      policy.renewalDate = previousRenewalDate;
      policy.lastPaymentDate = input.previousLastPaymentDate
        ? this.requireDateString(
            input.previousLastPaymentDate,
            'Previous last payment date',
          )
        : null;

      return policyRepo.save(policy);
    };

    const saved = manager
      ? await run(manager)
      : await this.insurancesRepo.manager.transaction(run);

    return this.toModel(saved);
  }

  private async requireOwnedPolicy(
    userId: string,
    insuranceId: string,
  ): Promise<Insurance> {
    const policy = await this.insurancesRepo.findOne({
      where: { id: insuranceId },
    });
    if (!policy) {
      throw new NotFoundException('Insurance policy not found.');
    }
    if (policy.userId !== userId) {
      throw new ForbiddenException('You do not own this insurance policy.');
    }
    return policy;
  }

  private async assertUniquePolicyNumber(
    userId: string,
    policyNumber: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.insurancesRepo.findOne({
      where: excludeId
        ? { userId, policyNumber, id: Not(excludeId) }
        : { userId, policyNumber },
    });
    if (existing) {
      throw new BadRequestException(
        'An insurance policy with this policy number already exists.',
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

  private requirePositiveCents(value: number, label: string): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`${label} must be greater than zero.`);
    }
    return value;
  }

  private requireInsuranceType(type: string): InsuranceType {
    if (!INSURANCE_TYPES.includes(type as (typeof INSURANCE_TYPES)[number])) {
      throw new BadRequestException('Invalid insurance type.');
    }
    return type as InsuranceType;
  }

  private requirePaymentFrequency(frequency: string): PaymentFrequency {
    if (
      !PAYMENT_FREQUENCIES.includes(
        frequency as (typeof PAYMENT_FREQUENCIES)[number],
      )
    ) {
      throw new BadRequestException('Invalid payment frequency.');
    }
    return frequency as PaymentFrequency;
  }

  private requireDateString(value: string, label: string): string {
    const trimmed = value?.trim();
    if (!trimmed || Number.isNaN(Date.parse(trimmed))) {
      throw new BadRequestException(`${label} is required.`);
    }
    return trimmed.slice(0, 10);
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

  private toModel(row: Insurance): InsuranceModel {
    return {
      id: row.id,
      userId: row.userId,
      policyName: row.policyName,
      insuranceCompany: row.insuranceCompany,
      policyNumber: row.policyNumber,
      insuranceType: row.insuranceType,
      coverageAmountCents: row.coverageAmountCents,
      annualPremiumCents: row.annualPremiumCents,
      monthlyPremiumCents: row.monthlyPremiumCents,
      paymentFrequency: row.paymentFrequency,
      policyStartDate: this.toDateField(row.policyStartDate),
      policyEndDate: this.toDateField(row.policyEndDate),
      renewalDate: this.toDateField(row.renewalDate),
      lastPaymentDate: row.lastPaymentDate
        ? this.toDateField(row.lastPaymentDate)
        : null,
      currency: row.currency,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    } as InsuranceModel;
  }
}
