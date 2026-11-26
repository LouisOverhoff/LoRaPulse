import { randomUUID } from 'node:crypto';
import * as webpushNs from 'web-push';
import { BUILTIN_SENSOR_PROFILES } from '@lorapulse/shared';
import { parseJsonColumn, type DbClient } from './client.js';
import { decryptSecret, encryptSecret } from '../security/crypto.js';

const webpush =
  (webpushNs as unknown as { default?: typeof webpushNs }).default ?? webpushNs;

export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  system_role TEXT NOT NULL,
  preferred_lang TEXT NOT NULL DEFAULT 'de',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS invite_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

CREATE TABLE IF NOT EXISTS user_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_group_members (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_path ON categories(path);

CREATE TABLE IF NOT EXISTS ttn_applications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ttn_app_id TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  use_tls BOOLEAN NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  masked_api_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_message_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sensor_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  localized_name_json JSONB,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  icon TEXT NOT NULL,
  battery_chemistry TEXT NOT NULL,
  downlink_interval_codec TEXT NOT NULL,
  is_built_in BOOLEAN NOT NULL DEFAULT FALSE,
  fields_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sensor_profiles ADD COLUMN IF NOT EXISTS localized_name_json JSONB;

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  ttn_application_id TEXT NOT NULL REFERENCES ttn_applications(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  sensor_profile_id TEXT NOT NULL,
  dev_eui TEXT UNIQUE NOT NULL,
  ttn_device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location_label TEXT,
  config_json JSONB NOT NULL DEFAULT '{}',
  latest_values_json JSONB NOT NULL DEFAULT '{}',
  raw_latest_payload_json JSONB,
  probe_error_fields_json JSONB NOT NULL DEFAULT '[]',
  battery_voltage DOUBLE PRECISION,
  rssi INTEGER,
  snr DOUBLE PRECISION,
  spreading_factor TEXT,
  status TEXT NOT NULL DEFAULT 'NEW',
  last_seen_at TIMESTAMPTZ,
  maintenance_until TIMESTAMPTZ,
  pending_downlink_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE devices ADD COLUMN IF NOT EXISTS maintenance_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_devices_category_id ON devices(category_id);
CREATE INDEX IF NOT EXISTS idx_devices_ttn_app_id ON devices(ttn_application_id);

CREATE TABLE IF NOT EXISTS user_device_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, device_id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device_label TEXT NOT NULL DEFAULT 'Browser',
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES user_groups(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  device_id TEXT REFERENCES devices(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permissions_user_id ON permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_permissions_group_id ON permissions(group_id);

CREATE TABLE IF NOT EXISTS measurements (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  f_cnt INTEGER,
  f_port INTEGER,
  rssi INTEGER,
  snr DOUBLE PRECISION,
  spreading_factor TEXT,
  payload_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_measurements_device_received ON measurements(device_id, received_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message_de TEXT NOT NULL,
  message_en TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  acked_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  acked_by_name TEXT,
  acked_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_alerts_device_status ON alerts(device_id, status);

CREATE TABLE IF NOT EXISTS system_kv (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details_json JSONB NOT NULL DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
`;

export interface StoredVapidKeys {
  publicKey: string;
  privateKeyEncrypted: string;
}

export async function ensureVapidKeyPair(
  db: DbClient
): Promise<{ publicKey: string; privateKey: string }> {
  const existingRes = await db.query<{ value_json: unknown }>(
    `SELECT value_json FROM system_kv WHERE key = 'vapid_keys' LIMIT 1`
  );
  const existing = parseJsonColumn<Partial<StoredVapidKeys> | null>(
    existingRes.rows[0]?.value_json,
    null
  );

  if (existing?.publicKey && existing?.privateKeyEncrypted) {
    try {
      const privateKey = decryptSecret(existing.privateKeyEncrypted);
      if (privateKey) {
        return { publicKey: existing.publicKey, privateKey };
      }
    } catch {
      // Regenerate below if master encryption key changed
    }
  }

  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  const generated =
    envPub && envPriv
      ? { publicKey: envPub, privateKey: envPriv }
      : webpush.generateVAPIDKeys();

  const storedPayload: StoredVapidKeys = {
    publicKey: generated.publicKey,
    privateKeyEncrypted: encryptSecret(generated.privateKey),
  };

  await db.query(
    `INSERT INTO system_kv (key, value_json, updated_at)
     VALUES ('vapid_keys', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET
       value_json = EXCLUDED.value_json,
       updated_at = NOW()`,
    [JSON.stringify(storedPayload)]
  );

  return generated;
}

export async function initializeSchemaAndSeeds(db: DbClient): Promise<void> {
  await db.exec(SCHEMA_DDL);

  for (const profile of BUILTIN_SENSOR_PROFILES) {
    await db.query(
      `INSERT INTO sensor_profiles (
         id, name, localized_name_json, brand, model, icon, battery_chemistry, downlink_interval_codec, is_built_in, fields_json
       )
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, TRUE, $9::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         localized_name_json = EXCLUDED.localized_name_json,
         brand = EXCLUDED.brand,
         model = EXCLUDED.model,
         icon = EXCLUDED.icon,
         battery_chemistry = EXCLUDED.battery_chemistry,
         downlink_interval_codec = EXCLUDED.downlink_interval_codec,
         is_built_in = TRUE,
         fields_json = EXCLUDED.fields_json`,
      [
        profile.id,
        profile.name,
        profile.localizedName ? JSON.stringify(profile.localizedName) : null,
        profile.brand,
        profile.model,
        profile.icon,
        profile.batteryChemistry,
        profile.downlinkIntervalCodec,
        JSON.stringify(profile.fields),
      ]
    );
  }

  await ensureVapidKeyPair(db);
}

export interface AuditEntryInput {
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function writeAuditLog(db: DbClient, entry: AuditEntryInput): Promise<void> {
  await db.query(
    `INSERT INTO audit_logs (
       id, actor_email, actor_role, action, target_type, target_id, details_json, ip_address
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      randomUUID(),
      entry.actorEmail,
      entry.actorRole,
      entry.action,
      entry.targetType,
      entry.targetId ?? null,
      JSON.stringify(entry.details ?? {}),
      entry.ipAddress ?? null,
    ]
  );
}
