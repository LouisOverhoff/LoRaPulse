import {
  AlertTriangle,
  Clock,
  Folder,
  Inbox,
  Link2,
  MapPin,
} from 'lucide-react';
import type { DeviceView, Language, SensorProfile } from '@lorapulse/shared';
import { t } from '../i18n';
import {
  formatDeviceReadings,
  formatRelativeTime,
} from '../utils/telemetry';
import {
  BatteryGauge,
  SensorVectorIcon,
  SignalBars,
  StatusBadge,
} from './TelemetryIndicators';

export function DeviceCard({
  device,
  profile,
  lang,
  onClick,
}: {
  device: DeviceView;
  profile: SensorProfile;
  lang: Language;
  onClick?: () => void;
}) {
  const readings = formatDeviceReadings(device, profile, lang);
  const primaryReading = readings.find((r) => r.isPrimary) ?? readings[0] ?? null;
  const secondaryReadings = readings.filter((r) => r !== primaryReading).slice(0, 3);
  const hasAnyPacket =
    Boolean(device.lastSeenAt) || Object.keys(device.latestValues ?? {}).length > 0;
  const hasProbeError =
    device.probeErrorFields.length > 0 || readings.some((r) => r.isProbeError);

  const edgeColor: Record<DeviceView['status'], string> = {
    OK: 'border-l-emerald-500',
    ALARM: 'border-l-red-500',
    WARN: 'border-l-amber-500',
    OFFLINE: 'border-l-slate-500',
    NEW: 'border-l-sky-400',
  };

  return (
    <article
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`lp-surface rounded-xl border-l-4 ${
        edgeColor[device.status] ?? 'border-l-slate-500'
      } p-4 flex flex-col justify-between gap-3.5 transition-colors ${
        onClick ? 'cursor-pointer hover:border-[var(--border-strong)]' : ''
      } ${device.status === 'OFFLINE' ? 'opacity-90' : ''}`}
    >
      {/* Top row: Category / Share badge + Status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)] mb-1 truncate">
            {device.isDirectShareOnly ? (
              <>
                <Link2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" strokeWidth={1.85} />
                <span className="truncate">{t(lang, 'directShare')}</span>
              </>
            ) : device.categoryBreadcrumb && device.categoryBreadcrumb.length > 0 ? (
              <>
                <Folder className="w-3.5 h-3.5 shrink-0" strokeWidth={1.85} />
                <span className="truncate">{device.categoryBreadcrumb.join(' / ')}</span>
              </>
            ) : (
              <>
                <Inbox className="w-3.5 h-3.5 shrink-0" strokeWidth={1.85} />
                <span className="truncate">{t(lang, 'uncategorized')}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
              <SensorVectorIcon icon={profile.icon} className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-[var(--text-primary)] truncate">
                {device.name}
              </h3>
              <p className="font-mono text-[11px] text-[var(--text-muted)] truncate">
                {device.devEui}
                {device.locationLabel ? ` · ${device.locationLabel}` : ''}
              </p>
            </div>
          </div>
        </div>

        <StatusBadge status={device.status} lang={lang} />
      </div>

      {/* Primary & secondary telemetry values */}
      <div className="lp-elevated rounded-lg px-3 py-2.5">
        {!hasAnyPacket ? (
          <div className="text-xs text-[var(--text-secondary)] py-1.5 flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-400 shrink-0" strokeWidth={1.85} />
            <span>{t(lang, 'waitingFirstPacket')}</span>
          </div>
        ) : primaryReading ? (
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div>
              <div className="text-[11px] text-[var(--text-muted)]">{primaryReading.label}</div>
              <div
                className={`text-xl font-bold tracking-tight ${
                  primaryReading.isProbeError
                    ? 'text-amber-500'
                    : primaryReading.isContactOpen === true
                      ? 'text-red-500'
                      : primaryReading.isContactOpen === false
                        ? 'text-emerald-500'
                        : 'text-[var(--text-primary)]'
                }`}
              >
                {primaryReading.displayValue}
              </div>
            </div>

            {secondaryReadings.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap justify-end">
                {secondaryReadings.map((sec) => (
                  <div key={sec.key} className="text-right">
                    <div className="text-[10px] text-[var(--text-muted)]">{sec.label}</div>
                    <div
                      className={`text-xs font-semibold font-mono ${
                        sec.isProbeError ? 'text-amber-500' : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {sec.displayValue}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-[var(--text-secondary)] py-1">--</div>
        )}
      </div>

      {/* Special condition banners: Probe Error, Stale Offline, Pending Class-A Downlink */}
      {(hasProbeError ||
        device.status === 'OFFLINE' ||
        device.pendingDownlink?.state === 'QUEUED' ||
        device.pendingDownlink?.state === 'FAILED') && (
        <div className="flex flex-col gap-1.5">
          {hasProbeError && (
            <div className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-amber-500/12 text-amber-500 border border-amber-500/30">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.9} />
              <span className="truncate">{t(lang, 'probeErrorNotice')}</span>
            </div>
          )}

          {device.status === 'OFFLINE' && hasAnyPacket && (
            <div className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-slate-500/12 text-[var(--text-secondary)] border border-[var(--border-subtle)]">
              <Clock className="w-3.5 h-3.5 shrink-0" strokeWidth={1.85} />
              <span className="truncate">{t(lang, 'staleDataNotice')}</span>
            </div>
          )}

          {device.pendingDownlink?.state === 'QUEUED' && (
            <div className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-sky-500/12 text-sky-400 border border-sky-500/30">
              <Clock className="w-3.5 h-3.5 shrink-0" strokeWidth={1.85} />
              <span className="truncate">
                {t(lang, 'pendingDownlinkQueued')} ({device.pendingDownlink.intervalMinutes} min)
              </span>
            </div>
          )}

          {device.pendingDownlink?.state === 'FAILED' && (
            <div className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-red-500/12 text-red-500 border border-red-500/30">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={1.85} />
              <span className="truncate">{t(lang, 'pendingDownlinkFailed')}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer: RF Signal + Battery + GPS indicator + Timestamp */}
      <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <SignalBars
            rssi={device.rssi}
            spreadingFactor={device.spreadingFactor}
            lang={lang}
          />
          <BatteryGauge
            voltage={device.batteryVoltage}
            state={device.batteryState}
            chemistry={profile.batteryChemistry}
          />
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          {device.latitude !== null && device.longitude !== null && (
            <MapPin
              className="w-3.5 h-3.5 text-[var(--accent)] shrink-0"
              strokeWidth={1.85}
            />
          )}
          <span>{formatRelativeTime(device.lastSeenAt, lang)}</span>
        </div>
      </div>
    </article>
  );
}
