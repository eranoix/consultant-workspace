'use client';

import { useState } from 'react';
import { Check, ChevronDown, Pencil, Undo2, X } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useLocale, useT } from '@/i18n/client';
import { Badge, Button, ClientChip, cx, Field, SideTag, useToast } from '../ui';
import { ClientSidePicker } from '../board/ClientSidePicker';
import { formatDay } from '../board/TaskCard';
import { useWorkspace } from '../shell/workspace';
import type { Candidate } from './types';

export function CandidateRow({ c, onChange, showSource, onOpenSource }: { c: Candidate; onChange: () => void; showSource?: boolean; onOpenSource?: () => void }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { partnerShort } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: c.title, details: c.details, clientId: c.client_id, side: c.side, dueDate: c.due_date ?? '' });

  const decide = async (decision: 'approved' | 'no_action') => {
    setBusy(decision);
    try {
      await api(`/api/candidates/${c.id}/decision`, { method: 'POST', body: { decision } });
      onChange();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };
  const undo = async () => {
    setBusy('undo');
    try {
      await api(`/api/candidates/${c.id}/decision`, { method: 'DELETE' });
      toast(t('approvals.toast.undone'));
      onChange();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    setBusy('save');
    try {
      await api(`/api/candidates/${c.id}`, {
        method: 'PATCH',
        body: { title: draft.title, details: draft.details, clientId: draft.clientId, side: draft.side, dueDate: draft.dueDate || null },
      });
      setEditing(false);
      onChange();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const decided = c.decision !== 'pending';
  return (
    <li
      data-testid="candidate"
      data-decision={c.decision}
      className={cx(
        'rounded-lg border p-3 transition-colors',
        c.decision === 'approved' ? 'border-emerald-200 bg-emerald-50/50' : c.decision === 'no_action' ? 'border-ink-200 bg-ink-50' : 'border-ink-200 bg-white',
      )}
    >
      {editing ? (
        <div className="space-y-3">
          <Field label={t('board.fields.title')}>
            <input className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </Field>
          <Field label={t('board.fields.description')}>
            <textarea className="input min-h-[60px]" value={draft.details} onChange={(e) => setDraft({ ...draft, details: e.target.value })} />
          </Field>
          <ClientSidePicker compact clientId={draft.clientId} side={draft.side} onChange={(clientId, side) => setDraft({ ...draft, clientId, side })} />
          <Field label={t('board.fields.due')}>
            <input type="date" className="input" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="primary" loading={busy === 'save'} onClick={save}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className={cx('text-sm font-medium', c.decision === 'no_action' ? 'text-ink-500 line-through decoration-ink-300' : 'text-ink-900')}>{c.title}</p>
            {c.details && c.details !== c.title && <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{c.details}</p>}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <ClientChip name={c.client_name} />
              <SideTag side={c.side} partnerLabel={partnerShort} />
              {c.due_date && <Badge tone="neutral">{t('approvals.due', { date: formatDay(c.due_date, locale) })}</Badge>}
              {c.task_id && <Badge tone="brand">{t('approvals.onBoard', { status: t(`board.columns.${c.task_status ?? 'backlog'}`) })}</Badge>}
              {showSource && c.source_title && (
                <button type="button" onClick={onOpenSource} className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
                  <ChevronDown className="h-3 w-3 -rotate-90" />
                  {c.source_title}
                </button>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {!decided && (
              <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700" title={t('common.edit')} aria-label={t('common.edit')} onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {decided ? (
              <>
                <Badge tone={c.decision === 'approved' ? 'green' : 'neutral'}>{t(`approvals.decision.${c.decision}`)}</Badge>
                <Button size="sm" variant="ghost" icon={<Undo2 className="h-3.5 w-3.5" />} loading={busy === 'undo'} onClick={undo}>
                  {t('approvals.undo')}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" icon={<X className="h-3.5 w-3.5" />} loading={busy === 'no_action'} onClick={() => decide('no_action')}>
                  {t('approvals.noAction')}
                </Button>
                <Button size="sm" variant="primary" icon={<Check className="h-3.5 w-3.5" />} loading={busy === 'approved'} onClick={() => decide('approved')}>
                  {t('approvals.approve')}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
