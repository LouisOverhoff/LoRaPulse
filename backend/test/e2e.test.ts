import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { normalizeTtnTarget } from '../src/mqtt/ttnManager.js';
import {
  createTtnSimulatorServer,
  encodeD20RawHex,
} from '../../simulator/dist/index.js';

test('normalizeTtnTarget sanitizes @ttn suffixes, uppercase IDs, and pasted host:port URLs', () => {
  const a = normalizeTtnTarget('Meine-App@ttn', 'mqtts://eu1.cloud.thethings.network:8883/', 1883);
  assert.equal(a.cleanAppId, 'meine-app');
  assert.equal(a.mqttUsername, 'meine-app@ttn');
  assert.equal(a.cleanHost, 'eu1.cloud.thethings.network');
  assert.equal(a.cleanPort, 8883);

  const b = normalizeTtnTarget('sensor-net@customtenant', 'https://nam1.cloud.thethings.network/console', 8883);
  assert.equal(b.cleanAppId, 'sensor-net');
  assert.equal(b.mqttUsername, 'sensor-net@customtenant');
  assert.equal(b.cleanHost, 'nam1.cloud.thethings.network');
  assert.equal(b.cleanPort, 8883);
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForCondition(
  predicate: () => Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 60
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(intervalMs);
  }
  throw new Error(`Condition timed out after ${timeoutMs}ms`);
}

test('LoRaPulse v0.0.1 – Full End-to-End Integration, TTN Simulator, Downlink & RBAC Security Suite', async () => {
  const TEST_TTN_APP_ID = 'lorapulse-e2e-ttn';
  const TEST_TTN_API_KEY = 'NNSXS.TEST_PLACEHOLDER_KEY_NOT_A_SECRET_9988';
  const ipcPath =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\lorapulse-e2e-${process.pid}-${Date.now()}`
      : `/tmp/lorapulse-e2e-${process.pid}-${Date.now()}.sock`;

  const sim = await createTtnSimulatorServer({
    ipcPath,
    ttnAppId: TEST_TTN_APP_ID,
    expectedApiKey: TEST_TTN_API_KEY,
  });

  const app = await createApp({
    databaseUrl: ':memory:',
    setupToken: 'initial-setup-token-v001',
    enableDemo: false,
    logger: false,
  });

  try {
    // 1. Health & Static Built PWA Verification
    const healthRes = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(healthRes.statusCode, 200);
    assert.equal(healthRes.json().version, '0.0.1');

    const indexHtmlRes = await app.inject({ method: 'GET', url: '/' });
    assert.equal(indexHtmlRes.statusCode, 200);
    assert.match(indexHtmlRes.body, /LoRaPulse/);

    const manifestRes = await app.inject({ method: 'GET', url: '/manifest.webmanifest' });
    assert.equal(manifestRes.statusCode, 200);

    // 2. First-Run Setup Token Hardening
    const bootBefore = await app.inject({ method: 'GET', url: '/api/auth/status' });
    assert.equal(bootBefore.json().needsSetup, true);

    const badSetup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        setupToken: 'wrong-token-12345',
        email: 'attacker@example.org',
        displayName: 'Attacker',
        password: 'StrongPassword!123',
        preferredLang: 'de',
      },
    });
    assert.equal(badSetup.statusCode, 403);

    const okSetup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        setupToken: 'initial-setup-token-v001',
        email: 'super@lorapulse.example',
        displayName: 'Root SuperAdmin',
        password: 'SuperPassword!2026',
        preferredLang: 'de',
      },
    });
    assert.equal(okSetup.statusCode, 200);
    const superCookie = okSetup.cookies.find((c) => c.name === 'lp_session')?.value;
    assert.ok(superCookie, 'SUPER_ADMIN session cookie must be issued');

    // Second setup attempt must be permanently blocked
    const secondSetup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        setupToken: 'initial-setup-token-v001',
        email: 'second@lorapulse.example',
        displayName: 'Second',
        password: 'SuperPassword!2026',
      },
    });
    assert.equal(secondSetup.statusCode, 403);

    // 3. Connect Real Local TTN-v3 MQTT Broker & Verify Secret Masking
    const createTtnRes = await app.inject({
      method: 'POST',
      url: '/api/super/ttn-apps',
      cookies: { lp_session: superCookie },
      payload: {
        name: 'E2E Local TTN Broker',
        ttnAppId: TEST_TTN_APP_ID,
        host: sim.socketPath!,
        port: 1883,
        useTls: false,
        apiKey: TEST_TTN_API_KEY,
        isEnabled: true,
      },
    });
    assert.equal(createTtnRes.statusCode, 200);
    const createdApp = createTtnRes.json().app;
    assert.ok(!JSON.stringify(createdApp).includes(TEST_TTN_API_KEY), 'Raw TTN API key must never leak');
    assert.match(createdApp.maskedApiKey, /9988$/);

    await waitForCondition(async () => {
      const appsRes = await app.inject({
        method: 'GET',
        url: '/api/super/ttn-apps',
        cookies: { lp_session: superCookie },
      });
      return appsRes.json().apps[0]?.connectionStatus === 'CONNECTED';
    });

    // 4. Simulate Realistic LoRaWAN Uplinks (DS03A-LB, D20-LB, Weather, Probe Error, Binary Fallback)
    await sim.publishDs03aUplink({
      deviceId: 'ds03a-trap-01',
      devEui: 'A84041E2E0000001',
      doorOpen: true,
      doorOpenTimes: 7,
      lastDoorOpenDuration: 3,
      batV: 3.61,
      rssi: -74,
      snr: 9.2,
      spreadingFactor: 7,
    });

    await sim.publishD20Uplink({
      deviceId: 'd20-outdoor-01',
      devEui: 'A84041E2E0000002',
      tempC1: 16.4,
      batV: 3.58,
      rssi: -82,
      snr: 6.5,
      spreadingFactor: 8,
    });

    await sim.publishWeatherUplink({
      deviceId: 'ws-feldberg-01',
      devEui: '2CF7F1E2E0000003',
      temperature: 9.3,
      humidity: 81,
      pressure: 1015,
      windSpeed: 21.5,
      batV: 3.63,
    });

    // Raw binary Dragino D20-LB uplink WITHOUT decoded_payload -> tests fallback binary codec!
    const rawHex = encodeD20RawHex({ tempC1: 21.5, batV: 3.56 });
    await sim.publishRawHexUplink({
      deviceId: 'd20-raw-binary-01',
      devEui: 'A84041E2E0000004',
      payloadHex: rawHex,
      fPort: 2,
      versionIds: { brand_id: 'dragino', model_id: 'd20-lb' },
    });

    await waitForCondition(async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/devices',
        cookies: { lp_session: superCookie },
      });
      return res.json().devices.length === 4;
    });

    // Test Probe Error (-999) handling on D20-LB
    await sim.publishD20Uplink({
      deviceId: 'd20-outdoor-01',
      devEui: 'A84041E2E0000002',
      probeError: true,
      batV: 3.58,
    });

    await waitForCondition(async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/devices',
        cookies: { lp_session: superCookie },
      });
      const d20 = res.json().devices.find((d: { devEui: string }) => d.devEui === 'A84041E2E0000002');
      return Array.isArray(d20?.probeErrorFields) && d20.probeErrorFields.includes('TempC1');
    });

    const allDevicesRes = await app.inject({
      method: 'GET',
      url: '/api/devices',
      cookies: { lp_session: superCookie },
    });
    const devices = allDevicesRes.json().devices as Array<{
      id: string;
      devEui: string;
      latestValues: Record<string, unknown>;
      status: string;
    }>;

    const ds03aDev = devices.find((d) => d.devEui === 'A84041E2E0000001')!;
    const d20Dev = devices.find((d) => d.devEui === 'A84041E2E0000002')!;
    const wsDev = devices.find((d) => d.devEui === '2CF7F1E2E0000003')!;
    const rawDev = devices.find((d) => d.devEui === 'A84041E2E0000004')!;

    assert.equal(ds03aDev.status, 'ALARM');
    assert.equal(rawDev.latestValues.TempC1, 21.5);

    // 5. Build Hierarchical Category Tree & Assign Devices (keeping rawDev uncategorized!)
    const catFallen = (
      await app.inject({
        method: 'POST',
        url: '/api/categories',
        cookies: { lp_session: superCookie },
        payload: { name: 'Fallenmelder', parentId: null },
      })
    ).json().category;

    const catLangen = (
      await app.inject({
        method: 'POST',
        url: '/api/categories',
        cookies: { lp_session: superCookie },
        payload: { name: 'Langen', parentId: catFallen.id },
      })
    ).json().category;

    const catJg1 = (
      await app.inject({
        method: 'POST',
        url: '/api/categories',
        cookies: { lp_session: superCookie },
        payload: { name: 'Jagdgruppe Langen 1', parentId: catLangen.id },
      })
    ).json().category;

    const catWetter = (
      await app.inject({
        method: 'POST',
        url: '/api/categories',
        cookies: { lp_session: superCookie },
        payload: { name: 'Wetterstationen', parentId: null },
      })
    ).json().category;

    await app.inject({
      method: 'PATCH',
      url: `/api/devices/${ds03aDev.id}`,
      cookies: { lp_session: superCookie },
      payload: { categoryId: catJg1.id, latitude: 49.989, longitude: 8.681 },
    });

    // Place BOTH d20Dev and wsDev into Wetterstationen so we can test Zero-Sibling-Leak!
    await app.inject({
      method: 'PATCH',
      url: `/api/devices/${d20Dev.id}`,
      cookies: { lp_session: superCookie },
      payload: { categoryId: catWetter.id, latitude: 50.01, longitude: 8.65 },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/devices/${wsDev.id}`,
      cookies: { lp_session: superCookie },
      payload: { categoryId: catWetter.id, latitude: 50.23, longitude: 8.45 },
    });

    // 6. Invite Users (ADMIN, Group+Direct-Sensor OPERATOR, Group-less Empty USER) & Verify RBAC
    const groupRes = await app.inject({
      method: 'POST',
      url: '/api/admin/groups',
      cookies: { lp_session: superCookie },
      payload: { name: 'Jäger Langen', description: 'Reviergruppe', memberUserIds: [] },
    });
    const jgGroup = groupRes.json().group;

    const invAdmin = (
      await app.inject({
        method: 'POST',
        url: '/api/admin/users/invite',
        cookies: { lp_session: superCookie },
        payload: { email: 'fachadmin@lorapulse.example', displayName: 'Fach Admin', systemRole: 'ADMIN', groupIds: [] },
      })
    ).json();

    const invOperator = (
      await app.inject({
        method: 'POST',
        url: '/api/admin/users/invite',
        cookies: { lp_session: superCookie },
        payload: { email: 'jaeger@lorapulse.example', displayName: 'Jäger Max', systemRole: 'USER', groupIds: [jgGroup.id] },
      })
    ).json();

    const invEmpty = (
      await app.inject({
        method: 'POST',
        url: '/api/admin/users/invite',
        cookies: { lp_session: superCookie },
        payload: { email: 'gast@lorapulse.example', displayName: 'Gast Ohne Gruppe', systemRole: 'USER', groupIds: [] },
      })
    ).json();

    // Grant group OPERATOR on parent category 'Langen' (inherits down to 'Jagdgruppe Langen 1'!)
    await app.inject({
      method: 'POST',
      url: '/api/admin/permissions',
      cookies: { lp_session: superCookie },
      payload: { userId: null, groupId: jgGroup.id, categoryId: catLangen.id, deviceId: null, level: 'OPERATOR' },
    });

    // Grant direct single-sensor VIEWER access on wsDev (inside hidden 'Wetterstationen' category!)
    await app.inject({
      method: 'POST',
      url: '/api/admin/permissions',
      cookies: { lp_session: superCookie },
      payload: { userId: invOperator.user.id, groupId: null, categoryId: null, deviceId: wsDev.id, level: 'VIEWER' },
    });

    // Redeem invites
    const redeemAdmin = await app.inject({
      method: 'POST',
      url: '/api/auth/invite/redeem',
      payload: { token: invAdmin.token, password: 'AdminPassword!2026', preferredLang: 'de' },
    });
    assert.equal(redeemAdmin.statusCode, 200);
    const adminCookie = redeemAdmin.cookies.find((c) => c.name === 'lp_session')!.value;

    const redeemOp = await app.inject({
      method: 'POST',
      url: '/api/auth/invite/redeem',
      payload: { token: invOperator.token, password: 'OperatorPassword!2026', preferredLang: 'de' },
    });
    assert.equal(redeemOp.statusCode, 200);
    const opCookie = redeemOp.cookies.find((c) => c.name === 'lp_session')!.value;

    const redeemEmpty = await app.inject({
      method: 'POST',
      url: '/api/auth/invite/redeem',
      payload: { token: invEmpty.token, password: 'EmptyPassword!2026', preferredLang: 'en' },
    });
    assert.equal(redeemEmpty.statusCode, 200);
    const emptyCookie = redeemEmpty.cookies.find((c) => c.name === 'lp_session')!.value;

    // 6a. Empty user sees 0 devices cleanly without error
    const emptyDevs = await app.inject({
      method: 'GET',
      url: '/api/devices',
      cookies: { lp_session: emptyCookie },
    });
    assert.equal(emptyDevs.statusCode, 200);
    assert.equal(emptyDevs.json().devices.length, 0);

    // 6b. Operator sees DS03A-LB (via category inheritance) + wsDev (direct share), NEVER sibling d20Dev or uncategorized rawDev!
    const opDevsRes = await app.inject({
      method: 'GET',
      url: '/api/devices',
      cookies: { lp_session: opCookie },
    });
    const opDevs = opDevsRes.json().devices as Array<{
      id: string;
      isDirectShareOnly: boolean;
      categoryId: string | null;
      categoryBreadcrumb: string[] | null;
    }>;
    assert.equal(opDevs.length, 2);
    const opWs = opDevs.find((d) => d.id === wsDev.id)!;
    assert.equal(opWs.isDirectShareOnly, true, 'Direct single-sensor share must set isDirectShareOnly');
    assert.equal(opWs.categoryId, null, 'Zero-Sibling-Leak: hidden categoryId must not leak');
    assert.equal(opWs.categoryBreadcrumb, null, 'Zero-Sibling-Leak: hidden categoryBreadcrumb must not leak');

    // IDOR Check: Operator cannot fetch measurements of sibling d20Dev
    const idorRes = await app.inject({
      method: 'GET',
      url: `/api/devices/${d20Dev.id}/measurements`,
      cookies: { lp_session: opCookie },
    });
    assert.equal(idorRes.statusCode, 403);

    // Operator CAN acknowledge alert on DS03A-LB
    const opAlerts = (
      await app.inject({ method: 'GET', url: '/api/alerts', cookies: { lp_session: opCookie } })
    ).json().alerts;
    assert.equal(opAlerts.length, 1);
    const ackRes = await app.inject({
      method: 'POST',
      url: `/api/alerts/${opAlerts[0].id}/ack`,
      cookies: { lp_session: opCookie },
      payload: {},
    });
    assert.equal(ackRes.statusCode, 200);
    assert.equal(ackRes.json().alert.status, 'ACKED');

    // 6c. ADMIN Role Privilege Escalation Prevention (Cannot access TTN keys, Downlinks, or System Reboot!)
    const adminTtnAttempt = await app.inject({
      method: 'GET',
      url: '/api/super/ttn-apps',
      cookies: { lp_session: adminCookie },
    });
    assert.equal(adminTtnAttempt.statusCode, 403);

    const adminDownlinkAttempt = await app.inject({
      method: 'POST',
      url: `/api/devices/${ds03aDev.id}/downlink`,
      cookies: { lp_session: adminCookie },
      payload: { intervalMinutes: 15 },
    });
    assert.equal(adminDownlinkAttempt.statusCode, 403);

    // 7. SUPER_ADMIN Class-A Downlink Queue (down/replace) & RX1 Delivery Confirmation (down/sent)
    const saDownlinkRes = await app.inject({
      method: 'POST',
      url: `/api/devices/${ds03aDev.id}/downlink`,
      cookies: { lp_session: superCookie },
      payload: { intervalMinutes: 15 },
    });
    assert.equal(saDownlinkRes.statusCode, 200);
    assert.equal(saDownlinkRes.json().device.pendingDownlink.state, 'QUEUED');
    assert.equal(saDownlinkRes.json().device.pendingDownlink.payloadHex, '01000384');

    await waitForCondition(async () => sim.getPendingDownlink('ds03a-trap-01') !== undefined);

    // Next Class-A sensor uplink triggers RX1 downlink transmission in simulator -> down/sent!
    await sim.publishDs03aUplink({
      deviceId: 'ds03a-trap-01',
      devEui: 'A84041E2E0000001',
      doorOpen: false,
      doorOpenTimes: 7,
      batV: 3.61,
    });

    await waitForCondition(async () => {
      const check = await app.inject({
        method: 'GET',
        url: '/api/devices',
        cookies: { lp_session: superCookie },
      });
      const dev = check.json().devices.find((d: { id: string }) => d.id === ds03aDev.id);
      return dev?.pendingDownlink?.state === 'SENT';
    });

    // 8. CSV Export & System Control Re-Auth Verification
    const csvRes = await app.inject({
      method: 'GET',
      url: `/api/devices/${ds03aDev.id}/export?format=csv`,
      cookies: { lp_session: superCookie },
    });
    assert.equal(csvRes.statusCode, 200);
    assert.match(csvRes.headers['content-type'] as string, /text\/csv/);

    const badReauthSys = await app.inject({
      method: 'POST',
      url: '/api/super/system/action',
      cookies: { lp_session: superCookie },
      payload: { action: 'reconnect_mqtt', password: 'WrongPassword!' },
    });
    assert.equal(badReauthSys.statusCode, 401);

    const okReauthSys = await app.inject({
      method: 'POST',
      url: '/api/super/system/action',
      cookies: { lp_session: superCookie },
      payload: { action: 'reconnect_mqtt', password: 'SuperPassword!2026' },
    });
    assert.equal(okReauthSys.statusCode, 200);

    // 9. Immediate Session Revocation on Account Deactivation
    await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${invOperator.user.id}`,
      cookies: { lp_session: adminCookie },
      payload: { isActive: false },
    });
    const revokedOpCheck = await app.inject({
      method: 'GET',
      url: '/api/devices',
      cookies: { lp_session: opCookie },
    });
    assert.equal(revokedOpCheck.statusCode, 401);
  } finally {
    await app.close();
    await sim.close();
  }
});
