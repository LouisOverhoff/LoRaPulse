import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { z, ZodError } from 'zod';
import {
  APP_VERSION,
  BUILTIN_SENSOR_PROFILES,
  CreateCategorySchema,
  CreateGroupSchema,
  CreateInviteUserSchema,
  CreatePermissionSchema,
  CreateTtnApplicationSchema,
  LoginSchema,
  QueueDownlinkSchema,
  RedeemInviteSchema,
  SaveSensorProfileSchema,
  SetupBootstrapSchema,
  UpdateDeviceSchema,
  type AlertItem,
  type AuditLogItem,
  type AuthBootstrapStatus,
  type CategoryNode,
  type DeviceConfig,
  type MeasurementPoint,
  type PermissionGrant,
  type SensorProfile,
  type UserGroup,
  type UserSummary,
} from '@lorapulse/shared';
import {
  createDbClient,
  parseJsonColumn,
  toIso,
  toIsoOrNull,
  toNullableNumber,
  type DbClient,
} from './db/client.js';
import { initializeSchemaAndSeeds, writeAuditLog } from './db/schema.js';
import { startEmbeddedDemo, type EmbeddedDemoHandle } from './demo/embeddedDemo.js';
import {
  extractFieldValue,
  normalizeTtnTarget,
  recomputeAndPersistDeviceStatus,
  TtnMqttManager,
} from './mqtt/ttnManager.js';
import {
  constantTimeTokenEqual,
  encryptSecret,
  generateRandomToken,
  hashPassword,
  hashToken,
  initializeFirstRunOnboarding,
  maskApiKey,
  verifyPassword,
} from './security/crypto.js';
import {
  buildUserAccessContext,
  canAckAlert,
  canEditDevice,
  canUserManageCategory,
  getEffectiveAccessForDevice,
  getVisibleCategoriesForUser,
  loadAllSensorProfiles,
  loadAllUsersGroupsPermissions,
  loadSingleDeviceViewForUser,
  loadUserSummaryById,
  loadVisibleAlertsForUser,
  loadVisibleDevicesAndProfiles,
  slugifyCategoryName,
  type UserRow,
} from './services/permissions.js';
import { SseHub } from './services/sseHub.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: DbClient;
    sseHub: SseHub;
    ttnManager: TtnMqttManager;
  }
  interface FastifyRequest {
    authUser: UserSummary | null;
    authSessionId: string | null;
  }
}

export interface CreateAppOptions {
  databaseUrl?: string;
  setupToken?: string;
  cookieSecure?: boolean;
  enableDemo?: boolean;
  logger?: boolean;
}

const SESSION_COOKIE_NAME = 'lp_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days
const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const UpdatePreferencesSchema = z.object({
  preferredLang: z.enum(['de', 'en']).optional(),
  displayName: z.string().min(2).max(80).optional(),
  currentPassword: z.string().min(1).max(128).optional(),
  newPassword: z.string().min(10).max(128).optional(),
});

const AdminUpdateUserSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  systemRole: z.enum(['SUPER_ADMIN', 'ADMIN', 'USER']).optional(),
  isActive: z.boolean().optional(),
  groupIds: z.array(z.string()).optional(),
});

const SystemActionSchema = z
  .object({
    stage: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    action: z.enum(['reconnect_mqtt', 'restart_app', 'reboot_host']).optional(),
    password: z.string().min(1).max(128),
  })
  .refine((v) => v.stage !== undefined || v.action !== undefined, {
    message: 'Either stage or action is required',
  });

