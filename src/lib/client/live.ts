'use client';

import { useEffect, useRef } from 'react';

type Change = { table: string; op: string; id: string | null };
type Handler = (e: Change) => void;

/**
 * One EventSource per tab, shared by every component that wants live
 * updates. Components subscribe by table name; bursts are debounced so a bulk
 * change (approving a meeting that creates five tasks) refetches once.
 */
const handlers = new Set<{ tables: string[]; fn: Handler }>();
let source: EventSource | null = null;

function ensureSource() {
  if (source || typeof window === 'undefined') return;
  source = new EventSource('/api/events');
  source.onmessage = (msg) => {
    let e: Change;
    try {
      e = JSON.parse(msg.data) as Change;
    } catch {
      return;
    }
    for (const h of handlers) if (h.tables.includes(e.table)) h.fn(e);
  };
}

export function useLive(tables: string[], onChange: Handler, debounceMs = 250): void {
  const ref = useRef(onChange);
  ref.current = onChange;
  const key = tables.join(',');
  useEffect(() => {
    ensureSource();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last: Change | null = null;
    const entry = {
      tables: key.split(','),
      fn: (e: Change) => {
        last = e;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => last && ref.current(last), debounceMs);
      },
    };
    handlers.add(entry);
    return () => {
      handlers.delete(entry);
      if (timer) clearTimeout(timer);
      if (handlers.size === 0 && source) {
        source.close();
        source = null;
      }
    };
  }, [key, debounceMs]);
}
