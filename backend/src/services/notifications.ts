import { randomUUID } from 'node:crypto';
import * as nodemailerNs from 'nodemailer';
import * as webpushNs from 'web-push';
import type { z } from 'zod';
import {
  DEFAULT_USER_DEVICE_PREFERENCE,
  GITHUB_REPO_URL,
  SaveSmtpSettingsSchema,
  type AlertItem,
  type Language,
  type PushSubscriptionSummary,
  type SmtpSettingsSummary,
  type UserSummary,
} from '@lorapulse/shared';
import { parseJsonColumn, toIso, toIsoOrNull, type DbClient } from '../db/client.js';
import { ensureVapidKeyPair } from '../db/schema.js';
import { decryptSecret, encryptSecret } from '../security/crypto.js';
import { loadAuthorizedUsersForDevice } from './permissions.js';

const nodemailer =
  (nodemailerNs as unknown as { default?: typeof nodemailerNs }).default ?? nodemailerNs;
const webpush =
  (webpushNs as unknown as { default?: typeof webpushNs }).default ?? webpushNs;

export type CustomMailSender = (mail: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) => Promise<void>;

export type CustomPushSender = (
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payloadJson: string
) => Promise<{ statusCode?: number } | void>;

export interface PushDeliveryResult {
  sentCount: number;
  failedCount: number;
  removedCount: number;
  lastError: string | null;
}

/**
 * Resolves an RFC 8292 & Apple APNs compliant VAPID subject ("sub" claim).
 * Apple Web Push (web.push.apple.com) strictly rejects ".local", "localhost",
 * or malformed mailto/http origins. Always returns a valid mailto: or https: URI.
 */
export function resolveVapidSubject(options: {
  smtpFromEmail?: string | null;
  publicBaseUrl?: string | null;
  appDomain?: string | null;
  requestOrigin?: string | null;
}): string {
  const email = (options.smtpFromEmail ?? '').trim();
  if (
    email &&
    /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email) &&
    !email.toLowerCase().endsWith('.local') &&
    !email.toLowerCase().endsWith('.localhost') &&
    !email.toLowerCase().endsWith('.invalid')
  ) {
    return `mailto:${email}`;
  }

  const candidateOrigins = [
    options.publicBaseUrl,
    options.appDomain ? `https://${options.appDomain.replace(/^https?:\/\//i, '')}` : null,
    options.requestOrigin,
  ];

  for (const raw of candidateOrigins) {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.toLowerCase();
      if (
        parsed.protocol === 'https:' &&
        host.includes('.') &&
        host !== 'localhost' &&
        !host.endsWith('.local') &&
        !host.endsWith('.localhost') &&
        !/^\d+\.\d+\.\d+\.\d+$/.test(host)
      ) {
        return `https://${host}`;
      }
    } catch {
      // Try next candidate
    }
  }

  return GITHUB_REPO_URL;
}

interface StoredSmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordEncrypted: string | null;
  maskedPassword: string;
  fromEmail: string;
  fromName: string;
  publicBaseUrl: string;
}

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  device_label: string;
  last_used_at: unknown;
  created_at: unknown;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatEndpointPreview(endpoint: string): string {
  try {
    const parsed = new URL(endpoint);
    const tail = endpoint.length > 12 ? endpoint.slice(-8) : '';
    return `${parsed.origin}/...${tail}`;
  } catch {
    return endpoint.length > 48 ? `${endpoint.slice(0, 32)}...${endpoint.slice(-8)}` : endpoint;
  }
}

