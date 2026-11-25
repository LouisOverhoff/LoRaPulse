import { randomUUID } from 'node:crypto';
import net, { type Server as NetServer } from 'node:net';
import aedesModule, {
  type AedesPublishPacket,
  type Client as AedesClient,
  type PublishPacket,
} from 'aedes';
import type { DbClient } from '../db/client.js';
import type { TtnMqttManager } from '../mqtt/ttnManager.js';
import { encryptSecret, hashPassword, maskApiKey } from '../security/crypto.js';

type AedesInstance = ReturnType<typeof aedesModule.createBroker>;
const createAedesBroker: () => AedesInstance =
  typeof aedesModule === 'function'
    ? (aedesModule as unknown as () => AedesInstance)
    : aedesModule.createBroker;

export interface EmbeddedDemoHandle {
  port: number;
  close(): Promise<void>;
}

const DEMO_TTN_APP_ID = 'lorapulse-demo';
const DEMO_ADMIN_EMAIL = 'admin@lorapulse.local';
// Demo-only local credential (only active when --demo or ENABLE_EMBEDDED_SIMULATOR=true)
const DEMO_ADMIN_INITIAL_PASS = 'LoRaPulse!2026';
const DEMO_PLACEHOLDER_API_KEY = 'NNSXS.LOCALDEMOSIMULATORONLY.0000DEMO9999';

interface SimulatedDeviceSpec {
  ttnDeviceId: string;
  devEui: string;
  name: string;
  profileId: string;
  brandId: string;
  modelId: string;
  categoryKey: 'jagd' | 'langen' | 'sued' | null;
  latitude: number | null;
  longitude: number | null;
  locationLabel: string | null;
  config: Record<string, unknown>;
  fCnt: number;
}

async function listenOnPortWithFallback(
  server: NetServer,
  preferredPort: number
): Promise<number> {
  try {
    return await new Promise<number>((resolve, reject) => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.removeListener('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        const addr = server.address();
        resolve(typeof addr === 'object' && addr ? addr.port : preferredPort);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(preferredPort, '127.0.0.1');
    });
  } catch {
    return await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 0);
      });
    });
  }
}

