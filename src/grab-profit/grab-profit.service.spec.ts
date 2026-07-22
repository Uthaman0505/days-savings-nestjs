import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GrabProfitEntry } from './grab-profit-entry.entity';
import { GrabProfitService } from './grab-profit.service';

describe('GrabProfitService', () => {
  let service: GrabProfitService;
  let repo: jest.Mocked<
    Pick<Repository<GrabProfitEntry>, 'findOne' | 'find' | 'create' | 'save'>
  >;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(() => ({}) as GrabProfitEntry),
      save: jest.fn((x) => {
        const entity = x as GrabProfitEntry;
        return Promise.resolve({
          id: entity.id ?? 'entry-1',
          ...entity,
        } as GrabProfitEntry);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GrabProfitService,
        { provide: getRepositoryToken(GrabProfitEntry), useValue: repo },
      ],
    }).compile();

    service = module.get(GrabProfitService);
  });

  it('uses default maintenance_per_km when not provided', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.find.mockResolvedValue([{ netProfitCents: 9800 } as GrabProfitEntry]);

    const result = await service.calculateAndSaveDailyProfit('user-1', {
      work_date: '2026-04-22',
      daily_km: 100,
      earning: 150,
      fuel_cost: 40,
    });

    expect(result.maintenancePerKm).toBe(0.12);
    expect(result.maintenanceCost).toBe(12);
    expect(result.totalCost).toBe(52);
    expect(result.netProfit).toBe(98);
    expect(result.dailyProfit).toBe(98);
    expect(result.weeklyProfit).toBe(98);
    expect(result.monthlyProfit).toBe(98);
  });

  it('uses provided maintenance_per_km override', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.find.mockResolvedValue([{ netProfitCents: 9000 } as GrabProfitEntry]);

    const result = await service.calculateAndSaveDailyProfit('user-1', {
      work_date: '2026-04-23',
      daily_km: 100,
      earning: 150,
      fuel_cost: 40,
      maintenance_per_km: 0.2,
    });

    expect(result.maintenancePerKm).toBe(0.2);
    expect(result.maintenanceCost).toBe(20);
    expect(result.totalCost).toBe(60);
    expect(result.netProfit).toBe(90);
    expect(result.dailyProfit).toBe(90);
    expect(result.weeklyProfit).toBe(90);
    expect(result.monthlyProfit).toBe(90);
  });

  it('calculates the provided 200/208/60 example', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.find.mockResolvedValue([{ netProfitCents: 12400 } as GrabProfitEntry]);

    const result = await service.calculateAndSaveDailyProfit('user-1', {
      work_date: '2026-04-24',
      daily_km: 200,
      earning: 208,
      fuel_cost: 60,
    });

    expect(result.maintenanceCost).toBe(24);
    expect(result.totalCost).toBe(84);
    expect(result.netProfit).toBe(124);
    expect(result.dailyProfit).toBe(124);
    expect(result.weeklyProfit).toBe(124);
    expect(result.monthlyProfit).toBe(124);
  });

  it('supports net-loss days', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.find.mockResolvedValue([{ netProfitCents: -2600 } as GrabProfitEntry]);

    const result = await service.calculateAndSaveDailyProfit('user-1', {
      work_date: '2026-04-25',
      daily_km: 300,
      earning: 80,
      fuel_cost: 70,
    });

    expect(result.maintenanceCost).toBe(36);
    expect(result.totalCost).toBe(106);
    expect(result.netProfit).toBe(-26);
    expect(result.dailyProfit).toBe(-26);
    expect(result.weeklyProfit).toBe(-26);
    expect(result.monthlyProfit).toBe(-26);
  });

  it('returns weekly and monthly profit from matching date ranges', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.find
      .mockResolvedValueOnce([
        { netProfitCents: 12400 } as GrabProfitEntry,
        { netProfitCents: 2000 } as GrabProfitEntry,
      ])
      .mockResolvedValueOnce([
        { netProfitCents: 12400 } as GrabProfitEntry,
        { netProfitCents: 2000 } as GrabProfitEntry,
        { netProfitCents: 3000 } as GrabProfitEntry,
      ]);

    const result = await service.calculateAndSaveDailyProfit('user-1', {
      work_date: '2026-04-24',
      daily_km: 200,
      earning: 208,
      fuel_cost: 60,
    });

    expect(result.dailyProfit).toBe(124);
    expect(result.weeklyProfit).toBe(144);
    expect(result.monthlyProfit).toBe(174);
  });
});
