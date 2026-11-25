import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createServer, type AddressInfo, type Server as NetServer, type Socket } from 'node:net';
import aedesPkg, {
  type AedesOptions,
  type AuthenticateError,
  type Client as AedesClient,
  type PublishPacket,
} from 'aedes';

type AedesInstance = InstanceType<typeof aedesPkg.default>;
type CreateBrokerFn = (options?: AedesOptions) => AedesInstance;

const createAedesBroker: CreateBrokerFn =
  typeof (aedesPkg as unknown as { createBroker?: CreateBrokerFn }).createBroker === 'function'
    ? (aedesPkg as unknown as { createBroker: CreateBrokerFn }).createBroker
    : (aedesPkg as unknown as CreateBrokerFn);

export interface TtnSimulatorOptions {
  /** TCP port for the MQTT broker. Defaults to 0 (ephemeral OS-assigned port). */
  port?: number;
  /** Bind address for the MQTT broker. Defaults to '127.0.0.1'. */
  host?: string;
  /** Optional IPC path (Windows Named Pipe or Unix domain socket) instead of TCP host/port. */
  ipcPath?: string;
  /** Simulated TTN v3 Application ID. Defaults to 'lorapulse-sim'. */
  ttnAppId?: string;
  /** Optional TTN API key verified against the MQTT password during CONNECT. */
  expectedApiKey?: string;
}

export interface TtnVersionIds {
  brand_id?: string;
  model_id?: string;
  hardware_version?: string;
  firmware_version?: string;
  band_id?: string;
}

export interface TtnRxMetadataItem {
  gateway_ids: {
    gateway_id: string;
    eui: string;
  };
  time: string;
  timestamp: number;
  rssi: number;
  channel_rssi: number;
  snr: number;
}

export interface TtnUplinkMessage {
  end_device_ids: {
    device_id: string;
    application_ids: {
      application_id: string;
    };
    dev_eui: string;
    join_eui: string;
    dev_addr: string;
  };
  correlation_ids: string[];
  received_at: string;
  uplink_message: {
    session_key_id: string;
    f_port: number;
    f_cnt: number;
    frm_payload: string;
    decoded_payload?: Record<string, unknown>;
    rx_metadata: TtnRxMetadataItem[];
    settings: {
      data_rate: {
        lora: {
          bandwidth: number;
          spreading_factor: number;
          coding_rate: string;
        };
      };
      frequency: string;
      timestamp: number;
      time: string;
    };
    received_at: string;
    consumed_airtime: string;
    version_ids?: TtnVersionIds;
  };
}

export interface BaseUplinkOptions {
  deviceId?: string;
  devEui?: string;
  fPort?: number;
  fCnt?: number;
  rssi?: number;
  snr?: number;
  spreadingFactor?: number | string;
  gatewayId?: string;
  receivedAt?: string;
}

export interface Ds03aUplinkOptions extends BaseUplinkOptions {
  doorOpen?: boolean;
  DOOR_OPEN_STATUS?: 0 | 1 | boolean;
  doorOpenTimes?: number;
  DOOR_OPEN_TIMES?: number;
  lastDoorOpenDuration?: number;
  LAST_DOOR_OPEN_DURATION?: number;
  batV?: number;
  BAT_V?: number;
  alarm?: boolean | 0 | 1;
}

export interface D20UplinkOptions extends BaseUplinkOptions {
  tempC1?: number;
  TempC1?: number;
  batV?: number;
  BatV?: number;
  /** When true, emits TempC1 = -999 to simulate a disconnected or faulty external probe. */
  probeError?: boolean;
}

export interface WeatherUplinkOptions extends BaseUplinkOptions {
  temperature?: number;
  humidity?: number;
  pressure?: number;
  windSpeed?: number;
  batV?: number;
  BatV?: number;
}

export interface RawHexUplinkOptions extends BaseUplinkOptions {
  /** Hexadecimal payload (e.g. '8E1A0100000300000200'). Encoded to Base64 in frm_payload without decoded_payload. */
  payloadHex?: string;
  /** Optional pre-encoded Base64 payload if payloadHex is omitted. */
  frmPayloadBase64?: string;
  /** Optional TTN version_ids; omitted by default to exercise pure binary fallback paths. */
  versionIds?: TtnVersionIds | null;
}

