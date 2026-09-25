import Link from 'next/link';
import type { ReactNode } from 'react';

export function PublicShell({ name, practice, children }: { name: string; practice: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 via-ink-50 to-ink-50">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <Link href="/book" className="mb-8 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">
            {name
              .split(' ')
              .map((p) => p[0])
              .join('')}
          </span>
          <span>
            <span className="block font-semibold text-ink-900">{name}</span>
            <span className="block text-sm text-ink-500">{practice}</span>
          </span>
        </Link>
        {children}
      </div>
    </main>
  );
}
