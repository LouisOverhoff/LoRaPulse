import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Globe,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Moon,
  Radio,
  RefreshCw,
  Settings,
  Sun,
  WifiOff,
} from 'lucide-react';
import {
  APP_VERSION,
  BUILTIN_SENSOR_PROFILES,
  DEFAULT_USER_DEVICE_PREFERENCE,
  GITHUB_REPO_URL,
  type AlertItem,
  type CategoryNode,
  type DeviceView,
  type Language,
  type SensorProfile,
  type SseEvent,
  type TtnApplicationSummary,
  type UserSummary,
} from '@lorapulse/shared';
import { api, setOnUnauthorized } from './api';
import { AdminView } from './components/AdminView';
import { AuthViews } from './components/AuthViews';
import { MapView } from './components/MapView';
import { OverviewView } from './components/OverviewView';
import { SensorDetailModal } from './components/SensorDetailModal';
import { SensorsView } from './components/SensorsView';
import { formatRoleLabel, t, translateApiError } from './i18n';

type MainTab = 'overview' | 'map' | 'sensors' | 'admin';

function detectInviteTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const pathMatch = window.location.pathname.match(/^\/invite\/([^/]+)\/?$/);
  if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
  const searchParams = new URLSearchParams(window.location.search);
  const queryInvite = searchParams.get('invite');
  return queryInvite ? queryInvite.trim() : null;
}

function detectResetTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const pathMatch = window.location.pathname.match(/^\/reset-password\/([^/]+)\/?$/);
  if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]);
  const searchParams = new URLSearchParams(window.location.search);
  const queryReset = searchParams.get('reset');
  return queryReset ? queryReset.trim() : null;
}

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('lorapulse_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  const [compactMode, setCompactMode] = useState<boolean>(() => {
    return localStorage.getItem('lorapulse_density') === 'compact';
  });

  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('lorapulse_lang');
    if (saved === 'en' || saved === 'de') return saved;
    return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
  });

  const [bootstrapping, setBootstrapping] = useState(true);
  const [appVersion, setAppVersion] = useState<string>(APP_VERSION);
  const [repoUrl, setRepoUrl] = useState<string>(GITHUB_REPO_URL);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [user, setUser] = useState<UserSummary | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(() =>
    detectInviteTokenFromUrl()
  );
  const [resetToken, setResetToken] = useState<string | null>(() =>
    detectResetTokenFromUrl()
  );
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<MainTab>('overview');
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [profiles, setProfiles] = useState<SensorProfile[]>(BUILTIN_SENSOR_PROFILES);
  const [ttnAppsFromSse, setTtnAppsFromSse] = useState<TtnApplicationSummary[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [sseStatus, setSseStatus] = useState<'live' | 'reconnecting'>('reconnecting');
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [toast, setToast] = useState<{
    message: string;
    kind: 'info' | 'error';
  } | null>(null);

  // Sync theme, iOS status bar & theme-color meta tag (solid opaque bar, zero blur)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lorapulse_theme', theme);

    const headerColor = theme === 'light' ? '#ffffff' : '#121b24';
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', headerColor);
    }
    const statusMeta = document.querySelector(
      'meta[name="apple-mobile-web-app-status-bar-style"]'
    );
    if (statusMeta) {
      statusMeta.setAttribute('content', theme === 'light' ? 'default' : 'black');
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('lorapulse_density', compactMode ? 'compact' : 'standard');
  }, [compactMode]);

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang);
    localStorage.setItem('lorapulse_lang', lang);
  }, [lang]);

  // Network online/offline tracking for outdoor field use
  useEffect(() => {
    const onUp = () => setIsOnline(true);
    const onDown = () => setIsOnline(false);
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);
    return () => {
      window.removeEventListener('online', onUp);
      window.removeEventListener('offline', onDown);
    };
  }, []);

  const showToast = useCallback(
    (message: string, kind: 'info' | 'error' = 'info') => {
      setToast({ message, kind });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Global 401 handler for instant clean logout upon session revocation
  useEffect(() => {
    setOnUnauthorized(() => {
      setUser(null);
      setDevices([]);
      setAlerts([]);
      setSelectedDeviceId(null);
      setSessionNotice(t(lang, 'sessionExpired'));
    });
    return () => setOnUnauthorized(null);
  }, [lang]);

  const loadWorkspaceData = useCallback(async () => {
    const [devs, alts, cats, profs] = await Promise.all([
      api.getDevices(),
      api.getAlerts(),
      api.getCategories(),
      api.getProfiles(),
    ]);
    setDevices(devs);
    setAlerts(alts);
    setCategories(cats);
    setProfiles(profs);
  }, []);

  // Initial Auth Bootstrap
  useEffect(() => {
    let active = true;
    api
      .getAuthStatus()
      .then((status) => {
        if (!active) return;
        if (status.version) setAppVersion(status.version);
        if (status.repoUrl) setRepoUrl(status.repoUrl);
        setNeedsSetup(Boolean(status.needsSetup));
        setDemoMode(Boolean(status.demoMode));
        setSmtpConfigured(Boolean(status.smtpConfigured));
        setVapidPublicKey(status.vapidPublicKey ?? null);

        if (status.user && !resetToken) {
          setUser(status.user);
          if (status.user.preferredLang) {
            setLang(status.user.preferredLang);
          }
          if (status.user.mustChangePassword) {
            setActiveTab('admin');
          }
        }
      })
      .catch(() => {
        // Stay on login screen if backend is temporarily unreachable
      })
      .finally(() => {
        if (active) setBootstrapping(false);
      });
    return () => {
      active = false;
    };
  }, [resetToken]);

  // Fetch workspace data & connect Live SSE stream when authenticated
  useEffect(() => {
    if (!user) return;

    loadWorkspaceData().catch(() => {});

    const es = new EventSource('/api/events');

    function handleSsePayload(rawData: string) {
      try {
        const evt = JSON.parse(rawData) as SseEvent;
        if (evt.type === 'connected') {
          setSseStatus('live');
        } else if (evt.type === 'device_updated') {
          setDevices((prev) => {
            const idx = prev.findIndex((d) => d.id === evt.device.id);
            if (idx === -1) return [evt.device, ...prev];
            const copy = [...prev];
            copy[idx] = evt.device;
            return copy;
          });
        } else if (evt.type === 'alert_updated') {
          setAlerts((prev) => {
            const idx = prev.findIndex((a) => a.id === evt.alert.id);
            if (idx === -1) return [evt.alert, ...prev];
            const copy = [...prev];
            copy[idx] = evt.alert;
            return copy;
          });
        } else if (evt.type === 'ttn_status') {
          setTtnAppsFromSse((prev) => {
            const filtered = prev.filter((a) => a.id !== evt.app.id);
            return [...filtered, evt.app];
          });
        } else if (evt.type === 'profiles_changed') {
          Promise.all([api.getProfiles(), api.getDevices()])
            .then(([profs, devs]) => {
              setProfiles(profs);
              setDevices(devs);
            })
            .catch(() => {});
        } else if (evt.type === 'permissions_changed') {
          api
            .getAuthStatus()
            .then((st) => {
              if (!st.user) {
                setUser(null);
                setSessionNotice(t(lang, 'sessionExpired'));
              } else {
                setUser(st.user);
                if (st.version) setAppVersion(st.version);
                if (st.repoUrl) setRepoUrl(st.repoUrl);
                setSmtpConfigured(Boolean(st.smtpConfigured));
                setVapidPublicKey(st.vapidPublicKey ?? null);
                loadWorkspaceData().catch(() => {});
              }
            })
            .catch(() => {});
        }
      } catch {
        // Ignore malformed heartbeat comments
      }
    }

    es.onopen = () => {
      setSseStatus('live');
    };

    es.onmessage = (e) => handleSsePayload(e.data);

    // Also support named SSE event types if backend emits `event: device_updated`
    const namedEvents = [
      'connected',
      'device_updated',
      'alert_updated',
      'ttn_status',
      'permissions_changed',
      'profiles_changed',
    ];
    for (const evtName of namedEvents) {
      es.addEventListener(evtName, (e) => {
        const msgEvt = e as MessageEvent<string>;
        if (!msgEvt.data) {
          if (evtName === 'permissions_changed' || evtName === 'profiles_changed') {
            handleSsePayload(JSON.stringify({ type: evtName }));
          }
          return;
        }
        try {
          const parsed = JSON.parse(msgEvt.data);
          if (parsed && typeof parsed === 'object' && !('type' in parsed)) {
            if (evtName === 'device_updated') {
              handleSsePayload(
                JSON.stringify({ type: 'device_updated', device: parsed })
              );
              return;
            }
            if (evtName === 'alert_updated') {
              handleSsePayload(
                JSON.stringify({ type: 'alert_updated', alert: parsed })
              );
              return;
            }
            if (evtName === 'ttn_status') {
              handleSsePayload(JSON.stringify({ type: 'ttn_status', app: parsed }));
              return;
            }
          }
        } catch {
          // Fall through
        }
        handleSsePayload(msgEvt.data);
      });
    }

    es.onerror = () => {
      setSseStatus('reconnecting');
      // Verify if session was revoked / 401
      api
        .getAuthStatus()
        .then((st) => {
          if (!st.user) {
            es.close();
            setUser(null);
            setDevices([]);
            setAlerts([]);
            setSessionNotice(t(lang, 'sessionExpired'));
          }
        })
        .catch(() => {});
    };

    return () => {
      es.close();
    };
  }, [user?.id, loadWorkspaceData, lang]);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId]
  );

  const openAlertsCount = useMemo(
    () => alerts.filter((a) => a.status === 'OPEN').length,
    [alerts]
  );

  async function handleAckAlert(alertId: string) {
    try {
      const updated = await api.ackAlert(alertId);
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId ? updated ?? { ...a, status: 'ACKED' } : a
        )
      );
      showToast(t(lang, 'alertAckedSuccess'), 'info');
    } catch (err) {
      showToast(translateApiError(err, lang), 'error');
    }
  }

  async function handleToggleFavorite(device: DeviceView) {
    const prevPref = device.userPreference ?? DEFAULT_USER_DEVICE_PREFERENCE;
    const nextFav = !prevPref.isFavorite;
    const optimisticPref = { ...prevPref, isFavorite: nextFav };

    setDevices((prev) =>
      prev.map((d) =>
        d.id === device.id ? { ...d, userPreference: optimisticPref } : d
      )
    );

    try {
      const res = await api.updateDeviceUserPreference(device.id, {
        isFavorite: nextFav,
      });
      if (res.device) {
        setDevices((prev) =>
          prev.map((d) => (d.id === device.id ? res.device! : d))
        );
      } else if (res.preference) {
        setDevices((prev) =>
          prev.map((d) =>
            d.id === device.id ? { ...d, userPreference: res.preference! } : d
          )
        );
      }
    } catch (err) {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === device.id ? { ...d, userPreference: prevPref } : d
        )
      );
      showToast(translateApiError(err, lang), 'error');
    }
  }

  async function handleSaveMapCoordinates(
    deviceId: string,
    latitude: number,
    longitude: number
  ) {
    const updated = await api.updateDevice(deviceId, { latitude, longitude });
    setDevices((prev) => prev.map((d) => (d.id === deviceId ? updated : d)));
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // Ignore logout network error
    }
    setUser(null);
    setDevices([]);
    setAlerts([]);
    setSelectedDeviceId(null);
  }

  if (bootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-[var(--text-secondary)]">
        <div className="flex items-center gap-2.5">
          <Radio className="w-5 h-5 text-[var(--accent)] lp-led-pulse" strokeWidth={2} />
          <span>{t(lang, 'loading')}</span>
        </div>
      </div>
    );
  }

  if (!user || resetToken) {
    const authMode: 'setup' | 'invite' | 'reset' | 'login' = needsSetup
      ? 'setup'
      : resetToken
        ? 'reset'
        : inviteToken
          ? 'invite'
          : 'login';

    return (
      <AuthViews
        mode={authMode}
        inviteToken={inviteToken}
        resetToken={resetToken}
        smtpConfigured={smtpConfigured}
        version={appVersion}
        repoUrl={repoUrl}
        lang={lang}
        onChangeLang={setLang}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        sessionNotice={sessionNotice}
        onAuthenticated={(loggedUser) => {
          setNeedsSetup(false);
          setSessionNotice(null);
          if (inviteToken || resetToken) {
            setInviteToken(null);
            setResetToken(null);
            window.history.replaceState({}, '', '/');
          }
          setUser(loggedUser);
          if (loggedUser.mustChangePassword) {
            setActiveTab('admin');
          }
          // Refresh bootstrap status to pick up VAPID/SMTP flags if freshly initialized
          api
            .getAuthStatus()
            .then((st) => {
              if (st.version) setAppVersion(st.version);
              if (st.repoUrl) setRepoUrl(st.repoUrl);
              setSmtpConfigured(Boolean(st.smtpConfigured));
              setVapidPublicKey(st.vapidPublicKey ?? null);
            })
            .catch(() => {});
        }}
        onExitInvite={() => {
          setInviteToken(null);
          window.history.replaceState({}, '', '/');
        }}
        onExitReset={() => {
          setResetToken(null);
          window.history.replaceState({}, '', '/');
        }}
      />
    );
  }

  const navItems: {
    id: MainTab;
    label: string;
    icon: typeof LayoutDashboard;
    badge?: number;
  }[] = [
    {
      id: 'overview',
      label: t(lang, 'navOverview'),
      icon: LayoutDashboard,
      badge: openAlertsCount > 0 ? openAlertsCount : undefined,
    },
    {
      id: 'map',
      label: t(lang, 'navMap'),
      icon: MapIcon,
    },
    {
      id: 'sensors',
      label: t(lang, 'navSensors'),
      icon: Cpu,
    },
    {
      id: 'admin',
      label: t(lang, 'navAdmin'),
      icon: Settings,
    },
  ];

  const displayVersion = appVersion || APP_VERSION;
  const targetRepoUrl = repoUrl || GITHUB_REPO_URL;

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Desktop Left Sidebar (>= md) */}
      <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 lp-surface border-y-0 border-l-0 flex-col justify-between p-4 sticky top-0 h-screen">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 px-2 pt-1">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent)] shrink-0">
              <Radio className="w-5 h-5" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="font-bold tracking-tight text-base leading-none">
                LoRaPulse
              </div>
              <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5 font-mono">
                v{displayVersion}
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" strokeWidth={1.9} />
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-3 pt-4 border-t border-[var(--border-subtle)]">
          <div className="px-2">
            <div className="text-xs font-semibold truncate">{user.displayName}</div>
            <div className="text-[11px] text-[var(--text-muted)] truncate">
              {formatRoleLabel(user.systemRole, lang)}
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="lp-btn-secondary w-full !justify-start text-xs"
          >
            <LogOut className="w-3.5 h-3.5" strokeWidth={1.85} />
            {t(lang, 'logout')}
          </button>

          <div className="px-2 pt-1 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
            <span>
              v{displayVersion} · {t(lang, 'mitLicense')}
            </span>
            <a
              href={targetRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-[var(--accent)] transition-colors"
            >
              <span>{t(lang, 'githubLinkLabel')}</span>
              <ExternalLink className="w-2.5 h-2.5" strokeWidth={1.85} />
            </a>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col pb-20 md:pb-0">
        {/* Top Header Bar (solid opaque, no iOS blur overlay) */}
        <header className="sticky top-0 z-30 lp-header-bar px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="md:hidden w-8 h-8 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent)] shrink-0">
              <Radio className="w-4 h-4" strokeWidth={2} />
            </div>

            <div className="min-w-0">
              <h1 className="font-bold text-sm sm:text-base truncate">
                {navItems.find((n) => n.id === activeTab)?.label}
              </h1>
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    sseStatus === 'live'
                      ? 'bg-emerald-500 lp-led-pulse'
                      : 'bg-amber-500'
                  }`}
                />
                <span>
                  {sseStatus === 'live'
                    ? t(lang, 'sseLive')
                    : t(lang, 'sseReconnecting')}
                </span>
                {demoMode && (
                  <span className="px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-400 font-semibold">
                    {t(lang, 'demoModeBadge')}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => loadWorkspaceData().catch(() => {})}
              className="lp-btn-secondary !p-2"
              title={t(lang, 'refresh')}
              aria-label={t(lang, 'refresh')}
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.85} />
            </button>

            <button
              type="button"
              onClick={() => setLang((prev) => (prev === 'de' ? 'en' : 'de'))}
              className="lp-btn-secondary !px-2.5 !py-1.5 text-xs font-mono"
            >
              <Globe className="w-3.5 h-3.5" strokeWidth={1.85} />
              {lang.toUpperCase()}
            </button>

            <button
              type="button"
              onClick={() =>
                setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
              }
              className="lp-btn-secondary !p-2"
              aria-label={
                theme === 'dark' ? t(lang, 'themeLight') : t(lang, 'themeDark')
              }
            >
              {theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5" strokeWidth={1.85} />
              ) : (
                <Moon className="w-3.5 h-3.5" strokeWidth={1.85} />
              )}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="md:hidden lp-btn-secondary !p-2"
              aria-label={t(lang, 'logout')}
            >
              <LogOut className="w-3.5 h-3.5" strokeWidth={1.85} />
            </button>
          </div>
        </header>

        {/* Outdoor Field Offline Banner */}
        {!isOnline && (
          <div className="mx-4 sm:mx-6 mt-3 px-3.5 py-2 rounded-xl bg-amber-500/14 border border-amber-500/35 text-amber-500 text-xs flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" strokeWidth={1.9} />
            <span>{t(lang, 'networkOffline')}</span>
          </div>
        )}

        {/* Active View Container */}
        <main className="flex-1 p-3 sm:p-5 max-w-7xl w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewView
              devices={devices}
              alerts={alerts}
              profiles={profiles}
              user={user}
              lang={lang}
              compactMode={compactMode}
              onToggleCompactMode={setCompactMode}
              onSelectDevice={(d) => setSelectedDeviceId(d.id)}
              onAckAlert={handleAckAlert}
              onToggleFavorite={handleToggleFavorite}
            />
          )}

          {activeTab === 'map' && (
            <MapView
              devices={devices}
              profiles={profiles}
              user={user}
              lang={lang}
              onOpenDetails={(d) => setSelectedDeviceId(d.id)}
              onSaveCoordinates={handleSaveMapCoordinates}
              onNotify={showToast}
            />
          )}

          {activeTab === 'sensors' && (
            <SensorsView
              devices={devices}
              profiles={profiles}
              lang={lang}
              compactMode={compactMode}
              onToggleCompactMode={setCompactMode}
              onSelectDevice={(d) => setSelectedDeviceId(d.id)}
              onToggleFavorite={handleToggleFavorite}
            />
          )}

          {activeTab === 'admin' && (
            <AdminView
              user={user}
              devices={devices}
              categories={categories}
              profiles={profiles}
              ttnAppsFromSse={ttnAppsFromSse}
              smtpConfigured={smtpConfigured}
              vapidPublicKey={vapidPublicKey}
              lang={lang}
              onChangeLang={setLang}
              onUserUpdated={(u) => setUser(u)}
              onCategoriesChanged={async () => {
                const cats = await api.getCategories();
                setCategories(cats);
              }}
              onProfileSaved={(saved) => {
                setProfiles((prev) => {
                  const exists = prev.some((p) => p.id === saved.id);
                  return exists
                    ? prev.map((p) => (p.id === saved.id ? saved : p))
                    : [...prev, saved];
                });
              }}
              onProfileDeleted={async (deletedId) => {
                setProfiles((prev) => prev.filter((p) => p.id !== deletedId));
                const [profs, devs] = await Promise.all([
                  api.getProfiles(),
                  api.getDevices(),
                ]);
                setProfiles(profs);
                setDevices(devs);
              }}
              onSmtpConfiguredChanged={setSmtpConfigured}
              onNotify={showToast}
            />
          )}
        </main>

        {/* Compact Mobile/Main Footer with Dynamic Version & GitHub Link */}
        <footer className="md:hidden px-4 py-3 text-center text-[11px] text-[var(--text-muted)] flex items-center justify-center gap-1.5 flex-wrap">
          <span>LoRaPulse v{displayVersion}</span>
          <span>·</span>
          <span>{t(lang, 'mitLicense')}</span>
          <span>·</span>
          <a
            href={targetRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
          >
            <span>{t(lang, 'githubLinkLabel')}</span>
            <ExternalLink className="w-3 h-3" strokeWidth={1.85} />
          </a>
        </footer>
      </div>

      {/* Mobile Bottom 4-Tab Navigation (< md) with iOS Safe-Area Inset */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 lp-surface border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4 h-14">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={1.95} />
                <span className="truncate max-w-[76px]">{item.label}</span>
                {item.badge !== undefined && (
                  <span className="absolute top-1.5 right-5 px-1.5 rounded-full text-[9px] font-bold bg-red-500 text-white">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Sensor Detail Modal */}
      {selectedDevice && (
        <SensorDetailModal
          device={selectedDevice}
          categories={categories}
          profiles={profiles}
          user={user}
          smtpConfigured={smtpConfigured}
          lang={lang}
          onClose={() => setSelectedDeviceId(null)}
          onDeviceUpdated={(updated) => {
            setDevices((prev) =>
              prev.map((d) => (d.id === updated.id ? updated : d))
            );
          }}
          onNotify={showToast}
        />
      )}

      {/* Zero-Emoji Toast Notification */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-6 right-4 z-50 max-w-sm lp-surface rounded-xl px-4 py-3 flex items-center gap-2.5 text-xs border-l-4 shadow-xl border-l-[var(--accent)]">
          {toast.kind === 'error' ? (
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" strokeWidth={1.9} />
          ) : (
            <CheckCircle2
              className="w-4 h-4 text-emerald-500 shrink-0"
              strokeWidth={1.9}
            />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
