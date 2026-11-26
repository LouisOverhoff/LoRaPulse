import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Bell,
  Code2,
  Copy,
  FolderPlus,
  KeyRound,
  Mail,
  Power,
  RefreshCw,
  Save,
  Send,
  Server,
  Shield,
  Smartphone,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import type {
  AuditLogItem,
  CategoryNode,
  DeviceView,
  Language,
  PermissionGrant,
  PermissionLevel,
  PushSubscriptionSummary,
  SensorProfile,
  SmtpSettingsSummary,
  TtnApplicationSummary,
  UserGroup,
  UserSummary,
} from '@lorapulse/shared';
import { api } from '../api';
import {
  formatAuditActionLabel,
  formatAuditTargetLabel,
  formatRoleLabel,
  formatTtnStatusLabel,
  t,
  translateApiError,
} from '../i18n';
import {
  formatDateTime,
  isAdminOrSuper,
  isSuperAdmin,
} from '../utils/telemetry';
import { JsonMapperPanel } from './JsonMapperPanel';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function detectDeviceLabel(lang: Language): string {
  if (typeof navigator === 'undefined') {
    return lang === 'de' ? 'Web-Browser' : 'Web Browser';
  }
  const ua = navigator.userAgent || '';
  if (/iPhone/i.test(ua)) return 'iPhone (Safari)';
  if (/iPad/i.test(ua)) return 'iPad (Safari)';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows (Browser)';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS (Browser)';
  if (/Linux/i.test(ua)) return 'Linux (Browser)';
  return lang === 'de' ? 'Web-Browser' : 'Web Browser';
}

