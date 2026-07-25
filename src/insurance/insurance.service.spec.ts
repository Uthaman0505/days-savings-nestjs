import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Insurance } from './insurance.entity';
import { InsuranceService } from './insurance.service';

describe('InsuranceService', () => {
  let service: InsuranceService;
  let repo: jest.Mocked<
    Pick<
      Repository<Insurance>,
      'find' | 'findOne' | 'create' | 'save' | 'remove'
    >
  >;

  const basePolicy = (overrides: Partial<Insurance> = {}): Insurance =>
    ({
      id: 'ins-1',
      userId: 'user-1',
      policyName: 'AIA Medical',
      insuranceCompany: 'AIA',
      policyNumber: 'POL-001',
      insuranceType: 'MEDICAL',
      coverageAmountCents: 50000000,
      annualPremiumCents: 240000,
      monthlyPremiumCents: 20000,
      paymentFrequency: 'MONTHLY',
      policyStartDate: '2024-01-01',
      policyEndDate: '2025-01-01',
      renewalDate: '2024-12-01',
      lastPaymentDate: null,
      currency: 'MYR',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as Insurance;

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x as Insurance),
      save: jest.fn(async (x) => {
        const entity = x as Insurance;
        return {
          ...entity,
          id: entity.id ?? 'ins-1',
          createdAt: entity.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: entity.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
        } as Insurance;
      }),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsuranceService,
        { provide: getRepositoryToken(Insurance), useValue: repo },
      ],
    }).compile();

    service = module.get(InsuranceService);
  });

  it('creates an insurance policy', async () => {
    repo.findOne.mockResolvedValue(null);

    const result = await service.create('user-1', {
      policy_name: '  AIA Medical  ',
      insurance_company: 'AIA',
      policy_number: 'POL-001',
      insurance_type: 'MEDICAL',
      coverage_amount_cents: 50000000,
      annual_premium_cents: 240000,
      monthly_premium_cents: 20000,
      payment_frequency: 'MONTHLY',
      policy_start_date: '2024-01-01',
      policy_end_date: '2025-01-01',
      renewal_date: '2024-12-01',
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        policyName: 'AIA Medical',
        insuranceType: 'MEDICAL',
        coverageAmountCents: 50000000,
        annualPremiumCents: 240000,
        isActive: true,
      }),
    );
    expect(result.policyName).toBe('AIA Medical');
  });

  it('rejects duplicate policy numbers for the same user', async () => {
    repo.findOne.mockResolvedValue(basePolicy());

    await expect(
      service.create('user-1', {
        policy_name: 'Other Policy',
        insurance_company: 'Great Eastern',
        policy_number: 'POL-001',
        insurance_type: 'LIFE',
        coverage_amount_cents: 10000000,
        annual_premium_cents: 120000,
        payment_frequency: 'YEARLY',
        policy_start_date: '2024-01-01',
        policy_end_date: '2025-01-01',
        renewal_date: '2024-12-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects end date before start date', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(
      service.create('user-1', {
        policy_name: 'Car Insurance',
        insurance_company: 'Allianz',
        policy_number: 'POL-002',
        insurance_type: 'CAR',
        coverage_amount_cents: 10000000,
        annual_premium_cents: 150000,
        payment_frequency: 'YEARLY',
        policy_start_date: '2025-01-01',
        policy_end_date: '2024-01-01',
        renewal_date: '2025-06-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects renewal date before start date', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(
      service.create('user-1', {
        policy_name: 'Car Insurance',
        insurance_company: 'Allianz',
        policy_number: 'POL-003',
        insurance_type: 'CAR',
        coverage_amount_cents: 10000000,
        annual_premium_cents: 150000,
        payment_frequency: 'YEARLY',
        policy_start_date: '2025-01-01',
        policy_end_date: '2026-01-01',
        renewal_date: '2024-06-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects zero coverage amount', async () => {
    await expect(
      service.create('user-1', {
        policy_name: 'Travel Insurance',
        insurance_company: 'AXA',
        policy_number: 'POL-004',
        insurance_type: 'TRAVEL',
        coverage_amount_cents: 0,
        annual_premium_cents: 50000,
        payment_frequency: 'YEARLY',
        policy_start_date: '2025-01-01',
        policy_end_date: '2026-01-01',
        renewal_date: '2025-12-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids access to another user policy', async () => {
    repo.findOne.mockResolvedValue(basePolicy({ userId: 'other-user' }));

    await expect(
      service.findByIdForUser('user-1', 'ins-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found when policy is missing', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists policies by type', async () => {
    repo.find.mockResolvedValue([basePolicy()]);

    const rows = await service.findByType('user-1', 'MEDICAL');

    expect(repo.find).toHaveBeenCalledWith({
      where: { userId: 'user-1', insuranceType: 'MEDICAL' },
      order: { policyName: 'ASC', createdAt: 'ASC' },
    });
    expect(rows).toHaveLength(1);
  });

  it('archives a policy by setting is_active false', async () => {
    repo.findOne.mockResolvedValue(basePolicy({ isActive: true }));

    const result = await service.archive('user-1', 'ins-1');

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
    expect(result.isActive).toBe(false);
  });

  it('deletes an owned policy', async () => {
    const row = basePolicy();
    repo.findOne.mockResolvedValue(row);
    repo.remove.mockResolvedValue(row);

    await expect(service.delete('user-1', 'ins-1')).resolves.toBe(true);
    expect(repo.remove).toHaveBeenCalledWith(row);
  });
});
