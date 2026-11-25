import { randomUUID } from 'node:crypto';
import net from 'node:net';
import mqtt, { MqttClient } from 'mqtt';
import {
  BUILTIN_SENSOR_PROFILES,
  decodeDraginoBinaryFallback,
  detectSensorProfileId,
  encodeDraginoTdcDownlink,
  evaluateBatteryHealth,
  type AlertItem,
  type DeviceConfig,
  type DeviceHealthStatus,
  type DownlinkStatus,
  type SensorProfile,
  type TtnApplicationSummary,
  type TtnConnectionStatus,
} from '@lorapulse/shared';
import {
  parseJsonColumn,
  toIso,
  toIsoOrNull,
  toNullableNumber,
  type DbClient,
} from '../db/client.js';
import { decryptSecret } from '../security/crypto.js';
import { loadAllSensorProfiles } from '../services/permissions.js';
import type { SseHub } from '../services/sseHub.js';

interface TtnAppRow {
  id: string;
  name: string;
  ttn_app_id: string;
  host: string;
  port: number;
  use_tls: boolean;
  api_key_encrypted: string;
  masked_api_key: string;
  is_enabled: boolean;
  last_message_at: unknown;
  last_error: string | null;
  created_at: unknown;
}

interface DeviceDbRow {
  id: string;
  ttn_application_id: string;
  category_id: string | null;
  sensor_profile_id: string;
  dev_eui: string;
  ttn_device_id: string;
  name: string;
  config_json: unknown;
  latest_values_json: unknown;
  raw_latest_payload_json: unknown;
  probe_error_fields_json: unknown;
  battery_voltage: number | string | null;
  rssi: number | string | null;
  snr: number | string | null;
  spreading_factor: string | null;
  status: string;
  last_seen_at: unknown;
  pending_downlink_json: unknown;
}

interface ManagedMqttEntry {
  appId: string;
  ttnAppId: string;
  client: MqttClient | null;
  status: TtnConnectionStatus;
}

