import { useId, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import type { CreateEventRequest, EventDetail, UpdateEventRequest } from "../../../shared/types";
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

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultClose(): string {
  const d = new Date(Date.now() + 14 * 86400000);
  d.setMinutes(0, 0, 0);
  return toLocalInput(d.getTime());
}

/** Create a new event, or (with `event`) edit an existing event's details. Outcomes are only edited on create. */
export default function CreateEventForm({ event, onDone, onCancel }: { event?: EventDetail; onDone?: () => void; onCancel?: () => void }) {
  const editing = !!event;
  const id = useId();
  const cats = useCategories();
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(event?.title ?? "");
  const [category, setCategory] = useState(event?.category ?? "Campus");
  const [icon, setIcon] = useState(event?.icon ?? "");
  const [imageUrl, setImageUrl] = useState(event?.imageUrl ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [rules, setRules] = useState(event?.rules ?? "");
  const initialClose = event ? toLocalInput(event.closeTime) : null;
  const [close, setClose] = useState(() => initialClose ?? defaultClose());
  const [exclusive, setExclusive] = useState(event?.mutuallyExclusive ?? false);
  const [outcomes, setOutcomes] = useState<OutcomeDraft[]>([{ title: "", initialPrice: "50" }]);
  const [created, setCreated] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const catNames = Array.from(
    new Set([...(cats.data?.map((c) => c.name) ?? []), "Campus", "Politics", "Sports", "Economics", "Crypto", "Tech", "Culture", "Climate"]),
  );

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["events"] });
    void qc.invalidateQueries({ queryKey: ["event"] });
    void qc.invalidateQueries({ queryKey: ["market"] });
    void qc.invalidateQueries({ queryKey: ["categories"] });
    void qc.invalidateQueries({ queryKey: ["adminStats"] });
  };

  const create = useMutation({
    mutationFn: (req: CreateEventRequest) => api.adminCreateEvent(req),
    onSuccess: (res) => {
      toast.success("Event created", res.event.title);
      setCreated(res.event.slug);
      setTitle("");
      setDescription("");
      setRules("");
      setIcon("");
      setImageUrl("");
      setOutcomes([{ title: "", initialPrice: "50" }]);
      invalidate();
      onDone?.();
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : String(e)),
  });

  const update = useMutation({
    mutationFn: (req: UpdateEventRequest) => api.adminUpdateEvent(event!.slug, req),
    onSuccess: (res) => {
      toast.success("Event updated", res.event.title);
      invalidate();
      onDone?.();
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : String(e)),
  });
  const pending = create.isPending || update.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCreated(null);
    const closeTime = new Date(close).getTime();
    const closeChanged = close !== initialClose;
    if (!title.trim()) return setFormError("Add a title.");
    if (!category.trim()) return setFormError("Pick a category.");
    if (closeChanged && (!Number.isFinite(closeTime) || closeTime <= Date.now())) return setFormError("Close time must be in the future.");
    const img = imageUrl.trim() || null;

    if (editing) {
      update.mutate({
        title: title.trim(),
        category: category.trim(),
        description: description.trim(),
        rules: rules.trim(),
        icon: icon.trim() || null,
        imageUrl: img,
        ...(closeChanged ? { closeTime } : {}),
        mutuallyExclusive: exclusive,
      });
      return;
    }

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
      imageUrl: img,
      closeTime,
      mutuallyExclusive: exclusive && markets.length > 1,
      markets,
    });
  };

  const setOutcome = (i: number, patch: Partial<OutcomeDraft>) =>
    setOutcomes((xs) => xs.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <form onSubmit={submit} className={clsx("space-y-4 rounded-xl border border-line p-5", editing && "bg-white")}>
      <h2 className="text-lg font-semibold">{editing ? "Edit event" : "Create event"}</h2>
      <div className="grid gap-4 sm:grid-cols-[1fr_180px_90px]">
        <div>
          <label className={label} htmlFor={`${id}-title`}>Question</label>
          <input id={`${id}-title`} className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Who will headline APOGEE 2027?" />
        </div>
        <div>
          <label className={label} htmlFor={`${id}-cat`}>Category</label>
          <input id={`${id}-cat`} className={input} list={`${id}-cats`} value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id={`${id}-cats`}>
            {catNames.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={label} htmlFor={`${id}-icon`}>Icon</label>
          <input id={`${id}-icon`} className={clsx(input, "text-center text-lg")} value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🎤" maxLength={8} />
        </div>
      </div>
      <div>
        <label className={label} htmlFor={`${id}-img`}>Image URL <span className="font-normal text-muted">(optional)</span></label>
        <input id={`${id}-img`} className={input} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div>
        <label className={label} htmlFor={`${id}-desc`}>Description</label>
        <textarea id={`${id}-desc`} rows={2} className={clsx(input, "h-auto py-2")} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <label className={label} htmlFor={`${id}-rules`}>Resolution rules</label>
        <textarea
          id={`${id}-rules`}
          rows={3}
          className={clsx(input, "h-auto py-2")}
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          placeholder="Resolves Yes if… Source: …"
        />
      </div>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <label className={label} htmlFor={`${id}-close`}>Closes</label>
          <input id={`${id}-close`} type="datetime-local" className={input} value={close} onChange={(e) => setClose(e.target.value)} />
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
      {editing && <p className="text-xs text-muted">Changing the close time also moves every open outcome. Add outcomes from the events table.</p>}

      {!editing && (
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
      )}

      {formError && <p className="rounded-lg bg-down-tint px-3 py-2 text-sm text-down">{formError}</p>}
      {created && (
        <p className="rounded-lg bg-yes-tint px-3 py-2 text-sm text-yes-strong">
          Created.{" "}
          <Link to={`/events/${created}`} className="font-semibold underline">
            Open the event
          </Link>
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex h-11 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-white hover:bg-ink-2 disabled:opacity-50"
        >
          {pending && <Spinner className="text-white" />}
          {editing ? "Save changes" : "Create event"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-11 rounded-lg px-4 text-sm font-medium text-muted hover:bg-surface">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
