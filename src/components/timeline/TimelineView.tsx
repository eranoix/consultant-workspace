'use client';

import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { ArrowDownUp, CalendarCheck2, ChevronLeft, ChevronRight, ListChecks, RefreshCcw, TriangleAlert } from 'lucide-react';
import { api, fetcher } from '@/lib/client/api';
import { useLive } from '@/lib/client/live';
import { usePreference } from '@/lib/client/prefs';
import { addDays, atMinutes, dateInZone, formatDuration, hhmm, minutesOfDay } from '@/lib/domain/time';
import { useLocale, useT } from '@/i18n/client';
import { Badge, Button, ClientChip, cx, PageHeader, Segmented, Spinner, useToast } from '../ui';
import { useDrawerParam } from '../board/TaskDrawer';
import type { Task } from '../board/types';
import { useWorkspace } from '../shell/workspace';
import { EntryEditor } from './EntryEditor';
import { layoutLanes, type Entry, type WeekData, type WeekReport } from './types';

const DAY_START = 7 * 60;
const DAY_END = 20 * 60;
const PX_PER_MIN = 0.8; // 48px per hour
const MIN_BLOCK_PX = 25;
const SNAP = 15;

interface BacklogPrefs {
  status: 'all' | 'backlog' | 'todo' | 'doing' | 'review';
  side: 'all' | 'partner' | 'direct';
  sort: 'due_asc' | 'due_desc';
}

function dayLabel(iso: string, locale: string) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