function buildHtmlMailLayout(params: {
  badgeText: string;
  badgeColor: string;
  heading: string;
  paragraphs: string[];
  actionLabel?: string;
  actionUrl?: string;
  footerNote: string;
}): string {
  const bodyParagraphs = params.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#cbd5e1;">${escapeHtml(p)}</p>`
    )
    .join('');

  const actionHtml =
    params.actionLabel && params.actionUrl
      ? `<div style="margin:22px 0;">
           <a href="${escapeHtml(params.actionUrl)}" style="display:inline-block;padding:10px 18px;background:#0ea5e9;color:#0f172a;font-weight:600;font-size:14px;text-decoration:none;border-radius:6px;">
             ${escapeHtml(params.actionLabel)}
           </a>
         </div>
         <p style="margin:0 0 14px 0;font-size:12px;color:#94a3b8;word-break:break-all;">${escapeHtml(params.actionUrl)}</p>`
      : '';

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#0b1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #1e293b;border-radius:10px;padding:24px;">
    <div style="margin-bottom:16px;">
      <span style="display:inline-block;padding:3px 8px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;border-radius:4px;background:${params.badgeColor};color:#f8fafc;">
        ${escapeHtml(params.badgeText)}
      </span>
    </div>
    <h1 style="margin:0 0 16px 0;font-size:18px;font-weight:600;color:#f8fafc;">${escapeHtml(params.heading)}</h1>
    ${bodyParagraphs}
    ${actionHtml}
    <hr style="border:none;border-top:1px solid #1e293b;margin:20px 0 12px 0;" />
    <p style="margin:0;font-size:12px;color:#64748b;">${escapeHtml(params.footerNote)}</p>
  </div>
