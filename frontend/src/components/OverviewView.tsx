import { useState } from 'react';
import {
  AlertTriangle,
  BatteryWarning,
  BellRing,
  CheckCircle2,
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
import { t } from '../i18n';
import {
  canAckAccess,
  formatDateTime,
  resolveProfile,
} from '../utils/telemetry';
import { DeviceCard } from './DeviceCard';

export function OverviewView({
  devices,
  alerts,
  profiles,
  user,
  lang,
  onSelectDevice,
  onAckAlert,
}: {
  devices: DeviceView[];
  alerts: AlertItem[];
  profiles: SensorProfile[];
  user: UserSummary;
  lang: Language;
  onSelectDevice: (device: DeviceView) => void;
  onAckAlert: (alertId: string) => Promise<void>;
}) {
  const [ackingId, setAckingId] = useState<string | null>(null);

  const openAlerts = alerts.filter((a) => a.status === 'OPEN');
  const warnOrLowBatCount = devices.filter(
    (d) =>
      d.status === 'WARN' ||
      d.status === 'OFFLINE' ||
      d.batteryState === 'LOW' ||
      d.batteryState === 'CRITICAL'
  ).length;
  const geoCount = devices.filter(
    (d) => d.latitude !== null && d.longitude !== null
  ).length;

  async function handleAck(id: string) {
    setAckingId(id);
    try {
      await onAckAlert(id);
    } finally {
      setAckingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="lp-surface rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-[var(--text-secondary)]">
              {t(lang, 'kpiVisibleSensors')}
            </div>
            <div className="text-2xl font-bold mt-1">{devices.length}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5" strokeWidth={1.85} />
          </div>
        </div>

        <div className="lp-surface rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-[var(--text-secondary)]">
              {t(lang, 'kpiOpenAlerts')}
            </div>
            <div
              className={`text-2xl font-bold mt-1 ${
                openAlerts.length > 0 ? 'text-red-500' : ''
              }`}
            >
              {openAlerts.length}
            </div>
          </div>
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              openAlerts.length > 0
                ? 'bg-red-500/15 text-red-500'
                : 'bg-slate-500/12 text-[var(--text-muted)]'
            }`}
          >
            <BellRing className="w-5 h-5" strokeWidth={1.85} />
          </div>
        </div>

        <div className="lp-surface rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-[var(--text-secondary)]">
              {t(lang, 'kpiWarningsBattery')}
            </div>
            <div
              className={`text-2xl font-bold mt-1 ${
                warnOrLowBatCount > 0 ? 'text-amber-500' : ''
              }`}
            >
              {warnOrLowBatCount}
            </div>
          </div>
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              warnOrLowBatCount > 0
                ? 'bg-amber-500/15 text-amber-500'
                : 'bg-slate-500/12 text-[var(--text-muted)]'
            }`}
          >
            <BatteryWarning className="w-5 h-5" strokeWidth={1.85} />
          </div>
        </div>

        <div className="lp-surface rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-[var(--text-secondary)]">
              {t(lang, 'kpiGeoreferenced')}
            </div>
            <div className="text-2xl font-bold mt-1">
              {geoCount}
              <span className="text-sm font-normal text-[var(--text-muted)]">
                {' '}
                / {devices.length}
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-500/12 text-sky-400 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5" strokeWidth={1.85} />
          </div>
        </div>
      </section>

      {/* Open Alerts Panel */}
      {openAlerts.length > 0 && (
        <section className="space-y-2.5">
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
                  } p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                          isAlarm
                            ? 'bg-red-500/15 text-red-500 border border-red-500/30'
                            : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                        }`}
                      >
                        {alert.alertType}
                      </span>
                      <button
                        type="button"
                        onClick={() => targetDevice && onSelectDevice(targetDevice)}
                        className="font-semibold text-sm text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors text-left"
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
        </section>
      )}

      {/* Special Case: 0 Visible Sensors */}
      {devices.length === 0 ? (
        <section className="lp-surface rounded-2xl p-8 sm:p-12 text-center max-w-xl mx-auto my-6">
          <div className="w-12 h-12 rounded-2xl bg-slate-500/12 border border-[var(--border-subtle)] flex items-center justify-center mx-auto mb-4 text-[var(--text-secondary)]">
            <Lock className="w-6 h-6" strokeWidth={1.85} />
          </div>
          <h2 className="text-base font-bold mb-2">{t(lang, 'emptySensorsTitle')}</h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            {t(lang, 'emptySensorsDesc')}
          </p>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-tight">
              {t(lang, 'allSensorsSection')}
            </h2>
            <span className="text-xs text-[var(--text-muted)]">
              {t(lang, 'sensorsCountBadge', { n: devices.length })}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {devices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                profile={resolveProfile(device.sensorProfileId, profiles)}
                lang={lang}
                onClick={() => onSelectDevice(device)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