function Report({ report, onClose }: { report: WeekReport; onClose: () => void }) {
  const t = useT();
  const { partnerShort } = useWorkspace();
  const max = Math.max(1, ...report.byClient.map((c) => c.minutes));
  return (
    <section className="card mb-4 p-4" data-testid="week-report">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('timeline.report.title')}</h2>
        <button type="button" className="text-xs text-ink-500 hover:text-ink-800" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1 text-sm">
          <p className="text-2xl font-semibold">{formatDuration(report.totalMin)}</p>
          <p className="text-ink-600">
            {partnerShort}: <b>{formatDuration(report.bySide.partner)}</b>
          </p>
          <p className="text-ink-600">
            {t('common.side.direct')}: <b>{formatDuration(report.bySide.direct)}</b>
          </p>
          {report.bySide.unassigned > 0 && <p className="text-ink-500">{t('timeline.report.unassigned', { time: formatDuration(report.bySide.unassigned) })}</p>}
          {report.merged > 0 && <p className="text-xs text-brand-700">{t('timeline.report.merged', { count: report.merged })}</p>}
        </div>
        <ul className="space-y-1.5 text-xs">
          {report.byClient.map((c) => (
            <li key={c.name}>
              <div className="flex justify-between">
                <span className="truncate">{c.name}</span>
                <span className="font-medium">{formatDuration(c.minutes)}</span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-ink-100">
                <div className={cx('h-1.5 rounded-full', c.side === 'partner' ? 'bg-sky-500' : c.side === 'direct' ? 'bg-amber-500' : 'bg-ink-300')} style={{ width: `${(c.minutes / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <ul className="space-y-1 text-xs">
          {report.warnings.length === 0 ? (
            <li className="text-emerald-700">{t('timeline.report.clean')}</li>
          ) : (
            report.warnings.slice(0, 8).map((w, i) => (
              <li key={i} className="flex gap-1.5 text-amber-800">
                <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                {w.message}
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}

export function TimelineView() {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { partnerShort } = useWorkspace();
  const [weekParam, setWeekParam] = useDrawerParam('week');
  const [, openTask] = useDrawerParam('task');
  const [view, setView] = usePreference<{ side: 'all' | 'partner' | 'direct'; weekend: boolean }>('timeline.view', { side: 'all', weekend: false });
  const [backlogPrefs, setBacklogPrefs] = usePreference<BacklogPrefs>('timeline.backlog', { status: 'all', side: 'all', sort: 'due_asc' });
  const { data, mutate } = useSWR<WeekData>(`/api/timeline${weekParam ? `?week=${weekParam}` : ''}`, fetcher);
  const { data: taskData, mutate: mutateTasks } = useSWR<{ tasks: Task[] }>('/api/tasks', fetcher);
  // One timeline for every admin: a block dragged in by someone else appears here.
  useLive(['timeline_entries'], () => void mutate());
  useLive(['tasks'], () => void mutateTasks());
  const [editing, setEditing] = useState<Entry | null>(null);
  const [report, setReport] = useState<WeekReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hover, setHover] = useState<{ date: string; min: number } | null>(null);
  const grabOffset = useRef(0);

  const tz = data?.timeZone ?? 'UTC';
  const days = data ? Array.from({ length: view.weekend ? 7 : 5 }, (_, i) => addDays(data.week, i)) : [];

  const entries = useMemo(() => (data?.entries ?? []).filter((e) => view.side === 'all' || e.side === view.side), [data, view.side]);
  const byDay = useMemo(() => {
    const map = new Map<string, (Entry & { start: number; end: number })[]>();
    for (const e of entries) {
      const ts = new Date(e.starts_at).getTime();
      const d = dateInZone(ts, tz);
      const start = minutesOfDay(ts, tz);
      map.set(d, [...(map.get(d) ?? []), { ...e, start, end: start + e.duration_min }]);
    }
    return map;
  }, [entries, tz]);

  const backlog = useMemo(() => {
    let list = (taskData?.tasks ?? []).filter((x) => x.status !== 'done');
    if (backlogPrefs.status !== 'all') list = list.filter((x) => x.status === backlogPrefs.status);
    if (backlogPrefs.side !== 'all') list = list.filter((x) => x.side === backlogPrefs.side);
    const key = (x: Task) => x.due_date ?? (backlogPrefs.sort === 'due_asc' ? '9999' : '0000');
    return [...list].sort((a, b) => (backlogPrefs.sort === 'due_asc' ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a))) || a.title.localeCompare(b.title));
  }, [taskData, backlogPrefs]);

  const totals = useMemo(() => {
    const all = data?.entries ?? [];
    const sum = (f: (e: Entry) => boolean) => all.filter(f).reduce((s, e) => s + e.duration_min, 0);
    return { all: sum(() => true), partner: sum((e) => e.side === 'partner'), direct: sum((e) => e.side === 'direct'), unsynced: all.filter((e) => !e.synced).length };
  }, [data]);

  const minuteAt = (e: React.DragEvent | React.MouseEvent, el: HTMLElement) => {
    const y = e.clientY - el.getBoundingClientRect().top - grabOffset.current;
    const raw = DAY_START + y / PX_PER_MIN;
    return Math.min(DAY_END - SNAP, Math.max(DAY_START, Math.round(raw / SNAP) * SNAP));
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>, date: string) => {
    e.preventDefault();
    setHover(null);
    const payload = e.dataTransfer.getData('text/plain');
    const min = minuteAt(e, e.currentTarget);
    grabOffset.current = 0;
    const startsAt = new Date(atMinutes(date, min, tz)).toISOString();
    try {
      if (payload.startsWith('task:')) {
        const task = taskData?.tasks.find((x) => x.id === payload.slice(5));
        await api('/api/timeline/entries', { method: 'POST', body: { taskId: payload.slice(5), startsAt, durationMin: Math.min(240, Math.max(15, task?.estimate_min ?? 60)) } });
      } else if (payload.startsWith('entry:')) {
        await api(`/api/timeline/entries/${payload.slice(6)}`, { method: 'PATCH', body: { startsAt } });
      }
      await mutate();
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    }
  };

  const process = async () => {
    if (!data) return;
    setBusy('process');
    try {
      const res = await api<{ report: WeekReport }>('/api/timeline/process', { method: 'POST', body: { week: data.week } });
      setReport(res.report);
      await mutate();
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    if (!data) return;
    setBusy('sync');
    try {
      const res = await api<{ result: { created: number; updated: number; unchanged: number; deleted: number; calendar: string } }>('/api/timeline/sync', { method: 'POST', body: { week: data.week } });
      const r = res.result;
      toast(t('timeline.synced', { calendar: r.calendar, created: r.created, updated: r.updated, deleted: r.deleted, unchanged: r.unchanged }));
      await mutate();
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const hours: number[] = [];
  for (let m = DAY_START; m < DAY_END; m += 60) hours.push(m);
  const gridHeight = (DAY_END - DAY_START) * PX_PER_MIN;
  const nowMin = data ? minutesOfDay(Date.now(), tz) : 0;

  return (
    <div>
      <PageHeader
        title={t('timeline.title')}
        subtitle={data ? t('timeline.subtitle', { from: dayLabel(data.week, locale), to: dayLabel(addDays(data.week, 6), locale) }) : ' '}
        actions={
          <>
            <div className="flex items-center rounded-lg border border-ink-200 bg-white">
              <button type="button" className="px-2 py-2 text-ink-500 hover:text-ink-900" aria-label={t('timeline.prev')} onClick={() => data && setWeekParam(addDays(data.week, -7))}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" className="border-x border-ink-200 px-3 py-1.5 text-xs font-medium" onClick={() => setWeekParam(null)}>
                {t('timeline.thisWeek')}
              </button>
              <button type="button" className="px-2 py-2 text-ink-500 hover:text-ink-900" aria-label={t('timeline.next')} onClick={() => data && setWeekParam(addDays(data.week, 7))}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <Button icon={<ListChecks className="h-4 w-4" />} loading={busy === 'process'} onClick={process}>
              {t('timeline.process')}
            </Button>
            <Button variant="primary" icon={<CalendarCheck2 className="h-4 w-4" />} loading={busy === 'sync'} onClick={sync} data-testid="sync-week">
              {t('timeline.sync')}
              {totals.unsynced > 0 && <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px]">{totals.unsynced}</span>}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={view.side}
          onChange={(side) => setView({ ...view, side })}
          options={[
            { value: 'all', label: `${t('common.side.all')} · ${formatDuration(totals.all)}` },
            { value: 'partner', label: `${partnerShort} · ${formatDuration(totals.partner)}` },
            { value: 'direct', label: `${t('common.side.direct')} · ${formatDuration(totals.direct)}` },
          ]}
        />
        <label className="flex items-center gap-1.5 text-xs text-ink-600">
          <input type="checkbox" checked={view.weekend} onChange={(e) => setView({ ...view, weekend: e.target.checked })} />
          {t('timeline.weekend')}
        </label>
        <span className="ml-auto flex items-center gap-2 text-xs text-ink-500">
          {data?.state.processed_at && (
            <button type="button" onClick={() => data.state.report && setReport(data.state.report)} title={t('timeline.report.show')}>
              <Badge tone="green">{t('timeline.processedBadge')}</Badge>
            </button>
          )}
          {data?.state.synced_at ? (
            <span className="inline-flex items-center gap-1">
              <RefreshCcw className="h-3 w-3" />
              {t('timeline.lastSync', { when: new Date(data.state.synced_at).toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz }) })}
            </span>
          ) : (
            <span>{t('timeline.neverSynced')}</span>
          )}
        </span>
      </div>

      {report && <Report report={report} onClose={() => setReport(null)} />}

      <div className="flex gap-4">
        <aside className="card flex w-72 shrink-0 flex-col" aria-label={t('timeline.backlog.title')}>
          <div className="border-b border-ink-100 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t('timeline.backlog.title')}</h2>
              <button
                type="button"
                title={t('board.sort.label')}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-ink-500 hover:bg-ink-100"
                onClick={() => setBacklogPrefs({ ...backlogPrefs, sort: backlogPrefs.sort === 'due_asc' ? 'due_desc' : 'due_asc' })}
              >
                <ArrowDownUp className="h-3 w-3" />
                {t(`board.sort.${backlogPrefs.sort}`)}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select className="input h-8 py-1 text-xs" aria-label={t('board.fields.status')} value={backlogPrefs.status} onChange={(e) => setBacklogPrefs({ ...backlogPrefs, status: e.target.value as BacklogPrefs['status'] })}>
                <option value="all">{t('timeline.backlog.allOpen')}</option>
                {(['backlog', 'todo', 'doing', 'review'] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`board.columns.${s}`)}
                  </option>
                ))}
              </select>
              <select className="input h-8 py-1 text-xs" aria-label={t('common.side.label')} value={backlogPrefs.side} onChange={(e) => setBacklogPrefs({ ...backlogPrefs, side: e.target.value as BacklogPrefs['side'] })}>
                <option value="all">{t('common.side.all')}</option>
                <option value="partner">{partnerShort}</option>
                <option value="direct">{t('common.side.direct')}</option>
              </select>
            </div>
            <p className="mt-2 text-[11px] text-ink-500">{t('timeline.backlog.hint')}</p>
          </div>
          <ul className="max-h-[640px] flex-1 space-y-1.5 overflow-y-auto p-2" data-testid="backlog">
            {backlog.map((task) => (
              <li
                key={task.id}
                draggable
                data-testid="backlog-task"
                onDragStart={(e) => {
                  grabOffset.current = 0;
                  e.dataTransfer.setData('text/plain', `task:${task.id}`);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="cursor-grab rounded-lg border border-ink-200 bg-white p-2 text-xs shadow-card active:cursor-grabbing"
              >
                <button type="button" className="block w-full truncate text-left text-[13px] font-medium text-ink-900 hover:underline" title={task.title} onClick={() => openTask(task.id)}>
                  {task.title}
                </button>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <ClientChip name={task.client_name} color={task.client_color} />
                  <span className="shrink-0 text-[10px] text-ink-500">
                    {task.scheduled_min > 0 ? `${formatDuration(task.scheduled_min)} / ` : ''}
                    {task.estimate_min ? formatDuration(task.estimate_min) : ''}
                  </span>
                </div>
              </li>
            ))}
            {taskData && backlog.length === 0 && <li className="p-4 text-center text-xs text-ink-400">{t('timeline.backlog.empty')}</li>}
          </ul>
        </aside>

        <div className="card min-w-0 flex-1 overflow-x-auto">
          {!data ? (
            <div className="flex justify-center py-24">
              <Spinner />
            </div>
          ) : (
            <div className="min-w-[720px]">
              <div className="grid border-b border-ink-100 bg-white" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
                <div />
                {days.map((d) => {
                  const mins = (byDay.get(d) ?? []).reduce((s, e) => s + e.duration_min, 0);
                  return (
                    <div key={d} className={cx('border-l border-ink-100 px-2 py-2 text-center', d === data.today && 'bg-brand-50')}>
                      <p className={cx('text-xs font-semibold', d === data.today ? 'text-brand-800' : 'text-ink-700')}>{dayLabel(d, locale)}</p>
                      <p className="text-[11px] text-ink-500">{mins ? formatDuration(mins) : '0h'}</p>
                    </div>
                  );
                })}
              </div>
              <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
                <div className="relative" style={{ height: gridHeight }}>
                  {hours.map((m) => (
                    <span key={m} className="absolute right-2 -translate-y-1/2 text-[10px] text-ink-400" style={{ top: (m - DAY_START) * PX_PER_MIN }}>
                      {hhmm(m)}
                    </span>
                  ))}
                </div>
                {days.map((d) => {
                  const items = byDay.get(d) ?? [];
                  const lanes = layoutLanes(items);
                  return (
                    <div
                      key={d}
                      data-testid={`day-${d}`}
                      className={cx('relative border-l border-ink-100', d === data.today && 'bg-brand-50/40')}
                      style={{ height: gridHeight }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setHover({ date: d, min: minuteAt(e, e.currentTarget) });
                      }}
                      onDragLeave={() => setHover(null)}
                      onDrop={(e) => void onDrop(e, d)}
                    >
                      {hours.map((m) => (
                        <div key={m} className="absolute inset-x-0 border-t border-ink-100" style={{ top: (m - DAY_START) * PX_PER_MIN }} />
                      ))}
                      {hover?.date === d && (
                        <div className="pointer-events-none absolute inset-x-1 z-0 rounded border-2 border-dashed border-brand-400 bg-brand-100/50 text-[10px] text-brand-800" style={{ top: (hover.min - DAY_START) * PX_PER_MIN, height: 48 }}>
                          <span className="px-1">{hhmm(hover.min)}</span>
                        </div>
                      )}
                      {d === data.today && nowMin > DAY_START && nowMin < DAY_END && (
                        <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-400" style={{ top: (nowMin - DAY_START) * PX_PER_MIN }} />
                      )}
                      {items.map((e) => {
                        const top = (Math.max(e.start, DAY_START) - DAY_START) * PX_PER_MIN;
                        const height = Math.max(MIN_BLOCK_PX, (Math.min(e.end, DAY_END) - Math.max(e.start, DAY_START)) * PX_PER_MIN - 2);
                        const l = lanes.get(e.id) ?? { lane: 0, lanes: 1 };
                        return (
                          <button
                            key={e.id}
                            type="button"
                            draggable
                            data-testid="timeline-entry"
                            onDragStart={(ev) => {
                              grabOffset.current = ev.clientY - (ev.currentTarget as HTMLElement).getBoundingClientRect().top;
                              ev.dataTransfer.setData('text/plain', `entry:${e.id}`);
                              ev.dataTransfer.effectAllowed = 'move';
                            }}
                            onClick={() => setEditing(e)}
                            title={`${e.title} · ${hhmm(e.start)} to ${hhmm(e.end)}`}
                            className={cx(
                              'absolute z-[5] overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm transition hover:z-20 hover:shadow-md',
                              e.side === 'partner' ? 'border-sky-500 bg-sky-50 text-sky-950' : e.side === 'direct' ? 'border-amber-500 bg-amber-50 text-amber-950' : 'border-ink-400 bg-ink-100 text-ink-800',
                            )}
                            style={{ top, height, left: `calc(${(l.lane / l.lanes) * 100}% + 2px)`, width: `calc(${100 / l.lanes}% - 4px)` }}
                          >
                            <span className="flex items-start justify-between gap-1">
                              <span className="truncate font-semibold">{e.title}</span>
                              {!e.synced && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title={t('timeline.notSynced')} />}
                            </span>
                            {height > 34 && (
                              <span className="block truncate opacity-75">
                                {hhmm(e.start)} · {formatDuration(e.duration_min)}
                                {e.client_name ? ` · ${e.client_name}` : ''}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      {data && <EntryEditor entry={editing} timeZone={tz} onClose={() => setEditing(null)} onSaved={() => void mutate()} />}
    </div>
  );
}
