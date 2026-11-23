import clsx from "clsx";

/** Pilani Predict mark: a rising step-chart inside a dark tile, ending at a green "settled" dot. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0f1115" />
      <path
        d="M7 23h5v-6h5v-5h5V8"
        fill="none"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22" cy="8" r="3" fill="#00c27f" />
    </svg>
  );
}

export default function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className={clsx("whitespace-nowrap text-[17px] font-bold tracking-[-0.02em] text-ink", compact && "hidden sm:inline")}>
        Pilani<span className="font-medium text-ink-2"> Predict</span>
      </span>
    </span>
  );
}
