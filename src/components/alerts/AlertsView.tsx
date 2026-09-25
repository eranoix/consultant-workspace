'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Activity, Eye, FlaskConical, Play, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { api, fetcher } from '@/lib/client/api';
import { useLive } from '@/lib/client/live';
import { EVENT_FIELDS, EVENTS, OPERATORS, type Condition } from '@/lib/domain/rules';
import { useLocale, useT } from '@/i18n/client';
import { Badge, Button, Card, cx, Field, Modal, PageHeader, Segmented, Spinner, useToast } from '../ui';
import { useDrawerParam } from '../board/TaskDrawer';
import { AlertList, severityIcon, timeAgo } from './AlertList';

interface Rule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  event: string;
  match: 'all' | 'any';
  conditions: Condition[];
  severity: 'info' | 'warning' | 'critical';
  channels: string[];
  cooldown_min: number;
  system: boolean;
  open_alerts: number;
  last_fired_at: string | null;
}

type Draft = Omit<Rule, 'id' | 'system' | 'open_alerts' | 'last_fired_at'> & { id?: string; system?: boolean };

const EMPTY: Draft = { name: '', description: '', enabled: true, event: 'email.unanswered', match: 'all', conditions: [], severity: 'warning', channels: ['outbox'], cooldown_min: 60 };

