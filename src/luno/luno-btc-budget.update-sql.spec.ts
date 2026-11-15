import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { LunoBtcMonthlyBudget } from './entities/luno-btc-monthly-budget.entity';
import {
  conditionalBudgetUpdate,
  sleeveOnlyBudgetUpdate,
} from './luno-btc-budget.service';
import { User } from '../user/user.entity';

class OfflineDataSource extends DataSource {
  async prepare(): Promise<void> {
    await this.buildMetadatas();
  }
}

const AMOUNT_SAVED_AT = new Date('2026-11-02T02:00:00.000Z');

async function budgetUpdateSql(
  values: Record<string, unknown>,
): Promise<[string, unknown[]]> {
  const dataSource = new OfflineDataSource({
    type: 'postgres',
    host: '127.0.0.1',
    username: 'unused',
    database: 'unused',
    entities: [User, LunoBtcMonthlyBudget],
    synchronize: false,
  });
  await dataSource.prepare();
  return dataSource
    .getRepository(LunoBtcMonthlyBudget)
    .createQueryBuilder()
    .update()
    .set(values)
    .where('id = :id', { id: '11111111-1111-1111-1111-111111111111' })
    .getQueryAndParameters();
}

describe('Luno monthly budget update SQL', () => {
  it('conditions a sleeve edit on the amount, both sleeves, and the millisecond clock', async () => {
    const dataSource = new OfflineDataSource({
      type: 'postgres',
      host: '127.0.0.1',
      username: 'unused',
      database: 'unused',
      entities: [User, LunoBtcMonthlyBudget],
      synchronize: false,
    });
    await dataSource.prepare();
    const row = {
      id: '11111111-1111-1111-1111-111111111111',
      updatedAt: AMOUNT_SAVED_AT,
      monthlyBudgetMyr: '100.000000000000000000',
      normalBuyAllocationMyr: null,
      dipReserveAllocationMyr: null,
    } as LunoBtcMonthlyBudget;
    const [query, parameters] = conditionalBudgetUpdate(
      dataSource.getRepository(LunoBtcMonthlyBudget),
      row,
      {
        monthlyBudgetMyr: '100',
        normalBuyAllocationMyr: '50',
        dipReserveAllocationMyr: '40',
      },
    ).getQueryAndParameters();

    expect(query).toBe(
      'UPDATE "luno_btc_monthly_budgets" SET "normal_buy_allocation_myr" = $1, "dip_reserve_allocation_myr" = $2, "updated_at" = $3 WHERE "id" = $4 AND date_trunc(\'milliseconds\', "updated_at") = $5 AND "monthly_budget_myr" = $6 AND "normal_buy_allocation_myr" IS NULL AND "dip_reserve_allocation_myr" IS NULL',
    );
    expect(parameters[2]).toEqual(AMOUNT_SAVED_AT);
    expect(parameters[4]).toEqual(AMOUNT_SAVED_AT);
    expect(parameters[5]).toBe('100.000000000000000000');
  });

  it('stamps a new clock only when the conditional amount change matches the observed row', async () => {
    const dataSource = new OfflineDataSource({
      type: 'postgres',
      host: '127.0.0.1',
      username: 'unused',
      database: 'unused',
      entities: [User, LunoBtcMonthlyBudget],
      synchronize: false,
    });
    await dataSource.prepare();
    const row = {
      id: '11111111-1111-1111-1111-111111111111',
      updatedAt: AMOUNT_SAVED_AT,
      monthlyBudgetMyr: '100.000000000000000000',
      normalBuyAllocationMyr: '50',
      dipReserveAllocationMyr: '40',
    } as LunoBtcMonthlyBudget;
    const [query, parameters] = conditionalBudgetUpdate(
      dataSource.getRepository(LunoBtcMonthlyBudget),
      row,
      {
        monthlyBudgetMyr: '200',
        normalBuyAllocationMyr: '80',
        dipReserveAllocationMyr: null,
      },
    ).getQueryAndParameters();

    expect(query).toBe(
      'UPDATE "luno_btc_monthly_budgets" SET "monthly_budget_myr" = $1, "normal_buy_allocation_myr" = $2, "dip_reserve_allocation_myr" = $3, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = $4 AND date_trunc(\'milliseconds\', "updated_at") = $5 AND "monthly_budget_myr" = $6 AND "normal_buy_allocation_myr" = $7 AND "dip_reserve_allocation_myr" = $8',
    );
    expect(parameters[4]).toEqual(AMOUNT_SAVED_AT);
    expect(parameters[5]).toBe('100.000000000000000000');
    expect(parameters[6]).toBe('50');
    expect(parameters[7]).toBe('40');
  });

  it('writes the existing amount-revision timestamp on a sleeve-only edit', async () => {
    const [query, parameters] = await budgetUpdateSql(
      sleeveOnlyBudgetUpdate(
        { updatedAt: AMOUNT_SAVED_AT } as LunoBtcMonthlyBudget,
        {
          normalBuyAllocationMyr: '50',
          dipReserveAllocationMyr: '40',
        },
      ),
    );

    expect(query).toBe(
      'UPDATE "luno_btc_monthly_budgets" SET "normal_buy_allocation_myr" = $1, "dip_reserve_allocation_myr" = $2, "updated_at" = $3 WHERE "id" = $4',
    );
    expect(query).not.toContain('CURRENT_TIMESTAMP');
    expect(parameters[2]).toEqual(AMOUNT_SAVED_AT);
  });

  it('lets TypeORM stamp updated_at when a monthly amount change omits it', async () => {
    const [query] = await budgetUpdateSql({
      monthlyBudgetMyr: '200',
      normalBuyAllocationMyr: '80',
      dipReserveAllocationMyr: null,
    });

    expect(query).toContain('"monthly_budget_myr" = $1');
    expect(query).toContain('"updated_at" = CURRENT_TIMESTAMP');
  });

  it('shows an omitted sleeve timestamp would advance the inference cutoff', async () => {
    const [query] = await budgetUpdateSql({
      normalBuyAllocationMyr: '50',
      dipReserveAllocationMyr: '40',
    });

    expect(query).toBe(
      'UPDATE "luno_btc_monthly_budgets" SET "normal_buy_allocation_myr" = $1, "dip_reserve_allocation_myr" = $2, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = $3',
    );
  });
});
