import {
  BUILTIN_SENSOR_PROFILES,
  type AlertItem,
  type AuditLogItem,
  type AuthBootstrapStatus,
  type CategoryNode,
  type DeviceConfig,
  type DeviceView,
  type DownlinkStatus,
  type Language,
  type MeasurementPoint,
  type PermissionGrant,
  type PermissionLevel,
  type PushSubscriptionSummary,
  type SensorProfile,
  type SmtpSettingsSummary,
  type TtnApplicationSummary,
  type UserDevicePreference,
  type UserGroup,
  type UserSummary,
} from '@lorapulse/shared';

export class ApiError extends Error {
  public readonly status: number;
  public readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

let unauthorizedHandler: (() => void) | null = null;

export function setOnUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function unwrapArray<T>(raw: unknown, candidateKeys: string[]): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (isRecord(raw)) {
    for (const key of candidateKeys) {
      if (Array.isArray(raw[key])) {
        return raw[key] as T[];
      }
    }
  }
  return [];
}

function unwrapObject<T>(raw: unknown, candidateKeys: string[]): T {
  if (isRecord(raw)) {
    for (const key of candidateKeys) {
      if (isRecord(raw[key])) {
        return raw[key] as T;
      }
    }
  }
  return raw as T;
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
  skipAuthRedirect = false
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'same-origin',
  });

  if (res.status === 401 && !skipAuthRedirect && unauthorizedHandler) {
    unauthorizedHandler();
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (isRecord(parsed)) {
      if (typeof parsed.error === 'string') msg = parsed.error;
      else if (typeof parsed.message === 'string') msg = parsed.message;
    }
    throw new ApiError(msg, res.status, parsed);
  }

  return parsed as T;
}

export interface InvitePreviewInfo {
  valid: boolean;
  email?: string;
  displayName?: string;
  expiresAt?: string;
}

export interface PasswordResetPreviewInfo {
  valid: boolean;
  email?: string;
  displayName?: string;
  expiresAt?: string;
}

export interface CreatedInviteResult {
  invitePath: string;
  token?: string;
  expiresAt?: string;
  emailSent?: boolean;
  user?: UserSummary;
}

export interface DeletedProfileResult {
  reassignedDevices: number;
}

