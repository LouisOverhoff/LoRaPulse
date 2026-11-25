import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  Clock,
  Download,
  LocateFixed,
  Lock,
  Save,
  Send,
  Settings2,
  X,
} from 'lucide-react';
import {
  encodeDraginoTdcDownlink,
  type CategoryNode,
  type DeviceView,
  type Language,
  type MeasurementPoint,
  type SensorFieldDef,
  type SensorProfile,
  type UserSummary,
} from '@lorapulse/shared';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import {
  canConfigureDevice,
  formatDateTime,
  formatDeviceReadings,
  isContactOpenValue,
  isOutlierForField,
  isSuperAdmin,
  resolveProfile,
} from '../utils/telemetry';
import {
  BatteryGauge,
  SensorVectorIcon,
  SignalBars,
  StatusBadge,
} from './TelemetryIndicators';

export function SensorDetailModal({
  device,
  categories,
  profiles,
  user,
  lang,
  onClose,
  onDeviceUpdated,
  onNotify,
}: {
  device: DeviceView;
  categories: CategoryNode[];
  profiles: SensorProfile[];
  user: UserSummary;
  lang: Language;
  onClose: () => void;
  onDeviceUpdated: (updated: DeviceView) => void;
  onNotify: (msg: string, kind?: 'info' | 'error') => void;
}) {
  const profile = useMemo(
    () => resolveProfile(device.sensorProfileId, profiles),
    [device.sensorProfileId, profiles]
  );

  const [activeTab, setActiveTab] = useState<'telemetry' | 'config' | 'downlink'>(
    'telemetry'
  );
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [points, setPoints] = useState<MeasurementPoint[]>([]);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [selectedFieldKey, setSelectedFieldKey] = useState<string>('');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);

  // Config form state
  const [cfgName, setCfgName] = useState(device.name);
  const [cfgCategoryId, setCfgCategoryId] = useState<string>(device.categoryId ?? '');
  const [cfgProfileId, setCfgProfileId] = useState<string>(device.sensorProfileId);
  const [cfgLocLabel, setCfgLocLabel] = useState<string>(device.locationLabel ?? '');
  const [cfgLat, setCfgLat] = useState<string>(
    device.latitude !== null ? String(device.latitude) : ''
  );
  const [cfgLng, setCfgLng] = useState<string>(
    device.longitude !== null ? String(device.longitude) : ''
  );
  const [cfgInvertContact, setCfgInvertContact] = useState<boolean>(
    Boolean(device.config?.invertContact)
  );
  const [cfgAlertOnOpen, setCfgAlertOnOpen] = useState<boolean>(
    device.config?.alertOnOpen !== false
  );
  const [cfgTempMin, setCfgTempMin] = useState<string>(
    device.config?.tempMinThreshold !== undefined &&
      device.config?.tempMinThreshold !== null
      ? String(device.config.tempMinThreshold)
      : ''
  );
  const [cfgTempMax, setCfgTempMax] = useState<string>(
    device.config?.tempMaxThreshold !== undefined &&
      device.config?.tempMaxThreshold !== null
      ? String(device.config.tempMaxThreshold)
      : ''
  );
  const [cfgExpectedMin, setCfgExpectedMin] = useState<string>(
    device.config?.expectedIntervalSec
      ? String(Math.round(device.config.expectedIntervalSec / 60))
      : '60'
  );
  const [savingCfg, setSavingCfg] = useState(false);

  // Downlink form state
  const [dlMinutes, setDlMinutes] = useState<number>(
    device.pendingDownlink?.intervalMinutes ?? 20
  );
  const [sendingDl, setSendingDl] = useState(false);

  // Sync config fields if device prop updates
  useEffect(() => {
    setCfgName(device.name);
    setCfgCategoryId(device.categoryId ?? '');
    setCfgProfileId(device.sensorProfileId);
    setCfgLocLabel(device.locationLabel ?? '');
    setCfgLat(device.latitude !== null ? String(device.latitude) : '');
    setCfgLng(device.longitude !== null ? String(device.longitude) : '');
    setCfgInvertContact(Boolean(device.config?.invertContact));
    setCfgAlertOnOpen(device.config?.alertOnOpen !== false);
    setCfgTempMin(
      device.config?.tempMinThreshold !== undefined &&
        device.config?.tempMinThreshold !== null
        ? String(device.config.tempMinThreshold)
        : ''
    );
    setCfgTempMax(
      device.config?.tempMaxThreshold !== undefined &&
        device.config?.tempMaxThreshold !== null
        ? String(device.config.tempMaxThreshold)
        : ''
    );
  }, [device.id]);

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Load historical measurements
  useEffect(() => {
    let active = true;
    setLoadingPoints(true);
    setHoverIdx(null);
    api
      .getMeasurements(device.id, range)
      .then((res) => {
        if (!active) return;
        const sorted = [...res].sort(
          (a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt)
        );
        setPoints(sorted);
      })
      .catch(() => {
        if (active) setPoints([]);
      })
      .finally(() => {
        if (active) setLoadingPoints(false);
      });
    return () => {
      active = false;
    };
  }, [device.id, range]);

  // Determine available numeric/contact fields for chart
  const chartableFields = useMemo<SensorFieldDef[]>(() => {
    if (profile.fields.length > 0) {
      return profile.fields;
    }
    const keys = new Set<string>();
    for (const [k, v] of Object.entries(device.latestValues ?? {})) {
      if (typeof v === 'number' || typeof v === 'boolean') keys.add(k);
    }
    for (const pt of points.slice(-10)) {
      for (const [k, v] of Object.entries(pt.payload ?? {})) {
        if (typeof v === 'number' || typeof v === 'boolean') keys.add(k);
      }
    }
    return Array.from(keys).map((k) => ({
      key: k,
      label: { de: k, en: k },
      kind: 'number',
      unit: '',
    }));
  }, [profile, device.latestValues, points]);

  useEffect(() => {
    if (
      chartableFields.length > 0 &&
      !chartableFields.some((f) => f.key === selectedFieldKey)
    ) {
      const primary =
        chartableFields.find((f) => f.isPrimary) ?? chartableFields[0];
      setSelectedFieldKey(primary.key);
    }
  }, [chartableFields, selectedFieldKey]);

  const activeField = useMemo(
    () => chartableFields.find((f) => f.key === selectedFieldKey) ?? null,
    [chartableFields, selectedFieldKey]
  );

  // Extract clean time-series + filter probe-error outliers (-999 / 327.67)
  const chartSeries = useMemo(() => {
    if (!activeField) return { valid: [], outlierCount: 0 };
    const valid: { ts: number; iso: string; val: number }[] = [];
    let outlierCount = 0;

    for (const pt of points) {
      const raw = pt.payload?.[activeField.key];
      if (raw === undefined || raw === null) continue;
      const ts = Date.parse(pt.receivedAt);
      if (Number.isNaN(ts)) continue;

      if (activeField.kind === 'contact') {
        const isOpen = isContactOpenValue(raw, device.config?.invertContact);
        valid.push({ ts, iso: pt.receivedAt, val: isOpen ? 1 : 0 });
        continue;
      }

      const num = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isNaN(num)) continue;

      if (isOutlierForField(num, activeField)) {
        outlierCount += 1;
        continue;
      }
      valid.push({ ts, iso: pt.receivedAt, val: num });
    }

    return { valid, outlierCount };
  }, [points, activeField, device.config?.invertContact]);

  const stats = useMemo(() => {
    const vals = chartSeries.valid.map((p) => p.val);
    if (vals.length === 0) return null;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { min, max, avg, count: vals.length };
  }, [chartSeries]);

  const canEdit = canConfigureDevice(device, user);
  const superAdmin = isSuperAdmin(user);
  const readings = formatDeviceReadings(device, profile, lang);

  async function handleExport(format: 'csv' | 'json') {
    setExporting(format);
    try {
      await api.downloadDeviceExport(device.id, device.devEui, format);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setExporting(null);
    }
  }

  function handleFillBrowserGps() {
    if (!navigator.geolocation) {
      onNotify(t(lang, 'mapGpsUnsupported'), 'error');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCfgLat(String(Math.round(pos.coords.latitude * 1000000) / 1000000));
        setCfgLng(String(Math.round(pos.coords.longitude * 1000000) / 1000000));
      },
      () => onNotify(t(lang, 'mapGpsError'), 'error'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleSaveConfig(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSavingCfg(true);
    try {
      const latNum = cfgLat.trim() === '' ? null : Number(cfgLat);
      const lngNum = cfgLng.trim() === '' ? null : Number(cfgLng);
      const minNum = cfgTempMin.trim() === '' ? null : Number(cfgTempMin);
      const maxNum = cfgTempMax.trim() === '' ? null : Number(cfgTempMax);
      const expSec = Math.max(60, Math.round((Number(cfgExpectedMin) || 60) * 60));

      const updated = await api.updateDevice(device.id, {
        name: cfgName.trim(),
        categoryId: cfgCategoryId === '' ? null : cfgCategoryId,
        sensorProfileId: cfgProfileId,
        locationLabel: cfgLocLabel.trim() || null,
        latitude: latNum !== null && !Number.isNaN(latNum) ? latNum : null,
        longitude: lngNum !== null && !Number.isNaN(lngNum) ? lngNum : null,
        config: {
          ...device.config,
          invertContact: cfgInvertContact,
          alertOnOpen: cfgAlertOnOpen,
          tempMinThreshold: minNum !== null && !Number.isNaN(minNum) ? minNum : null,
          tempMaxThreshold: maxNum !== null && !Number.isNaN(maxNum) ? maxNum : null,
          expectedIntervalSec: expSec,
        },
      });
      onDeviceUpdated(updated);
      onNotify(t(lang, 'savedSuccess'), 'info');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : String(err), 'error');
    } finally {
      setSavingCfg(false);
    }
  }

  async function handleSendDownlink(e: FormEvent) {
    e.preventDefault();
    if (!superAdmin) return;
    setSendingDl(true);
    try {
      const res = await api.queueDownlink(device.id, dlMinutes);
      if (res.device) {
        onDeviceUpdated(res.device);
      } else if (res.downlink) {
        onDeviceUpdated({ ...device, pendingDownlink: res.downlink });
      }
      onNotify(t(lang, 'dlQueuedSuccess'), 'info');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : String(err), 'error');
    } finally {
      setSendingDl(false);
    }
  }

  const encodedPreview = useMemo(
    () => encodeDraginoTdcDownlink(Math.max(1, dlMinutes || 1)),
    [dlMinutes]
  );

  // SVG Chart geometry
  const svgW = 680;
  const svgH = 220;
  const padL = 48;
  const padR = 18;
  const padT = 18;
  const padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const chartCoords = useMemo(() => {
    const pts = chartSeries.valid;
    if (pts.length < 2) return null;
    const minT = pts[0].ts;
    const maxT = Math.max(minT + 1, pts[pts.length - 1].ts);
    let minV = Math.min(...pts.map((p) => p.val));
    let maxV = Math.max(...pts.map((p) => p.val));
    if (minV === maxV) {
      minV -= 1;
      maxV += 1;
    } else {
      const margin = (maxV - minV) * 0.08;
      minV -= margin;
      maxV += margin;
    }

    const mapped = pts.map((p) => {
      const x = padL + ((p.ts - minT) / (maxT - minT)) * plotW;
      const y = padT + plotH - ((p.val - minV) / (maxV - minV)) * plotH;
      return { ...p, x, y };
    });

    const linePath = mapped
      .map((m, i) => `${i === 0 ? 'M' : 'L'}${m.x.toFixed(1)},${m.y.toFixed(1)}`)
      .join(' ');
    const areaPath = `${linePath} L${mapped[mapped.length - 1].x.toFixed(1)},${(
      padT + plotH
    ).toFixed(1)} L${mapped[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

    return { mapped, linePath, areaPath, minV, maxV };
  }, [chartSeries.valid, plotW, plotH]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="lp-surface w-full sm:max-w-3xl max-h-[92vh] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <SensorVectorIcon icon={profile.icon} className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-base sm:text-lg truncate">{device.name}</h2>
                <StatusBadge status={device.status} lang={lang} />
              </div>
              <div className="font-mono text-xs text-[var(--text-muted)] truncate mt-0.5">
                {device.devEui} · {profile.name}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            aria-label={t(lang, 'close')}
          >
            <X className="w-5 h-5" strokeWidth={1.9} />
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="px-5 pt-2 border-b border-[var(--border-subtle)] flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('telemetry')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'telemetry'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" strokeWidth={1.85} />
            {t(lang, 'tabTelemetry')}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'config'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" strokeWidth={1.85} />
            {t(lang, 'tabConfig')}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('downlink')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'downlink'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <ArrowDownUp className="w-3.5 h-3.5" strokeWidth={1.85} />
            {t(lang, 'tabDownlink')}
            {!superAdmin && <Lock className="w-3 h-3 opacity-70" strokeWidth={1.85} />}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {activeTab === 'telemetry' && (
            <>
              {/* Current Readings Strip */}
              {readings.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {readings.map((r) => (
                    <div key={r.key} className="lp-elevated rounded-xl p-3">
                      <div className="text-[11px] text-[var(--text-muted)] truncate">
                        {r.label}
                      </div>
                      <div
                        className={`text-base font-bold mt-0.5 ${
                          r.isProbeError ? 'text-amber-500' : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {r.displayValue}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Range + Metric + Export Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {chartableFields.length > 1 && (
                    <select
                      value={selectedFieldKey}
                      onChange={(e) => setSelectedFieldKey(e.target.value)}
                      aria-label={t(lang, 'fieldSelectLabel')}
                      className="lp-input !w-auto !py-1.5 text-xs"
                    >
                      {chartableFields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label[lang] || f.key}
                          {f.unit ? ` (${f.unit})` : ''}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-0.5">
                    {(['24h', '7d', '30d'] as const).map((rKey) => (
                      <button
                        key={rKey}
                        type="button"
                        onClick={() => setRange(rKey)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          range === rKey
                            ? 'bg-[var(--accent)] text-white'
                            : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {t(
                          lang,
                          rKey === '24h'
                            ? 'range24h'
                            : rKey === '7d'
                              ? 'range7d'
                              : 'range30d'
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={exporting !== null}
                    onClick={() => handleExport('csv')}
                    className="lp-btn-secondary !py-1.5 !px-2.5 text-xs"
                  >
                    <Download className="w-3.5 h-3.5" strokeWidth={1.85} />
                    {t(lang, 'exportCsv')}
                  </button>
                  <button
                    type="button"
                    disabled={exporting !== null}
                    onClick={() => handleExport('json')}
                    className="lp-btn-secondary !py-1.5 !px-2.5 text-xs"
                  >
                    <Download className="w-3.5 h-3.5" strokeWidth={1.85} />
                    {t(lang, 'exportJson')}
                  </button>
                </div>
              </div>

              {/* Outlier filter notice */}
              {chartSeries.outlierCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/12 border border-amber-500/30 text-amber-500 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.85} />
                  <span>
                    {t(lang, 'chartFilteredOutliers', { n: chartSeries.outlierCount })}
                  </span>
                </div>
              )}

              {/* Responsive SVG Line Chart */}
              <div className="lp-elevated rounded-xl p-3.5">
                {loadingPoints ? (
                  <div className="h-48 flex items-center justify-center text-xs text-[var(--text-muted)]">
                    {t(lang, 'loading')}
                  </div>
                ) : chartSeries.valid.length === 0 ? (
                  <div className="h-44 flex items-center justify-center text-xs text-[var(--text-secondary)] text-center px-4">
                    {t(lang, 'chartNoData')}
                  </div>
                ) : chartSeries.valid.length === 1 ? (
                  <div className="h-44 flex flex-col items-center justify-center gap-2 text-xs text-[var(--text-secondary)] text-center px-4">
                    <div className="text-lg font-bold text-[var(--accent)]">
                      {chartSeries.valid[0].val} {activeField?.unit ?? ''}
                    </div>
                    <div>{t(lang, 'chartSinglePoint')}</div>
                  </div>
                ) : (
                  chartCoords && (
                    <div className="space-y-2">
                      <svg
                        viewBox={`0 0 ${svgW} ${svgH}`}
                        className="w-full h-auto overflow-visible select-none"
                        onMouseLeave={() => setHoverIdx(null)}
                      >
                        <defs>
                          <linearGradient id="lpChartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
                          </linearGradient>
                        </defs>

                        {/* Horizontal Gridlines */}
                        {[0, 0.5, 1].map((ratio) => {
                          const y = padT + plotH * (1 - ratio);
                          const val =
                            chartCoords.minV +
                            (chartCoords.maxV - chartCoords.minV) * ratio;
                          return (
                            <g key={ratio}>
                              <line
                                x1={padL}
                                y1={y}
                                x2={svgW - padR}
                                y2={y}
                                stroke="currentColor"
                                strokeOpacity="0.12"
                                strokeDasharray="3 3"
                              />
                              <text
                                x={padL - 8}
                                y={y + 4}
                                textAnchor="end"
                                fontSize="10"
                                fill="currentColor"
                                opacity="0.55"
                              >
                                {val.toFixed(activeField?.decimals ?? 1)}
                              </text>
                            </g>
                          );
                        })}

                        <path d={chartCoords.areaPath} fill="url(#lpChartGrad)" />
                        <path
                          d={chartCoords.linePath}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="2.2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />

                        {/* Hover Point & Interactive Hit Slices */}
                        {chartCoords.mapped.map((pt, idx) => (
                          <g key={idx}>
                            {hoverIdx === idx && (
                              <>
                                <line
                                  x1={pt.x}
                                  y1={padT}
                                  x2={pt.x}
                                  y2={padT + plotH}
                                  stroke="#10b981"
                                  strokeOpacity="0.45"
                                  strokeWidth="1"
                                />
                                <circle
                                  cx={pt.x}
                                  cy={pt.y}
                                  r="4.5"
                                  fill="#10b981"
                                  stroke="#0b1117"
                                  strokeWidth="2"
                                />
                              </>
                            )}
                            <rect
                              x={pt.x - plotW / chartCoords.mapped.length / 2}
                              y={padT}
                              width={Math.max(6, plotW / chartCoords.mapped.length)}
                              height={plotH}
                              fill="transparent"
                              onMouseEnter={() => setHoverIdx(idx)}
                            />
                          </g>
                        ))}

                        {/* Start & End X-Axis Timestamps */}
                        <text
                          x={padL}
                          y={svgH - 6}
                          fontSize="10"
                          fill="currentColor"
                          opacity="0.55"
                        >
                          {formatDateTime(chartCoords.mapped[0].iso, lang)}
                        </text>
                        <text
                          x={svgW - padR}
                          y={svgH - 6}
                          textAnchor="end"
                          fontSize="10"
                          fill="currentColor"
                          opacity="0.55"
                        >
                          {formatDateTime(
                            chartCoords.mapped[chartCoords.mapped.length - 1].iso,
                            lang
                          )}
                        </text>
                      </svg>

                      {hoverIdx !== null && chartCoords.mapped[hoverIdx] && (
                        <div className="flex items-center justify-between text-xs px-2.5 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-mono">
                          <span>
                            {formatDateTime(chartCoords.mapped[hoverIdx].iso, lang)}
                          </span>
                          <span className="font-bold text-[var(--accent)]">
                            {chartCoords.mapped[hoverIdx].val.toFixed(
                              activeField?.decimals ?? 2
                            )}{' '}
                            {activeField?.unit ?? ''}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                )}

                {stats && (
                  <div className="grid grid-cols-4 gap-2 pt-3 mt-3 border-t border-[var(--border-subtle)] text-center">
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {t(lang, 'statMin')}
                      </div>
                      <div className="text-xs font-mono font-semibold">
                        {stats.min.toFixed(activeField?.decimals ?? 1)}{' '}
                        {activeField?.unit ?? ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {t(lang, 'statAvg')}
                      </div>
                      <div className="text-xs font-mono font-semibold">
                        {stats.avg.toFixed(activeField?.decimals ?? 1)}{' '}
                        {activeField?.unit ?? ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {t(lang, 'statMax')}
                      </div>
                      <div className="text-xs font-mono font-semibold">
                        {stats.max.toFixed(activeField?.decimals ?? 1)}{' '}
                        {activeField?.unit ?? ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {t(lang, 'statSamples')}
                      </div>
                      <div className="text-xs font-mono font-semibold">{stats.count}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* RF & Device Metadata */}
              <div className="lp-elevated rounded-xl p-3.5 space-y-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {t(lang, 'rfMetadataTitle')}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-[var(--text-muted)]">TTN App / Device ID</div>
                    <div className="font-mono font-medium truncate">
                      {device.ttnAppName} / {device.ttnDeviceId}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">RSSI / SF / SNR</div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <SignalBars
                        rssi={device.rssi}
                        spreadingFactor={device.spreadingFactor}
                        lang={lang}
                      />
                      {device.snr !== null && (
                        <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                          SNR {device.snr} dB
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)]">Battery</div>
                    <div className="mt-0.5">
                      <BatteryGauge
                        voltage={device.batteryVoltage}
                        state={device.batteryState}
                        chemistry={profile.batteryChemistry}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'config' && (
            <>
              {!canEdit && (
                <div className="p-3 rounded-xl bg-slate-500/12 border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] flex items-center gap-2">
                  <Lock className="w-4 h-4 shrink-0" strokeWidth={1.85} />
                  <span>{t(lang, 'cfgReadOnlyHint')}</span>
                </div>
              )}

              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      {t(lang, 'cfgNameLabel')}
                    </label>
                    <input
                      type="text"
                      required
                      disabled={!canEdit}
                      value={cfgName}
                      onChange={(e) => setCfgName(e.target.value)}
                      className="lp-input"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      {t(lang, 'cfgCategoryLabel')}
                    </label>
                    <select
                      disabled={!canEdit}
                      value={cfgCategoryId}
                      onChange={(e) => setCfgCategoryId(e.target.value)}
                      className="lp-input"
                    >
                      <option value="">{t(lang, 'uncategorized')}</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.path || cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      {t(lang, 'cfgProfileLabel')}
                    </label>
                    <select
                      disabled={!canEdit}
                      value={cfgProfileId}
                      onChange={(e) => setCfgProfileId(e.target.value)}
                      className="lp-input"
                    >
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      {t(lang, 'cfgLocationLabel')}
                    </label>
                    <input
                      type="text"
                      disabled={!canEdit}
                      value={cfgLocLabel}
                      onChange={(e) => setCfgLocLabel(e.target.value)}
                      className="lp-input"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      {t(lang, 'cfgLatitude')}
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      disabled={!canEdit}
                      value={cfgLat}
                      onChange={(e) => setCfgLat(e.target.value)}
                      className="lp-input font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      {t(lang, 'cfgLongitude')}
                    </label>
                    <input
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      disabled={!canEdit}
                      value={cfgLng}
                      onChange={(e) => setCfgLng(e.target.value)}
                      className="lp-input font-mono"
                    />
                  </div>
                </div>

                {canEdit && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleFillBrowserGps}
                      className="lp-btn-secondary !py-1.5 !px-3 text-xs"
                    >
                      <LocateFixed
                        className="w-3.5 h-3.5 text-[var(--accent)]"
                        strokeWidth={1.85}
                      />
                      {t(lang, 'mapUseDeviceGpsBtn')}
                    </button>
                    {(cfgLat !== '' || cfgLng !== '') && (
                      <button
                        type="button"
                        onClick={() => {
                          setCfgLat('');
                          setCfgLng('');
                        }}
                        className="lp-btn-secondary !py-1.5 !px-3 text-xs"
                      >
                        {t(lang, 'cfgClearCoords')}
                      </button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 border-t border-[var(--border-subtle)]">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      {t(lang, 'cfgTempMin')}
                    </label>
                    <input
                      type="number"
                      step="any"
                      disabled={!canEdit}
                      value={cfgTempMin}
                      onChange={(e) => setCfgTempMin(e.target.value)}
                      className="lp-input font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      {t(lang, 'cfgTempMax')}
                    </label>
                    <input
                      type="number"
                      step="any"
                      disabled={!canEdit}
                      value={cfgTempMax}
                      onChange={(e) => setCfgTempMax(e.target.value)}
                      className="lp-input font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      {t(lang, 'cfgExpectedIntervalMin')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10080}
                      disabled={!canEdit}
                      value={cfgExpectedMin}
                      onChange={(e) => setCfgExpectedMin(e.target.value)}
                      className="lp-input font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center gap-2.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={cfgInvertContact}
                      onChange={(e) => setCfgInvertContact(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                    <span>{t(lang, 'cfgInvertContact')}</span>
                  </label>

                  <label className="flex items-center gap-2.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={cfgAlertOnOpen}
                      onChange={(e) => setCfgAlertOnOpen(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                    <span>{t(lang, 'cfgAlertOnOpen')}</span>
                  </label>
                </div>

                {canEdit && (
                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingCfg}
                      className="lp-btn-primary"
                    >
                      <Save className="w-4 h-4" strokeWidth={1.85} />
                      {savingCfg ? t(lang, 'saving') : t(lang, 'save')}
                    </button>
                  </div>
                )}
              </form>
            </>
          )}

          {activeTab === 'downlink' && (
            <>
              {!superAdmin ? (
                <div className="lp-elevated rounded-xl p-6 text-center space-y-2.5">
                  <div className="w-11 h-11 rounded-xl bg-slate-500/12 border border-[var(--border-subtle)] flex items-center justify-center mx-auto text-[var(--text-secondary)]">
                    <Lock className="w-5 h-5" strokeWidth={1.85} />
                  </div>
                  <h3 className="font-bold text-sm">{t(lang, 'dlSuperAdminOnlyTitle')}</h3>
                  <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
                    {t(lang, 'dlSuperAdminOnlyDesc')}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-xs text-[var(--text-secondary)] flex items-start gap-2.5 leading-relaxed">
                    <Clock className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" strokeWidth={1.85} />
                    <span>{t(lang, 'dlClassANotice')}</span>
                  </div>

                  {device.pendingDownlink && (
                    <div className="lp-elevated rounded-xl p-3.5 space-y-1.5">
                      <div className="text-xs font-bold text-[var(--text-secondary)]">
                        {t(lang, 'dlStatusTitle')}
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                        <span
                          className={`font-semibold ${
                            device.pendingDownlink.state === 'QUEUED'
                              ? 'text-sky-400'
                              : device.pendingDownlink.state === 'SENT'
                                ? 'text-emerald-500'
                                : 'text-red-500'
                          }`}
                        >
                          {device.pendingDownlink.state === 'QUEUED'
                            ? t(lang, 'dlStateQueued')
                            : device.pendingDownlink.state === 'SENT'
                              ? t(lang, 'dlStateSent')
                              : t(lang, 'dlStateFailed')}
                        </span>
                        <span className="font-mono text-[var(--text-muted)]">
                          {device.pendingDownlink.intervalMinutes} min · FPort{' '}
                          {device.pendingDownlink.fPort} · 0x
                          {device.pendingDownlink.payloadHex}
                        </span>
                      </div>
                      {device.pendingDownlink.error && (
                        <div className="text-[11px] text-red-500 font-mono">
                          {device.pendingDownlink.error}
                        </div>
                      )}
                    </div>
                  )}

                  {profile.downlinkIntervalCodec === 'none' && (
                    <div className="p-3 rounded-xl bg-amber-500/12 border border-amber-500/30 text-amber-500 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.85} />
                      <span>{t(lang, 'dlUnsupportedProfile')}</span>
                    </div>
                  )}

                  <form onSubmit={handleSendDownlink} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-2">
                        {t(lang, 'dlIntervalMinutesLabel')}
                      </label>
                      <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                        {[5, 15, 20, 30, 60, 180, 720, 1440].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setDlMinutes(preset)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-colors ${
                              dlMinutes === preset
                                ? 'bg-[var(--accent)] text-white border-transparent'
                                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                            }`}
                          >
                            {preset >= 60 ? `${preset / 60}h` : `${preset}m`}
                          </button>
                        ))}
                      </div>

                      <input
                        type="number"
                        required
                        min={1}
                        max={10080}
                        value={dlMinutes}
                        onChange={(e) => setDlMinutes(Number(e.target.value))}
                        className="lp-input font-mono max-w-[200px]"
                      />
                    </div>

                    {dlMinutes < 10 && (
                      <div className="p-3 rounded-xl bg-amber-500/12 border border-amber-500/30 text-amber-500 text-xs flex items-start gap-2">
                        <AlertTriangle
                          className="w-4 h-4 shrink-0 mt-0.5"
                          strokeWidth={1.85}
                        />
                        <span>{t(lang, 'dlFairUseWarning')}</span>
                      </div>
                    )}

                    <div className="lp-elevated rounded-xl p-3 flex items-center justify-between gap-2 text-xs font-mono">
                      <span className="text-[var(--text-muted)]">
                        {t(lang, 'dlPayloadPreview', { port: encodedPreview.fPort })}
                      </span>
                      <span className="text-[var(--accent)] font-bold">
                        0x{encodedPreview.payloadHex} ({encodedPreview.payloadBase64})
                      </span>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={sendingDl || profile.downlinkIntervalCodec === 'none'}
                        className="lp-btn-primary"
                      >
                        <Send className="w-4 h-4" strokeWidth={1.85} />
                        {sendingDl ? t(lang, 'saving') : t(lang, 'dlSubmitBtn')}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
