import type {
  BatteryChemistry,
  BatteryHealthState,
  Language,
  SensorProfile,
} from './types.js';

export const BUILTIN_SENSOR_PROFILES: SensorProfile[] = [
  {
    id: 'dragino_ds03a_lb',
    name: 'Dragino DS03A-LB (Tür- & Kontaktsensor)',
    localizedName: {
      de: 'Dragino DS03A-LB (Tür- & Kontaktsensor)',
      en: 'Dragino DS03A-LB (Outdoor Door / Contact)',
    },
    brand: 'dragino',
    model: 'ds03a-lb',
    icon: 'door',
    batteryChemistry: 'li_socl2_3v6',
    downlinkIntervalCodec: 'dragino_tdc_port2',
    isBuiltIn: true,
    fields: [
      {
        key: 'DOOR_OPEN_STATUS',
        label: { de: 'Kontaktstatus', en: 'Contact Status' },
        kind: 'contact',
        unit: '',
        isPrimary: true,
        contactLabels: {
          closed: { de: 'Geschlossen', en: 'Closed' },
          open: { de: 'Offen / Ausgelöst', en: 'Open / Triggered' },
        },
      },
      {
        key: 'DOOR_OPEN_TIMES',
        label: { de: 'Öffnungszähler', en: 'Open Count' },
        kind: 'counter',
        unit: '',
        decimals: 0,
      },
      {
        key: 'LAST_DOOR_OPEN_DURATION',
        label: { de: 'Letzte Öffnungsdauer', en: 'Last Open Duration' },
        kind: 'number',
        unit: 'Min.',
        decimals: 0,
      },
      {
        key: 'BAT_V',
        label: { de: 'Batteriespannung', en: 'Battery Voltage' },
        kind: 'battery',
        unit: 'V',
        decimals: 2,
        validMin: 2.0,
        validMax: 4.0,
      },
    ],
  },
  {
    id: 'dragino_d20_lb',
    name: 'Dragino D20-LB (Außentemperatursensor)',
    localizedName: {
      de: 'Dragino D20-LB (Außentemperatursensor)',
      en: 'Dragino D20-LB (Outdoor Temperature)',
    },
    brand: 'dragino',
    model: 'd20-lb',
    icon: 'thermometer',
    batteryChemistry: 'li_socl2_3v6',
    downlinkIntervalCodec: 'dragino_tdc_port2',
    isBuiltIn: true,
    fields: [
      {
        key: 'TempC1',
        label: { de: 'Außentemperatur', en: 'Outdoor Temperature' },
        kind: 'number',
        unit: '°C',
        decimals: 1,
        isPrimary: true,
        validMin: -55,
        validMax: 125,
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
    ],
  },
  {
    id: 'weather_station',
    name: 'Wetterstation',
    localizedName: {
      de: 'Wetterstation',
      en: 'Weather Station',
    },
    brand: 'generic',
    model: 'weather-station',
    icon: 'cloud',
    batteryChemistry: 'li_socl2_3v6',
    downlinkIntervalCodec: 'dragino_tdc_port2',
    isBuiltIn: true,
    fields: [
      {
        key: 'temperature',
        label: { de: 'Temperatur', en: 'Temperature' },
        kind: 'number',
        unit: '°C',
        decimals: 1,
        isPrimary: true,
        validMin: -60,
        validMax: 85,
      },
      {
        key: 'humidity',
        label: { de: 'Luftfeuchte', en: 'Humidity' },
        kind: 'number',
        unit: '%',
        decimals: 0,
        validMin: 0,
        validMax: 100,
      },
      {
        key: 'pressure',
        label: { de: 'Luftdruck', en: 'Barometric Pressure' },
        kind: 'number',
        unit: 'hPa',
        decimals: 0,
        validMin: 800,
        validMax: 1150,
      },
      {
        key: 'windSpeed',
        label: { de: 'Windgeschwindigkeit', en: 'Wind Speed' },
        kind: 'number',
        unit: 'km/h',
        decimals: 1,
        validMin: 0,
        validMax: 250,
      },
      {
        key: 'BatV',
        label: { de: 'Batteriespannung', en: 'Battery Voltage' },
        kind: 'battery',
        unit: 'V',
        decimals: 2,
        validMin: 2.0,
        validMax: 4.5,
      },
    ],
  },
  {
    id: 'generic_json',
    name: 'Generischer LoRaWAN-Sensor (JSON)',
    localizedName: {
      de: 'Generischer LoRaWAN-Sensor (JSON)',
      en: 'Generic LoRaWAN Sensor (JSON)',
    },
    brand: 'generic',
    model: 'generic',
    icon: 'radio',
    batteryChemistry: 'li_socl2_3v6',
    downlinkIntervalCodec: 'none',
    isBuiltIn: true,
    fields: [],
  },
];

export function formatProfileDisplayName(profile: SensorProfile, lang: Language): string {
  const builtIn = BUILTIN_SENSOR_PROFILES.find((p) => p.id === profile.id);
  if (profile.localizedName?.[lang]) return profile.localizedName[lang];
  if (builtIn?.localizedName?.[lang]) return builtIn.localizedName[lang];
  return profile.name;
}

export function evaluateBatteryHealth(
  voltage: number | null | undefined,
  chemistry: BatteryChemistry
): BatteryHealthState {
  if (voltage === null || voltage === undefined || Number.isNaN(voltage)) {
    return 'UNKNOWN';
  }
  if (chemistry === 'none') return 'OK';
  if (chemistry === 'li_socl2_3v6') {
    if (voltage >= 3.4) return 'OK';
    if (voltage >= 3.22) return 'LOW';
    return 'CRITICAL';
  }
  if (voltage >= 2.65) return 'OK';
  if (voltage >= 2.4) return 'LOW';
  return 'CRITICAL';
}

export function encodeDraginoTdcDownlink(intervalMinutes: number): {
  fPort: number;
  payloadBytes: number[];
  payloadHex: string;
  payloadBase64: string;
} {
  const seconds = Math.max(60, Math.min(86400 * 7, Math.round(intervalMinutes * 60)));
  const b1 = (seconds >> 16) & 0xff;
  const b2 = (seconds >> 8) & 0xff;
  const b3 = seconds & 0xff;
  const payloadBytes = [0x01, b1, b2, b3];
  const payloadHex = payloadBytes
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  const binary = String.fromCharCode(...payloadBytes);
  const payloadBase64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(payloadBytes).toString('base64');

  return { fPort: 2, payloadBytes, payloadHex, payloadBase64 };
}

export function decodeDraginoBinaryFallback(
  profileId: string,
  bytes: Uint8Array
): Record<string, unknown> | null {
  if (!bytes || bytes.length < 4) return null;

  if (profileId === 'dragino_ds03a_lb' && bytes.length >= 10) {
    const batMv = ((bytes[0] & 0x3f) << 8) | bytes[1];
    const doorOpenStatus = bytes[0] & 0x80 ? 1 : 0;
    const openTimes = (bytes[3] << 16) | (bytes[4] << 8) | bytes[5];
    const lastDuration = (bytes[6] << 16) | (bytes[7] << 8) | bytes[8];
    const alarm = bytes[9] & 0x01;
    return {
      BAT_V: Math.round((batMv / 1000) * 1000) / 1000,
      DOOR_OPEN_STATUS: doorOpenStatus,
      DOOR_OPEN_TIMES: openTimes,
      LAST_DOOR_OPEN_DURATION: lastDuration,
      ALARM: alarm,
    };
  }

  if (profileId === 'dragino_d20_lb' && bytes.length >= 4) {
    const batMv = ((bytes[0] & 0x3f) << 8) | bytes[1];
    let rawTemp = (bytes[2] << 8) | bytes[3];
    if (rawTemp & 0x8000) rawTemp = rawTemp - 0x10000;
    return {
      BatV: Math.round((batMv / 1000) * 1000) / 1000,
      TempC1: Math.round((rawTemp / 10) * 10) / 10,
    };
  }

  return null;
}

export function detectSensorProfileId(
  versionIds?: { brand_id?: string; model_id?: string } | null,
  decodedPayload?: Record<string, unknown> | null
): string {
  const model = versionIds?.model_id?.toLowerCase() ?? '';
  if (model.includes('ds03a')) return 'dragino_ds03a_lb';
  if (model.includes('d20')) return 'dragino_d20_lb';

  if (decodedPayload) {
    if ('DOOR_OPEN_STATUS' in decodedPayload) return 'dragino_ds03a_lb';
    if ('TempC1' in decodedPayload || 'TempC_DS' in decodedPayload) return 'dragino_d20_lb';
    if ('temperature' in decodedPayload && 'humidity' in decodedPayload) return 'weather_station';
  }
  return 'generic_json';
}
