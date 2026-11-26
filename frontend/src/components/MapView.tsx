import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Crosshair,
  ExternalLink,
  Layers,
  LocateFixed,
  MapPinOff,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type {
  DeviceView,
  Language,
  SensorProfile,
  UserSummary,
} from '@lorapulse/shared';
import { useNowTick } from '../hooks/useNowTick';
import { t, translateApiError } from '../i18n';
import {
  canConfigureDevice,
  formatLiveTimestamp,
  getPrimaryPinText,
  resolveProfile,
  statusColorHex,
} from '../utils/telemetry';
import {
  BatteryGauge,
  SignalBars,
  StatusBadge,
} from './TelemetryIndicators';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface PositionedDevice {
  device: DeviceView;
  displayLat: number;
  displayLng: number;
  actualLat: number;
  actualLng: number;
  isColocated: boolean;
}

/**
 * Radially fans out co-located sensors sharing identical / near-identical coordinates
 * so pins on the same mast or building never obscure one another.
 */
function computeSpiderfiedPositions(devices: DeviceView[]): PositionedDevice[] {
  const groups = new Map<string, DeviceView[]>();
  for (const d of devices) {
    if (d.latitude === null || d.longitude === null) continue;
    const key = `${d.latitude.toFixed(4)}:${d.longitude.toFixed(4)}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(d);
    else groups.set(key, [d]);
  }

  const result: PositionedDevice[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length === 1) {
      const d = bucket[0];
      result.push({
        device: d,
        displayLat: d.latitude!,
        displayLng: d.longitude!,
        actualLat: d.latitude!,
        actualLng: d.longitude!,
        isColocated: false,
      });
    } else {
      const radiusDeg = 0.00038;
      bucket.forEach((d, idx) => {
        const angle = (2 * Math.PI * idx) / bucket.length;
        const latOffset = Math.sin(angle) * radiusDeg;
        const lngOffset =
          (Math.cos(angle) * radiusDeg) /
          Math.max(0.25, Math.cos((d.latitude! * Math.PI) / 180));
        result.push({
          device: d,
          displayLat: d.latitude! + latOffset,
          displayLng: d.longitude! + lngOffset,
          actualLat: d.latitude!,
          actualLng: d.longitude!,
          isColocated: true,
        });
      });
    }
  }
  return result;
}

const DEFAULT_CENTER: [number, number] = [50.1109, 8.6821];
const DEFAULT_ZOOM = 6;

export function MapView({
  devices,
  profiles,
  user,
  lang,
  onOpenDetails,
  onSaveCoordinates,
  onNotify,
}: {
  devices: DeviceView[];
  profiles: SensorProfile[];
  user: UserSummary;
  lang: Language;
  onOpenDetails: (device: DeviceView) => void;
  onSaveCoordinates: (
    deviceId: string,
    latitude: number,
    longitude: number
  ) => Promise<void>;
  onNotify: (msg: string, kind?: 'info' | 'error') => void;
}) {
  const nowMs = useNowTick(10000);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  const fittedKeyRef = useRef<string>('');

  const [layerType, setLayerType] = useState<'osm' | 'topo'>('osm');
  const [filterMode, setFilterMode] = useState<'all' | 'alarms'>('all');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [pickModeForId, setPickModeForId] = useState<string | null>(null);
  const [savingGps, setSavingGps] = useState(false);

  const filteredDevices = useMemo(() => {
    if (filterMode === 'alarms') {
      return devices.filter((d) => d.status === 'ALARM' || d.status === 'WARN');
    }
    return devices;
  }, [devices, filterMode]);

  const locatedDevices = useMemo(
    () => filteredDevices.filter((d) => d.latitude !== null && d.longitude !== null),
    [filteredDevices]
  );

  const unlocatedDevices = useMemo(
    () => devices.filter((d) => d.latitude === null || d.longitude === null),
    [devices]
  );

  const editableUnlocated = useMemo(
    () => unlocatedDevices.filter((d) => canConfigureDevice(d, user)),
    [unlocatedDevices, user]
  );

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId]
  );

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const markerGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    markerGroupRef.current = markerGroup;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      baseLayerRef.current = null;
      markerGroupRef.current = null;
    };
  }, []);

  // Switch OSM / OpenTopoMap tile layer (OSM Tile Policy compliant)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (baseLayerRef.current) {
      map.removeLayer(baseLayerRef.current);
    }

    const tileLayer =
      layerType === 'topo'
        ? L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
            maxZoom: 17,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>, SRTM | &copy; <a href="https://opentopomap.org" target="_blank" rel="noreferrer">OpenTopoMap</a> (CC-BY-SA)',
          })
        : L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
          });

    tileLayer.addTo(map);
    baseLayerRef.current = tileLayer;
  }, [layerType]);

  // Handle click-to-place coordinates mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const container = map.getContainer();
    container.style.cursor = pickModeForId ? 'crosshair' : '';

    function onMapClick(ev: L.LeafletMouseEvent) {
      if (!pickModeForId) return;
      const targetId = pickModeForId;
      const lat = Math.round(ev.latlng.lat * 1000000) / 1000000;
      const lng = Math.round(ev.latlng.lng * 1000000) / 1000000;
      setPickModeForId(null);
      setSavingGps(true);
      onSaveCoordinates(targetId, lat, lng)
        .then(() => {
          setSelectedDeviceId(targetId);
          onNotify(t(lang, 'mapCoordsSaved'), 'info');
        })
        .catch((err) => {
          onNotify(translateApiError(err, lang), 'error');
        })
        .finally(() => {
          setSavingGps(false);
        });
    }

    map.on('click', onMapClick);
    return () => {
      map.off('click', onMapClick);
      container.style.cursor = '';
    };
  }, [pickModeForId, onSaveCoordinates, onNotify, lang]);

  // Render zero-emoji status pill pins and handle 0 / 1 / N auto-bounds safely
  useEffect(() => {
    const map = mapRef.current;
    const group = markerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const positioned = computeSpiderfiedPositions(locatedDevices);

    for (const item of positioned) {
      const { device, displayLat, displayLng, actualLat, actualLng, isColocated } = item;
      const profile = resolveProfile(device.sensorProfileId, profiles);
      const pinText = escapeHtml(getPrimaryPinText(device, profile, lang));
      const colorHex = statusColorHex(device.status);
      const isSelected = device.id === selectedDeviceId;

      if (isColocated) {
        L.polyline(
          [
            [actualLat, actualLng],
            [displayLat, displayLng],
          ],
          {
            color: colorHex,
            weight: 1.6,
            dashArray: '3 4',
            opacity: 0.75,
          }
        ).addTo(group);
      }

      const icon = L.divIcon({
        className: 'lp-leaflet-icon',
        html: `<div class="lp-pin-pill ${
          isSelected ? 'is-selected' : ''
        }" style="border-color: ${colorHex};">
          <span class="lp-pin-dot ${
            device.status === 'ALARM' ? 'lp-led-pulse' : ''
          }" style="background-color: ${colorHex};"></span>
          <span>${pinText}</span>
        </div>`,
        iconSize: [0, 0],
      });

      const marker = L.marker([displayLat, displayLng], { icon });
      marker.on('click', () => {
        setSelectedDeviceId(device.id);
      });
      marker.addTo(group);
    }

    const fitSignature = `${filterMode}:${locatedDevices
      .map((d) => `${d.id}@${d.latitude},${d.longitude}`)
      .join('|')}`;

    if (fittedKeyRef.current !== fitSignature) {
      fittedKeyRef.current = fitSignature;
      if (locatedDevices.length === 0) {
        // Edge Case: 0 GPS sensors -> NEVER call fitBounds([])
        map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      } else if (locatedDevices.length === 1) {
        // Edge Case: Exactly 1 GPS sensor -> cap zoom at <= 15
        const single = locatedDevices[0];
        map.setView([single.latitude!, single.longitude!], 14);
      } else {
        const bounds = L.latLngBounds(
          locatedDevices.map((d) => [d.latitude!, d.longitude!] as [number, number])
        );
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
      }
    }
  }, [locatedDevices, profiles, lang, selectedDeviceId, filterMode]);

  function handleUseSmartphoneGps(device: DeviceView) {
    if (!navigator.geolocation) {
      onNotify(t(lang, 'mapGpsUnsupported'), 'error');
      return;
    }
    setSavingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 1000000) / 1000000;
        const lng = Math.round(pos.coords.longitude * 1000000) / 1000000;
        onSaveCoordinates(device.id, lat, lng)
          .then(() => {
            setSelectedDeviceId(device.id);
            mapRef.current?.setView([lat, lng], 15);
            onNotify(t(lang, 'mapCoordsSaved'), 'info');
          })
          .catch((err) => {
            onNotify(translateApiError(err, lang), 'error');
          })
          .finally(() => {
            setSavingGps(false);
          });
      },
      () => {
        setSavingGps(false);
        onNotify(t(lang, 'mapGpsError'), 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const selectedProfile = selectedDevice
    ? resolveProfile(selectedDevice.sensorProfileId, profiles)
    : null;
  const canEditSelected = selectedDevice
    ? canConfigureDevice(selectedDevice, user)
    : false;

  return (
    <div className="space-y-3">
      {/* Map Controls Toolbar */}
      <div className="lp-surface rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] mr-1">
            <Layers className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.85} />
          </span>
          <button
            type="button"
            onClick={() => setLayerType('osm')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              layerType === 'osm'
                ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-border)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
            }`}
          >
            {t(lang, 'mapLayerOsm')}
          </button>
          <button
            type="button"
            onClick={() => setLayerType('topo')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              layerType === 'topo'
                ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-border)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
            }`}
          >
            {t(lang, 'mapLayerTopo')}
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <SlidersHorizontal
            className="w-3.5 h-3.5 text-[var(--text-muted)] mr-1"
            strokeWidth={1.85}
          />
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filterMode === 'all'
                ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-border)]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
            }`}
          >
            {t(lang, 'mapFilterAll')}
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('alarms')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              filterMode === 'alarms'
                ? 'bg-red-500/14 text-red-500 border-red-500/35'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
            }`}
          >
            {t(lang, 'mapFilterAlarms')}
          </button>
        </div>
      </div>

      {/* Missing GPS Notice Bar + Admin Quick Placement */}
      {unlocatedDevices.length > 0 && (
        <div className="lp-surface rounded-xl px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <MapPinOff className="w-4 h-4 text-amber-500 shrink-0" strokeWidth={1.85} />
            <span>
              {t(lang, 'mapMissingGpsCount', { n: unlocatedDevices.length })}
            </span>
          </div>

          {editableUnlocated.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) {
                    setSelectedDeviceId(id);
                    setPickModeForId(id);
                  }
                }}
                className="lp-input !py-1 !px-2.5 !text-xs max-w-[230px]"
              >
                <option value="">{t(lang, 'mapAssignUnlocated')}…</option>
                {editableUnlocated.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.devEui.slice(-6)})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Active Click-to-Place Banner */}
      {pickModeForId && (
        <div className="rounded-xl px-3.5 py-2.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-500 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <Crosshair className="w-4 h-4 shrink-0" strokeWidth={1.9} />
            <span>{t(lang, 'mapPickModeActive')}</span>
          </div>
          <button
            type="button"
            onClick={() => setPickModeForId(null)}
            className="lp-btn-secondary !py-1 !px-2.5 !text-xs"
          >
            {t(lang, 'mapCancelPickBtn')}
          </button>
        </div>
      )}

      {/* Map Canvas Container */}
      <div className="relative lp-surface rounded-2xl overflow-hidden h-[56vh] min-h-[360px] max-h-[680px]">
        <div ref={containerRef} className="w-full h-full z-0" />

        {/* 0 GPS Sensors Floating Info Banner */}
        {locatedDevices.length === 0 && (
          <div className="absolute top-3 left-3 right-3 sm:right-auto z-[500] lp-surface rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-secondary)] flex items-center gap-2 pointer-events-none">
            <MapPinOff className="w-4 h-4 text-sky-400 shrink-0" strokeWidth={1.85} />
            <span>{t(lang, 'mapZeroGpsBanner')}</span>
          </div>
        )}
      </div>

      {/* Selected Sensor Bottom Sheet / Card */}
      {selectedDevice && selectedProfile && (
        <div className="lp-surface rounded-2xl p-4 border-l-4 border-l-[var(--accent)] space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base text-[var(--text-primary)]">
                  {selectedDevice.name}
                </h3>
                <StatusBadge status={selectedDevice.status} lang={lang} />
              </div>
              <p className="text-xs font-mono text-[var(--text-muted)] mt-0.5">
                {selectedDevice.devEui}
                {selectedDevice.latitude !== null && selectedDevice.longitude !== null
                  ? ` · ${selectedDevice.latitude.toFixed(5)}, ${selectedDevice.longitude.toFixed(5)}`
                  : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedDeviceId(null)}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
              aria-label={t(lang, 'close')}
            >
              <X className="w-4 h-4" strokeWidth={1.9} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="font-bold text-base text-[var(--accent)]">
                {getPrimaryPinText(selectedDevice, selectedProfile, lang)}
              </span>
              <SignalBars
                rssi={selectedDevice.rssi}
                spreadingFactor={selectedDevice.spreadingFactor}
                lang={lang}
              />
              <BatteryGauge
                voltage={selectedDevice.batteryVoltage}
                state={selectedDevice.batteryState}
                chemistry={selectedProfile.batteryChemistry}
                lang={lang}
              />
            </div>
            <span className="text-[var(--text-muted)] font-mono">
              {formatLiveTimestamp(selectedDevice.lastSeenAt, lang, nowMs)}
            </span>
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onOpenDetails(selectedDevice)}
              className="lp-btn-primary !py-1.5 !px-3 text-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.85} />
              {t(lang, 'mapOpenDetailsBtn')}
            </button>

            {canEditSelected && (
              <>
                <button
                  type="button"
                  disabled={savingGps}
                  onClick={() => handleUseSmartphoneGps(selectedDevice)}
                  className="lp-btn-secondary !py-1.5 !px-3 text-xs"
                >
                  <LocateFixed className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.85} />
                  {t(lang, 'mapUseDeviceGpsBtn')}
                </button>

                <button
                  type="button"
                  disabled={savingGps}
                  onClick={() =>
                    setPickModeForId(
                      pickModeForId === selectedDevice.id ? null : selectedDevice.id
                    )
                  }
                  className="lp-btn-secondary !py-1.5 !px-3 text-xs"
                >
                  <Crosshair className="w-3.5 h-3.5" strokeWidth={1.85} />
                  {pickModeForId === selectedDevice.id
                    ? t(lang, 'mapCancelPickBtn')
                    : t(lang, 'mapPickOnMapBtn')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
