import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Globe,
  KeyRound,
  Lock,
  Mail,
  Moon,
  Radio,
  ShieldCheck,
  Sun,
  UserPlus,
} from 'lucide-react';
import {
  APP_VERSION,
  GITHUB_REPO_URL,
  type Language,
  type UserSummary,
} from '@lorapulse/shared';
import {
  api,
  type InvitePreviewInfo,
  type PasswordResetPreviewInfo,
} from '../api';
import { t, translateApiError } from '../i18n';

export function AuthViews({
  mode,
  inviteToken,
  resetToken,
  smtpConfigured,
  version,
  repoUrl,
  lang,
  onChangeLang,
  theme,
  onToggleTheme,
  sessionNotice,
  onAuthenticated,
  onExitInvite,
  onExitReset,
}: {
  mode: 'setup' | 'invite' | 'reset' | 'login';
  inviteToken: string | null;
  resetToken: string | null;
  smtpConfigured: boolean;
  version: string;
  repoUrl: string;
  lang: Language;
  onChangeLang: (lang: Language) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  sessionNotice: string | null;
  onAuthenticated: (user: UserSummary) => void;
  onExitInvite: () => void;
  onExitReset: () => void;
}) {
  const [setupToken, setSetupToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [preferredLang, setPreferredLang] = useState<Language>(lang);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Sub-mode inside login screen for requesting a password reset link
  const [forgotView, setForgotView] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const [inviteInfo, setInviteInfo] = useState<InvitePreviewInfo | null>(null);
  const [checkingInvite, setCheckingInvite] = useState(false);

  const [resetInfo, setResetInfo] = useState<PasswordResetPreviewInfo | null>(null);
  const [checkingReset, setCheckingReset] = useState(false);

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

  useEffect(() => {
    if (mode !== 'reset' || !resetToken) return;
    let active = true;
    setCheckingReset(true);
    setErrorMsg(null);
    api
      .checkPasswordResetToken(resetToken)
      .then((info) => {
        if (!active) return;
        setResetInfo(info);
        if (info.email) setEmail(info.email);
      })
      .catch(() => {
        if (!active) return;
        setResetInfo({ valid: false });
      })
      .finally(() => {
        if (active) setCheckingReset(false);
      });
    return () => {
      active = false;
    };
  }, [mode, resetToken]);

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
      setErrorMsg(translateApiError(err, lang));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const user = await api.login({
        email: email.trim(),
        password,
      });
      if (user.preferredLang) onChangeLang(user.preferredLang);
      onAuthenticated(user);
    } catch (err) {
      setErrorMsg(translateApiError(err, lang));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestResetSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api.requestPasswordReset({
        email: email.trim(),
        lang,
      });
      setResetEmailSent(true);
    } catch (err) {
      setErrorMsg(translateApiError(err, lang));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmResetSubmit(e: FormEvent) {
    e.preventDefault();
    if (!resetToken) return;
    if (password !== repeatPassword) {
      setErrorMsg(t(lang, 'resetPasswordMismatch'));
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await api.confirmPasswordReset({
        token: resetToken,
        newPassword: password,
      });
      if (res.user) {
        if (res.user.preferredLang) onChangeLang(res.user.preferredLang);
        onAuthenticated(res.user);
      } else {
        setPassword('');
        setRepeatPassword('');
        setInfoMsg(t(lang, 'resetCompletedNotice'));
        onExitReset();
      }
    } catch (err) {
      setErrorMsg(translateApiError(err, lang));
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
      setErrorMsg(translateApiError(err, lang));
    } finally {
      setSubmitting(false);
    }
  }

  const displayVersion = version || APP_VERSION;
  const targetRepoUrl = repoUrl || GITHUB_REPO_URL;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 pt-safe pb-safe">
      <div className="w-full max-w-md space-y-4">
        {/* Compact Header directly above the Auth Card */}
        <header className="flex items-center justify-between gap-3 px-0.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent)] shrink-0">
              <Radio className="w-5 h-5" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="font-bold tracking-tight text-base leading-none">LoRaPulse</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">
                {t(lang, 'appSubtitle')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => onChangeLang(lang === 'de' ? 'en' : 'de')}
              className="lp-btn-secondary !px-2.5 !py-1.5 text-xs font-mono"
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

        {sessionNotice && (
          <div className="p-3 rounded-xl bg-amber-500/14 border border-amber-500/35 text-amber-500 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.9} />
            <span>{sessionNotice}</span>
          </div>
        )}

        {infoMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/14 border border-emerald-500/35 text-emerald-500 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.9} />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* Main Auth Card */}
        <main className="lp-surface rounded-2xl p-5 sm:p-6">
          {mode === 'setup' && (
            <>
              <div className="flex items-center gap-2 mb-1.5">
                <ShieldCheck className="w-5 h-5 text-[var(--accent)]" strokeWidth={1.9} />
                <h1 className="text-base sm:text-lg font-bold">{t(lang, 'setupTitle')}</h1>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
                {t(lang, 'setupDesc')}
              </p>

              <form onSubmit={handleSetupSubmit} className="space-y-3">
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
                    placeholder={t(lang, 'setupTokenPlaceholder')}
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
                  className="lp-btn-primary w-full mt-1"
                >
                  <KeyRound className="w-4 h-4" strokeWidth={1.85} />
                  {submitting ? t(lang, 'saving') : t(lang, 'setupSubmit')}
                </button>
              </form>
            </>
          )}

          {mode === 'invite' && (
            <>
              <div className="flex items-center gap-2 mb-1.5">
                <UserPlus className="w-5 h-5 text-[var(--accent)]" strokeWidth={1.9} />
                <h1 className="text-base sm:text-lg font-bold">{t(lang, 'inviteTitle')}</h1>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
                {t(lang, 'inviteDesc')}
              </p>

              {checkingInvite ? (
                <div className="py-5 text-center text-xs text-[var(--text-secondary)]">
                  {t(lang, 'inviteChecking')}
                </div>
              ) : inviteInfo && !inviteInfo.valid ? (
                <div className="space-y-3.5">
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
                <form onSubmit={handleInviteSubmit} className="space-y-3">
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

          {mode === 'reset' && (
            <>
              <div className="flex items-center gap-2 mb-1.5">
                <KeyRound className="w-5 h-5 text-[var(--accent)]" strokeWidth={1.9} />
                <h1 className="text-base sm:text-lg font-bold">
                  {t(lang, 'resetConfirmTitle')}
                </h1>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
                {t(lang, 'resetConfirmDesc')}
              </p>

              {checkingReset ? (
                <div className="py-5 text-center text-xs text-[var(--text-secondary)]">
                  {t(lang, 'resetChecking')}
                </div>
              ) : resetInfo && !resetInfo.valid ? (
                <div className="space-y-3.5">
                  <div className="p-3 rounded-lg bg-red-500/14 border border-red-500/35 text-red-500 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.9} />
                    <span>{t(lang, 'resetInvalid')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onExitReset}
                    className="lp-btn-secondary w-full"
                  >
                    {t(lang, 'backToLogin')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleConfirmResetSubmit} className="space-y-3">
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
                      {t(lang, 'resetNewPasswordLabel')}
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
                      {t(lang, 'resetRepeatPasswordLabel')}
                    </label>
                    <input
                      type="password"
                      required
                      minLength={10}
                      value={repeatPassword}
                      onChange={(e) => setRepeatPassword(e.target.value)}
                      className="lp-input"
                      autoComplete="new-password"
                    />
                  </div>

                  {errorMsg && (
                    <div className="p-2.5 rounded-lg bg-red-500/14 border border-red-500/35 text-red-500 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.9} />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <button type="submit" disabled={submitting} className="lp-btn-primary w-full">
                    <KeyRound className="w-4 h-4" strokeWidth={1.85} />
                    {submitting ? t(lang, 'saving') : t(lang, 'resetConfirmSubmit')}
                  </button>
                  <button
                    type="button"
                    onClick={onExitReset}
                    className="lp-btn-secondary w-full"
                  >
                    {t(lang, 'backToLogin')}
                  </button>
                </form>
              )}
            </>
          )}

          {mode === 'login' && forgotView && (
            <>
              <div className="flex items-center gap-2 mb-1.5">
                <Mail className="w-5 h-5 text-[var(--accent)]" strokeWidth={1.9} />
                <h1 className="text-base sm:text-lg font-bold">
                  {t(lang, 'resetRequestTitle')}
                </h1>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
                {t(lang, 'resetRequestDesc')}
              </p>

              {resetEmailSent ? (
                <div className="space-y-3.5">
                  <div className="p-3 rounded-lg bg-emerald-500/14 border border-emerald-500/35 text-emerald-500 text-xs flex items-start gap-2 leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.9} />
                    <span>{t(lang, 'resetRequestSentNotice')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotView(false);
                      setResetEmailSent(false);
                      setErrorMsg(null);
                    }}
                    className="lp-btn-secondary w-full"
                  >
                    {t(lang, 'backToLogin')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRequestResetSubmit} className="space-y-3">
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

                  {errorMsg && (
                    <div className="p-2.5 rounded-lg bg-red-500/14 border border-red-500/35 text-red-500 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.9} />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <button type="submit" disabled={submitting} className="lp-btn-primary w-full">
                    <Mail className="w-4 h-4" strokeWidth={1.85} />
                    {submitting ? t(lang, 'loading') : t(lang, 'resetRequestSubmit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotView(false);
                      setErrorMsg(null);
                    }}
                    className="lp-btn-secondary w-full"
                  >
                    {t(lang, 'backToLogin')}
                  </button>
                </form>
              )}
            </>
          )}

          {mode === 'login' && !forgotView && (
            <>
              <div className="flex items-center gap-2 mb-1.5">
                <Lock className="w-5 h-5 text-[var(--accent)]" strokeWidth={1.9} />
                <h1 className="text-base sm:text-lg font-bold">{t(lang, 'loginTitle')}</h1>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mb-4 leading-relaxed">
                {t(lang, 'loginDesc')}
              </p>

              <form onSubmit={handleLoginSubmit} className="space-y-3">
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
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">
                      {t(lang, 'loginPasswordLabel')}
                    </label>
                    {smtpConfigured && (
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMsg(null);
                          setInfoMsg(null);
                          setResetEmailSent(false);
                          setForgotView(true);
                        }}
                        className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
                      >
                        {t(lang, 'forgotPasswordLink')}
                      </button>
                    )}
                  </div>
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
              <div className="mt-4 pt-3.5 border-t border-[var(--border-subtle)] flex items-start gap-2 text-[11px] text-[var(--text-muted)] leading-relaxed">
                <ShieldCheck
                  className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5"
                  strokeWidth={1.85}
                />
                <span>{t(lang, 'loginClosedNotice')}</span>
              </div>
            </>
          )}
        </main>

        {/* Compact Footer directly below the Auth Card */}
        <footer className="flex items-center justify-center gap-1.5 flex-wrap text-[11px] text-[var(--text-muted)]">
          <span>LoRaPulse v{displayVersion}</span>
          <span>·</span>
          <span>{t(lang, 'mitLicense')}</span>
          <span>·</span>
          <a
            href={targetRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors font-medium"
          >
            <span>{t(lang, 'githubLinkLabel')}</span>
            <ExternalLink className="w-3 h-3" strokeWidth={1.85} />
          </a>
        </footer>
      </div>
    </div>
  );
}
