import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { LunoHealthService } from './luno-health.service';

/**
 * Development-only safe summary. Never prints secrets.
 *   npx ts-node -r tsconfig-paths/register src/luno/luno-dev-summary.ts
 */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const health = app.get(LunoHealthService);
  const snapshot = await health.getHealth();
  Logger.log(`\n${health.formatDevSummary(snapshot)}\n`, 'LunoDevSummary');
  await app.close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
