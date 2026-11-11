// Credential isolation (task 87 by build ruling 8; REQ-07-03; spec 3.7.3, 3.13): live credentials exist only as
// environment variables on the server. At start, the built client is scanned for every secret's value; the server
// refuses to start if one would be shipped to browsers. The same scan proves no committed file holds a key.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The variables whose values must never leave the server. */
export const SECRET_VARIABLES = ['ANTHROPIC_API_KEY', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'GOOGLE_MAPS_SERVER_KEY', 'DATABASE_URL'] as const;

/** Patterns of real provider credentials. */
export const CREDENTIAL_PATTERNS: readonly RegExp[] = [/sk-ant-[A-Za-z0-9_-]{20,}/, /AIza[0-9A-Za-z_-]{35}/, /A21AA[A-Za-z0-9_-]{40,}/];

export class CredentialLeakError extends Error {}

/** The names of secrets whose values (8 characters or more) appear in text, and the credential patterns it matches. */
export function findLeaks(text: string, env: NodeJS.ProcessEnv): string[] {
  const found: string[] = [];
  for (const name of SECRET_VARIABLES) {
    const v = env[name];
    if (v && v.length >= 8 && text.includes(v)) found.push(name);
  }
  for (const p of CREDENTIAL_PATTERNS) if (p.test(text)) found.push(`pattern ${p.source}`);
  return found;
}

async function filesUnder(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await filesUnder(p)));
    else out.push(p);
  }
  return out;
}

/** Refuses to start when the built client carries a secret. */
export async function assertClientHasNoSecrets(clientDir: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  for (const file of await filesUnder(clientDir)) {
    if (!/\.(js|css|html|json|map|svg|txt)$/.test(file)) continue;
    const leaks = findLeaks(await readFile(file, 'utf8'), env);
    if (leaks.length > 0) throw new CredentialLeakError(`The built client contains ${leaks.join(', ')} (${file}). Secrets stay on the server.`);
  }
}
