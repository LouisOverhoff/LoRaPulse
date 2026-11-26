import {
  BUILTIN_SENSOR_PROFILES,
  DEFAULT_USER_DEVICE_PREFERENCE,
  evaluateBatteryHealth,
  PERMISSION_RANK,
  type AlertItem,
  type BatteryChemistry,
  type CategoryNode,
  type DeviceConfig,
  type DeviceHealthStatus,
  type DeviceView,
  type DownlinkCodecType,
  type DownlinkStatus,
  type EffectiveAccess,
  type Language,
  type LocalizedText,
  type PermissionGrant,
  type PermissionLevel,
  type SensorFieldDef,
  type SensorIconName,
  type SensorProfile,
  type SystemRole,
  type UserDevicePreference,
  type UserGroup,
  type UserSummary,
} from '@lorapulse/shared';
import {
  parseJsonColumn,
  toIso,
  toIsoOrNull,
  toNullableNumber,
  type DbClient,
} from '../db/client.js';

export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  system_role: SystemRole;
  preferred_lang: Language;
  is_active: boolean;
  must_change_password: boolean;
  created_at: unknown;
}

export interface CategoryRow {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  path: string;
  created_at: unknown;
}

export interface PermissionRow {
  id: string;
  user_id: string | null;
  group_id: string | null;
  category_id: string | null;
  device_id: string | null;
  level: PermissionLevel;
  created_at: unknown;
}

export interface DeviceJoinedRow {
  id: string;
  ttn_application_id: string;
  ttn_app_name: string;
  category_id: string | null;
  sensor_profile_id: string;
  dev_eui: string;
  ttn_device_id: string;
  name: string;
  latitude: number | string | null;
  longitude: number | string | null;
  location_label: string | null;
  config_json: unknown;
  latest_values_json: unknown;
  raw_latest_payload_json: unknown;
  probe_error_fields_json: unknown;
  battery_voltage: number | string | null;
  rssi: number | string | null;
  snr: number | string | null;
  spreading_factor: string | null;
  status: string;
  last_seen_at: unknown;
  maintenance_until: unknown;
  pending_downlink_json: unknown;
  created_at: unknown;
}

export interface UserAccessContext {
  user: UserSummary;
  categoriesById: Map<string, CategoryRow>;
  categoryGrants: Array<{ categoryPath: string; categoryId: string; level: PermissionLevel }>;
  deviceGrants: Map<string, PermissionLevel>;
  preferencesByDevice: Map<string, UserDevicePreference>;
}

function maxPermission(
  a: PermissionLevel | null,
  b: PermissionLevel | null
): PermissionLevel | null {
  if (!a) return b;
  if (!b) return a;
  return PERMISSION_RANK[b] > PERMISSION_RANK[a] ? b : a;
}

export function slugifyCategoryName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'cat';
}

export function buildCategoryBreadcrumb(
  categoryId: string | null,
  categoriesById: Map<string, CategoryRow>
): string[] | null {
  if (!categoryId) return null;
  const names: string[] = [];
  const visited = new Set<string>();
  let currentId: string | null = categoryId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = categoriesById.get(currentId);
    if (!node) break;
    names.push(node.name);
    currentId = node.parent_id;
  }

  if (names.length === 0) return null;
  names.reverse();
  return names;
}

export async function loadUserSummaryById(
  db: DbClient,
  userId: string
): Promise<UserSummary | null> {
  const userRes = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
  const row = userRes.rows[0];
  if (!row) return null;

  const groupRes = await db.query<{ group_id: string }>(
    'SELECT group_id FROM user_group_members WHERE user_id = $1 ORDER BY group_id ASC',
    [userId]
  );

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    systemRole: row.system_role,
    preferredLang: row.preferred_lang,
    isActive: Boolean(row.is_active),
    mustChangePassword: Boolean(row.must_change_password),
    groupIds: groupRes.rows.map((g) => g.group_id),
    createdAt: toIso(row.created_at),
  };
}

