'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { atMinutes, dateInZone, formatDuration, hhmm, minutesOfDay } from '@/lib/domain/time';
import { useT } from '@/i18n/client';
import { Button, Field, Modal, useToast } from '../ui';
import { ClientSidePicker } from '../board/ClientSidePicker';
import type { Entry } from './types';

export function EntryEditor({ entry, timeZone, onClose, onSaved }: { entry: Entry | null; timeZone: string; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [side, setSide] = useState<'partner' | 'direct' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setTitle(entry.title);
    setStart(hhmm(minutesOfDay(new Date(entry.starts_at).getTime(), timeZone)));
    setDuration('');
    setNotes(entry.notes ?? '');
    setClientId(entry.client_id);
    setSide(entry.side);
  }, [entry, timeZone]);

  if (!entry) return null;
  const date = dateInZone(new Date(entry.starts_at).getTime(), timeZone);
  const draftDuration = duration.trim() === '' ? entry.duration_min : Number(duration);
  const valid = Number.isInteger(draftDuration) && draftDuration >= 5 && draftDuration <= 720 && /^\d{2}:\d{2}$/.test(start);
  const [h, m] = start.split(':').map(Number) as [number, number];
  const endPreview = valid ? hhmm(h * 60 + m + draftDuration) : null;

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/timeline/entries/${entry.id}`, {
        method: 'PATCH',
        body: {
          title,
          startsAt: new Date(atMinutes(date, h * 60 + m, timeZone)).toISOString(),
          durationMin: draftDuration,
          notes: notes || null,
          ...(clientId !== entry.client_id ? { clientId } : { side }),
        },
      });
      onSaved();
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    await api(`/api/timeline/entries/${entry.id}`, { method: 'DELETE' });
    onSaved();
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('timeline.edit.title')}
      footer={
        <>
          <Button variant="danger" size="sm" icon={<Trash2 className="h-4 w-4" />} className="mr-auto" onClick={remove}>
            {t('common.delete')}
          </Button>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!valid || !title.trim()} onClick={save}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('board.fields.title')}>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('timeline.edit.start')}>
            <input type="time" step={300} className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field
            label={t('timeline.edit.duration')}
            hint={endPreview ? <span data-testid="end-preview">{t('timeline.edit.ends', { time: endPreview, duration: formatDuration(draftDuration) })}</span> : t('timeline.edit.invalid')}
          >
            <input
              type="number"
              inputMode="numeric"
              min={5}
              max={720}
              step={5}
              className="input"
              aria-label={t('timeline.edit.duration')}
              placeholder={String(entry.duration_min)}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </Field>
        </div>
        <ClientSidePicker compact clientId={clientId} side={side} onChange={(c, s) => (setClientId(c), setSide(s))} />
        <Field label={t('timeline.edit.notes')}>
          <textarea className="input min-h-[70px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {entry.task_id && (
          <Link href={`/app/timeline?task=${entry.task_id}`} className="text-xs font-medium text-brand-700 hover:underline">
            {t('timeline.edit.openTask')}
          </Link>
        )}
      </div>
    </Modal>
  );
}
