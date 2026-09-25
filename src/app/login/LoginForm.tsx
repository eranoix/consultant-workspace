'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { useT } from '@/i18n/client';
import { Button, Field } from '@/components/ui';

export function LoginForm({ demoEmail, demoPassword }: { demoEmail: string; demoPassword: string | null }) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(demoEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next');
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api('/api/auth/login', { method: 'POST', body: { email, password } });
          router.push(next && next.startsWith('/app') ? next : '/app');
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <Field label={t('auth.email')}>
        <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label={t('auth.password')}>
        <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" loading={busy}>
        {t('auth.signIn')}
      </Button>
      {demoPassword && (
        <p className="text-center text-xs text-ink-500">
          {t('auth.demoHint')} <code className="rounded bg-ink-100 px-1">{demoEmail}</code> / <code className="rounded bg-ink-100 px-1">{demoPassword}</code>
        </p>
      )}
    </form>
  );
}
