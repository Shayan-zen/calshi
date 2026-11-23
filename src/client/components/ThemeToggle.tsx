import { Monitor, Moon, Sun } from "lucide-react";
import clsx from "clsx";
import { useTheme, type ThemeMode } from "../theme";

/** Nav icon button: flips between light and dark. */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const dark = resolved === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className={clsx(
        "grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink",
        className,
      )}
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

const MODES: Array<[ThemeMode, string, typeof Sun]> = [
  ["system", "System", Monitor],
  ["light", "Light", Sun],
  ["dark", "Dark", Moon],
];

/** Three-way System / Light / Dark control (user menu). */
export function ThemeSegmented({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={clsx("grid grid-cols-3 gap-0.5 rounded-lg bg-surface p-0.5", className)}>
      {MODES.map(([m, label, Icon]) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={clsx(
            "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors",
            mode === m ? "bg-thumb text-ink shadow-card" : "text-muted hover:text-ink",
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
