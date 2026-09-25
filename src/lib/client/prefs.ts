'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { api, fetcher } from './api';

/**
 * A per-person preference stored on the server, so a board filter set on the
 * laptop is there on the phone. Local state updates at once; the save is
 * debounced so dragging a slider does not send a request per pixel.
 */
export function usePreference<T>(key: string, fallback: T): [T, (v: T) => void, boolean] {
  const { data } = useSWR<{ value: T | null }>(`/api/preferences/${key}`, fetcher, { revalidateOnFocus: false });
  const [local, setLocal] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackRef = useRef(fallback);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = local ?? (data?.value ? (Object.assign({}, fallbackRef.current, data.value) as T) : fallbackRef.current);
  const set = useCallback(
    (v: T) => {
      setLocal(v);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void api(`/api/preferences/${key}`, { method: 'PUT', body: { value: v } }).catch(() => undefined);
      }, 400);
    },
    [key],
  );
  return [value as T, set, !!data];
}
