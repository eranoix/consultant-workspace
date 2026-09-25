'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative">
      {label && <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-500">{label}</p>}
      <pre className="overflow-x-auto rounded-lg bg-ink-900 p-3 pr-10 font-mono text-xs leading-relaxed text-ink-100">{code}</pre>
      <button
        type="button"
        aria-label="Copy"
        className="absolute right-2 top-2 rounded-md p-1.5 text-ink-400 hover:bg-ink-800 hover:text-white"
        style={{ top: label ? 26 : 8 }}
        onClick={async () => {
          await navigator.clipboard?.writeText(code).catch(() => undefined);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