</body>
</html>`;
}

export class NotificationDispatcher {
  private readonly customMailSender?: CustomMailSender;
  private readonly customPushSender?: CustomPushSender;

  constructor(
    private readonly db: DbClient,
    options: {
      customMailSender?: CustomMailSender;
      customPushSender?: CustomPushSender;
    } = {}
  ) {
    this.customMailSender = options.customMailSender;
    this.customPushSender = options.customPushSender;
  }

  async getVapidPublicKey(): Promise<string> {
    const keys = await ensureVapidKeyPair(this.db);
    return keys.publicKey;
  }

  private async loadStoredSmtp(): Promise<{
    settings: StoredSmtpSettings | null;
    updatedAt: string | null;
  }> {
    const res = await this.db.query<{ value_json: unknown; updated_at: unknown }>(
      `SELECT value_json, updated_at FROM system_kv WHERE key = 'smtp_settings' LIMIT 1`
    );
    const row = res.rows[0];
    if (!row) {
      return { settings: null, updatedAt: null };
    }
    const parsed = parseJsonColumn<StoredSmtpSettings | null>(row.value_json, null);
    return {
      settings: parsed,
      updatedAt: toIsoOrNull(row.updated_at),
    };
  }

  async isSmtpActive(): Promise<boolean> {
    const { settings } = await this.loadStoredSmtp();
    if (!settings) return false;
    return Boolean(settings.enabled && settings.host.trim() && settings.fromEmail.trim());
  }

  async getSmtpSummary(): Promise<SmtpSettingsSummary> {
    const { settings, updatedAt } = await this.loadStoredSmtp();
    if (!settings) {
      return {
        configured: false,
        enabled: false,
        host: '',
        port: 587,
        secure: false,
        username: '',
        maskedPassword: '',
        fromEmail: '',
        fromName: 'LoRaPulse',
        publicBaseUrl: process.env.PUBLIC_BASE_URL?.trim() || '',
        updatedAt: null,
      };
    }

    const configured = Boolean(settings.host.trim() && settings.fromEmail.trim());
    return {
      configured,
      enabled: Boolean(settings.enabled && configured),
      host: settings.host,
      port: Number(settings.port) || 587,
      secure: Boolean(settings.secure),
      username: settings.username ?? '',
      maskedPassword: settings.maskedPassword ?? '',
      fromEmail: settings.fromEmail,
      fromName: settings.fromName || 'LoRaPulse',
      publicBaseUrl: settings.publicBaseUrl ?? '',
      updatedAt,
    };
  }

  async saveSmtpSettings(
    input: z.infer<typeof SaveSmtpSettingsSchema>
  ): Promise<SmtpSettingsSummary> {
    const { settings: existing } = await this.loadStoredSmtp();

    let passwordEncrypted: string | null = existing?.passwordEncrypted ?? null;
    let maskedPassword: string = existing?.maskedPassword ?? '';

    if (input.password !== undefined && input.password.length > 0) {
      passwordEncrypted = encryptSecret(input.password);
      maskedPassword = '••••••••';
    } else if (!input.username.trim()) {
      passwordEncrypted = null;
      maskedPassword = '';
    }

    const nextSettings: StoredSmtpSettings = {
      enabled: Boolean(input.enabled),
      host: input.host.trim(),
      port: Number(input.port),
      secure: Boolean(input.secure),
      username: input.username.trim(),
      passwordEncrypted,
      maskedPassword,
      fromEmail: input.fromEmail.trim(),
      fromName: input.fromName.trim() || 'LoRaPulse',
      publicBaseUrl: input.publicBaseUrl.trim().replace(/\/+$/, ''),
    };

    await this.db.query(
      `INSERT INTO system_kv (key, value_json, updated_at)
       VALUES ('smtp_settings', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET
         value_json = EXCLUDED.value_json,
         updated_at = NOW()`,
      [JSON.stringify(nextSettings)]
    );

    return this.getSmtpSummary();
  }

  async resolvePublicBaseUrl(fallbackOrigin?: string): Promise<string> {
    const { settings } = await this.loadStoredSmtp();
    const candidate =
      settings?.publicBaseUrl?.trim() ||
      process.env.PUBLIC_BASE_URL?.trim() ||
      fallbackOrigin?.trim() ||
      'http://localhost:8080';
    return candidate.replace(/\/+$/, '');
  }

  async sendEmail(mail: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void> {
    const { settings } = await this.loadStoredSmtp();
    if (!settings || !settings.enabled || !settings.host.trim() || !settings.fromEmail.trim()) {
      throw Object.assign(new Error('SMTP delivery is not configured or disabled'), {
        statusCode: 400,
      });
    }

    const plainPassword = settings.passwordEncrypted
      ? decryptSecret(settings.passwordEncrypted)
      : '';

    if (this.customMailSender) {
      await this.customMailSender(mail);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: settings.host.trim(),
      port: Number(settings.port) || 587,
      secure: Boolean(settings.secure),
      ...(settings.username.trim()
        ? {
            auth: {
              user: settings.username.trim(),
              pass: plainPassword,
            },
          }
        : {}),
    });

    const sanitizedFromName = (settings.fromName || 'LoRaPulse').replace(/"/g, '').trim();
    const fromHeader = sanitizedFromName
      ? `"${sanitizedFromName}" <${settings.fromEmail.trim()}>`
      : settings.fromEmail.trim();

    await transporter.sendMail({
      from: fromHeader,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  }

  async sendTestEmail(recipientEmail: string, lang: Language = 'de'): Promise<void> {
    const isEn = lang === 'en';
    const subject = isEn
      ? '[LoRaPulse] SMTP Configuration Test'
      : '[LoRaPulse] SMTP-Konfigurationstest';
    const paragraphs = isEn
      ? [
          'This test message confirms that your LoRaPulse SMTP server configuration is active and operational.',
          'System notifications, user invitations, and password reset links can now be delivered via email.',
        ]
      : [
          'Diese Testnachricht bestätigt, dass Ihre LoRaPulse-SMTP-Konfiguration aktiv und betriebsbereit ist.',
          'Alarm-Benachrichtigungen, Benutzereinladungen und Passwort-Zurücksetzungen können ab sofort per E-Mail zugestellt werden.',
        ];
    const footer = isEn
      ? 'LoRaPulse Self-Hosted LoRaWAN Monitoring'
      : 'LoRaPulse Self-Hosted LoRaWAN-Überwachung';

    await this.sendEmail({
      to: recipientEmail,
      subject,
      text: paragraphs.join('\n\n'),
      html: buildHtmlMailLayout({
        badgeText: isEn ? 'SMTP TEST' : 'SMTP-TEST',
        badgeColor: '#0284c7',
        heading: subject,
        paragraphs,
        footerNote: footer,
      }),
    });
  }

  async sendPasswordResetEmail(params: {
    to: string;
    displayName: string;
    resetUrl: string;
    lang: Language;
  }): Promise<void> {
    const isEn = params.lang === 'en';
    const subject = isEn
      ? '[LoRaPulse] Password Reset Request'
      : '[LoRaPulse] Passwort zurücksetzen';
    const paragraphs = isEn
      ? [
          `Hello ${params.displayName},`,
          'A password reset was requested for your LoRaPulse account. Use the link below within 30 minutes to set a new password.',
          'If you did not request this change, you can safely ignore this message.',
        ]
      : [
          `Hallo ${params.displayName},`,
          'für Ihr LoRaPulse-Benutzerkonto wurde das Zurücksetzen des Passworts angefordert. Nutzen Sie den folgenden Link innerhalb von 30 Minuten, um ein neues Passwort festzulegen.',
          'Falls Sie diese Anfrage nicht gestellt haben, können Sie diese Nachricht ignorieren.',
        ];

    await this.sendEmail({
      to: params.to,
      subject,
      text: `${paragraphs.join('\n\n')}\n\n${params.resetUrl}`,
      html: buildHtmlMailLayout({
        badgeText: isEn ? 'SECURITY' : 'SICHERHEIT',
        badgeColor: '#475569',
        heading: subject,
        paragraphs,
        actionLabel: isEn ? 'Set New Password' : 'Neues Passwort festlegen',
        actionUrl: params.resetUrl,
        footerNote: isEn
          ? 'Link expires automatically after 30 minutes.'
          : 'Dieser Link verliert nach 30 Minuten automatisch seine Gültigkeit.',
      }),
    });
  }

  async sendInviteEmail(params: {
    to: string;
    displayName: string;
    systemRole: string;
    inviteUrl: string;
    invitedBy: string;
    lang: Language;
  }): Promise<void> {
    const isEn = params.lang === 'en';
    const subject = isEn
      ? '[LoRaPulse] Invitation to LoRaPulse Sensor Platform'
      : '[LoRaPulse] Einladung zur LoRaPulse-Sensorplattform';
    const paragraphs = isEn
      ? [
          `Hello ${params.displayName},`,
          `${params.invitedBy} has invited you to LoRaPulse (role: ${params.systemRole}).`,
          'Open the activation link below to set your personal password and access your assigned sensors.',
        ]
      : [
          `Hallo ${params.displayName},`,
          `${params.invitedBy} hat Sie zu LoRaPulse eingeladen (Systemrolle: ${params.systemRole}).`,
          'Öffnen Sie den folgenden Aktivierungslink, um Ihr persönliches Passwort festzulegen und auf Ihre freigegebenen Sensoren zuzugreifen.',
        ];

    await this.sendEmail({
      to: params.to,
      subject,
      text: `${paragraphs.join('\n\n')}\n\n${params.inviteUrl}`,
      html: buildHtmlMailLayout({
        badgeText: isEn ? 'ACCOUNT INVITE' : 'EINLADUNG',
        badgeColor: '#0284c7',
        heading: subject,
        paragraphs,
        actionLabel: isEn ? 'Activate Account' : 'Konto aktivieren',
        actionUrl: params.inviteUrl,
        footerNote: isEn
          ? 'Invitation link is valid for 7 days.'
          : 'Dieser Einladungslink ist 7 Tage lang gültig.',
      }),
    });
  }

  async sendAlertEmail(params: {
    to: string;
    displayName: string;
    deviceName: string;
    locationLabel: string | null;
    alert: AlertItem;
    dashboardUrl: string;
    lang: Language;
  }): Promise<void> {
    const isEn = params.lang === 'en';
    const sevLabel =
      params.alert.severity === 'ALARM'
        ? 'ALARM'
        : isEn
          ? 'WARNING'
          : 'WARNUNG';
    const message = isEn ? params.alert.messageEn : params.alert.messageDe;
    const subject = `[LoRaPulse ${sevLabel}] ${params.deviceName}`;
    const locationLine = params.locationLabel
      ? isEn
        ? `Location: ${params.locationLabel}`
        : `Standort: ${params.locationLabel}`
      : null;
    const timeLine = isEn
      ? `Timestamp (UTC): ${params.alert.createdAt}`
      : `Zeitpunkt (UTC): ${params.alert.createdAt}`;

    const paragraphs = [
      isEn ? `Hello ${params.displayName},` : `Hallo ${params.displayName},`,
      message,
      ...(locationLine ? [locationLine] : []),
      timeLine,
    ];

    await this.sendEmail({
      to: params.to,
      subject,
      text: `${paragraphs.join('\n\n')}\n\n${params.dashboardUrl}`,
      html: buildHtmlMailLayout({
        badgeText: sevLabel,
        badgeColor: params.alert.severity === 'ALARM' ? '#dc2626' : '#d97706',
        heading: `${params.deviceName}`,
        paragraphs,
        actionLabel: isEn ? 'Open Sensor in LoRaPulse' : 'Sensor in LoRaPulse öffnen',
        actionUrl: params.dashboardUrl,
        footerNote: isEn
          ? 'You are receiving this email because email alerts are enabled for this sensor in your preferences.'
          : 'Sie erhalten diese Nachricht, da Sie E-Mail-Benachrichtigungen für diesen Sensor aktiviert haben.',
      }),
    });
  }

  async listUserSubscriptions(userId: string): Promise<PushSubscriptionSummary[]> {
    const res = await this.db.query<PushSubscriptionRow>(
      `SELECT * FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows.map((row) => ({
      id: row.id,
      deviceLabel: row.device_label,
      endpointPreview: formatEndpointPreview(row.endpoint),
      createdAt: toIso(row.created_at),
      lastUsedAt: toIsoOrNull(row.last_used_at),
    }));
  }

  async registerSubscription(
    userId: string,
    input: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      deviceLabel?: string;
    }
  ): Promise<PushSubscriptionSummary> {
    const id = randomUUID();
    const label = input.deviceLabel?.trim() || 'Browser';
    const res = await this.db.query<PushSubscriptionRow>(
      `INSERT INTO push_subscriptions (
         id, user_id, endpoint, p256dh, auth, device_label
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, endpoint) DO UPDATE SET
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         device_label = EXCLUDED.device_label
       RETURNING *`,
      [id, userId, input.endpoint.trim(), input.keys.p256dh.trim(), input.keys.auth.trim(), label]
    );

    const row = res.rows[0]!;
    return {
      id: row.id,
      deviceLabel: row.device_label,
      endpointPreview: formatEndpointPreview(row.endpoint),
      createdAt: toIso(row.created_at),
      lastUsedAt: toIsoOrNull(row.last_used_at),
    };
  }

  async deleteSubscription(userId: string, subscriptionId: string): Promise<boolean> {
    const res = await this.db.query<{ id: string }>(
      `DELETE FROM push_subscriptions WHERE id = $1 AND user_id = $2 RETURNING id`,
      [subscriptionId, userId]
    );
    return res.rows.length > 0;
  }

  async sendPushToUser(
    userId: string,
    payload: {
      title: string;
      body: string;
      deviceId?: string | null;
      url: string;
      severity?: string;
    },
    requestOrigin?: string
  ): Promise<PushDeliveryResult> {
    const subsRes = await this.db.query<PushSubscriptionRow>(
      `SELECT * FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );
    if (subsRes.rows.length === 0) {
      return { sentCount: 0, failedCount: 0, removedCount: 0, lastError: null };
    }

    const vapidKeys = await ensureVapidKeyPair(this.db);
    const { settings } = await this.loadStoredSmtp();
    const vapidSubject = resolveVapidSubject({
      smtpFromEmail: settings?.fromEmail,
      publicBaseUrl: settings?.publicBaseUrl,
      appDomain: process.env.APP_DOMAIN,
      requestOrigin,
    });

    webpush.setVapidDetails(vapidSubject, vapidKeys.publicKey, vapidKeys.privateKey);

    const payloadJson = JSON.stringify(payload);
    let sentCount = 0;
    let failedCount = 0;
    let removedCount = 0;
    let lastError: string | null = null;

    await Promise.all(
      subsRes.rows.map(async (subRow) => {
        const subObj = {
          endpoint: subRow.endpoint,
          keys: {
            p256dh: subRow.p256dh,
            auth: subRow.auth,
          },
        };

        let endpointHost = 'push-endpoint';
        try {
          endpointHost = new URL(subRow.endpoint).hostname;
        } catch {
          // Keep safe fallback label
        }

        try {
          let statusCode: number | undefined;
          if (this.customPushSender) {
            const hookRes = await this.customPushSender(subObj, payloadJson);
            statusCode = hookRes?.statusCode;
          } else {
            const res = await webpush.sendNotification(subObj, payloadJson, {
              TTL: 86_400,
              urgency: 'high',
              timeout: 10_000,
            });
            statusCode = res.statusCode;
          }

          if (statusCode === 404 || statusCode === 410) {
            await this.db.query(`DELETE FROM push_subscriptions WHERE id = $1`, [subRow.id]);
            removedCount += 1;
            return;
          }

          if (statusCode !== undefined && statusCode >= 400) {
            failedCount += 1;
            lastError = `${endpointHost} HTTP ${statusCode}`;
            console.warn(`[LoRaPulse][Push] Delivery rejected by ${endpointHost}: HTTP ${statusCode}`);
            return;
          }

          sentCount += 1;
          await this.db.query(
            `UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = $1`,
            [subRow.id]
          );
        } catch (err) {
          const webPushErr = err as { statusCode?: number; body?: string; message?: string } | null;
          const code = webPushErr?.statusCode;
          if (code === 404 || code === 410) {
            await this.db.query(`DELETE FROM push_subscriptions WHERE id = $1`, [subRow.id]);
            removedCount += 1;
            return;
          }
          failedCount += 1;
          const safeDetail =
            typeof webPushErr?.body === 'string' && webPushErr.body.trim().length > 0
              ? webPushErr.body.trim().slice(0, 120)
              : webPushErr?.message?.slice(0, 120) || 'Unknown push delivery error';
          lastError = code ? `${endpointHost} HTTP ${code}: ${safeDetail}` : `${endpointHost}: ${safeDetail}`;
          console.error(`[LoRaPulse][Push] Failed delivering to ${endpointHost} (${subRow.device_label}): ${lastError}`);
        }
      })
    );

    return { sentCount, failedCount, removedCount, lastError };
  }

  async sendTestPush(user: UserSummary, requestOrigin?: string): Promise<PushDeliveryResult> {
    const isEn = user.preferredLang === 'en';
    return this.sendPushToUser(
      user.id,
      {
        title: isEn ? 'LoRaPulse Test Notification' : 'LoRaPulse Test-Benachrichtigung',
        body: isEn
          ? 'Web Push notifications are active on this device.'
          : 'Web-Push-Benachrichtigungen sind auf diesem Endgerät aktiv.',
        deviceId: null,
        url: '/',
        severity: 'INFO',
      },
      requestOrigin
    );
  }

  async dispatchAlertNotifications(
    device: {
      id: string;
      name: string;
      categoryId: string | null;
      locationLabel?: string | null;
      maintenanceUntil?: unknown;
    },
    alert: AlertItem
  ): Promise<void> {
    if (alert.status !== 'OPEN') return;

    const maintIso = toIsoOrNull(device.maintenanceUntil);
    if (maintIso && new Date(maintIso).getTime() > Date.now()) {
      return;
    }

    const authorizedUsers = await loadAuthorizedUsersForDevice(
      this.db,
      device.id,
      device.categoryId
    );
    if (authorizedUsers.length === 0) return;

    const prefsRes = await this.db.query<{
      user_id: string;
      push_enabled: boolean;
      email_enabled: boolean;
    }>(
      `SELECT user_id, push_enabled, email_enabled
       FROM user_device_preferences
       WHERE device_id = $1`,
      [device.id]
    );
    const prefsByUser = new Map(prefsRes.rows.map((r) => [r.user_id, r]));

    const smtpActive = await this.isSmtpActive();
    const baseUrl = await this.resolvePublicBaseUrl();
    const dashboardUrl = `${baseUrl}/?device=${encodeURIComponent(device.id)}`;

    await Promise.all(
      authorizedUsers.map(async (user) => {
        const prefRow = prefsByUser.get(user.id);
        const pushEnabled = prefRow
          ? Boolean(prefRow.push_enabled)
          : DEFAULT_USER_DEVICE_PREFERENCE.pushEnabled;
        const emailEnabled = prefRow
          ? Boolean(prefRow.email_enabled)
          : DEFAULT_USER_DEVICE_PREFERENCE.emailEnabled;

        const isEn = user.preferredLang === 'en';
        const title =
          alert.severity === 'ALARM'
            ? `LoRaPulse Alarm: ${device.name}`
            : isEn
              ? `LoRaPulse Warning: ${device.name}`
              : `LoRaPulse Warnung: ${device.name}`;
        const body = isEn ? alert.messageEn : alert.messageDe;

        if (pushEnabled) {
          await this.sendPushToUser(user.id, {
            title,
            body,
            deviceId: device.id,
            url: `/?device=${device.id}`,
            severity: alert.severity,
          });
        }

        if (emailEnabled && smtpActive) {
          try {
            await this.sendAlertEmail({
              to: user.email,
              displayName: user.displayName,
              deviceName: device.name,
              locationLabel: device.locationLabel ?? null,
              alert,
              dashboardUrl,
              lang: user.preferredLang,
            });
          } catch (err) {
            console.error(
              `[LoRaPulse][SMTP] Failed sending alert email to ${user.email}:`,
              err
            );
          }
        }
      })
    );
  }
}
