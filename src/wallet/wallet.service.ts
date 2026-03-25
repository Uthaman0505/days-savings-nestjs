import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActiveSavingPlanModel } from '../plans/models/active-saving-plan.model';
import { UserSavingPlan } from '../plans/user-saving-plan.entity';
import { GlobalWallet } from './global-wallet.entity';
import { ChallengeWallet } from './challenge-wallet.entity';
import { WalletTransaction } from './wallet-transaction.entity';
import { In } from 'typeorm';
import { WalletTransactionType, WalletType } from './wallet-transaction.entity';
import { DailyChallengeClaim } from './daily-challenge-claim.entity';
import { TodayClaimModel } from './models/today-claim.model';
import { MyChallengeRoomModel } from './models/my-challenge-room.model';
import { CompletedChallenge } from './completed-challenge.entity';
import { DailyChallengeClaim as DailyClaimRow } from './daily-challenge-claim.entity';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8, Malaysia has no DST

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function malaysiaNow(now: Date): Date {
  return new Date(now.getTime() + MALAYSIA_OFFSET_MS);
}

function toMalaysiaDateKey(now: Date): string {
  const d = malaysiaNow(now);
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  return `${y}-${m}-${day}`;
}

function nextMalaysiaMidnight(now: Date): Date {
  const d = malaysiaNow(now);
  // Move to next day at 00:00 Malaysia time.
  const next = new Date(d.getTime() + MS_PER_DAY);
  next.setUTCHours(0, 0, 0, 0);
  // Convert back to real UTC timestamp.
  return new Date(next.getTime() - MALAYSIA_OFFSET_MS);
}

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(GlobalWallet)
    private readonly globalWalletRepo: Repository<GlobalWallet>,
    @InjectRepository(ChallengeWallet)
    private readonly challengeWalletRepo: Repository<ChallengeWallet>,
    @InjectRepository(WalletTransaction)
    private readonly walletTxRepo: Repository<WalletTransaction>,
    @InjectRepository(DailyChallengeClaim)
    private readonly dailyClaimRepo: Repository<DailyChallengeClaim>,
    @InjectRepository(CompletedChallenge)
    private readonly completedChallengesRepo: Repository<CompletedChallenge>,
    @InjectRepository(UserSavingPlan)
    private readonly userSavingPlansRepo: Repository<UserSavingPlan>,
  ) {}

  async resetUserChallenges(userId: string): Promise<{
    ok: boolean;
    message: string;
    clearedDays: number | null;
  }> {
    const active = await this.userSavingPlansRepo.findOne({
      where: { userId, isActive: true },
      order: { endAt: 'DESC' },
    });

    const clearedDays = active?.totalDays ?? null;

    // Collect plan ids before deletion.
    const planIds = await this.userSavingPlansRepo.find({
      where: { userId },
      select: { id: true },
    });

    const planIdValues = planIds.map((p) => p.id);

    await this.dailyClaimRepo.manager.transaction(async (manager) => {
      const globalRepo = manager.getRepository(GlobalWallet);
      const challengeWalletRepo = manager.getRepository(ChallengeWallet);
      const walletTxRepo = manager.getRepository(WalletTransaction);
      const dailyClaimRepo = manager.getRepository(DailyChallengeClaim);
      const completedRepo = manager.getRepository(CompletedChallenge);
      const userSavingPlansRepo = manager.getRepository(UserSavingPlan);

      // Wallet transactions are keyed by user_id.
      await walletTxRepo.delete({ userId });

      if (planIdValues.length > 0) {
        await dailyClaimRepo.delete({
          userSavingPlanId: In(planIdValues),
        });

        await challengeWalletRepo.delete({
          userSavingPlanId: In(planIdValues),
        });
      }

      await completedRepo.delete({ userId });
      await globalRepo.delete({ userId });
      await userSavingPlansRepo.delete({ userId });
    });

    const message = active
      ? `Done reset your challenge. Cleared: ${active.totalDays} days.`
      : 'Done reset your challenge. No active challenge found.';

    return {
      ok: true,
      message,
      clearedDays,
    };
  }

  private toActiveSavingPlanModel(row: UserSavingPlan): ActiveSavingPlanModel {
    return {
      id: row.id,
      totalDays: row.totalDays,
      totalAmount: row.totalAmount,
      allowedHours: row.allowedHours,
      startAt: row.startAt,
      endAt: row.endAt,
      isActive: row.isActive,
    } as ActiveSavingPlanModel;
  }

  private toTodayClaimModel(
    claim: DailyClaimRow | null,
    now: Date,
  ): TodayClaimModel {
    const next = nextMalaysiaMidnight(now);
    return {
      isClaimed: !!claim,
      claimedDayNumber: claim?.claimedDayNumber ?? null,
      nextAvailableAt: next,
    } as TodayClaimModel;
  }

  async getMyChallengeRoom(userId: string): Promise<MyChallengeRoomModel> {
    const now = new Date();

    const active = await this.userSavingPlansRepo.findOne({
      where: { userId, isActive: true },
      order: { endAt: 'DESC' },
    });

    const globalWallet = await this.globalWalletRepo.findOne({
      where: { userId },
    });

    const globalWalletBalanceCents = globalWallet?.balanceCents ?? 0;

    // If there is no active challenge, return empty room state but still
    // show global wallet balance.
    if (!active) {
      const emptyToday = this.toTodayClaimModel(null, now);
      return {
        activeChallenge: null,
        globalWalletBalance: Math.floor(globalWalletBalanceCents / 100),
        challengeWalletBalance: 0,
        claimedDayNumbers: [],
        todayClaim: emptyToday,
        canStop: false,
      } as MyChallengeRoomModel;
    }

    const challengeWallet = await this.challengeWalletRepo.findOne({
      where: { userSavingPlanId: active.id },
    });
    const challengeWalletBalanceCents = challengeWallet?.balanceCents ?? 0;

    const claimDateKey = toMalaysiaDateKey(now);
    const todayClaimRow = await this.dailyClaimRepo.findOne({
      where: { userSavingPlanId: active.id, claimDateKey },
    });

    const allClaims = await this.dailyClaimRepo.find({
      where: { userSavingPlanId: active.id },
      select: { claimedDayNumber: true },
    });

    const claimedDayNumbers = allClaims
      .map((c) => c.claimedDayNumber)
      .filter((n) => Number.isFinite(n));

    const canStop = active.endAt.getTime() <= now.getTime();

    return {
      activeChallenge: this.toActiveSavingPlanModel(active),
      globalWalletBalance: Math.floor(globalWalletBalanceCents / 100),
      challengeWalletBalance: Math.floor(challengeWalletBalanceCents / 100),
      claimedDayNumbers,
      todayClaim: this.toTodayClaimModel(todayClaimRow, now),
      canStop,
    } as MyChallengeRoomModel;
  }

  private computeCreditAmountCents(dayNumber: number): number {
    // Day K => RM K. Store cents as K * 100.
    return dayNumber * 100;
  }

  async claimChallengeDay(
    userId: string,
    dayNumber: number,
  ): Promise<MyChallengeRoomModel> {
    const now = new Date();

    const active = await this.userSavingPlansRepo.findOne({
      where: { userId, isActive: true },
      order: { endAt: 'DESC' },
    });

    if (!active) {
      throw new BadRequestException(
        'No active challenge. Please pick a duration first.',
      );
    }

    // If time is over, user must stop/transfer first.
    if (active.endAt.getTime() <= now.getTime()) {
      throw new BadRequestException(
        'Challenge ended. Please Stop to transfer to Global wallet.',
      );
    }

    if (
      !Number.isFinite(dayNumber) ||
      dayNumber < 1 ||
      dayNumber > active.totalDays
    ) {
      throw new BadRequestException('Invalid day selected for this challenge.');
    }

    const claimDateKey = toMalaysiaDateKey(now);
    const creditCents = this.computeCreditAmountCents(dayNumber);

    // Pre-check to return user-friendly messages.
    const todayClaim = await this.dailyClaimRepo.findOne({
      where: { userSavingPlanId: active.id, claimDateKey },
    });
    if (todayClaim) {
      throw new BadRequestException('You can top up after 12AM next day.');
    }

    const dayAlreadyClaimed = await this.dailyClaimRepo.findOne({
      where: { userSavingPlanId: active.id, claimedDayNumber: dayNumber },
    });
    if (dayAlreadyClaimed) {
      throw new BadRequestException(`Day ${dayNumber} is already claimed.`);
    }

    await this.dailyClaimRepo.manager.transaction(async (manager) => {
      const dailyRepo = manager.getRepository(DailyChallengeClaim);
      const challengeWalletRepo = manager.getRepository(ChallengeWallet);
      const walletTxRepo = manager.getRepository(WalletTransaction);
      const globalWalletRepo = manager.getRepository(GlobalWallet);

      // Ensure wallets exist (preferably created during subscribe, but fail-soft).
      let challengeWallet = await challengeWalletRepo.findOne({
        where: { userSavingPlanId: active.id },
      });
      if (!challengeWallet) {
        challengeWallet = challengeWalletRepo.create({
          userSavingPlanId: active.id,
          balanceCents: 0,
        });
        challengeWallet = await challengeWalletRepo.save(challengeWallet);
      }

      // Create the daily claim row.
      const claimRow = dailyRepo.create({
        userSavingPlanId: active.id,
        claimDateKey,
        claimedDayNumber: dayNumber,
        creditAmountCents: creditCents,
      });
      await dailyRepo.save(claimRow);

      // Update challenge wallet balance.
      const prevBalanceCents = challengeWallet.balanceCents ?? 0;
      challengeWallet.balanceCents = prevBalanceCents + creditCents;
      await challengeWalletRepo.save(challengeWallet);

      // Ensure global wallet exists for transaction reference (not strictly required).
      let globalWallet = await globalWalletRepo.findOne({ where: { userId } });
      if (!globalWallet) {
        globalWallet = await globalWalletRepo.save(
          globalWalletRepo.create({ userId, balanceCents: 0 }),
        );
      }

      const newBalanceCents = challengeWallet.balanceCents;

      const tx = walletTxRepo.create({
        walletType: 'CHALLENGE' as WalletType,
        walletId: challengeWallet.id,
        userId,
        type: 'CREDIT' as WalletTransactionType,
        amountCents: creditCents,
        balanceAfterCents: newBalanceCents,
        referenceType: 'DAILY_CHALLENGE_CLAIM',
        referenceId: claimRow.id,
      });

      await walletTxRepo.save(tx);
    });

    return this.getMyChallengeRoom(userId);
  }

  async stopChallengeAndTransfer(
    userId: string,
  ): Promise<MyChallengeRoomModel> {
    const now = new Date();

    const active = await this.userSavingPlansRepo.findOne({
      where: { userId, isActive: true },
      order: { endAt: 'DESC' },
    });

    if (!active) {
      throw new BadRequestException('No active challenge to stop.');
    }

    if (active.endAt.getTime() > now.getTime()) {
      throw new BadRequestException('Challenge is not finished yet.');
    }

    await this.dailyClaimRepo.manager.transaction(async (manager) => {
      const globalWalletRepo = manager.getRepository(GlobalWallet);
      const challengeWalletRepo = manager.getRepository(ChallengeWallet);
      const walletTxRepo = manager.getRepository(WalletTransaction);
      const completedRepo = manager.getRepository(CompletedChallenge);
      const userSavingPlansRepo = manager.getRepository(UserSavingPlan);

      let globalWallet = await globalWalletRepo.findOne({ where: { userId } });
      if (!globalWallet) {
        globalWallet = await globalWalletRepo.save(
          globalWalletRepo.create({ userId, balanceCents: 0 }),
        );
      }

      let challengeWallet = await challengeWalletRepo.findOne({
        where: { userSavingPlanId: active.id },
      });
      if (!challengeWallet) {
        // If the challenge wallet somehow doesn't exist, just transfer 0.
        challengeWallet = await challengeWalletRepo.save(
          challengeWalletRepo.create({
            userSavingPlanId: active.id,
            balanceCents: 0,
          }),
        );
      }

      const transferCents = challengeWallet.balanceCents ?? 0;

      if (transferCents > 0) {
        const prevGlobal = globalWallet.balanceCents ?? 0;

        // Update balances.
        challengeWallet.balanceCents = 0;
        globalWallet.balanceCents = prevGlobal + transferCents;

        await challengeWalletRepo.save(challengeWallet);
        await globalWalletRepo.save(globalWallet);

        // Debit challenge wallet
        await walletTxRepo.save(
          walletTxRepo.create({
            walletType: 'CHALLENGE' as WalletType,
            walletId: challengeWallet.id,
            userId,
            type: 'DEBIT' as WalletTransactionType,
            amountCents: transferCents,
            balanceAfterCents: 0,
            referenceType: 'STOP_CHALLENGE_TRANSFER',
            referenceId: active.id,
          }),
        );

        // Credit global wallet
        await walletTxRepo.save(
          walletTxRepo.create({
            walletType: 'GLOBAL' as WalletType,
            walletId: globalWallet.id,
            userId,
            type: 'CREDIT' as WalletTransactionType,
            amountCents: transferCents,
            balanceAfterCents: globalWallet.balanceCents,
            referenceType: 'STOP_CHALLENGE_TRANSFER',
            referenceId: active.id,
          }),
        );
      }

      // Close active challenge.
      active.isActive = false;
      await userSavingPlansRepo.save(active);

      // Track completion forever (repeat blocking).
      try {
        const completed = completedRepo.create({
          userId,
          totalDays: active.totalDays,
        });
        await completedRepo.save(completed);
      } catch {
        // Ignore unique violations if called twice.
      }
    });

    return this.getMyChallengeRoom(userId);
  }
}