export interface CustomUplinkOptions extends BaseUplinkOptions {
  decodedPayload?: Record<string, unknown>;
  frmPayloadBase64?: string;
  versionIds?: TtnVersionIds;
}

export interface DownlinkWireItem {
  f_port?: number;
  frm_payload?: string;
  priority?: string;
  confirmed?: boolean;
  correlation_ids?: string[];
}

export interface DownlinkHistoryEntry {
  id: string;
  deviceId: string;
  topic: string;
  mode: 'replace' | 'push';
  fPort: number;
  frmPayload: string;
  payloadHex: string;
  /** Decoded Dragino TDC interval in seconds if FPort=2 and prefix=0x01 (4 bytes), else null. */
  decodedIntervalSeconds: number | null;
  priority: string;
  confirmed: boolean;
  correlationIds: string[];
  state: 'QUEUED' | 'REPLACED' | 'SENT';
  queuedAt: string;
  sentAt: string | null;
  rawBody: unknown;
}

export interface TtnDownlinkSentEvent {
  end_device_ids: {
    device_id: string;
    application_ids: {
      application_id: string;
    };
    dev_eui: string;
  };
  correlation_ids: string[];
  received_at: string;
  downlink_sent: {
    f_port: number;
    f_cnt: number;
    frm_payload: string;
    priority: string;
    confirmed: boolean;
    correlation_ids: string[];
  };
}

export interface UplinkPublishResult {
  topic: string;
  message: TtnUplinkMessage;
  triggeredDownlinkSent: DownlinkHistoryEntry | null;
}

const AUTH_BAD_USERNAME_OR_PASSWORD = 4;

/**
 * Encodes Dragino DS03A-LB 10-byte binary uplink payload compatible with decodeDraginoBinaryFallback.
 */
export function encodeDs03aBinaryPayload(params: {
  batV: number;
  doorOpen: boolean;
  doorOpenTimes: number;
  lastDoorOpenDuration: number;
  alarm?: boolean;
}): Buffer {
  const batMv = Math.max(0, Math.min(0x3fff, Math.round(params.batV * 1000)));
  const statusBit = params.doorOpen ? 0x80 : 0x00;
  const byte0 = statusBit | ((batMv >> 8) & 0x3f);
  const byte1 = batMv & 0xff;
  const openTimes = Math.max(0, Math.min(0xffffff, Math.round(params.doorOpenTimes)));
  const duration = Math.max(0, Math.min(0xffffff, Math.round(params.lastDoorOpenDuration)));
  const alarmByte = params.alarm ? 0x01 : 0x00;

  return Buffer.from([
    byte0,
    byte1,
    0x01, // MOD = 1 (Door Sensor mode)
    (openTimes >> 16) & 0xff,
    (openTimes >> 8) & 0xff,
    openTimes & 0xff,
    (duration >> 16) & 0xff,
    (duration >> 8) & 0xff,
    duration & 0xff,
    alarmByte,
  ]);
}

export function encodeDs03aRawHex(params: {
  batV?: number;
  doorOpen?: boolean;
  doorOpenTimes?: number;
  lastDoorOpenDuration?: number;
  alarm?: boolean;
} = {}): string {
  return encodeDs03aBinaryPayload({
    batV: params.batV ?? 3.61,
    doorOpen: params.doorOpen ?? false,
    doorOpenTimes: params.doorOpenTimes ?? 1,
    lastDoorOpenDuration: params.lastDoorOpenDuration ?? 0,
    alarm: params.alarm ?? false,
  })
    .toString('hex')
    .toUpperCase();
}

/**
 * Encodes Dragino D20-LB 4-byte binary uplink payload compatible with decodeDraginoBinaryFallback.
 */
