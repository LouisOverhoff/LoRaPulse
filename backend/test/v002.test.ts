import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createTtnSimulatorServer } from '../../simulator/dist/index.js';

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

test('LoRaPulse v0.0.2 – Web-Push, SMTP, Password Reset, Per-Sensor Prefs, Profile Delete & Ideas A-D', async () => {
  const TEST_TTN_APP_ID = 'lorapulse-v002-ttn';
  const TEST_TTN_KEY = 'NNSXS.V002_PLACEHOLDER_KEY_11223344';
  const ipcPath =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\lorapulse-v002-${process.pid}-${Date.now()}`
      : `/tmp/lorapulse-v002-${process.pid}-${Date.now()}.sock`;

  const sim = await createTtnSimulatorServer({
    ipcPath,
    ttnAppId: TEST_TTN_APP_ID,
    expectedApiKey: TEST_TTN_KEY,
  });

  const sentEmails: Array<{ to: string; subject: string; text: string; html: string }> = [];
  const sentPushes: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];

  const app = await createApp({
    databaseUrl: ':memory:',
    setupToken: 'setup-token-v002',
    enableDemo: false,
    logger: false,
    watchdogIntervalMs: 0, // deterministic manual sweep trigger
    customMailSender: async (mail) => {
      sentEmails.push(mail);
    },
    customPushSender: async (sub, payloadJson) => {
      if (sub.endpoint.includes('expired-410')) {
        const err = Object.assign(new Error('Gone'), { statusCode: 410 });
        throw err;
      }
      sentPushes.push({
        endpoint: sub.endpoint,
        payload: JSON.parse(payloadJson) as Record<string, unknown>,
      });
      return { statusCode: 201 };
    },
  });

  try {
    // 1. Bootstrap status check (v0.0.2 + GitHub Repo URL + Auto-VAPID Key)
    const status0 = await app.inject({ method: 'GET', url: '/api/auth/status' });
    assert.equal(status0.statusCode, 200);
    const s0 = status0.json();
    assert.equal(s0.version, '0.0.2');
    assert.equal(s0.repoUrl, 'https://github.com/LouisOverhoff/LoRaPulse');
    assert.equal(s0.smtpConfigured, false);
    assert.ok(typeof s0.vapidPublicKey === 'string' && s0.vapidPublicKey.length > 20);

    // Setup initial SUPER_ADMIN
    const setupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        setupToken: 'setup-token-v002',
        email: 'boss@lorapulse.example',
        displayName: 'Super Boss',
        password: 'SuperPassword!2026',
        preferredLang: 'de',
      },
    });
    assert.equal(setupRes.statusCode, 200);
    const superCookie = setupRes.cookies.find((c) => c.name === 'lp_session')!.value;

    // 2. Register Phone + Laptop + Expired Push Subscriptions & Test Push Pruning
    const subPhone = await app.inject({
      method: 'POST',
      url: '/api/push/subscriptions',
      cookies: { lp_session: superCookie },
      payload: {
        endpoint: 'https://push.example.org/sub/iphone-pwa-1',
        keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ', auth: 'tBHItJI5svbpC7ht' },
        deviceLabel: 'iPhone (Safari PWA)',
      },
    });
    assert.equal(subPhone.statusCode, 200);

    const subLaptop = await app.inject({
      method: 'POST',
      url: '/api/push/subscriptions',
      cookies: { lp_session: superCookie },
      payload: {
        endpoint: 'https://push.example.org/sub/laptop-edge-2',
        keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ', auth: 'tBHItJI5svbpC7ht' },
        deviceLabel: 'Windows Laptop (Edge)',
      },
    });
    assert.equal(subLaptop.statusCode, 200);

    await app.inject({
      method: 'POST',
      url: '/api/push/subscriptions',
      cookies: { lp_session: superCookie },
      payload: {
        endpoint: 'https://push.example.org/sub/expired-410',
        keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ', auth: 'tBHItJI5svbpC7ht' },
        deviceLabel: 'Old Device',
      },
    });

    const testPushRes = await app.inject({
      method: 'POST',
      url: '/api/push/test',
      cookies: { lp_session: superCookie },
    });
    assert.equal(testPushRes.statusCode, 200);
    assert.equal(testPushRes.json().sentCount, 2);

    const activeSubsAfter = (
      await app.inject({
        method: 'GET',
        url: '/api/push/subscriptions',
        cookies: { lp_session: superCookie },
      })
    ).json().subscriptions;
    assert.equal(activeSubsAfter.length, 2, '410 Gone subscription must be pruned automatically');

    // 3. Configure SMTP (SUPER_ADMIN) & Test Self-Service Password Reset
    const saveSmtpRes = await app.inject({
      method: 'PUT',
      url: '/api/super/smtp',
      cookies: { lp_session: superCookie },
      payload: {
        enabled: true,
        host: 'mail.overhoff.example',
        port: 587,
        secure: false,
        username: 'lorapulse@overhoff.example',
        password: 'SMTP_SECRET_PLACEHOLDER_DO_NOT_LEAK',
        fromEmail: 'lorapulse@overhoff.example',
        fromName: 'LoRaPulse',
        publicBaseUrl: 'https://lorapulse.overhoff.it',
      },
    });
    assert.equal(saveSmtpRes.statusCode, 200);
    assert.ok(
      !JSON.stringify(saveSmtpRes.json()).includes('SMTP_SECRET_PLACEHOLDER_DO_NOT_LEAK'),
      'Raw SMTP password must never be exposed'
    );

    const statusWithSmtp = (await app.inject({ method: 'GET', url: '/api/auth/status' })).json();
    assert.equal(statusWithSmtp.smtpConfigured, true);

    const testMailRes = await app.inject({
      method: 'POST',
      url: '/api/super/smtp/test',
      cookies: { lp_session: superCookie },
      payload: { recipientEmail: 'check@overhoff.example' },
    });
    assert.equal(testMailRes.statusCode, 200);
    assert.equal(sentEmails.length, 1);

    // Invite an OPERATOR user with direct email delivery & redeem
    const invUserRes = await app.inject({
      method: 'POST',
      url: '/api/admin/users/invite',
      cookies: { lp_session: superCookie },
      payload: {
        email: 'operator@overhoff.example',
        displayName: 'Revier Operator',
        systemRole: 'USER',
        groupIds: [],
        sendEmail: true,
      },
    });
    assert.equal(invUserRes.statusCode, 200);
    assert.equal(invUserRes.json().emailSent, true);
    assert.equal(sentEmails.length, 2);

    const opInviteToken = invUserRes.json().token as string;
    const opUserId = invUserRes.json().user.id as string;
    const redeemRes = await app.inject({
      method: 'POST',
      url: '/api/auth/invite/redeem',
      payload: {
        token: opInviteToken,
        password: 'InitialOpPassword!1',
        preferredLang: 'de',
      },
    });
    assert.equal(redeemRes.statusCode, 200);
    const oldOpCookie = redeemRes.cookies.find((c) => c.name === 'lp_session')!.value;

    // Self-service password reset flow
    const resetReq = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      payload: { email: 'operator@overhoff.example', lang: 'de' },
    });
    assert.equal(resetReq.statusCode, 200);
    assert.equal(sentEmails.length, 3);

    const resetMail = sentEmails[sentEmails.length - 1]!;
    const tokenMatch = /\/reset-password\/([a-f0-9]+)/i.exec(resetMail.text);
    assert.ok(tokenMatch, 'Password reset email must contain /reset-password/<token>');
    const resetToken = tokenMatch[1]!;

    const checkReset = await app.inject({
      method: 'GET',
      url: `/api/auth/password-reset/${resetToken}`,
    });
    assert.equal(checkReset.json().valid, true);

    const confirmReset = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/confirm',
      payload: { token: resetToken, newPassword: 'NewOpPassword!2026' },
    });
    assert.equal(confirmReset.statusCode, 200);

    // Old session must be revoked after password reset!
    const oldSessCheck = await app.inject({
      method: 'GET',
      url: '/api/devices',
      cookies: { lp_session: oldOpCookie },
    });
    assert.equal(oldSessCheck.statusCode, 401);

    // Re-login with new password
    const newOpLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'operator@overhoff.example', password: 'NewOpPassword!2026' },
    });
    assert.equal(newOpLogin.statusCode, 200);
    const opCookie = newOpLogin.cookies.find((c) => c.name === 'lp_session')!.value;

    // 4. Connect TTN Simulator, Verify Default Notification Prefs (Push=ON, Email=OFF) & Idea B Auto-Resolve
    await app.inject({
      method: 'POST',
      url: '/api/super/ttn-apps',
      cookies: { lp_session: superCookie },
      payload: {
        name: 'v0.0.2 Sim Broker',
        ttnAppId: TEST_TTN_APP_ID,
        host: sim.socketPath!,
        port: 1883,
        useTls: false,
        apiKey: TEST_TTN_KEY,
        isEnabled: true,
      },
    });

    await waitForCondition(async () => {
      const r = await app.inject({
        method: 'GET',
        url: '/api/super/ttn-apps',
        cookies: { lp_session: superCookie },
      });
      return r.json().apps[0]?.connectionStatus === 'CONNECTED';
    });

    sentPushes.length = 0;
    const emailsBeforeAlarm = sentEmails.length;

    // Emit DS03A-LB door open alarm -> Push MUST fire (default ON), Email MUST NOT fire (default OFF)!
    await sim.publishDs03aUplink({
      deviceId: 'ds03a-v002-door',
      devEui: 'A840410002000001',
      doorOpen: true,
      batV: 3.61,
    });

    await waitForCondition(async () => sentPushes.length >= 2);
    assert.equal(
      sentEmails.length,
      emailsBeforeAlarm,
      'Email must NOT be sent by default (emailEnabled defaults to false)'
    );

    const devList = (
      await app.inject({
        method: 'GET',
        url: '/api/devices',
        cookies: { lp_session: superCookie },
      })
    ).json().devices;
    const doorDev = devList[0]!;
    assert.deepEqual(doorDev.userPreference, {
      pushEnabled: true,
      emailEnabled: false,
      isFavorite: false,
    });

    // Grant OPERATOR access to opUserId on doorDev
    await app.inject({
      method: 'POST',
      url: '/api/admin/permissions',
      cookies: { lp_session: superCookie },
      payload: {
        userId: opUserId,
        groupId: null,
        categoryId: null,
        deviceId: doorDev.id,
        level: 'OPERATOR',
      },
    });

    // Idea B: Door closes -> OPEN alert automatically transitions to RESOLVED!
    await sim.publishDs03aUplink({
      deviceId: 'ds03a-v002-door',
      devEui: 'A840410002000001',
      doorOpen: false,
      batV: 3.61,
    });

    await waitForCondition(async () => {
      const aRes = await app.inject({
        method: 'GET',
        url: '/api/alerts',
        cookies: { lp_session: superCookie },
      });
      const alerts = aRes.json().alerts as Array<{ status: string }>;
      return alerts.every((a) => a.status === 'RESOLVED') || alerts.filter((a) => a.status === 'OPEN').length === 0;
    });

    // Operator customizes per-sensor prefs: Favorite=true, Push=false, Email=true!
    const prefRes = await app.inject({
      method: 'PUT',
      url: `/api/devices/${doorDev.id}/preferences`,
      cookies: { lp_session: opCookie },
      payload: { isFavorite: true, pushEnabled: false, emailEnabled: true },
    });
    assert.equal(prefRes.statusCode, 200);
    assert.deepEqual(prefRes.json().device.userPreference, {
      pushEnabled: false,
      emailEnabled: true,
      isFavorite: true,
    });

    // Trigger door open again -> now Operator receives an Email!
    const emailsBeforeSecondAlarm = sentEmails.length;
    await sim.publishDs03aUplink({
      deviceId: 'ds03a-v002-door',
      devEui: 'A840410002000001',
      doorOpen: true,
      batV: 3.61,
    });

    await waitForCondition(async () => sentEmails.length > emailsBeforeSecondAlarm);
    assert.equal(sentEmails[sentEmails.length - 1]!.to, 'operator@overhoff.example');

    // Close door again so alert resolves cleanly
    await sim.publishDs03aUplink({
      deviceId: 'ds03a-v002-door',
      devEui: 'A840410002000001',
      doorOpen: false,
      batV: 3.61,
    });
    await sleep(150);

    // 5. Idea C: Maintenance / Snooze Mode suppresses new alarms & notifications
    const maintRes = await app.inject({
      method: 'POST',
      url: `/api/devices/${doorDev.id}/maintenance`,
      cookies: { lp_session: opCookie },
      payload: { durationMinutes: 60 },
    });
    assert.equal(maintRes.statusCode, 200);
    assert.ok(maintRes.json().device.maintenanceUntil);

    const emailsDuringMaint = sentEmails.length;
    await sim.publishDs03aUplink({
      deviceId: 'ds03a-v002-door',
      devEui: 'A840410002000001',
      doorOpen: true,
      batV: 3.61,
    });
    await sleep(200);
    assert.equal(sentEmails.length, emailsDuringMaint, 'Maintenance mode must suppress alarm emails');

    // End maintenance mode
    const clearMaint = await app.inject({
      method: 'POST',
      url: `/api/devices/${doorDev.id}/maintenance`,
      cookies: { lp_session: opCookie },
      payload: { durationMinutes: 0 },
    });
    assert.equal(clearMaint.json().device.maintenanceUntil, null);

    // 6. Idea A: Active Offline Watchdog Sweep
    await app.inject({
      method: 'PATCH',
      url: `/api/devices/${doorDev.id}`,
      cookies: { lp_session: superCookie },
      payload: { config: { expectedIntervalSec: 60 } },
    });
    await app.db.query(
      `UPDATE devices SET last_seen_at = NOW() - INTERVAL '10 minutes', status = 'OK' WHERE id = $1`,
      [doorDev.id]
    );

    const flagged = await app.runOfflineWatchdogSweep();
    assert.equal(flagged, 1);

    const afterWatchdog = (
      await app.inject({
        method: 'GET',
        url: '/api/devices',
        cookies: { lp_session: superCookie },
      })
    ).json().devices.find((d: { id: string }) => d.id === doorDev.id);
    assert.equal(afterWatchdog.status, 'OFFLINE');

    // 7. Custom Sensor Profile Deletion with Safe Device Fallback
    const createProf = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      cookies: { lp_session: superCookie },
      payload: {
        id: 'custom_soil_v2',
        name: 'Bodenfeuchte-Sensor',
        brand: 'custom',
        model: 'soil-1',
        icon: 'activity',
        batteryChemistry: 'li_socl2_3v6',
        downlinkIntervalCodec: 'none',
        fields: [
          {
            key: 'moisture',
            label: { de: 'Bodenfeuchte', en: 'Soil Moisture' },
            kind: 'number',
            unit: '%',
            isPrimary: true,
          },
        ],
      },
    });
    assert.equal(createProf.statusCode, 200);

    await app.inject({
      method: 'PATCH',
      url: `/api/devices/${doorDev.id}`,
      cookies: { lp_session: superCookie },
      payload: { sensorProfileId: 'custom_soil_v2' },
    });

    // Built-in profile deletion must be blocked (400)
    const delBuiltIn = await app.inject({
      method: 'DELETE',
      url: '/api/profiles/dragino_d20_lb',
      cookies: { lp_session: superCookie },
    });
    assert.equal(delBuiltIn.statusCode, 400);

    // Custom profile deletion succeeds and safely reassigns device to generic_json
    const delCustom = await app.inject({
      method: 'DELETE',
      url: '/api/profiles/custom_soil_v2',
      cookies: { lp_session: superCookie },
    });
    assert.equal(delCustom.statusCode, 200);
    assert.equal(delCustom.json().reassignedDevices, 1);

    const devAfterProfDel = (
      await app.inject({
        method: 'GET',
        url: '/api/devices',
        cookies: { lp_session: superCookie },
      })
    ).json().devices.find((d: { id: string }) => d.id === doorDev.id);
    assert.equal(devAfterProfDel.sensorProfileId, 'generic_json');
  } finally {
    await app.close();
    await sim.close();
  }
});
