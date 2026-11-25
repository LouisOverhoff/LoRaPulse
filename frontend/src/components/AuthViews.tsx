import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Globe,
  KeyRound,
  Lock,
  Moon,
  Radio,
  ShieldCheck,
  Sun,
  UserPlus,
} from 'lucide-react';
import type { Language, UserSummary } from '@lorapulse/shared';
import { api, ApiError, type InvitePreviewInfo } from '../api';
import { t } from '../i18n';

export function AuthViews({
  mode,
  inviteToken,
  lang,
  onChangeLang,
  theme,
  onToggleTheme,
  sessionNotice,
  onAuthenticated,
  onExitInvite,
}: {
  mode: 'setup' | 'invite' | 'login';
  inviteToken: string | null;
  lang: Language;
  onChangeLang: (lang: Language) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  sessionNotice: string | null;
  onAuthenticated: (user: UserSummary) => void;
  onExitInvite: () => void;
}) {
  const [setupToken, setSetupToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [preferredLang, setPreferredLang] = useState<Language>(lang);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [inviteInfo, setInviteInfo] = useState<InvitePreviewInfo | null>(null);
  const [checkingInvite, setCheckingInvite] = useState(false);

  useEffect(() => {
    setPreferredLang(lang);
  }, [lang]);

  useEffect(() => {
    if (mode !== 'invite' || !inviteToken) return;
    let active = true;
    setCheckingInvite(true);
    setErrorMsg(null);
    api
      .checkInvite(inviteToken)
      .then((info) => {
        if (!active) return;
        setInviteInfo(info);
        if (info.displayName) setDisplayName(info.displayName);
        if (info.email) setEmail(info.email);
      })
      .catch(() => {
        if (!active) return;
        setInviteInfo({ valid: false });
      })
      .finally(() => {
        if (active) setCheckingInvite(false);
      });
    return () => {
      active = false;
    };
  }, [mode, inviteToken]);

  async function handleSetupSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const user = await api.setupBootstrap({
        setupToken: setupToken.trim(),
        email: email.trim(),
        displayName: displayName.trim(),
        password,
        preferredLang,
      });
      onChangeLang(preferredLang);
      onAuthenticated(user);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const user = await api.login({
        email: email.trim(),
        password,
      });
      if (user.preferredLang) onChangeLang(user.preferredLang);
      onAuthenticated(user);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleInviteSubmit(e: FormEvent) {
    e.preventDefault();
    if (!inviteToken) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const user = await api.redeemInvite({
        token: inviteToken,
        displayName: displayName.trim() || undefined,
        password,
        preferredLang,
      });
      onChangeLang(preferredLang);
      onAuthenticated(user);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 sm:p-6 pt-safe pb-safe">
      {/* Top utility bar */}
      <header className="max-w-md w-full mx-auto flex items-center justify-between py-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent)]">
            <Radio className="w-5 h-5" strokeWidth={2} />
          </div>
          <div>
            <div className="font-bold tracking-tight text-base leading-none">LoRaPulse</div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {t(lang, 'appSubtitle')}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChangeLang(lang === 'de' ? 'en' : 'de')}
            className="lp-btn-secondary !px-2.5 !py-1.5 text-xs"
          >
            <Globe className="w-3.5 h-3.5" strokeWidth={1.85} />
            {lang.toUpperCase()}
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="lp-btn-secondary !px-2.5 !py-1.5 text-xs"
            aria-label={theme === 'dark' ? t(lang, 'themeLight') : t(lang, 'themeDark')}
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5" strokeWidth={1.85} />
            ) : (
              <Moon className="w-3.5 h-3.5" strokeWidth={1.85} />
            )}
          </button>
        </div>
      </header>

      {/* Main auth card */}
      <main className="max-w-md w-full mx-auto my-6">
        {sessionNotice && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/14 border border-amber-500/35 text-amber-500 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.9} />
            <span>{sessionNotice}</span>
          </div>
        )}

        <div className="lp-surface rounded-2xl p-6 sm:p-7">
          {mode === 'setup' && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <ShieldCheck className="w-5 h-5 text-[var(--accent)]" strokeWidth={1.9} />
                <h1 className="text-lg font-bold">{t(lang, 'setupTitle')}</h1>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-5 leading-relaxed">
                {t(lang, 'setupDesc')}
              </p>

              <form onSubmit={handleSetupSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t(lang, 'setupTokenLabel')}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                    className="lp-input font-mono"
                    placeholder="SETUP_TOKEN"
                    autoComplete="off"
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
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="lp-input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t(lang, 'emailLabel')}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="lp-input"
                    autoComplete="email"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t(lang, 'passwordLabel')}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={10}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="lp-input"
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t(lang, 'preferredLangLabel')}
                  </label>
                  <select
                    value={preferredLang}
                    onChange={(e) => setPreferredLang(e.target.value as Language)}
                    className="lp-input"
                  >
                    <option value="de">Deutsch (DE)</option>
                    <option value="en">English (EN)</option>
                  </select>
                </div>

                {errorMsg && (
                  <div className="p-2.5 rounded-lg bg-red-500/14 border border-red-500/35 text-red-500 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.9} />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="lp-btn-primary w-full mt-2"
                >
                  <KeyRound className="w-4 h-4" strokeWidth={1.85} />
                  {submitting ? t(lang, 'saving') : t(lang, 'setupSubmit')}
                </button>
              </form>
            </>
          )}

          {mode === 'invite' && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <UserPlus className="w-5 h-5 text-[var(--accent)]" strokeWidth={1.9} />
                <h1 className="text-lg font-bold">{t(lang, 'inviteTitle')}</h1>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-5 leading-relaxed">
                {t(lang, 'inviteDesc')}
              </p>

              {checkingInvite ? (
                <div className="py-6 text-center text-xs text-[var(--text-secondary)]">
                  {t(lang, 'inviteChecking')}
                </div>
              ) : inviteInfo && !inviteInfo.valid ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-red-500/14 border border-red-500/35 text-red-500 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.9} />
                    <span>{t(lang, 'inviteInvalid')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onExitInvite}
                    className="lp-btn-secondary w-full"
                  >
                    {t(lang, 'backToLogin')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleInviteSubmit} className="space-y-3.5">
                  {email && (
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        {t(lang, 'emailLabel')}
                      </label>
                      <input type="email" value={email} disabled className="lp-input opacity-75" />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      {t(lang, 'displayNameLabel')}
                    </label>
                    <input
                      type="text"
                      minLength={2}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="lp-input"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      {t(lang, 'passwordLabel')}
                    </label>
                    <input
                      type="password"
                      required
                      minLength={10}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="lp-input"
                      autoComplete="new-password"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      {t(lang, 'preferredLangLabel')}
                    </label>
                    <select
                      value={preferredLang}
                      onChange={(e) => setPreferredLang(e.target.value as Language)}
                      className="lp-input"
                    >
                      <option value="de">Deutsch (DE)</option>
                      <option value="en">English (EN)</option>
                    </select>
                  </div>

                  {errorMsg && (
                    <div className="p-2.5 rounded-lg bg-red-500/14 border border-red-500/35 text-red-500 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.9} />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <button type="submit" disabled={submitting} className="lp-btn-primary w-full">
                    {submitting ? t(lang, 'saving') : t(lang, 'inviteSubmit')}
                  </button>
                  <button
                    type="button"
                    onClick={onExitInvite}
                    className="lp-btn-secondary w-full"
                  >
                    {t(lang, 'backToLogin')}
                  </button>
                </form>
              )}
            </>
          )}

          {mode === 'login' && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <Lock className="w-5 h-5 text-[var(--accent)]" strokeWidth={1.9} />
                <h1 className="text-lg font-bold">{t(lang, 'loginTitle')}</h1>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-5 leading-relaxed">
                {t(lang, 'loginDesc')}
              </p>

              <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t(lang, 'emailLabel')}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="lp-input"
                    autoComplete="username"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {t(lang, 'loginPasswordLabel')}
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="lp-input"
                    autoComplete="current-password"
                  />
                </div>

                {errorMsg && (
                  <div className="p-2.5 rounded-lg bg-red-500/14 border border-red-500/35 text-red-500 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.9} />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button type="submit" disabled={submitting} className="lp-btn-primary w-full mt-1">
                  {submitting ? t(lang, 'loading') : t(lang, 'loginSubmit')}
                </button>
              </form>

              {/* Closed Admin-Only Invitation Notice (Zero Public Registration) */}
              <div className="mt-5 pt-4 border-t border-[var(--border-subtle)] flex items-start gap-2.5 text-[11px] text-[var(--text-muted)] leading-relaxed">
                <ShieldCheck className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" strokeWidth={1.85} />
                <span>{t(lang, 'loginClosedNotice')}</span>
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="max-w-md w-full mx-auto text-center text-[11px] text-[var(--text-muted)] py-2">
        LoRaPulse v0.0.1 · MIT License
      </footer>
    </div>
  );
}