export function encodeD20BinaryPayload(params: { batV: number; tempC1: number }): Buffer {
  const batMv = Math.max(0, Math.min(0x3fff, Math.round(params.batV * 1000)));
  const byte0 = (batMv >> 8) & 0x3f;
  const byte1 = batMv & 0xff;
  const scaledTemp = Math.max(-32768, Math.min(32767, Math.round(params.tempC1 * 10)));
  const unsignedTemp = scaledTemp < 0 ? scaledTemp + 0x10000 : scaledTemp;

  return Buffer.from([
    byte0,
    byte1,
    (unsignedTemp >> 8) & 0xff,
    unsignedTemp & 0xff,
  ]);
}

export function encodeD20RawHex(params: { batV?: number; tempC1?: number } = {}): string {
  return encodeD20BinaryPayload({
    batV: params.batV ?? 3.59,
    tempC1: params.tempC1 ?? 18.4,
  })
    .toString('hex')
    .toUpperCase();
}

function deriveDevEui(deviceId: string): string {
  const hash = createHash('sha256').update(deviceId).digest('hex').toUpperCase();
  return `A84041${hash.slice(0, 10)}`;
}

function normalizeSpreadingFactor(sf: number | string | undefined): number {
  if (typeof sf === 'number' && Number.isFinite(sf)) {
    return Math.max(7, Math.min(12, Math.round(sf)));
  }
  if (typeof sf === 'string') {
    const match = /(\d+)/.exec(sf);
    if (match) {
      return Math.max(7, Math.min(12, Number.parseInt(match[1], 10)));
    }
  }
  return 7;
}

function tryDecodeDraginoTdcSeconds(fPort: number, payloadBytes: Buffer): number | null {
  if (fPort === 2 && payloadBytes.length === 4 && payloadBytes[0] === 0x01) {
    return (payloadBytes[1] << 16) | (payloadBytes[2] << 8) | payloadBytes[3];
  }
  return null;
}

export class TtnSimulatorServer extends EventEmitter {
  public readonly host: string;
  public readonly ttnAppId: string;
  public readonly expectedUsername: string;

  private readonly expectedApiKey: string | undefined;
  private readonly broker: AedesInstance;
  private readonly server: NetServer;
  private readonly sockets = new Set<Socket>();

  private readonly fCntByDevice = new Map<string, number>();
  private readonly downlinkFCntByDevice = new Map<string, number>();
  private readonly ds03aOpenCountByDevice = new Map<string, number>();
  private readonly devEuiByDevice = new Map<string, string>();
  private readonly downlinkQueues = new Map<string, DownlinkHistoryEntry[]>();
  private readonly downlinkHistory: DownlinkHistoryEntry[] = [];

  private boundPort = 0;
  private readonly ipcPath?: string;
  private isClosed = false;

  constructor(options: TtnSimulatorOptions = {}) {
    super();
    this.host = options.host ?? '127.0.0.1';
    this.ipcPath = options.ipcPath;
    this.ttnAppId = options.ttnAppId ?? 'lorapulse-sim';
    this.expectedUsername = `${this.ttnAppId}@ttn`;
    this.expectedApiKey = options.expectedApiKey;

    this.broker = createAedesBroker({
      id: `ttn-v3-sim-${randomUUID().slice(0, 8)}`,
      maxClientsIdLength: 128,
      authenticate: (_client, username, password, done) => {
        const providedPassword = password ? password.toString('utf8') : '';
        const usernameValid = username === this.expectedUsername;
        const passwordValid =
          this.expectedApiKey === undefined || providedPassword === this.expectedApiKey;

        if (!usernameValid || !passwordValid) {
          const authErr = new Error(
            'TTN Simulator MQTT authentication failed: invalid username or API key'
          ) as AuthenticateError;
          authErr.returnCode = AUTH_BAD_USERNAME_OR_PASSWORD;
          this.emit('authFailed', { username, reason: !usernameValid ? 'username' : 'password' });
          done(authErr, false);
          return;
        }
        done(null, true);
      },
      authorizePublish: (client, packet, callback) => {
        if (client !== null) {
          this.interceptClientPublish(client, packet);
        }
        callback(null);
      },
    });

    this.broker.on('clientReady', (client: AedesClient) => {
      this.emit('clientConnected', { clientId: client.id });
    });

    this.broker.on('clientDisconnect', (client: AedesClient) => {
      this.emit('clientDisconnected', { clientId: client.id });
    });

    this.server = createServer((socket) => {
      this.sockets.add(socket);
      socket.once('close', () => {
        this.sockets.delete(socket);
      });
      this.broker.handle(socket);
    });
  }

