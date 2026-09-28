import { Client } from 'pg';

export interface ChangeEvent {
  table: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  id: string | null;
}

type Listener = (e: ChangeEvent) => void;

interface Hub {
  listeners: Set<Listener>;
  client: Client | null;
  connecting: Promise<void> | null;
}

const globalHub = globalThis as unknown as { __cwHub?: Hub };

function hub(): Hub {
  globalHub.__cwHub ??= { listeners: new Set(), client: null, connecting: null };
  return globalHub.__cwHub;
}

async function ensureConnected(): Promise<void> {
  const h = hub();
  if (h.client) return;
  if (h.connecting) return h.connecting;
  h.connecting = (async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    client.on('notification', (msg) => {
      if (!msg.payload) return;
      let event: ChangeEvent;
      try {
        event = JSON.parse(msg.payload) as ChangeEvent;
      } catch {
        return;
      }
      for (const l of h.listeners) l(event);
    });
    const reset = () => {
      if (h.client === client) h.client = null;
    };
    client.on('error', reset);
    client.on('end', reset);
    await client.connect();
    await client.query('LISTEN workspace_events');
    h.client = client;
  })().finally(() => {
    h.connecting = null;
  });
  return h.connecting;
}

export async function subscribe(listener: Listener): Promise<() => void> {
  await ensureConnected();
  const h = hub();
  h.listeners.add(listener);
  return () => {
    h.listeners.delete(listener);
  };
}
