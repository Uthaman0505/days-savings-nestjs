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
import { GiveUpChallenge } from '../wallet/give-up-challenge.entity';
import {
  WalletTransaction,
  WalletTransactionType,
  WalletType,
} from '../wallet/wallet-transaction.entity';
import { YearlyChallengeReset } from '../wallet/yearly-challenge-reset.entity';

const DEFAULT_TOTAL_DAYS: number[] = Array.from(
  { length: 14 },
  (_, i) => (i + 1) * 15,
);
const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;

function computeTotalAmount(n: number): number {
  // total_amount = n(n+1)/2
  return (n * (n + 1)) / 2;
}

function computeAllowedHours(n: number): number {
  // allowed_hours = n * 24 * 2
  return n * 24 * 2;
}

function currentMalaysiaYear(now: Date): number {
  return new Date(now.getTime() + MALAYSIA_OFFSET_MS).getUTCFullYear();
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
    @InjectRepository(GiveUpChallenge)
    private readonly giveUpChallengesRepo: Repository<GiveUpChallenge>,
    @InjectRepository(WalletTransaction)
    private readonly walletTxRepo: Repository<WalletTransaction>,
    @InjectRepository(YearlyChallengeReset)
    private readonly yearlyChallengeResetRepo: Repository<YearlyChallengeReset>,
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
    const currentYear = currentMalaysiaYear(now);
    await this.applyNewYearRolloverIfNeeded(userId, now);

    const alreadyCompleted = await this.completedChallengesRepo.findOne({
      where: { userId, totalDays, challengeYear: currentYear },
    });

    if (alreadyCompleted) {
      throw new BadRequestException(
        'You already completed this challenge option. Please choose another duration.',
      );
    }

    const gaveUpSameDuration = await this.giveUpChallengesRepo.findOne({
      where: { userId, totalDays, challengeYear: currentYear },
    });

    if (gaveUpSameDuration) {
      throw new BadRequestException(
        'You previously gave up this challenge duration and cannot select it again. Please choose another duration.',
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

  async findCompletedTotalDaysForUser(userId: string): Promise<number[]> {
    const currentYear = currentMalaysiaYear(new Date());
    const rows = await this.completedChallengesRepo.find({
      where: { userId, challengeYear: currentYear },
      select: { totalDays: true },
      order: { totalDays: 'ASC' },
    });
    return rows.map((r) => r.totalDays);
  }

  async findGaveUpTotalDaysForUser(userId: string): Promise<number[]> {
    const currentYear = currentMalaysiaYear(new Date());
    const rows = await this.giveUpChallengesRepo.find({
      where: { userId, challengeYear: currentYear },
      select: { totalDays: true },
      order: { totalDays: 'ASC' },
    });
    return rows.map((r) => r.totalDays);
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
    await this.applyNewYearRolloverIfNeeded(userId, new Date());
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

  private async applyNewYearRolloverIfNeeded(
    userId: string,
    now: Date,
  ): Promise<void> {
    const currentYear = currentMalaysiaYear(now);
    const active = await this.userSavingPlansRepo.findOne({
      where: { userId, isActive: true },
      order: { endAt: 'DESC' },
    });
    if (!active) return;

    const activeYear = currentMalaysiaYear(active.startAt);
    if (activeYear === currentYear) return;

    await this.userSavingPlansRepo.manager.transaction(async (manager) => {
      const userSavingPlansRepo = manager.getRepository(UserSavingPlan);
      const globalWalletRepo = manager.getRepository(GlobalWallet);
      const challengeWalletRepo = manager.getRepository(ChallengeWallet);
      const walletTxRepo = manager.getRepository(WalletTransaction);
      const yearlyResetRepo = manager.getRepository(YearlyChallengeReset);

      const activeInTx = await userSavingPlansRepo.findOne({
        where: { id: active.id, isActive: true },
      });
      if (!activeInTx) return;

      let globalWallet = await globalWalletRepo.findOne({ where: { userId } });
      if (!globalWallet) {
        globalWallet = await globalWalletRepo.save(
          globalWalletRepo.create({ userId, balanceCents: 0 }),
        );
      }

      let challengeWallet = await challengeWalletRepo.findOne({
        where: { userSavingPlanId: activeInTx.id },
      });
      if (!challengeWallet) {
        challengeWallet = await challengeWalletRepo.save(
          challengeWalletRepo.create({
            userSavingPlanId: activeInTx.id,
            balanceCents: 0,
          }),
        );
      }

      const transferredCents = challengeWallet.balanceCents ?? 0;
      if (transferredCents > 0) {
        challengeWallet.balanceCents = 0;
        globalWallet.balanceCents =
          (globalWallet.balanceCents ?? 0) + transferredCents;
        await challengeWalletRepo.save(challengeWallet);
        await globalWalletRepo.save(globalWallet);

        await walletTxRepo.save(
          walletTxRepo.create({
            walletType: 'CHALLENGE' as WalletType,
            walletId: challengeWallet.id,
            userId,
            type: 'DEBIT' as WalletTransactionType,
            amountCents: transferredCents,
            balanceAfterCents: 0,
            referenceType: 'NEW_YEAR_RESET',
            referenceId: activeInTx.id,
          }),
        );

        await walletTxRepo.save(
          walletTxRepo.create({
            walletType: 'GLOBAL' as WalletType,
            walletId: globalWallet.id,
            userId,
            type: 'CREDIT' as WalletTransactionType,
            amountCents: transferredCents,
            balanceAfterCents: globalWallet.balanceCents,
            referenceType: 'NEW_YEAR_RESET',
            referenceId: activeInTx.id,
          }),
        );
      }

      activeInTx.isActive = false;
      await userSavingPlansRepo.save(activeInTx);
      await yearlyResetRepo.save(
        yearlyResetRepo.create({
          userId,
          userSavingPlanId: activeInTx.id,
          fromYear: activeYear,
          toYear: currentYear,
          transferredCents,
          reason: 'NEW_YEAR_RESET',
          notifiedAt: null,
        }),
      );
    });
  }
}
