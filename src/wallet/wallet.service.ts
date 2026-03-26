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
import { MyWalletOverviewModel } from './models/my-wallet-overview.model';
import { CompletedChallenge } from './completed-challenge.entity';
import { GiveUpChallenge } from './give-up-challenge.entity';
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
      const giveUpRepo = manager.getRepository(GiveUpChallenge);
      const userSavingPlansRepo = manager.getRepository(UserSavingPlan);

      await giveUpRepo.delete({ userId });
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
        canGiveUp: false,
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
    const canGiveUp = active.endAt.getTime() > now.getTime();

    return {
      activeChallenge: this.toActiveSavingPlanModel(active),
      globalWalletBalance: Math.floor(globalWalletBalanceCents / 100),
      challengeWalletBalance: Math.floor(challengeWalletBalanceCents / 100),
      claimedDayNumbers,
      todayClaim: this.toTodayClaimModel(todayClaimRow, now),
      canStop,
      canGiveUp,
    } as MyChallengeRoomModel;
  }

  async getMyWalletOverview(userId: string): Promise<MyWalletOverviewModel> {
    const [globalWallet, active, recentTx] = await Promise.all([
      this.globalWalletRepo.findOne({ where: { userId } }),
      this.userSavingPlansRepo.findOne({
        where: { userId, isActive: true },
        order: { endAt: 'DESC' },
      }),
      this.walletTxRepo.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
    ]);

    const globalWalletBalanceCents = globalWallet?.balanceCents ?? 0;
    let challengeWalletBalanceCents = 0;
    if (active) {
      const challengeWallet = await this.challengeWalletRepo.findOne({
        where: { userSavingPlanId: active.id },
      });
      challengeWalletBalanceCents = challengeWallet?.balanceCents ?? 0;
    }

    return {
      globalWalletBalance: Math.floor(globalWalletBalanceCents / 100),
      challengeWalletBalance: Math.floor(challengeWalletBalanceCents / 100),
      totalWalletBalance: Math.floor(
        (globalWalletBalanceCents + challengeWalletBalanceCents) / 100,
      ),
      recentTransactions: recentTx.map((row) => ({
        id: row.id,
        walletType: row.walletType,
        type: row.type,
        amount: Math.floor(row.amountCents / 100),
        balanceAfter: Math.floor(row.balanceAfterCents / 100),
        referenceType: row.referenceType,
        createdAt: row.createdAt.toISOString(),
      })),
    } as MyWalletOverviewModel;
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

  /**
   * Transfers challenge wallet → global, deactivates the plan.
   * - `completed`: records {@link CompletedChallenge} (successful stop / admin complete).
   * - `give_up`: records {@link GiveUpChallenge} only; user may subscribe to the same duration again.
   */
  private async finalizeActiveChallengeStop(
    userId: string,
    active: UserSavingPlan,
    outcome:
      | {
          kind: 'completed';
          walletReferenceType:
            | 'STOP_CHALLENGE_TRANSFER'
            | 'ADMIN_FORCE_COMPLETE';
        }
      | { kind: 'give_up' },
  ): Promise<{ transferredCents: number }> {
    let transferredCents = 0;

    const walletReferenceType =
      outcome.kind === 'give_up'
        ? 'GIVE_UP_CHALLENGE'
        : outcome.walletReferenceType;

    await this.dailyClaimRepo.manager.transaction(async (manager) => {
      const globalWalletRepo = manager.getRepository(GlobalWallet);
      const challengeWalletRepo = manager.getRepository(ChallengeWallet);
      const walletTxRepo = manager.getRepository(WalletTransaction);
      const completedRepo = manager.getRepository(CompletedChallenge);
      const giveUpRepo = manager.getRepository(GiveUpChallenge);
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
        challengeWallet = await challengeWalletRepo.save(
          challengeWalletRepo.create({
            userSavingPlanId: active.id,
            balanceCents: 0,
          }),
        );
      }

      transferredCents = challengeWallet.balanceCents ?? 0;

      if (transferredCents > 0) {
        const prevGlobal = globalWallet.balanceCents ?? 0;

        challengeWallet.balanceCents = 0;
        globalWallet.balanceCents = prevGlobal + transferredCents;

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
            referenceType: walletReferenceType,
            referenceId: active.id,
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
            referenceType: walletReferenceType,
            referenceId: active.id,
          }),
        );
      }

      active.isActive = false;
      await userSavingPlansRepo.save(active);

      if (outcome.kind === 'completed') {
        try {
          const completed = completedRepo.create({
            userId,
            totalDays: active.totalDays,
          });
          await completedRepo.save(completed);
        } catch {
          // Ignore unique violations if called twice.
        }
      } else {
        try {
          await giveUpRepo.save(
            giveUpRepo.create({
              userId,
              userSavingPlanId: active.id,
              totalDays: active.totalDays,
              transferredCents,
            }),
          );
        } catch {
          // Ignore unique violations if called twice.
        }
      }
    });

    return { transferredCents };
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

    await this.finalizeActiveChallengeStop(userId, active, {
      kind: 'completed',
      walletReferenceType: 'STOP_CHALLENGE_TRANSFER',
    });

    return this.getMyChallengeRoom(userId);
  }

  async giveUpActiveChallenge(userId: string): Promise<MyChallengeRoomModel> {
    const now = new Date();

    const active = await this.userSavingPlansRepo.findOne({
      where: { userId, isActive: true },
      order: { endAt: 'DESC' },
    });

    if (!active) {
      throw new BadRequestException('No active challenge to give up.');
    }

    if (active.endAt.getTime() <= now.getTime()) {
      throw new BadRequestException(
        'Challenge time has ended. Use Stop to transfer to your Global wallet.',
      );
    }

    await this.finalizeActiveChallengeStop(userId, active, { kind: 'give_up' });

    return this.getMyChallengeRoom(userId);
  }

  /**
   * ADMIN/testing: complete the user's active challenge immediately (no end-time check),
   * same wallet + completion semantics as {@link stopChallengeAndTransfer}.
   */
  async adminCompleteUserActiveChallenge(userId: string): Promise<{
    ok: boolean;
    message: string;
    userId: string;
    totalDays: number;
    transferredMyr: number;
  }> {
    const active = await this.userSavingPlansRepo.findOne({
      where: { userId, isActive: true },
      order: { endAt: 'DESC' },
    });

    if (!active) {
      throw new BadRequestException('No active challenge for this user.');
    }

    const totalDays = active.totalDays;
    const { transferredCents } = await this.finalizeActiveChallengeStop(
      userId,
      active,
      {
        kind: 'completed',
        walletReferenceType: 'ADMIN_FORCE_COMPLETE',
      },
    );
    const transferredMyr = Math.floor(transferredCents / 100);

    return {
      ok: true,
      message: `Admin completed challenge: ${totalDays} days, transferred ${transferredMyr} MYR to global wallet.`,
      userId,
      totalDays,
      transferredMyr,
    };
  }
}
