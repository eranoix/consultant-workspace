'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Check, ChevronDown, ChevronRight, Plus, Repeat, Trash2 } from 'lucide-react';
import { api, fetcher } from '@/lib/client/api';
import { useLive } from '@/lib/client/live';
import { usePreference } from '@/lib/client/prefs';
import { addDays, mondayOf } from '@/lib/domain/time';
import { describeRRule } from '@/lib/domain/rrule';
import { useLocale, useT } from '@/i18n/client';
import { Badge, Button, cx, Empty, Field, Modal, PageHeader, Segmented, SideTag, Spinner, useToast } from '../ui';
import { ClientSidePicker } from '../board/ClientSidePicker';
import { formatDay } from '../board/TaskCard';
import { useWorkspace } from '../shell/workspace';
import { Ring } from './Ring';

interface Goal {
  id: string;
  parent_id: string | null;
  title: string;
  description: string;
  side: 'partner' | 'direct' | null;
  client_id: string | null;
  client_name: string | null;
  rrule: string | null;
  starts_on: string;
  due_on: string | null;
  status: string;
}
interface Occurrence {
  id: string;
  goal_id: string;
  occurs_on: string;
  status: 'open' | 'doing' | 'done' | 'skipped';
  position: number;
}
interface GoalsData {
  today: string;
  goals: Goal[];
  occurrences: Occurrence[];
  progress: { goal_id: string; done: number; due: number }[];
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function GoalForm({ parent, onClose, onSaved, today }: { parent: Goal | null | undefined; onClose: () => void; onSaved: () => void; today: string }) {
  const t = useT();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState<string | null>(parent?.client_id ?? null);
  const [side, setSide] = useState<'partner' | 'direct' | null>(parent?.side ?? null);
  const [freq, setFreq] = useState<'once' | 'DAILY' | 'WEEKLY' | 'MONTHLY'>(parent ? 'WEEKLY' : 'once');
  const [days, setDays] = useState<string[]>(['MO']);
  const [startsOn, setStartsOn] = useState(today);
  const [dueOn, setDueOn] = useState('');
  const [count, setCount] = useState('');
  const [busy, setBusy] = useState(false);
  const rrule = freq === 'once' ? null : [`FREQ=${freq}`, freq === 'WEEKLY' && days.length ? `BYDAY=${days.join(',')}` : '', count ? `COUNT=${count}` : ''].filter(Boolean).join(';');

  if (parent === undefined) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={parent ? t('goals.form.newKr', { objective: parent.title }) : t('goals.form.newObjective')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!title.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await api('/api/goals', { method: 'POST', body: { parentId: parent?.id ?? null, title, clientId, side, rrule, startsOn, dueOn: dueOn || null } });
                onSaved();
                onClose();
              } catch (e) {
                toast((e as Error).message, { tone: 'error' });
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('board.fields.title')}>
          <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <ClientSidePicker compact clientId={clientId} side={side} onChange={(c, s) => (setClientId(c), setSide(s))} />
        {parent && (
          <Field label={t('goals.form.repeat')} hint={rrule ? `${describeRRule(rrule)} (${rrule})` : undefined}>
            <select className="input" value={freq} onChange={(e) => setFreq(e.target.value as typeof freq)}>
              <option value="once">{t('goals.form.once')}</option>
              <option value="DAILY">{t('goals.form.daily')}</option>
              <option value="WEEKLY">{t('goals.form.weekly')}</option>
              <option value="MONTHLY">{t('goals.form.monthly')}</option>
            </select>
          </Field>
        )}
        {freq === 'WEEKLY' && parent && (
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
                className={cx('h-8 w-10 rounded-md text-xs font-medium ring-1 ring-inset', days.includes(d) ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-ink-600 ring-ink-200')}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('goals.form.starts')}>
            <input type="date" className="input" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field label={t('goals.form.due')}>
            <input type="date" className="input" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </Field>
          {freq !== 'once' && parent && (
            <Field label={t('goals.form.count')}>
              <input type="number" min={1} className="input" value={count} onChange={(e) => setCount(e.target.value)} placeholder="∞" />
            </Field>
          )}
        </div>
      </div>
    </Modal>
  );
}

function CompletedByDay() {
  const t = useT();
  const locale = useLocale();
  const { data } = useSWR<{ groups: { day: string; items: { id: string; title: string; parent_title: string | null }[] }[] }>('/api/goals/completed', fetcher);
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return null;
  return (
    <section className="card mt-6">
      <h2 className="border-b border-ink-100 px-4 py-3 text-sm font-semibold">{t('goals.completed.title')}</h2>
      {data.groups.length === 0 ? (
        <p className="p-4 text-sm text-ink-500">{t('goals.completed.empty')}</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {data.groups.map((g) => (
            <li key={g.day}>
              <button type="button" className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-ink-50" aria-expanded={open === g.day} onClick={() => setOpen(open === g.day ? null : g.day)}>
                {open === g.day ? <ChevronDown className="h-4 w-4 text-ink-400" /> : <ChevronRight className="h-4 w-4 text-ink-400" />}
                <span className="font-medium">{formatDay(g.day, locale)}</span>
                <Badge tone="green">{t('goals.completed.count', { count: g.items.length })}</Badge>
              </button>
              {open === g.day && (
                <ul className="space-y-1 px-11 pb-3 text-sm text-ink-700">
                  {g.items.map((i) => (
                    <li key={i.id} className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      {i.title}
                      {i.parent_title && <span className="text-xs text-ink-400">· {i.parent_title}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function GoalsView() {
  const t = useT();
  const locale = useLocale();
  const { partnerShort } = useWorkspace();
  const [prefs, setPrefs] = usePreference<{ view: 'list' | 'kanban' }>('goals.view', { view: 'list' });
  const [weekOffset, setWeekOffset] = useState(0);
  const { data: base } = useSWR<GoalsData>('/api/goals', fetcher);
  const week = base ? addDays(mondayOf(base.today), weekOffset * 7) : null;
  const { data, mutate } = useSWR<GoalsData>(week ? `/api/goals?from=${week}&to=${addDays(week, 6)}` : null, fetcher);
  useLive(['goals', 'goal_occurrences'], () => void mutate());
  const [form, setForm] = useState<Goal | null | undefined>(undefined);
  const [dragId, setDragId] = useState<string | null>(null);

  const objectives = useMemo(() => (data?.goals ?? []).filter((g) => !g.parent_id), [data]);
  const krsOf = (id: string) => (data?.goals ?? []).filter((g) => g.parent_id === id);
  const progressOf = (id: string) => data?.progress.find((p) => p.goal_id === id);
  const goalById = (id: string) => data?.goals.find((g) => g.id === id);

  const setOcc = async (id: string, status: Occurrence['status']) => {
    if (!data) return;
    await mutate({ ...data, occurrences: data.occurrences.map((o) => (o.id === id ? { ...o, status } : o)) }, { revalidate: false });
    await api(`/api/goals/occurrences/${id}`, { method: 'PATCH', body: { status } });
    void mutate();
  };

  const objectiveProgress = (o: Goal) => {
    const krs = krsOf(o.id);
    let done = 0;
    let due = 0;
    for (const k of krs) {
      const p = progressOf(k.id);
      done += p?.done ?? 0;
      due += p?.due ?? 0;
    }
    return due ? done / due : 0;
  };

  const days = week ? Array.from({ length: 7 }, (_, i) => addDays(week, i)) : [];

  return (
    <div>
      <PageHeader
        title={t('goals.title')}
        subtitle={t('goals.subtitle')}
        actions={
          <>
            <Segmented
              value={prefs.view}
              onChange={(view) => setPrefs({ view })}
              options={[
                { value: 'list', label: t('goals.views.list') },
                { value: 'kanban', label: t('goals.views.kanban') },
              ]}
            />
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setForm(null)}>
              {t('goals.newObjective')}
            </Button>
          </>
        }
      />
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Button size="sm" onClick={() => setWeekOffset(weekOffset - 1)}>
          {t('timeline.prev')}
        </Button>
        <Button size="sm" onClick={() => setWeekOffset(0)}>
          {t('timeline.thisWeek')}
        </Button>
        <Button size="sm" onClick={() => setWeekOffset(weekOffset + 1)}>
          {t('timeline.next')}
        </Button>
        {week && <span className="ml-2 text-ink-500">{`${formatDay(week, locale)} to ${formatDay(addDays(week, 6), locale)}`}</span>}
      </div>

      {!data ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : objectives.length === 0 ? (
        <Empty title={t('goals.empty')} />
      ) : prefs.view === 'list' ? (
        <div className="space-y-4">
          {objectives.map((o) => (
            <section key={o.id} className="card p-4" data-testid="objective">
              <div className="flex items-start gap-4">
                <Ring value={objectiveProgress(o)} size={64} label={`${Math.round(objectiveProgress(o) * 100)}%`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-ink-900">{o.title}</h2>
                    {o.side && <SideTag side={o.side} partnerLabel={partnerShort} />}
                    {o.client_name && <Badge>{o.client_name}</Badge>}
                  </div>
                  {o.due_on && <p className="text-xs text-ink-500">{t('goals.dueOn', { date: formatDay(o.due_on, locale) })}</p>}
                </div>
                <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setForm(o)}>
                  {t('goals.addKr')}
                </Button>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-red-600"
                  aria-label={t('common.delete')}
                  onClick={async () => {
                    if (!window.confirm(t('goals.confirmDelete'))) return;
                    await api(`/api/goals/${o.id}`, { method: 'DELETE' });
                    void mutate();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-[11px] text-ink-500">
                      <th className="pb-1 text-left font-medium">{t('goals.keyResult')}</th>
                      {days.map((d) => (
                        <th key={d} className={cx('w-12 pb-1 text-center font-medium', d === data.today && 'text-brand-700')}>
                          {new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en-US', { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))}
                        </th>
                      ))}
                      <th className="w-20 pb-1 text-right font-medium">{t('goals.progress')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {krsOf(o.id).map((k) => {
                      const p = progressOf(k.id);
                      return (
                        <tr key={k.id}>
                          <td className="py-2 pr-3">
                            <p className="font-medium text-ink-800">{k.title}</p>
                            <p className="flex items-center gap-1 text-[11px] text-ink-500">
                              {k.rrule && <Repeat className="h-3 w-3" />}
                              {k.rrule ? describeRRule(k.rrule) : k.due_on ? t('goals.dueOn', { date: formatDay(k.due_on, locale) }) : t('goals.form.once')}
                            </p>
                          </td>
                          {days.map((d) => {
                            const occ = data.occurrences.find((x) => x.goal_id === k.id && x.occurs_on === d);
                            return (
                              <td key={d} className="text-center">
                                {occ ? (
                                  <button
                                    type="button"
                                    data-testid="occurrence"
                                    aria-label={`${k.title} ${d}`}
                                    aria-pressed={occ.status === 'done'}
                                    onClick={() => setOcc(occ.id, occ.status === 'done' ? 'open' : 'done')}
                                    className={cx(
                                      'inline-flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-inset transition',
                                      occ.status === 'done' ? 'bg-emerald-500 text-white ring-emerald-500' : occ.status === 'skipped' ? 'bg-ink-100 text-ink-400 ring-ink-200' : occ.status === 'doing' ? 'bg-amber-50 ring-amber-400' : d < data.today ? 'bg-red-50 ring-red-200' : 'bg-white ring-ink-300 hover:ring-brand-500',
                                    )}
                                  >
                                    {occ.status === 'done' && <Check className="h-4 w-4" />}
                                    {occ.status === 'skipped' && '·'}
                                  </button>
                                ) : (
                                  <span className="text-ink-200">·</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="text-right text-xs text-ink-600">{p ? `${p.done}/${p.due}` : '0/0'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {krsOf(o.id).length === 0 && <p className="py-2 text-xs text-ink-400">{t('goals.noKrs')}</p>}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {(['open', 'doing', 'done'] as const).map((col) => (
            <section
              key={col}
              className="flex min-h-[50vh] flex-col rounded-xl bg-ink-100/70 p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) void setOcc(dragId, col);
                setDragId(null);
              }}
              data-testid={`goals-col-${col}`}
            >
              <h2 className="mb-2 px-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-ink-600">{t(`goals.columns.${col}`)}</h2>
              <div className="space-y-2">
                {data.occurrences
                  .filter((o) => (col === 'open' ? o.status === 'open' : o.status === col))
                  .map((o) => {
                    const g = goalById(o.goal_id);
                    const parent = g?.parent_id ? goalById(g.parent_id) : null;
                    return (
                      <div
                        key={o.id}
                        draggable
                        onDragStart={() => setDragId(o.id)}
                        className={cx('cursor-grab rounded-lg border bg-white p-3 shadow-card', o.occurs_on < data.today && o.status !== 'done' ? 'border-red-300' : o.occurs_on === data.today ? 'border-amber-300' : 'border-ink-200')}
                      >
                        <p className="truncate text-sm font-medium">{g?.title}</p>
                        <p className="mt-1 flex justify-between text-[11px] text-ink-500">
                          <span className="truncate">{parent?.title}</span>
                          <span className="shrink-0">{formatDay(o.occurs_on, locale)}</span>
                        </p>
                      </div>
                    );
                  })}
              </div>
            </section>
          ))}
        </div>
      )}
      <CompletedByDay />
      {data && <GoalForm parent={form} today={data.today} onClose={() => setForm(undefined)} onSaved={() => void mutate()} />}
    </div>
  );
}