export async function loadAllUsersGroupsPermissions(db: DbClient): Promise<{
  users: UserSummary[];
  groups: UserGroup[];
  permissions: PermissionGrant[];
}> {
  const [usersRes, groupsRes, membersRes, permsRes] = await Promise.all([
    db.query<UserRow>('SELECT * FROM users ORDER BY created_at ASC'),
    db.query<{ id: string; name: string; description: string; created_at: unknown }>(
      'SELECT * FROM user_groups ORDER BY name ASC'
    ),
    db.query<{ user_id: string; group_id: string }>('SELECT * FROM user_group_members'),
    db.query<PermissionRow>('SELECT * FROM permissions ORDER BY created_at DESC'),
  ]);

  const groupsByUser = new Map<string, string[]>();
  const usersByGroup = new Map<string, string[]>();

  for (const m of membersRes.rows) {
    const uList = groupsByUser.get(m.user_id) ?? [];
    uList.push(m.group_id);
    groupsByUser.set(m.user_id, uList);

    const gList = usersByGroup.get(m.group_id) ?? [];
    gList.push(m.user_id);
    usersByGroup.set(m.group_id, gList);
  }

  const users: UserSummary[] = usersRes.rows.map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    systemRole: u.system_role,
    preferredLang: u.preferred_lang,
    isActive: Boolean(u.is_active),
    mustChangePassword: Boolean(u.must_change_password),
    groupIds: groupsByUser.get(u.id) ?? [],
    createdAt: toIso(u.created_at),
  }));

  const groups: UserGroup[] = groupsRes.rows.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    memberUserIds: usersByGroup.get(g.id) ?? [],
    createdAt: toIso(g.created_at),
  }));

  const permissions: PermissionGrant[] = permsRes.rows.map((p) => ({
    id: p.id,
    userId: p.user_id,
    groupId: p.group_id,
    categoryId: p.category_id,
    deviceId: p.device_id,
    level: p.level,
    createdAt: toIso(p.created_at),
  }));

  return { users, groups, permissions };
}

export async function loadAllSensorProfiles(db: DbClient): Promise<SensorProfile[]> {
  const res = await db.query<{
    id: string;
    name: string;
    localized_name_json?: unknown;
    brand: string;
    model: string;
    icon: SensorIconName;
    battery_chemistry: BatteryChemistry;
    downlink_interval_codec: DownlinkCodecType;
    is_built_in: boolean;
    fields_json: unknown;
  }>('SELECT * FROM sensor_profiles ORDER BY is_built_in DESC, name ASC');

  if (res.rows.length === 0) {
    return BUILTIN_SENSOR_PROFILES;
  }

  return res.rows.map((r) => {
    const builtIn = BUILTIN_SENSOR_PROFILES.find((b) => b.id === r.id);
    const parsedLocalized = parseJsonColumn<LocalizedText | null>(r.localized_name_json, null);
    const localizedName = parsedLocalized ?? builtIn?.localizedName;

    return {
      id: r.id,
      name: r.name,
      ...(localizedName ? { localizedName } : {}),
      brand: r.brand,
      model: r.model,
      icon: r.icon,
      batteryChemistry: r.battery_chemistry,
      downlinkIntervalCodec: r.downlink_interval_codec,
      isBuiltIn: Boolean(r.is_built_in),
      fields: parseJsonColumn<SensorFieldDef[]>(r.fields_json, []),
    };
  });
}