export function normalizeTtnTarget(
  rawAppId: string,
  rawHost: string,
  rawPort: number
): {
  cleanAppId: string;
  mqttUsername: string;
  cleanHost: string;
  cleanPort: number;
  isIpcSocket: boolean;
} {
  const trimmedApp = rawAppId.trim();
  let cleanAppId = trimmedApp;
  let tenant = 'ttn';
  if (trimmedApp.includes('@')) {
    const [left, right] = trimmedApp.split('@', 2);
    cleanAppId = (left ?? '').trim().toLowerCase();
    tenant = (right ?? '').trim().toLowerCase() || 'ttn';
  } else {
    cleanAppId = trimmedApp.toLowerCase();
  }
  const mqttUsername = `${cleanAppId}@${tenant}`;

  const trimmedHost = rawHost.trim();
  const isIpcSocket = trimmedHost.startsWith('\\\\.\\pipe\\') || trimmedHost.startsWith('/');
  if (isIpcSocket) {
    return {
      cleanAppId,
      mqttUsername,
      cleanHost: trimmedHost,
      cleanPort: rawPort,
      isIpcSocket: true,
    };
  }

  // Strip accidental protocol prefixes and paths pasted from TTN Console
  let hostPart = trimmedHost
    .replace(/^(mqtts?|https?|wss?):\/\//i, '')
    .split('/')[0]
    .trim();

  let cleanPort = rawPort;
  const hostPortMatch = /^([^:]+):(\d+)$/.exec(hostPart);
  if (hostPortMatch) {
    hostPart = hostPortMatch[1].trim();
    const parsedPort = Number.parseInt(hostPortMatch[2], 10);
    if (Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
      cleanPort = parsedPort;
    }
  }

  return {
    cleanAppId,
    mqttUsername,
    cleanHost: hostPart,
    cleanPort,
    isIpcSocket: false,
  };
}

export function extractFieldValue(
  payload: Record<string, unknown>,
  fieldKey: string
): unknown {
  if (Object.prototype.hasOwnProperty.call(payload, fieldKey)) {
    return payload[fieldKey];
  }
  if (!fieldKey.includes('.')) {
    return undefined;
  }
  const parts = fieldKey.split('.');
  let cur: unknown = payload;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function isContactRawOpen(rawVal: unknown): boolean {
  if (typeof rawVal === 'boolean') return rawVal;
  if (typeof rawVal === 'number') return rawVal !== 0;
  if (typeof rawVal === 'string') {
    const upper = rawVal.trim().toUpperCase();
    return upper === '1' || upper === 'TRUE' || upper === 'OPEN' || upper === 'TRIGGERED';
  }
  return false;
}

export async function recomputeAndPersistDeviceStatus(
  db: DbClient,
  deviceId: string
): Promise<DeviceHealthStatus> {
  const [devRes, profiles, openAlertsRes] = await Promise.all([
    db.query<DeviceDbRow>('SELECT * FROM devices WHERE id = $1', [deviceId]),
    loadAllSensorProfiles(db),
    db.query<{ severity: string }>(
      `SELECT severity FROM alerts WHERE device_id = $1 AND status = 'OPEN'`,
      [deviceId]
    ),
  ]);

  const dev = devRes.rows[0];
  if (!dev) return 'NEW';

  const profile =
    profiles.find((p) => p.id === dev.sensor_profile_id) ??
    BUILTIN_SENSOR_PROFILES.find((p) => p.id === dev.sensor_profile_id) ??
    BUILTIN_SENSOR_PROFILES[BUILTIN_SENSOR_PROFILES.length - 1];

  const config = parseJsonColumn<DeviceConfig>(dev.config_json, {});
  const latestValues = parseJsonColumn<Record<string, unknown>>(dev.latest_values_json, {});
  const probeErrors = parseJsonColumn<string[]>(dev.probe_error_fields_json, []);
  const batState = evaluateBatteryHealth(
    toNullableNumber(dev.battery_voltage),
    profile.batteryChemistry
  );

  let contactAlarmActive = false;
  const contactField = profile.fields.find((f) => f.kind === 'contact');
  const contactKey = contactField?.key ?? ('DOOR_OPEN_STATUS' in latestValues ? 'DOOR_OPEN_STATUS' : null);
  if (contactKey && latestValues[contactKey] !== undefined && latestValues[contactKey] !== null) {
    const rawOpen = isContactRawOpen(latestValues[contactKey]);
    const effectiveOpen = config.invertContact ? !rawOpen : rawOpen;
    if (effectiveOpen && config.alertOnOpen !== false) {
      contactAlarmActive = true;
    }
  }

  const hasOpenAlarm = openAlertsRes.rows.some((a) => a.severity === 'ALARM');
  const hasOpenWarn = openAlertsRes.rows.some((a) => a.severity === 'WARN');

  let nextStatus: DeviceHealthStatus;
  if (hasOpenAlarm || contactAlarmActive || batState === 'CRITICAL') {
    nextStatus = 'ALARM';
  } else if (hasOpenWarn || probeErrors.length > 0 || batState === 'LOW') {
    nextStatus = 'WARN';
  } else if (!dev.last_seen_at) {
    nextStatus = 'NEW';
  } else {
    nextStatus = 'OK';
  }

  if (nextStatus !== dev.status) {
    await db.query('UPDATE devices SET status = $1 WHERE id = $2', [nextStatus, deviceId]);
  }
  return nextStatus;
}

export class TtnMqttManager {
  private readonly connections = new Map<string, ManagedMqttEntry>();
  private closed = false;

  constructor(
    private readonly db: DbClient,
    private readonly sseHub: SseHub
  ) {}

  async startAll(): Promise<void> {
    const res = await this.db.query<TtnAppRow>('SELECT * FROM ttn_applications ORDER BY created_at ASC');
    await Promise.all(res.rows.map((row) => this.connectOrSyncRow(row)));
  }

  async reconnectAll(): Promise<void> {
    const res = await this.db.query<TtnAppRow>('SELECT * FROM ttn_applications ORDER BY created_at ASC');
    await Promise.all(res.rows.map((row) => this.connectOrSyncRow(row, true)));
  }

  async syncApplication(appId: string, forceReconnect = false): Promise<TtnApplicationSummary | null> {
    const res = await this.db.query<TtnAppRow>('SELECT * FROM ttn_applications WHERE id = $1', [
      appId,
    ]);
    const row = res.rows[0];
    if (!row) {
      await this.removeApplication(appId);
      return null;
    }
    await this.connectOrSyncRow(row, forceReconnect);
    return this.getApplicationSummary(appId);
  }

  async reconnectApplication(appId: string): Promise<TtnApplicationSummary | null> {
    return this.syncApplication(appId, true);
  }

  async removeApplication(appId: string): Promise<void> {
    const existing = this.connections.get(appId);
    if (existing) {
      this.connections.delete(appId);
      if (existing.client) {
        await new Promise<void>((resolve) => {
          existing.client?.end(true, {}, () => resolve());
        });
      }
    }
  }

  async listApplicationSummaries(): Promise<TtnApplicationSummary[]> {
    const res = await this.db.query<TtnAppRow>(
      'SELECT * FROM ttn_applications ORDER BY created_at ASC'
    );
    return res.rows.map((row) => this.mapAppSummary(row));
  }

  async getApplicationSummary(appId: string): Promise<TtnApplicationSummary | null> {
    const res = await this.db.query<TtnAppRow>('SELECT * FROM ttn_applications WHERE id = $1', [
      appId,
    ]);
    const row = res.rows[0];
    return row ? this.mapAppSummary(row) : null;
  }

  async queueDownlink(deviceId: string, intervalMinutes: number): Promise<void> {
    const devRes = await this.db.query<DeviceDbRow>('SELECT * FROM devices WHERE id = $1', [
      deviceId,
    ]);
    const device = devRes.rows[0];
    if (!device) {
      throw Object.assign(new Error('Device not found'), { statusCode: 404 });
    }

    const appRes = await this.db.query<TtnAppRow>(
      'SELECT * FROM ttn_applications WHERE id = $1',
      [device.ttn_application_id]
    );
    const app = appRes.rows[0];
    if (!app) {
      throw Object.assign(new Error('Associated TTN application not found'), { statusCode: 404 });
    }

    const { mqttUsername } = normalizeTtnTarget(app.ttn_app_id, app.host, app.port);
    const { fPort, payloadHex, payloadBase64 } = encodeDraginoTdcDownlink(intervalMinutes);
    const topic = `v3/${mqttUsername}/devices/${device.ttn_device_id}/down/replace`;
    const ttnDownlinkEnvelope = JSON.stringify({
      downlinks: [
        {
          f_port: fPort,
          frm_payload: payloadBase64,
          priority: 'NORMAL',
        },
      ],
    });

    const nowIso = new Date().toISOString();
    const pendingDownlink: DownlinkStatus = {
      intervalMinutes,
      fPort,
      payloadHex,
      state: 'QUEUED',
      queuedAt: nowIso,
      updatedAt: nowIso,
    };

    const existingConfig = parseJsonColumn<DeviceConfig>(device.config_json, {});
    const updatedConfig: DeviceConfig = {
      ...existingConfig,
      expectedIntervalSec: intervalMinutes * 60,
    };

    await this.db.query(
      `UPDATE devices
       SET pending_downlink_json = $1::jsonb,
           config_json = $2::jsonb
       WHERE id = $3`,
      [JSON.stringify(pendingDownlink), JSON.stringify(updatedConfig), device.id]
    );

    const managed = this.connections.get(app.id);
    if (managed?.client) {
      if (managed.client.connected) {
        await new Promise<void>((resolve, reject) => {
          managed.client?.publish(topic, ttnDownlinkEnvelope, { qos: 1 }, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } else {
        // Queue in mqtt.js outgoing buffer if currently reconnecting
        managed.client.publish(topic, ttnDownlinkEnvelope, { qos: 1 });
      }
    }

    await this.sseHub.broadcastDeviceUpdated(device.id);
  }

  async closeAll(): Promise<void> {
    this.closed = true;
    const entries = Array.from(this.connections.values());
    this.connections.clear();
    await Promise.all(
      entries.map(
        (entry) =>
          new Promise<void>((resolve) => {
            if (!entry.client) {
              resolve();
              return;
            }
            entry.client.end(true, {}, () => resolve());
          })
      )
    );
  }

  private mapAppSummary(row: TtnAppRow): TtnApplicationSummary {
    const managed = this.connections.get(row.id);
    const connectionStatus: TtnConnectionStatus = !row.is_enabled
      ? 'DISCONNECTED'
      : managed?.status ?? (row.last_error ? 'ERROR' : 'DISCONNECTED');

    return {
      id: row.id,
      name: row.name,
      ttnAppId: row.ttn_app_id,
      host: row.host,
      port: Number(row.port),
      useTls: Boolean(row.use_tls),
      maskedApiKey: row.masked_api_key,
      isEnabled: Boolean(row.is_enabled),
      connectionStatus,
      lastMessageAt: toIsoOrNull(row.last_message_at),
      lastError: row.last_error ?? null,
      createdAt: toIso(row.created_at),
    };
  }

  private async connectOrSyncRow(row: TtnAppRow, forceReconnect = false): Promise<void> {
    if (this.closed) return;

    const existing = this.connections.get(row.id);
    if (existing && (forceReconnect || !row.is_enabled || existing.ttnAppId !== row.ttn_app_id)) {
      await this.removeApplication(row.id);
    } else if (existing && row.is_enabled) {
      return;
    }

    if (!row.is_enabled) {
      this.connections.set(row.id, {
        appId: row.id,
        ttnAppId: row.ttn_app_id,
        client: null,
        status: 'DISCONNECTED',
      });
      return;
    }

    let plainApiKey: string;
    try {
      plainApiKey = decryptSecret(row.api_key_encrypted);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to decrypt TTN API key';
      await this.db.query('UPDATE ttn_applications SET last_error = $1 WHERE id = $2', [
        msg,
        row.id,
      ]);
      this.connections.set(row.id, {
        appId: row.id,
        ttnAppId: row.ttn_app_id,
        client: null,
        status: 'ERROR',
      });
      return;
    }

    const {
      cleanAppId,
      mqttUsername: username,
      cleanHost,
      cleanPort,
      isIpcSocket,
    } = normalizeTtnTarget(row.ttn_app_id, row.host, Number(row.port));

    const protocol = row.use_tls ? 'mqtts' : 'mqtt';
    const brokerUrl = `${protocol}://${cleanHost}:${cleanPort}`;

    const entry: ManagedMqttEntry = {
      appId: row.id,
      ttnAppId: row.ttn_app_id,
      client: null,
      status: 'CONNECTING',
    };
    this.connections.set(row.id, entry);

    const mqttOptions = {
      username,
      password: plainApiKey.trim(),
      clientId: `lorapulse_${row.id.slice(0, 8)}_${randomUUID().slice(0, 6)}`,
      reconnectPeriod: 5_000,
      connectTimeout: 8_000,
      clean: true,
    };

    const client = isIpcSocket
      ? new MqttClient(() => net.connect(cleanHost), mqttOptions)
      : mqtt.connect(brokerUrl, mqttOptions);
    entry.client = client;

    const uplinkTopics = [
      `v3/${username}/devices/+/up`,
      `v3/${username}/devices/+/join`,
    ];
    const downlinkFeedbackTopics = [
      `v3/${username}/devices/+/down/sent`,
      `v3/${username}/devices/+/down/ack`,
      `v3/${username}/devices/+/down/failed`,
    ];

    let settledInitial = false;
    let resolveInitial: (() => void) | null = null;
    const initialReadyPromise = new Promise<void>((resolve) => {
      resolveInitial = () => {
        if (!settledInitial) {
          settledInitial = true;
          resolve();
        }
      };
    });

    client.on('connect', () => {
      if (this.closed) return;
      client.subscribe(uplinkTopics, { qos: 1 }, (subErr, granted) => {
        if (this.closed) return;
        const rejected = granted?.some((g) => Number(g.qos) >= 128);
        if (subErr || rejected) {
          entry.status = 'ERROR';
          const reason =
            subErr?.message ||
            `TTN rejected MQTT topic subscription for "${username}" (check Application ID and API key 'Read application traffic' permission)`;
          void this.handleStatusUpdate(row.id, reason);
          resolveInitial?.();
          return;
        }

        entry.status = 'CONNECTED';
        void this.handleStatusUpdate(row.id, null);

        // Subscribe to downlink feedback separately so read-only API keys never break uplink reception
        client.subscribe(downlinkFeedbackTopics, { qos: 1 }, () => {});

        // Optional non-blocking backfill from TTN Storage Integration (last 24h) if enabled on TTN
        if (!isIpcSocket && row.use_tls && cleanHost !== '127.0.0.1' && cleanHost !== 'localhost') {
          void this.tryBackfillFromTtnStorage(row.id, cleanAppId, cleanHost, plainApiKey.trim());
        }

        resolveInitial?.();
      });
    });

    client.on('reconnect', () => {
      if (this.closed) return;
      if (entry.status !== 'ERROR') {
        entry.status = 'CONNECTING';
        void this.emitSummaryIfPresent(row.id);
      }
    });

    client.on('close', () => {
      if (this.closed) return;
      if (entry.status === 'CONNECTED') {
        entry.status = 'DISCONNECTED';
        void this.emitSummaryIfPresent(row.id);
      }
    });

    client.on('error', (err) => {
      if (this.closed) return;
      entry.status = 'ERROR';
      resolveInitial?.();
      void this.handleStatusUpdate(row.id, err.message || 'MQTT connection error');
    });

    client.on('message', (topic, payloadBuf) => {
      if (this.closed) return;
      void this.handleIncomingMessage(row.id, row.ttn_app_id, topic, payloadBuf).catch((err) => {
        console.error(`[LoRaPulse][MQTT] Failed processing packet on ${topic}:`, err);
      });
    });

    // Give local/fast brokers up to 1.2s to finish initial connect + subscribe synchronously
    const timeoutTimer = setTimeout(() => {
      resolveInitial?.();
    }, 1_200);
    timeoutTimer.unref();
    await initialReadyPromise;
    clearTimeout(timeoutTimer);
  }

  private async handleStatusUpdate(appId: string, lastError: string | null): Promise<void> {
    if (this.closed) return;
    try {
      await this.db.query('UPDATE ttn_applications SET last_error = $1 WHERE id = $2', [
        lastError,
        appId,
      ]);
      await this.emitSummaryIfPresent(appId);
    } catch {
      // Ignore if DB is closing
    }
  }

  private async emitSummaryIfPresent(appId: string): Promise<void> {
    if (this.closed) return;
    try {
      const summary = await this.getApplicationSummary(appId);
      if (summary) {
        await this.sseHub.broadcastTtnStatus(summary);
      }
    } catch {
      // Ignore if DB is closing
    }
  }

  private async handleIncomingMessage(
    appDbId: string,
    ttnAppId: string,
    topic: string,
    payloadBuf: Buffer
  ): Promise<void> {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payloadBuf.toString('utf8')) as Record<string, unknown>;
    } catch {
      return;
    }

    await this.db.query(
      'UPDATE ttn_applications SET last_message_at = NOW(), last_error = NULL WHERE id = $1',
      [appDbId]
    );

    if (topic.endsWith('/up')) {
      await this.processUplink(appDbId, ttnAppId, topic, parsed);
    } else if (topic.endsWith('/join')) {
      await this.processJoinAccept(appDbId, topic, parsed);
    } else if (topic.endsWith('/down/sent') || topic.endsWith('/down/ack')) {
      await this.processDownlinkFeedback(appDbId, topic, parsed, 'SENT');
    } else if (topic.endsWith('/down/failed')) {
      await this.processDownlinkFeedback(appDbId, topic, parsed, 'FAILED');
    }
  }

  private async processJoinAccept(
    appDbId: string,
    topic: string,
    parsed: Record<string, unknown>
  ): Promise<void> {
    const parts = topic.split('/');
    const topicDeviceId = parts.length >= 4 ? parts[3] : '';
    const endIds = (parsed.end_device_ids as Record<string, unknown> | undefined) ?? {};
    const rawDevEui = typeof endIds.dev_eui === 'string' ? endIds.dev_eui.trim().toUpperCase() : '';
    const ttnDeviceId =
      (typeof endIds.device_id === 'string' && endIds.device_id.trim()) ||
      topicDeviceId ||
      rawDevEui.toLowerCase();
    if (!ttnDeviceId && !rawDevEui) return;

    const devEui =
      rawDevEui || `AUTO_${ttnDeviceId.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)}`;

    const existing = await this.db.query<{ id: string }>(
      'SELECT id FROM devices WHERE dev_eui = $1 LIMIT 1',
      [devEui]
    );
    if (!existing.rows[0]) {
      const newId = randomUUID();
      await this.db.query(
        `INSERT INTO devices (
           id, ttn_application_id, category_id, sensor_profile_id, dev_eui, ttn_device_id, name, status, last_seen_at
         )
         VALUES ($1, $2, NULL, 'generic_json', $3, $4, $5, 'NEW', NOW())
         ON CONFLICT (dev_eui) DO NOTHING`,
        [newId, appDbId, devEui, ttnDeviceId, ttnDeviceId || devEui]
      );
      await this.sseHub.broadcastDeviceUpdated(newId);
    }
  }

  private async tryBackfillFromTtnStorage(
    appDbId: string,
    cleanAppId: string,
    cleanHost: string,
    plainApiKey: string
  ): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7_000);
    timer.unref();
    try {
      const url = `https://${cleanHost}/api/v3/as/applications/${encodeURIComponent(
        cleanAppId
      )}/packages/storage/uplink_message?last=24h`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${plainApiKey}`,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      });
      if (!res.ok) return;

      const text = await res.text();
      const lines = text.split('\n');
      for (const rawLine of lines) {
        if (this.closed) return;
        const line = rawLine.replace(/^data:\s*/, '').trim();
        if (!line.startsWith('{')) continue;
        try {
          const wrapper = JSON.parse(line) as Record<string, unknown>;
          const msg =
            wrapper.result && typeof wrapper.result === 'object'
              ? (wrapper.result as Record<string, unknown>)
              : wrapper;
          if (msg.uplink_message && msg.end_device_ids) {
            await this.db.query(
              'UPDATE ttn_applications SET last_message_at = COALESCE(last_message_at, NOW()) WHERE id = $1',
              [appDbId]
            );
            await this.processUplink(appDbId, cleanAppId, `v3/${cleanAppId}@ttn/devices/storage/up`, msg);
          }
        } catch {
          // Ignore malformed line
        }
      }
    } catch {
      // Storage integration is optional on TTN; ignore network/404 errors silently
    } finally {
      clearTimeout(timer);
    }
  }

  private async processDownlinkFeedback(
    appDbId: string,
    topic: string,
    parsed: Record<string, unknown>,
    targetState: 'SENT' | 'FAILED'
  ): Promise<void> {
    const parts = topic.split('/');
    const topicDeviceId = parts.length >= 4 ? parts[3] : '';
    const endIds = (parsed.end_device_ids as Record<string, unknown> | undefined) ?? {};
    const msgDeviceId = typeof endIds.device_id === 'string' ? endIds.device_id.trim() : '';
    const msgDevEui = typeof endIds.dev_eui === 'string' ? endIds.dev_eui.trim().toUpperCase() : '';

    const lookupDeviceId = msgDeviceId || topicDeviceId;

    const devRes = await this.db.query<DeviceDbRow>(
      `SELECT * FROM devices
       WHERE ttn_application_id = $1
         AND (ttn_device_id = $2 OR ($3 <> '' AND dev_eui = $3))
       LIMIT 1`,
      [appDbId, lookupDeviceId, msgDevEui]
    );
    const device = devRes.rows[0];
    if (!device) return;

    const existingDownlink = parseJsonColumn<DownlinkStatus | null>(
      device.pending_downlink_json,
      null
    );
    const nowIso = new Date().toISOString();

    let errorText: string | undefined;
    if (targetState === 'FAILED') {
      const failedObj = parsed.downlink_failed as Record<string, unknown> | undefined;
      const errObj = (failedObj?.error ?? parsed.error) as Record<string, unknown> | undefined;
      errorText =
        typeof errObj?.message_format === 'string'
          ? errObj.message_format
          : typeof errObj?.message === 'string'
            ? errObj.message
            : 'TTN downlink delivery failed';
    }

    const updatedDownlink: DownlinkStatus = existingDownlink
      ? {
          ...existingDownlink,
          state: targetState,
          updatedAt: nowIso,
          ...(errorText ? { error: errorText } : { error: undefined }),
        }
      : {
          intervalMinutes: 0,
          fPort: 2,
          payloadHex: '',
          state: targetState,
          queuedAt: nowIso,
          updatedAt: nowIso,
          ...(errorText ? { error: errorText } : {}),
        };

    await this.db.query(
      'UPDATE devices SET pending_downlink_json = $1::jsonb WHERE id = $2',
      [JSON.stringify(updatedDownlink), device.id]
    );
    await this.sseHub.broadcastDeviceUpdated(device.id);
  }

  private async processUplink(
    appDbId: string,
    _ttnAppId: string,
    topic: string,
    parsed: Record<string, unknown>
  ): Promise<void> {
    const parts = topic.split('/');
    const topicDeviceId = parts.length >= 4 ? parts[3] : '';

    const endIds = (parsed.end_device_ids as Record<string, unknown> | undefined) ?? {};
    const rawDevEui = typeof endIds.dev_eui === 'string' ? endIds.dev_eui.trim().toUpperCase() : '';
    const ttnDeviceId =
      (typeof endIds.device_id === 'string' && endIds.device_id.trim()) ||
      topicDeviceId ||
      rawDevEui.toLowerCase();

    const devEui = rawDevEui || `AUTO_${ttnDeviceId.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)}`;
    if (!ttnDeviceId && !rawDevEui) return;

    const uplink = (parsed.uplink_message as Record<string, unknown> | undefined) ?? {};
    const fCnt = typeof uplink.f_cnt === 'number' ? Math.trunc(uplink.f_cnt) : null;
    const fPort = typeof uplink.f_port === 'number' ? Math.trunc(uplink.f_port) : null;

    const rxList = Array.isArray(uplink.rx_metadata) ? uplink.rx_metadata : [];
    const rx0 =
      rxList.length > 0 && typeof rxList[0] === 'object' && rxList[0] !== null
        ? (rxList[0] as Record<string, unknown>)
        : null;

    const rssi =
      rx0 && typeof rx0.rssi === 'number' && Number.isFinite(rx0.rssi)
        ? Math.round(rx0.rssi)
        : null;
    const snr =
      rx0 && typeof rx0.snr === 'number' && Number.isFinite(rx0.snr) ? rx0.snr : null;

    const settings = (uplink.settings as Record<string, unknown> | undefined) ?? {};
    const dataRate = (settings.data_rate as Record<string, unknown> | undefined) ?? {};
    const lora = (dataRate.lora as Record<string, unknown> | undefined) ?? {};
    let spreadingFactor: string | null = null;
    if (typeof lora.spreading_factor === 'number') {
      spreadingFactor = `SF${lora.spreading_factor}`;
    } else if (typeof lora.spreading_factor === 'string' && lora.spreading_factor.trim()) {
      const sfStr = lora.spreading_factor.trim().toUpperCase();
      spreadingFactor = sfStr.startsWith('SF') ? sfStr : `SF${sfStr}`;
    }

    const versionIds =
      uplink.version_ids && typeof uplink.version_ids === 'object'
        ? (uplink.version_ids as { brand_id?: string; model_id?: string })
        : null;

    let decodedPayload: Record<string, unknown> | null =
      uplink.decoded_payload &&
      typeof uplink.decoded_payload === 'object' &&
      !Array.isArray(uplink.decoded_payload) &&
      Object.keys(uplink.decoded_payload as Record<string, unknown>).length > 0
        ? (uplink.decoded_payload as Record<string, unknown>)
        : null;

    const frmPayload = typeof uplink.frm_payload === 'string' ? uplink.frm_payload.trim() : null;

    // 1. Lookup or Auto-Discover Device
    let devRes = await this.db.query<DeviceDbRow>('SELECT * FROM devices WHERE dev_eui = $1', [
      devEui,
    ]);
    let device = devRes.rows[0];

    if (!device) {
      let detectedProfileId = detectSensorProfileId(versionIds, decodedPayload);
      if (!decodedPayload && frmPayload && detectedProfileId !== 'generic_json') {
        const bytes = new Uint8Array(Buffer.from(frmPayload, 'base64'));
        decodedPayload = decodeDraginoBinaryFallback(detectedProfileId, bytes);
      } else if (!decodedPayload && frmPayload && detectedProfileId === 'generic_json') {
        // Heuristic check if raw binary matches 10-byte DS03A or 4-byte D20 only when versionIds hinted Dragino
        const brand = versionIds?.brand_id?.toLowerCase() ?? '';
        if (brand.includes('dragino')) {
          const bytes = new Uint8Array(Buffer.from(frmPayload, 'base64'));
          const tryDs03 = decodeDraginoBinaryFallback('dragino_ds03a_lb', bytes);
          if (tryDs03) {
            detectedProfileId = 'dragino_ds03a_lb';
            decodedPayload = tryDs03;
          }
        }
      }

      const newId = randomUUID();
      await this.db.query(
        `INSERT INTO devices (
           id, ttn_application_id, category_id, sensor_profile_id, dev_eui, ttn_device_id, name, status
         )
         VALUES ($1, $2, NULL, $3, $4, $5, $6, 'NEW')
         ON CONFLICT (dev_eui) DO NOTHING`,
        [newId, appDbId, detectedProfileId, devEui, ttnDeviceId, ttnDeviceId || devEui]
      );

      devRes = await this.db.query<DeviceDbRow>('SELECT * FROM devices WHERE dev_eui = $1', [
        devEui,
      ]);
      device = devRes.rows[0];
      if (!device) return;
    }

    // 2. Duplicate Frame-Counter Guard (within 5 minutes)
    if (fCnt !== null) {
      const lastMeasRes = await this.db.query<{ f_cnt: number | null; received_at: unknown }>(
        `SELECT f_cnt, received_at
         FROM measurements
         WHERE device_id = $1
         ORDER BY received_at DESC, id DESC
         LIMIT 1`,
        [device.id]
      );
      const lastMeas = lastMeasRes.rows[0];
      if (
        lastMeas &&
        lastMeas.f_cnt !== null &&
        Number(lastMeas.f_cnt) === fCnt &&
        Date.now() - new Date(toIso(lastMeas.received_at)).getTime() < 5 * 60_000
      ) {
        return;
      }
    }

    // 3. Binary Fallback Decoder if decoded_payload is missing
    if (!decodedPayload && frmPayload) {
      const bytes = new Uint8Array(Buffer.from(frmPayload, 'base64'));
      decodedPayload = decodeDraginoBinaryFallback(device.sensor_profile_id, bytes);
    }

    const effectivePayload: Record<string, unknown> =
      decodedPayload ?? (frmPayload ? { frm_payload: frmPayload } : {});

    // 4. Load Profile & Validate Field Bounds (Plausibility / Probe Error Filter)
    const allProfiles = await loadAllSensorProfiles(this.db);
    const profile: SensorProfile =
      allProfiles.find((p) => p.id === device.sensor_profile_id) ??
      BUILTIN_SENSOR_PROFILES.find((p) => p.id === device.sensor_profile_id) ??
      BUILTIN_SENSOR_PROFILES[BUILTIN_SENSOR_PROFILES.length - 1];

    const config = parseJsonColumn<DeviceConfig>(device.config_json, {});
    const nextLatestValues = {
      ...parseJsonColumn<Record<string, number | string | boolean | null>>(
        device.latest_values_json,
        {}
      ),
    };
    const probeErrorSet = new Set<string>(
      parseJsonColumn<string[]>(device.probe_error_fields_json, [])
    );
    const managedKeys = new Set<string>(profile.fields.map((f) => f.key));

    for (const field of profile.fields) {
      const rawVal = extractFieldValue(effectivePayload, field.key);
      if (rawVal === undefined) {
        // Partial payload: preserve previous known value & probe error state
        continue;
      }

      if (field.kind === 'number' || field.kind === 'battery' || field.kind === 'counter') {
        const num =
          typeof rawVal === 'number'
            ? rawVal
            : typeof rawVal === 'string' && rawVal.trim() !== ''
              ? Number(rawVal)
              : Number.NaN;

        const outOfRange =
          !Number.isFinite(num) ||
          (field.validMin !== undefined && num < field.validMin) ||
          (field.validMax !== undefined && num > field.validMax);

        if (outOfRange) {
          probeErrorSet.add(field.key);
          // Do not treat hardware fault code (e.g. -999 or 327.67) as a valid temperature!
          if (!(field.key in nextLatestValues)) {
            nextLatestValues[field.key] = null;
          }
        } else {
          probeErrorSet.delete(field.key);
          nextLatestValues[field.key] = num;
        }
      } else if (field.kind === 'contact') {
        probeErrorSet.delete(field.key);
        if (
          typeof rawVal === 'number' ||
          typeof rawVal === 'boolean' ||
          typeof rawVal === 'string'
        ) {
          nextLatestValues[field.key] = rawVal;
        } else {
          nextLatestValues[field.key] = isContactRawOpen(rawVal) ? 1 : 0;
        }
      }
    }

    // Also include extra flat scalar payload fields (for generic_json or unmapped telemetry)
    for (const [k, v] of Object.entries(effectivePayload)) {
      if (managedKeys.has(k)) continue;
      if (
        v === null ||
        typeof v === 'number' ||
        typeof v === 'string' ||
        typeof v === 'boolean'
      ) {
        if (typeof v === 'number' && !Number.isFinite(v)) continue;
        nextLatestValues[k] = v;
      }
    }

    // 5. Extract Battery Voltage & Evaluate Health
    let batteryVoltage = toNullableNumber(device.battery_voltage);
    const batField = profile.fields.find((f) => f.kind === 'battery');
    if (batField && !probeErrorSet.has(batField.key)) {
      const candidate = nextLatestValues[batField.key];
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        batteryVoltage = candidate;
      }
    } else {
      const rawBat =
        effectivePayload.BatV ??
        effectivePayload.BAT_V ??
        effectivePayload.battery ??
        effectivePayload.batV;
      const parsedBat = typeof rawBat === 'number' ? rawBat : Number(rawBat);
      if (Number.isFinite(parsedBat) && parsedBat >= 1.5 && parsedBat <= 5.0) {
        batteryVoltage = parsedBat;
      }
    }

    const batteryState = evaluateBatteryHealth(batteryVoltage, profile.batteryChemistry);

    // 6. Evaluate Contact & Temperature Threshold Alerts
    const emittedAlerts: AlertItem[] = [];

    // 6a. Contact Trigger Check (DOOR_OPEN_STATUS or profile contact field)
    const contactField = profile.fields.find((f) => f.kind === 'contact');
    const contactKey =
      contactField?.key ??
      ('DOOR_OPEN_STATUS' in effectivePayload ? 'DOOR_OPEN_STATUS' : null);

    let contactCurrentlyOpen = false;
    if (contactKey) {
      const contactRaw = extractFieldValue(effectivePayload, contactKey);
      if (contactRaw !== undefined && contactRaw !== null) {
        const rawOpen = isContactRawOpen(contactRaw);
        const effectiveOpen = config.invertContact ? !rawOpen : rawOpen;
        if (effectiveOpen && config.alertOnOpen !== false) {
          contactCurrentlyOpen = true;
          const created = await this.ensureOpenAlert(device.id, device.name, {
            alertType: 'CONTACT_TRIGGER',
            severity: 'ALARM',
            messageDe: `Kontakt ausgelöst an Sensor „${device.name}“`,
            messageEn: `Contact triggered on sensor "${device.name}"`,
          });
          if (created) emittedAlerts.push(created);
        }
      }
    }

    // 6b. Temperature Threshold Check (only for non-probe-errored valid numeric readings!)
    if (
      typeof config.tempMinThreshold === 'number' ||
      typeof config.tempMaxThreshold === 'number'
    ) {
      const candidateTempKeys = [
        profile.fields.find((f) => f.kind === 'number' && f.isPrimary)?.key,
        'TempC1',
        'temperature',
        'TempC_DS',
      ].filter((k): k is string => Boolean(k));

      let validTemp: number | null = null;
      for (const tKey of candidateTempKeys) {
        if (probeErrorSet.has(tKey)) continue;
        const freshRaw = extractFieldValue(effectivePayload, tKey);
        if (freshRaw === undefined) continue;
        const val = nextLatestValues[tKey];
        if (typeof val === 'number' && Number.isFinite(val)) {
          validTemp = val;
          break;
        }
      }

      if (validTemp !== null) {
        if (
          typeof config.tempMaxThreshold === 'number' &&
          validTemp > config.tempMaxThreshold
        ) {
          const created = await this.ensureOpenAlert(device.id, device.name, {
            alertType: 'THRESHOLD',
            severity: 'ALARM',
            messageDe: `Temperatur-Obergrenze überschritten (${validTemp.toFixed(1)} °C > ${config.tempMaxThreshold.toFixed(1)} °C)`,
            messageEn: `Upper temperature threshold exceeded (${validTemp.toFixed(1)} °C > ${config.tempMaxThreshold.toFixed(1)} °C)`,
          });
          if (created) emittedAlerts.push(created);
        } else if (
          typeof config.tempMinThreshold === 'number' &&
          validTemp < config.tempMinThreshold
        ) {
          const created = await this.ensureOpenAlert(device.id, device.name, {
            alertType: 'THRESHOLD',
            severity: 'ALARM',
            messageDe: `Temperatur-Untergrenze unterschritten (${validTemp.toFixed(1)} °C < ${config.tempMinThreshold.toFixed(1)} °C)`,
            messageEn: `Lower temperature threshold breached (${validTemp.toFixed(1)} °C < ${config.tempMinThreshold.toFixed(1)} °C)`,
          });
          if (created) emittedAlerts.push(created);
        }
      }
    }

    // 6c. Critical Battery Alert
    if (batteryState === 'CRITICAL' && batteryVoltage !== null) {
      const created = await this.ensureOpenAlert(device.id, device.name, {
        alertType: 'LOW_BATTERY',
        severity: 'ALARM',
        messageDe: `Kritische Batteriespannung (${batteryVoltage.toFixed(2)} V) bei „${device.name}“`,
        messageEn: `Critical battery voltage (${batteryVoltage.toFixed(2)} V) on "${device.name}"`,
      });
      if (created) emittedAlerts.push(created);
    }

    // 7. Determine Device Status & Persist Measurement + Device Hot-Cache
    const receivedAtIso =
      typeof parsed.received_at === 'string' && !Number.isNaN(new Date(parsed.received_at).getTime())
        ? new Date(parsed.received_at).toISOString()
        : new Date().toISOString();

    await this.db.query(
      `INSERT INTO measurements (
         device_id, received_at, f_cnt, f_port, rssi, snr, spreading_factor, payload_json
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        device.id,
        receivedAtIso,
        fCnt,
        fPort,
        rssi,
        snr,
        spreadingFactor,
        JSON.stringify(effectivePayload),
      ]
    );

    const openAlertsRes = await this.db.query<{ severity: string }>(
      `SELECT severity FROM alerts WHERE device_id = $1 AND status = 'OPEN'`,
      [device.id]
    );
    const hasOpenAlarm = openAlertsRes.rows.some((a) => a.severity === 'ALARM');
    const hasOpenWarn = openAlertsRes.rows.some((a) => a.severity === 'WARN');

    const probeErrorFields = Array.from(probeErrorSet);
    let nextStatus: DeviceHealthStatus;
    if (hasOpenAlarm || contactCurrentlyOpen || batteryState === 'CRITICAL') {
      nextStatus = 'ALARM';
    } else if (hasOpenWarn || probeErrorFields.length > 0 || batteryState === 'LOW') {
      nextStatus = 'WARN';
    } else {
      nextStatus = 'OK';
    }

    await this.db.query(
      `UPDATE devices
       SET latest_values_json = $1::jsonb,
           raw_latest_payload_json = $2::jsonb,
           probe_error_fields_json = $3::jsonb,
           battery_voltage = $4,
           rssi = COALESCE($5, rssi),
           snr = COALESCE($6, snr),
           spreading_factor = COALESCE($7, spreading_factor),
           status = $8,
           last_seen_at = $9
       WHERE id = $10`,
      [
        JSON.stringify(nextLatestValues),
        JSON.stringify(effectivePayload),
        JSON.stringify(probeErrorFields),
        batteryVoltage,
        rssi,
        snr,
        spreadingFactor,
        nextStatus,
        receivedAtIso,
        device.id,
      ]
    );

    for (const alert of emittedAlerts) {
      await this.sseHub.broadcastAlertUpdated(alert);
    }
    await this.sseHub.broadcastDeviceUpdated(device.id);
  }

  private async ensureOpenAlert(
    deviceId: string,
    deviceName: string,
    input: {
      alertType: AlertItem['alertType'];
      severity: AlertItem['severity'];
      messageDe: string;
      messageEn: string;
    }
  ): Promise<AlertItem | null> {
    const existing = await this.db.query<{ id: string }>(
      `SELECT id FROM alerts
       WHERE device_id = $1 AND alert_type = $2 AND status = 'OPEN'
       LIMIT 1`,
      [deviceId, input.alertType]
    );
    if (existing.rows.length > 0) {
      return null;
    }

    const id = randomUUID();
    const res = await this.db.query<{ created_at: unknown }>(
      `INSERT INTO alerts (
         id, device_id, alert_type, severity, message_de, message_en, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'OPEN')
       RETURNING created_at`,
      [id, deviceId, input.alertType, input.severity, input.messageDe, input.messageEn]
    );

    return {
      id,
      deviceId,
      deviceName,
      alertType: input.alertType,
      severity: input.severity,
      messageDe: input.messageDe,
      messageEn: input.messageEn,
      status: 'OPEN',
      ackedByName: null,
      ackedAt: null,
      createdAt: toIso(res.rows[0]?.created_at),
    };
  }
}