  public get port(): number {
    return this.boundPort;
  }

  public get socketPath(): string | undefined {
    return this.ipcPath;
  }

  public get mqttUrl(): string {
    return this.ipcPath ? this.ipcPath : `mqtt://${this.host}:${this.boundPort}`;
  }

  public get connectedClients(): number {
    return this.broker.connectedClients;
  }

  public async listen(port = 0): Promise<this> {
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        this.server.off('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        this.server.off('error', onError);
        const addr = this.server.address();
        this.boundPort = addr && typeof addr === 'object' ? (addr as AddressInfo).port : port;
        resolve();
      };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      if (this.ipcPath) {
        this.server.listen(this.ipcPath);
      } else {
        this.server.listen(port, this.host);
      }
    });
    return this;
  }

  /**
   * Publishes a realistic Dragino DS03A-LB door/contact sensor uplink to TTN v3 MQTT.
   */
  public async publishDs03aUplink(options: Ds03aUplinkOptions = {}): Promise<UplinkPublishResult> {
    const deviceId = options.deviceId ?? 'dragino-ds03a-01';
    const rawOpen = options.DOOR_OPEN_STATUS ?? options.doorOpen ?? false;
    const doorOpen = rawOpen === true || rawOpen === 1;
    const doorOpenStatus: 0 | 1 = doorOpen ? 1 : 0;

    let openTimes = options.DOOR_OPEN_TIMES ?? options.doorOpenTimes;
    if (openTimes === undefined) {
      const prev = this.ds03aOpenCountByDevice.get(deviceId) ?? 0;
      openTimes = doorOpen ? prev + 1 : prev;
    }
    this.ds03aOpenCountByDevice.set(deviceId, openTimes);

    const lastDuration = options.LAST_DOOR_OPEN_DURATION ?? options.lastDoorOpenDuration ?? 0;
    const batV = Math.round((options.BAT_V ?? options.batV ?? 3.61) * 100) / 100;
    const alarmFlag: 0 | 1 = options.alarm ? 1 : 0;

    const rawBytes = encodeDs03aBinaryPayload({
      batV,
      doorOpen,
      doorOpenTimes: openTimes,
      lastDoorOpenDuration: lastDuration,
      alarm: alarmFlag === 1,
    });

    return this.publishBuiltUplink({
      deviceId,
      devEui: options.devEui,
      fPort: options.fPort ?? 2,
      fCnt: options.fCnt,
      rssi: options.rssi ?? -76,
      snr: options.snr ?? 8.8,
      spreadingFactor: options.spreadingFactor ?? 7,
      gatewayId: options.gatewayId,
      receivedAt: options.receivedAt,
      frmPayloadBase64: rawBytes.toString('base64'),
      decodedPayload: {
        BAT_V: batV,
        DOOR_OPEN_STATUS: doorOpenStatus,
        DOOR_OPEN_TIMES: openTimes,
        LAST_DOOR_OPEN_DURATION: lastDuration,
        MOD: 1,
        ALARM: alarmFlag,
      },
      versionIds: {
        brand_id: 'dragino',
        model_id: 'ds03a-lb',
        hardware_version: '1.0',
        firmware_version: '1.2',
        band_id: 'EU_863_870',
      },
    });
  }

  /**
   * Publishes a realistic Dragino D20-LB outdoor temperature sensor uplink (supports -999 probe error simulation).
   */
  public async publishD20Uplink(options: D20UplinkOptions = {}): Promise<UplinkPublishResult> {
    const deviceId = options.deviceId ?? 'dragino-d20-01';
    const tempC1 = options.probeError
      ? -999
      : Math.round((options.TempC1 ?? options.tempC1 ?? 18.4) * 10) / 10;
    const batV = Math.round((options.BatV ?? options.batV ?? 3.59) * 100) / 100;

    const rawBytes = encodeD20BinaryPayload({ batV, tempC1 });

    return this.publishBuiltUplink({
      deviceId,
      devEui: options.devEui,
      fPort: options.fPort ?? 2,
      fCnt: options.fCnt,
      rssi: options.rssi ?? -84,
      snr: options.snr ?? 6.5,
      spreadingFactor: options.spreadingFactor ?? 8,
      gatewayId: options.gatewayId,
      receivedAt: options.receivedAt,
      frmPayloadBase64: rawBytes.toString('base64'),
      decodedPayload: {
        TempC1: tempC1,
        BatV: batV,
      },
      versionIds: {
        brand_id: 'dragino',
        model_id: 'd20-lb',
        hardware_version: '1.0',
        firmware_version: '1.1',
        band_id: 'EU_863_870',
      },
    });
  }

  /**
   * Publishes a realistic multi-metric weather station uplink to TTN v3 MQTT.
   */
  public async publishWeatherUplink(
    options: WeatherUplinkOptions = {}
  ): Promise<UplinkPublishResult> {
    const deviceId = options.deviceId ?? 'weather-station-01';
    const temperature = Math.round((options.temperature ?? 16.8) * 10) / 10;
    const humidity = Math.round(options.humidity ?? 64);
    const pressure = Math.round(options.pressure ?? 1014);
    const windSpeed = Math.round((options.windSpeed ?? 12.4) * 10) / 10;
    const batV = Math.round((options.BatV ?? options.batV ?? 3.62) * 100) / 100;

    const syntheticBytes = Buffer.from([
      0x0e,
      0x24,
      Math.round(temperature * 10) & 0xff,
      humidity & 0xff,
      (pressure >> 8) & 0xff,
      pressure & 0xff,
      Math.round(windSpeed * 10) & 0xff,
    ]);

    return this.publishBuiltUplink({
      deviceId,
      devEui: options.devEui,
      fPort: options.fPort ?? 3,
      fCnt: options.fCnt,
      rssi: options.rssi ?? -91,
      snr: options.snr ?? 4.2,
      spreadingFactor: options.spreadingFactor ?? 9,
      gatewayId: options.gatewayId,
      receivedAt: options.receivedAt,
      frmPayloadBase64: syntheticBytes.toString('base64'),
      decodedPayload: {
        temperature,
        humidity,
        pressure,
        windSpeed,
        BatV: batV,
      },
      versionIds: {
        brand_id: 'generic',
        model_id: 'weather-station',
        hardware_version: '2.0',
        firmware_version: '1.0',
        band_id: 'EU_863_870',
      },
    });
  }

  /**
   * Publishes a raw binary LoRaWAN uplink WITHOUT decoded_payload (only Base64 frm_payload)
   * to test server-side binary fallback decoders (e.g. Dragino DS03A-LB / D20-LB).
   */
  public async publishRawHexUplink(
    options: RawHexUplinkOptions = {}
  ): Promise<UplinkPublishResult> {
    const deviceId = options.deviceId ?? 'dragino-raw-01';
    let frmPayloadBase64: string;

    if (options.frmPayloadBase64 !== undefined) {
      frmPayloadBase64 = options.frmPayloadBase64;
    } else {
      const hexClean = (options.payloadHex ?? encodeDs03aRawHex())
        .replace(/^0x/i, '')
        .replace(/\s+/g, '');
      if (hexClean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hexClean)) {
        throw new Error(`Invalid hexadecimal payload provided to publishRawHexUplink: "${options.payloadHex}"`);
      }
      frmPayloadBase64 = Buffer.from(hexClean, 'hex').toString('base64');
    }

    return this.publishBuiltUplink({
      deviceId,
      devEui: options.devEui,
      fPort: options.fPort ?? 2,
      fCnt: options.fCnt,
      rssi: options.rssi ?? -88,
      snr: options.snr ?? 5.0,
      spreadingFactor: options.spreadingFactor ?? 8,
      gatewayId: options.gatewayId,
      receivedAt: options.receivedAt,
      frmPayloadBase64,
      decodedPayload: undefined,
      versionIds: options.versionIds ?? undefined,
    });
  }

  /**
   * Publishes a custom JSON payload uplink (useful for testing the visual JSON Field Mapper).
   */
  public async publishCustomUplink(
    options: CustomUplinkOptions = {}
  ): Promise<UplinkPublishResult> {
    const deviceId = options.deviceId ?? 'custom-sensor-01';
    return this.publishBuiltUplink({
      deviceId,
      devEui: options.devEui,
      fPort: options.fPort ?? 1,
      fCnt: options.fCnt,
      rssi: options.rssi ?? -80,
      snr: options.snr ?? 7.5,
      spreadingFactor: options.spreadingFactor ?? 7,
      gatewayId: options.gatewayId,
      receivedAt: options.receivedAt,
      frmPayloadBase64: options.frmPayloadBase64 ?? Buffer.from([0x01, 0x02]).toString('base64'),
      decodedPayload: options.decodedPayload,
      versionIds: options.versionIds,
    });
  }

  /**
   * Returns the currently queued Class-A downlink waiting for the next RX1/RX2 window of deviceId.
   */
  public getPendingDownlink(deviceId: string): DownlinkHistoryEntry | null {
    const queue = this.downlinkQueues.get(deviceId);
    if (!queue || queue.length === 0) return null;
    return { ...queue[0], correlationIds: [...queue[0].correlationIds] };
  }

  public getPendingDownlinks(deviceId: string): DownlinkHistoryEntry[] {
    const queue = this.downlinkQueues.get(deviceId) ?? [];
    return queue.map((entry) => ({ ...entry, correlationIds: [...entry.correlationIds] }));
  }

  /**
   * Returns complete downlink history (QUEUED, REPLACED, and SENT) for automated test assertions.
   */
  public getDownlinkHistory(deviceId?: string): DownlinkHistoryEntry[] {
    const filtered = deviceId
      ? this.downlinkHistory.filter((item) => item.deviceId === deviceId)
      : this.downlinkHistory;
    return filtered.map((entry) => ({ ...entry, correlationIds: [...entry.correlationIds] }));
  }

  /**
   * Returns only downlinks that have been transmitted via RX1/RX2 (`down/sent`).
   */
  public getSentDownlinks(deviceId?: string): DownlinkHistoryEntry[] {
    return this.getDownlinkHistory(deviceId).filter((item) => item.state === 'SENT');
  }

  public clearDownlinkHistory(): void {
    this.downlinkQueues.clear();
    this.downlinkHistory.length = 0;
  }

  /**
   * Cleanly shuts down the Aedes broker and destroys all active TCP client sockets.
   */
  public async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;

    await new Promise<void>((resolve) => {
      this.broker.close(() => resolve());
    });

    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();

    if (this.server.listening) {
      await new Promise<void>((resolve) => {
        this.server.close(() => resolve());
      });
    }
  }

  private interceptClientPublish(_client: AedesClient, packet: PublishPacket): void {
    const expectedPrefix = `v3/${this.ttnAppId}@ttn/devices/`;
    if (!packet.topic.startsWith(expectedPrefix)) {
      return;
    }

    const remainder = packet.topic.slice(expectedPrefix.length);
    const match = /^([^/+]+)\/down\/(replace|push)$/.exec(remainder);
    if (!match) {
      return;
    }

    const [, deviceId, modeRaw] = match;
    const mode = modeRaw as 'replace' | 'push';
    const rawText = Buffer.isBuffer(packet.payload)
      ? packet.payload.toString('utf8')
      : String(packet.payload ?? '');

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      this.emit('downlinkParseError', { topic: packet.topic, rawText });
      return;
    }

    const wireItems = this.extractWireDownlinks(parsed);
    const nowIso = new Date().toISOString();

    if (mode === 'replace') {
      const existing = this.downlinkQueues.get(deviceId) ?? [];
      for (const oldItem of existing) {
        if (oldItem.state === 'QUEUED') {
          oldItem.state = 'REPLACED';
        }
      }
      this.downlinkQueues.set(deviceId, []);
    }

    const deviceQueue = this.downlinkQueues.get(deviceId) ?? [];
    this.downlinkQueues.set(deviceId, deviceQueue);

    for (const item of wireItems) {
      const fPort = typeof item.f_port === 'number' ? item.f_port : 2;
      const frmPayload = typeof item.frm_payload === 'string' ? item.frm_payload : '';
      const payloadBytes = Buffer.from(frmPayload, 'base64');
      const payloadHex = payloadBytes.toString('hex').toUpperCase();
      const decodedIntervalSeconds = tryDecodeDraginoTdcSeconds(fPort, payloadBytes);

      const entry: DownlinkHistoryEntry = {
        id: randomUUID(),
        deviceId,
        topic: packet.topic,
        mode,
        fPort,
        frmPayload,
        payloadHex,
        decodedIntervalSeconds,
        priority: typeof item.priority === 'string' ? item.priority : 'NORMAL',
        confirmed: Boolean(item.confirmed),
        correlationIds: Array.isArray(item.correlation_ids)
          ? item.correlation_ids.filter((c): c is string => typeof c === 'string')
          : [`as:downlink:${randomUUID()}`],
        state: 'QUEUED',
        queuedAt: nowIso,
        sentAt: null,
        rawBody: parsed,
      };

      if (mode === 'replace' && deviceQueue.length > 0) {
        for (const prev of deviceQueue) {
          if (prev.state === 'QUEUED') {
            prev.state = 'REPLACED';
          }
        }
        deviceQueue.length = 0;
      }

      deviceQueue.push(entry);
      this.downlinkHistory.push(entry);
      this.emit('downlinkQueued', entry);
    }
  }

  private extractWireDownlinks(parsed: unknown): DownlinkWireItem[] {
    if (!parsed || typeof parsed !== 'object') {
      return [];
    }
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.downlinks)) {
      return obj.downlinks.filter(
        (d): d is DownlinkWireItem => Boolean(d) && typeof d === 'object'
      );
    }
    if ('frm_payload' in obj || 'f_port' in obj) {
      return [obj as DownlinkWireItem];
    }
    return [];
  }

  private async publishBuiltUplink(params: {
    deviceId: string;
    devEui?: string;
    fPort: number;
    fCnt?: number;
    rssi: number;
    snr: number;
    spreadingFactor: number | string;
    gatewayId?: string;
    receivedAt?: string;
    frmPayloadBase64: string;
    decodedPayload?: Record<string, unknown>;
    versionIds?: TtnVersionIds;
  }): Promise<UplinkPublishResult> {
    const devEui = (
      params.devEui ??
      this.devEuiByDevice.get(params.deviceId) ??
      deriveDevEui(params.deviceId)
    ).toUpperCase();
    this.devEuiByDevice.set(params.deviceId, devEui);

    const nextFCnt =
      params.fCnt !== undefined ? params.fCnt : (this.fCntByDevice.get(params.deviceId) ?? 0) + 1;
    this.fCntByDevice.set(params.deviceId, nextFCnt);

    const nowIso = params.receivedAt ?? new Date().toISOString();
    const sf = normalizeSpreadingFactor(params.spreadingFactor);
    const gatewayId = params.gatewayId ?? 'lorapulse-sim-gw-eu868';
    const timestamp = Math.floor(Date.now() / 1000);

    const uplinkInner: TtnUplinkMessage['uplink_message'] = {
      session_key_id: Buffer.from(`sim-session-${params.deviceId}`).toString('base64'),
      f_port: params.fPort,
      f_cnt: nextFCnt,
      frm_payload: params.frmPayloadBase64,
      rx_metadata: [
        {
          gateway_ids: {
            gateway_id: gatewayId,
            eui: 'A84041FFFF202601',
          },
          time: nowIso,
          timestamp,
          rssi: params.rssi,
          channel_rssi: params.rssi,
          snr: params.snr,
        },
      ],
      settings: {
        data_rate: {
          lora: {
            bandwidth: 125000,
            spreading_factor: sf,
            coding_rate: '4/5',
          },
        },
        frequency: '868100000',
        timestamp,
        time: nowIso,
      },
      received_at: nowIso,
      consumed_airtime: '0.061696s',
    };

    if (params.decodedPayload !== undefined) {
      uplinkInner.decoded_payload = params.decodedPayload;
    }
    if (params.versionIds !== undefined) {
      uplinkInner.version_ids = params.versionIds;
    }

    const message: TtnUplinkMessage = {
      end_device_ids: {
        device_id: params.deviceId,
        application_ids: {
          application_id: this.ttnAppId,
        },
        dev_eui: devEui,
        join_eui: 'A840410000000101',
        dev_addr: devEui.slice(-8),
      },
      correlation_ids: [`as:up:${randomUUID()}`],
      received_at: nowIso,
      uplink_message: uplinkInner,
    };

    const uplinkTopic = `v3/${this.ttnAppId}@ttn/devices/${params.deviceId}/up`;
    await this.brokerPublishJson(uplinkTopic, message);
    this.emit('uplinkPublished', { topic: uplinkTopic, message });

    // Class-A LoRaWAN behavior: immediately after an uplink, open RX1/RX2 window and transmit queued downlink if any.
    const triggeredDownlinkSent = await this.processClassARxWindow(params.deviceId, devEui);

    return {
      topic: uplinkTopic,
      message,
      triggeredDownlinkSent,
    };
  }

  private async processClassARxWindow(
    deviceId: string,
    devEui: string
  ): Promise<DownlinkHistoryEntry | null> {
    const queue = this.downlinkQueues.get(deviceId);
    if (!queue || queue.length === 0) {
      return null;
    }

    const nextDownlink = queue.shift()!;
    const sentIso = new Date().toISOString();
    nextDownlink.state = 'SENT';
    nextDownlink.sentAt = sentIso;

    const dlFCnt = (this.downlinkFCntByDevice.get(deviceId) ?? 0) + 1;
    this.downlinkFCntByDevice.set(deviceId, dlFCnt);

    const sentEvent: TtnDownlinkSentEvent = {
      end_device_ids: {
        device_id: deviceId,
        application_ids: {
          application_id: this.ttnAppId,
        },
        dev_eui: devEui,
      },
      correlation_ids: nextDownlink.correlationIds,
      received_at: sentIso,
      downlink_sent: {
        f_port: nextDownlink.fPort,
        f_cnt: dlFCnt,
        frm_payload: nextDownlink.frmPayload,
        priority: nextDownlink.priority,
        confirmed: nextDownlink.confirmed,
        correlation_ids: nextDownlink.correlationIds,
      },
    };

    const downSentTopic = `v3/${this.ttnAppId}@ttn/devices/${deviceId}/down/sent`;
    await this.brokerPublishJson(downSentTopic, sentEvent);
    this.emit('downlinkSent', { topic: downSentTopic, entry: nextDownlink, event: sentEvent });

    return { ...nextDownlink, correlationIds: [...nextDownlink.correlationIds] };
  }

  private async brokerPublishJson(topic: string, payloadObj: unknown): Promise<void> {
    const payloadBuffer = Buffer.from(JSON.stringify(payloadObj), 'utf8');
    await new Promise<void>((resolve, reject) => {
      this.broker.publish(
        {
          cmd: 'publish',
          qos: 1,
          dup: false,
          retain: false,
          topic,
          payload: payloadBuffer,
        },
        (err?: Error) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        }
      );
    });
  }
}

/**
 * Starts a local TTN v3 compatible MQTT broker (Aedes + node:net) with Class-A downlink queue simulation.
 */
export async function createTtnSimulatorServer(
  options: TtnSimulatorOptions = {}
): Promise<TtnSimulatorServer> {
  const simulator = new TtnSimulatorServer(options);
  await simulator.listen(options.port ?? 0);
  return simulator;
}