export async function buildUserAccessContext(
  db: DbClient,
  user: UserSummary
): Promise<UserAccessContext> {
  const [catRes, prefRes] = await Promise.all([
    db.query<CategoryRow>('SELECT * FROM categories ORDER BY path ASC'),
    db.query<{
      device_id: string;
      push_enabled: boolean;
      email_enabled: boolean;
      is_favorite: boolean;
    }>(
      `SELECT device_id, push_enabled, email_enabled, is_favorite
       FROM user_device_preferences
       WHERE user_id = $1`,
      [user.id]
    ),
  ]);

  const categoriesById = new Map<string, CategoryRow>();
  for (const cat of catRes.rows) {
    categoriesById.set(cat.id, cat);
  }

  const preferencesByDevice = new Map<string, UserDevicePreference>();
  for (const pref of prefRes.rows) {
    preferencesByDevice.set(pref.device_id, {
      pushEnabled: Boolean(pref.push_enabled),
      emailEnabled: Boolean(pref.email_enabled),
      isFavorite: Boolean(pref.is_favorite),
    });
  }

  if (user.systemRole === 'SUPER_ADMIN' || user.systemRole === 'ADMIN') {
    return {
      user,
      categoriesById,
      categoryGrants: [],
      deviceGrants: new Map(),
      preferencesByDevice,
    };
  }

  let permRows: PermissionRow[];
  if (user.groupIds.length > 0) {
    const placeholders = user.groupIds.map((_, idx) => `$${idx + 2}`).join(', ');
    const permRes = await db.query<PermissionRow>(
      `SELECT * FROM permissions WHERE user_id = $1 OR group_id IN (${placeholders})`,
      [user.id, ...user.groupIds]
    );
    permRows = permRes.rows;
  } else {
    const permRes = await db.query<PermissionRow>(
      'SELECT * FROM permissions WHERE user_id = $1',
      [user.id]
    );
    permRows = permRes.rows;
  }

  const categoryGrants: Array<{
    categoryPath: string;
    categoryId: string;
    level: PermissionLevel;
  }> = [];
  const deviceGrants = new Map<string, PermissionLevel>();

  for (const perm of permRows) {
    if (perm.category_id) {
      const cat = categoriesById.get(perm.category_id);
      if (cat) {
        categoryGrants.push({
          categoryId: cat.id,
          categoryPath: cat.path,
          level: perm.level,
        });
      }
    }
    if (perm.device_id) {
      const prev = deviceGrants.get(perm.device_id) ?? null;
      const best = maxPermission(prev, perm.level);
      if (best) {
        deviceGrants.set(perm.device_id, best);
      }
    }
  }

  return {
    user,
    categoriesById,
    categoryGrants,
    deviceGrants,
    preferencesByDevice,
  };
}

export function getCategoryLevelForUser(
  ctx: UserAccessContext,
  categoryId: string | null
): PermissionLevel | null {
  if (!categoryId) return null;
  const targetCat = ctx.categoriesById.get(categoryId);
  if (!targetCat) return null;

  let best: PermissionLevel | null = null;
  for (const grant of ctx.categoryGrants) {
    if (
      targetCat.id === grant.categoryId ||
      targetCat.path.startsWith(`${grant.categoryPath}.`)
    ) {
      best = maxPermission(best, grant.level);
    }
  }
  return best;
}

export function canUserManageCategory(ctx: UserAccessContext, categoryId: string): boolean {
  if (ctx.user.systemRole === 'SUPER_ADMIN' || ctx.user.systemRole === 'ADMIN') {
    return true;
  }
  return getCategoryLevelForUser(ctx, categoryId) === 'CATEGORY_ADMIN';
}

export function getVisibleCategoriesForUser(ctx: UserAccessContext): CategoryNode[] {
  const allRows = Array.from(ctx.categoriesById.values());

  if (ctx.user.systemRole === 'SUPER_ADMIN' || ctx.user.systemRole === 'ADMIN') {
    return allRows.map((c) => ({
      id: c.id,
      parentId: c.parent_id,
      name: c.name,
      slug: c.slug,
      path: c.path,
      createdAt: toIso(c.created_at),
    }));
  }

  const visibleRows = allRows.filter((c) => getCategoryLevelForUser(ctx, c.id) !== null);
  const visibleIds = new Set(visibleRows.map((c) => c.id));

  return visibleRows.map((c) => ({
    id: c.id,
    parentId: c.parent_id && visibleIds.has(c.parent_id) ? c.parent_id : null,
    name: c.name,
    slug: c.slug,
    path: c.path,
    createdAt: toIso(c.created_at),
  }));
}

