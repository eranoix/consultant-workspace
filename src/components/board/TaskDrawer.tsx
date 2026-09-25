'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { ExternalLink, Trash2 } from 'lucide-react';
import { api, fetcher } from '@/lib/client/api';
import { useT } from '@/i18n/client';
import { Badge, Button, Drawer, Field, Spinner, useToast } from '../ui';
import { ClientSidePicker } from './ClientSidePicker';
import { STATUS_ORDER, type Task } from './types';

/** Close a drawer by dropping its search param, keeping everything else. */
export function useDrawerParam(name: string) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const value = params.get(name);
  const set = useCallback(
    (v: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (v) next.set(name, v);
      else next.delete(name);
      const qs = next.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [name, params, pathname, router],
  );
  return [value, set] as const;
}

export function refreshTasks() {
  void globalMutate((key) => typeof key === 'string' && (key.startsWith('/api/tasks') || key.startsWith('/api/dashboard')));
}

type Draft = {
  title: string;
  description: string;
  status: Task['status'];
  clientId: string | null;
  side: 'partner' | 'direct' | null;
  dueDate: string;
  estimateMin: string;
  priority: Task['priority'];
};

function toDraft(t?: Task | null): Draft {
  return {
    title: t?.title ?? '',
    description: t?.description ?? '',
    status: t?.status ?? 'backlog',
    clientId: t?.client_id ?? null,
    side: t?.side ?? null,
    dueDate: t?.due_date ?? '',
    estimateMin: t?.estimate_min ? String(t.estimate_min) : '',
    priority: t?.priority ?? 'normal',
  };
}

export function TaskDrawerHost() {
  const [taskId, setTaskId] = useDrawerParam('task');
  const t = useT();
  const toast = useToast();
  const isNew = taskId?.startsWith('new');
  const initialStatus = (taskId?.split(':')[1] as Task['status'] | undefined) ?? 'backlog';
  const { data, isLoading } = useSWR<Task>(taskId && !isNew ? `/api/tasks/${taskId}` : null, fetcher);
  const [draft, setDraft] = useState<Draft>(toDraft());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) setDraft({ ...toDraft(), status: initialStatus });
    else if (data) setDraft(toDraft(data));
  }, [data, isNew, initialStatus]);

  if (!taskId) return null;
  const close = () => setTaskId(null);

  const save = async () => {
    setSaving(true);
    const body = {
      title: draft.title.trim(),
      description: draft.description,
      status: draft.status,
      clientId: draft.clientId,
      side: draft.side,
      dueDate: draft.dueDate || null,
      estimateMin: draft.estimateMin ? Number(draft.estimateMin) : null,
      priority: draft.priority,
    };
    try {
      if (isNew) await api('/api/tasks', { method: 'POST', body });
      else await api(`/api/tasks/${taskId}`, { method: 'PATCH', body });
      toast(t(isNew ? 'board.toast.created' : 'board.toast.saved'));
      refreshTasks();
      close();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('board.confirmDelete'))) return;
    await api(`/api/tasks/${taskId}`, { method: 'DELETE' });
    toast(t('board.toast.deleted'));
    refreshTasks();
    close();
  };

  return (
    <Drawer
      open
      onClose={close}
      title={isNew ? t('board.newTask') : data?.title ?? t('common.loading')}
      footer={
        <>
          {!isNew && (
            <Button variant="danger" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={remove} className="mr-auto">
              {t('common.delete')}
            </Button>
          )}
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={saving} disabled={!draft.title.trim()} onClick={save}>
            {isNew ? t('board.create') : t('common.save')}
          </Button>
        </>
      }
    >
      {isLoading && !isNew ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          <Field label={t('board.fields.title')}>
            <input className="input" autoFocus value={draft.title} maxLength={300} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('board.fields.status')}>
              <select className="input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Task['status'] })}>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {t(`board.columns.${s}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('board.fields.priority')}>
              <select className="input" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Task['priority'] })}>
                {(['low', 'normal', 'high'] as const).map((p) => (
                  <option key={p} value={p}>
                    {t(`board.priority.${p}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <ClientSidePicker clientId={draft.clientId} side={draft.side} onChange={(clientId, side) => setDraft({ ...draft, clientId, side })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('board.fields.due')}>
              <input type="date" className="input" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
            </Field>
            <Field label={t('board.fields.estimate')}>
              <input type="number" min={5} max={1440} step={5} className="input" value={draft.estimateMin} placeholder="60" onChange={(e) => setDraft({ ...draft, estimateMin: e.target.value })} />
            </Field>
          </div>
          <Field label={t('board.fields.description')}>
            <textarea className="input min-h-[120px]" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </Field>
          {data && !isNew && (
            <div className="rounded-lg bg-ink-50 p-3 text-xs text-ink-600">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={data.origin === 'approval' ? 'brand' : data.origin === 'api' ? 'violet' : 'neutral'}>{t(`board.origin.${data.origin}`)}</Badge>
                {data.scheduled_min > 0 && <span>{t('board.scheduled', { hours: (data.scheduled_min / 60).toFixed(1) })}</span>}
              </div>
              {data.source_id && (
                <Link href={`/app/approvals?tab=reviewed&source=${data.source_id}`} className="mt-2 inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                  <ExternalLink className="h-3 w-3" />
                  {t('board.fromSource', { title: data.source_title ?? '' })}
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
