import {
  Activity,
  CloudSun,
  DoorOpen,
  Radio,
  Thermometer,
} from 'lucide-react';
import type {
  BatteryChemistry,
  BatteryHealthState,
  DeviceHealthStatus,
  Language,
  SensorIconName,
} from '@lorapulse/shared';
import { formatBatteryBadgeText, t } from '../i18n';

export function SensorVectorIcon({
  icon,
  className = 'w-4 h-4',
}: {
  icon: SensorIconName;
  className?: string;
}) {
  const strokeWidth = 1.85;
  switch (icon) {
    case 'door':
      return <DoorOpen className={className} strokeWidth={strokeWidth} />;
    case 'thermometer':
      return <Thermometer className={className} strokeWidth={strokeWidth} />;
    case 'cloud':
      return <CloudSun className={className} strokeWidth={strokeWidth} />;
    case 'activity':
      return <Activity className={className} strokeWidth={strokeWidth} />;
    case 'radio':
    default:
      return <Radio className={className} strokeWidth={strokeWidth} />;
  }
}

export function StatusBadge({
  status,
  lang,
}: {
  status: DeviceHealthStatus;
  lang: Language;
}) {
  const styles: Record<
    DeviceHealthStatus,
    {
      labelKey: 'statusOk' | 'statusAlarm' | 'statusWarn' | 'statusOffline' | 'statusNew';
      dot: string;
      chip: string;
      pulse?: boolean;
    }
  > = {
    OK: {
      labelKey: 'statusOk',
      dot: 'bg-emerald-500',
      chip: 'bg-emerald-500/12 text-emerald-500 border-emerald-500/30',
    },
    ALARM: {
      labelKey: 'statusAlarm',
      dot: 'bg-red-500',
      chip: 'bg-red-500/14 text-red-500 border-red-500/35',
      pulse: true,
    },
    WARN: {
      labelKey: 'statusWarn',
      dot: 'bg-amber-500',
      chip: 'bg-amber-500/14 text-amber-500 border-amber-500/35',
    },
    OFFLINE: {
      labelKey: 'statusOffline',
      dot: 'bg-slate-400',
      chip: 'bg-slate-500/14 text-slate-400 border-slate-500/30',
    },
    NEW: {
      labelKey: 'statusNew',
      dot: 'bg-sky-400',
      chip: 'bg-sky-500/14 text-sky-400 border-sky-500/30',
      pulse: true,
    },
  };

  const cfg = styles[status] ?? styles.OFFLINE;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.chip}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${cfg.pulse ? 'lp-led-pulse' : ''}`}
      />
      {t(lang, cfg.labelKey)}
    </span>
  );
}

export function SignalBars({
  rssi,
  spreadingFactor,
  lang,
  compact = false,
}: {
  rssi: number | null;
  spreadingFactor?: string | null;
  lang: Language;
  compact?: boolean;
}) {
  let activeBars = 0;
  let barColor = 'bg-slate-500/35';

  if (rssi !== null && !Number.isNaN(rssi)) {
    if (rssi >= -85) {
      activeBars = 4;
      barColor = 'bg-emerald-500';
    } else if (rssi >= -100) {
      activeBars = 3;
      barColor = 'bg-emerald-500';
    } else if (rssi >= -112) {
      activeBars = 2;
      barColor = 'bg-amber-500';
    } else {
      activeBars = 1;
      barColor = 'bg-red-500';
    }
  }

  const heights = ['h-1.5', 'h-2.5', 'h-3.5', 'h-4'];

  return (
    <div
      className="inline-flex items-center gap-1.5 text-xs"
      title={
        rssi !== null
          ? `RSSI: ${rssi} dBm${spreadingFactor ? ` | ${spreadingFactor}` : ''}`
          : t(lang, 'noSignal')
      }
    >
      <div className="inline-flex items-end gap-[2px] h-4" aria-hidden="true">
        {heights.map((hClass, idx) => {
          const isLit = idx < activeBars;
          return (
            <span
              key={idx}
              className={`w-[3px] rounded-[1px] transition-colors ${hClass} ${
                isLit ? barColor : 'bg-slate-500/25'
              }`}
            />
          );
        })}
      </div>
      {!compact && (
        <span className="font-mono text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
          {rssi !== null
            ? `${rssi} dBm${spreadingFactor ? ` · ${spreadingFactor}` : ''}`
            : '-- dBm'}
        </span>
      )}
    </div>
  );
}

export function BatteryGauge({
  voltage,
  state,
  chemistry = 'li_socl2_3v6',
  lang,
  compact = false,
}: {
  voltage: number | null;
  state: BatteryHealthState;
  chemistry?: BatteryChemistry;
  lang: Language;
  compact?: boolean;
}) {
  if (chemistry === 'none') {
    return (
      <span className="inline-flex items-center px-1.5 py-[1px] rounded text-[10px] font-bold tracking-wide border bg-slate-500/12 text-[var(--text-secondary)] border-[var(--border-subtle)]">
        {formatBatteryBadgeText('EXT', lang)}
      </span>
    );
  }

  let fillPercent = 0;
  if (voltage !== null && !Number.isNaN(voltage)) {
    if (chemistry === 'li_socl2_3v6') {
      // Li-SOCl2 3.6V: flat plateau 3.55..3.66V, knee around 3.25V, empty at 3.00V
      fillPercent = Math.max(8, Math.min(100, Math.round(((voltage - 3.0) / 0.65) * 100)));
    } else {
      // 3.0V Alkaline: 2.1V..3.05V
      fillPercent = Math.max(8, Math.min(100, Math.round(((voltage - 2.1) / 0.95) * 100)));
    }
  }

  const stateCfg: Record<
    BatteryHealthState,
    { fillHex: string; badgeClass: string }
  > = {
    OK: {
      fillHex: '#10b981',
      badgeClass: 'bg-emerald-500/12 text-emerald-500 border-emerald-500/30',
    },
    LOW: {
      fillHex: '#f59e0b',
      badgeClass: 'bg-amber-500/15 text-amber-500 border-amber-500/35',
    },
    CRITICAL: {
      fillHex: '#ef4444',
      badgeClass: 'bg-red-500/15 text-red-500 border-red-500/35',
    },
    UNKNOWN: {
      fillHex: '#64748b',
      badgeClass: 'bg-slate-500/12 text-slate-400 border-slate-500/25',
    },
  };

  const cfg = stateCfg[state] ?? stateCfg.UNKNOWN;
  const barWidth = Math.round((fillPercent / 100) * 16);
  const formattedVoltage =
    voltage !== null
      ? `${voltage.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} V`
      : '-- V';

  return (
    <div className="inline-flex items-center gap-1.5 text-xs">
      <svg
        width="24"
        height="13"
        viewBox="0 0 24 13"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="1"
          y="1.5"
          width="19"
          height="10"
          rx="2"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="1.4"
        />
        <rect
          x="21"
          y="4.2"
          width="2"
          height="4.6"
          rx="0.8"
          fill="currentColor"
          fillOpacity="0.55"
        />
        {voltage !== null && (
          <rect
            x="2.5"
            y="3"
            width={Math.max(2, barWidth)}
            height="7"
            rx="1"
            fill={cfg.fillHex}
          />
        )}
      </svg>

      {!compact && (
        <span className="font-mono text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
          {formattedVoltage}
        </span>
      )}

      <span
        className={`px-1.5 py-[1px] rounded text-[10px] font-bold tracking-wide border ${cfg.badgeClass}`}
      >
        {formatBatteryBadgeText(state, lang)}
      </span>
    </div>
  );
}