function computeEffectiveDeviceHealth(
  storedStatus: string,
  lastSeenIso: string | null,
  config: DeviceConfig,
  maintenanceUntilIso: string | null
): DeviceHealthStatus {
  if (storedStatus === 'ALARM') {
    return 'ALARM';
  }
  if (storedStatus === 'OFFLINE') {
    return 'OFFLINE';
  }
  if (storedStatus === 'WARN') {
    return 'WARN';
  }
  if (!lastSeenIso) {
    return 'NEW';
  }
  const inMaintenance =
    maintenanceUntilIso !== null && new Date(maintenanceUntilIso).getTime() > Date.now();
  if (!inMaintenance) {
    const expectedSec = config.expectedIntervalSec ?? 3600;
    const elapsedMs = Date.now() - new Date(lastSeenIso).getTime();
    if (elapsedMs > expectedSec * 3 * 1000) {
      return 'OFFLINE';
    }
  }
  return 'OK';
}

export function mapRowToDeviceViewForUser(
  row: DeviceJoinedRow,
  ctx: UserAccessContext,
  profilesById: Map<string, SensorProfile>
): DeviceView | null {
  let effectivePermission: EffectiveAccess;
  let isDirectShareOnly = false;
  let exposedCategoryId: string | null = row.category_id;
  let exposedBreadcrumb: string[] | null = buildCategoryBreadcrumb(
    row.category_id,
    ctx.categoriesById
  );

  if (ctx.user.systemRole === 'SUPER_ADMIN' || ctx.user.systemRole === 'ADMIN') {
    effectivePermission = ctx.user.systemRole;
  } else {
    const catLevel = getCategoryLevelForUser(ctx, row.category_id);
    const devLevel = ctx.deviceGrants.get(row.id) ?? null;
    const combined = maxPermission(catLevel, devLevel);

    if (!combined) {
      return null;
    }

    effectivePermission = combined;

    // ZERO-SIBLING-LEAK:
    // If USER only has access via a direct device_id grant (no category grant on its category),
    // mask categoryId and categoryBreadcrumb completely so zero foreign folder names leak!
    if (catLevel === null && devLevel !== null) {
      exposedCategoryId = null;
      exposedBreadcrumb = null;
      isDirectShareOnly = true;
    }
  }

  const profile =
    profilesById.get(row.sensor_profile_id) ??
    BUILTIN_SENSOR_PROFILES.find((p) => p.id === row.sensor_profile_id) ??
    BUILTIN_SENSOR_PROFILES[BUILTIN_SENSOR_PROFILES.length - 1];

  const config = parseJsonColumn<DeviceConfig>(row.config_json, {});
  const latestValues = parseJsonColumn<Record<string, number | string | boolean | null>>(
    row.latest_values_json,
    {}
  );
  const rawLatestPayload = parseJsonColumn<Record<string, unknown> | null>(
    row.raw_latest_payload_json,
    null
  );
  const probeErrorFields = parseJsonColumn<string[]>(row.probe_error_fields_json, []);
  const pendingDownlink = parseJsonColumn<DownlinkStatus | null>(row.pending_downlink_json, null);

  const batteryVoltage = toNullableNumber(row.battery_voltage);
  const batteryState = evaluateBatteryHealth(
    batteryVoltage,
    profile?.batteryChemistry ?? 'li_socl2_3v6'
  );
  const lastSeenAt = toIsoOrNull(row.last_seen_at);
  const maintenanceUntil = toIsoOrNull(row.maintenance_until);
  const status = computeEffectiveDeviceHealth(row.status, lastSeenAt, config, maintenanceUntil);

  const storedPref = ctx.preferencesByDevice.get(row.id);
  const userPreference: UserDevicePreference = storedPref
    ? {
        pushEnabled: Boolean(storedPref.pushEnabled),
        emailEnabled: Boolean(storedPref.emailEnabled),
        isFavorite: Boolean(storedPref.isFavorite),
      }
    : { ...DEFAULT_USER_DEVICE_PREFERENCE };

  return {
    id: row.id,
    ttnApplicationId: row.ttn_application_id,
    ttnAppName: row.ttn_app_name,
    categoryId: exposedCategoryId,
    categoryBreadcrumb: exposedBreadcrumb,
    isDirectShareOnly,
    sensorProfileId: row.sensor_profile_id,
    devEui: row.dev_eui,
    ttnDeviceId: row.ttn_device_id,
    name: row.name,
    latitude: toNullableNumber(row.latitude),
    longitude: toNullableNumber(row.longitude),
    locationLabel: row.location_label ?? null,
    config,
    latestValues,
    rawLatestPayload,
    probeErrorFields,
    batteryVoltage,
    batteryState,
    rssi: toNullableNumber(row.rssi),
    snr: toNullableNumber(row.snr),
    spreadingFactor: row.spreading_factor ?? null,
    status,
    lastSeenAt,
    maintenanceUntil,
    userPreference,
    pendingDownlink,
    effectivePermission,
    createdAt: toIso(row.created_at),
  };
}

