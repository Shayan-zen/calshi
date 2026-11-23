import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import clsx from "clsx";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}

interface ToastApi {
  show: (t: Omit<ToastItem, "id">) => void;
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.kind === "error" ? 6000 : 4500);
    },
    [dismiss],
  );

  const value = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, body) => show({ kind: "success", title, body }),
      error: (title, body) => show({ kind: "error", title, body }),
    }),
    [show],
  );

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl border border-line bg-white p-3.5 shadow-pop"
          >
            {t.kind === "error" ? (
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-down" />
            ) : (
              <CheckCircle2 className={clsx("mt-0.5 size-5 shrink-0", t.kind === "success" ? "text-yes" : "text-muted")} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 text-[13px] leading-snug text-muted">{t.body}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="-m-1 rounded-md p-1 text-faint hover:bg-surface hover:text-ink"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}
