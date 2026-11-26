import { randomUUID } from 'node:crypto';
import type { AlertItem, DeviceConfig } from '@lorapulse/shared';
import { parseJsonColumn, toIso, toIsoOrNull, type DbClient } from '../db/client.js';
import type { NotificationDispatcher } from './notifications.js';
import type { SseHub } from './sseHub.js';

interface WatchdogDeviceRow {
  id: string;
  category_id: string | null;
  name: string;
  location_label: string | null;
  config_json: unknown;
  status: string;
  last_seen_at: unknown;
  maintenance_until: unknown;
}

export class OfflineWatchdog {
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(
    private readonly db: DbClient,
    private readonly sseHub: SseHub,
    private readonly notifications: NotificationDispatcher,
    private readonly intervalMs = 30_000
  ) {}

  start(): void {
    if (this.timer || this.intervalMs <= 0) return;
    this.timer = setInterval(() => {
      void this.runSweep().catch((err) => {
        console.error('[LoRaPulse][Watchdog] Sweep failed:', err);
      });
    }, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runSweep(): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;

    try {
      const res = await this.db.query<WatchdogDeviceRow>(
        `SELECT id, category_id, name, location_label, config_json, status, last_seen_at, maintenance_until
         FROM devices
         WHERE last_seen_at IS NOT NULL`
      );

      const nowMs = Date.now();
      let flaggedCount = 0;

      for (const dev of res.rows) {
        const maintIso = toIsoOrNull(dev.maintenance_until);
        if (maintIso && new Date(maintIso).getTime() > nowMs) {
          continue;
        }

        const lastSeenIso = toIsoOrNull(dev.last_seen_at);
        if (!lastSeenIso) continue;

        const lastSeenMs = new Date(lastSeenIso).getTime();
        if (Number.isNaN(lastSeenMs)) continue;

        const config = parseJsonColumn<DeviceConfig>(dev.config_json, {});
        const expectedIntervalSec = config.expectedIntervalSec ?? 3600;

        if (nowMs - lastSeenMs <= expectedIntervalSec * 3 * 1000) {
          continue;
        }

        let statusUpdated = false;
        if (dev.status !== 'OFFLINE') {
          await this.db.query(`UPDATE devices SET status = 'OFFLINE' WHERE id = $1`, [dev.id]);
          statusUpdated = true;
        }

        const existingAlertRes = await this.db.query<{ id: string }>(
          `SELECT id FROM alerts
           WHERE device_id = $1
             AND alert_type = 'OFFLINE'
             AND status IN ('OPEN', 'ACKED')
           LIMIT 1`,
          [dev.id]
        );

        let createdAlert: AlertItem | null = null;
        if (existingAlertRes.rows.length === 0) {
          const alertId = randomUUID();
          const messageDe = 'Sensor überfällig – kein Lebenszeichen empfangen';
          const messageEn = 'Sensor overdue – no heartbeat received';

          const insRes = await this.db.query<{ created_at: unknown }>(
            `INSERT INTO alerts (
               id, device_id, alert_type, severity, message_de, message_en, status
             )
             VALUES ($1, $2, 'OFFLINE', 'WARN', $3, $4, 'OPEN')
             RETURNING created_at`,
            [alertId, dev.id, messageDe, messageEn]
          );

          createdAlert = {
            id: alertId,
            deviceId: dev.id,
            deviceName: dev.name,
            alertType: 'OFFLINE',
            severity: 'WARN',
            messageDe,
            messageEn,
            status: 'OPEN',
            ackedByName: null,
            ackedAt: null,
            resolvedAt: null,
            createdAt: toIso(insRes.rows[0]?.created_at),
          };

          await this.notifications.dispatchAlertNotifications(
            {
              id: dev.id,
              name: dev.name,
              categoryId: dev.category_id,
              locationLabel: dev.location_label,
              maintenanceUntil: dev.maintenance_until,
            },
            createdAlert
          );

          await this.sseHub.broadcastAlertUpdated(createdAlert);
        }

        if (statusUpdated || createdAlert) {
          flaggedCount += 1;
          await this.sseHub.broadcastDeviceUpdated(dev.id);
        }
      }

      return flaggedCount;
    } finally {
      this.sweeping = false;
    }
  }
}