export const api = {
  // Auth, Onboarding & Password Reset
  async getAuthStatus(): Promise<AuthBootstrapStatus> {
    const raw = await requestJson<unknown>('/api/auth/status', {}, true);
    return unwrapObject<AuthBootstrapStatus>(raw, ['status', 'data']);
  },

  async setupBootstrap(input: {
    setupToken: string;
    email: string;
    displayName: string;
    password: string;
    preferredLang: Language;
  }): Promise<UserSummary> {
    const raw = await requestJson<unknown>(
      '/api/auth/setup',
      { method: 'POST', body: JSON.stringify(input) },
      true
    );
    return unwrapObject<UserSummary>(raw, ['user']);
  },

  async login(input: { email: string; password: string }): Promise<UserSummary> {
    const raw = await requestJson<unknown>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify(input) },
      true
    );
    return unwrapObject<UserSummary>(raw, ['user']);
  },

  async logout(): Promise<void> {
    await requestJson<unknown>('/api/auth/logout', { method: 'POST' }, true);
  },

  async requestPasswordReset(input: { email: string; lang: Language }): Promise<void> {
    await requestJson<unknown>(
      '/api/auth/password-reset/request',
      { method: 'POST', body: JSON.stringify(input) },
      true
    );
  },

  async checkPasswordResetToken(token: string): Promise<PasswordResetPreviewInfo> {
    const raw = await requestJson<unknown>(
      `/api/auth/password-reset/${encodeURIComponent(token)}`,
      {},
      true
    );
    if (isRecord(raw)) {
      const inner = isRecord(raw.reset) ? raw.reset : raw;
      return {
        valid: inner.valid !== false,
        email: typeof inner.email === 'string' ? inner.email : undefined,
        displayName: typeof inner.displayName === 'string' ? inner.displayName : undefined,
        expiresAt: typeof inner.expiresAt === 'string' ? inner.expiresAt : undefined,
      };
    }
    return { valid: true };
  },

  async confirmPasswordReset(input: {
    token: string;
    newPassword: string;
  }): Promise<{ user: UserSummary | null }> {
    const raw = await requestJson<unknown>(
      '/api/auth/password-reset/confirm',
      { method: 'POST', body: JSON.stringify(input) },
      true
    );
    if (isRecord(raw) && isRecord(raw.user)) {
      return { user: raw.user as unknown as UserSummary };
    }
    return { user: null };
  },

  async checkInvite(token: string): Promise<InvitePreviewInfo> {
    const raw = await requestJson<unknown>(
      `/api/auth/invite/${encodeURIComponent(token)}`,
      {},
      true
    );
    if (isRecord(raw)) {
      const inner = isRecord(raw.invite) ? raw.invite : raw;
      return {
        valid: inner.valid !== false,
        email: typeof inner.email === 'string' ? inner.email : undefined,
        displayName: typeof inner.displayName === 'string' ? inner.displayName : undefined,
        expiresAt: typeof inner.expiresAt === 'string' ? inner.expiresAt : undefined,
      };
    }
    return { valid: true };
  },

  async redeemInvite(input: {
    token: string;
    displayName?: string;
    password: string;
    preferredLang: Language;
  }): Promise<UserSummary> {
    const raw = await requestJson<unknown>(
      '/api/auth/invite/redeem',
      { method: 'POST', body: JSON.stringify(input) },
      true
    );
    return unwrapObject<UserSummary>(raw, ['user']);
  },

  async updatePreferences(input: {
    displayName?: string;
    preferredLang?: Language;
    currentPassword?: string;
    newPassword?: string;
  }): Promise<UserSummary> {
    const raw = await requestJson<unknown>('/api/auth/preferences', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return unwrapObject<UserSummary>(raw, ['user']);
  },

  // Web-Push Subscriptions
  async getPushSubscriptions(): Promise<PushSubscriptionSummary[]> {
    const raw = await requestJson<unknown>('/api/push/subscriptions');
    return unwrapArray<PushSubscriptionSummary>(raw, ['subscriptions', 'items', 'data']);
  },

  async registerPushSubscription(input: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    deviceLabel?: string;
  }): Promise<PushSubscriptionSummary> {
    const raw = await requestJson<unknown>('/api/push/subscriptions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrapObject<PushSubscriptionSummary>(raw, ['subscription', 'data']);
  },

  async deletePushSubscription(id: string): Promise<void> {
    await requestJson<unknown>(`/api/push/subscriptions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async sendTestPush(): Promise<{
    sentCount: number;
    failedCount: number;
    removedCount: number;
    lastError: string | null;
  }> {
    const raw = await requestJson<unknown>('/api/push/test', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (isRecord(raw)) {
      return {
        sentCount: typeof raw.sentCount === 'number' ? raw.sentCount : 0,
        failedCount: typeof raw.failedCount === 'number' ? raw.failedCount : 0,
        removedCount: typeof raw.removedCount === 'number' ? raw.removedCount : 0,
        lastError: typeof raw.lastError === 'string' ? raw.lastError : null,
      };
    }
    return { sentCount: 0, failedCount: 0, removedCount: 0, lastError: null };
  },

  // Devices, Preferences, Maintenance, Measurements, Export & Downlinks
  async getDevices(): Promise<DeviceView[]> {
    const raw = await requestJson<unknown>('/api/devices');
    return unwrapArray<DeviceView>(raw, ['devices', 'items', 'data']);
  },

  async updateDevice(
    id: string,
    patch: {
      name?: string;
      categoryId?: string | null;
      sensorProfileId?: string;
      latitude?: number | null;
      longitude?: number | null;
      locationLabel?: string | null;
      config?: DeviceConfig;
    }
  ): Promise<DeviceView> {
    const raw = await requestJson<unknown>(`/api/devices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return unwrapObject<DeviceView>(raw, ['device', 'data']);
  },

  async updateDeviceUserPreference(
    deviceId: string,
    patch: Partial<UserDevicePreference>
  ): Promise<{ device?: DeviceView; preference?: UserDevicePreference }> {
    const raw = await requestJson<unknown>(
      `/api/devices/${encodeURIComponent(deviceId)}/preferences`,
      {
        method: 'PUT',
        body: JSON.stringify(patch),
      }
    );
    if (isRecord(raw)) {
      const device = isRecord(raw.device)
        ? (raw.device as unknown as DeviceView)
        : undefined;
      const prefObj = isRecord(raw.preference)
        ? raw.preference
        : isRecord(raw.userPreference)
          ? raw.userPreference
          : typeof raw.pushEnabled === 'boolean' || typeof raw.isFavorite === 'boolean'
            ? raw
            : undefined;
      return {
        device,
        preference: prefObj ? (prefObj as unknown as UserDevicePreference) : undefined,
      };
    }
    return {};
  },

  async setDeviceMaintenance(
    deviceId: string,
    durationMinutes: number | null
  ): Promise<{ device?: DeviceView; maintenanceUntil?: string | null }> {
    const raw = await requestJson<unknown>(
      `/api/devices/${encodeURIComponent(deviceId)}/maintenance`,
      {
        method: 'POST',
        body: JSON.stringify({ durationMinutes }),
      }
    );
    if (isRecord(raw)) {
      return {
        device: isRecord(raw.device)
          ? (raw.device as unknown as DeviceView)
          : undefined,
        maintenanceUntil:
          typeof raw.maintenanceUntil === 'string' || raw.maintenanceUntil === null
            ? raw.maintenanceUntil
            : undefined,
      };
    }
    return {};
  },

  async getMeasurements(
    deviceId: string,
    range: '24h' | '7d' | '30d'
  ): Promise<MeasurementPoint[]> {
    const raw = await requestJson<unknown>(
      `/api/devices/${encodeURIComponent(deviceId)}/measurements?range=${range}`
    );
    return unwrapArray<MeasurementPoint>(raw, ['measurements', 'points', 'items', 'data']);
  },

  async downloadDeviceExport(
    deviceId: string,
    devEui: string,
    format: 'csv' | 'json'
  ): Promise<void> {
    const res = await fetch(
      `/api/devices/${encodeURIComponent(deviceId)}/export?format=${format}`,
      { credentials: 'same-origin' }
    );
    if (res.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
      throw new ApiError('Unauthorized', 401);
    }
    if (!res.ok) {
      throw new ApiError(`Export failed (HTTP ${res.status})`, res.status);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lorapulse-${devEui.toLowerCase()}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  async queueDownlink(
    deviceId: string,
    intervalMinutes: number
  ): Promise<{ downlink?: DownlinkStatus; device?: DeviceView }> {
    const raw = await requestJson<unknown>(
      `/api/devices/${encodeURIComponent(deviceId)}/downlink`,
      {
        method: 'POST',
        body: JSON.stringify({ intervalMinutes }),
      }
    );
    if (isRecord(raw)) {
      return {
        downlink: isRecord(raw.downlink)
          ? (raw.downlink as unknown as DownlinkStatus)
          : typeof raw.state === 'string'
            ? (raw as unknown as DownlinkStatus)
            : undefined,
        device: isRecord(raw.device) ? (raw.device as unknown as DeviceView) : undefined,
      };
    }
    return {};
  },

  // Alerts
  async getAlerts(): Promise<AlertItem[]> {
    const raw = await requestJson<unknown>('/api/alerts');
    return unwrapArray<AlertItem>(raw, ['alerts', 'items', 'data']);
  },

  async ackAlert(alertId: string): Promise<AlertItem | null> {
    const raw = await requestJson<unknown>(
      `/api/alerts/${encodeURIComponent(alertId)}/ack`,
      { method: 'POST', body: JSON.stringify({}) }
    );
    if (isRecord(raw)) {
      return unwrapObject<AlertItem>(raw, ['alert', 'data']);
    }
    return null;
  },

  // Categories & Profiles
  async getCategories(): Promise<CategoryNode[]> {
    const raw = await requestJson<unknown>('/api/categories');
    return unwrapArray<CategoryNode>(raw, ['categories', 'items', 'data']);
  },

  async createCategory(input: { name: string; parentId: string | null }): Promise<CategoryNode> {
    const raw = await requestJson<unknown>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrapObject<CategoryNode>(raw, ['category', 'data']);
  },

  async deleteCategory(id: string): Promise<void> {
    await requestJson<unknown>(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async getProfiles(): Promise<SensorProfile[]> {
    try {
      const raw = await requestJson<unknown>('/api/profiles');
      const list = unwrapArray<SensorProfile>(raw, ['profiles', 'items', 'data']);
      if (list.length > 0) return list;
    } catch {
      // Fallback to built-in profiles if endpoint is unavailable
    }
    return BUILTIN_SENSOR_PROFILES;
  },

  async saveProfile(profile: Omit<SensorProfile, 'isBuiltIn'>): Promise<SensorProfile> {
    const raw = await requestJson<unknown>('/api/profiles', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
    return unwrapObject<SensorProfile>(raw, ['profile', 'data']);
  },

  async deleteProfile(id: string): Promise<DeletedProfileResult> {
    const raw = await requestJson<unknown>(`/api/profiles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (isRecord(raw)) {
      const count =
        typeof raw.reassignedDevices === 'number'
          ? raw.reassignedDevices
          : typeof raw.affectedDevices === 'number'
            ? raw.affectedDevices
            : typeof raw.migratedCount === 'number'
              ? raw.migratedCount
              : typeof raw.reassignedCount === 'number'
                ? raw.reassignedCount
                : 0;
      return { reassignedDevices: count };
    }
    return { reassignedDevices: 0 };
  },

  // Admin: Users, Groups, Permissions
  async getUsers(): Promise<UserSummary[]> {
    const raw = await requestJson<unknown>('/api/admin/users');
    return unwrapArray<UserSummary>(raw, ['users', 'items', 'data']);
  },

  async inviteUser(input: {
    email: string;
    displayName: string;
    systemRole: 'ADMIN' | 'USER';
    groupIds: string[];
    sendEmail?: boolean;
  }): Promise<CreatedInviteResult> {
    const raw = await requestJson<unknown>('/api/admin/users/invite', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (isRecord(raw)) {
      const token = typeof raw.token === 'string' ? raw.token : undefined;
      const invitePath =
        typeof raw.invitePath === 'string'
          ? raw.invitePath
          : token
            ? `/invite/${token}`
            : '';
      return {
        invitePath,
        token,
        expiresAt: typeof raw.expiresAt === 'string' ? raw.expiresAt : undefined,
        emailSent: raw.emailSent === true,
        user: isRecord(raw.user) ? (raw.user as unknown as UserSummary) : undefined,
      };
    }
    return { invitePath: '' };
  },

  async updateUser(
    id: string,
    patch: {
      isActive?: boolean;
      systemRole?: 'ADMIN' | 'USER';
      groupIds?: string[];
      displayName?: string;
    }
  ): Promise<UserSummary> {
    const raw = await requestJson<unknown>(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return unwrapObject<UserSummary>(raw, ['user', 'data']);
  },

  async getGroups(): Promise<UserGroup[]> {
    const raw = await requestJson<unknown>('/api/admin/groups');
    return unwrapArray<UserGroup>(raw, ['groups', 'items', 'data']);
  },

  async createGroup(input: {
    name: string;
    description: string;
    memberUserIds: string[];
  }): Promise<UserGroup> {
    const raw = await requestJson<unknown>('/api/admin/groups', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrapObject<UserGroup>(raw, ['group', 'data']);
  },

  async deleteGroup(id: string): Promise<void> {
    await requestJson<unknown>(`/api/admin/groups/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async getPermissions(): Promise<PermissionGrant[]> {
    const raw = await requestJson<unknown>('/api/admin/permissions');
    return unwrapArray<PermissionGrant>(raw, ['permissions', 'grants', 'items', 'data']);
  },

  async createPermission(input: {
    userId: string | null;
    groupId: string | null;
    categoryId: string | null;
    deviceId: string | null;
    level: PermissionLevel;
  }): Promise<PermissionGrant> {
    const raw = await requestJson<unknown>('/api/admin/permissions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrapObject<PermissionGrant>(raw, ['permission', 'grant', 'data']);
  },

  async deletePermission(id: string): Promise<void> {
    await requestJson<unknown>(`/api/admin/permissions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  // Super Admin: TTN Apps, SMTP Mail Server, System Control, Audit Logs
  async getTtnApps(): Promise<TtnApplicationSummary[]> {
    const raw = await requestJson<unknown>('/api/super/ttn-apps');
    return unwrapArray<TtnApplicationSummary>(raw, ['ttnApps', 'apps', 'items', 'data']);
  },

  async createTtnApp(input: {
    name: string;
    ttnAppId: string;
    host: string;
    port: number;
    useTls: boolean;
    apiKey: string;
    isEnabled: boolean;
  }): Promise<TtnApplicationSummary> {
    const raw = await requestJson<unknown>('/api/super/ttn-apps', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return unwrapObject<TtnApplicationSummary>(raw, ['app', 'ttnApp', 'data']);
  },

  async reconnectTtnApp(id: string): Promise<void> {
    await requestJson<unknown>(`/api/super/ttn-apps/${encodeURIComponent(id)}/reconnect`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async deleteTtnApp(id: string): Promise<void> {
    await requestJson<unknown>(`/api/super/ttn-apps/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async getSmtpSettings(): Promise<SmtpSettingsSummary> {
    const raw = await requestJson<unknown>('/api/super/smtp');
    return unwrapObject<SmtpSettingsSummary>(raw, ['smtp', 'settings', 'data']);
  },

  async saveSmtpSettings(input: {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password?: string;
    fromEmail: string;
    fromName: string;
    publicBaseUrl: string;
  }): Promise<SmtpSettingsSummary> {
    const raw = await requestJson<unknown>('/api/super/smtp', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return unwrapObject<SmtpSettingsSummary>(raw, ['smtp', 'settings', 'data']);
  },

  async sendTestSmtpEmail(recipientEmail: string): Promise<void> {
    await requestJson<unknown>('/api/super/smtp/test', {
      method: 'POST',
      body: JSON.stringify({ recipientEmail }),
    });
  },

  async triggerSystemAction(input: {
    action: 'reconnect_mqtt' | 'restart_app' | 'reboot_host';
    password: string;
  }): Promise<void> {
    await requestJson<unknown>('/api/super/system/action', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async getAuditLogs(): Promise<AuditLogItem[]> {
    const raw = await requestJson<unknown>('/api/super/audit-logs');
    return unwrapArray<AuditLogItem>(raw, ['auditLogs', 'logs', 'items', 'data']);
  },
};
