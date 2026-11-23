import type { ReactNode } from "react";
import clsx from "clsx";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { Side } from "../../shared/types";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("animate-pulse-soft rounded-md bg-surface-2", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("size-4 animate-spin", className)} />;
}

/** Shared button looks. Kept as strings so Links and buttons can share them. */
export const btn = {
  ink: "inline-flex items-center justify-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-on-ink transition-colors hover:bg-ink-2 disabled:opacity-50",
  yes: "inline-flex items-center justify-center gap-2 rounded-full bg-yes px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-yes-strong disabled:opacity-50",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface",
};

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && (
        <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-line bg-surface text-muted">{icon}</div>
      )}
      <p className="text-[15px] font-semibold tracking-tight text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Pill-track segmented control (order book side, amount mode...). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
  className,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<readonly [T, ReactNode]>;
  size?: "xs" | "sm";
  className?: string;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={clsx("inline-flex gap-0.5 rounded-lg bg-surface p-0.5", className)}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={clsx(
            "rounded-md font-semibold transition-colors",
            size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
            value === v ? "bg-thumb text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const msg = error instanceof Error ? error.message : "Something went wrong";
  return (
    <div className={clsx("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-down-tint text-down">
        <AlertTriangle className="size-5" />
      </div>
      <p className="text-[15px] font-semibold text-ink">Couldn't load this</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{msg}</p>
      {onRetry && (
        <button onClick={onRetry} className={clsx(btn.ghost, "mt-4 py-1.5")}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("rounded-xl border border-line bg-card", className)}>{children}</div>;
}

export function SideBadge({ side, className }: { side: Side; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold",
        side === "yes" ? "bg-yes-tint text-yes-strong" : "bg-no-tint text-no-strong",
        className,
      )}
    >
      {side === "yes" ? "Yes" : "No"}
    </span>
  );
}

export function Change({ value, className, suffix = "" }: { value: number; className?: string; suffix?: string }) {
  const r = Math.round(value);
  if (r === 0) return <span className={clsx("tnum text-faint", className)}>–</span>;
  return (
    <span className={clsx("tnum inline-flex items-center gap-0.5 font-medium", r > 0 ? "text-up" : "text-down", className)}>
      <svg viewBox="0 0 10 10" className={clsx("size-2", r < 0 && "rotate-180")} aria-hidden>
        <path d="M5 1.5 9 8H1z" fill="currentColor" />
      </svg>
      {Math.abs(r)}
      {suffix}
    </span>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Pnl({ cents: c, className }: { cents: number; className?: string }) {
  const r = Math.round(c);
  const s = Math.abs(r / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <span className={clsx("tnum font-medium", r > 0 ? "text-up" : r < 0 ? "text-down" : "text-muted", className)}>
      {r > 0 ? "+" : r < 0 ? "−" : ""}${s}
    </span>
  );
}