export async function loadVisibleDevicesAndProfiles(
  db: DbClient,
  user: UserSummary
): Promise<{ devices: DeviceView[]; profiles: SensorProfile[] }> {
  const [ctx, profiles, devRes] = await Promise.all([
    buildUserAccessContext(db, user),
    loadAllSensorProfiles(db),
    db.query<DeviceJoinedRow>(
      `SELECT d.*, a.name AS ttn_app_name
       FROM devices d
       JOIN ttn_applications a ON a.id = d.ttn_application_id
       ORDER BY d.name ASC, d.created_at ASC`
    ),
  ]);

  const profilesById = new Map(profiles.map((p) => [p.id, p]));
  const devices: DeviceView[] = [];

  for (const row of devRes.rows) {
    const view = mapRowToDeviceViewForUser(row, ctx, profilesById);
    if (view) {
      devices.push(view);
    }
  }

  return { devices, profiles };
}

export async function loadSingleDeviceViewForUser(
  db: DbClient,
  user: UserSummary,
  deviceId: string
): Promise<DeviceView | null> {
  const [ctx, profiles, devRes] = await Promise.all([
    buildUserAccessContext(db, user),
    loadAllSensorProfiles(db),
    db.query<DeviceJoinedRow>(
      `SELECT d.*, a.name AS ttn_app_name
       FROM devices d
       JOIN ttn_applications a ON a.id = d.ttn_application_id
       WHERE d.id = $1`,
      [deviceId]
    ),
  ]);

  const row = devRes.rows[0];
  if (!row) return null;

  const profilesById = new Map(profiles.map((p) => [p.id, p]));
  return mapRowToDeviceViewForUser(row, ctx, profilesById);
}

export async function getEffectiveAccessForDevice(
  db: DbClient,
  user: UserSummary,
  deviceId: string
): Promise<{ exists: boolean; access: EffectiveAccess | null }> {
  const devRes = await db.query<{ id: string; category_id: string | null }>(
    'SELECT id, category_id FROM devices WHERE id = $1',
    [deviceId]
  );
  const dev = devRes.rows[0];
  if (!dev) {
    return { exists: false, access: null };
  }
  if (user.systemRole === 'SUPER_ADMIN' || user.systemRole === 'ADMIN') {
    return { exists: true, access: user.systemRole };
  }
  const ctx = await buildUserAccessContext(db, user);
  const catLevel = getCategoryLevelForUser(ctx, dev.category_id);
  const devLevel = ctx.deviceGrants.get(dev.id) ?? null;
  return { exists: true, access: maxPermission(catLevel, devLevel) };
}

export function canEditDevice(access: EffectiveAccess | null): boolean {
  if (!access) return false;
  return (
    access === 'SUPER_ADMIN' ||
    access === 'ADMIN' ||
    access === 'CATEGORY_ADMIN' ||
    access === 'OPERATOR'
  );
}

export function canAckAlert(access: EffectiveAccess | null): boolean {
  if (!access) return false;
  return (
    access === 'SUPER_ADMIN' ||
    access === 'ADMIN' ||
    access === 'CATEGORY_ADMIN' ||
    access === 'OPERATOR'
  );
}

