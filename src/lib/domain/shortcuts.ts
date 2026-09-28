export interface ShortcutAction {
  id: string;
  href?: string;
  labelKey: string;
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'go.dashboard', href: '/app', labelKey: 'shell.nav.dashboard' },
  { id: 'go.approvals', href: '/app/approvals', labelKey: 'shell.nav.approvals' },
  { id: 'go.board', href: '/app/board', labelKey: 'shell.nav.board' },
  { id: 'go.alerts', href: '/app/alerts', labelKey: 'shell.nav.alerts' },
  { id: 'go.timeline', href: '/app/timeline', labelKey: 'shell.nav.timeline' },
  { id: 'go.goals', href: '/app/goals', labelKey: 'shell.nav.goals' },
  { id: 'go.notes', href: '/app/notes', labelKey: 'shell.nav.notes' },
  { id: 'go.bookings', href: '/app/bookings', labelKey: 'shell.nav.bookings' },
  { id: 'go.settings', href: '/app/settings', labelKey: 'shell.nav.settings' },
  { id: 'help', labelKey: 'shell.shortcuts.help' },
];

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  'go.dashboard': 'g d',
  'go.approvals': 'g a',
  'go.board': 'g b',
  'go.alerts': 'g l',
  'go.timeline': 'g t',
  'go.goals': 'g o',
  'go.notes': 'g n',
  'go.bookings': 'g k',
  'go.settings': 'g s',
  help: '?',
};

export function normalizeCombo(raw: string): string | null {
  const keys = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (keys.length === 0 || keys.length > 2) return null;
  if (keys.some((k) => k.length !== 1)) return null;
  return keys.join(' ');
}

export function mergeShortcuts(saved: Record<string, string> | null | undefined): Record<string, string> {
  const out = { ...DEFAULT_SHORTCUTS };
  for (const [id, combo] of Object.entries(saved ?? {})) {
    if (!(id in DEFAULT_SHORTCUTS)) continue;
    const n = normalizeCombo(combo);
    if (n) out[id] = n;
  }
  return out;
}

export function conflicts(map: Record<string, string>): string[] {
  const out = new Set<string>();
  const entries = Object.entries(map);
  for (const [a, ca] of entries) {
    for (const [b, cb] of entries) {
      if (a >= b) continue;
      if (ca === cb || cb.startsWith(ca + ' ') || ca.startsWith(cb + ' ')) {
        out.add(a);
        out.add(b);
      }
    }
  }
  return [...out];
}

export function matchSequence(buffer: string[], map: Record<string, string>): string | 'pending' | null {
  const typed = buffer.join(' ');
  for (const [id, combo] of Object.entries(map)) if (combo === typed) return id;
  if (Object.values(map).some((c) => c.startsWith(typed + ' '))) return 'pending';
  return null;
}
