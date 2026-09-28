'use client';

import { CalendarDays, Flag, Link2 } from 'lucide-react';
import { deadlineState } from '@/lib/domain/time';
import { useLocale, useT } from '@/i18n/client';
import { ClientChip, cx, SideTag } from '../ui';
import { useWorkspace } from '../shell/workspace';
import type { Task } from './types';

export function formatDay(iso: string, locale: string) {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function TaskCard({
  task,
  today,
  onOpen,
  draggable,
  onDragStart,
  compact,
}: {
  task: Task;
  today: string;
  onOpen: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  compact?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const { partnerShort } = useWorkspace();
  const state = deadlineState(task.due_date, today, task.status === 'done');
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      data-testid="task-card"
      data-deadline={state}
      title={task.title}
      className={cx(
        'group cursor-pointer rounded-lg border bg-white p-3 shadow-card transition hover:shadow-md',
        state === 'overdue' ? 'border-red-400 ring-1 ring-red-300' : state === 'today' ? 'border-amber-400 ring-1 ring-amber-300' : 'border-ink-200',
        task.status === 'done' && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-2">
        {task.priority === 'high' && <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" aria-label={t('board.priority.high')} />}
        <p className={cx('min-w-0 flex-1 truncate text-sm font-medium text-ink-900', task.status === 'done' && 'line-through decoration-ink-300')}>{task.title}</p>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <ClientChip name={task.client_name} color={task.client_color} />
        {!compact && <SideTag side={task.side} partnerLabel={partnerShort} />}
      </div>
      {(task.due_date || task.origin !== 'manual') && (
        <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-500">
          {task.due_date && (
            <span className={cx('inline-flex items-center gap-1', state === 'overdue' && 'font-semibold text-red-600', state === 'today' && 'font-semibold text-amber-700')}>
              <CalendarDays className="h-3 w-3" />
              {state === 'today' ? t('board.dueToday') : formatDay(task.due_date, locale)}
            </span>
          )}
          {task.origin === 'approval' && (
            <span className="inline-flex items-center gap-1" title={task.source_title ?? ''}>
              <Link2 className="h-3 w-3" />
              {t(task.source_kind === 'email' ? 'board.origin.email' : 'board.origin.meeting')}
            </span>
          )}
          {task.origin === 'api' && <span className="text-violet-600">API</span>}
        </div>
      )}
    </div>
  );
}
