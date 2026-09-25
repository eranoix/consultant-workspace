import { currentUser } from '@/lib/server/auth';
import { subscribe } from '@/lib/server/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server-sent events: `data: {"table":"tasks","op":"UPDATE","id":"..."}`.
 * A comment line every 25 s keeps proxies from closing an idle stream.
 */
export async function GET(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return new Response('Sign in required', { status: 401 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send('retry: 3000\n\n');
      const unsubscribe = await subscribe((e) => send(`data: ${JSON.stringify(e)}\n\n`));
      const ping = setInterval(() => send(': ping\n\n'), 25_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
      };
      req.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
