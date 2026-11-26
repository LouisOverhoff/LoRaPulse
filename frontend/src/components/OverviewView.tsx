import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BatteryWarning,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Grid2x2,
  LayoutGrid,
  Lock,
  MapPin,
  Radio,
} from 'lucide-react';
import type {
  AlertItem,
  DeviceView,
  Language,
  SensorProfile,
  UserSummary,
} from '@lorapulse/shared';
import { formatAlertTypeLabel, t } from '../i18n';
import {
  canAckAccess,
  formatDateTime,
  resolveProfile,
} from '../utils/telemetry';
import { DeviceCard } from './DeviceCard';

function getOverviewPriorityBucket(d: DeviceView): number {
  if (d.status === 'ALARM') return 0;
  if (d.userPreference?.isFavorite) return 1;
  if (d.status === 'WARN' || d.status === 'OFFLINE') return 2;
  return 3;
}

export function OverviewView({
  devices,
  alerts,
  profiles,
  user,
  lang,
  compactMode = false,
  onToggleCompactMode,
  onSelectDevice,
  onAckAlert,
  onToggleFavorite,
}: {
  devices: DeviceView[];
  alerts: AlertItem[];
  profiles: SensorProfile[];
  user: UserSummary;
  lang: Language;
  compactMode?: boolean;
  onToggleCompactMode?: (compact: boolean) => void;
  onSelectDevice: (device: DeviceView) => void;
  onAckAlert: (alertId: string) => Promise<void>;
  onToggleFavorite: (device: DeviceView) => void;
}) {
  const [ackingId, setAckingId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const openAlerts = useMemo(
    () => alerts.filter((a) => a.status === 'OPEN'),
    [alerts]
  );

  const resolvedAlerts = useMemo(
    () => alerts.filter((a) => a.status === 'RESOLVED').slice(0, 8),
    [alerts]
  );

  const warnOrLowBatCount = useMemo(
    () =>
      devices.filter(
        (d) =>
          d.status === 'WARN' ||
          d.status === 'OFFLINE' ||
          d.batteryState === 'LOW' ||
          d.batteryState === 'CRITICAL'
      ).length,
    [devices]
  );

  const geoCount = useMemo(
    () => devices.filter((d) => d.latitude !== null && d.longitude !== null).length,
    [devices]
  );

  // Idea D: Smart Overview Sorting (1. ALARM -> 2. Favorite -> 3. WARN/OFFLINE -> 4. Alphabetical)
  const sortedDevices = useMemo(() => {
    return [...devices].sort((a, b) => {
      const bucketDiff = getOverviewPriorityBucket(a) - getOverviewPriorityBucket(b);
      if (bucketDiff !== 0) return bucketDiff;
      const favDiff =
        (b.userPreference?.isFavorite ? 1 : 0) - (a.userPreference?.isFavorite ? 1 : 0);
      if (favDiff !== 0) return favDiff;
      return a.name.localeCompare(b.name, lang === 'de' ? 'de' : 'en');
    });
  }, [devices, lang]);

  async function handleAck(id: string) {
    setAckingId(id);
    try {
      await onAckAlert(id);
    } finally {
      setAckingId(null);
    }
  }

  return (
    <div className={compactMode ? 'space-y-3' : 'space-y-4'}>
      {/* Cohesive KPI Status Bar (ultra-slim in compact mode for maximum sensor count on screen) */}
      {compactMode ? (
        <section className="grid grid-cols-4 gap-1.5 sm:gap-2">
          <div className="lp-surface rounded-lg px-2.5 py-1.5">
            <div className="text-[10px] text-[var(--text-muted)] truncate">
              {t(lang, 'kpiVisibleSensors')}
            </div>
            <div className="text-base font-bold leading-tight">{devices.length}</div>
          </div>
          <div className="lp-surface rounded-lg px-2.5 py-1.5">
            <div className="text-[10px] text-[var(--text-muted)] truncate">
              {t(lang, 'kpiOpenAlerts')}
            </div>
            <div
              className={`text-base font-bold leading-tight ${
                openAlerts.length > 0 ? 'text-red-500' : ''
              }`}
            >
              {openAlerts.length}
            </div>
          </div>
          <div className="lp-surface rounded-lg px-2.5 py-1.5">
            <div className="text-[10px] text-[var(--text-muted)] truncate">
              {t(lang, 'kpiWarningsBattery')}
            </div>
            <div
              className={`text-base font-bold leading-tight ${
                warnOrLowBatCount > 0 ? 'text-amber-500' : ''
              }`}
            >
              {warnOrLowBatCount}
            </div>
          </div>
          <div className="lp-surface rounded-lg px-2.5 py-1.5">
            <div className="text-[10px] text-[var(--text-muted)] truncate">
              {t(lang, 'kpiGeoreferenced')}
            </div>
            <div className="text-base font-bold leading-tight">
              {geoCount}
              <span className="text-[10px] font-normal text-[var(--text-muted)]">
                /{devices.length}
              </span>
            </div>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="lp-surface rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2.5">
            <div>
              <div className="text-[11px] text-[var(--text-secondary)]">
                {t(lang, 'kpiVisibleSensors')}
              </div>
              <div className="text-xl font-bold leading-tight mt-0.5">{devices.length}</div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4" strokeWidth={1.9} />
            </div>
          </div>

          <div className="lp-surface rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2.5">
            <div>
              <div className="text-[11px] text-[var(--text-secondary)]">
                {t(lang, 'kpiOpenAlerts')}
              </div>
              <div
                className={`text-xl font-bold leading-tight mt-0.5 ${
                  openAlerts.length > 0 ? 'text-red-500' : ''
                }`}
              >
                {openAlerts.length}
              </div>
            </div>
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                openAlerts.length > 0
                  ? 'bg-red-500/15 text-red-500'
                  : 'bg-slate-500/12 text-[var(--text-muted)]'
              }`}
            >
              <BellRing className="w-4 h-4" strokeWidth={1.9} />
            </div>
          </div>

          <div className="lp-surface rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2.5">
            <div>
              <div className="text-[11px] text-[var(--text-secondary)]">
                {t(lang, 'kpiWarningsBattery')}
              </div>
              <div
                className={`text-xl font-bold leading-tight mt-0.5 ${
                  warnOrLowBatCount > 0 ? 'text-amber-500' : ''
                }`}
              >
                {warnOrLowBatCount}
              </div>
            </div>
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                warnOrLowBatCount > 0
                  ? 'bg-amber-500/15 text-amber-500'
                  : 'bg-slate-500/12 text-[var(--text-muted)]'
              }`}
            >
              <BatteryWarning className="w-4 h-4" strokeWidth={1.9} />
            </div>
          </div>

          <div className="lp-surface rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2.5">
            <div>
              <div className="text-[11px] text-[var(--text-secondary)]">
                {t(lang, 'kpiGeoreferenced')}
              </div>
              <div className="text-xl font-bold leading-tight mt-0.5">
                {geoCount}
                <span className="text-xs font-normal text-[var(--text-muted)]">
                  {' '}
                  / {devices.length}
                </span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-lg bg-sky-500/12 text-sky-400 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4" strokeWidth={1.9} />
            </div>
          </div>
        </section>
      )}

      {/* Active Open Alerts + Collapsible Auto-Resolved Alerts (Idea B) */}
      {(openAlerts.length > 0 || resolvedAlerts.length > 0) && (
        <section className="space-y-2">
          {openAlerts.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" strokeWidth={1.9} />
                <h2 className="text-sm font-bold tracking-tight">
                  {t(lang, 'openAlertsTitle')} ({openAlerts.length})
                </h2>
              </div>

              <div className="space-y-2">
                {openAlerts.map((alert) => {
                  const targetDevice = devices.find((d) => d.id === alert.deviceId);
                  const userCanAck = canAckAccess(targetDevice?.effectivePermission, user);
                  const isAlarm = alert.severity === 'ALARM';

                  return (
                    <div
                      key={alert.id}
                      className={`lp-surface rounded-xl border-l-4 ${
                        isAlarm ? 'border-l-red-500' : 'border-l-amber-500'
                      } p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
                              isAlarm
                                ? 'bg-red-500/15 text-red-500 border border-red-500/30'
                                : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                            }`}
                          >
                            {formatAlertTypeLabel(alert.alertType, lang)}
                          </span>
                          <button
                            type="button"
                            onClick={() => targetDevice && onSelectDevice(targetDevice)}
                            className="font-semibold text-sm text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors text-left cursor-pointer"
                          >
                            {alert.deviceName}
                          </button>
                          <span className="text-[11px] text-[var(--text-muted)] font-mono">
                            {formatDateTime(alert.createdAt, lang)}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">
                          {lang === 'de' ? alert.messageDe : alert.messageEn}
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {userCanAck ? (
                          <button
                            type="button"
                            disabled={ackingId === alert.id}
                            onClick={() => handleAck(alert.id)}
                            className="lp-btn-secondary !py-1.5 !px-3 text-xs"
                          >
                            <CheckCircle2
                              className="w-3.5 h-3.5 text-emerald-500"
                              strokeWidth={1.9}
                            />
                            {ackingId === alert.id
                              ? t(lang, 'ackingAlert')
                              : t(lang, 'ackAlert')}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-[var(--text-muted)] bg-slate-500/10 border border-[var(--border-subtle)]">
                            <Lock className="w-3 h-3" strokeWidth={1.85} />
                            {t(lang, 'viewerReadOnlyBadge')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {resolvedAlerts.length > 0 && (
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => setShowResolved((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" strokeWidth={1.9} />
                <span>
                  {t(lang, 'resolvedAlertsToggle', { n: resolvedAlerts.length })}
                </span>
                {showResolved ? (
                  <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.85} />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.85} />
                )}
              </button>

              {showResolved && (
                <div className="mt-2 space-y-1.5">
                  {resolvedAlerts.map((alert) => {
                    const targetDevice = devices.find((d) => d.id === alert.deviceId);
                    return (
                      <div
                        key={alert.id}
                        className="lp-elevated rounded-xl px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs opacity-85"
                      >
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/12 text-emerald-500 border border-emerald-500/25">
                            {t(lang, 'alertResolvedBadge')}
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)]">
                            {formatAlertTypeLabel(alert.alertType, lang)}
                          </span>
                          <button
                            type="button"
                            onClick={() => targetDevice && onSelectDevice(targetDevice)}
                            className="font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors cursor-pointer"
                          >
                            {alert.deviceName}
                          </button>
                          <span className="text-[var(--text-secondary)] truncate">
                            {lang === 'de' ? alert.messageDe : alert.messageEn}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-[var(--text-muted)] shrink-0">
                          {formatDateTime(alert.resolvedAt ?? alert.createdAt, lang)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Special Case: 0 Visible Sensors */}
      {sortedDevices.length === 0 ? (
        <section className="lp-surface rounded-2xl p-8 sm:p-10 text-center max-w-xl mx-auto my-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-500/12 border border-[var(--border-subtle)] flex items-center justify-center mx-auto mb-3.5 text-[var(--text-secondary)]">
            <Lock className="w-6 h-6" strokeWidth={1.85} />
          </div>
          <h2 className="text-base font-bold mb-1.5">{t(lang, 'emptySensorsTitle')}</h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            {t(lang, 'emptySensorsDesc')}
          </p>
        </section>
      ) : (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-bold tracking-tight">
                {t(lang, 'allSensorsSection')}
              </h2>
              <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">
                {t(lang, 'overviewSortHint')} ·{' '}
                {t(lang, 'sensorsCountBadge', { n: sortedDevices.length })}
              </span>
            </div>

            {onToggleCompactMode && (
              <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-0.5">
                <button
                  type="button"
                  onClick={() => onToggleCompactMode(false)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                    !compactMode
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <LayoutGrid className="w-3 h-3" strokeWidth={1.9} />
                  {t(lang, 'layoutStandard')}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleCompactMode(true)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                    compactMode
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Grid2x2 className="w-3 h-3" strokeWidth={1.9} />
                  {t(lang, 'layoutCompact')}
                </button>
              </div>
            )}
          </div>

          <div
            className={
              compactMode
                ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2'
                : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5'
            }
          >
            {sortedDevices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                profile={resolveProfile(device.sensorProfileId, profiles)}
                lang={lang}
                compact={compactMode}
                onClick={() => onSelectDevice(device)}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
