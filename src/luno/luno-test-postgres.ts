import os from 'os';
import { DataSource, type DataSourceOptions } from 'typeorm';

const DISPOSABLE_DATABASE =
  /^luno_v2a_(p1_concurrency|p2_migration|p2_confirm)_[0-9]+$/;

type EntityList = DataSourceOptions['entities'];

export function assertDisposableDatabase(name: string): void {
  if (!DISPOSABLE_DATABASE.test(name)) {
    throw new Error(
      `Refusing to create or drop "${name}". Luno tests only manage disposable luno_v2a databases.`,
    );
  }
}

export function lunoTestDataSource(
  database: string,
  entities?: EntityList,
): DataSource {
  if (database !== 'postgres') {
    assertDisposableDatabase(database);
  }
  const host = process.env.LUNO_TEST_PGHOST ?? '127.0.0.1';
  const port = Number(process.env.LUNO_TEST_PGPORT ?? '5432');
  if (
    (host !== '127.0.0.1' && host !== 'localhost') ||
    port !== 5432 ||
    /rlwy|railway|lucky_pick/i.test(host)
  ) {
    throw new Error('Luno Postgres tests only connect to 127.0.0.1:5432.');
  }
  const password = process.env.LUNO_TEST_PGPASSWORD;
  return new DataSource({
    type: 'postgres',
    host,
    port,
    username: process.env.LUNO_TEST_PGUSER ?? os.userInfo().username,
    ...(password ? { password } : {}),
    database,
    entities,
    synchronize: false,
    logging: false,
  });
}

export async function dropDisposableDatabase(
  admin: DataSource,
  name: string,
): Promise<void> {
  assertDisposableDatabase(name);
  await admin.query(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [name],
  );
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
}

export async function recreateDisposableDatabase(
  admin: DataSource,
  name: string,
): Promise<void> {
  await dropDisposableDatabase(admin, name);
  await admin.query(`CREATE DATABASE "${name}"`);
}
