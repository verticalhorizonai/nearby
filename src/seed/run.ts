// npm run seed: applies the schema, then loads the sample data (spec F7.1). Safe to run more than once.
import { createPool } from '../models/db.js';
import { applySchema } from '../models/schema/runner.js';
import { seedSampleData } from './seed.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Set it to the PostgreSQL connection string, then run npm run seed again.');
  process.exit(1);
}
const db = createPool(url);
try {
  await applySchema(db);
  const counts = await seedSampleData(db);
  console.log(`Seeded sample data: ${counts.merchants} sample merchants, ${counts.offers} sample offers. The demo calendar ships with the app.`);
} catch (err) {
  console.error(`Seeding failed: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