function RuleEditor({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const [d, setD] = useState<Draft>(draft);
  const [sample, setSample] = useState('');
  const [test, setTest] = useState<{ matches: boolean; conditions: (Condition & { result: boolean })[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = EVENT_FIELDS[d.event as keyof typeof EVENT_FIELDS] ?? [];
  const body = { name: d.name, description: d.description, enabled: d.enabled, event: d.event, match: d.match, conditions: d.conditions, severity: d.severity, channels: d.channels, cooldownMin: d.cooldown_min };

  const runTest = async () => {
    let payload: Record<string, string> = {};
    try {
      payload = Object.fromEntries(
        sample
          .split(/[\n,]/)
          .map((l) => l.split('=').map((s) => s.trim()))
          .filter((p) => p.length === 2 && p[0]) as [string, string][],
      );
    } catch {
      /* ignored: an empty payload is still a valid test */
    }
    setTest(await api('/api/alerts/rules/test', { method: 'POST', body: { rule: body, payload } }));
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={d.id ? t('alerts.rules.edit') : t('alerts.rules.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!d.name.trim() || d.channels.length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                if (d.id) await api(`/api/alerts/rules/${d.id}`, { method: 'PATCH', body });
                else await api('/api/alerts/rules', { method: 'POST', body });
                onSaved();
                onClose();
              } catch (e) {
                toast((e as Error).message, { tone: 'error' });
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('alerts.rules.name')} hint={t('alerts.rules.nameHint')}>
          <input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('alerts.rules.event')}>
            <select className="input" value={d.event} disabled={d.system} onChange={(e) => setD({ ...d, event: e.target.value, conditions: [] })}>
              {EVENTS.map((ev) => (
                <option key={ev} value={ev}>
                  {t(`alerts.events.${ev.replace('.', '_')}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('alerts.rules.severity')}>
            <select className="input" value={d.severity} onChange={(e) => setD({ ...d, severity: e.target.value as Draft['severity'] })}>
              {(['info', 'warning', 'critical'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`alerts.severity.${s}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('alerts.rules.cooldown')}>
            <input type="number" min={0} className="input" value={d.cooldown_min} onChange={(e) => setD({ ...d, cooldown_min: Number(e.target.value) })} />
          </Field>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-ink-600">
            {t('alerts.rules.when')}
            <select className="input h-7 w-auto py-0 text-xs" value={d.match} onChange={(e) => setD({ ...d, match: e.target.value as 'all' | 'any' })}>
              <option value="all">{t('alerts.rules.all')}</option>
              <option value="any">{t('alerts.rules.any')}</option>
            </select>
            {t('alerts.rules.ofThese')}
          </div>
          <ul className="space-y-2">
            {d.conditions.map((c, i) => (
              <li key={i} className="flex gap-2">
                <select className="input" value={c.field} onChange={(e) => setD({ ...d, conditions: d.conditions.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })}>
                  {fields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <select className="input w-36" value={c.op} onChange={(e) => setD({ ...d, conditions: d.conditions.map((x, j) => (j === i ? { ...x, op: e.target.value as Condition['op'] } : x)) })}>
                  {OPERATORS.map((o) => (
                    <option key={o} value={o}>
                      {t(`alerts.ops.${o}`)}
                    </option>
                  ))}
                </select>
                <input className="input" value={c.value} onChange={(e) => setD({ ...d, conditions: d.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                <button type="button" aria-label={t('common.remove')} className="px-1 text-ink-400 hover:text-red-600" onClick={() => setD({ ...d, conditions: d.conditions.filter((_, j) => j !== i) })}>
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" className="mt-2" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setD({ ...d, conditions: [...d.conditions, { field: fields[0] ?? '', op: 'equals', value: '' }] })}>
            {t('alerts.rules.addCondition')}
          </Button>
        </div>
        <div>
          <span className="label">{t('alerts.rules.channels')}</span>
          <div className="flex gap-4 text-sm">
            {['outbox', 'email', 'whatsapp'].map((ch) => (
              <label key={ch} className="flex items-center gap-1.5">
                <input type="checkbox" checked={d.channels.includes(ch)} onChange={(e) => setD({ ...d, channels: e.target.checked ? [...d.channels, ch] : d.channels.filter((x) => x !== ch) })} />
                {t(`alerts.channels.${ch}`)}
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-ink-50 p-3">
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-ink-700">
            <FlaskConical className="h-3.5 w-3.5" />
            {t('alerts.rules.test')}
          </p>
          <textarea className="input min-h-[50px] font-mono text-xs" placeholder={fields.map((f) => `${f}=`).join(', ')} value={sample} onChange={(e) => setSample(e.target.value)} />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={runTest}>
              {t('alerts.rules.runTest')}
            </Button>
            {test && <Badge tone={test.matches ? 'green' : 'neutral'}>{t(test.matches ? 'alerts.rules.wouldFire' : 'alerts.rules.wouldNotFire')}</Badge>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function RulesTab() {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { data, mutate } = useSWR<{ rules: Rule[] }>('/api/alerts/rules', fetcher);
  const [editing, setEditing] = useState<Draft | null>(null);
  if (!data) return <Spinner />;
  return (
    <Card
      title={t('alerts.rules.title')}
      bodyClassName="p-0"
      action={
        <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing(EMPTY)}>
          {t('alerts.rules.new')}
        </Button>
      }
    >
      <ul className="divide-y divide-ink-100">
        {data.rules.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3" data-testid="rule">
            {severityIcon(r.severity)}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                {r.name}
                {r.system && (
                  <Badge tone="violet">
                    <ShieldCheck className="h-3 w-3" />
                    {t('alerts.rules.system')}
                  </Badge>
                )}
              </p>
              <p className="truncate text-xs text-ink-500">
                {t(`alerts.events.${r.event.replace('.', '_')}`)}
                {r.conditions.length > 0 && ` · ${r.conditions.map((c) => `${c.field} ${t(`alerts.ops.${c.op}`)} ${c.value}`).join(r.match === 'all' ? ` ${t('alerts.rules.and')} ` : ` ${t('alerts.rules.or')} `)}`}
              </p>
              <p className="text-[11px] text-ink-400">
                {r.channels.map((c) => t(`alerts.channels.${c}`)).join(', ')}
                {r.last_fired_at && ` · ${t('alerts.rules.lastFired', { when: timeAgo(r.last_fired_at, locale) })}`}
              </p>
            </div>
            {r.open_alerts > 0 && <Badge tone="amber">{t('alerts.rules.openCount', { count: r.open_alerts })}</Badge>}
            <label className="flex items-center gap-1 text-xs text-ink-600">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={async (e) => {
                  await api(`/api/alerts/rules/${r.id}`, { method: 'PATCH', body: { enabled: e.target.checked } });
                  void mutate();
                }}
              />
              {t('alerts.rules.enabled')}
            </label>
            <Button size="sm" variant="ghost" onClick={() => setEditing({ ...r })}>
              {t('common.edit')}
            </Button>
            {!r.system && (
              <button
                type="button"
                aria-label={t('common.delete')}
                className="text-ink-400 hover:text-red-600"
                onClick={async () => {
                  if (!window.confirm(t('alerts.rules.confirmDelete'))) return;
                  try {
                    await api(`/api/alerts/rules/${r.id}`, { method: 'DELETE' });
                    void mutate();
                  } catch (err) {
                    toast((err as Error).message, { tone: 'error' });
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {editing && <RuleEditor draft={editing} onClose={() => setEditing(null)} onSaved={() => void mutate()} />}
    </Card>
  );
}

function OutboxTab() {
  const t = useT();
  const locale = useLocale();
  const { data } = useSWR<{ messages: { id: string; channel: string; recipient: string; subject: string; body: string; status: string; attempts: number; delivered_via: string | null; created_at: string }[] }>('/api/alerts/outbox', fetcher, { refreshInterval: 15000 });
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return <Spinner />;
  return (
    <Card title={t('alerts.outbox.title')} bodyClassName="p-0">
      <p className="border-b border-ink-100 px-4 py-2 text-xs text-ink-500">{t('alerts.outbox.hint')}</p>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wide text-ink-500">
          <tr>
            <th className="px-4 py-2 font-medium">{t('alerts.outbox.subject')}</th>
            <th className="px-4 py-2 font-medium">{t('alerts.outbox.channel')}</th>
            <th className="px-4 py-2 font-medium">{t('alerts.outbox.via')}</th>
            <th className="px-4 py-2 font-medium">{t('alerts.outbox.when')}</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {data.messages.map((m) => (
            <tr key={m.id} className="align-top">
              <td className="px-4 py-2">
                <p className="font-medium">{m.subject}</p>
                {open === m.id && <p className="mt-1 whitespace-pre-wrap text-xs text-ink-600">{m.body}</p>}
              </td>
              <td className="px-4 py-2">
                <Badge tone={m.channel === 'whatsapp' ? 'green' : m.channel === 'email' ? 'blue' : 'neutral'}>{t(`alerts.channels.${m.channel}`)}</Badge>
              </td>
              <td className="px-4 py-2 text-xs text-ink-600">
                <Badge tone={m.status === 'sent' ? 'green' : m.status === 'failed' ? 'red' : 'amber'}>{m.status}</Badge> {m.delivered_via}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-xs text-ink-500">{timeAgo(m.created_at, locale)}</td>
              <td className="px-2 py-2">
                <button type="button" aria-label={t('alerts.outbox.view')} className="text-ink-400 hover:text-ink-800" onClick={() => setOpen(open === m.id ? null : m.id)}>
                  <Eye className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

interface Health {
  now: string;
  unwatched: string[];
  jobs: {
    name: string;
    description: string;
    intervalSec: number;
    graceSec: number;
    enabled: boolean;
    watchedBy: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    lastErrorAt: string | null;
    lastDurationMs: number | null;
    runCount: number;
    failCount: number;
    health: 'ok' | 'late' | 'failing' | 'never' | 'disabled';
    secondsLate: number;
    recent: { ok: boolean | null; started_at: string }[];
  }[];
  intake: { pendingReview: number; channels: { channel: string; runs_24h: number; failed_24h: number; created_24h: number; last_success: string | null; last_error: string | null; last_error_at: string | null }[] };
}

function every(sec: number) {
  return sec >= 3600 ? `${sec / 3600}h` : sec >= 60 ? `${sec / 60} min` : `${sec}s`;
}

function JobsTab() {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { data, mutate } = useSWR<Health>('/api/cron', fetcher, { refreshInterval: 10000 });
  useLive(['alerts'], () => void mutate());
  if (!data) return <Spinner />;
  const tone = { ok: 'green', late: 'red', failing: 'amber', never: 'neutral', disabled: 'neutral' } as const;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {data.intake.channels.map((c) => (
          <Card key={c.channel} title={t(`alerts.intake.${c.channel}`)}>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-semibold">{c.runs_24h}</p>
                <p className="text-xs text-ink-500">{t('alerts.intake.runs')}</p>
              </div>
              <div className="text-right text-xs text-ink-600">
                <p>{t('alerts.intake.created', { count: c.created_24h })}</p>
                <p className={cx(c.failed_24h ? 'text-amber-700' : 'text-ink-500')}>{t('alerts.intake.failed', { count: c.failed_24h })}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-ink-500">{c.last_success ? t('alerts.intake.lastOk', { when: timeAgo(c.last_success, locale) }) : t('alerts.intake.never')}</p>
            {c.last_error && <p className="mt-1 truncate text-[11px] text-amber-700" title={c.last_error}>{c.last_error}</p>}
          </Card>
        ))}
      </div>
      <Card
        title={
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            {t('alerts.jobs.title')}
          </span>
        }
        bodyClassName="p-0"
      >
        <p className="border-b border-ink-100 px-4 py-2 text-xs text-ink-500">{t('alerts.jobs.hint')}</p>
        {data.unwatched.length > 0 && <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{t('alerts.jobs.unwatched', { names: data.unwatched.join(', ') })}</p>}
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2 font-medium">{t('alerts.jobs.job')}</th>
              <th className="px-4 py-2 font-medium">{t('alerts.jobs.health')}</th>
              <th className="px-4 py-2 font-medium">{t('alerts.jobs.lastOk')}</th>
              <th className="px-4 py-2 font-medium">{t('alerts.jobs.watchedBy')}</th>
              <th className="px-4 py-2 font-medium">{t('alerts.jobs.history')}</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {data.jobs.map((j) => (
              <tr key={j.name} data-testid="job-row">
                <td className="px-4 py-2.5">
                  <p className="font-mono text-xs font-semibold">{j.name}</p>
                  <p className="text-[11px] text-ink-500">
                    {j.description} · {t('alerts.jobs.every', { interval: every(j.intervalSec), grace: every(j.graceSec) })}
                  </p>
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={tone[j.health]}>{t(`alerts.jobs.state.${j.health}`)}</Badge>
                  {j.secondsLate > 0 && <p className="mt-0.5 text-[11px] text-red-600">{t('alerts.jobs.late', { minutes: Math.ceil(j.secondsLate / 60) })}</p>}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-600">
                  {j.lastSuccessAt ? timeAgo(j.lastSuccessAt, locale) : '·'}
                  {j.lastDurationMs !== null && <span className="text-ink-400"> · {j.lastDurationMs} ms</span>}
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-ink-600">{j.watchedBy}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-0.5">
                    {[...j.recent].reverse().map((r, i) => (
                      <span key={i} className={cx('h-4 w-1.5 rounded-sm', r.ok === false ? 'bg-red-500' : r.ok ? 'bg-emerald-500' : 'bg-ink-300')} title={r.started_at} />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Play className="h-3.5 w-3.5" />}
                    onClick={async () => {
                      await api(`/api/cron/${j.name}`, { method: 'POST', body: { action: 'run' } });
                      toast(t('alerts.jobs.requested'));
                    }}
                  >
                    {t('alerts.jobs.runNow')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export function AlertsView() {
  const t = useT();
  const [tabParam, setTab] = useDrawerParam('tab');
  const tab = (['alerts', 'rules', 'outbox', 'jobs'].includes(tabParam ?? '') ? tabParam : 'alerts') as 'alerts' | 'rules' | 'outbox' | 'jobs';
  const [showResolved, setShowResolved] = useState(false);
  return (
    <div>
      <PageHeader title={t('alerts.title')} subtitle={t('alerts.subtitle')} />
      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={(v) => setTab(v === 'alerts' ? null : v)}
          options={[
            { value: 'alerts', label: t('alerts.tabs.alerts') },
            { value: 'rules', label: t('alerts.tabs.rules') },
            { value: 'outbox', label: t('alerts.tabs.outbox') },
            { value: 'jobs', label: t('alerts.tabs.jobs') },
          ]}
        />
      </div>
      {tab === 'alerts' && (
        <Card
          bodyClassName="p-0"
          title={t(showResolved ? 'alerts.resolvedTitle' : 'alerts.liveTitle')}
          action={
            <Button size="sm" variant="ghost" onClick={() => setShowResolved(!showResolved)}>
              {t(showResolved ? 'alerts.showLive' : 'alerts.showResolved')}
            </Button>
          }
        >
          <AlertList status={showResolved ? 'resolved' : 'live'} />
        </Card>
      )}
      {tab === 'rules' && <RulesTab />}
      {tab === 'outbox' && <OutboxTab />}
      {tab === 'jobs' && <JobsTab />}
    </div>
  );
}
