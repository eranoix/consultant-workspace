'use client';

import { useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { CheckCheck, FileText, Info, Mail, Users } from 'lucide-react';
import { api, fetcher } from '@/lib/client/api';
import { useLive } from '@/lib/client/live';
import { useLocale, useT } from '@/i18n/client';
import { Badge, Button, Drawer, Modal, Spinner, useToast } from '../ui';
import { ClientSidePicker } from '../board/ClientSidePicker';
import { useWorkspace } from '../shell/workspace';
import { refreshTasks } from '../board/TaskDrawer';
import { CandidateRow } from './CandidateRow';
import type { SourceDetail } from './types';

export function refreshApprovals() {
  void globalMutate((key) => typeof key === 'string' && (key.startsWith('/api/sources') || key.startsWith('/api/candidates') || key.startsWith('/api/approvals')));
}

export function formatWhen(iso: string, locale: string, timeZone?: string) {
  return new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
}

function Provenance({ reason }: { reason: string | null }) {
  const t = useT();
  if (!reason) return null;
  const [kind, ...rest] = reason.split(':');
  const value = rest.join(':');
  const text =
    kind === 'override'
      ? t('approvals.provenance.override', { value: value.split(':').slice(1).join(':') || value })
      : kind === 'domain'
        ? t('approvals.provenance.domain', { value })
        : kind === 'partner-domain'
          ? t('approvals.provenance.partner', { value: value.split('+')[0]! })
          : kind === 'participant'
            ? t('approvals.provenance.participant', { value })
            : kind === 'content'
              ? t('approvals.provenance.content', { value })
              : kind === 'manual'
                ? t('approvals.provenance.manual')
                : t('approvals.provenance.default');
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-500">
      <Info className="h-3 w-3" />
      {text}
    </p>
  );
}

export function SourceDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { timeZone } = useWorkspace();
  const { data, mutate } = useSWR<SourceDetail>(`/api/sources/${id}`, fetcher);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showBody, setShowBody] = useState(false);
  useLive(['candidate_tasks', 'sources'], () => void mutate());

  const reload = () => {
    void mutate();
    refreshApprovals();
  };

  const pending = data?.tasks.filter((x) => x.decision === 'pending').length ?? 0;
  const approved = data?.tasks.filter((x) => x.decision === 'approved').length ?? 0;
  const noAction = data?.tasks.filter((x) => x.decision === 'no_action').length ?? 0;

  const complete = async () => {
    setBusy(true);
    try {
      const res = await api<{ created: number }>(`/api/sources/${id}/complete`, { method: 'POST' });
      setConfirm(false);
      toast(t('approvals.toast.completed', { count: res.created }));
      reload();
      refreshTasks();
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const editSource = async (clientId: string | null, side: 'partner' | 'direct' | null) => {
    try {
      await api(`/api/sources/${id}`, { method: 'PATCH', body: clientId !== data?.client_id ? { clientId, side } : { side } });
      toast(t('approvals.toast.cascaded'));
      reload();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const title = data ? (data.client_name ? `${data.client_name} · ${data.title}` : data.title) : t('common.loading');

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-2xl"
      title={
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-normal text-ink-500">
            {data?.kind === 'email' ? <Mail className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
            {data && t(`approvals.kind.${data.kind}`)}
            {data && <span>· {formatWhen(data.occurred_at, locale, timeZone)}</span>}
            {data?.status === 'reviewed' && <Badge tone="green">{t('approvals.reviewed')}</Badge>}
          </div>
          <span data-testid="source-title">{title}</span>
        </div>
      }
      footer={
        data && data.status === 'pending' ? (
          <>
            <span className="mr-auto text-xs text-ink-500" data-testid="classified-count">
              {t('approvals.classified', { done: approved + noAction, total: data.tasks.length })}
            </span>
            <Button
              variant="primary"
              icon={<CheckCheck className="h-4 w-4" />}
              disabled={pending > 0}
              title={pending > 0 ? t('approvals.needAll') : undefined}
              onClick={() => setConfirm(true)}
            >
              {t('approvals.done')}
            </Button>
          </>
        ) : undefined
      }
    >
      {!data ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <ClientSidePicker clientId={data.client_id} side={data.side} onChange={(c, s) => void editSource(c, s)} />
            <Provenance reason={data.side_reason} />
            <p className="mt-2 text-xs text-ink-500">
              {data.kind === 'email' && data.from_email ? (
                <>
                  {t('approvals.from')}: <span className="text-ink-700">{data.from_name ? `${data.from_name} <${data.from_email}>` : data.from_email}</span>
                </>
              ) : data.participants.length > 0 ? (
                <>
                  {t('approvals.participants')}: <span className="text-ink-700">{data.participants.join(', ')}</span>
                </>
              ) : null}
            </p>
          </section>

          {data.summary && (
            <section className="space-y-3">
              {data.summary.summary && <p className="text-sm leading-relaxed text-ink-700">{data.summary.summary}</p>}
              {data.summary.topics.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">{t('approvals.topics')}</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">
                    {data.summary.topics.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}
              {data.summary.keyDecisions.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">{t('approvals.keyDecisions')}</h3>
                  <ul className="space-y-1 text-sm text-ink-700">
                    {data.summary.keyDecisions.map((x, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[11px] text-ink-400">{t('approvals.summarizedBy', { provider: data.summary.provider })}</p>
            </section>
          )}

          <section>
            <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-500">
              <span>{t('approvals.candidateTasks', { count: data.tasks.length })}</span>
            </h3>
            {data.tasks.length === 0 ? (
              <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-500">{t('approvals.noTasks')}</p>
            ) : (
              <ul className="space-y-2">
                {data.tasks.map((c) => (
                  <CandidateRow key={c.id} c={c} onChange={reload} />
                ))}
              </ul>
            )}
          </section>

          {data.thread.length > 1 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{t('approvals.thread')}</h3>
              <ol className="space-y-1 text-xs text-ink-600">
                {data.thread.map((m) => (
                  <li key={m.id} className="flex gap-2">
                    <span className="w-32 shrink-0 text-ink-400">{formatWhen(m.occurred_at, locale, timeZone)}</span>
                    <span className="truncate">{m.direction === 'outbound' ? t('approvals.youReplied') : m.from_email}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section>
            <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800" onClick={() => setShowBody(!showBody)}>
              <FileText className="h-3.5 w-3.5" />
              {t(showBody ? 'approvals.hideOriginal' : 'approvals.showOriginal')}
            </button>
            {showBody && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-ink-50 p-3 font-sans text-xs text-ink-700">{data.body}</pre>}
          </section>
        </div>
      )}
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('approvals.confirm.title')}
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={busy} onClick={complete} data-testid="confirm-done">
              {t('approvals.confirm.ok')}
            </Button>
          </>
        }
      >
        <p>{t('approvals.confirm.body', { approved, noAction })}</p>
      </Modal>
    </Drawer>
  );
}
