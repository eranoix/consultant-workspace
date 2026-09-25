'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { matchSequence, mergeShortcuts, SHORTCUT_ACTIONS } from '@/lib/domain/shortcuts';
import { usePreference } from '@/lib/client/prefs';
import { useT } from '@/i18n/client';
import { Modal } from '../ui';

function typingInto(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function ShortcutHandler() {
  const router = useRouter();
  const t = useT();
  const [saved] = usePreference<Record<string, string>>('shortcuts', {});
  const [help, setHelp] = useState(false);
  const buffer = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const map = mergeShortcuts(saved);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingInto(e.target) || e.key.length !== 1) return;
      if (document.querySelector('[role=dialog]') && e.key !== '?') return;
      buffer.current.push(e.key.toLowerCase());
      const hit = matchSequence(buffer.current, map);
      if (timer.current) clearTimeout(timer.current);
      if (hit === 'pending') {
        timer.current = setTimeout(() => (buffer.current = []), 1200);
        return;
      }
      buffer.current = [];
      if (!hit) return;
      e.preventDefault();
      if (hit === 'help') setHelp((h) => !h);
      const action = SHORTCUT_ACTIONS.find((a) => a.id === hit);
      if (action?.href) router.push(action.href);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [map, router]);

  return (
    <Modal open={help} onClose={() => setHelp(false)} title={t('shell.shortcuts.title')}>
      <ul className="divide-y divide-ink-100">
        {SHORTCUT_ACTIONS.map((a) => (
          <li key={a.id} className="flex items-center justify-between py-2">
            <span className="text-ink-700">{t(a.labelKey)}</span>
            <span className="flex gap-1">
              {map[a.id]!.split(' ').map((k, i) => (
                <kbd key={i} className="kbd">
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-500">{t('shell.shortcuts.customize')}</p>
    </Modal>
  );
}
