import {
  Bell,
  CalendarCheck,
  CalendarClock,
  Cog,
  Inbox,
  KanbanSquare,
  KeyRound,
  Keyboard,
  LayoutDashboard,
  NotebookPen,
  PlugZap,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  match?: string[];
}

export interface Hub {
  id: 'command' | 'schedule' | 'settings';
  labelKey: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const HUBS: Hub[] = [
  {
    id: 'command',
    labelKey: 'shell.hubs.command',
    icon: LayoutDashboard,
    items: [
      { href: '/app', labelKey: 'shell.nav.dashboard', icon: LayoutDashboard },
      { href: '/app/approvals', labelKey: 'shell.nav.approvals', icon: Inbox },
      { href: '/app/board', labelKey: 'shell.nav.board', icon: KanbanSquare },
      { href: '/app/alerts', labelKey: 'shell.nav.alerts', icon: Bell },
    ],
  },
  {
    id: 'schedule',
    labelKey: 'shell.hubs.schedule',
    icon: CalendarClock,
    items: [
      { href: '/app/timeline', labelKey: 'shell.nav.timeline', icon: CalendarClock },
      { href: '/app/goals', labelKey: 'shell.nav.goals', icon: Target },
      { href: '/app/notes', labelKey: 'shell.nav.notes', icon: NotebookPen },
      { href: '/app/bookings', labelKey: 'shell.nav.bookings', icon: CalendarCheck },
    ],
  },
  {
    id: 'settings',
    labelKey: 'shell.hubs.settings',
    icon: Cog,
    items: [
      { href: '/app/settings', labelKey: 'shell.nav.general', icon: Cog },
      { href: '/app/settings/clients', labelKey: 'shell.nav.clients', icon: Users },
      { href: '/app/settings/integrations', labelKey: 'shell.nav.integrations', icon: PlugZap },
      { href: '/app/settings/api', labelKey: 'shell.nav.api', icon: KeyRound, match: ['/app/settings/api'] },
      { href: '/app/settings/shortcuts', labelKey: 'shell.nav.shortcuts', icon: Keyboard },
    ],
  },
];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === '/app' || item.href === '/app/settings') return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/') || !!item.match?.some((m) => pathname.startsWith(m));
}

export function hubFor(pathname: string): Hub {
  return HUBS.find((h) => h.items.some((i) => isActive(i, pathname))) ?? HUBS[0]!;
}
