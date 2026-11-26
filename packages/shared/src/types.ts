export const APP_VERSION = '0.0.2';
export const GITHUB_REPO_URL = 'https://github.com/LouisOverhoff/LoRaPulse';

export type Language = 'de' | 'en';
export type SystemRole = 'SUPER_ADMIN' | 'ADMIN' | 'USER';
export type PermissionLevel = 'VIEWER' | 'OPERATOR' | 'CATEGORY_ADMIN';
export type EffectiveAccess = 'SUPER_ADMIN' | 'ADMIN' | PermissionLevel;

export const PERMISSION_RANK: Record<PermissionLevel, number> = {
  VIEWER: 1,
  OPERATOR: 2,
  CATEGORY_ADMIN: 3,
};

export interface LocalizedText {
  de: string;
  en: string;
}

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  systemRole: SystemRole;
  preferredLang: Language;
  isActive: boolean;
  mustChangePassword: boolean;
  groupIds: string[];
  createdAt: string;
}

export interface UserGroup {
  id: string;
  name: string;
  description: string;
  memberUserIds: string[];
  createdAt: string;
}

export interface CategoryNode {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  path: string;
  createdAt: string;
}

export interface PermissionGrant {
  id: string;
  userId: string | null;
  groupId: string | null;
  categoryId: string | null;
  deviceId: string | null;
  level: PermissionLevel;
  createdAt: string;
}

export type TtnConnectionStatus = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR';

export interface TtnApplicationSummary {
  id: string;
  name: string;
  ttnAppId: string;
  host: string;
  port: number;
  useTls: boolean;
  maskedApiKey: string;
  isEnabled: boolean;
  connectionStatus: TtnConnectionStatus;
  lastMessageAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export type SensorFieldKind = 'number' | 'contact' | 'battery' | 'counter';
export type SensorIconName = 'door' | 'thermometer' | 'cloud' | 'activity' | 'radio';
export type BatteryChemistry = 'li_socl2_3v6' | 'alkaline_3v0' | 'none';
export type DownlinkCodecType = 'dragino_tdc_port2' | 'none';
export type BatteryHealthState = 'OK' | 'LOW' | 'CRITICAL' | 'UNKNOWN';
export type DeviceHealthStatus = 'OK' | 'ALARM' | 'WARN' | 'OFFLINE' | 'NEW';

export interface SensorFieldDef {
  key: string;
  label: LocalizedText;
  kind: SensorFieldKind;
  unit: string;
  decimals?: number;
  isPrimary?: boolean;
  validMin?: number;
  validMax?: number;
  contactLabels?: {
    closed: LocalizedText;
    open: LocalizedText;
  };
}

export interface SensorProfile {
  id: string;
  name: string;
  localizedName?: LocalizedText;
  brand: string;
  model: string;
  icon: SensorIconName;
  batteryChemistry: BatteryChemistry;
  downlinkIntervalCodec: DownlinkCodecType;
  isBuiltIn: boolean;
  fields: SensorFieldDef[];
}

export interface DeviceConfig {
  invertContact?: boolean;
  customOpenLabel?: LocalizedText;
  customClosedLabel?: LocalizedText;
  alertOnOpen?: boolean;
  tempMinThreshold?: number | null;
  tempMaxThreshold?: number | null;
  expectedIntervalSec?: number;
}

export interface DownlinkStatus {
  intervalMinutes: number;
  fPort: number;
  payloadHex: string;
  state: 'QUEUED' | 'SENT' | 'FAILED';
  queuedAt: string;
  updatedAt: string;
  error?: string;
}

export interface UserDevicePreference {
  pushEnabled: boolean;
  emailEnabled: boolean;
  isFavorite: boolean;
}

export const DEFAULT_USER_DEVICE_PREFERENCE: UserDevicePreference = {
  pushEnabled: true,
  emailEnabled: false,
  isFavorite: false,
};

export interface DeviceView {
  id: string;
  ttnApplicationId: string;
  ttnAppName: string;
  categoryId: string | null;
  categoryBreadcrumb: string[] | null;
  isDirectShareOnly: boolean;
  sensorProfileId: string;
  devEui: string;
  ttnDeviceId: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  locationLabel: string | null;
  config: DeviceConfig;
  latestValues: Record<string, number | string | boolean | null>;
  rawLatestPayload: Record<string, unknown> | null;
  probeErrorFields: string[];
  batteryVoltage: number | null;
  batteryState: BatteryHealthState;
  rssi: number | null;
  snr: number | null;
  spreadingFactor: string | null;
  status: DeviceHealthStatus;
  lastSeenAt: string | null;
  maintenanceUntil: string | null;
  userPreference: UserDevicePreference;
  pendingDownlink: DownlinkStatus | null;
  effectivePermission: EffectiveAccess;
  createdAt: string;
}

export interface MeasurementPoint {
  id: number;
  deviceId: string;
  receivedAt: string;
  fCnt: number | null;
  fPort: number | null;
  rssi: number | null;
  snr: number | null;
  spreadingFactor: string | null;
  payload: Record<string, unknown>;
}

export interface AlertItem {
  id: string;
  deviceId: string;
  deviceName: string;
  alertType: 'CONTACT_TRIGGER' | 'THRESHOLD' | 'OFFLINE' | 'LOW_BATTERY';
  severity: 'ALARM' | 'WARN';
  messageDe: string;
  messageEn: string;
  status: 'OPEN' | 'ACKED' | 'RESOLVED';
  ackedByName: string | null;
  ackedAt: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface PushSubscriptionSummary {
  id: string;
  deviceLabel: string;
  endpointPreview: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface SmtpSettingsSummary {
  configured: boolean;
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  maskedPassword: string;
  fromEmail: string;
  fromName: string;
  publicBaseUrl: string;
  updatedAt: string | null;
}

export interface AuthBootstrapStatus {
  appName: string;
  version: string;
  repoUrl: string;
  needsSetup: boolean;
  demoMode: boolean;
  smtpConfigured: boolean;
  vapidPublicKey: string | null;
  user: UserSummary | null;
}

export type SseEvent =
  | { type: 'connected'; timestamp: string }
  | { type: 'device_updated'; device: DeviceView }
  | { type: 'alert_updated'; alert: AlertItem }
  | { type: 'ttn_status'; app: TtnApplicationSummary }
  | { type: 'permissions_changed' }
  | { type: 'profiles_changed' };
