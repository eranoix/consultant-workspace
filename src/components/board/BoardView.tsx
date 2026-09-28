'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ArrowDownUp, Briefcase, Plus, Search } from 'lucide-react';
import { api, fetcher } from '@/lib/client/api';
import { useLive } from '@/lib/client/live';
import { usePreference } from '@/lib/client/prefs';
import { deadlineState } from '@/lib/domain/time';
import { useT } from '@/i18n/client';
import { Button, cx, PageHeader, Segmented, Spinner, useToast } from '../ui';
import { useClients, useWorkspace } from '../shell/workspace';
import { ActiveProjects } from './ActiveProjects';
import { TaskCard } from './TaskCard';
import { refreshTasks, useDrawerParam } from './TaskDrawer';
import { STATUS_ORDER, type Task, type TaskStatus } from './types';

type Sort = 'manual' | 'due_asc' | 'due_desc' | 'newest';
interface BoardPrefs {
  side: 'all' | 'partner' | 'direct';
  client: string;
  sort: Sort;
  sorts?: Partial<Record<TaskStatus, Sort>>;
}

const DEFAULT_PREFS: BoardPrefs = { side: 'all', client: '', sort: 'manual', sorts: {} };

function sortTasks(tasks: Task[], sort: Sort): Task[] {
  const copy = [...tasks];
  const due = (t: Task, dir: 1 | -1) => (t.due_date ? t.due_date : dir === 1 ? '9999-12-31' : '0000-01-01');
  if (sort === 'due_asc') copy.sort((a, b) => due(a, 1).localeCompare(due(b, 1)) || a.position - b.position);
  else if (sort === 'due_desc') copy.sort((a, b) => due(b, -1).localeCompare(due(a, -1)) || a.position - b.position);
  else if (sort === 'newest') copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
  else copy.sort((a, b) => a.position - b.position);
  return copy;
}

