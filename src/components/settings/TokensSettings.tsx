'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { BookOpen, Copy, KeyRound, Plus } from 'lucide-react';
import { api, fetcher } from '@/lib/client/api';
import { PERMISSIONS, ROLE_PERMISSIONS, type TokenRole } from '@/lib/domain/tokens';
import { useLocale, useT } from '@/i18n/client';
import { Badge, Button, Card, Field, Modal, PageHeader, Spinner, useToast } from '../ui';

interface Token {
  id: string;
  name: string;
  prefix: string;
  role: TokenRole;
  permissions: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  state: 'active' | 'revoked' | 'expired';
  created_by_name: string | null;
}

function CreateToken({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState('');
  const [role, setRole] = useState<TokenRole>('contributor');
  const [custom, setCustom] = useState<string[]>(['tasks:read']);
  const [expires, setExpires] = useState('90');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token)
    return (
      <Modal open onClose={onClose} title={t('api.created.title')} footer={<Button variant="primary" onClick={onClose}>{t('api.created.done')}</Button>}>
        <p className="mb-2 text-sm text-ink-700">{t('api.created.once')}</p>
        <div className="flex items-center gap-2 rounded-lg bg-ink-900 p-3">
          <code className="flex-1 break-all font-mono text-xs text-emerald-200" data-testid="new-token">
            {token}
          </code>
          <button
            type="button"
            className="text-ink-300 hover:text-white"
            aria-label={t('api.copy')}
            onClick={async () => {
              await navigator.clipboard?.writeText(token).catch(() => undefined);
              toast(t('api.copied'));
            }}
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </Modal>
    );

  return (
    <Modal
      open
      onClose={onClose}
      title={t('api.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!name.trim()}
            data-testid="create-token"
            onClick={async () => {
              setBusy(true);
              try {
                const res = await api<{ token: string }>('/api/tokens', { method: 'POST', body: { name, role, permissions: role === 'custom' ? custom : undefined, expiresInDays: expires ? Number(expires) : null } });
                setToken(res.token);
                onCreated();
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
      <div className="space-y-4">
        <Field label={t('api.name')} hint={t('api.nameHint')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label={t('api.name')} />
        </Field>
        <div>
          <span className="label">{t('api.role')}</span>
          <div className="space-y-2">
            {(['viewer', 'contributor', 'manager', 'custom'] as TokenRole[]).map((r) => (
              <label key={r} className="flex items-start gap-2 rounded-lg border border-ink-200 p-2.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/50">
                <input type="radio" name="role" className="mt-0.5" checked={role === r} onChange={() => setRole(r)} value={r} />
                <span>
                  <span className="font-medium">{t(`api.roles.${r}`)}</span>
                  <span className="block text-xs text-ink-500">{r === 'custom' ? t('api.roles.customHint') : ROLE_PERMISSIONS[r].join(', ')}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        {role === 'custom' && (
          <div className="grid grid-cols-2 gap-1.5">
            {PERMISSIONS.map((p) => (
              <label key={p} className="flex items-center gap-2 font-mono text-xs">
                <input type="checkbox" checked={custom.includes(p)} onChange={(e) => setCustom(e.target.checked ? [...custom, p] : custom.filter((x) => x !== p))} />
                {p}
              </label>
            ))}
          </div>
        )}
        <Field label={t('api.expires')}>
          <select className="input" value={expires} onChange={(e) => setExpires(e.target.value)}>
            <option value="30">30 {t('api.days')}</option>
            <option value="90">90 {t('api.days')}</option>
            <option value="365">365 {t('api.days')}</option>
            <option value="">{t('api.never')}</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

export function TokensSettings() {
  const t = useT();
  const locale = useLocale();
  const { data, mutate } = useSWR<{ tokens: Token[] }>('/api/tokens', fetcher);
  const [creating, setCreating] = useState(false);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale === 'pt' ? 'pt-BR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '·');
  return (
    <div className="max-w-5xl">
      <PageHeader
        title={t('api.title')}
        subtitle={t('api.subtitle')}
        actions={
          <>
            <Link href="/app/settings/api/docs">
              <Button icon={<BookOpen className="h-4 w-4" />}>{t('api.docsLink')}</Button>
            </Link>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              {t('api.new')}
            </Button>
          </>
        }
      />
      <Card bodyClassName="p-0" title={t('api.list')}>
        {!data ? (
          <Spinner className="m-4" />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2 font-medium">{t('api.name')}</th>
                <th className="px-4 py-2 font-medium">{t('api.role')}</th>
                <th className="px-4 py-2 font-medium">{t('api.permissions')}</th>
                <th className="px-4 py-2 font-medium">{t('api.lastUsed')}</th>
                <th className="px-4 py-2 font-medium">{t('api.expiresCol')}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {data.tokens.map((tk) => (
                <tr key={tk.id} className={tk.state !== 'active' ? 'opacity-60' : undefined} data-testid="token-row">
                  <td className="px-4 py-2.5">
                    <p className="flex items-center gap-2 font-medium">
                      <KeyRound className="h-3.5 w-3.5 text-ink-400" />
                      {tk.name}
                    </p>
                    <p className="font-mono text-[11px] text-ink-500">cwk_{tk.prefix}_••••</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={tk.role === 'manager' ? 'violet' : tk.role === 'contributor' ? 'brand' : 'neutral'}>{t(`api.roles.${tk.role}`)}</Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-ink-600">{tk.permissions.join(' ')}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-600">{tk.last_used_at ? fmt(tk.last_used_at) : t('api.neverUsed')}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-600">{tk.state === 'active' ? (tk.expires_at ? fmt(tk.expires_at) : t('api.never')) : <Badge tone="red">{t(`api.state.${tk.state}`)}</Badge>}</td>
                  <td className="px-4 py-2.5 text-right">
                    {tk.state === 'active' && (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          if (!window.confirm(t('api.confirmRevoke'))) return;
                          await api(`/api/tokens/${tk.id}`, { method: 'DELETE' });
                          void mutate();
                        }}
                      >
                        {t('api.revoke')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {creating && <CreateToken onClose={() => setCreating(false)} onCreated={() => void mutate()} />}
    </div>
  );
}
