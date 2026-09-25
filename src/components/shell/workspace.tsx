'use client';

import { createContext, useContext, type ReactNode } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/client/api';

export interface WorkspaceInfo {
  user: { id: string; name: string; email: string; role: string };
  partnerShort: string;
  partnerName: string;
  practice: string;
  timeZone: string;
}

const Ctx = createContext<WorkspaceInfo | null>(null);

export function WorkspaceProvider({ value, children }: { value: WorkspaceInfo; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceInfo {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkspace outside the app shell');
  return v;
}

export interface ClientOption {
  id: string;
  name: string;
  side: 'partner' | 'direct';
  color: string;
  active: boolean;
  engagement: string | null;
  open_tasks?: number;
  domains: string[];
  aliases: string[];
}

export function useClients(withCounts = false) {
  const { data, mutate } = useSWR<{ clients: ClientOption[] }>(`/api/clients${withCounts ? '?counts=1' : ''}`, fetcher);
  return { clients: data?.clients ?? [], loaded: !!data, mutate };
}