export async function startEmbeddedDemo(
  db: DbClient,
  ttnManager: TtnMqttManager
): Promise<EmbeddedDemoHandle> {
  const broker: AedesInstance = createAedesBroker();
  const tcpServer = net.createServer(broker.handle);
  const activeSockets = new Set<net.Socket>();
  tcpServer.on('connection', (socket) => {
    activeSockets.add(socket);
    socket.on('close', () => activeSockets.delete(socket));
  });
  const preferredPort = Number(process.env.DEMO_MQTT_PORT || 18839);
  const boundPort = await listenOnPortWithFallback(tcpServer, preferredPort);

  const queuedDownlinks = new Map<string, Record<string, unknown>>();
  const quickAckTimers = new Set<NodeJS.Timeout>();
  let closed = false;

  const simDevices: SimulatedDeviceSpec[] = [
    {
      ttnDeviceId: 'ds03a-falle-nord-01',
      devEui: 'A84041000181D001',
      name: 'Kastenfalle Waldrand Nord (DS03A-LB)',
      profileId: 'dragino_ds03a_lb',
      brandId: 'dragino',
      modelId: 'ds03a-lb',
      categoryKey: 'jagd',
      latitude: 49.9892,
      longitude: 8.6814,
      locationLabel: 'Revier Langen Nord',
      config: { alertOnOpen: true, expectedIntervalSec: 3600 },
      fCnt: 120,
    },
    {
      ttnDeviceId: 'ds03a-falle-bach-02',
      devEui: 'A84041000181D002',
      name: 'Kastenfalle Bachlauf Ost (DS03A-LB)',
      profileId: 'dragino_ds03a_lb',
      brandId: 'dragino',
      modelId: 'ds03a-lb',
      categoryKey: 'jagd',
      latitude: 49.9825,
      longitude: 8.6941,
      locationLabel: 'Bachlauf Ost',
      config: { alertOnOpen: true, expectedIntervalSec: 3600 },
      fCnt: 85,
    },
    {
      ttnDeviceId: 'd20-wildkammer-01',
      devEui: 'A84041000182D001',
      name: 'Wildkammer Kühlung (D20-LB)',
      profileId: 'dragino_d20_lb',
      brandId: 'dragino',
      modelId: 'd20-lb',
      categoryKey: 'langen',
      latitude: 49.9918,
      longitude: 8.6652,
      locationLabel: 'Forsthaus Langen',
      config: { tempMinThreshold: -2, tempMaxThreshold: 7.0, expectedIntervalSec: 1200 },
      fCnt: 340,
    },
    {
      ttnDeviceId: 'ws-koberstadt-01',
      devEui: 'A84041000183D001',
      name: 'Wetterstation Koberstadt Süd',
      profileId: 'weather_station',
      brandId: 'generic',
      modelId: 'weather-station',
      categoryKey: 'sued',
      latitude: 49.9745,
      longitude: 8.712,
      locationLabel: 'Koberstadt Lichtung',
      config: { expectedIntervalSec: 900 },
      fCnt: 512,
    },
  ];

  const publishFromBroker = (topic: string, payloadObj: Record<string, unknown>): void => {
    if (closed) return;
    const packet: PublishPacket = {
      cmd: 'publish',
      qos: 0,
      dup: false,
      retain: false,
      topic,
      payload: Buffer.from(JSON.stringify(payloadObj), 'utf8'),
    };
    broker.publish(packet, () => {
      // Published internally
    });
  };

  const buildRealisticPayload = (
    spec: SimulatedDeviceSpec,
    tickIndex: number
  ): Record<string, unknown> => {
    if (spec.profileId === 'dragino_ds03a_lb') {
      const triggered = spec.ttnDeviceId.endsWith('02') && tickIndex % 5 === 0 ? 1 : 0;
      return {
        DOOR_OPEN_STATUS: triggered,
        DOOR_OPEN_TIMES: triggered ? 4 : 3,
        LAST_DOOR_OPEN_DURATION: triggered ? 12 : 0,
        BAT_V: 3.61,
      };
    }
    if (spec.profileId === 'dragino_d20_lb') {
      const wave = Math.sin(tickIndex / 3) * 1.4;
      return {
        TempC1: Math.round((3.4 + wave) * 10) / 10,
        BatV: 3.58,
      };
    }
    // Weather station
    const tempWave = Math.sin(tickIndex / 4) * 3.2;
    return {
      temperature: Math.round((14.6 + tempWave) * 10) / 10,
      humidity: Math.round(68 - tempWave * 2),
      pressure: 1016,
      windSpeed: Math.round((9.5 + Math.abs(tempWave) * 2.1) * 10) / 10,
      BatV: 3.64,
    };
  };

  const emitSimulatedUplink = (spec: SimulatedDeviceSpec, tickIndex: number): void => {
    if (closed) return;
    spec.fCnt += 1;
    const decoded = buildRealisticPayload(spec, tickIndex);
    const nowIso = new Date().toISOString();

    publishFromBroker(`v3/${DEMO_TTN_APP_ID}@ttn/devices/${spec.ttnDeviceId}/up`, {
      end_device_ids: {
        device_id: spec.ttnDeviceId,
        dev_eui: spec.devEui,
        application_ids: { application_id: DEMO_TTN_APP_ID },
      },
      received_at: nowIso,
      uplink_message: {
        f_port: 2,
        f_cnt: spec.fCnt,
        decoded_payload: decoded,
        rx_metadata: [
          {
            gateway_ids: { gateway_id: 'gw-hessen-langen-01' },
            rssi: -76 - (tickIndex % 14),
            snr: Math.round((8.5 - (tickIndex % 4) * 0.6) * 10) / 10,
          },
        ],
        settings: {
          data_rate: {
            lora: { bandwidth: 125000, spreading_factor: spec.profileId === 'dragino_ds03a_lb' ? 9 : 7 },
          },
        },
        version_ids: {
          brand_id: spec.brandId,
          model_id: spec.modelId,
        },
      },
    });

    // Class-A LoRaWAN behavior: if a downlink was queued via down/replace, transmit it in RX1 after uplink!
    const pendingDown = queuedDownlinks.get(spec.ttnDeviceId);
    if (pendingDown) {
      queuedDownlinks.delete(spec.ttnDeviceId);
      publishFromBroker(`v3/${DEMO_TTN_APP_ID}@ttn/devices/${spec.ttnDeviceId}/down/sent`, {
        end_device_ids: {
          device_id: spec.ttnDeviceId,
          dev_eui: spec.devEui,
          application_ids: { application_id: DEMO_TTN_APP_ID },
        },
        downlink_sent: {
          ...pendingDown,
          priority: 'NORMAL',
        },
      });
    }
  };

  // Watch for Class-A downlink replace messages from the backend
  broker.on('publish', (packet: AedesPublishPacket, client: AedesClient | null) => {
    if (!client || closed) return;
    const match = /^v3\/([^/]+)@ttn\/devices\/([^/]+)\/down\/replace$/.exec(packet.topic);
    if (!match) return;
    const [, appId, deviceId] = match;
    if (appId !== DEMO_TTN_APP_ID) return;

    try {
      const parsed = JSON.parse(packet.payload.toString('utf8')) as {
        downlinks?: Array<Record<string, unknown>>;
      };
      const firstDownlink = parsed.downlinks?.[0];
      if (!firstDownlink) return;

      queuedDownlinks.set(deviceId, firstDownlink);

      // Trigger a Class-A uplink after ~1.5s in demo mode so RX1 downlink confirmation can be observed live
      const spec = simDevices.find((d) => d.ttnDeviceId === deviceId);
      if (spec) {
        const timer = setTimeout(() => {
          quickAckTimers.delete(timer);
          emitSimulatedUplink(spec, Date.now() % 17);
        }, 1_500);
        timer.unref();
        quickAckTimers.add(timer);
      } else {
        const timer = setTimeout(() => {
          quickAckTimers.delete(timer);
          queuedDownlinks.delete(deviceId);
          publishFromBroker(`v3/${DEMO_TTN_APP_ID}@ttn/devices/${deviceId}/down/sent`, {
            end_device_ids: {
              device_id: deviceId,
              application_ids: { application_id: DEMO_TTN_APP_ID },
            },
            downlink_sent: firstDownlink,
          });
        }, 1_000);
        timer.unref();
        quickAckTimers.add(timer);
      }
    } catch {
      // Ignore invalid payload
    }
  });

  // Seed demo user, categories, TTN app, and historical chart points if DB is fresh
  const userCountRes = await db.query<{ count: string | number }>(
    'SELECT COUNT(*) AS count FROM users'
  );
  if (Number(userCountRes.rows[0]?.count ?? 0) === 0) {
    const pwHash = await hashPassword(DEMO_ADMIN_INITIAL_PASS);
    await db.query(
      `INSERT INTO users (
         id, email, display_name, password_hash, system_role, preferred_lang, is_active, must_change_password
       )
       VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', 'de', TRUE, FALSE)`,
      [randomUUID(), DEMO_ADMIN_EMAIL, 'Demo Super-Admin', pwHash]
    );
  }

  // Ensure demo category trees exist
  const catCountRes = await db.query<{ count: string | number }>(
    'SELECT COUNT(*) AS count FROM categories'
  );
  const categoryIds: Record<'jagd' | 'langen' | 'sued', string> = {
    jagd: '',
    langen: '',
    sued: '',
  };

  if (Number(catCountRes.rows[0]?.count ?? 0) === 0) {
    const idFallen = randomUUID();
    const idLangen = randomUUID();
    const idJagd = randomUUID();
    const idWetter = randomUUID();
    const idHessen = randomUUID();
    const idSued = randomUUID();

    await db.query(
      `INSERT INTO categories (id, parent_id, name, slug, path) VALUES
         ($1, NULL, 'Fallenmelder', 'fallenmelder', 'fallenmelder'),
         ($2, $1, 'Langen', 'langen', 'fallenmelder.langen'),
         ($3, $2, 'Jagdgruppe Langen 1', 'jagdgruppe_langen_1', 'fallenmelder.langen.jagdgruppe_langen_1'),
         ($4, NULL, 'Wetterstationen', 'wetterstationen', 'wetterstationen'),
         ($5, $4, 'Hessen', 'hessen', 'wetterstationen.hessen'),
         ($6, $5, 'Süd', 'sued', 'wetterstationen.hessen.sued')`,
      [idFallen, idLangen, idJagd, idWetter, idHessen, idSued]
    );
    categoryIds.jagd = idJagd;
    categoryIds.langen = idLangen;
    categoryIds.sued = idSued;
  }

  // Upsert local embedded TTN application pointing at boundPort
  const existingAppRes = await db.query<{ id: string }>(
    'SELECT id FROM ttn_applications WHERE ttn_app_id = $1 LIMIT 1',
    [DEMO_TTN_APP_ID]
  );
  let demoAppDbId: string;
  if (existingAppRes.rows[0]) {
    demoAppDbId = existingAppRes.rows[0].id;
    await db.query(
      `UPDATE ttn_applications
       SET host = '127.0.0.1', port = $1, use_tls = FALSE, is_enabled = TRUE
       WHERE id = $2`,
      [boundPort, demoAppDbId]
    );
  } else {
    demoAppDbId = randomUUID();
    await db.query(
      `INSERT INTO ttn_applications (
         id, name, ttn_app_id, host, port, use_tls, api_key_encrypted, masked_api_key, is_enabled
       )
       VALUES ($1, $2, $3, '127.0.0.1', $4, FALSE, $5, $6, TRUE)`,
      [
        demoAppDbId,
        'LoRaPulse Embedded Simulator',
        DEMO_TTN_APP_ID,
        boundPort,
        encryptSecret(DEMO_PLACEHOLDER_API_KEY),
        maskApiKey(DEMO_PLACEHOLDER_API_KEY),
      ]
    );
  }

  // Pre-seed demo devices & 12h historical telemetry if devices table is empty
  const devCountRes = await db.query<{ count: string | number }>(
    'SELECT COUNT(*) AS count FROM devices'
  );
  if (Number(devCountRes.rows[0]?.count ?? 0) === 0 && categoryIds.jagd) {
    const nowMs = Date.now();
    for (const spec of simDevices) {
      const devId = randomUUID();
      const catId = spec.categoryKey ? categoryIds[spec.categoryKey] : null;
      await db.query(
        `INSERT INTO devices (
           id, ttn_application_id, category_id, sensor_profile_id, dev_eui, ttn_device_id,
           name, latitude, longitude, location_label, config_json, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, 'OK')`,
        [
          devId,
          demoAppDbId,
          catId,
          spec.profileId,
          spec.devEui,
          spec.ttnDeviceId,
          spec.name,
          spec.latitude,
          spec.longitude,
          spec.locationLabel,
          JSON.stringify(spec.config),
        ]
      );

      for (let h = 12; h >= 1; h--) {
        const tsIso = new Date(nowMs - h * 3600_000).toISOString();
        const histPayload = buildRealisticPayload(spec, h);
        await db.query(
          `INSERT INTO measurements (
             device_id, received_at, f_cnt, f_port, rssi, snr, spreading_factor, payload_json
           )
           VALUES ($1, $2, $3, 2, $4, $5, 'SF7', $6::jsonb)`,
          [devId, tsIso, spec.fCnt - h, -78 - (h % 8), 8.2, JSON.stringify(histPayload)]
        );
      }
    }
  }

  // Connect TTN manager to embedded Aedes broker
  await ttnManager.syncApplication(demoAppDbId, true);

  // Emit initial live uplinks right away
  simDevices.forEach((spec, idx) => emitSimulatedUplink(spec, idx + 1));

  let tick = 2;
  const intervalTimer = setInterval(() => {
    tick += 1;
    const targetSpec = simDevices[tick % simDevices.length];
    if (targetSpec) {
      emitSimulatedUplink(targetSpec, tick);
    }
  }, 8_000);
  intervalTimer.unref();

  console.info('====================================================================');
  console.info(`[LoRaPulse][DEMO MODE] Embedded Aedes MQTT Broker listening on 127.0.0.1:${boundPort}`);
  console.info(`[LoRaPulse][DEMO MODE] Login Email:    ${DEMO_ADMIN_EMAIL}`);
  console.info(`[LoRaPulse][DEMO MODE] Login Password: ${DEMO_ADMIN_INITIAL_PASS}`);
  console.info('====================================================================');

  return {
    port: boundPort,
    async close(): Promise<void> {
      closed = true;
      clearInterval(intervalTimer);
      for (const t of quickAckTimers) {
        clearTimeout(t);
      }
      quickAckTimers.clear();

      await new Promise<void>((resolve) => {
        broker.close(() => resolve());
      });
      for (const sock of activeSockets) {
        sock.destroy();
      }
      activeSockets.clear();
      await new Promise<void>((resolve) => {
        tcpServer.close(() => resolve());
      });
    },
  };
}