export function AdminView({
  user,
  devices,
  categories,
  profiles,
  ttnAppsFromSse,
  smtpConfigured,
  vapidPublicKey,
  lang,
  onChangeLang,
  onUserUpdated,
  onCategoriesChanged,
  onProfileSaved,
  onProfileDeleted,
  onSmtpConfiguredChanged,
  onNotify,
}: {
  user: UserSummary;
  devices: DeviceView[];
  categories: CategoryNode[];
  profiles: SensorProfile[];
  ttnAppsFromSse: TtnApplicationSummary[];
  smtpConfigured: boolean;
  vapidPublicKey: string | null;
  lang: Language;
  onChangeLang: (lang: Language) => void;
  onUserUpdated: (user: UserSummary) => void;
  onCategoriesChanged: () => Promise<void>;
  onProfileSaved: (profile: SensorProfile) => void;
  onProfileDeleted: (profileId: string) => Promise<void>;
  onSmtpConfiguredChanged: (configured: boolean) => void;
  onNotify: (msg: string, kind?: 'info' | 'error') => void;
}) {
  const adminAccess = isAdminOrSuper(user);
  const superAdminAccess = isSuperAdmin(user);

  const [subTab, setSubTab] = useState<'profile' | 'access' | 'mapper' | 'system'>(
    'profile'
  );

  // Profile state
  const [profName, setProfName] = useState(user.displayName);
  const [profLang, setProfLang] = useState<Language>(lang);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Web-Push state
  const [pushSubs, setPushSubs] = useState<PushSubscriptionSummary[]>([]);
  const [pushDeviceName, setPushDeviceName] = useState(() => detectDeviceLabel(lang));
  const [subscribingPush, setSubscribingPush] = useState(false);
  const [testingPush, setTestingPush] = useState(false);

  const pushSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const isStandalonePwa =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true);

  // Access management state (ADMIN + SUPER_ADMIN)
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [permissions, setPermissions] = useState<PermissionGrant[]>([]);

  const [invEmail, setInvEmail] = useState('');
  const [invName, setInvName] = useState('');
  const [invRole, setInvRole] = useState<'USER' | 'ADMIN'>('USER');
  const [invGroupIds, setInvGroupIds] = useState<string[]>([]);
  const [invSendEmail, setInvSendEmail] = useState<boolean>(false);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);
  const [inviteEmailWasSent, setInviteEmailWasSent] = useState(false);

  const [grpName, setGrpName] = useState('');
  const [grpDesc, setGrpDesc] = useState('');

  const [catName, setCatName] = useState('');
  const [catParentId, setCatParentId] = useState('');

  const [permSubjectKind, setPermSubjectKind] = useState<'user' | 'group'>('user');
  const [permUserId, setPermUserId] = useState('');
  const [permGroupId, setPermGroupId] = useState('');
  const [permTargetKind, setPermTargetKind] = useState<'category' | 'device'>('category');
  const [permCategoryId, setPermCategoryId] = useState('');
  const [permDeviceId, setPermDeviceId] = useState('');
  const [permLevel, setPermLevel] = useState<PermissionLevel>('VIEWER');

  // Super Admin state (TTN Apps, SMTP Mail Server, System Control, Audit Logs)
  const [ttnApps, setTtnApps] = useState<TtnApplicationSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  const [ttnName, setTtnName] = useState('');
  const [ttnAppId, setTtnAppId] = useState('');
  const [ttnHost, setTtnHost] = useState('eu1.cloud.thethings.network');
  const [ttnPort, setTtnPort] = useState(8883);
  const [ttnTls, setTtnTls] = useState(true);
  const [ttnApiKey, setTtnApiKey] = useState('');
  const [savingTtn, setSavingTtn] = useState(false);

  // SMTP Settings state
  const [smtpSummary, setSmtpSummary] = useState<SmtpSettingsSummary | null>(null);
  const [smtpEnabled, setSmtpEnabled] = useState(true);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('LoRaPulse');
  const [smtpPublicUrl, setSmtpPublicUrl] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : ''
  );
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [smtpTestEmail, setSmtpTestEmail] = useState(user.email);
  const [testingSmtp, setTestingSmtp] = useState(false);

  const [sysPassword, setSysPassword] = useState('');
  const [runningSysAction, setRunningSysAction] = useState<string | null>(null);

  // Merge SSE TTN status updates into local TTN list
  useEffect(() => {
    if (ttnAppsFromSse.length === 0) return;
    setTtnApps((prev) => {
      const map = new Map(prev.map((a) => [a.id, a]));
      for (const updated of ttnAppsFromSse) {
        map.set(updated.id, updated);
      }
      return Array.from(map.values());
    });
  }, [ttnAppsFromSse]);

  async function loadPushSubscriptions() {
    try {
      const subs = await api.getPushSubscriptions();
      setPushSubs(subs);
    } catch {
      // Ignore if endpoint is temporarily unavailable
    }
  }

  async function loadAdminData() {
    if (!adminAccess) return;
    try {
      const [u, g, p] = await Promise.all([
        api.getUsers(),
        api.getGroups(),
        api.getPermissions(),
      ]);
      setUsers(u);
      setGroups(g);
      setPermissions(p);
      if (!permUserId && u[0]) setPermUserId(u[0].id);
      if (!permGroupId && g[0]) setPermGroupId(g[0].id);
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    }
  }

  async function loadSuperData() {
    if (!superAdminAccess) return;
    try {
      const [apps, logs, smtp] = await Promise.all([
        api.getTtnApps(),
        api.getAuditLogs(),
        api.getSmtpSettings().catch(() => null),
      ]);
      setTtnApps(apps);
      setAuditLogs(logs);
      if (smtp) {
        setSmtpSummary(smtp);
        setSmtpEnabled(smtp.enabled);
        if (smtp.host) setSmtpHost(smtp.host);
        if (smtp.port) setSmtpPort(smtp.port);
        setSmtpSecure(Boolean(smtp.secure));
        setSmtpUsername(smtp.username ?? '');
        if (smtp.fromEmail) setSmtpFromEmail(smtp.fromEmail);
        if (smtp.fromName) setSmtpFromName(smtp.fromName);
        if (smtp.publicBaseUrl) setSmtpPublicUrl(smtp.publicBaseUrl);
      }
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    }
  }

  useEffect(() => {
    if (subTab === 'profile') {
      loadPushSubscriptions();
    } else if (subTab === 'access' && adminAccess) {
      loadAdminData();
    } else if (subTab === 'system' && superAdminAccess) {
      loadSuperData();
    }
  }, [subTab, adminAccess, superAdminAccess]);

  useEffect(() => {
    if (!permCategoryId && categories[0]) setPermCategoryId(categories[0].id);
    if (!permDeviceId && devices[0]) setPermDeviceId(devices[0].id);
  }, [categories, devices]);

  async function handleSavePreferences(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await api.updatePreferences({
        displayName: profName.trim(),
        preferredLang: profLang,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      });
      onChangeLang(profLang);
      onUserUpdated(updated);
      setCurrentPassword('');
      setNewPassword('');
      onNotify(t(profLang, 'savedSuccess'), 'info');
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleEnablePush() {
    if (!pushSupported) {
      onNotify(t(lang, 'pushUnsupportedNotice'), 'error');
      return;
    }
    if (!vapidPublicKey) {
      onNotify(t(lang, 'pushNoVapidNotice'), 'error');
      return;
    }

    setSubscribingPush(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        onNotify(t(lang, 'pushPermissionDenied'), 'error');
        return;
      }

      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      }
      const readyReg = await navigator.serviceWorker.ready;

      let sub = await readyReg.pushManager.getSubscription();
      if (!sub) {
        const appServerKey = urlBase64ToUint8Array(vapidPublicKey);
        sub = await readyReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey.buffer as ArrayBuffer,
        });
      }

      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh ?? '';
      const auth = json.keys?.auth ?? '';

      await api.registerPushSubscription({
        endpoint: sub.endpoint,
        keys: { p256dh, auth },
        deviceLabel: pushDeviceName.trim() || detectDeviceLabel(lang),
      });

      await loadPushSubscriptions();
      onNotify(t(lang, 'pushRegisteredSuccess'), 'info');
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    } finally {
      setSubscribingPush(false);
    }
  }

  async function handleDeletePushSub(id: string) {
    try {
      await api.deletePushSubscription(id);
      setPushSubs((prev) => prev.filter((s) => s.id !== id));
      onNotify(t(lang, 'pushRemovedSuccess'), 'info');
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    }
  }

  async function handleSendTestPush() {
    setTestingPush(true);
    try {
      await api.sendTestPush();
      onNotify(t(lang, 'pushTestSentSuccess'), 'info');
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    } finally {
      setTestingPush(false);
    }
  }

  async function handleInviteUser(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await api.inviteUser({
        email: invEmail.trim(),
        displayName: invName.trim(),
        systemRole: invRole,
        groupIds: invGroupIds,
        sendEmail: smtpConfigured && invSendEmail,
      });
      const fullUrl = res.invitePath.startsWith('http')
        ? res.invitePath
        : `${window.location.origin}${res.invitePath.startsWith('/') ? '' : '/'}${res.invitePath}`;
      setGeneratedInviteUrl(fullUrl);
      setInviteEmailWasSent(Boolean(res.emailSent));
      setInvEmail('');
      setInvName('');
      setInvGroupIds([]);
      await loadAdminData();
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    }
  }

  async function handleToggleUserActive(u: UserSummary) {
    try {
      await api.updateUser(u.id, { isActive: !u.isActive });
      await loadAdminData();
      onNotify(t(lang, 'savedSuccess'), 'info');
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    }
  }

  async function handleToggleUserGroup(u: UserSummary, groupId: string) {
    const nextGroups = u.groupIds.includes(groupId)
      ? u.groupIds.filter((id) => id !== groupId)
      : [...u.groupIds, groupId];
    try {
      await api.updateUser(u.id, { groupIds: nextGroups });
      await loadAdminData();
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    }
  }

  async function handleCreateGroup(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createGroup({
        name: grpName.trim(),
        description: grpDesc.trim(),
        memberUserIds: [],
      });
      setGrpName('');
      setGrpDesc('');
      await loadAdminData();
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    }
  }

  async function handleCreateCategory(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createCategory({
        name: catName.trim(),
        parentId: catParentId || null,
      });
      setCatName('');
      setCatParentId('');
      await onCategoriesChanged();
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    }
  }

  async function handleCreatePermission(e: FormEvent) {
    e.preventDefault();
    try {
      await api.createPermission({
        userId: permSubjectKind === 'user' ? permUserId : null,
        groupId: permSubjectKind === 'group' ? permGroupId : null,
        categoryId: permTargetKind === 'category' ? permCategoryId : null,
        deviceId: permTargetKind === 'device' ? permDeviceId : null,
        level: permLevel,
      });
      await loadAdminData();
      onNotify(t(lang, 'savedSuccess'), 'info');
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    }
  }

  async function handleCreateTtnApp(e: FormEvent) {
    e.preventDefault();
    setSavingTtn(true);
    try {
      await api.createTtnApp({
        name: ttnName.trim(),
        ttnAppId: ttnAppId.trim(),
        host: ttnHost.trim(),
        port: Number(ttnPort) || 8883,
        useTls: ttnTls,
        apiKey: ttnApiKey.trim(),
        isEnabled: true,
      });
      setTtnName('');
      setTtnAppId('');
      setTtnApiKey('');
      await loadSuperData();
      onNotify(t(lang, 'savedSuccess'), 'info');
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    } finally {
      setSavingTtn(false);
    }
  }

  async function handleSaveSmtp(e: FormEvent) {
    e.preventDefault();
    setSavingSmtp(true);
    try {
      const saved = await api.saveSmtpSettings({
        enabled: smtpEnabled,
        host: smtpHost.trim(),
        port: Number(smtpPort) || 587,
        secure: smtpSecure,
        username: smtpUsername.trim(),
        password: smtpPassword.trim() ? smtpPassword : undefined,
        fromEmail: smtpFromEmail.trim(),
        fromName: smtpFromName.trim() || 'LoRaPulse',
        publicBaseUrl: smtpPublicUrl.trim(),
      });
      setSmtpSummary(saved);
      setSmtpPassword('');
      onSmtpConfiguredChanged(Boolean(saved.configured && saved.enabled));
      await loadSuperData();
      onNotify(t(lang, 'smtpSavedSuccess'), 'info');
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    } finally {
      setSavingSmtp(false);
    }
  }

  async function handleTestSmtp(e: FormEvent) {
    e.preventDefault();
    if (!smtpTestEmail.trim()) return;
    setTestingSmtp(true);
    try {
      await api.sendTestSmtpEmail(smtpTestEmail.trim());
      await loadSuperData();
      onNotify(t(lang, 'smtpTestSuccess'), 'info');
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    } finally {
      setTestingSmtp(false);
    }
  }

  async function handleSystemAction(
    action: 'reconnect_mqtt' | 'restart_app' | 'reboot_host'
  ) {
    if (!sysPassword) return;
    setRunningSysAction(action);
    try {
      await api.triggerSystemAction({ action, password: sysPassword });
      setSysPassword('');
      onNotify(t(lang, 'systemActionTriggered'), 'info');
      await loadSuperData();
    } catch (err) {
      onNotify(translateApiError(err, lang), 'error');
    } finally {
      setRunningSysAction(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Sub-navigation tabs */}
      <div className="lp-surface rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setSubTab('profile')}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
            subTab === 'profile'
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" strokeWidth={1.85} />
          {t(lang, 'adminTabProfile')}
        </button>

        {adminAccess && (
          <>
            <button
              type="button"
              onClick={() => setSubTab('access')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                subTab === 'access'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Users className="w-3.5 h-3.5" strokeWidth={1.85} />
              {t(lang, 'adminTabAccess')}
            </button>

            <button
              type="button"
              onClick={() => setSubTab('mapper')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                subTab === 'mapper'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" strokeWidth={1.85} />
              {t(lang, 'adminTabMapper')}
            </button>
          </>
        )}

        {superAdminAccess && (
          <button
            type="button"
            onClick={() => setSubTab('system')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              subTab === 'system'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Server className="w-3.5 h-3.5" strokeWidth={1.85} />
            {t(lang, 'adminTabSystem')}
          </button>
        )}
      </div>

      {/* SUB-TAB 1: PROFILE, WEB-PUSH DEVICES & PWA STATUS */}
      {subTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <section className="lp-surface rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-bold">{t(lang, 'profileTitle')}</h2>

            {user.mustChangePassword && (
              <div className="p-3 rounded-xl bg-amber-500/14 border border-amber-500/35 text-amber-500 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.85} />
                <span>{t(lang, 'mustChangePwWarning')}</span>
              </div>
            )}

            <form onSubmit={handleSavePreferences} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t(lang, 'emailLabel')}
                </label>
                <input
                  type="email"
                  disabled
                  value={user.email}
                  className="lp-input opacity-70"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t(lang, 'displayNameLabel')}
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={profName}
                  onChange={(e) => setProfName(e.target.value)}
                  className="lp-input"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {t(lang, 'preferredLangLabel')}
                </label>
                <select
                  value={profLang}
                  onChange={(e) => setProfLang(e.target.value as Language)}
                  className="lp-input"
                >
                  <option value="de">Deutsch (DE)</option>
                  <option value="en">English (EN)</option>
                </select>
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t(lang, 'currentPasswordLabel')}
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="lp-input"
                    autoComplete="current-password"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t(lang, 'newPasswordLabel')}
                  </label>
                  <input
                    type="password"
                    minLength={10}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="lp-input"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="lp-btn-primary"
              >
                <Save className="w-4 h-4" strokeWidth={1.85} />
                {savingProfile ? t(lang, 'saving') : t(lang, 'save')}
              </button>
            </form>

            <div className="lp-elevated rounded-xl p-3.5 flex items-center justify-between text-xs">
              <span className="text-[var(--text-muted)]">{t(lang, 'systemRoleLabel')}</span>
              <span className="font-semibold text-[var(--accent)]">
                {formatRoleLabel(user.systemRole, lang)}
              </span>
            </div>
          </section>

          <div className="space-y-5">
            {/* Web-Push Devices Card (Smartphone & Desktop) */}
            <section className="lp-surface rounded-2xl p-5 space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-[var(--accent)]" strokeWidth={1.9} />
                  <h2 className="text-base font-bold">{t(lang, 'pushCardTitle')}</h2>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                  {t(lang, 'pushCardDesc')}
                </p>
              </div>

              {!pushSupported ? (
                <div className="p-3 rounded-xl bg-amber-500/12 border border-amber-500/30 text-amber-500 text-xs leading-relaxed">
                  {t(lang, 'pushUnsupportedNotice')}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      {t(lang, 'pushDeviceNameLabel')}
                    </label>
                    <input
                      type="text"
                      maxLength={100}
                      value={pushDeviceName}
                      onChange={(e) => setPushDeviceName(e.target.value)}
                      className="lp-input text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={subscribingPush || !vapidPublicKey}
                      onClick={handleEnablePush}
                      className="lp-btn-primary text-xs"
                    >
                      <Bell className="w-3.5 h-3.5" strokeWidth={1.9} />
                      {subscribingPush
                        ? t(lang, 'pushSubscribing')
                        : t(lang, 'pushSubscribeBtn')}
                    </button>

                    <button
                      type="button"
                      disabled={testingPush || pushSubs.length === 0}
                      onClick={handleSendTestPush}
                      className="lp-btn-secondary text-xs"
                    >
                      <Send className="w-3.5 h-3.5" strokeWidth={1.85} />
                      {testingPush ? t(lang, 'pushTesting') : t(lang, 'pushTestBtn')}
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
                {pushSubs.length === 0 ? (
                  <div className="text-xs text-[var(--text-muted)] py-1">
                    {t(lang, 'pushEmptyList')}
                  </div>
                ) : (
                  pushSubs.map((sub) => (
                    <div
                      key={sub.id}
                      className="lp-elevated rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{sub.deviceLabel}</div>
                        <div className="font-mono text-[11px] text-[var(--text-muted)] truncate">
                          {sub.endpointPreview} ·{' '}
                          {t(lang, 'pushRegisteredAt', {
                            date: formatDateTime(sub.createdAt, lang),
                          })}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeletePushSub(sub.id)}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/12 transition-colors shrink-0 cursor-pointer"
                        title={t(lang, 'delete')}
                        aria-label={t(lang, 'delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.85} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Mobile Field Use & Standalone PWA Status */}
            <section className="lp-surface rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-[var(--accent)]" strokeWidth={1.85} />
                <h2 className="text-base font-bold">{t(lang, 'pwaStatusTitle')}</h2>
              </div>

              <div
                className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                  isStandalonePwa
                    ? 'bg-emerald-500/12 border-emerald-500/30 text-emerald-500'
                    : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                {isStandalonePwa
                  ? t(lang, 'pwaStandaloneActive')
                  : t(lang, 'pwaBrowserTabNotice')}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: USERS, GROUPS, CATEGORIES & PERMISSIONS */}
      {subTab === 'access' && adminAccess && (
        <div className="space-y-6">
          {/* Invite User + Users Table */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-5 lp-surface rounded-2xl p-5 space-y-3.5">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.85} />
                {t(lang, 'inviteSectionTitle')}
              </h3>

              <form onSubmit={handleInviteUser} className="space-y-3">
                <input
                  type="email"
                  required
                  placeholder={t(lang, 'emailLabel')}
                  value={invEmail}
                  onChange={(e) => setInvEmail(e.target.value)}
                  className="lp-input text-xs"
                />
                <input
                  type="text"
                  required
                  minLength={2}
                  placeholder={t(lang, 'displayNameLabel')}
                  value={invName}
                  onChange={(e) => setInvName(e.target.value)}
                  className="lp-input text-xs"
                />
                <select
                  value={invRole}
                  onChange={(e) => setInvRole(e.target.value as 'USER' | 'ADMIN')}
                  className="lp-input text-xs"
                >
                  <option value="USER">{t(lang, 'roleUser')}</option>
                  <option value="ADMIN">{t(lang, 'roleAdmin')}</option>
                </select>

                {groups.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {groups.map((g) => {
                      const checked = invGroupIds.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() =>
                            setInvGroupIds((prev) =>
                              checked
                                ? prev.filter((x) => x !== g.id)
                                : [...prev, g.id]
                            )
                          }
                          className={`px-2 py-1 rounded text-[11px] border ${
                            checked
                              ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent)]'
                              : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                          }`}
                        >
                          {g.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="pt-1 space-y-1">
                  <label
                    className={`flex items-center gap-2 text-xs ${
                      smtpConfigured ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={!smtpConfigured}
                      checked={smtpConfigured && invSendEmail}
                      onChange={(e) => setInvSendEmail(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                    <span>{t(lang, 'inviteSendEmailCheckbox')}</span>
                  </label>
                  {!smtpConfigured && (
                    <div className="text-[11px] text-[var(--text-muted)] leading-snug">
                      {t(lang, 'inviteSendEmailNoSmtpHint')}
                    </div>
                  )}
                </div>

                <button type="submit" className="lp-btn-primary w-full text-xs">
                  <KeyRound className="w-3.5 h-3.5" strokeWidth={1.85} />
                  {t(lang, 'inviteCreateBtn')}
                </button>
              </form>

              {generatedInviteUrl && (
                <div className="lp-elevated rounded-xl p-3 space-y-2 border border-emerald-500/35">
                  <div className="text-[11px] font-semibold text-emerald-500">
                    {t(lang, 'inviteGeneratedLabel')}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedInviteUrl}
                      className="lp-input !py-1 !px-2 font-mono !text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedInviteUrl);
                        onNotify(t(lang, 'copied'), 'info');
                      }}
                      className="lp-btn-secondary !py-1.5 !px-2.5 text-xs shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" strokeWidth={1.85} />
                    </button>
                  </div>
                  {inviteEmailWasSent && (
                    <div className="text-[11px] text-sky-400 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 shrink-0" strokeWidth={1.85} />
                      <span>{t(lang, 'inviteEmailDispatchedNotice')}</span>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="lg:col-span-7 lp-surface rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold">{t(lang, 'usersListTitle')}</h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="lp-elevated rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{u.displayName}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-500/15 text-[var(--text-secondary)]">
                          {formatRoleLabel(u.systemRole, lang)}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            u.isActive
                              ? 'bg-emerald-500/12 text-emerald-500'
                              : 'bg-red-500/14 text-red-500'
                          }`}
                        >
                          {u.isActive ? t(lang, 'userActive') : t(lang, 'userBlocked')}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate">
                        {u.email}
                      </div>

                      {groups.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                          {groups.map((g) => {
                            const member = u.groupIds.includes(g.id);
                            return (
                              <button
                                key={g.id}
                                type="button"
                                onClick={() => handleToggleUserGroup(u, g.id)}
                                className={`px-1.5 py-0.5 rounded text-[10px] border ${
                                  member
                                    ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent)]'
                                    : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
                                }`}
                              >
                                {g.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {u.id !== user.id && u.systemRole !== 'SUPER_ADMIN' && (
                      <button
                        type="button"
                        onClick={() => handleToggleUserActive(u)}
                        className="lp-btn-secondary !py-1 !px-2.5 !text-xs shrink-0"
                      >
                        {u.isActive
                          ? t(lang, 'toggleBlockUser')
                          : t(lang, 'toggleActivateUser')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Groups + Categories */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="lp-surface rounded-2xl p-5 space-y-3.5">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.85} />
                {t(lang, 'groupsTitle')}
              </h3>
              <form onSubmit={handleCreateGroup} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  required
                  minLength={2}
                  placeholder={t(lang, 'groupNamePlaceholder')}
                  value={grpName}
                  onChange={(e) => setGrpName(e.target.value)}
                  className="lp-input text-xs"
                />
                <input
                  type="text"
                  placeholder={t(lang, 'groupDescPlaceholder')}
                  value={grpDesc}
                  onChange={(e) => setGrpDesc(e.target.value)}
                  className="lp-input text-xs"
                />
                <button type="submit" className="lp-btn-primary text-xs shrink-0">
                  {t(lang, 'createGroupBtn')}
                </button>
              </form>

              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {groups.map((g) => (
                  <div
                    key={g.id}
                    className="lp-elevated rounded-lg px-3 py-2 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold">{g.name}</span>
                      {g.description && (
                        <span className="text-[var(--text-muted)] ml-2">
                          {g.description}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        api
                          .deleteGroup(g.id)
                          .then(() => loadAdminData())
                          .catch((err) => onNotify(translateApiError(err, lang), 'error'))
                      }
                      className="text-red-500 p-1 hover:opacity-80"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.85} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="lp-surface rounded-2xl p-5 space-y-3.5">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.85} />
                {t(lang, 'categoriesTitle')}
              </h3>
              <form
                onSubmit={handleCreateCategory}
                className="flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="text"
                  required
                  placeholder={t(lang, 'categoryNamePlaceholder')}
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  className="lp-input text-xs"
                />
                <select
                  value={catParentId}
                  onChange={(e) => setCatParentId(e.target.value)}
                  className="lp-input text-xs"
                >
                  <option value="">{t(lang, 'categoryParentNone')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.path || c.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="lp-btn-primary text-xs shrink-0">
                  {t(lang, 'createCategoryBtn')}
                </button>
              </form>

              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {categories.map((c) => (
                  <div
                    key={c.id}
                    className="lp-elevated rounded-lg px-3 py-2 flex items-center justify-between text-xs"
                  >
                    <span className="font-mono">{c.path || c.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        api
                          .deleteCategory(c.id)
                          .then(() => onCategoriesChanged())
                          .catch((err) => onNotify(translateApiError(err, lang), 'error'))
                      }
                      className="text-red-500 p-1 hover:opacity-80"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.85} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Permission Grants (User XOR Group -> Category XOR Device) */}
          <section className="lp-surface rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Shield className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.85} />
              {t(lang, 'permissionsTitle')}
            </h3>

            <form
              onSubmit={handleCreatePermission}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 items-end"
            >
              <div>
                <div className="flex gap-1 mb-1">
                  <button
                    type="button"
                    onClick={() => setPermSubjectKind('user')}
                    className={`px-2 py-0.5 rounded text-[11px] ${
                      permSubjectKind === 'user'
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {t(lang, 'permSubjectUser')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPermSubjectKind('group')}
                    className={`px-2 py-0.5 rounded text-[11px] ${
                      permSubjectKind === 'group'
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {t(lang, 'permSubjectGroup')}
                  </button>
                </div>

                {permSubjectKind === 'user' ? (
                  <select
                    required
                    value={permUserId}
                    onChange={(e) => setPermUserId(e.target.value)}
                    className="lp-input text-xs"
                  >
                    <option value="">--</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.displayName} ({u.email})
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    required
                    value={permGroupId}
                    onChange={(e) => setPermGroupId(e.target.value)}
                    className="lp-input text-xs"
                  >
                    <option value="">--</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="lg:col-span-2">
                <div className="flex gap-1 mb-1">
                  <button
                    type="button"
                    onClick={() => setPermTargetKind('category')}
                    className={`px-2 py-0.5 rounded text-[11px] ${
                      permTargetKind === 'category'
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {t(lang, 'permTargetCategory')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPermTargetKind('device')}
                    className={`px-2 py-0.5 rounded text-[11px] ${
                      permTargetKind === 'device'
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {t(lang, 'permTargetDevice')}
                  </button>
                </div>

                {permTargetKind === 'category' ? (
                  <select
                    required
                    value={permCategoryId}
                    onChange={(e) => setPermCategoryId(e.target.value)}
                    className="lp-input text-xs"
                  >
                    <option value="">--</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.path || c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    required
                    value={permDeviceId}
                    onChange={(e) => setPermDeviceId(e.target.value)}
                    className="lp-input text-xs"
                  >
                    <option value="">--</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.devEui})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <select
                  value={permLevel}
                  onChange={(e) => setPermLevel(e.target.value as PermissionLevel)}
                  className="lp-input text-xs"
                >
                  <option value="VIEWER">{t(lang, 'roleViewer')}</option>
                  <option value="OPERATOR">{t(lang, 'roleOperator')}</option>
                  <option value="CATEGORY_ADMIN">{t(lang, 'roleCategoryAdmin')}</option>
                </select>
              </div>

              <button type="submit" className="lp-btn-primary text-xs">
                {t(lang, 'createPermissionBtn')}
              </button>
            </form>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pt-1">
              {permissions.map((perm) => {
                const subjLabel = perm.userId
                  ? users.find((u) => u.id === perm.userId)?.displayName ?? perm.userId
                  : groups.find((g) => g.id === perm.groupId)?.name ?? perm.groupId;
                const targetLabel = perm.categoryId
                  ? categories.find((c) => c.id === perm.categoryId)?.path ??
                    perm.categoryId
                  : devices.find((d) => d.id === perm.deviceId)?.name ?? perm.deviceId;

                return (
                  <div
                    key={perm.id}
                    className="lp-elevated rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{subjLabel}</span>
                      <span className="text-[var(--text-muted)]">-&gt;</span>
                      <span className="font-mono">{targetLabel}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--accent-soft)] text-[var(--accent)]">
                        {formatRoleLabel(perm.level, lang)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        api
                          .deletePermission(perm.id)
                          .then(() => loadAdminData())
                          .catch((err) => onNotify(translateApiError(err, lang), 'error'))
                      }
                      className="text-red-500 p-1 hover:opacity-80"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.85} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* SUB-TAB 3: VISUAL JSON FIELD MAPPER */}
      {subTab === 'mapper' && adminAccess && (
        <JsonMapperPanel
          devices={devices}
          profiles={profiles}
          lang={lang}
          onProfileSaved={onProfileSaved}
          onProfileDeleted={onProfileDeleted}
          onNotify={onNotify}
        />
      )}

      {/* SUB-TAB 4: SUPER ADMIN TTN MQTT, SMTP MAIL SERVER, 3-STAGE SYSTEM CONTROL & AUDIT LOGS */}
      {subTab === 'system' && superAdminAccess && (
        <div className="space-y-6">
          {/* TTN v3 Applications */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-5 lp-surface rounded-2xl p-5 space-y-3.5">
              <h3 className="text-sm font-bold">{t(lang, 'ttnAddTitle')}</h3>
              <form onSubmit={handleCreateTtnApp} className="space-y-2.5">
                <input
                  type="text"
                  required
                  placeholder={t(lang, 'ttnNameLabel')}
                  value={ttnName}
                  onChange={(e) => setTtnName(e.target.value)}
                  className="lp-input text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder={t(lang, 'ttnAppIdLabel')}
                  value={ttnAppId}
                  onChange={(e) => setTtnAppId(e.target.value)}
                  className="lp-input font-mono text-xs"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    placeholder={t(lang, 'ttnHostLabel')}
                    value={ttnHost}
                    onChange={(e) => setTtnHost(e.target.value)}
                    className="lp-input font-mono text-xs col-span-2"
                  />
                  <input
                    type="number"
                    required
                    value={ttnPort}
                    onChange={(e) => setTtnPort(Number(e.target.value))}
                    className="lp-input font-mono text-xs"
                  />
                </div>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder={t(lang, 'ttnApiKeyLabel')}
                  value={ttnApiKey}
                  onChange={(e) => setTtnApiKey(e.target.value)}
                  className="lp-input font-mono text-xs"
                  autoComplete="off"
                />
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ttnTls}
                    onChange={(e) => setTtnTls(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span>{t(lang, 'ttnTlsLabel')}</span>
                </label>

                <button
                  type="submit"
                  disabled={savingTtn}
                  className="lp-btn-primary w-full text-xs"
                >
                  {savingTtn ? t(lang, 'saving') : t(lang, 'ttnConnectBtn')}
                </button>
              </form>
            </section>

            <section className="lg:col-span-7 lp-surface rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">{t(lang, 'ttnSectionTitle')}</h3>
                <button
                  type="button"
                  onClick={loadSuperData}
                  className="lp-btn-secondary !py-1 !px-2.5 text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.85} />
                  {t(lang, 'refresh')}
                </button>
              </div>

              <div className="space-y-2.5">
                {ttnApps.map((app) => (
                  <div
                    key={app.id}
                    className="lp-elevated rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold">{app.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            app.connectionStatus === 'CONNECTED'
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : app.connectionStatus === 'ERROR'
                                ? 'bg-red-500/15 text-red-500'
                                : 'bg-amber-500/15 text-amber-500'
                          }`}
                        >
                          {formatTtnStatusLabel(app.connectionStatus, lang)}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-[var(--text-muted)] truncate">
                        {app.ttnAppId} · {app.host}:{app.port} ·{' '}
                        {t(lang, 'ttnMaskedKeyPrefix')} {app.maskedApiKey}
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        {t(lang, 'ttnLastMsg')}: {formatDateTime(app.lastMessageAt, lang)}
                      </div>
                      {app.lastError && (
                        <div className="text-[11px] text-red-500 font-mono">
                          {app.lastError}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          api
                            .reconnectTtnApp(app.id)
                            .then(() => loadSuperData())
                            .catch((err) =>
                              onNotify(translateApiError(err, lang), 'error')
                            )
                        }
                        className="lp-btn-secondary !py-1.5 !px-2.5 text-xs"
                      >
                        <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.85} />
                        {t(lang, 'ttnReconnectBtn')}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          api
                            .deleteTtnApp(app.id)
                            .then(() => loadSuperData())
                            .catch((err) =>
                              onNotify(translateApiError(err, lang), 'error')
                            )
                        }
                        className="lp-btn-danger !py-1.5 !px-2.5 text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.85} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* SMTP Mail Server Configuration Card */}
          <section className="lp-surface rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[var(--accent)]" strokeWidth={1.85} />
                  {t(lang, 'smtpSectionTitle')}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {t(lang, 'smtpSectionDesc')}
                </p>
              </div>

              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 w-fit ${
                  smtpSummary?.configured && smtpSummary.enabled
                    ? 'bg-emerald-500/14 text-emerald-500 border border-emerald-500/30'
                    : 'bg-slate-500/14 text-[var(--text-muted)] border border-[var(--border-subtle)]'
                }`}
              >
                {smtpSummary?.configured && smtpSummary.enabled
                  ? t(lang, 'smtpStatusActive')
                  : t(lang, 'smtpStatusInactive')}
              </span>
            </div>

            <form onSubmit={handleSaveSmtp} className="space-y-3.5">
              <div className="flex flex-wrap items-center gap-5">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smtpEnabled}
                    onChange={(e) => setSmtpEnabled(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span className="font-medium">{t(lang, 'smtpEnabledCheckbox')}</span>
                </label>

                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smtpSecure}
                    onChange={(e) => setSmtpSecure(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span>{t(lang, 'smtpSecureCheckbox')}</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t(lang, 'smtpHostLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    className="lp-input font-mono text-xs"
                    placeholder="smtp.example.org"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t(lang, 'smtpPortLabel')}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={65535}
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                    className="lp-input font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t(lang, 'smtpUsernameLabel')}
                  </label>
                  <input
                    type="text"
                    value={smtpUsername}
                    onChange={(e) => setSmtpUsername(e.target.value)}
                    className="lp-input text-xs"
                    autoComplete="off"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t(lang, 'smtpPasswordLabel')}
                  </label>
                  <input
                    type="password"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder={
                      smtpSummary?.maskedPassword
                        ? t(lang, 'smtpPasswordSavedHint', {
                            masked: smtpSummary.maskedPassword,
                          })
                        : t(lang, 'smtpPasswordNewPlaceholder')
                    }
                    className="lp-input font-mono text-xs"
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t(lang, 'smtpFromEmailLabel')}
                  </label>
                  <input
                    type="email"
                    required
                    value={smtpFromEmail}
                    onChange={(e) => setSmtpFromEmail(e.target.value)}
                    className="lp-input text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t(lang, 'smtpFromNameLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={smtpFromName}
                    onChange={(e) => setSmtpFromName(e.target.value)}
                    className="lp-input text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t(lang, 'smtpPublicUrlLabel')}
                  </label>
                  <input
                    type="url"
                    value={smtpPublicUrl}
                    onChange={(e) => setSmtpPublicUrl(e.target.value)}
                    className="lp-input font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingSmtp}
                  className="lp-btn-primary text-xs"
                >
                  <Save className="w-3.5 h-3.5" strokeWidth={1.85} />
                  {savingSmtp ? t(lang, 'saving') : t(lang, 'smtpSaveBtn')}
                </button>
              </div>
            </form>

            {/* Test Email Subsection */}
            <form
              onSubmit={handleTestSmtp}
              className="pt-3.5 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                {t(lang, 'smtpTestTitle')}
              </span>
              <div className="flex items-center gap-2 flex-1 sm:max-w-md">
                <input
                  type="email"
                  required
                  value={smtpTestEmail}
                  onChange={(e) => setSmtpTestEmail(e.target.value)}
                  placeholder={t(lang, 'smtpTestRecipientPlaceholder')}
                  className="lp-input text-xs"
                />
                <button
                  type="submit"
                  disabled={testingSmtp || !smtpSummary?.configured}
                  className="lp-btn-secondary text-xs shrink-0"
                >
                  <Send className="w-3.5 h-3.5" strokeWidth={1.85} />
                  {testingSmtp ? t(lang, 'smtpTesting') : t(lang, 'smtpTestSendBtn')}
                </button>
              </div>
            </form>
          </section>

          {/* 3-Stage Password-Confirmed System Control */}
          <section className="lp-surface rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Power className="w-4 h-4 text-amber-500" strokeWidth={1.9} />
                {t(lang, 'systemControlTitle')}
              </h3>
              <input
                type="password"
                placeholder={t(lang, 'systemConfirmPwPlaceholder')}
                value={sysPassword}
                onChange={(e) => setSysPassword(e.target.value)}
                className="lp-input !w-full sm:!w-72 text-xs"
                autoComplete="current-password"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="lp-elevated rounded-xl p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="font-bold text-xs">{t(lang, 'systemStage1Title')}</div>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                    {t(lang, 'systemStage1Desc')}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!sysPassword || runningSysAction !== null}
                  onClick={() => handleSystemAction('reconnect_mqtt')}
                  className="lp-btn-secondary text-xs w-full"
                >
                  {t(lang, 'systemExecuteBtn')}
                </button>
              </div>

              <div className="lp-elevated rounded-xl p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="font-bold text-xs text-amber-500">
                    {t(lang, 'systemStage2Title')}
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                    {t(lang, 'systemStage2Desc')}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!sysPassword || runningSysAction !== null}
                  onClick={() => handleSystemAction('restart_app')}
                  className="lp-btn-secondary text-xs w-full"
                >
                  {t(lang, 'systemExecuteBtn')}
                </button>
              </div>

              <div className="lp-elevated rounded-xl p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="font-bold text-xs text-red-500">
                    {t(lang, 'systemStage3Title')}
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                    {t(lang, 'systemStage3Desc')}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!sysPassword || runningSysAction !== null}
                  onClick={() => handleSystemAction('reboot_host')}
                  className="lp-btn-danger text-xs w-full"
                >
                  {t(lang, 'systemExecuteBtn')}
                </button>
              </div>
            </div>
          </section>

          {/* Security & Audit Log Table */}
          <section className="lp-surface rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold">{t(lang, 'auditLogTitle')}</h3>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                    <th className="py-2 pr-3 font-medium">{t(lang, 'auditColTime')}</th>
                    <th className="py-2 pr-3 font-medium">{t(lang, 'auditColActor')}</th>
                    <th className="py-2 pr-3 font-medium">{t(lang, 'auditColAction')}</th>
                    <th className="py-2 font-medium">{t(lang, 'auditColTarget')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-3 font-mono whitespace-nowrap text-[var(--text-secondary)]">
                        {formatDateTime(log.createdAt, lang)}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {log.actorEmail}{' '}
                        <span className="text-[10px] text-[var(--text-muted)]">
                          ({formatRoleLabel(log.actorRole, lang)})
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-semibold text-[var(--accent)]">
                        {formatAuditActionLabel(log.action, lang)}
                      </td>
                      <td className="py-2 text-[var(--text-secondary)]">
                        <span>{formatAuditTargetLabel(log.targetType, lang)}</span>
                        {log.targetId && (
                          <span className="font-mono text-[11px] text-[var(--text-muted)]">
                            {' '}
                            ({log.targetId.slice(0, 10)})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
