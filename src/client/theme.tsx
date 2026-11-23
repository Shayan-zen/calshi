import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "pp-theme";
const META_COLORS: Record<ResolvedTheme, string> = { light: "#ffffff", dark: "#0b0d10" };

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage blocked */
  }
  return "system";
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

/** Apply to <html> synchronously so getComputedStyle reads the new palette during the same render. */
function apply(theme: ResolvedTheme, animate: boolean) {
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (animate && !reduce) {
    root.classList.add("theme-switching");
    window.setTimeout(() => root.classList.remove("theme-switching"), 260);
  }
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", META_COLORS[theme]);
}

interface ThemeCtx {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(readMode()));

  // Initial sync (the inline script in index.html already did this before paint).
  useEffect(() => apply(resolved, false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const setMode = useCallback((m: ThemeMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
    const r = resolve(m);
    apply(r, true);
    setModeState(m);
    setResolved(r);
  }, []);

  // Follow the OS while in system mode.
  useEffect(() => {
    if (mode !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const r: ResolvedTheme = mq.matches ? "dark" : "light";
      apply(r, true);
      setResolved(r);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  // Keep tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const m = readMode();
      const r = resolve(m);
      apply(r, true);
      setModeState(m);
      setResolved(r);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<ThemeCtx>(
    () => ({ mode, resolved, setMode, toggle: () => setMode(resolved === "dark" ? "light" : "dark") }),
    [mode, resolved, setMode],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}

/** Resolve a CSS color that may be `var(--x)` into a concrete value from the live palette. */
export function cssColor(value: string): string {
  const m = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!m || typeof document === "undefined") return value;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || value;
}

export interface ChartColors {
  grid: string;
  axis: string;
  cursor: string;
  card: string;
  resolve: (c: string) => string;
}

/** Concrete colors for SVG/recharts props; recomputed whenever the theme flips. */
export function useChartColors(): ChartColors {
  const { resolved } = useTheme();
  return useMemo(
    () => ({
      grid: cssColor("var(--chart-grid)"),
      axis: cssColor("var(--chart-axis)"),
      cursor: cssColor("var(--chart-cursor)"),
      card: cssColor("var(--card)"),
      resolve: cssColor,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolved],
  );
}
