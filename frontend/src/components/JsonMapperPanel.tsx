import { useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  Code2,
  Copy,
  FileJson,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  evaluateBatteryHealth,
  type BatteryChemistry,
  type DeviceView,
  type DownlinkCodecType,
  type Language,
  type SensorFieldDef,
  type SensorFieldKind,
  type SensorIconName,
  type SensorProfile,
} from '@lorapulse/shared';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { getPrimaryPinText, isOutlierForField } from '../utils/telemetry';
import { DeviceCard } from './DeviceCard';
import { SensorVectorIcon } from './TelemetryIndicators';

const DEFAULT_SAMPLE_JSON = JSON.stringify(
  {
    soil_moisture: 34.8,
    soil_temp_c: 14.2,
    probe_aux: -999,
    BatV: 3.59,
  },
  null,
  2
);

export function JsonMapperPanel({
  devices,
  profiles,
  lang,
  onProfileSaved,
  onNotify,
}: {
  devices: DeviceView[];
  profiles: SensorProfile[];
  lang: Language;
  onProfileSaved: (profile: SensorProfile) => void;
  onNotify: (msg: string, kind?: 'info' | 'error') => void;
}) {
  const [sourceMode, setSourceMode] = useState<'sample' | 'device'>('sample');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(
    devices[0]?.id ?? ''
  );
  const [sampleJsonText, setSampleJsonText] = useState<string>(DEFAULT_SAMPLE_JSON);
  const [importPromptOpen, setImportPromptOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const [profileId, setProfileId] = useState('custom_soil_sensor');
  const [profileName, setProfileName] = useState('Custom Soil & Temp Sensor');
  const [brand, setBrand] = useState('custom');
  const [model, setModel] = useState('v1');
  const [icon, setIcon] = useState<SensorIconName>('activity');
  const [batteryChemistry, setBatteryChemistry] =
    useState<BatteryChemistry>('li_socl2_3v6');
  const [downlinkCodec, setDownlinkCodec] =
    useState<DownlinkCodecType>('dragino_tdc_port2');

  const [fields, setFields] = useState<SensorFieldDef[]>([
    {
      key: 'soil_moisture',
      label: { de: 'Bodenfeuchte', en: 'Soil Moisture' },
      kind: 'number',
      unit: '%',
      decimals: 1,
      isPrimary: true,
      validMin: 0,
      validMax: 100,
    },
    {
      key: 'soil_temp_c',
      label: { de: 'Bodentemperatur', en: 'Soil Temperature' },
      kind: 'number',
      unit: '°C',
      decimals: 1,
      validMin: -40,
      validMax: 85,
    },
    {
      key: 'BatV',
      label: { de: 'Batteriespannung', en: 'Battery Voltage' },
      kind: 'battery',
      unit: 'V',
      decimals: 2,
      validMin: 2.0,
      validMax: 4.0,
    },
  ]);

  const [saving, setSaving] = useState(false);

  const selectedLiveDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId]
  );

  const activePayload = useMemo<{
    data: Record<string, unknown> | null;
    parseError: string | null;
  }>(() => {
    if (sourceMode === 'device') {
      if (!selectedLiveDevice?.rawLatestPayload) {
        return { data: null, parseError: null };
      }
      return { data: selectedLiveDevice.rawLatestPayload, parseError: null };
    }
    try {
      const parsed = JSON.parse(sampleJsonText);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return { data: parsed as Record<string, unknown>, parseError: null };
      }
      return { data: null, parseError: 'JSON root must be an object' };
    } catch (err) {
      return {
        data: null,
        parseError: err instanceof Error ? err.message : 'Invalid JSON',
      };
    }
  }, [sourceMode, selectedLiveDevice, sampleJsonText]);

  const scalarKeys = useMemo(() => {
    if (!activePayload.data) return [];
    return Object.entries(activePayload.data).filter(
      ([, v]) =>
        typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean'
    );
  }, [activePayload.data]);

  function togglePayloadKey(key: string, sampleVal: unknown) {
    const exists = fields.some((f) => f.key === key);
    if (exists) {
      setFields((prev) => prev.filter((f) => f.key !== key));
      return;
    }
    const lower = key.toLowerCase();
    const guessedKind: SensorFieldKind =
      lower.includes('bat') || lower.includes('volt')
        ? 'battery'
        : lower.includes('door') || lower.includes('open') || typeof sampleVal === 'boolean'
          ? 'contact'
          : lower.includes('count') || lower.includes('times')
            ? 'counter'
            : 'number';

    const guessedUnit =
      guessedKind === 'battery'
        ? 'V'
        : lower.includes('temp')
          ? '°C'
          : lower.includes('hum') || lower.includes('moist')
            ? '%'
            : '';

    setFields((prev) => [
      ...prev,
      {
        key,
        label: { de: key, en: key },
        kind: guessedKind,
        unit: guessedUnit,
        decimals: guessedKind === 'counter' ? 0 : 1,
        isPrimary: prev.length === 0,
        validMin: lower.includes('temp') ? -55 : undefined,
        validMax: lower.includes('temp') ? 125 : undefined,
      },
    ]);
  }

  function updateField(index: number, patch: Partial<SensorFieldDef>) {
    setFields((prev) =>
      prev.map((f, idx) => {
        if (idx !== index) {
          if (patch.isPrimary) return { ...f, isPrimary: false };
          return f;
        }
        return { ...f, ...patch };
      })
    );
  }

  const draftProfile: SensorProfile = useMemo(
    () => ({
      id: profileId.trim() || 'custom_profile',
      name: profileName.trim() || 'Custom Sensor',
      brand: brand.trim() || 'custom',
      model: model.trim() || 'custom',
      icon,
      batteryChemistry,
      downlinkIntervalCodec: downlinkCodec,
      isBuiltIn: false,
      fields,
    }),
    [profileId, profileName, brand, model, icon, batteryChemistry, downlinkCodec, fields]
  );

  // Build synthetic DeviceView for real-time card & map-pin preview
  const previewDevice: DeviceView = useMemo(() => {
    const payload = activePayload.data ?? {};
    const latestValues: Record<string, number | string | boolean | null> = {};
    const probeErrorFields: string[] = [];
    let batVoltage: number | null = null;

    for (const f of fields) {
      const raw = payload[f.key];
      if (
        typeof raw === 'number' ||
        typeof raw === 'string' ||
        typeof raw === 'boolean'
      ) {
        latestValues[f.key] = raw;
        const num = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isNaN(num) && isOutlierForField(num, f)) {
          probeErrorFields.push(f.key);
        } else if (f.kind === 'battery' && !Number.isNaN(num)) {
          batVoltage = num;
        }
      }
    }

    const batState = evaluateBatteryHealth(batVoltage, batteryChemistry);

    return {
      id: 'preview-device',
      ttnApplicationId: 'preview-app',
      ttnAppName: 'Live Preview',
      categoryId: 'preview-cat',
      categoryBreadcrumb: ['Preview'],
      isDirectShareOnly: false,
      sensorProfileId: draftProfile.id,
      devEui: 'A84041000181F099',
      ttnDeviceId: 'preview-node-01',
      name: draftProfile.name,
      latitude: 50.1109,
      longitude: 8.6821,
      locationLabel: 'Test Bench',
      config: {},
      latestValues,
      rawLatestPayload: payload,
      probeErrorFields,
      batteryVoltage: batVoltage,
      batteryState: batState,
      rssi: -89,
      snr: 8.2,
      spreadingFactor: 'SF7',
      status: probeErrorFields.length > 0 ? 'WARN' : 'OK',
      lastSeenAt: new Date().toISOString(),
      pendingDownlink: null,
      effectivePermission: 'SUPER_ADMIN',
      createdAt: new Date().toISOString(),
    };
  }, [activePayload.data, fields, batteryChemistry, draftProfile]);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (fields.length === 0) return;
    setSaving(true);
    try {
      const saved = await api.saveProfile({
        id: draftProfile.id,
        name: draftProfile.name,
        brand: draftProfile.brand,
        model: draftProfile.model,
        icon: draftProfile.icon,
        batteryChemistry: draftProfile.batteryChemistry,
        downlinkIntervalCodec: draftProfile.downlinkIntervalCodec,
        fields: draftProfile.fields,
      });
      onProfileSaved(saved);
      onNotify(t(lang, 'mapperSavedSuccess'), 'info');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleCopyJson() {
    navigator.clipboard
      .writeText(JSON.stringify(draftProfile, null, 2))
      .then(() => onNotify(t(lang, 'copied'), 'info'))
      .catch(() => {});
  }

  function handleApplyImport() {
    try {
      const parsed = JSON.parse(importText) as Partial<SensorProfile>;
      if (parsed.id) setProfileId(parsed.id);
      if (parsed.name) setProfileName(parsed.name);
      if (parsed.brand) setBrand(parsed.brand);
      if (parsed.model) setModel(parsed.model);
      if (parsed.icon) setIcon(parsed.icon);
      if (parsed.batteryChemistry) setBatteryChemistry(parsed.batteryChemistry);
      if (parsed.downlinkIntervalCodec) setDownlinkCodec(parsed.downlinkIntervalCodec);
      if (Array.isArray(parsed.fields)) setFields(parsed.fields);
      setImportPromptOpen(false);
      setImportText('');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Invalid profile JSON', 'error');
    }
  }

  const pinPreviewText = getPrimaryPinText(previewDevice, draftProfile, lang);

  return (
    <div className="space-y-6">
      <div className="lp-surface rounded-2xl p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Code2 className="w-5 h-5 text-[var(--accent)]" strokeWidth={1.9} />
              {t(lang, 'mapperTitle')}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {t(lang, 'mapperDesc')}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyJson}
              className="lp-btn-secondary !py-1.5 !px-3 text-xs"
            >
              <Copy className="w-3.5 h-3.5" strokeWidth={1.85} />
              {t(lang, 'mapperExportBtn')}
            </button>
            <button
              type="button"
              onClick={() => setImportPromptOpen((v) => !v)}
              className="lp-btn-secondary !py-1.5 !px-3 text-xs"
            >
              <Upload className="w-3.5 h-3.5" strokeWidth={1.85} />
              {t(lang, 'mapperImportBtn')}
            </button>
          </div>
        </div>

        {importPromptOpen && (
          <div className="lp-elevated rounded-xl p-3.5 space-y-2.5">
            <textarea
              rows={4}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='{"id": "my_sensor", "name": "...", "fields": [...]}'
              className="lp-input font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportPromptOpen(false)}
                className="lp-btn-secondary !py-1 !px-2.5 text-xs"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                type="button"
                onClick={handleApplyImport}
                className="lp-btn-primary !py-1 !px-3 text-xs"
              >
                {t(lang, 'mapperImportBtn')}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Payload Source & Clickable JSON Tree */}
          <div className="lg:col-span-5 space-y-3.5">
            <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-0.5 w-full">
              <button
                type="button"
                onClick={() => setSourceMode('sample')}
                className={`flex-1 py-1.5 px-2.5 rounded-md text-xs font-medium transition-colors ${
                  sourceMode === 'sample'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                {t(lang, 'mapperSourceSample')}
              </button>
              <button
                type="button"
                onClick={() => setSourceMode('device')}
                className={`flex-1 py-1.5 px-2.5 rounded-md text-xs font-medium transition-colors ${
                  sourceMode === 'device'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                {t(lang, 'mapperSourceDevice')}
              </button>
            </div>

            {sourceMode === 'device' ? (
              <div className="space-y-2.5">
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="lp-input text-xs"
                >
                  <option value="">--</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.devEui})
                    </option>
                  ))}
                </select>

                {!selectedLiveDevice?.rawLatestPayload && (
                  <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-xs text-[var(--text-secondary)]">
                    {t(lang, 'mapperDeviceNoPayload')}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <textarea
                  rows={6}
                  value={sampleJsonText}
                  onChange={(e) => setSampleJsonText(e.target.value)}
                  className="lp-input font-mono text-xs"
                />
                {activePayload.parseError && (
                  <div className="text-[11px] text-red-500 mt-1 font-mono">
                    {activePayload.parseError}
                  </div>
                )}
              </div>
            )}

            {/* Clickable Detected JSON Keys */}
            <div className="lp-elevated rounded-xl p-3.5 space-y-2">
              <div className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                <FileJson className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.85} />
                {t(lang, 'mapperClickableKeys')}
              </div>

              {scalarKeys.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)] py-2">--</div>
              ) : (
                <div className="space-y-1.5">
                  {scalarKeys.map(([key, val]) => {
                    const selected = fields.some((f) => f.key === key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => togglePayloadKey(key, val)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                          selected
                            ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent)]'
                            : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          {selected ? (
                            <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                          ) : (
                            <Plus className="w-3.5 h-3.5 shrink-0 opacity-60" strokeWidth={2} />
                          )}
                          <span className="truncate">{key}</span>
                        </span>
                        <span className="text-[var(--text-muted)] ml-2">
                          {String(val)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Live Card + Map Pin Preview */}
            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {t(lang, 'mapperLivePreview')}
                </span>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border-2 border-emerald-500 bg-[var(--bg-surface)]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>{pinPreviewText}</span>
                </div>
              </div>

              <DeviceCard
                device={previewDevice}
                profile={draftProfile}
                lang={lang}
              />
            </div>
          </div>

          {/* Right Column: Profile Metadata & Field Configuration Form */}
          <form onSubmit={handleSaveProfile} className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t(lang, 'mapperProfileId')}
                </label>
                <input
                  type="text"
                  required
                  pattern="^[a-z0-9_-]+$"
                  value={profileId}
                  onChange={(e) =>
                    setProfileId(
                      e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_')
                    )
                  }
                  className="lp-input font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t(lang, 'mapperProfileName')}
                </label>
                <input
                  type="text"
                  required
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="lp-input text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t(lang, 'mapperBatteryChem')}
                </label>
                <select
                  value={batteryChemistry}
                  onChange={(e) =>
                    setBatteryChemistry(e.target.value as BatteryChemistry)
                  }
                  className="lp-input text-xs"
                >
                  <option value="li_socl2_3v6">3.6 V Li-SOCl2 (ER26500 / ER14505)</option>
                  <option value="alkaline_3v0">3.0 V Alkaline (2x AA / AAA)</option>
                  <option value="none">External / None</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t(lang, 'mapperDownlinkCodec')}
                </label>
                <select
                  value={downlinkCodec}
                  onChange={(e) =>
                    setDownlinkCodec(e.target.value as DownlinkCodecType)
                  }
                  className="lp-input text-xs"
                >
                  <option value="dragino_tdc_port2">
                    Dragino TDC (FPort 2: 0x01 + 3B sec)
                  </option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                {t(lang, 'mapperIcon')}
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {(
                  ['door', 'thermometer', 'cloud', 'activity', 'radio'] as SensorIconName[]
                ).map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                      icon === ic
                        ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent)] font-semibold'
                        : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <SensorVectorIcon icon={ic} className="w-3.5 h-3.5" />
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            {/* Mapped Fields List */}
            <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
              <div className="text-xs font-bold">{t(lang, 'mapperFieldsTitle')}</div>

              {fields.length === 0 ? (
                <div className="lp-elevated rounded-xl p-4 text-xs text-[var(--text-muted)] text-center">
                  {t(lang, 'mapperNoFields')}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {fields.map((field, idx) => (
                    <div
                      key={field.key}
                      className="lp-elevated rounded-xl p-3 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-[var(--accent)]">
                          {field.key}
                        </span>
                        <div className="flex items-center gap-3">
                          <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer">
                            <input
                              type="radio"
                              name="primaryField"
                              checked={Boolean(field.isPrimary)}
                              onChange={() => updateField(idx, { isPrimary: true })}
                              className="accent-emerald-500"
                            />
                            <span>{t(lang, 'mapperPrimary')}</span>
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setFields((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-red-500 hover:opacity-80 p-1"
                            aria-label={t(lang, 'delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.85} />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <input
                          type="text"
                          required
                          placeholder="Label DE"
                          value={field.label.de}
                          onChange={(e) =>
                            updateField(idx, {
                              label: { ...field.label, de: e.target.value },
                            })
                          }
                          className="lp-input !py-1 !px-2 !text-xs"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Label EN"
                          value={field.label.en}
                          onChange={(e) =>
                            updateField(idx, {
                              label: { ...field.label, en: e.target.value },
                            })
                          }
                          className="lp-input !py-1 !px-2 !text-xs"
                        />
                        <select
                          value={field.kind}
                          onChange={(e) =>
                            updateField(idx, {
                              kind: e.target.value as SensorFieldKind,
                            })
                          }
                          className="lp-input !py-1 !px-2 !text-xs"
                        >
                          <option value="number">number</option>
                          <option value="contact">contact</option>
                          <option value="battery">battery</option>
                          <option value="counter">counter</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Unit (°C, %)"
                          value={field.unit}
                          onChange={(e) =>
                            updateField(idx, { unit: e.target.value })
                          }
                          className="lp-input !py-1 !px-2 !text-xs font-mono"
                        />
                      </div>

                      {field.kind !== 'contact' && (
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="number"
                            min={0}
                            max={4}
                            placeholder="Decimals"
                            value={field.decimals ?? 1}
                            onChange={(e) =>
                              updateField(idx, {
                                decimals: Number(e.target.value),
                              })
                            }
                            className="lp-input !py-1 !px-2 !text-xs font-mono"
                          />
                          <input
                            type="number"
                            step="any"
                            placeholder={t(lang, 'mapperValidMin')}
                            value={field.validMin ?? ''}
                            onChange={(e) =>
                              updateField(idx, {
                                validMin:
                                  e.target.value === ''
                                    ? undefined
                                    : Number(e.target.value),
                              })
                            }
                            className="lp-input !py-1 !px-2 !text-xs font-mono"
                          />
                          <input
                            type="number"
                            step="any"
                            placeholder={t(lang, 'mapperValidMax')}
                            value={field.validMax ?? ''}
                            onChange={(e) =>
                              updateField(idx, {
                                validMax:
                                  e.target.value === ''
                                    ? undefined
                                    : Number(e.target.value),
                              })
                            }
                            className="lp-input !py-1 !px-2 !text-xs font-mono"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving || fields.length === 0}
                className="lp-btn-primary"
              >
                <Save className="w-4 h-4" strokeWidth={1.85} />
                {saving ? t(lang, 'saving') : t(lang, 'mapperSaveProfileBtn')}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Existing Profiles Catalog */}
      <div className="lp-surface rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold">{t(lang, 'existingProfilesTitle')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {profiles.map((p) => (
            <div key={p.id} className="lp-elevated rounded-xl p-3 flex items-start gap-2.5">
              <span className="p-2 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                <SensorVectorIcon icon={p.icon} className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-xs truncate">{p.name}</div>
                <div className="font-mono text-[11px] text-[var(--text-muted)] truncate">
                  {p.id} · {p.fields.length} fields
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