export function BoardView({ today }: { today: string }) {
  const t = useT();
  const toast = useToast();
  const params = useSearchParams();
  const [, openTask] = useDrawerParam('task');
  const { partnerShort } = useWorkspace();
  const { clients } = useClients();
  const [prefs, setPrefs, prefsLoaded] = usePreference<BoardPrefs>('board.view', DEFAULT_PREFS);
  const [q, setQ] = useState('');
  const [projects, setProjects] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);
  const due = params.get('due');
  const clientParam = params.get('client');
  const client = clientParam ?? prefs.client;

  const { data, mutate } = useSWR<{ tasks: Task[] }>('/api/tasks', fetcher);
  useLive(['tasks'], () => void mutate());

  const filtered = useMemo(() => {
    let list = data?.tasks ?? [];
    if (prefs.side !== 'all') list = list.filter((x) => x.side === prefs.side);
    if (client === 'none') list = list.filter((x) => !x.client_id);
    else if (client) list = list.filter((x) => x.client_id === client);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((x) => x.title.toLowerCase().includes(needle) || (x.client_name ?? '').toLowerCase().includes(needle));
    }
    if (due === 'overdue') list = list.filter((x) => deadlineState(x.due_date, today, x.status === 'done') === 'overdue');
    if (due === 'today') list = list.filter((x) => deadlineState(x.due_date, today, x.status === 'done') === 'today');
    return list;
  }, [data, prefs.side, client, q, due, today]);

  const columns = STATUS_ORDER.map((status) => {
    const sort = prefs.sorts?.[status] ?? prefs.sort;
    return { status, sort, tasks: sortTasks(filtered.filter((x) => x.status === status), sort) };
  });

  const drop = async (status: TaskStatus, index: number) => {
    const id = dragId;
    setDragId(null);
    setOverCol(null);
    if (!id || !data) return;
    const col = columns.find((c) => c.status === status)!;
    const others = col.tasks.filter((x) => x.id !== id);
    const before = others[index] ?? null;
    const after = index > 0 ? others[index - 1] ?? null : null;
    const current = data.tasks.find((x) => x.id === id);
    if (!current) return;
    const guess = before && after ? (before.position + after.position) / 2 : before ? before.position - 1024 : after ? after.position + 1024 : 1024;
    await mutate({ tasks: data.tasks.map((x) => (x.id === id ? { ...x, status, position: guess } : x)) }, { revalidate: false });
    try {
      await api(`/api/tasks/${id}/move`, {
        method: 'POST',
        body: col.sort === 'manual' ? { status, beforeId: before?.id ?? null, afterId: after?.id ?? null } : { status },
      });
      if (current.status !== status) toast(t('board.toast.moved', { column: t(`board.columns.${status}`) }));
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
    refreshTasks();
  };

  const setColumnSort = (status: TaskStatus, sort: Sort) => setPrefs({ ...prefs, sorts: { ...(prefs.sorts ?? {}), [status]: sort } });

  return (
    <div>
      <PageHeader
        title={t('board.title')}
        subtitle={t('board.subtitle')}
        actions={
          <>
            <Button icon={<Briefcase className="h-4 w-4" />} onClick={() => setProjects(true)}>
              {t('board.projects.button')}
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openTask('new')}>
              {t('board.newTask')}
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={prefs.side}
          onChange={(side) => setPrefs({ ...prefs, side })}
          options={[
            { value: 'all', label: t('common.side.all') },
            { value: 'partner', label: partnerShort },
            { value: 'direct', label: t('common.side.direct') },
          ]}
        />
        <select className="input h-9 w-auto py-1" aria-label={t('common.client')} value={client} onChange={(e) => setPrefs({ ...prefs, client: e.target.value })}>
          <option value="">{t('board.allClients')}</option>
          <option value="none">{t('common.noClient')}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-400" />
          <input className="input h-9 w-56 py-1 pl-8" placeholder={t('board.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {due && (
          <a href="/app/board" className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
            {t(due === 'overdue' ? 'board.filterOverdue' : 'board.filterToday')} ×
          </a>
        )}
        {!prefsLoaded && <Spinner className="h-4 w-4" />}
        <span className="ml-auto text-xs text-ink-500">{t('board.count', { count: filtered.length })}</span>
      </div>

      {!data ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-3 overflow-x-auto pb-4 [grid-template-columns:repeat(5,minmax(240px,1fr))]">
          {columns.map((col) => (
            <section
              key={col.status}
              data-testid={`column-${col.status}`}
              aria-label={t(`board.columns.${col.status}`)}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(col.status);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const cards = [...e.currentTarget.querySelectorAll('[data-card-id]')] as HTMLElement[];
                const index = cards.filter((c) => c.dataset.cardId !== dragId).findIndex((c) => e.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
                void drop(col.status, index < 0 ? col.tasks.filter((x) => x.id !== dragId).length : index);
              }}
              className={cx('flex min-h-[60vh] flex-col rounded-xl bg-ink-100/70 p-2 transition-colors', overCol === col.status && 'bg-brand-50 ring-2 ring-brand-300')}
            >
              <header className="mb-2 flex items-center justify-between px-1.5 pt-1">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-600">
                  {t(`board.columns.${col.status}`)}
                  <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-ink-500">{col.tasks.length}</span>
                </h2>
                <div className="flex items-center">
                  <label className="relative inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-ink-400 hover:bg-white hover:text-ink-700" title={t('board.sort.label')}>
                    <ArrowDownUp className="h-3.5 w-3.5" />
                    <select
                      className="absolute inset-0 cursor-pointer opacity-0"
                      aria-label={t('board.sort.label')}
                      value={col.sort}
                      onChange={(e) => setColumnSort(col.status, e.target.value as Sort)}
                    >
                      {(['manual', 'due_asc', 'due_desc', 'newest'] as Sort[]).map((s) => (
                        <option key={s} value={s}>
                          {t(`board.sort.${s}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-white hover:text-ink-700" title={t('board.newTask')} onClick={() => openTask(`new:${col.status}`)}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </header>
              <div className="flex flex-1 flex-col gap-2">
                {col.tasks.map((task) => (
                  <div
                    key={task.id}
                    data-card-id={task.id}
                    className={cx(dragId === task.id && 'opacity-40')}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                    }}
                  >
                    <TaskCard
                      task={task}
                      today={today}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', task.id);
                        setDragId(task.id);
                      }}
                      onOpen={() => openTask(task.id)}
                    />
                  </div>
                ))}
                {col.tasks.length === 0 && <p className="px-2 py-6 text-center text-xs text-ink-400">{t('board.emptyColumn')}</p>}
              </div>
            </section>
          ))}
        </div>
      )}
      <ActiveProjects
        open={projects}
        onClose={() => setProjects(false)}
        onPick={(id) => {
          setPrefs({ ...prefs, client: id });
          setProjects(false);
        }}
      />
    </div>
  );
}
