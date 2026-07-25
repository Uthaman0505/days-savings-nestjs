import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { CalculateGrabProfitInput } from './dto/calculate-grab-profit.input';
import { GrabProfitEntry } from './grab-profit-entry.entity';
import { GrabProfitResultModel } from './models/grab-profit-result.model';

const DEFAULT_MAINTENANCE_PER_KM_RM = 0.12;

@Injectable()
export class GrabProfitService {
  constructor(
    @InjectRepository(GrabProfitEntry)
    private readonly grabProfitEntryRepo: Repository<GrabProfitEntry>,
  ) {}

  async calculateAndSaveDailyProfit(
    userId: string,
    input: CalculateGrabProfitInput,
  ): Promise<GrabProfitResultModel> {
    const maintenancePerKmRm =
      input.maintenance_per_km ?? DEFAULT_MAINTENANCE_PER_KM_RM;
    const maintenancePerKmCents = this.rmToCents(maintenancePerKmRm);
    const earningCents = this.rmToCents(input.earning);
    const fuelCostCents = this.rmToCents(input.fuel_cost);
    const maintenanceCostCents = Math.round(
      input.daily_km * maintenancePerKmCents,
    );
    const totalCostCents = fuelCostCents + maintenanceCostCents;
    const netProfitCents = earningCents - totalCostCents;

    const existing = await this.grabProfitEntryRepo.findOne({
      where: { userId, workDate: input.work_date },
    });

    const toSave = existing ?? this.grabProfitEntryRepo.create();
    toSave.userId = userId;
    toSave.workDate = input.work_date;
    toSave.dailyKm = input.daily_km;
    toSave.earningCents = earningCents;
    toSave.fuelCostCents = fuelCostCents;
    toSave.maintenancePerKmCents = maintenancePerKmCents;
    toSave.maintenanceCostCents = maintenanceCostCents;
    toSave.totalCostCents = totalCostCents;
    toSave.netProfitCents = netProfitCents;
    // Keep persisted column compatible; actual monthly profit is computed by month range.
    toSave.monthlyProfitCents = netProfitCents;

    const saved = await this.grabProfitEntryRepo.save(toSave);
    const { weekStartKey, weekEndKey, monthStartKey, monthEndKey } =
      this.buildPeriodRanges(input.work_date);
    const [weeklyProfitCents, monthlyProfitCents] = await Promise.all([
      this.getProfitSumCents(userId, weekStartKey, weekEndKey),
      this.getProfitSumCents(userId, monthStartKey, monthEndKey),
    ]);

    return this.toResultModel(saved, weeklyProfitCents, monthlyProfitCents);
  }

  private rmToCents(value: number): number {
    return Math.round(value * 100);
  }

  private centsToRm(value: number): number {
    return Number((value / 100).toFixed(2));
  }

  private parseDateKeyToUtc(dateKey: string): Date {
    return new Date(`${dateKey}T00:00:00.000Z`);
  }

  private toDateKey(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private buildPeriodRanges(dateKey: string): {
    weekStartKey: string;
    weekEndKey: string;
    monthStartKey: string;
    monthEndKey: string;
  } {
    const date = this.parseDateKeyToUtc(dateKey);
    const day = date.getUTCDay();
    const distanceFromMonday = (day + 6) % 7;

    const weekStart = new Date(date);
    weekStart.setUTCDate(date.getUTCDate() - distanceFromMonday);

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

    const monthStart = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    );

    return {
      weekStartKey: this.toDateKey(weekStart),
      weekEndKey: this.toDateKey(weekEnd),
      monthStartKey: this.toDateKey(monthStart),
      monthEndKey: this.toDateKey(monthEnd),
    };
  }

  private async getProfitSumCents(
    userId: string,
    fromDate: string,
    toDate: string,
  ): Promise<number> {
    const rows = await this.grabProfitEntryRepo.find({
      where: {
        userId,
        workDate: Between(fromDate, toDate),
      },
      select: {
        netProfitCents: true,
      },
    });

    return rows.reduce((sum, row) => sum + (row.netProfitCents ?? 0), 0);
  }

  private toResultModel(
    row: GrabProfitEntry,
    weeklyProfitCents: number,
    monthlyProfitCents: number,
  ): GrabProfitResultModel {
    return {
      id: row.id,
      workDate: row.workDate,
      dailyKm: row.dailyKm,
      earning: this.centsToRm(row.earningCents),
      fuelCost: this.centsToRm(row.fuelCostCents),
      maintenancePerKm: this.centsToRm(row.maintenancePerKmCents),
      maintenanceCost: this.centsToRm(row.maintenanceCostCents),
      totalCost: this.centsToRm(row.totalCostCents),
      netProfit: this.centsToRm(row.netProfitCents),
      dailyProfit: this.centsToRm(row.netProfitCents),
      weeklyProfit: this.centsToRm(weeklyProfitCents),
      monthlyProfit: this.centsToRm(monthlyProfitCents),
    } as GrabProfitResultModel;
  }
}
