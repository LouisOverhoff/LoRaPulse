import { useMemo, useState } from 'react';
import {
  Folder,
  FolderTree,
  Inbox,
  Link2,
  List,
  Lock,
  Search,
} from 'lucide-react';
import type {
  DeviceHealthStatus,
  DeviceView,
  Language,
  SensorProfile,
} from '@lorapulse/shared';
import { t } from '../i18n';
import { resolveProfile } from '../utils/telemetry';
import { DeviceCard } from './DeviceCard';

export function SensorsView({
  devices,
  profiles,
  lang,
  onSelectDevice,
  onToggleFavorite,
}: {
  devices: DeviceView[];
  profiles: SensorProfile[];
  lang: Language;
  onSelectDevice: (device: DeviceView) => void;
  onToggleFavorite: (device: DeviceView) => void;
}) {
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree');
  const [statusFilter, setStatusFilter] = useState<'ALL' | DeviceHealthStatus>('ALL');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices.filter((d) => {
      if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        d.name,
        d.devEui,
        d.ttnDeviceId,
        d.locationLabel ?? '',
        ...(d.categoryBreadcrumb ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [devices, query, statusFilter]);

  const groupedSections = useMemo(() => {
    const categoryBuckets = new Map<string, DeviceView[]>();
    const directShares: DeviceView[] = [];
    const uncategorized: DeviceView[] = [];

    for (const dev of filtered) {
      if (dev.isDirectShareOnly) {
        directShares.push(dev);
      } else if (!dev.categoryId || !dev.categoryBreadcrumb?.length) {
        uncategorized.push(dev);
      } else {
        const pathLabel = dev.categoryBreadcrumb.join(' / ');
        const existing = categoryBuckets.get(pathLabel);
        if (existing) existing.push(dev);
        else categoryBuckets.set(pathLabel, [dev]);
      }
    }

    const sortedCategories = Array.from(categoryBuckets.entries()).sort(([a], [b]) =>
      a.localeCompare(b, lang === 'de' ? 'de' : 'en')
    );

    return { sortedCategories, directShares, uncategorized };
  }, [filtered, lang]);

  if (devices.length === 0) {
    return (
      <section className="lp-surface rounded-2xl p-8 sm:p-10 text-center max-w-xl mx-auto my-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-500/12 border border-[var(--border-subtle)] flex items-center justify-center mx-auto mb-3.5 text-[var(--text-secondary)]">
          <Lock className="w-6 h-6" strokeWidth={1.85} />
        </div>
        <h2 className="text-base font-bold mb-1.5">{t(lang, 'emptySensorsTitle')}</h2>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
          {t(lang, 'emptySensorsDesc')}
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search, Status & Tree/Flat Mode Bar */}
      <div className="lp-surface rounded-xl p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            strokeWidth={1.85}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(lang, 'searchPlaceholder')}
            className="lp-input !pl-9"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'ALL' | DeviceHealthStatus)
            }
            className="lp-input !w-auto !py-1.5 text-xs"
          >
            <option value="ALL">{t(lang, 'filterStatusAll')}</option>
            <option value="ALARM">{t(lang, 'statusAlarm')}</option>
            <option value="WARN">{t(lang, 'statusWarn')}</option>
            <option value="OK">{t(lang, 'statusOk')}</option>
            <option value="OFFLINE">{t(lang, 'statusOffline')}</option>
            <option value="NEW">{t(lang, 'statusNew')}</option>
          </select>

          <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'tree'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" strokeWidth={1.85} />
              {t(lang, 'viewCategoryTree')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('flat')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'flat'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <List className="w-3.5 h-3.5" strokeWidth={1.85} />
              {t(lang, 'viewFlatList')}
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="lp-surface rounded-xl p-8 text-center text-xs sm:text-sm text-[var(--text-secondary)]">
          {t(lang, 'noMatchingSensors')}
        </div>
      ) : viewMode === 'flat' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filtered.map((dev) => (
            <DeviceCard
              key={dev.id}
              device={dev}
              profile={resolveProfile(dev.sensorProfileId, profiles)}
              lang={lang}
              onClick={() => onSelectDevice(dev)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Hierarchical Categories */}
          {groupedSections.sortedCategories.map(([pathLabel, items]) => (
            <section key={pathLabel} className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5">
                <div className="flex items-center gap-2">
                  <Folder
                    className="w-4 h-4 text-[var(--accent)] shrink-0"
                    strokeWidth={1.85}
                  />
                  <h3 className="text-sm font-bold tracking-tight">{pathLabel}</h3>
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {t(lang, 'sensorsCountBadge', { n: items.length })}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {items.map((dev) => (
                  <DeviceCard
                    key={dev.id}
                    device={dev}
                    profile={resolveProfile(dev.sensorProfileId, profiles)}
                    lang={lang}
                    onClick={() => onSelectDevice(dev)}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* Directly Shared Single Sensors (Zero Sibling Leak) */}
          {groupedSections.directShares.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5">
                <div className="flex items-center gap-2">
                  <Link2
                    className="w-4 h-4 text-emerald-500 shrink-0"
                    strokeWidth={1.85}
                  />
                  <h3 className="text-sm font-bold tracking-tight">
                    {t(lang, 'directShare')}
                  </h3>
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {t(lang, 'sensorsCountBadge', {
                    n: groupedSections.directShares.length,
                  })}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {groupedSections.directShares.map((dev) => (
                  <DeviceCard
                    key={dev.id}
                    device={dev}
                    profile={resolveProfile(dev.sensorProfileId, profiles)}
                    lang={lang}
                    onClick={() => onSelectDevice(dev)}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Uncategorized Sensors (categoryId === null) */}
          {groupedSections.uncategorized.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-1.5">
                <div className="flex items-center gap-2">
                  <Inbox
                    className="w-4 h-4 text-[var(--text-secondary)] shrink-0"
                    strokeWidth={1.85}
                  />
                  <h3 className="text-sm font-bold tracking-tight">
                    {t(lang, 'uncategorized')}
                  </h3>
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {t(lang, 'sensorsCountBadge', {
                    n: groupedSections.uncategorized.length,
                  })}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {groupedSections.uncategorized.map((dev) => (
                  <DeviceCard
                    key={dev.id}
                    device={dev}
                    profile={resolveProfile(dev.sensorProfileId, profiles)}
                    lang={lang}
                    onClick={() => onSelectDevice(dev)}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
