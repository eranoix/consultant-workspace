'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ClipboardPaste, Inbox, Mail, RefreshCw, Users } from 'lucide-react';
import { api, fetcher } from '@/lib/client/api';
import { useLive } from '@/lib/client/live';
import { useLocale, useT } from '@/i18n/client';
import { Badge, Button, ClientChip, cx, Empty, Field, Modal, PageHeader, Segmented, SideTag, Spinner, useToast } from '../ui';
import { useDrawerParam } from '../board/TaskDrawer';
import { useWorkspace } from '../shell/workspace';
import { CandidateRow } from './CandidateRow';
import { formatWhen, refreshApprovals, SourceDrawer } from './SourceDrawer';
import type { Candidate, SourceItem } from './types';

type Tab = 'meetings' | 'emails' | 'tasks' | 'reviewed';

function Progress({ s }: { s: SourceItem }) {
  if (s.task_total === 0) return null;
  const pct = (n: number) => `${(n / s.task_total) * 100}%`;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-ink-100" aria-hidden>
      <div className="bg-emerald-500" style={{ width: pct(s.task_approved) }} />
      <div className="bg-ink-300" style={{ width: pct(s.task_no_action) }} />
    </div>
  );
}

function SourceCard({ s, onOpen }: { s: SourceItem; onOpen: () => void }) {
  const t = useT();
  const locale = useLocale();
  const { partnerShort, timeZone } = useWorkspace();
  return (
    <button type="button" onClick={onOpen} data-testid="source-card" className="card w-full p-4 text-left transition hover:border-brand-300 hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className={cx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', s.kind === 'email' ? 'bg-sky-50 text-sky-700' : 'bg-violet-50 text-violet-700')}>
          {s.kind === 'email' ? <Mail className="h-4 w-4" /> : <Users className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-900">
            {s.client_name && <span className="text-ink-500">{s.client_name} · </span>}
            {s.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-500">
            {formatWhen(s.occurred_at, locale, timeZone)}
            {s.from_name ? ` · ${s.from_name}` : ''}
          </p>
          {s.summary?.summary && <p className="mt-2 line-clamp-2 text-xs text-ink-600">{s.summary.summary}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SideTag side={s.side} partnerLabel={partnerShort} />
            {!s.client_name && <ClientChip name={null} />}
            {s.status === 'reviewed' ? (
              <Badge tone={s.task_approved > 0 ? 'green' : 'neutral'}>{t(s.task_approved > 0 ? 'approvals.tag.approved' : 'approvals.tag.noAction')}</Badge>
            ) : (
              <Badge tone={s.task_pending ? 'amber' : 'green'}>{t('approvals.toClassify', { count: s.task_pending })}</Badge>
            )}
            <span className="text-[11px] text-ink-400">{t('approvals.taskSummary', { approved: s.task_approved, noAction: s.task_no_action, total: s.task_total })}</span>
          </div>
          <div className="mt-2">
            <Progress s={s} />
          </div>
        </div>
      </div>
    </button>
  );
}

function PasteNotes({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const [, openSource] = useDrawerParam('source');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={t('approvals.paste.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!title.trim() || !body.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await api<{ id: string }>('/api/sources/manual', { method: 'POST', body: { title, body } });
                refreshApprovals();
                onClose();
                setTitle('');
                setBody('');
                openSource(res.id);
              } catch (e) {
                toast((e as Error).message, { tone: 'error' });
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('approvals.paste.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('approvals.paste.meetingTitle')}>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brightwater pilot review" />
        </Field>
        <Field label={t('approvals.paste.notes')} hint={t('approvals.paste.hint')}>
          <textarea className="input min-h-[220px] font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} placeholder={'Attendees: ...\nDiscussed: ...\nDecision: ...\nAction: Maya to ... by Friday'} />
        </Field>
      </div>
    </Modal>
  );
}

export function ApprovalsView() {
  const t = useT();
  const toast = useToast();
  const { partnerShort } = useWorkspace();
  const [tabParam, setTab] = useDrawerParam('tab');
  const tab = (['meetings', 'emails', 'tasks', 'reviewed'].includes(tabParam ?? '') ? tabParam : 'meetings') as Tab;
  const [sourceId, setSource] = useDrawerParam('source');
  const [side, setSide] = useState<'all' | 'partner' | 'direct'>('all');
  const [reviewedFilter, setReviewedFilter] = useState<'all' | 'approved' | 'no_action'>('all');
  const [paste, setPaste] = useState(false);
  const [checking, setChecking] = useState(false);

  const params = new URLSearchParams();
  if (tab === 'meetings' || tab === 'emails') {
    params.set('kind', tab === 'meetings' ? 'meeting' : 'email');
    params.set('status', 'pending');
  }
  if (tab === 'reviewed') {
    params.set('status', 'reviewed');
    if (reviewedFilter !== 'all') params.set('decision', reviewedFilter);
  }
  if (side !== 'all') params.set('side', side);
  const sourcesKey = tab === 'tasks' ? null : `/api/sources?${params}`;
  const { data, mutate } = useSWR<{ sources: SourceItem[] }>(sourcesKey, fetcher);
  const { data: cands, mutate: mutateCands } = useSWR<{ candidates: Candidate[] }>(
    tab === 'tasks' ? `/api/candidates?decision=pending${side !== 'all' ? `&side=${side}` : ''}` : null,
    fetcher,
  );
  const { data: counts } = useSWR<{ meetings: number; emails: number; tasks: number; reviewed_week: number }>('/api/approvals/counts', fetcher);
  useLive(['sources', 'candidate_tasks'], () => {
    void mutate();
    void mutateCands();
    refreshApprovals();
  });

  const tabs: { value: Tab; label: string }[] = [
    { value: 'meetings', label: `${t('approvals.tabs.meetings')}${counts ? ` (${counts.meetings})` : ''}` },
    { value: 'emails', label: `${t('approvals.tabs.emails')}${counts ? ` (${counts.emails})` : ''}` },
    { value: 'tasks', label: `${t('approvals.tabs.tasks')}${counts ? ` (${counts.tasks})` : ''}` },
    { value: 'reviewed', label: t('approvals.tabs.reviewed') },
  ];

  const checkMail = async () => {
    setChecking(true);
    try {
      const a = await api<{ created: number }>('/api/intake/run', { method: 'POST', body: { channel: 'email' } });
      const b = await api<{ created: number }>('/api/intake/run', { method: 'POST', body: { channel: 'meeting' } });
      toast(t('approvals.toast.checked', { count: a.created + b.created }));
      refreshApprovals();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('approvals.title')}
        subtitle={t('approvals.subtitle')}
        actions={
          <>
            <Button icon={<RefreshCw className="h-4 w-4" />} loading={checking} onClick={checkMail}>
              {t('approvals.checkMail')}
            </Button>
            <Button variant="primary" icon={<ClipboardPaste className="h-4 w-4" />} onClick={() => setPaste(true)}>
              {t('approvals.paste.button')}
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={tab} onChange={(v) => setTab(v === 'meetings' ? null : v)} options={tabs} />
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
        {tab === 'reviewed' && (
          <Segmented
            size="sm"
            value={reviewedFilter}
            onChange={setReviewedFilter}
            options={[
              { value: 'all', label: t('approvals.filter.all') },
              { value: 'approved', label: t('approvals.tag.approved') },
              { value: 'no_action', label: t('approvals.tag.noAction') },
            ]}
          />
        )}
      </div>

      {tab === 'tasks' ? (
        !cands ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : cands.candidates.length === 0 ? (
          <Empty icon={<Inbox className="h-10 w-10" />} title={t('approvals.empty.tasks')} />
        ) : (
          <ul className="space-y-2">
            {cands.candidates.map((c) => (
              <CandidateRow key={c.id} c={c} showSource onOpenSource={() => setSource(c.source_id)} onChange={() => (void mutateCands(), refreshApprovals())} />
            ))}
          </ul>
        )
      ) : !data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : data.sources.length === 0 ? (
        <Empty icon={<Inbox className="h-10 w-10" />} title={t(tab === 'reviewed' ? 'approvals.empty.reviewed' : 'approvals.empty.queue')} hint={tab === 'reviewed' ? undefined : t('approvals.empty.hint')} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {data.sources.map((s) => (
            <SourceCard key={s.id} s={s} onOpen={() => setSource(s.id)} />
          ))}
        </div>
      )}
      {sourceId && <SourceDrawer id={sourceId} onClose={() => setSource(null)} />}
      <PasteNotes open={paste} onClose={() => setPaste(false)} />
    </div>
  );
}
