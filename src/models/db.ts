// PostgreSQL access (spec 3.9). One pool; integer cents come back as numbers (BIGINT parsed explicitly).
import pg from 'pg';

// BIGINT (money columns) arrive as strings by default; every money value is far below 2^53, so parse to an integer.
pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));

export type Db = pg.Pool;
export type DbClient = pg.PoolClient | pg.Pool;

export function createPool(connectionString: string, options: Partial<pg.PoolConfig> = {}): Db {
  return new pg.Pool({ connectionString, max: 10, ...options });
}

/** Runs fn in one transaction on one connection. */
export async function withTransaction<T>(db: Db, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
