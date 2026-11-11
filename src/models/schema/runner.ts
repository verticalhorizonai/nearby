// Schema runner (task 214; INFRA): at every start, before the server listens, apply this app's own schema.sql (spec
// 3.13 and ruling 2: never specs/) and then every migrations/*.sql in file-name order. A failure stops the start.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Db } from '../db.js';

const SCHEMA_DIR = fileURLToPath(new URL('./', import.meta.url));

export async function applySchema(db: Db, dir: string = SCHEMA_DIR): Promise<string[]> {
  const applied: string[] = [];
  const schema = await readFile(`${dir}/schema.sql`, 'utf8');
  await db.query(schema);
  applied.push('schema.sql');
  let migrations: string[] = [];
  try {
    migrations = (await readdir(`${dir}/migrations`)).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    migrations = [];
  }
  for (const file of migrations) {
    await db.query(await readFile(`${dir}/migrations/${file}`, 'utf8'));
    applied.push(`migrations/${file}`);
  }
  return applied;
}
