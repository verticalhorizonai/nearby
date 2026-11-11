// A throwaway PostgreSQL schema per test file, on the UTF-8 test cluster named by TEST_DATABASE_URL.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createPool, type Db } from '../../src/models/db.js';
import { applySchema } from '../../src/models/schema/runner.js';
import { seedSampleData } from '../../src/seed/seed.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:55432/nearby_test';

export async function createTestDb(opts: { seed?: boolean } = {}): Promise<{ db: Db; drop: () => Promise<void> }> {
  const schema = `t_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query('CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public').catch(() => undefined);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();
  const db = createPool(TEST_DATABASE_URL, { options: `-c search_path=${schema},public`, max: 5 });
  await applySchema(db);
  if (opts.seed !== false) await seedSampleData(db);
  return {
    db,
    drop: async () => {
      await db.end();
      const c = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await c.connect();
      await c.query(`DROP SCHEMA ${schema} CASCADE`);
      await c.end();
    },
  };
}
