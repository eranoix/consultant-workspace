'use client';

import { useState } from 'react';
import { conflicts, DEFAULT_SHORTCUTS, mergeShortcuts, normalizeCombo, SHORTCUT_ACTIONS } from '@/lib/domain/shortcuts';
import { usePreference } from '@/lib/client/prefs';
import { useT } from '@/i18n/client';
import { Badge, Button, Card, PageHeader, useToast } from '../ui';

export function ShortcutsSettings() {
  const t = useT();
  const toast = useToast();
  const [saved, setSaved] = usePreference<Record<string, string>>('shortcuts', {});
  const map = mergeShortcuts(saved);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const merged = { ...map, ...Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, normalizeCombo(v) ?? v])) };
  const clash = conflicts(merged);
  const invalid = Object.entries(draft).filter(([, v]) => !normalizeCombo(v)).map(([k]) => k);
  return (
    <div className="max-w-2xl">
      <PageHeader title={t('settings.shortcuts.title')} subtitle={t('settings.shortcuts.subtitle')} />
      <Card bodyClassName="p-0">
        <ul className="divide-y divide-ink-100">
          {SHORTCUT_ACTIONS.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1 text-sm">{t(a.labelKey)}</span>
              {clash.includes(a.id) && <Badge tone="red">{t('settings.shortcuts.conflict')}</Badge>}
              {invalid.includes(a.id) && <Badge tone="amber">{t('settings.shortcuts.invalid')}</Badge>}
              <input
                className="input w-28 text-center font-mono"
                aria-label={t(a.labelKey)}
                value={draft[a.id] ?? map[a.id]}
                onChange={(e) => setDraft({ ...draft, [a.id]: e.target.value })}
              />
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-2 text-xs text-ink-500">{t('settings.shortcuts.help')}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          onClick={() => {
            setDraft({});
            setSaved({});
            toast(t('settings.shortcuts.reset'));
          }}
        >
          {t('settings.shortcuts.restore')}
        </Button>
        <Button
          variant="primary"
          disabled={clash.length > 0 || invalid.length > 0}
          onClick={() => {
            const out: Record<string, string> = {};
            for (const [k, v] of Object.entries(merged)) if (v !== DEFAULT_SHORTCUTS[k]) out[k] = v;
            setSaved(out);
            setDraft({});
            toast(t('settings.saved'));
          }}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
