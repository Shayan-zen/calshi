import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Search, X } from "lucide-react";
import clsx from "clsx";
import { useEvents } from "../hooks/queries";
import EventIcon from "./EventIcon";
import { pct, volume } from "../lib/format";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function SearchBox() {
  const [params] = useSearchParams();
  const [text, setText] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = useDebounced(text.trim(), 200);
  const results = useEvents({ q, status: "all", limit: 6 }, { enabled: open && q.length > 0, refetchInterval: 0 });
  const events = q ? (results.data?.events ?? []) : [];

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => setActive(-1), [q]);

  const go = (path: string) => {
    setOpen(false);
    inputRef.current?.blur();
    navigate(path);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(events.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && events[active]) go(`/events/${events[active].slug}`);
      else if (text.trim()) go(`/?q=${encodeURIComponent(text.trim())}`);
      else go("/");
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown = open && q.length > 0;

  return (
    <div ref={wrapRef} className="relative mx-auto w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        type="search"
        placeholder="Search markets"
        aria-label="Search markets"
        className="h-10 w-full rounded-full border border-line bg-surface pl-9 pr-9 text-sm text-ink placeholder:text-faint focus:border-ink-2/40 focus:bg-white focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          onClick={() => {
            setText("");
            inputRef.current?.focus();
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-faint hover:text-ink"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
      {showDropdown && (
        <div className="absolute inset-x-0 top-12 z-50 animate-fade-in overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          {results.isLoading ? (
            <div className="px-4 py-3 text-sm text-muted">Searching…</div>
          ) : events.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted">No markets match "{q}"</div>
          ) : (
            <ul className="py-1">
              {events.map((ev, i) => (
                <li key={ev.slug}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(`/events/${ev.slug}`)}
                    className={clsx(
                      "flex w-full items-center gap-3 px-3 py-2 text-left",
                      active === i ? "bg-surface" : "hover:bg-surface",
                    )}
                  >
                    <EventIcon slug={ev.slug} icon={ev.icon} imageUrl={ev.imageUrl} category={ev.category} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{ev.title}</span>
                      <span className="block text-xs text-muted">
                        {ev.category} <span className="text-faint">/</span> {volume(ev.volume)} vol
                      </span>
                    </span>
                    {ev.markets[0] && (
                      <span className="tnum text-sm font-semibold text-ink">{pct(ev.markets[0].yesPrice)}</span>
                    )}
                  </button>
                </li>
              ))}
              <li className="border-t border-line-2">
                <button
                  onClick={() => go(`/?q=${encodeURIComponent(q)}`)}
                  className="w-full px-3 py-2 text-left text-sm font-medium text-ink-2 hover:bg-surface"
                >
                  See all results for "{q}"
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
