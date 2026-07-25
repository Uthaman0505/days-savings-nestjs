import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RecurringTransactionService } from './recurring-transaction.service';

@Injectable()
export class RecurringTransactionJobService {
  private readonly logger = new Logger(RecurringTransactionJobService.name);
  private running = false;

  constructor(
    private readonly recurringTransactionService: RecurringTransactionService,
  ) {}

  /**
   * Polls due recurring schedules every minute.
   * Skips overlapping runs if a previous tick is still processing.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleDueRecurringTransactions(): Promise<void> {
    if (this.running) {
      this.logger.debug('Skipping recurring tick — previous run still active');
      return;
    }

    this.running = true;
    try {
      const executed =
        await this.recurringTransactionService.processDueRecurring();
      if (executed > 0) {
        this.logger.log(`Executed ${executed} recurring transaction(s)`);
      }
    } catch (error) {
      this.logger.error(
        `Recurring job failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    } finally {
      this.running = false;
    }
  }
}