function parseRangeToCutoff(rangeParam?: string): { range: '24h' | '7d' | '30d'; cutoffIso: string } {
  const normalized = rangeParam === '7d' || rangeParam === '30d' ? rangeParam : '24h';
  const hours = normalized === '30d' ? 24 * 30 : normalized === '7d' ? 24 * 7 : 24;
  const cutoffIso = new Date(Date.now() - hours * 3600_000).toISOString();
  return { range: normalized, cutoffIso };
}

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  let str = typeof val === 'string' ? val : JSON.stringify(val);
  // Mitigate CSV spreadsheet formula injection on untrusted strings
  if (/^[=+@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function resolveFrontendDistDir(): string | null {
  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    ...(process.env.FRONTEND_DIST_PATH ? [path.resolve(process.env.FRONTEND_DIST_PATH)] : []),
    path.resolve(currentFileDir, '../../frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
    path.resolve(process.cwd(), '../frontend/dist'),
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }
  return null;
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const enableDemo =
    options.enableDemo !== undefined
      ? options.enableDemo
      : process.env.ENABLE_EMBEDDED_SIMULATOR === 'true' || process.argv.includes('--demo');

  const cookieSecure =
    options.cookieSecure !== undefined
      ? options.cookieSecure
      : process.env.COOKIE_SECURE !== undefined
        ? process.env.COOKIE_SECURE === 'true'
        : false;

  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: true,
  });

  const db = createDbClient(options.databaseUrl);
  await initializeSchemaAndSeeds(db);

  const onboarding = await initializeFirstRunOnboarding(db, {
    setupToken: options.setupToken,
    enableDemo,
  });
  let activeSetupToken: string | null = onboarding.setupToken;

  const sseHub = new SseHub(db);
  const ttnManager = new TtnMqttManager(db, sseHub);

  let demoHandle: EmbeddedDemoHandle | null = null;
  if (enableDemo) {
    demoHandle = await startEmbeddedDemo(db, ttnManager);
  }
  await ttnManager.startAll();

  app.decorate('db', db);
  app.decorate('sseHub', sseHub);
  app.decorate('ttnManager', ttnManager);
  app.decorateRequest('authUser', null);
  app.decorateRequest('authSessionId', null);

  app.addHook('onClose', async () => {
    sseHub.closeAll();
    await ttnManager.closeAll();
    if (demoHandle) {
      await demoHandle.close();
      demoHandle = null;
    }
    await db.close();
  });

  // Security headers (allowing Leaflet OpenStreetMap & OpenTopoMap tiles)
  await app.register(fastifyHelmet, {
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://*.tile.openstreetmap.org',
          'https://tile.openstreetmap.org',
          'https://*.tile.opentopomap.org',
        ],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  await app.register(fastifyCors, {
    origin: true,
    credentials: true,
  });

  await app.register(fastifyCookie, {
    secret: process.env.SESSION_SECRET || 'lorapulse-cookie-parser-secret',
  });

  await app.register(fastifyRateLimit, {
    max: 600,
    timeWindow: '1 minute',
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Validation failed',
        issues: error.issues,
      });
    }
    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? ((error as { statusCode: number }).statusCode)
        : 500;
    const message =
      statusCode >= 500
        ? 'Internal server error'
        : error instanceof Error
          ? error.message
          : 'Request failed';
    if (statusCode >= 500) {
      console.error('[LoRaPulse][ERROR]', error);
    }
    return reply.code(statusCode).send({ error: message });
  });

  const issueSessionCookie = async (reply: FastifyReply, userId: string): Promise<string> => {
    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);
    const sessionId = randomUUID();
    const expiresIso = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

    await db.query(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [sessionId, userId, tokenHash, expiresIso]
    );

    reply.setCookie(SESSION_COOKIE_NAME, rawToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: cookieSecure,
      maxAge: SESSION_TTL_SECONDS,
    });

    return sessionId;
  };

  // Resolve session on every incoming /api request
  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/api')) return;

    let rawToken = request.cookies?.[SESSION_COOKIE_NAME]?.trim() ?? '';
    if (!rawToken && typeof request.headers.authorization === 'string') {
      const authHeader = request.headers.authorization;
      if (authHeader.toLowerCase().startsWith('bearer ')) {
        rawToken = authHeader.slice(7).trim();
      }
    }
    if (!rawToken) return;

    const tokenHash = hashToken(rawToken);
    const sessRes = await db.query<{ id: string; user_id: string; expires_at: unknown }>(
      `SELECT id, user_id, expires_at
       FROM sessions
       WHERE token_hash = $1 AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    const sess = sessRes.rows[0];
    if (!sess) return;

    const user = await loadUserSummaryById(db, sess.user_id);
    if (!user || !user.isActive) {
      await db.query('DELETE FROM sessions WHERE id = $1', [sess.id]);
      return;
    }

    request.authUser = user;
    request.authSessionId = sess.id;
  });

  const requireAuth = (request: FastifyRequest, reply: FastifyReply): UserSummary | null => {
    if (!request.authUser) {
      reply.code(401).send({ error: 'Authentication required' });
      return null;
    }
    return request.authUser;
  };

  const requireAdmin = (request: FastifyRequest, reply: FastifyReply): UserSummary | null => {
    const user = requireAuth(request, reply);
    if (!user) return null;
    if (user.systemRole !== 'ADMIN' && user.systemRole !== 'SUPER_ADMIN') {
      reply.code(403).send({ error: 'Administrator privileges required' });
      return null;
    }
    return user;
  };

  const requireSuperAdmin = (request: FastifyRequest, reply: FastifyReply): UserSummary | null => {
    const user = requireAuth(request, reply);
    if (!user) return null;
    if (user.systemRole !== 'SUPER_ADMIN') {
      reply.code(403).send({ error: 'SUPER_ADMIN privileges strictly required' });
      return null;
    }
    return user;
  };

  // =========================================================================
  // 1. Health & Auth / Onboarding Endpoints
  // =========================================================================

  app.get('/api/health', async () => ({
    status: 'ok' as const,
    version: APP_VERSION,
    uptimeSec: Math.floor(process.uptime()),
  }));

  app.get('/api/auth/status', async (request): Promise<AuthBootstrapStatus> => {
    const countRes = await db.query<{ count: string | number }>(
      'SELECT COUNT(*) AS count FROM users'
    );
    const needsSetup = Number(countRes.rows[0]?.count ?? 0) === 0;

    return {
      appName: process.env.APP_NAME || 'LoRaPulse',
      version: APP_VERSION,
      needsSetup,
      demoMode: enableDemo,
      user: request.authUser ?? null,
    };
  });

  app.post(
    '/api/auth/setup',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const countRes = await db.query<{ count: string | number }>(
        'SELECT COUNT(*) AS count FROM users'
      );
      if (Number(countRes.rows[0]?.count ?? 0) > 0) {
        return reply.code(403).send({ error: 'Initial setup has already been completed' });
      }

      const body = SetupBootstrapSchema.parse(request.body);
      const expectedToken = activeSetupToken ?? options.setupToken ?? process.env.SETUP_TOKEN ?? '';

      if (!expectedToken || !constantTimeTokenEqual(body.setupToken.trim(), expectedToken)) {
        return reply.code(403).send({ error: 'Invalid setup token' });
      }

      const email = body.email.trim().toLowerCase();
      const pwHash = await hashPassword(body.password);
      const userId = randomUUID();

      await db.query(
        `INSERT INTO users (
           id, email, display_name, password_hash, system_role, preferred_lang, is_active, must_change_password
         )
         VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', $5, TRUE, FALSE)`,
        [userId, email, body.displayName.trim(), pwHash, body.preferredLang]
      );

      activeSetupToken = null;
      await issueSessionCookie(reply, userId);

      await writeAuditLog(db, {
        actorEmail: email,
        actorRole: 'SUPER_ADMIN',
        action: 'SETUP_BOOTSTRAP',
        targetType: 'USER',
        targetId: userId,
        details: { displayName: body.displayName.trim() },
        ipAddress: request.ip,
      });

      const user = await loadUserSummaryById(db, userId);
      return { user };
    }
  );

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 40, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = LoginSchema.parse(request.body);
      const email = body.email.trim().toLowerCase();

      const userRes = await db.query<UserRow>(
        'SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1',
        [email]
      );
      const row = userRes.rows[0];

      if (!row || !row.password_hash || !row.is_active) {
        return reply.code(401).send({ error: 'Invalid email or password' });
      }

      const valid = await verifyPassword(row.password_hash, body.password);
      if (!valid) {
        return reply.code(401).send({ error: 'Invalid email or password' });
      }

      await issueSessionCookie(reply, row.id);
      await writeAuditLog(db, {
        actorEmail: row.email,
        actorRole: row.system_role,
        action: 'USER_LOGIN',
        targetType: 'SESSION',
        targetId: row.id,
        ipAddress: request.ip,
      });

      const user = await loadUserSummaryById(db, row.id);
      return { user };
    }
  );

  app.post('/api/auth/logout', async (request, reply) => {
    const rawToken = request.cookies?.[SESSION_COOKIE_NAME]?.trim();
    if (rawToken) {
      const tokenHash = hashToken(rawToken);
      const sessRes = await db.query<{ id: string }>(
        'DELETE FROM sessions WHERE token_hash = $1 RETURNING id',
        [tokenHash]
      );
      if (sessRes.rows[0]) {
        sseHub.disconnectSession(sessRes.rows[0].id);
      }
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  });

  app.get<{ Params: { token: string } }>('/api/auth/invite/:token', async (request) => {
    const rawToken = (request.params.token ?? '').trim();
    if (rawToken.length < 16) {
      return { valid: false };
    }

    const tokenHash = hashToken(rawToken);
    const invRes = await db.query<{
      email: string;
      display_name: string;
    }>(
      `SELECT u.email, u.display_name
       FROM invite_tokens i
       JOIN users u ON u.id = i.user_id
       WHERE i.token_hash = $1
         AND i.used_at IS NULL
         AND i.expires_at > NOW()
         AND u.is_active = TRUE
       LIMIT 1`,
      [tokenHash]
    );

    const row = invRes.rows[0];
    if (!row) {
      return { valid: false };
    }
    return {
      valid: true,
      email: row.email,
      displayName: row.display_name,
    };
  });

  app.post('/api/auth/invite/redeem', async (request, reply) => {
    const body = RedeemInviteSchema.parse(request.body);
    const tokenHash = hashToken(body.token.trim());

    const invRes = await db.query<{
      invite_id: string;
      user_id: string;
      email: string;
      system_role: string;
      display_name: string;
    }>(
      `SELECT i.id AS invite_id, u.id AS user_id, u.email, u.system_role, u.display_name
       FROM invite_tokens i
       JOIN users u ON u.id = i.user_id
       WHERE i.token_hash = $1
         AND i.used_at IS NULL
         AND i.expires_at > NOW()
         AND u.is_active = TRUE
       LIMIT 1`,
      [tokenHash]
    );

    const inv = invRes.rows[0];
    if (!inv) {
      return reply.code(400).send({ error: 'Invite token is invalid or expired' });
    }

    const pwHash = await hashPassword(body.password);
    const nextDisplayName = body.displayName?.trim() || inv.display_name;

    await db.query(
      `UPDATE users
       SET password_hash = $1,
           display_name = $2,
           preferred_lang = $3,
           must_change_password = FALSE
       WHERE id = $4`,
      [pwHash, nextDisplayName, body.preferredLang, inv.user_id]
    );

    await db.query('UPDATE invite_tokens SET used_at = NOW() WHERE id = $1', [inv.invite_id]);

    await issueSessionCookie(reply, inv.user_id);
    await writeAuditLog(db, {
      actorEmail: inv.email,
      actorRole: inv.system_role,
      action: 'INVITE_REDEEMED',
      targetType: 'USER',
      targetId: inv.user_id,
      ipAddress: request.ip,
    });

    const user = await loadUserSummaryById(db, inv.user_id);
    return { user };
  });

  app.patch('/api/auth/preferences', async (request, reply) => {
    const authUser = requireAuth(request, reply);
    if (!authUser) return;

    const body = UpdatePreferencesSchema.parse(request.body);

    if (body.newPassword) {
      const userRes = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [authUser.id]);
      const row = userRes.rows[0];
      if (!row) {
        return reply.code(404).send({ error: 'User not found' });
      }
      if (row.password_hash) {
        if (!body.currentPassword) {
          return reply.code(400).send({ error: 'Current password is required' });
        }
        const ok = await verifyPassword(row.password_hash, body.currentPassword);
        if (!ok) {
          return reply.code(401).send({ error: 'Current password is incorrect' });
        }
      }
      const nextHash = await hashPassword(body.newPassword);
      await db.query(
        'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
        [nextHash, authUser.id]
      );
    }

    if (body.preferredLang || body.displayName) {
      await db.query(
        `UPDATE users
         SET preferred_lang = COALESCE($1, preferred_lang),
             display_name = COALESCE($2, display_name)
         WHERE id = $3`,
        [body.preferredLang ?? null, body.displayName?.trim() ?? null, authUser.id]
      );
    }

    const user = await loadUserSummaryById(db, authUser.id);
    return { user };
  });

  // =========================================================================
  // 2. Devices, Measurements, Exports & Downlinks
  // =========================================================================

  app.get('/api/devices', async (request, reply) => {
    const authUser = requireAuth(request, reply);
    if (!authUser) return;

    return loadVisibleDevicesAndProfiles(db, authUser);
  });

  app.get<{
    Params: { id: string };
    Querystring: { range?: string };
  }>('/api/devices/:id/measurements', async (request, reply) => {
    const authUser = requireAuth(request, reply);
    if (!authUser) return;

    const { exists, access } = await getEffectiveAccessForDevice(
      db,
      authUser,
      request.params.id
    );
    if (!access) {
      if (!exists && (authUser.systemRole === 'SUPER_ADMIN' || authUser.systemRole === 'ADMIN')) {
        return reply.code(404).send({ error: 'Device not found' });
      }
      return reply.code(403).send({ error: 'Access denied to device measurements' });
    }

    const { cutoffIso } = parseRangeToCutoff(request.query.range);
    const res = await db.query<{
      id: number | string;
      device_id: string;
      received_at: unknown;
      f_cnt: number | string | null;
      f_port: number | string | null;
      rssi: number | string | null;
      snr: number | string | null;
      spreading_factor: string | null;
      payload_json: unknown;
    }>(
      `SELECT * FROM (
         SELECT * FROM measurements
         WHERE device_id = $1 AND received_at >= $2
         ORDER BY received_at DESC
         LIMIT 5000
       ) sub
       ORDER BY received_at ASC`,
      [request.params.id, cutoffIso]
    );

    const measurements: MeasurementPoint[] = res.rows.map((r) => ({
      id: Number(r.id),
      deviceId: r.device_id,
      receivedAt: toIso(r.received_at),
      fCnt: toNullableNumber(r.f_cnt),
      fPort: toNullableNumber(r.f_port),
      rssi: toNullableNumber(r.rssi),
      snr: toNullableNumber(r.snr),
      spreadingFactor: r.spreading_factor ?? null,
      payload: parseJsonColumn<Record<string, unknown>>(r.payload_json, {}),
    }));

    return { measurements };
  });

  app.get<{
    Params: { id: string };
    Querystring: { format?: string; range?: string };
  }>('/api/devices/:id/export', async (request, reply) => {
    const authUser = requireAuth(request, reply);
    if (!authUser) return;

    const deviceView = await loadSingleDeviceViewForUser(db, authUser, request.params.id);
    if (!deviceView) {
      return reply.code(403).send({ error: 'Access denied or device not found' });
    }

    const { range, cutoffIso } = parseRangeToCutoff(request.query.range);
    const format = request.query.format === 'json' ? 'json' : 'csv';

    const res = await db.query<{
      id: number | string;
      device_id: string;
      received_at: unknown;
      f_cnt: number | string | null;
      f_port: number | string | null;
      rssi: number | string | null;
      snr: number | string | null;
      spreading_factor: string | null;
      payload_json: unknown;
    }>(
      `SELECT * FROM measurements
       WHERE device_id = $1 AND received_at >= $2
       ORDER BY received_at ASC
       LIMIT 10000`,
      [deviceView.id, cutoffIso]
    );

    const measurements: MeasurementPoint[] = res.rows.map((r) => ({
      id: Number(r.id),
      deviceId: r.device_id,
      receivedAt: toIso(r.received_at),
      fCnt: toNullableNumber(r.f_cnt),
      fPort: toNullableNumber(r.f_port),
      rssi: toNullableNumber(r.rssi),
      snr: toNullableNumber(r.snr),
      spreadingFactor: r.spreading_factor ?? null,
      payload: parseJsonColumn<Record<string, unknown>>(r.payload_json, {}),
    }));

    const safeSlug = deviceView.ttnDeviceId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'sensor';

    if (format === 'json') {
      reply
        .header('Content-Type', 'application/json; charset=utf-8')
        .header(
          'Content-Disposition',
          `attachment; filename="${safeSlug}-${range}.json"`
        );
      return JSON.stringify(
        {
          device: {
            id: deviceView.id,
            name: deviceView.name,
            devEui: deviceView.devEui,
            ttnDeviceId: deviceView.ttnDeviceId,
            sensorProfileId: deviceView.sensorProfileId,
          },
          range,
          exportedAt: new Date().toISOString(),
          measurements,
        },
        null,
        2
      );
    }

    const payloadKeySet = new Set<string>();
    for (const m of measurements) {
      for (const key of Object.keys(m.payload)) {
        payloadKeySet.add(key);
      }
    }
    const payloadKeys = Array.from(payloadKeySet).sort();
    const headers = [
      'id',
      'receivedAt',
      'fCnt',
      'fPort',
      'rssi',
      'snr',
      'spreadingFactor',
      ...payloadKeys,
    ];

    const lines = [headers.map(escapeCsvCell).join(',')];
    for (const m of measurements) {
      const rowCells = [
        m.id,
        m.receivedAt,
        m.fCnt,
        m.fPort,
        m.rssi,
        m.snr,
        m.spreadingFactor,
        ...payloadKeys.map((k) => m.payload[k]),
      ];
      lines.push(rowCells.map(escapeCsvCell).join(','));
    }

    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${safeSlug}-${range}.csv"`);
    return lines.join('\n');
  });

  app.patch<{ Params: { id: string } }>('/api/devices/:id', async (request, reply) => {
    const authUser = requireAuth(request, reply);
    if (!authUser) return;

    const { exists, access } = await getEffectiveAccessForDevice(
      db,
      authUser,
      request.params.id
    );
    if (!exists) {
      if (authUser.systemRole === 'SUPER_ADMIN' || authUser.systemRole === 'ADMIN') {
        return reply.code(404).send({ error: 'Device not found' });
      }
      return reply.code(403).send({ error: 'Access denied' });
    }
    if (!canEditDevice(access)) {
      return reply.code(403).send({ error: 'Insufficient permission to modify device' });
    }

    const body = UpdateDeviceSchema.parse(request.body);

    const existingRes = await db.query<{
      id: string;
      name: string;
      category_id: string | null;
      sensor_profile_id: string;
      latitude: number | string | null;
      longitude: number | string | null;
      location_label: string | null;
      config_json: unknown;
      latest_values_json: unknown;
      raw_latest_payload_json: unknown;
      probe_error_fields_json: unknown;
    }>('SELECT * FROM devices WHERE id = $1', [request.params.id]);
    const existing = existingRes.rows[0];
    if (!existing) {
      return reply.code(404).send({ error: 'Device not found' });
    }

    // Category assignment guard for non-system-admins
    if (body.categoryId !== undefined && body.categoryId !== existing.category_id) {
      if (authUser.systemRole === 'USER') {
        if (access !== 'CATEGORY_ADMIN') {
          return reply.code(403).send({ error: 'CATEGORY_ADMIN required to move device category' });
        }
        if (body.categoryId !== null) {
          const ctx = await buildUserAccessContext(db, authUser);
          if (!canUserManageCategory(ctx, body.categoryId)) {
            return reply
              .code(403)
              .send({ error: 'CATEGORY_ADMIN required on destination category' });
          }
        }
      }
      if (body.categoryId !== null) {
        const catCheck = await db.query<{ id: string }>(
          'SELECT id FROM categories WHERE id = $1',
          [body.categoryId]
        );
        if (!catCheck.rows[0]) {
          return reply.code(400).send({ error: 'Target category does not exist' });
        }
      }
    }

    const nextProfileId = body.sensorProfileId ?? existing.sensor_profile_id;
    const allProfiles = await loadAllSensorProfiles(db);
    const targetProfile = allProfiles.find((p) => p.id === nextProfileId);
    if (!targetProfile) {
      return reply.code(400).send({ error: 'Target sensor profile does not exist' });
    }

    const currentConfig = parseJsonColumn<DeviceConfig>(existing.config_json, {});
    const mergedConfig: DeviceConfig = body.config
      ? { ...currentConfig, ...body.config }
      : currentConfig;

    // Re-evaluate latestValues & probeErrorFields if profile changed and raw payload is available
    let nextLatestValues = parseJsonColumn<Record<string, number | string | boolean | null>>(
      existing.latest_values_json,
      {}
    );
    let nextProbeErrors = parseJsonColumn<string[]>(existing.probe_error_fields_json, []);
    const rawPayload = parseJsonColumn<Record<string, unknown> | null>(
      existing.raw_latest_payload_json,
      null
    );

    if (rawPayload && body.sensorProfileId && body.sensorProfileId !== existing.sensor_profile_id) {
      const recomputedValues: Record<string, number | string | boolean | null> = {};
      const recomputedErrors: string[] = [];

      for (const field of targetProfile.fields) {
        const rawVal = extractFieldValue(rawPayload, field.key);
        if (rawVal === undefined) continue;

        if (field.kind === 'number' || field.kind === 'battery' || field.kind === 'counter') {
          const num = typeof rawVal === 'number' ? rawVal : Number(rawVal);
          if (
            !Number.isFinite(num) ||
            (field.validMin !== undefined && num < field.validMin) ||
            (field.validMax !== undefined && num > field.validMax)
          ) {
            recomputedErrors.push(field.key);
            recomputedValues[field.key] = null;
          } else {
            recomputedValues[field.key] = num;
          }
        } else if (
          typeof rawVal === 'number' ||
          typeof rawVal === 'boolean' ||
          typeof rawVal === 'string'
        ) {
          recomputedValues[field.key] = rawVal;
        }
      }
      nextLatestValues = { ...nextLatestValues, ...recomputedValues };
      nextProbeErrors = recomputedErrors;
    }

    const nextName = body.name !== undefined ? body.name.trim() : existing.name;
    const nextCategoryId =
      body.categoryId !== undefined ? body.categoryId : existing.category_id;
    const nextLat =
      body.latitude !== undefined ? body.latitude : toNullableNumber(existing.latitude);
    const nextLon =
      body.longitude !== undefined ? body.longitude : toNullableNumber(existing.longitude);
    const nextLocationLabel =
      body.locationLabel !== undefined ? body.locationLabel : existing.location_label;

    await db.query(
      `UPDATE devices
       SET name = $1,
           category_id = $2,
           sensor_profile_id = $3,
           latitude = $4,
           longitude = $5,
           location_label = $6,
           config_json = $7::jsonb,
           latest_values_json = $8::jsonb,
           probe_error_fields_json = $9::jsonb
       WHERE id = $10`,
      [
        nextName,
        nextCategoryId,
        nextProfileId,
        nextLat,
        nextLon,
        nextLocationLabel,
        JSON.stringify(mergedConfig),
        JSON.stringify(nextLatestValues),
        JSON.stringify(nextProbeErrors),
        existing.id,
      ]
    );

    await recomputeAndPersistDeviceStatus(db, existing.id);

    await writeAuditLog(db, {
      actorEmail: authUser.email,
      actorRole: authUser.systemRole,
      action: 'DEVICE_UPDATED',
      targetType: 'DEVICE',
      targetId: existing.id,
      details: { name: nextName, categoryId: nextCategoryId, sensorProfileId: nextProfileId },
      ipAddress: request.ip,
    });

    await sseHub.broadcastDeviceUpdated(existing.id);
    const device = await loadSingleDeviceViewForUser(db, authUser, existing.id);
    return { device };
  });

  app.post<{ Params: { id: string } }>('/api/devices/:id/downlink', async (request, reply) => {
    // STRICTLY SUPER_ADMIN ONLY!
    const superAdmin = requireSuperAdmin(request, reply);
    if (!superAdmin) return;

    const body = QueueDownlinkSchema.parse(request.body);
    await ttnManager.queueDownlink(request.params.id, body.intervalMinutes);

    await writeAuditLog(db, {
      actorEmail: superAdmin.email,
      actorRole: superAdmin.systemRole,
      action: 'DOWNLINK_QUEUED',
      targetType: 'DEVICE',
      targetId: request.params.id,
      details: { intervalMinutes: body.intervalMinutes },
      ipAddress: request.ip,
    });

    const device = await loadSingleDeviceViewForUser(db, superAdmin, request.params.id);
    return { device };
  });

  // =========================================================================
  // 3. Alerts
  // =========================================================================

  app.get('/api/alerts', async (request, reply) => {
    const authUser = requireAuth(request, reply);
    if (!authUser) return;

    const alerts = await loadVisibleAlertsForUser(db, authUser);
    return { alerts };
  });

  app.post<{ Params: { id: string } }>('/api/alerts/:id/ack', async (request, reply) => {
    const authUser = requireAuth(request, reply);
    if (!authUser) return;

    const alertRes = await db.query<{
      id: string;
      device_id: string;
      alert_type: AlertItem['alertType'];
      severity: AlertItem['severity'];
      message_de: string;
      message_en: string;
      status: AlertItem['status'];
      created_at: unknown;
    }>('SELECT * FROM alerts WHERE id = $1', [request.params.id]);

    const alertRow = alertRes.rows[0];
    if (!alertRow) {
      if (authUser.systemRole === 'SUPER_ADMIN' || authUser.systemRole === 'ADMIN') {
        return reply.code(404).send({ error: 'Alert not found' });
      }
      return reply.code(403).send({ error: 'Access denied' });
    }

    const { access } = await getEffectiveAccessForDevice(db, authUser, alertRow.device_id);
    if (!canAckAlert(access)) {
      return reply.code(403).send({ error: 'VIEWER or unauthorized role cannot acknowledge alerts' });
    }

    const ackedAtIso = new Date().toISOString();
    await db.query(
      `UPDATE alerts
       SET status = 'ACKED',
           acked_by_user_id = $1,
           acked_by_name = $2,
           acked_at = $3
       WHERE id = $4`,
      [authUser.id, authUser.displayName, ackedAtIso, alertRow.id]
    );

    const devRes = await db.query<{ name: string }>('SELECT name FROM devices WHERE id = $1', [
      alertRow.device_id,
    ]);

    const updatedAlert: AlertItem = {
      id: alertRow.id,
      deviceId: alertRow.device_id,
      deviceName: devRes.rows[0]?.name ?? alertRow.device_id,
      alertType: alertRow.alert_type,
      severity: alertRow.severity,
      messageDe: alertRow.message_de,
      messageEn: alertRow.message_en,
      status: 'ACKED',
      ackedByName: authUser.displayName,
      ackedAt: ackedAtIso,
      createdAt: toIso(alertRow.created_at),
    };

    await recomputeAndPersistDeviceStatus(db, alertRow.device_id);

    await writeAuditLog(db, {
      actorEmail: authUser.email,
      actorRole: authUser.systemRole,
      action: 'ALERT_ACKED',
      targetType: 'ALERT',
      targetId: alertRow.id,
      details: { deviceId: alertRow.device_id },
      ipAddress: request.ip,
    });

    await sseHub.broadcastAlertUpdated(updatedAlert);
    await sseHub.broadcastDeviceUpdated(alertRow.device_id);

    return { alert: updatedAlert };
  });

  // =========================================================================
  // 4. Categories & Sensor Profiles
  // =========================================================================

  app.get('/api/categories', async (request, reply) => {
    const authUser = requireAuth(request, reply);
    if (!authUser) return;

    const ctx = await buildUserAccessContext(db, authUser);
    const categories = getVisibleCategoriesForUser(ctx);
    return { categories };
  });

  app.post('/api/categories', async (request, reply) => {
    const authUser = requireAuth(request, reply);
    if (!authUser) return;

    const body = CreateCategorySchema.parse(request.body);
    const ctx = await buildUserAccessContext(db, authUser);

    let parentPath: string | null = null;
    if (body.parentId) {
      const parentCat = ctx.categoriesById.get(body.parentId);
      if (!parentCat) {
        return reply.code(404).send({ error: 'Parent category not found' });
      }
      if (!canUserManageCategory(ctx, body.parentId)) {
        return reply.code(403).send({ error: 'Insufficient permission on parent category' });
      }
      parentPath = parentCat.path;
    } else if (authUser.systemRole !== 'SUPER_ADMIN' && authUser.systemRole !== 'ADMIN') {
      return reply.code(403).send({ error: 'Only administrators can create root categories' });
    }

    const baseSlug = slugifyCategoryName(body.name);
    let slug = baseSlug;
    let candidatePath = parentPath ? `${parentPath}.${slug}` : slug;

    const existingPaths = new Set(Array.from(ctx.categoriesById.values()).map((c) => c.path));
    let suffix = 2;
    while (existingPaths.has(candidatePath)) {
      slug = `${baseSlug}_${suffix}`;
      candidatePath = parentPath ? `${parentPath}.${slug}` : slug;
      suffix += 1;
    }

    const id = randomUUID();
    const insertRes = await db.query<{ created_at: unknown }>(
      `INSERT INTO categories (id, parent_id, name, slug, path)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING created_at`,
      [id, body.parentId, body.name.trim(), slug, candidatePath]
    );

    const category: CategoryNode = {
      id,
      parentId: body.parentId,
      name: body.name.trim(),
      slug,
      path: candidatePath,
      createdAt: toIso(insertRes.rows[0]?.created_at),
    };

    await writeAuditLog(db, {
      actorEmail: authUser.email,
      actorRole: authUser.systemRole,
      action: 'CATEGORY_CREATED',
      targetType: 'CATEGORY',
      targetId: id,
      details: { name: category.name, path: category.path },
      ipAddress: request.ip,
    });

    sseHub.broadcastPermissionsChanged();
    return { category };
  });

  app.delete<{ Params: { id: string } }>('/api/categories/:id', async (request, reply) => {
    const authUser = requireAuth(request, reply);
    if (!authUser) return;

    const ctx = await buildUserAccessContext(db, authUser);
    const targetCat = ctx.categoriesById.get(request.params.id);
    if (!targetCat) {
      if (authUser.systemRole === 'SUPER_ADMIN' || authUser.systemRole === 'ADMIN') {
        return reply.code(404).send({ error: 'Category not found' });
      }
      return reply.code(403).send({ error: 'Access denied' });
    }

    if (!canUserManageCategory(ctx, targetCat.id)) {
      return reply.code(403).send({ error: 'Insufficient permission to delete category' });
    }

    await db.query(
      `DELETE FROM categories WHERE id = $1 OR path LIKE $2`,
      [targetCat.id, `${targetCat.path}.%`]
    );

    await writeAuditLog(db, {
      actorEmail: authUser.email,
      actorRole: authUser.systemRole,
      action: 'CATEGORY_DELETED',
      targetType: 'CATEGORY',
      targetId: targetCat.id,
      details: { name: targetCat.name, path: targetCat.path },
      ipAddress: request.ip,
    });

    sseHub.broadcastPermissionsChanged();
    return { ok: true };
  });

  app.get('/api/profiles', async (request, reply) => {
    const authUser = requireAuth(request, reply);
    if (!authUser) return;
    const profiles = await loadAllSensorProfiles(db);
    return { profiles };
  });

  app.post('/api/profiles', async (request, reply) => {
    const adminUser = requireAdmin(request, reply);
    if (!adminUser) return;

    const body = SaveSensorProfileSchema.parse(request.body);
    if (BUILTIN_SENSOR_PROFILES.some((p) => p.id === body.id)) {
      return reply.code(400).send({ error: 'Built-in sensor profiles cannot be overwritten' });
    }

    await db.query(
      `INSERT INTO sensor_profiles (
         id, name, brand, model, icon, battery_chemistry, downlink_interval_codec, is_built_in, fields_json
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         brand = EXCLUDED.brand,
         model = EXCLUDED.model,
         icon = EXCLUDED.icon,
         battery_chemistry = EXCLUDED.battery_chemistry,
         downlink_interval_codec = EXCLUDED.downlink_interval_codec,
         fields_json = EXCLUDED.fields_json
       WHERE sensor_profiles.is_built_in = FALSE`,
      [
        body.id,
        body.name.trim(),
        body.brand.trim(),
        body.model.trim(),
        body.icon,
        body.batteryChemistry,
        body.downlinkIntervalCodec,
        JSON.stringify(body.fields),
      ]
    );

    const profile: SensorProfile = {
      id: body.id,
      name: body.name.trim(),
      brand: body.brand.trim(),
      model: body.model.trim(),
      icon: body.icon,
      batteryChemistry: body.batteryChemistry,
      downlinkIntervalCodec: body.downlinkIntervalCodec,
      isBuiltIn: false,
      fields: body.fields,
    };

    await writeAuditLog(db, {
      actorEmail: adminUser.email,
      actorRole: adminUser.systemRole,
      action: 'PROFILE_SAVED',
      targetType: 'PROFILE',
      targetId: profile.id,
      details: { name: profile.name, fieldCount: profile.fields.length },
      ipAddress: request.ip,
    });

    return { profile };
  });

  // =========================================================================
  // 5. Admin User, Group & Permission Management (ADMIN & SUPER_ADMIN)
  // =========================================================================

  app.get('/api/admin/users', async (request, reply) => {
    const adminUser = requireAdmin(request, reply);
    if (!adminUser) return;

    return loadAllUsersGroupsPermissions(db);
  });

  app.get('/api/admin/groups', async (request, reply) => {
    const adminUser = requireAdmin(request, reply);
    if (!adminUser) return;

    const { groups } = await loadAllUsersGroupsPermissions(db);
    return { groups };
  });

  app.get('/api/admin/permissions', async (request, reply) => {
    const adminUser = requireAdmin(request, reply);
    if (!adminUser) return;

    const { permissions } = await loadAllUsersGroupsPermissions(db);
    return { permissions };
  });

  app.post('/api/admin/users/invite', async (request, reply) => {
    const adminUser = requireAdmin(request, reply);
    if (!adminUser) return;

    const body = CreateInviteUserSchema.parse(request.body);
    const email = body.email.trim().toLowerCase();

    const existingRes = await db.query<UserRow>(
      'SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1',
      [email]
    );
    if (existingRes.rows[0]) {
      return reply.code(409).send({ error: 'A user with this email already exists' });
    }

    const userId = randomUUID();
    await db.query(
      `INSERT INTO users (
         id, email, display_name, password_hash, system_role, preferred_lang, is_active, must_change_password
       )
       VALUES ($1, $2, $3, NULL, $4, 'de', TRUE, FALSE)`,
      [userId, email, body.displayName.trim(), body.systemRole]
    );

    for (const groupId of body.groupIds) {
      const grpCheck = await db.query<{ id: string }>(
        'SELECT id FROM user_groups WHERE id = $1',
        [groupId]
      );
      if (grpCheck.rows[0]) {
        await db.query(
          `INSERT INTO user_group_members (user_id, group_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [userId, groupId]
        );
      }
    }

    const rawInviteToken = generateRandomToken(24);
    const inviteHash = hashToken(rawInviteToken);
    const expiresIso = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    await db.query(
      `INSERT INTO invite_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [randomUUID(), userId, inviteHash, expiresIso]
    );

    await writeAuditLog(db, {
      actorEmail: adminUser.email,
      actorRole: adminUser.systemRole,
      action: 'USER_INVITED',
      targetType: 'USER',
      targetId: userId,
      details: { email, systemRole: body.systemRole, groupIds: body.groupIds },
      ipAddress: request.ip,
    });

    const user = await loadUserSummaryById(db, userId);
    return {
      user,
      token: rawInviteToken,
      inviteToken: rawInviteToken,
      invitePath: `/invite/${rawInviteToken}`,
      inviteUrl: `/invite/${rawInviteToken}`,
      expiresAt: expiresIso,
    };
  });

  app.patch<{ Params: { id: string } }>('/api/admin/users/:id', async (request, reply) => {
    const adminUser = requireAdmin(request, reply);
    if (!adminUser) return;

    const body = AdminUpdateUserSchema.parse(request.body);
    const targetRes = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [
      request.params.id,
    ]);
    const target = targetRes.rows[0];
    if (!target) {
      return reply.code(404).send({ error: 'User not found' });
    }

    // Privilege Escalation Protection: ADMIN cannot alter SUPER_ADMIN or promote to SUPER_ADMIN
    if (
      adminUser.systemRole !== 'SUPER_ADMIN' &&
      (target.system_role === 'SUPER_ADMIN' || body.systemRole === 'SUPER_ADMIN')
    ) {
      return reply
        .code(403)
        .send({ error: 'Only SUPER_ADMIN may manage SUPER_ADMIN accounts' });
    }

    // Prevent locking out the last active SUPER_ADMIN
    if (
      target.system_role === 'SUPER_ADMIN' &&
      (body.isActive === false || (body.systemRole && body.systemRole !== 'SUPER_ADMIN'))
    ) {
      const saCountRes = await db.query<{ count: string | number }>(
        `SELECT COUNT(*) AS count FROM users WHERE system_role = 'SUPER_ADMIN' AND is_active = TRUE`
      );
      if (Number(saCountRes.rows[0]?.count ?? 0) <= 1) {
        return reply
          .code(400)
          .send({ error: 'Cannot deactivate or demote the last active SUPER_ADMIN' });
      }
    }

    await db.query(
      `UPDATE users
       SET display_name = COALESCE($1, display_name),
           system_role = COALESCE($2, system_role),
           is_active = COALESCE($3, is_active)
       WHERE id = $4`,
      [
        body.displayName?.trim() ?? null,
        body.systemRole ?? null,
        body.isActive ?? null,
        target.id,
      ]
    );

    if (body.groupIds !== undefined) {
      await db.query('DELETE FROM user_group_members WHERE user_id = $1', [target.id]);
      for (const gid of body.groupIds) {
        await db.query(
          `INSERT INTO user_group_members (user_id, group_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [target.id, gid]
        );
      }
    }

    // CRITICAL: Immediate session revocation & live SSE stream termination on account deactivation
    if (body.isActive === false) {
      await db.query('DELETE FROM sessions WHERE user_id = $1', [target.id]);
      sseHub.disconnectUser(target.id);
    } else if (body.systemRole !== undefined || body.groupIds !== undefined) {
      sseHub.broadcastPermissionsChanged(target.id);
    }

    await writeAuditLog(db, {
      actorEmail: adminUser.email,
      actorRole: adminUser.systemRole,
      action: 'USER_UPDATED',
      targetType: 'USER',
      targetId: target.id,
      details: {
        isActive: body.isActive ?? target.is_active,
        systemRole: body.systemRole ?? target.system_role,
      },
      ipAddress: request.ip,
    });

    const user = await loadUserSummaryById(db, target.id);
    return { user };
  });

  app.post('/api/admin/groups', async (request, reply) => {
    const adminUser = requireAdmin(request, reply);
    if (!adminUser) return;

    const body = CreateGroupSchema.parse(request.body);
    const groupId = randomUUID();

    const insertRes = await db.query<{ created_at: unknown }>(
      `INSERT INTO user_groups (id, name, description)
       VALUES ($1, $2, $3)
       RETURNING created_at`,
      [groupId, body.name.trim(), body.description.trim()]
    );

    const validMemberIds: string[] = [];
    for (const uid of body.memberUserIds) {
      const uCheck = await db.query<{ id: string }>('SELECT id FROM users WHERE id = $1', [uid]);
      if (uCheck.rows[0]) {
        await db.query(
          `INSERT INTO user_group_members (user_id, group_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [uid, groupId]
        );
        validMemberIds.push(uid);
      }
    }

    const group: UserGroup = {
      id: groupId,
      name: body.name.trim(),
      description: body.description.trim(),
      memberUserIds: validMemberIds,
      createdAt: toIso(insertRes.rows[0]?.created_at),
    };

    await writeAuditLog(db, {
      actorEmail: adminUser.email,
      actorRole: adminUser.systemRole,
      action: 'GROUP_CREATED',
      targetType: 'GROUP',
      targetId: groupId,
      details: { name: group.name, memberCount: validMemberIds.length },
      ipAddress: request.ip,
    });

    sseHub.broadcastPermissionsChanged();
    return { group };
  });

  app.delete<{ Params: { id: string } }>('/api/admin/groups/:id', async (request, reply) => {
    const adminUser = requireAdmin(request, reply);
    if (!adminUser) return;

    const delRes = await db.query<{ id: string; name: string }>(
      'DELETE FROM user_groups WHERE id = $1 RETURNING id, name',
      [request.params.id]
    );
    if (!delRes.rows[0]) {
      return reply.code(404).send({ error: 'Group not found' });
    }

    await writeAuditLog(db, {
      actorEmail: adminUser.email,
      actorRole: adminUser.systemRole,
      action: 'GROUP_DELETED',
      targetType: 'GROUP',
      targetId: request.params.id,
      details: { name: delRes.rows[0].name },
      ipAddress: request.ip,
    });

    sseHub.broadcastPermissionsChanged();
    return { ok: true };
  });

  app.post('/api/admin/permissions', async (request, reply) => {
    const adminUser = requireAdmin(request, reply);
    if (!adminUser) return;

    const body = CreatePermissionSchema.parse(request.body);

    if (body.userId) {
      const u = await db.query<{ id: string }>('SELECT id FROM users WHERE id = $1', [
        body.userId,
      ]);
      if (!u.rows[0]) return reply.code(404).send({ error: 'Target user not found' });
    }
    if (body.groupId) {
      const g = await db.query<{ id: string }>('SELECT id FROM user_groups WHERE id = $1', [
        body.groupId,
      ]);
      if (!g.rows[0]) return reply.code(404).send({ error: 'Target group not found' });
    }
    if (body.categoryId) {
      const c = await db.query<{ id: string }>('SELECT id FROM categories WHERE id = $1', [
        body.categoryId,
      ]);
      if (!c.rows[0]) return reply.code(404).send({ error: 'Target category not found' });
    }
    if (body.deviceId) {
      const d = await db.query<{ id: string }>('SELECT id FROM devices WHERE id = $1', [
        body.deviceId,
      ]);
      if (!d.rows[0]) return reply.code(404).send({ error: 'Target device not found' });
    }

    // Update existing identical subject+target grant if already present
    const existingRes = await db.query<{ id: string; created_at: unknown }>(
      `SELECT id, created_at FROM permissions
       WHERE (user_id IS NOT DISTINCT FROM $1)
         AND (group_id IS NOT DISTINCT FROM $2)
         AND (category_id IS NOT DISTINCT FROM $3)
         AND (device_id IS NOT DISTINCT FROM $4)
       LIMIT 1`,
      [body.userId, body.groupId, body.categoryId, body.deviceId]
    );

    let permId: string;
    let createdAtIso: string;

    if (existingRes.rows[0]) {
      permId = existingRes.rows[0].id;
      createdAtIso = toIso(existingRes.rows[0].created_at);
      await db.query('UPDATE permissions SET level = $1 WHERE id = $2', [body.level, permId]);
    } else {
      permId = randomUUID();
      const ins = await db.query<{ created_at: unknown }>(
        `INSERT INTO permissions (id, user_id, group_id, category_id, device_id, level)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING created_at`,
        [permId, body.userId, body.groupId, body.categoryId, body.deviceId, body.level]
      );
      createdAtIso = toIso(ins.rows[0]?.created_at);
    }

    const permission: PermissionGrant = {
      id: permId,
      userId: body.userId,
      groupId: body.groupId,
      categoryId: body.categoryId,
      deviceId: body.deviceId,
      level: body.level,
      createdAt: createdAtIso,
    };

    await writeAuditLog(db, {
      actorEmail: adminUser.email,
      actorRole: adminUser.systemRole,
      action: 'PERMISSION_GRANTED',
      targetType: 'PERMISSION',
      targetId: permId,
      details: {
        userId: body.userId,
        groupId: body.groupId,
        categoryId: body.categoryId,
        deviceId: body.deviceId,
        level: body.level,
      },
      ipAddress: request.ip,
    });

    sseHub.broadcastPermissionsChanged(body.userId ?? undefined);
    return { permission };
  });

  app.delete<{ Params: { id: string } }>('/api/admin/permissions/:id', async (request, reply) => {
    const adminUser = requireAdmin(request, reply);
    if (!adminUser) return;

    const delRes = await db.query<{ id: string; user_id: string | null }>(
      'DELETE FROM permissions WHERE id = $1 RETURNING id, user_id',
      [request.params.id]
    );
    if (!delRes.rows[0]) {
      return reply.code(404).send({ error: 'Permission grant not found' });
    }

    await writeAuditLog(db, {
      actorEmail: adminUser.email,
      actorRole: adminUser.systemRole,
      action: 'PERMISSION_REVOKED',
      targetType: 'PERMISSION',
      targetId: request.params.id,
      ipAddress: request.ip,
    });

    sseHub.broadcastPermissionsChanged(delRes.rows[0].user_id ?? undefined);
    return { ok: true };
  });

  // =========================================================================
  // 6. Super-Admin Exclusive Endpoints (TTN Apps, Audit Logs, System Actions)
  // =========================================================================

  app.get('/api/super/ttn-apps', async (request, reply) => {
    const superAdmin = requireSuperAdmin(request, reply);
    if (!superAdmin) return;

    const apps = await ttnManager.listApplicationSummaries();
    return { apps };
  });

  app.post('/api/super/ttn-apps', async (request, reply) => {
    const superAdmin = requireSuperAdmin(request, reply);
    if (!superAdmin) return;

    const body = CreateTtnApplicationSchema.parse(request.body);
    const normalized = normalizeTtnTarget(body.ttnAppId, body.host, body.port);
    const storedAppId = body.ttnAppId.includes('@') ? normalized.mqttUsername : normalized.cleanAppId;
    const id = randomUUID();
    const encryptedKey = encryptSecret(body.apiKey.trim());
    const maskedKey = maskApiKey(body.apiKey.trim());

    await db.query(
      `INSERT INTO ttn_applications (
         id, name, ttn_app_id, host, port, use_tls, api_key_encrypted, masked_api_key, is_enabled
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        body.name.trim(),
        storedAppId,
        normalized.cleanHost,
        normalized.cleanPort,
        body.useTls,
        encryptedKey,
        maskedKey,
        body.isEnabled,
      ]
    );

    const appSummary = await ttnManager.syncApplication(id, true);

    await writeAuditLog(db, {
      actorEmail: superAdmin.email,
      actorRole: superAdmin.systemRole,
      action: 'TTN_APP_CREATED',
      targetType: 'TTN_APPLICATION',
      targetId: id,
      details: {
        name: body.name.trim(),
        ttnAppId: body.ttnAppId.trim(),
        host: body.host.trim(),
        port: body.port,
        useTls: body.useTls,
        maskedApiKey: maskedKey,
      },
      ipAddress: request.ip,
    });

    return { app: appSummary };
  });

  app.post<{ Params: { id: string } }>(
    '/api/super/ttn-apps/:id/reconnect',
    async (request, reply) => {
      const superAdmin = requireSuperAdmin(request, reply);
      if (!superAdmin) return;

      const appSummary = await ttnManager.reconnectApplication(request.params.id);
      if (!appSummary) {
        return reply.code(404).send({ error: 'TTN application not found' });
      }

      await writeAuditLog(db, {
        actorEmail: superAdmin.email,
        actorRole: superAdmin.systemRole,
        action: 'TTN_APP_RECONNECTED',
        targetType: 'TTN_APPLICATION',
        targetId: request.params.id,
        details: { ttnAppId: appSummary.ttnAppId },
        ipAddress: request.ip,
      });

      return { app: appSummary };
    }
  );

  app.delete<{ Params: { id: string } }>('/api/super/ttn-apps/:id', async (request, reply) => {
    const superAdmin = requireSuperAdmin(request, reply);
    if (!superAdmin) return;

    await ttnManager.removeApplication(request.params.id);
    const delRes = await db.query<{ id: string; ttn_app_id: string }>(
      'DELETE FROM ttn_applications WHERE id = $1 RETURNING id, ttn_app_id',
      [request.params.id]
    );
    if (!delRes.rows[0]) {
      return reply.code(404).send({ error: 'TTN application not found' });
    }

    await writeAuditLog(db, {
      actorEmail: superAdmin.email,
      actorRole: superAdmin.systemRole,
      action: 'TTN_APP_DELETED',
      targetType: 'TTN_APPLICATION',
      targetId: request.params.id,
      details: { ttnAppId: delRes.rows[0].ttn_app_id },
      ipAddress: request.ip,
    });

    return { ok: true };
  });

  app.get('/api/super/audit-logs', async (request, reply) => {
    const superAdmin = requireSuperAdmin(request, reply);
    if (!superAdmin) return;

    const res = await db.query<{
      id: string;
      actor_email: string;
      actor_role: string;
      action: string;
      target_type: string;
      target_id: string | null;
      details_json: unknown;
      ip_address: string | null;
      created_at: unknown;
    }>('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 300');

    const logs: AuditLogItem[] = res.rows.map((r) => ({
      id: r.id,
      actorEmail: r.actor_email,
      actorRole: r.actor_role,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id ?? null,
      details: parseJsonColumn<Record<string, unknown>>(r.details_json, {}),
      ipAddress: r.ip_address ?? null,
      createdAt: toIso(r.created_at),
    }));

    return { logs };
  });

  app.post('/api/super/system/action', async (request, reply) => {
    const superAdmin = requireSuperAdmin(request, reply);
    if (!superAdmin) return;

    const body = SystemActionSchema.parse(request.body);
    const resolvedStage: 1 | 2 | 3 =
      body.stage ??
      (body.action === 'reboot_host' ? 3 : body.action === 'restart_app' ? 2 : 1);

    // Mandatory password re-authentication for destructive/restart system stages
    const userRes = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [superAdmin.id]);
    const userRow = userRes.rows[0];
    if (!userRow?.password_hash) {
      return reply.code(401).send({ error: 'Re-authentication failed' });
    }

    const pwValid = await verifyPassword(userRow.password_hash, body.password);
    if (!pwValid) {
      await writeAuditLog(db, {
        actorEmail: superAdmin.email,
        actorRole: superAdmin.systemRole,
        action: `SYSTEM_ACTION_STAGE_${resolvedStage}_DENIED`,
        targetType: 'SYSTEM',
        details: { stage: resolvedStage, reason: 'INVALID_REAUTH_PASSWORD' },
        ipAddress: request.ip,
      });
      return reply.code(401).send({ error: 'Invalid password for re-authentication' });
    }

    let messageDe: string;
    let messageEn: string;

    if (resolvedStage === 1) {
      await ttnManager.reconnectAll();
      messageDe = 'Stufe 1 ausgeführt: Alle TTN-MQTT-Subsysteme wurden neu verbunden.';
      messageEn = 'Stage 1 executed: All TTN MQTT subsystems have been reconnected.';
    } else if (resolvedStage === 2) {
      await db.query('DELETE FROM sessions WHERE expires_at <= NOW()');
      await ttnManager.reconnectAll();
      messageDe =
        'Stufe 2 ausgeführt: Anwendungsdienste und MQTT-Verbindungen wurden neu initialisiert.';
      messageEn =
        'Stage 2 executed: Application services and MQTT connections were reinitialized.';
    } else {
      const hostRebootEnabled = process.env.ENABLE_HOST_REBOOT === 'true';
      messageDe = hostRebootEnabled
        ? 'Stufe 3 ausgeführt: Host-Systemneustart wurde angefordert.'
        : 'Stufe 3 protokolliert: Container-Sicherheitsmodus aktiv (ENABLE_HOST_REBOOT ist deaktiviert); Subsysteme wurden neu verbunden.';
      messageEn = hostRebootEnabled
        ? 'Stage 3 executed: Host system reboot has been requested.'
        : 'Stage 3 logged: Container safety mode active (ENABLE_HOST_REBOOT is disabled); subsystems were reconnected.';
      await ttnManager.reconnectAll();
    }

    await writeAuditLog(db, {
      actorEmail: superAdmin.email,
      actorRole: superAdmin.systemRole,
      action: `SYSTEM_ACTION_STAGE_${resolvedStage}`,
      targetType: 'SYSTEM',
      details: {
        stage: resolvedStage,
        hostRebootEnabled: process.env.ENABLE_HOST_REBOOT === 'true',
      },
      ipAddress: request.ip,
    });

    return { ok: true, messageDe, messageEn };
  });

  // =========================================================================
  // 7. Real-Time Server-Sent Events (SSE)
  // =========================================================================

  app.get('/api/events', async (request, reply) => {
    const authUser = requireAuth(request, reply);
    if (!authUser) return;

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const clientId = sseHub.addClient(
      authUser.id,
      request.authSessionId ?? 'direct',
      reply.raw
    );

    request.raw.on('close', () => {
      sseHub.removeClient(clientId);
    });
  });

  // =========================================================================
  // 8. Static PWA Hosting (frontend/dist) + SPA Fallback
  // =========================================================================

  const frontendDist = resolveFrontendDistDir();
  if (frontendDist) {
    await app.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
      wildcard: false,
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url === '/api') {
        return reply.code(404).send({ error: 'API endpoint not found' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url === '/api') {
        return reply.code(404).send({ error: 'API endpoint not found' });
      }
      return reply.code(404).send({
        error: 'Frontend build (frontend/dist) not found. Run npm run build first.',
      });
    });
  }

  return app;
}
