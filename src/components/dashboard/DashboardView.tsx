'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { ArrowRight, CalendarCheck, CircleAlert, Clock, Inbox, Lightbulb, Plus, Sparkles, TriangleAlert } from 'lucide-react';
import { api, fetcher } from '@/lib/client/api';
import { useLive } from '@/lib/client/live';
import { dateInZone, formatDuration, hhmm, minutesOfDay } from '@/lib/domain/time';
import { useLocale, useT } from '@/i18n/client';
import { Button, Card, cx, Segmented, Spinner } from '../ui';
import { AlertList } from '../alerts/AlertList';
import { TaskCard } from '../board/TaskCard';
import { useDrawerParam } from '../board/TaskDrawer';
import type { Task } from '../board/types';
import { Ring } from '../goals/Ring';
import { useWorkspace } from '../shell/workspace';
import type { Entry } from '../timeline/types';

interface Insight {
  id: string;
  tone: 'critical' | 'warning' | 'info' | 'good';
  params: Record<string, string | number>;
  href: string;
}
interface DashboardData {
  summary: {
    today: string;
    timeZone: string;
    name: string;
    counts: {
      meetings: number;
      emails: number;
      tasks: number;
      overdue: number;
      due_today: number;
      doing: number;
      done_today: number;
      today_min: number;
      week_min: number;
      partner_min: number;
      direct_min: number;
      openAlerts: number;
    };
    nextBookings: { id: string; starts_at: string; customer_name: string; service_name: string }[];
    week: { start: string; processedAt: string | null; syncedAt: string | null };
    insights: Insight[];
  };
  ring: { done: number; total: number; items: { id: string; title: string; status: string }[] };
  entries: Entry[];
}

