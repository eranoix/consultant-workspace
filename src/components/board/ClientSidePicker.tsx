'use client';

import { useT } from '@/i18n/client';
import { Field } from '../ui';
import { useClients, useWorkspace } from '../shell/workspace';

/**
 * Side and client, cascading both ways: picking a side narrows the client
 * list to that side, picking a client sets the side to the client's. The two
 * can never disagree, which is what the board's side filter relies on.
 */
export function ClientSidePicker({
  clientId,
  side,
  onChange,
  compact,
}: {
  clientId: string | null;
  side: 'partner' | 'direct' | null;
  onChange: (clientId: string | null, side: 'partner' | 'direct' | null) => void;
  compact?: boolean;
}) {
  const t = useT();
  const { partnerShort } = useWorkspace();
  const { clients } = useClients();
  const visible = clients.filter((c) => (c.active || c.id === clientId) && (!side || c.side === side));
  return (
    <div className={compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 gap-3'}>
      <Field label={t('common.side.label')}>
        <select
          className="input"
          value={side ?? ''}
          onChange={(e) => {
            const s = (e.target.value || null) as 'partner' | 'direct' | null;
            const current = clients.find((c) => c.id === clientId);
            onChange(current && s && current.side !== s ? null : clientId, s);
          }}
        >
          <option value="">{t('common.side.unknown')}</option>
          <option value="partner">{partnerShort}</option>
          <option value="direct">{t('common.side.direct')}</option>
        </select>
      </Field>
      <Field label={t('common.client')}>
        <select
          className="input"
          aria-label={t('common.client')}
          value={clientId ?? ''}
          onChange={(e) => {
            const id = e.target.value || null;
            const c = clients.find((x) => x.id === id);
            onChange(id, c ? c.side : side);
          }}
        >
          <option value="">{t('common.noClient')}</option>
          {visible.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
