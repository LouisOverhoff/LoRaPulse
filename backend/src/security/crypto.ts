import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { DbClient } from '../db/client.js';

let warnedFallbackKey = false;

function resolveEncryptionKey(explicitMasterKey?: string): Buffer {
  const raw = (explicitMasterKey ?? process.env.ENCRYPTION_MASTER_KEY ?? '').trim();

  // Valid custom 32-byte hex key (64 hex chars, not all zeros)
  if (/^[0-9a-fA-F]{64}$/.test(raw) && !/^0+$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  if (process.env.NODE_ENV === 'production' && !warnedFallbackKey) {
    warnedFallbackKey = true;
    console.warn(
      '[LoRaPulse][SECURITY WARNING] ENCRYPTION_MASTER_KEY is missing or uses a placeholder! ' +
        'Derived a deterministic key via scryptSync, which is NOT recommended for production. ' +
        'Generate a secure 64-char hex key via: openssl rand -hex 32'
    );
  }

  const seed = raw && !/^0+$/.test(raw) ? raw : 'lorapulse-local-dev-master-key-seed';
  return scryptSync(seed, 'lorapulse-aes-256-gcm-v1', 32);
}

export async function hashPassword(password: string): Promise<string> {
  // @node-rs/argon2 defaults to Argon2id (v=19)
  return hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (!passwordHash || !password) {
    return false;
  }
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function encryptSecret(plainText: string, explicitMasterKey?: string): string {
  const key = resolveEncryptionKey(explicitMasterKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(cipherPayload: string, explicitMasterKey?: string): string {
  const parts = cipherPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted secret payload');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const key = resolveEncryptionKey(explicitMasterKey);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(dataHex, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return '••••••••';
  }
  const suffix = trimmed.length >= 4 ? trimmed.slice(-4) : trimmed;
  if (trimmed.startsWith('NNSXS.')) {
    return `NNSXS.••••${suffix}`;
  }
  if (trimmed.length > 8) {
    return `${trimmed.slice(0, 4)}••••${suffix}`;
  }
  return `••••${suffix}`;
}

export function generateRandomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('hex');
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function constantTimeTokenEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const digestA = createHash('sha256').update(a, 'utf8').digest();
  const digestB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(digestA, digestB) && a.length === b.length;
}

export interface OnboardingState {
  setupToken: string | null;
}

export async function initializeFirstRunOnboarding(
  db: DbClient,
  options: { setupToken?: string; enableDemo?: boolean }
): Promise<OnboardingState> {
  const countRes = await db.query<{ count: string | number }>(
    'SELECT COUNT(*) AS count FROM users'
  );
  const userCount = Number(countRes.rows[0]?.count ?? 0);

  if (userCount > 0) {
    return { setupToken: null };
  }

  // In demo mode, embeddedDemo seeds the initial admin user directly
  if (options.enableDemo) {
    return { setupToken: options.setupToken ?? process.env.SETUP_TOKEN ?? null };
  }

  // Check optional .env initial bootstrap if no explicit test setupToken override was passed
  const initEmail = (process.env.INITIAL_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const initPassword = process.env.INITIAL_ADMIN_PASSWORD ?? '';

  if (!options.setupToken && initEmail && initPassword.length >= 10) {
    const pwHash = await hashPassword(initPassword);
    await db.query(
      `INSERT INTO users (
         id, email, display_name, password_hash, system_role, preferred_lang, is_active, must_change_password
       )
       VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', 'de', TRUE, FALSE)
       ON CONFLICT (email) DO NOTHING`,
      [randomUUID(), initEmail, 'System Administrator', pwHash]
    );
    console.info(`[LoRaPulse] Initial SUPER_ADMIN created from INITIAL_ADMIN_EMAIL (${initEmail}).`);
    return { setupToken: null };
  }

  const activeSetupToken =
    options.setupToken || process.env.SETUP_TOKEN?.trim() || generateRandomToken(24);

  if (!options.setupToken) {
    console.info('====================================================================');
    console.info('[LoRaPulse] FIRST-RUN SETUP REQUIRED (0 users in database)');
    console.info(`[LoRaPulse] One-time SETUP_TOKEN: ${activeSetupToken}`);
    console.info('====================================================================');
  }

  return { setupToken: activeSetupToken };
}
