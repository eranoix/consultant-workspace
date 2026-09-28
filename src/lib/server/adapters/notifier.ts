export type Channel = 'outbox' | 'email' | 'whatsapp';

export interface OutgoingMessage {
  channel: Channel;
  recipient: string;
  subject: string;
  body: string;
}

export interface DeliveryResult {
  ok: boolean;
  via: string;
  error?: string;
}

export async function deliver(msg: OutgoingMessage, env: NodeJS.ProcessEnv = process.env): Promise<DeliveryResult> {
  if (msg.channel === 'outbox') return { ok: true, via: 'outbox' };
  const url = msg.channel === 'email' ? env.NOTIFY_EMAIL_WEBHOOK : env.NOTIFY_WHATSAPP_WEBHOOK;
  if (!url) return { ok: true, via: `outbox (no ${msg.channel} webhook configured)` };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: msg.recipient, subject: msg.subject, text: msg.body }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, via: msg.channel, error: `HTTP ${res.status}` };
    return { ok: true, via: msg.channel };
  } catch (err) {
    return { ok: false, via: msg.channel, error: (err as Error).message };
  }
}
