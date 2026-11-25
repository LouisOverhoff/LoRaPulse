import {
  createTtnSimulatorServer,
  encodeDs03aRawHex,
  type DownlinkHistoryEntry,
} from './index.js';

const port = Number.parseInt(process.env.SIM_MQTT_PORT ?? '18830', 10);
const host = process.env.SIM_MQTT_HOST ?? '127.0.0.1';
const ttnAppId = process.env.SIM_TTN_APP_ID ?? 'lorapulse-demo';
const expectedApiKey = process.env.SIM_TTN_API_KEY || undefined;
const intervalMs = Math.max(1000, Number.parseInt(process.env.SIM_INTERVAL_MS ?? '5000', 10));

function logLine(tag: string, message: string): void {
  const ts = new Date().toISOString();
  process.stdout.write(`[${ts}] [${tag}] ${message}\n`);
}

async function main(): Promise<void> {
  const sim = await createTtnSimulatorServer({
    port,
    host,
    ttnAppId,
    expectedApiKey,
  });

  logLine('BOOT', `LoRaPulse TTN v3 MQTT Simulator started on ${sim.mqttUrl}`);
  logLine(
    'AUTH',
    `Expected MQTT username: "${sim.expectedUsername}" | API key check: ${
      expectedApiKey ? 'ENABLED (configured via SIM_TTN_API_KEY)' : 'OPEN (any non-secret test key accepted)'
    }`
  );
  logLine('INFO', `Emitting realistic LoRaWAN uplinks every ${intervalMs} ms (Press Ctrl+C to stop)`);

  sim.on('clientConnected', ({ clientId }: { clientId: string }) => {
    logLine('MQTT', `Client connected: ${clientId} (active=${sim.connectedClients})`);
  });

  sim.on('clientDisconnected', ({ clientId }: { clientId: string }) => {
    logLine('MQTT', `Client disconnected: ${clientId} (active=${sim.connectedClients})`);
  });

  sim.on('downlinkQueued', (entry: DownlinkHistoryEntry) => {
    const tdcHint =
      entry.decodedIntervalSeconds !== null
        ? ` (Dragino TDC=${entry.decodedIntervalSeconds}s / ${Math.round(entry.decodedIntervalSeconds / 60)}m)`
        : '';
    logLine(
      'DOWNLINK-QUEUE',
      `Queued [${entry.mode}] for ${entry.deviceId}: FPort=${entry.fPort} Hex=${entry.payloadHex}${tdcHint}`
    );
  });

  sim.on('downlinkSent', ({ entry }: { entry: DownlinkHistoryEntry }) => {
    logLine(
      'DOWNLINK-RX1',
      `Transmitted queued downlink to ${entry.deviceId} in Class-A RX1 window (Hex=${entry.payloadHex})`
    );
  });

  let tick = 0;

  const emitCycle = async (): Promise<void> => {
    tick += 1;

    const gateOpen = tick % 6 === 0;
    const ds03aRes = await sim.publishDs03aUplink({
      deviceId: 'dragino-ds03a-north-gate',
      doorOpen: gateOpen,
      lastDoorOpenDuration: gateOpen ? 2 : 1,
      batV: 3.61,
      rssi: -74 - (tick % 5),
      snr: 9.0 - (tick % 3) * 0.4,
      spreadingFactor: 7,
    });
    logLine(
      'UPLINK',
      `${ds03aRes.topic} -> DOOR_OPEN_STATUS=${gateOpen ? 1 : 0}, BAT_V=3.61V`
    );

    const probeFaultCycle = tick % 15 === 0;
    const ambientTemp = Math.round((14.5 + Math.sin(tick / 4) * 3.2) * 10) / 10;
    const d20Res = await sim.publishD20Uplink({
      deviceId: 'dragino-d20-cold-room',
      tempC1: ambientTemp,
      probeError: probeFaultCycle,
      batV: 3.58,
      rssi: -83 - (tick % 4),
      snr: 6.2,
      spreadingFactor: 8,
    });
    logLine(
      'UPLINK',
      `${d20Res.topic} -> TempC1=${probeFaultCycle ? -999 : ambientTemp}C, BatV=3.58V`
    );

    const weatherTemp = Math.round((16.2 + Math.cos(tick / 5) * 2.4) * 10) / 10;
    const weatherHumidity = Math.round(62 + Math.sin(tick / 3) * 8);
    const weatherWind = Math.round((11.5 + (tick % 7) * 1.3) * 10) / 10;
    const weatherRes = await sim.publishWeatherUplink({
      deviceId: 'weather-station-hilltop',
      temperature: weatherTemp,
      humidity: weatherHumidity,
      pressure: 1013 + (tick % 3),
      windSpeed: weatherWind,
      batV: 3.63,
      rssi: -92,
      snr: 4.1,
      spreadingFactor: 9,
    });
    logLine(
      'UPLINK',
      `${weatherRes.topic} -> temp=${weatherTemp}C, hum=${weatherHumidity}%, wind=${weatherWind}km/h`
    );

    if (tick % 4 === 0) {
      const rawHex = encodeDs03aRawHex({
        batV: 3.56,
        doorOpen: false,
        doorOpenTimes: Math.floor(tick / 4),
        lastDoorOpenDuration: 3,
      });
      const rawRes = await sim.publishRawHexUplink({
        deviceId: 'dragino-ds03a-raw-shed',
        payloadHex: rawHex,
        versionIds: {
          brand_id: 'dragino',
          model_id: 'ds03a-lb',
        },
        rssi: -89,
        snr: 5.4,
        spreadingFactor: 8,
      });
      logLine('UPLINK-RAW', `${rawRes.topic} -> rawHex=${rawHex} (no decoded_payload)`);
    }
  };

  await emitCycle();
  const timer = setInterval(() => {
    void emitCycle().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logLine('ERROR', `Cycle error: ${msg}`);
    });
  }, intervalMs);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logLine('STOP', `Received ${signal}, closing MQTT simulator cleanly...`);
    clearInterval(timer);
    await sim.close();
    logLine('STOP', 'Simulator stopped.');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`[FATAL] Simulator failed to start: ${message}\n`);
  process.exit(1);
});
