import clsx from "clsx";

/** Semicircle chance gauge for single-market events. Colors come from theme tokens via classes. */
export default function Gauge({ value, size = 92 }: { value: number; size?: number }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 40;
  const circ = Math.PI * r;
  const yes = v >= 50;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size * 0.6 }}>
      <svg viewBox="0 0 100 56" width={size} height={size * 0.56} aria-hidden>
        <path d="M10 50 A40 40 0 0 1 90 50" fill="none" className="stroke-surface-2" strokeWidth="9" strokeLinecap="round" />
        <path
          d="M10 50 A40 40 0 0 1 90 50"
          fill="none"
          className={clsx("transition-[stroke-dasharray] duration-500", yes ? "stroke-yes" : "stroke-no")}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * circ} ${circ}`}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center leading-none">
        <div className="tnum text-[18px] font-bold tracking-tight text-ink">{Math.round(v)}%</div>
        <div className="mt-0.5 text-[10px] font-medium text-muted">chance</div>
      </div>
    </div>
  );
}
