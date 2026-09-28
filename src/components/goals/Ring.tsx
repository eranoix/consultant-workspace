export function Ring({ value, size = 96, stroke = 8, label, sublabel }: { value: number; size?: number; stroke?: number; label: string; sublabel?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#efeeea" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={v >= 1 ? '#10b981' : '#257a71'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 400ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center justify-center rounded-[50%] bg-brand-50/90 px-2 py-0.5 leading-tight">
          <span className="font-semibold text-ink-900" style={{ fontSize: Math.max(11, size / 5.5) }}>
            {label}
          </span>
          {sublabel && <span className="text-[10px] text-ink-500">{sublabel}</span>}
        </div>
      </div>
    </div>
  );
}
