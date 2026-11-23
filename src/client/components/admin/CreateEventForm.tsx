import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import type { CreateEventRequest } from "../../../shared/types";
import { api } from "../../api";
import { useCategories } from "../../hooks/queries";
import { useToast } from "../Toast";
import { Spinner } from "../ui";

interface OutcomeDraft {
  title: string;
  initialPrice: string;
}

const input =
  "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm placeholder:text-faint focus:border-ink-2/40 focus:outline-none";
const label = "mb-1.5 block text-sm font-medium text-ink-2";

function defaultClose(): string {
  const d = new Date(Date.now() + 14 * 86400000);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateEventForm() {
  const cats = useCategories();
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Campus");
  const [icon, setIcon] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [close, setClose] = useState(defaultClose);
  const [exclusive, setExclusive] = useState(false);
  const [outcomes, setOutcomes] = useState<OutcomeDraft[]>([{ title: "", initialPrice: "50" }]);
  const [created, setCreated] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const catNames = Array.from(
    new Set([...(cats.data?.map((c) => c.name) ?? []), "Campus", "Politics", "Sports", "Economics", "Crypto", "Tech", "Culture", "Climate"]),
  );

  const create = useMutation({
    mutationFn: (req: CreateEventRequest) => api.adminCreateEvent(req),
    onSuccess: (res) => {
      toast.success("Event created", res.event.title);
      setCreated(res.event.slug);
      setTitle("");
      setDescription("");
      setRules("");
      setIcon("");
      setOutcomes([{ title: "", initialPrice: "50" }]);
      void qc.invalidateQueries({ queryKey: ["events"] });
      void qc.invalidateQueries({ queryKey: ["categories"] });
      void qc.invalidateQueries({ queryKey: ["adminStats"] });
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : String(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCreated(null);
    const closeTime = new Date(close).getTime();
    if (!title.trim()) return setFormError("Add a title.");
    if (!category.trim()) return setFormError("Pick a category.");
    if (!Number.isFinite(closeTime) || closeTime <= Date.now()) return setFormError("Close time must be in the future.");
    const markets = outcomes.map((o) => ({ title: o.title.trim(), initialPrice: parseInt(o.initialPrice, 10) }));
    if (markets.length === 1 && !markets[0].title) markets[0].title = title.trim();
    if (markets.some((m) => !m.title)) return setFormError("Every outcome needs a name.");
    if (markets.some((m) => !Number.isInteger(m.initialPrice) || m.initialPrice < 1 || m.initialPrice > 99))
      return setFormError("Initial prices must be whole numbers from 1 to 99.");
    create.mutate({
      title: title.trim(),
      category: category.trim(),
      description: description.trim(),
      rules: rules.trim(),
      icon: icon.trim() || null,
      imageUrl: null,
      closeTime,
      mutuallyExclusive: exclusive && markets.length > 1,
      markets,
    });
  };

  const setOutcome = (i: number, patch: Partial<OutcomeDraft>) =>
    setOutcomes((xs) => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-line p-5">
      <h2 className="text-lg font-semibold">Create event</h2>
      <div className="grid gap-4 sm:grid-cols-[1fr_180px_90px]">
        <div>
          <label className={label} htmlFor="ce-title">Question</label>
          <input id="ce-title" className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Who will headline APOGEE 2027?" />
        </div>
        <div>
          <label className={label} htmlFor="ce-cat">Category</label>
          <input id="ce-cat" className={input} list="ce-cats" value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="ce-cats">
            {catNames.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={label} htmlFor="ce-icon">Icon</label>
          <input id="ce-icon" className={clsx(input, "text-center text-lg")} value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🎤" maxLength={8} />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="ce-desc">Description</label>
        <textarea id="ce-desc" rows={2} className={clsx(input, "h-auto py-2")} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className={label} htmlFor="ce-rules">Resolution rules</label>
        <textarea
          id="ce-rules"
          rows={3}
          className={clsx(input, "h-auto py-2")}
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          placeholder="Resolves Yes if… Source: …"
        />
      </div>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <label className={label} htmlFor="ce-close">Closes</label>
          <input id="ce-close" type="datetime-local" className={input} value={close} onChange={(e) => setClose(e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 pb-2 text-sm">
          <button
            type="button"
            role="switch"
            aria-checked={exclusive}
            onClick={() => setExclusive((x) => !x)}
            className={clsx("relative h-6 w-10 rounded-full transition-colors", exclusive ? "bg-yes" : "bg-line")}
          >
            <span className={clsx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", exclusive ? "left-[18px]" : "left-0.5")} />
          </button>
          Mutually exclusive (only one outcome can win)
        </label>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-ink-2">Outcomes</span>
          <span className="text-xs text-muted">One outcome makes a simple Yes/No market</span>
        </div>
        <ul className="space-y-2">
          {outcomes.map((o, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                className={input}
                value={o.title}
                onChange={(e) => setOutcome(i, { title: e.target.value })}
                placeholder={outcomes.length === 1 ? "Outcome name (defaults to the question)" : `Outcome ${i + 1}`}
                aria-label={`Outcome ${i + 1} name`}
              />
              <div className="relative w-24 shrink-0">
                <input
                  className={clsx(input, "tnum pr-6 text-right")}
                  inputMode="numeric"
                  value={o.initialPrice}
                  onChange={(e) => setOutcome(i, { initialPrice: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                  aria-label={`Outcome ${i + 1} starting price in cents`}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">¢</span>
              </div>
              <button
                type="button"
                onClick={() => setOutcomes((xs) => xs.filter((_, k) => k !== i))}
                disabled={outcomes.length === 1}
                aria-label="Remove outcome"
                className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface hover:text-down disabled:opacity-30"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setOutcomes((xs) => [...xs, { title: "", initialPrice: String(Math.max(1, Math.round(100 / (xs.length + 1)))) }])}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface"
        >
          <Plus className="size-4" /> Add outcome
        </button>
      </div>

      {formError && <p className="rounded-lg bg-down-tint px-3 py-2 text-sm text-down">{formError}</p>}
      {created && (
        <p className="rounded-lg bg-yes-tint px-3 py-2 text-sm text-yes-strong">
          Created.{" "}
          <Link to={`/events/${created}`} className="font-semibold underline">
            Open the event
          </Link>
        </p>
      )}
      <button
        type="submit"
        disabled={create.isPending}
        className="flex h-11 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-white hover:bg-ink-2 disabled:opacity-50"
      >
        {create.isPending && <Spinner className="text-white" />}
        Create event
      </button>
    </form>
  );
}