export async function loadVisibleAlertsForUser(
  db: DbClient,
  user: UserSummary
): Promise<AlertItem[]> {
  const { devices } = await loadVisibleDevicesAndProfiles(db, user);
  if (devices.length === 0) {
    return [];
  }

  const visibleDeviceNames = new Map(devices.map((d) => [d.id, d.name]));
  const deviceIds = Array.from(visibleDeviceNames.keys());
  const placeholders = deviceIds.map((_, idx) => `$${idx + 1}`).join(', ');

  const alertRes = await db.query<{
    id: string;
    device_id: string;
    alert_type: AlertItem['alertType'];
    severity: AlertItem['severity'];
    message_de: string;
    message_en: string;
    status: AlertItem['status'];
    acked_by_name: string | null;
    acked_at: unknown;
    resolved_at: unknown;
    created_at: unknown;
  }>(
    `SELECT * FROM alerts
     WHERE device_id IN (${placeholders})
     ORDER BY CASE WHEN status = 'OPEN' THEN 0 WHEN status = 'ACKED' THEN 1 ELSE 2 END, created_at DESC
     LIMIT 250`,
    deviceIds
  );

  return alertRes.rows.map((r) => ({
    id: r.id,
    deviceId: r.device_id,
    deviceName: visibleDeviceNames.get(r.device_id) ?? r.device_id,
    alertType: r.alert_type,
    severity: r.severity,
    messageDe: r.message_de,
    messageEn: r.message_en,
    status: r.status,
    ackedByName: r.acked_by_name ?? null,
    ackedAt: toIsoOrNull(r.acked_at),
    resolvedAt: toIsoOrNull(r.resolved_at),
    createdAt: toIso(r.created_at),
  }));
}

export async function loadAuthorizedUsersForDevice(
  db: DbClient,
  deviceId: string,
  categoryId: string | null
): Promise<UserSummary[]> {
  const [usersRes, membersRes, catRes, permsRes] = await Promise.all([
    db.query<UserRow>('SELECT * FROM users WHERE is_active = TRUE ORDER BY created_at ASC'),
    db.query<{ user_id: string; group_id: string }>('SELECT * FROM user_group_members'),
    db.query<CategoryRow>('SELECT * FROM categories'),
    db.query<PermissionRow>('SELECT * FROM permissions'),
  ]);

  if (usersRes.rows.length === 0) {
    return [];
  }

  const groupsByUser = new Map<string, string[]>();
  for (const m of membersRes.rows) {
    const list = groupsByUser.get(m.user_id) ?? [];
    list.push(m.group_id);
    groupsByUser.set(m.user_id, list);
  }

  const categoriesById = new Map<string, CategoryRow>();
  for (const cat of catRes.rows) {
    categoriesById.set(cat.id, cat);
  }
  const targetCat = categoryId ? (categoriesById.get(categoryId) ?? null) : null;

  const authorized: UserSummary[] = [];

  for (const u of usersRes.rows) {
    const groupIds = groupsByUser.get(u.id) ?? [];
    const summary: UserSummary = {
      id: u.id,
      email: u.email,
      displayName: u.display_name,
      systemRole: u.system_role,
      preferredLang: u.preferred_lang,
      isActive: Boolean(u.is_active),
      mustChangePassword: Boolean(u.must_change_password),
      groupIds,
      createdAt: toIso(u.created_at),
    };

    if (u.system_role === 'SUPER_ADMIN' || u.system_role === 'ADMIN') {
      authorized.push(summary);
      continue;
    }

    const groupSet = new Set(groupIds);
    let hasAccess = false;

    for (const perm of permsRes.rows) {
      const subjectMatch =
        perm.user_id === u.id || (perm.group_id !== null && groupSet.has(perm.group_id));
      if (!subjectMatch) continue;

      if (perm.device_id === deviceId) {
        hasAccess = true;
        break;
      }

      if (targetCat && perm.category_id) {
        const grantedCat = categoriesById.get(perm.category_id);
        if (
          grantedCat &&
          (targetCat.id === grantedCat.id || targetCat.path.startsWith(`${grantedCat.path}.`))
        ) {
          hasAccess = true;
          break;
        }
      }
    }

    if (hasAccess) {
      authorized.push(summary);
    }
  }

  return authorized;
}
