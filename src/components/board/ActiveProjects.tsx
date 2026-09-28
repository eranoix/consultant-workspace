'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';
import { useT } from '@/i18n/client';
import { Badge, Button, Modal, SideTag } from '../ui';
import { useClients, useWorkspace } from '../shell/workspace';

export function ActiveProjects({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (clientId: string) => void }) {
  const t = useT();
  const { partnerShort } = useWorkspace();
  const { clients, mutate } = useClients(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [engagement, setEngagement] = useState('');

  const patch = async (id: string, body: Record<string, unknown>) => {
    await api(`/api/clients/${id}`, { method: 'PATCH', body });
    await mutate();
  };

  return (
    <Modal open={open} onClose={onClose} title={t('board.projects.title')} wide>
      <p className="mb-3 text-xs text-ink-500">{t('board.projects.hint')}</p>
      <ul className="divide-y divide-ink-100">
        {clients.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
            <div className="min-w-0 flex-1">
              <button type="button" className="text-sm font-medium text-ink-900 hover:underline" onClick={() => onPick(c.id)}>
                {c.name}
              </button>
              {editing === c.id ? (
                <form
                  className="mt-1 flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await patch(c.id, { engagement: engagement || null });
                    setEditing(null);
                  }}
                >
                  <input className="input h-8 py-1" autoFocus value={engagement} onChange={(e) => setEngagement(e.target.value)} />
                  <Button size="sm" variant="primary" type="submit">
                    {t('common.save')}
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  className="block text-xs text-ink-500 hover:text-ink-800"
                  onClick={() => {
                    setEditing(c.id);
                    setEngagement(c.engagement ?? '');
                  }}
                >
                  {c.engagement || t('board.projects.addEngagement')}
                </button>
              )}
            </div>
            <SideTag side={c.side} partnerLabel={partnerShort} />
            <Badge tone={c.open_tasks ? 'brand' : 'neutral'}>{t('board.projects.open', { count: c.open_tasks ?? 0 })}</Badge>
            <label className="flex items-center gap-1.5 text-xs text-ink-600">
              <input type="checkbox" checked={c.active} onChange={(e) => patch(c.id, { active: e.target.checked })} />
              {t('board.projects.active')}
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
