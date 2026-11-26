import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { AlertItem, SseEvent, TtnApplicationSummary } from '@lorapulse/shared';
import type { DbClient } from '../db/client.js';
import {
  getEffectiveAccessForDevice,
  loadSingleDeviceViewForUser,
  loadUserSummaryById,
} from './permissions.js';

interface SseClientEntry {
  id: string;
  userId: string;
  sessionId: string;
  res: ServerResponse;
}

export class SseHub {
  private readonly clients = new Map<string, SseClientEntry>();
  private readonly heartbeatTimer: NodeJS.Timeout;

  constructor(private readonly db: DbClient) {
    this.heartbeatTimer = setInterval(() => {
      for (const [id, client] of this.clients.entries()) {
        if (client.res.writableEnded || client.res.destroyed) {
          this.clients.delete(id);
          continue;
        }
        try {
          client.res.write(': heartbeat\n\n');
        } catch {
          this.clients.delete(id);
        }
      }
    }, 25_000);
    this.heartbeatTimer.unref();
  }

  addClient(userId: string, sessionId: string, res: ServerResponse): string {
    const id = randomUUID();
    this.clients.set(id, { id, userId, sessionId, res });
    this.writeEvent(res, { type: 'connected', timestamp: new Date().toISOString() });
    return id;
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  disconnectUser(userId: string): void {
    for (const [id, client] of this.clients.entries()) {
      if (client.userId === userId) {
        this.clients.delete(id);
        try {
          client.res.end();
        } catch {
          // Ignore socket errors during disconnect
        }
      }
    }
  }

  disconnectSession(sessionId: string): void {
    for (const [id, client] of this.clients.entries()) {
      if (client.sessionId === sessionId) {
        this.clients.delete(id);
        try {
          client.res.end();
        } catch {
          // Ignore socket errors during disconnect
        }
      }
    }
  }

  async broadcastDeviceUpdated(deviceId: string): Promise<void> {
    if (this.clients.size === 0) return;

    const uniqueUserIds = new Set<string>();
    for (const c of this.clients.values()) {
      uniqueUserIds.add(c.userId);
    }

    const viewPerUser = new Map<string, SseEvent>();
    await Promise.all(
      Array.from(uniqueUserIds).map(async (userId) => {
        const user = await loadUserSummaryById(this.db, userId);
        if (!user || !user.isActive) return;
        const deviceView = await loadSingleDeviceViewForUser(this.db, user, deviceId);
        if (deviceView) {
          viewPerUser.set(userId, { type: 'device_updated', device: deviceView });
        }
      })
    );

    for (const [id, client] of this.clients.entries()) {
      const event = viewPerUser.get(client.userId);
      if (!event) continue;
      if (!this.writeEvent(client.res, event)) {
        this.clients.delete(id);
      }
    }
  }

  async broadcastAlertUpdated(alert: AlertItem): Promise<void> {
    if (this.clients.size === 0) return;

    const uniqueUserIds = new Set<string>();
    for (const c of this.clients.values()) {
      uniqueUserIds.add(c.userId);
    }

    const allowedUsers = new Set<string>();
    await Promise.all(
      Array.from(uniqueUserIds).map(async (userId) => {
        const user = await loadUserSummaryById(this.db, userId);
        if (!user || !user.isActive) return;
        const { access } = await getEffectiveAccessForDevice(this.db, user, alert.deviceId);
        if (access !== null) {
          allowedUsers.add(userId);
        }
      })
    );

    const event: SseEvent = { type: 'alert_updated', alert };
    for (const [id, client] of this.clients.entries()) {
      if (!allowedUsers.has(client.userId)) continue;
      if (!this.writeEvent(client.res, event)) {
        this.clients.delete(id);
      }
    }
  }

  async broadcastTtnStatus(appSummary: TtnApplicationSummary): Promise<void> {
    if (this.clients.size === 0) return;

    const uniqueUserIds = new Set<string>();
    for (const c of this.clients.values()) {
      uniqueUserIds.add(c.userId);
    }

    const superAdmins = new Set<string>();
    await Promise.all(
      Array.from(uniqueUserIds).map(async (userId) => {
        const user = await loadUserSummaryById(this.db, userId);
        if (user && user.isActive && user.systemRole === 'SUPER_ADMIN') {
          superAdmins.add(userId);
        }
      })
    );

    const event: SseEvent = { type: 'ttn_status', app: appSummary };
    for (const [id, client] of this.clients.entries()) {
      if (!superAdmins.has(client.userId)) continue;
      if (!this.writeEvent(client.res, event)) {
        this.clients.delete(id);
      }
    }
  }

  broadcastPermissionsChanged(targetUserId?: string): void {
    const event: SseEvent = { type: 'permissions_changed' };
    for (const [id, client] of this.clients.entries()) {
      if (targetUserId && client.userId !== targetUserId) continue;
      if (!this.writeEvent(client.res, event)) {
        this.clients.delete(id);
      }
    }
  }

  broadcastProfilesChanged(): void {
    const event: SseEvent = { type: 'profiles_changed' };
    for (const [id, client] of this.clients.entries()) {
      if (!this.writeEvent(client.res, event)) {
        this.clients.delete(id);
      }
    }
  }

  closeAll(): void {
    clearInterval(this.heartbeatTimer);
    for (const client of this.clients.values()) {
      try {
        client.res.end();
      } catch {
        // Ignore
      }
    }
    this.clients.clear();
  }

  private writeEvent(res: ServerResponse, event: SseEvent): boolean {
    if (res.writableEnded || res.destroyed) {
      return false;
    }
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      return true;
    } catch {
      return false;
    }
  }
}
