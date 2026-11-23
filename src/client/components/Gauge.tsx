/** Semicircle chance gauge for single-market events. */
export default function Gauge({ value, size = 92 }: { value: number; size?: number }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 40;
  const circ = Math.PI * r;
  const color = v >= 50 ? "#00a36c" : "#a23bd8";
  return (
    <div className="relative" style={{ width: size, height: size * 0.6 }}>
      <svg viewBox="0 0 100 56" width={size} height={size * 0.56} aria-hidden>
        <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="#f0f1f4" strokeWidth="9" strokeLinecap="round" />
        <path
          d="M10 50 A40 40 0 0 1 90 50"
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * circ} ${circ}`}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center leading-none">
        <div className="tnum text-[19px] font-bold text-ink">{Math.round(v)}%</div>
        <div className="mt-0.5 text-[10px] font-medium text-muted">chance</div>
      </div>
    </div>
  );
}
