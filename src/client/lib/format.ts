/** Money is integer cents everywhere. */
export function money(cents: number, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const neg = cents < 0;
  const abs = Math.abs(cents) / 100;
  let body: string;
  if (opts.compact && abs >= 1000) {
    body = compactNumber(abs);
  } else {
    body = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const sign = neg ? "-" : opts.sign && cents > 0 ? "+" : "";
  return `${sign}$${body}`;
}

export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${trim(n / 1_000)}K`;
  return `${Math.round(n)}`;
}

function trim(n: number): string {
  return n >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "");
}

/** Volume in contracts; each contract pays $1, so we display it as dollars. */
export function volume(contracts: number): string {
  return `$${compactNumber(contracts)}`;
}

export function cents(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  const r = Math.round(p * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}¢`;
}

export function pct(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  const r = Math.round(p);
  if (r < 1 && p > 0) return "<1%";
  if (r > 99 && p < 100) return ">99%";
  return `${r}%`;
}

export function signed(n: number, suffix = ""): string {
  const r = Math.round(n);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}${suffix}`;
}

export function relTime(ms: number, now = Date.now()): string {
  const diff = now - ms;
  const s = Math.round(Math.abs(diff) / 1000);
  const future = diff < 0;
  let out: string;
  if (s < 45) return future ? "in a moment" : "just now";
  if (s < 3600) out = `${Math.round(s / 60)}m`;
  else if (s < 86400) out = `${Math.round(s / 3600)}h`;
  else if (s < 86400 * 30) out = `${Math.round(s / 86400)}d`;
  else if (s < 86400 * 365) out = `${Math.round(s / (86400 * 30))}mo`;
  else out = `${Math.round(s / (86400 * 365))}y`;
  return future ? `in ${out}` : `${out} ago`;
}

export function shortDate(ms: number): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export function dateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function closesLabel(ms: number): string {
  const now = Date.now();
  if (ms <= now) return `Closed ${shortDate(ms)}`;
  const days = (ms - now) / 86400000;
  if (days < 1) return `Closes in ${Math.max(1, Math.round((ms - now) / 3600000))}h`;
  return `Closes ${shortDate(ms)}`;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Soft two-stop gradient for an event tile, stable per slug. */
export function slugGradient(slug: string): string {
  const h = hashString(slug);
  const a = h % 360;
  const b = (a + 40 + ((h >> 9) % 60)) % 360;
  // Saturation/lightness are theme vars (index.css) so tiles stay soft in light and dim in dark.
  return `linear-gradient(135deg, hsl(${a} var(--tile-s) var(--tile-l1)), hsl(${b} var(--tile-s) var(--tile-l2)))`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Categorical line colors as theme vars (light/dark values live in index.css). Usable directly in
 * HTML `style`; for SVG/recharts props resolve them with `cssColor()` / `useChartColors()`.
 * Max 4 series; extras fold into the table.
 */
export const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

export function clampPrice(p: number): number {
  return Math.min(99, Math.max(1, Math.round(p)));
}
