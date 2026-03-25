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
import { GlobalWallet } from '../wallet/global-wallet.entity';
import { ChallengeWallet } from '../wallet/challenge-wallet.entity';
import { CompletedChallenge } from '../wallet/completed-challenge.entity';

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
    @InjectRepository(GlobalWallet)
    private readonly globalWalletRepo: Repository<GlobalWallet>,
    @InjectRepository(ChallengeWallet)
    private readonly challengeWalletRepo: Repository<ChallengeWallet>,
    @InjectRepository(CompletedChallenge)
    private readonly completedChallengesRepo: Repository<CompletedChallenge>,
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

    const alreadyCompleted = await this.completedChallengesRepo.findOne({
      where: { userId, totalDays },
    });

    if (alreadyCompleted) {
      throw new BadRequestException(
        'You already completed this challenge option. Please choose another duration.',
      );
    }

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
      // Even if endAt is already passed, the user must press Stop to transfer.
      throw new BadRequestException(
        'Please stop your current challenge to transfer to Global wallet before choosing another duration.',
      );
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

    // Wallet initialization (stored in cents).
    let globalWallet = await this.globalWalletRepo.findOne({
      where: { userId },
    });
    if (!globalWallet) {
      globalWallet = await this.globalWalletRepo.save(
        this.globalWalletRepo.create({ userId, balanceCents: 0 }),
      );
    }

    await this.challengeWalletRepo.save(
      this.challengeWalletRepo.create({
        userSavingPlanId: saved.id,
        balanceCents: 0,
      }),
    );

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
    const existingActive = await this.userSavingPlansRepo.findOne({
      where: { userId, isActive: true },
      order: { endAt: 'DESC' },
    });

    if (!existingActive) return null;

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