function Stat({ label, value, tone, href }: { label: string; value: string | number; tone?: 'red' | 'amber' | 'brand'; href: string }) {
  return (
    <Link href={href} className="rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2.5 transition hover:border-ink-200 hover:bg-white">
      <p className={cx('text-xl font-semibold', tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-700' : tone === 'brand' ? 'text-brand-700' : 'text-ink-900')}>{value}</p>
      <p className="text-[11px] text-ink-500">{label}</p>
    </Link>
  );
}

function greetingKey(tz: string) {
  const h = Math.floor(minutesOfDay(Date.now(), tz) / 60);
  return h < 12 ? 'dashboard.greeting.morning' : h < 18 ? 'dashboard.greeting.afternoon' : 'dashboard.greeting.evening';
}

function DaySummary({ d }: { d: DashboardData }) {
  const t = useT();
  const locale = useLocale();
  const { partnerShort } = useWorkspace();
  const s = d.summary;
  const c = s.counts;
  const dateText = new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${s.today}T12:00:00Z`));
  const icon = (tone: Insight['tone']) =>
    tone === 'critical' ? <CircleAlert className="h-4 w-4 text-red-600" /> : tone === 'warning' ? <TriangleAlert className="h-4 w-4 text-amber-600" /> : tone === 'good' ? <Sparkles className="h-4 w-4 text-emerald-600" /> : <Lightbulb className="h-4 w-4 text-sky-600" />;
  return (
    <Card className="lg:col-span-2" bodyClassName="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{dateText}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t(greetingKey(s.timeZone), { name: s.name ?? '' })}</h1>
        </div>
        <div className="text-right text-xs text-ink-500">
          <p>{t('dashboard.weekSoFar', { hours: formatDuration(c.week_min) })}</p>
          <p>
            {partnerShort} {formatDuration(c.partner_min)} · {t('common.side.direct')} {formatDuration(c.direct_min)}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label={t('dashboard.stats.toReview')} value={c.meetings + c.emails} tone="brand" href="/app/approvals" />
        <Stat label={t('dashboard.stats.dueToday')} value={c.due_today} tone={c.due_today ? 'amber' : undefined} href="/app/board?due=today" />
        <Stat label={t('dashboard.stats.overdue')} value={c.overdue} tone={c.overdue ? 'red' : undefined} href="/app/board?due=overdue" />
        <Stat label={t('dashboard.stats.inProgress')} value={c.doing} href="/app/board" />
        <Stat label={t('dashboard.stats.loggedToday')} value={formatDuration(c.today_min)} href="/app/timeline" />
      </div>
      <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-500">{t('dashboard.insights.title')}</h2>
      <ul className="space-y-1.5" data-testid="insights">
        {s.insights.map((i) => (
          <li key={i.id}>
            <Link href={i.href} className="group flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition hover:border-ink-200 hover:bg-ink-50">
              {icon(i.tone)}
              <span className="flex-1 text-sm text-ink-800">{t(`dashboard.insights.${i.id}`, i.params)}</span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 opacity-80 group-hover:opacity-100">
                {t(`dashboard.insights.action.${i.id}`)}
                <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function GoalsWidget({ d, onChange }: { d: DashboardData; onChange: () => void }) {
  const t = useT();
  const { ring } = d;
  const pct = ring.total ? ring.done / ring.total : 0;
  return (
    <Card
      title={t('dashboard.goals.title')}
      action={
        <Link href="/app/goals" className="text-xs font-medium text-brand-700 hover:underline">
          {t('dashboard.open')}
        </Link>
      }
    >
      <div className="flex items-center gap-4">
        <Ring value={pct} size={104} stroke={10} label={`${ring.done}/${ring.total}`} sublabel={t('dashboard.goals.today')} />
        <ul className="min-w-0 flex-1 space-y-1.5">
          {ring.items.slice(0, 5).map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-brand-700"
                checked={i.status === 'done'}
                aria-label={i.title}
                onChange={async (e) => {
                  await api(`/api/goals/occurrences/${i.id}`, { method: 'PATCH', body: { status: e.target.checked ? 'done' : 'open' } });
                  onChange();
                }}
              />
              <span className={cx('truncate', i.status === 'done' && 'text-ink-400 line-through')}>{i.title}</span>
            </li>
          ))}
          {ring.items.length === 0 && <li className="text-xs text-ink-500">{t('dashboard.goals.none')}</li>}
        </ul>
      </div>
    </Card>
  );
}

function TodayTimeline({ d }: { d: DashboardData }) {
  const t = useT();
  const locale = useLocale();
  const tz = d.summary.timeZone;
  const today = d.entries.filter((e) => dateInZone(new Date(e.starts_at).getTime(), tz) === d.summary.today);
  const START = 7 * 60;
  const END = 19 * 60;
  const PX = 0.55;
  const now = minutesOfDay(Date.now(), tz);
  return (
    <Card
      title={t('dashboard.timeline.title')}
      action={
        <Link href="/app/timeline" className="text-xs font-medium text-brand-700 hover:underline">
          {t('dashboard.open')}
        </Link>
      }
    >
      <div className="relative ml-10" style={{ height: (END - START) * PX }}>
        {Array.from({ length: (END - START) / 60 + 1 }, (_, i) => START + i * 60).map((m) => (
          <div key={m} className="absolute inset-x-0 border-t border-ink-100" style={{ top: (m - START) * PX }}>
            <span className="absolute -left-10 -top-2 text-[10px] text-ink-400">{hhmm(m)}</span>
          </div>
        ))}
        {now > START && now < END && <div className="absolute inset-x-0 z-10 border-t-2 border-red-400" style={{ top: (now - START) * PX }} />}
        {today.map((e) => {
          const s = minutesOfDay(new Date(e.starts_at).getTime(), tz);
          return (
            <div
              key={e.id}
              className={cx('absolute inset-x-1 overflow-hidden rounded border-l-[3px] px-1.5 text-[11px] leading-tight', e.side === 'partner' ? 'border-sky-500 bg-sky-50' : e.side === 'direct' ? 'border-amber-500 bg-amber-50' : 'border-ink-400 bg-ink-100')}
              // Short blocks keep a 25px minimum so a 15 minute call is still readable.
              style={{ top: (Math.max(s, START) - START) * PX, height: Math.max(25, e.duration_min * PX - 2) }}
              title={e.title}
            >
              <span className="font-semibold">{e.title}</span> <span className="text-ink-500">{formatDuration(e.duration_min)}</span>
            </div>
          );
        })}
      </div>
      {d.summary.nextBookings.length > 0 && (
        <div className="mt-3 border-t border-ink-100 pt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t('dashboard.timeline.nextBookings')}</p>
          <ul className="space-y-1">
            {d.summary.nextBookings.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-xs">
                <CalendarCheck className="h-3.5 w-3.5 text-brand-600" />
                <span className="font-medium">{new Date(b.starts_at).toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz })}</span>
                <span className="truncate text-ink-600">
                  {b.service_name} · {b.customer_name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function MiniBoard({ today }: { today: string }) {
  const t = useT();
  const { partnerShort } = useWorkspace();
  const [, openTask] = useDrawerParam('task');
  const [side, setSide] = useState<'all' | 'partner' | 'direct'>('all');
  const { data, mutate } = useSWR<{ tasks: Task[] }>('/api/tasks', fetcher);
  useLive(['tasks'], () => void mutate());
  const cols = ['todo', 'doing', 'review'] as const;
  return (
    <Card
      className="lg:col-span-3"
      title={t('dashboard.board.title')}
      action={
        <div className="flex items-center gap-2">
          <Segmented
            size="sm"
            value={side}
            onChange={setSide}
            options={[
              { value: 'all', label: t('common.side.all') },
              { value: 'partner', label: partnerShort },
              { value: 'direct', label: t('common.side.direct') },
            ]}
          />
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openTask('new:todo')}>
            {t('board.newTask')}
          </Button>
          <Link href="/app/board" className="text-xs font-medium text-brand-700 hover:underline">
            {t('dashboard.open')}
          </Link>
        </div>
      }
    >
      {!data ? (
        <Spinner />
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {cols.map((c) => {
            const list = data.tasks.filter((x) => x.status === c && (side === 'all' || x.side === side)).sort((a, b) => a.position - b.position);
            return (
              <div key={c} className="rounded-lg bg-ink-100/60 p-2">
                <p className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-600">
                  {t(`board.columns.${c}`)}
                  <span className="text-ink-400">{list.length}</span>
                </p>
                <div className="space-y-2">
                  {list.slice(0, 5).map((task) => (
                    <TaskCard key={task.id} task={task} today={today} compact onOpen={() => openTask(task.id)} />
                  ))}
                  {list.length > 5 && (
                    <Link href="/app/board" className="block px-1 text-xs text-ink-500 hover:text-ink-800">
                      {t('dashboard.board.more', { count: list.length - 5 })}
                    </Link>
                  )}
                  {list.length === 0 && <p className="px-1 py-3 text-center text-xs text-ink-400">{t('board.emptyColumn')}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function DashboardView() {
  const t = useT();
  const { data, mutate } = useSWR<DashboardData>('/api/dashboard', fetcher, { refreshInterval: 60_000 });
  useLive(['tasks', 'sources', 'candidate_tasks', 'timeline_entries', 'goal_occurrences', 'alerts', 'bookings'], () => void mutate(), 800);
  if (!data)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <DaySummary d={data} />
      <Card
        title={
          <span className="flex items-center gap-2">
            {t('dashboard.alerts.title')}
            {data.summary.counts.openAlerts > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">{data.summary.counts.openAlerts}</span>}
          </span>
        }
        action={
          <Link href="/app/alerts" className="text-xs font-medium text-brand-700 hover:underline">
            {t('dashboard.open')}
          </Link>
        }
        bodyClassName="px-4 py-1"
      >
        <AlertList compact limit={6} />
      </Card>
      <MiniBoard today={data.summary.today} />
      <GoalsWidget d={data} onChange={() => void mutate()} />
      <TodayTimeline d={data} />
      <Card
        title={
          <span className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            {t('dashboard.review.title')}
          </span>
        }
      >
        <p className="text-3xl font-semibold">{data.summary.counts.tasks}</p>
        <p className="text-xs text-ink-500">{t('dashboard.review.tasks', { meetings: data.summary.counts.meetings, emails: data.summary.counts.emails })}</p>
        <Link href="/app/approvals" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
          <Clock className="h-4 w-4" />
          {t('dashboard.review.cta')}
        </Link>
      </Card>
    </div>
  );
}
