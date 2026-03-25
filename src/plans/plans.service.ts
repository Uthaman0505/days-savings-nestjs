import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SavingPlan } from './saving-plan.entity';
import { UserSavingPlan } from './user-saving-plan.entity';

const DEFAULT_TOTAL_DAYS: number[] = Array.from(
  { length: 14 },
  (_, i) => (i + 1) * 15,
);

function computeTotalAmount(n: number): number {
  // total_amount = n(n+1)/2
  return (n * (n + 1)) / 2;
}

function computeAllowedHours(n: number): number {
  // allowed_hours = n * 24 * 2
  return n * 24 * 2;
}

@Injectable()
export class PlansService implements OnModuleInit {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    @InjectRepository(SavingPlan)
    private readonly savingPlansRepo: Repository<SavingPlan>,
    @InjectRepository(UserSavingPlan)
    private readonly userSavingPlansRepo: Repository<UserSavingPlan>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultPlans();
  }

  private async seedDefaultPlans(): Promise<void> {
    // Idempotent seeding: insert/update defaults for known total_days values.
    // This backend does not use migrations, so synchronize must have created the table.
    try {
      const existingPlans = await this.savingPlansRepo.find({
        where: { totalDays: In(DEFAULT_TOTAL_DAYS) },
      });

      const existingByTotalDays = new Map<number, SavingPlan>(
        existingPlans.map((p) => [p.totalDays, p]),
      );

      const toSave: SavingPlan[] = [];

      for (const n of DEFAULT_TOTAL_DAYS) {
        const totalAmount = computeTotalAmount(n);
        const allowedHours = computeAllowedHours(n);
        const name = `${n} days`;

        const existing = existingByTotalDays.get(n);

        if (!existing) {
          toSave.push(
            this.savingPlansRepo.create({
              name,
              totalDays: n,
              totalAmount,
              allowedHours,
              isActive: true,
            }),
          );
          continue;
        }

        // Ensure computed values stay consistent with the required formulas.
        const shouldUpdate =
          existing.name !== name ||
          existing.totalAmount !== totalAmount ||
          existing.allowedHours !== allowedHours ||
          existing.isActive !== true;

        if (shouldUpdate) {
          existing.name = name;
          existing.totalAmount = totalAmount;
          existing.allowedHours = allowedHours;
          existing.isActive = true;
          toSave.push(existing);
        }
      }

      if (toSave.length > 0) {
        await this.savingPlansRepo.save(toSave);
        this.logger.log(`Seeded/updated ${toSave.length} saving plan(s).`);
      }
    } catch (e) {
      // Fail-soft so app can still boot even if the table isn't available yet.
      this.logger.warn(
        `Skipping default saving plan seeding: ${(e as Error).message}`,
      );
    }
  }

  async findActivePlans(): Promise<SavingPlan[]> {
    return this.savingPlansRepo.find({
      where: { isActive: true },
      order: { totalDays: 'ASC' },
    });
  }

  async subscribeToDays(
    userId: string,
    totalDays: number,
  ): Promise<{
    id: string;
    totalDays: number;
    totalAmount: number;
    allowedHours: number;
    startAt: Date;
    endAt: Date;
    isActive: boolean;
  }> {
    const now = new Date();

    const plan = await this.savingPlansRepo.findOne({
      where: { totalDays, isActive: true },
    });

    if (!plan) {
      throw new BadRequestException('Invalid or inactive plan selected');
    }

    // Enforce: user can only have one active selection at a time.
    const existingActive = await this.userSavingPlansRepo.findOne({
      where: { userId, isActive: true },
      order: { endAt: 'DESC' },
    });

    if (existingActive) {
      if (existingActive.endAt.getTime() > now.getTime()) {
        throw new BadRequestException(
          'You already have an active challenge. Please wait until it finishes.',
        );
      }

      // Expired: deactivate it and allow the new selection.
      existingActive.isActive = false;
      await this.userSavingPlansRepo.save(existingActive);
    }

    const startAt = now;
    const endAt = new Date(
      startAt.getTime() + plan.allowedHours * 60 * 60 * 1000,
    );

    const record = this.userSavingPlansRepo.create({
      userId,
      totalDays: plan.totalDays,
      totalAmount: plan.totalAmount,
      allowedHours: plan.allowedHours,
      startAt,
      endAt,
      isActive: true,
    });

    const saved = await this.userSavingPlansRepo.save(record);

    return {
      id: saved.id,
      totalDays: saved.totalDays,
      totalAmount: saved.totalAmount,
      allowedHours: saved.allowedHours,
      startAt: saved.startAt,
      endAt: saved.endAt,
      isActive: saved.isActive,
    };
  }

  async findActiveUserChallenge(userId: string): Promise<{
    id: string;
    totalDays: number;
    totalAmount: number;
    allowedHours: number;
    startAt: Date;
    endAt: Date;
    isActive: boolean;
  } | null> {
    const now = new Date();

    const existingActive = await this.userSavingPlansRepo.findOne({
      where: { userId, isActive: true },
      order: { endAt: 'DESC' },
    });

    if (!existingActive) return null;

    // If somehow marked active but expired, clean it up.
    if (existingActive.endAt.getTime() <= now.getTime()) {
      existingActive.isActive = false;
      await this.userSavingPlansRepo.save(existingActive);
      return null;
    }

    return {
      id: existingActive.id,
      totalDays: existingActive.totalDays,
      totalAmount: existingActive.totalAmount,
      allowedHours: existingActive.allowedHours,
      startAt: existingActive.startAt,
      endAt: existingActive.endAt,
      isActive: existingActive.isActive,
    };
  }
}
