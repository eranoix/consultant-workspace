'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Trash2 } from 'lucide-react';
import { api, fetcher } from '@/lib/client/api';
import { useT } from '@/i18n/client';
import { Badge, Button, Card, Field, Modal, PageHeader, SideTag, Spinner, useToast } from '../ui';
import { useClients, useWorkspace, type ClientOption } from '../shell/workspace';

interface Override {
  id: string;
  kind: 'sender' | 'domain' | 'keyword';
  pattern: string;
  side: 'partner' | 'direct';
  client_id: string | null;
  client_name: string | null;
  note: string | null;
}

function ClientForm({ client, onClose, onSaved }: { client: ClientOption | null; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const { partnerShort } = useWorkspace();
  const [name, setName] = useState(client?.name ?? '');
  const [side, setSide] = useState<'partner' | 'direct'>(client?.side ?? 'direct');
  const [domains, setDomains] = useState(client?.domains.join(', ') ?? '');
  const [aliases, setAliases] = useState(client?.aliases.join(', ') ?? '');
  const [engagement, setEngagement] = useState(client?.engagement ?? '');
  const [color, setColor] = useState(client?.color ?? '#64748b');
  const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  return (
    <Modal
      open
      onClose={onClose}
      title={client ? client.name : t('settings.clients.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={async () => {
              const body = { name, side, domains: split(domains), aliases: split(aliases), engagement: engagement || null, color };
              try {
                if (client) await api(`/api/clients/${client.id}`, { method: 'PATCH', body });
                else await api('/api/clients', { method: 'POST', body });
                onSaved();
                onClose();
              } catch (e) {
                toast((e as Error).message, { tone: 'error' });
              }
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t('settings.clients.name')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.side.label')}>
            <select className="input" value={side} onChange={(e) => setSide(e.target.value as 'partner' | 'direct')}>
              <option value="partner">{partnerShort}</option>
              <option value="direct">{t('common.side.direct')}</option>
            </select>
          </Field>
          <Field label={t('settings.clients.color')}>
            <input type="color" className="input h-9 p-1" value={color} onChange={(e) => setColor(e.target.value)} />
          </Field>
        </div>
        <Field label={t('settings.clients.domains')} hint={t('settings.clients.domainsHint')}>
          <input className="input" value={domains} onChange={(e) => setDomains(e.target.value)} />
        </Field>
        <Field label={t('settings.clients.aliases')} hint={t('settings.clients.aliasesHint')}>
          <input className="input" value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </Field>
        <Field label={t('settings.clients.engagement')}>
          <input className="input" value={engagement} onChange={(e) => setEngagement(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function ClientsSettings() {
  const t = useT();
  const { partnerShort } = useWorkspace();
  const { clients, loaded, mutate } = useClients(true);
  const { data: ov, mutate: mutateOv } = useSWR<{ overrides: Override[] }>('/api/overrides', fetcher);
  const [editing, setEditing] = useState<ClientOption | null | undefined>(undefined);
  const [newOv, setNewOv] = useState({ kind: 'sender' as Override['kind'], pattern: '', side: 'direct' as 'partner' | 'direct', clientId: '' });
  const toast = useToast();
  if (!loaded || !ov) return <Spinner />;
  return (
    <div className="max-w-5xl">
      <PageHeader
        title={t('settings.clients.title')}
        subtitle={t('settings.clients.subtitle')}
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>
            {t('settings.clients.new')}
          </Button>
        }
      />
      <Card bodyClassName="p-0" title={t('settings.clients.list')}>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2 font-medium">{t('settings.clients.name')}</th>
              <th className="px-4 py-2 font-medium">{t('common.side.label')}</th>
              <th className="px-4 py-2 font-medium">{t('settings.clients.domains')}</th>
              <th className="px-4 py-2 font-medium">{t('settings.clients.aliases')}</th>
              <th className="px-4 py-2 font-medium">{t('settings.clients.openTasks')}</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                    {c.name}
                    {!c.active && <Badge>{t('settings.clients.inactive')}</Badge>}
                  </span>
                  {c.engagement && <span className="text-xs text-ink-500">{c.engagement}</span>}
                </td>
                <td className="px-4 py-2.5">
                  <SideTag side={c.side} partnerLabel={partnerShort} />
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-ink-600">{c.domains.join(', ')}</td>
                <td className="px-4 py-2.5 text-xs text-ink-600">{c.aliases.join(', ')}</td>
                <td className="px-4 py-2.5 text-xs">{c.open_tasks ?? 0}</td>
                <td className="px-4 py-2.5 text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                    {t('common.edit')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-4" bodyClassName="p-0" title={t('settings.overrides.title')}>
        <p className="border-b border-ink-100 px-4 py-2 text-xs text-ink-500">{t('settings.overrides.hint')}</p>
        <ul className="divide-y divide-ink-100">
          {ov.overrides.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Badge tone="violet">{t(`settings.overrides.kinds.${o.kind}`)}</Badge>
              <span className="font-mono text-xs">{o.pattern}</span>
              <span className="text-ink-400">→</span>
              <SideTag side={o.side} partnerLabel={partnerShort} />
              {o.client_name && <span className="text-xs text-ink-700">{o.client_name}</span>}
              {o.note && <span className="truncate text-xs text-ink-400">{o.note}</span>}
              <button
                type="button"
                aria-label={t('common.delete')}
                className="ml-auto text-ink-400 hover:text-red-600"
                onClick={async () => {
                  await api(`/api/overrides/${o.id}`, { method: 'DELETE' });
                  void mutateOv();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap items-end gap-2 border-t border-ink-100 px-4 py-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/api/overrides', { method: 'POST', body: { ...newOv, clientId: newOv.clientId || null } });
              setNewOv({ ...newOv, pattern: '' });
              void mutateOv();
            } catch (err) {
              toast((err as Error).message, { tone: 'error' });
            }
          }}
        >
          <select className="input h-9 w-28 py-1" value={newOv.kind} onChange={(e) => setNewOv({ ...newOv, kind: e.target.value as Override['kind'] })}>
            {(['sender', 'domain', 'keyword'] as const).map((k) => (
              <option key={k} value={k}>
                {t(`settings.overrides.kinds.${k}`)}
              </option>
            ))}
          </select>
          <input className="input h-9 w-56 py-1" placeholder={t('settings.overrides.pattern')} value={newOv.pattern} onChange={(e) => setNewOv({ ...newOv, pattern: e.target.value })} />
          <select
            className="input h-9 w-48 py-1"
            value={newOv.clientId}
            onChange={(e) => {
              const c = clients.find((x) => x.id === e.target.value);
              setNewOv({ ...newOv, clientId: e.target.value, side: c ? c.side : newOv.side });
            }}
          >
            <option value="">{t('common.noClient')}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="input h-9 w-36 py-1" value={newOv.side} onChange={(e) => setNewOv({ ...newOv, side: e.target.value as 'partner' | 'direct' })}>
            <option value="partner">{partnerShort}</option>
            <option value="direct">{t('common.side.direct')}</option>
          </select>
          <Button type="submit" size="md" disabled={newOv.pattern.trim().length < 2} icon={<Plus className="h-4 w-4" />}>
            {t('settings.overrides.add')}
          </Button>
        </form>
      </Card>
      {editing !== undefined && <ClientForm client={editing} onClose={() => setEditing(undefined)} onSaved={() => void mutate()} />}
    </div>
  );
}
