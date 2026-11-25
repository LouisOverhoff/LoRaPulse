import {
  BUILTIN_SENSOR_PROFILES,
  type DeviceView,
  type EffectiveAccess,
  type Language,
  type SensorFieldDef,
  type SensorProfile,
  type UserSummary,
} from '@lorapulse/shared';
import { t } from '../i18n';

export function resolveProfile(
  profileId: string,
  profiles: SensorProfile[]
): SensorProfile {
  return (
    profiles.find((p) => p.id === profileId) ??
    BUILTIN_SENSOR_PROFILES.find((p) => p.id === profileId) ??
    BUILTIN_SENSOR_PROFILES[BUILTIN_SENSOR_PROFILES.length - 1]
  );
}

export function isSuperAdmin(user: UserSummary | null): boolean {
  return user?.systemRole === 'SUPER_ADMIN';
}

export function isAdminOrSuper(user: UserSummary | null): boolean {
  return user?.systemRole === 'SUPER_ADMIN' || user?.systemRole === 'ADMIN';
}

export function canAckAccess(access: EffectiveAccess | undefined, user: UserSummary | null): boolean {
  if (isAdminOrSuper(user)) return true;
  return (
    access === 'SUPER_ADMIN' ||
    access === 'ADMIN' ||
    access === 'CATEGORY_ADMIN' ||
    access === 'OPERATOR'
  );
}

export function canConfigureDevice(device: DeviceView, user: UserSummary | null): boolean {
  if (isAdminOrSuper(user)) return true;
  return (
    device.effectivePermission === 'SUPER_ADMIN' ||
    device.effectivePermission === 'ADMIN' ||
    device.effectivePermission === 'CATEGORY_ADMIN'
  );
}

export function isContactOpenValue(raw: unknown, invertContact?: boolean): boolean {
  const truthy = raw === 1 || raw === '1' || raw === true || raw === 'OPEN' || raw === 'open';
  return invertContact ? !truthy : truthy;
}

export interface FormattedFieldReading {
  key: string;
  label: string;
  displayValue: string;
  isPrimary: boolean;
  isProbeError: boolean;
  isContactOpen?: boolean;
}

export function isOutlierForField(value: number, field?: SensorFieldDef): boolean {
  if (!Number.isFinite(value)) return true;
  if (value <= -900 || value >= 327.6) {
    // Classic DS18B20 / LoRa probe disconnect sentinel values (-999, 327.67, 6553.5)
    if (field?.validMin !== undefined && value < field.validMin) return true;
    if (field?.validMax !== undefined && value > field.validMax) return true;
    if (value === -999 || value === -999.9) return true;
  }
  if (field?.validMin !== undefined && value < field.validMin) return true;
  if (field?.validMax !== undefined && value > field.validMax) return true;
  return false;
}

export function formatDeviceReadings(
  device: DeviceView,
  profile: SensorProfile,
  lang: Language
): FormattedFieldReading[] {
  const source: Record<string, unknown> = {
    ...(device.rawLatestPayload ?? {}),
    ...(device.latestValues ?? {}),
  };

  if (profile.fields.length === 0) {
    // Generic JSON fallback: render up to 4 scalar keys from payload
    const entries = Object.entries(source).filter(
      ([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean'
    );
    return entries.slice(0, 4).map(([key, val], idx) => ({
      key,
      label: key,
      displayValue: typeof val === 'number' ? String(Math.round(val * 100) / 100) : String(val),
      isPrimary: idx === 0,
      isProbeError: device.probeErrorFields.includes(key),
    }));
  }

  const readings: FormattedFieldReading[] = [];

  for (const field of profile.fields) {
    if (field.kind === 'battery' && profile.fields.length > 1) {
      // Battery is already shown in the dedicated graphical BatteryGauge footer
      continue;
    }

    const rawVal = source[field.key];
    const hasProbeErr =
      device.probeErrorFields.includes(field.key) ||
      (typeof rawVal === 'number' && isOutlierForField(rawVal, field));

    const label = field.label[lang] || field.label.de || field.key;

    if (rawVal === undefined || rawVal === null) {
      readings.push({
        key: field.key,
        label,
        displayValue: '--',
        isPrimary: Boolean(field.isPrimary),
        isProbeError: false,
      });
      continue;
    }

    if (hasProbeErr) {
      readings.push({
        key: field.key,
        label,
        displayValue: t(lang, 'probeErrorShort'),
        isPrimary: Boolean(field.isPrimary),
        isProbeError: true,
      });
      continue;
    }

    if (field.kind === 'contact') {
      const isOpen = isContactOpenValue(rawVal, device.config?.invertContact);
      const openText =
        device.config?.customOpenLabel?.[lang] ||
        field.contactLabels?.open[lang] ||
        (lang === 'de' ? 'Offen' : 'Open');
      const closedText =
        device.config?.customClosedLabel?.[lang] ||
        field.contactLabels?.closed[lang] ||
        (lang === 'de' ? 'Geschlossen' : 'Closed');

      readings.push({
        key: field.key,
        label,
        displayValue: isOpen ? openText : closedText,
        isPrimary: Boolean(field.isPrimary),
        isProbeError: false,
        isContactOpen: isOpen,
      });
      continue;
    }

    const num = typeof rawVal === 'number' ? rawVal : Number(rawVal);
    if (!Number.isNaN(num)) {
      const decimals = field.decimals ?? (field.kind === 'counter' ? 0 : 1);
      const formatted = num.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      readings.push({
        key: field.key,
        label,
        displayValue: field.unit ? `${formatted} ${field.unit}` : formatted,
        isPrimary: Boolean(field.isPrimary),
        isProbeError: false,
      });
    } else {
      readings.push({
        key: field.key,
        label,
        displayValue: String(rawVal),
        isPrimary: Boolean(field.isPrimary),
        isProbeError: false,
      });
    }
  }

  return readings;
}

export function getPrimaryPinText(
  device: DeviceView,
  profile: SensorProfile,
  lang: Language
): string {
  if (!device.lastSeenAt && Object.keys(device.latestValues ?? {}).length === 0) {
    return device.name.slice(0, 14);
  }
  const readings = formatDeviceReadings(device, profile, lang);
  const primary = readings.find((r) => r.isPrimary) ?? readings[0];
  if (!primary || primary.displayValue === '--') {
    return device.name.slice(0, 14);
  }
  return primary.displayValue;
}

export function formatRelativeTime(iso: string | null | undefined, lang: Language): string {
  if (!iso) return t(lang, 'waitingFirstPacket');
  const ts = Date.parse(iso);
  if (Number.isNaN(ts) || ts <= 0) return t(lang, 'waitingFirstPacket');

  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return t(lang, 'justNow');
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return t(lang, 'minutesAgo', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 48) return t(lang, 'hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  return t(lang, 'daysAgo', { n: days });
}

export function formatDateTime(iso: string | null | undefined, lang: Language): string {
  if (!iso) return '--';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts) || ts <= 0) return '--';
  return new Date(ts).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function statusColorHex(status: DeviceView['status']): string {
  switch (status) {
    case 'ALARM':
      return '#ef4444';
    case 'WARN':
      return '#f59e0b';
    case 'OK':
      return '#10b981';
    case 'NEW':
      return '#38bdf8';
    case 'OFFLINE':
    default:
      return '#64748b';
  }
}
