import { useDeferredValue, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import type { AdminUser, EventSummary, MarketSummary, Side } from "../../shared/types";
import { api } from "../api";
import { qk, useEvents, useInvalidateTrading } from "../hooks/queries";
import RequireAuth from "../components/RequireAuth";
import CreateEventForm from "../components/admin/CreateEventForm";
import { useToast } from "../components/Toast";
import { ErrorState, PageTitle, Skeleton, Spinner } from "../components/ui";
import { Table, Td, Th } from "../components/Table";
import { compactNumber, money, pct, relTime, shortDate } from "../lib/format";

type Pending = { ticker: string; kind: "close" | "yes" | "no" } | null;
type Panel = { slug: string; kind: "edit" | "add" | "resolve" | "delete" } | null;

const TABS = [
  ["events", "Events"],
  ["create", "Create"],
  ["users", "Users"],
  ["comments", "Comments"],
  ["admins", "Admins"],
] as const;
type Tab = (typeof TABS)[number][0];

const input =
  "field h-9 w-full rounded-lg px-3 text-sm";
const btnGhost = "rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface";
const btnInk = "inline-flex items-center gap-1 rounded-md bg-ink px-2.5 py-1 text-xs font-semibold text-on-ink disabled:opacity-50";
const btnBack = "rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Stats() {
  const stats = useQuery({ queryKey: qk.adminStats, queryFn: api.adminStats, refetchInterval: 15_000 });
  const items: Array<[string, string]> = stats.data
    ? [
        ["Users", stats.data.users.toLocaleString()],
        ["Trades", stats.data.trades.toLocaleString()],
        ["Volume", `$${compactNumber(stats.data.volume)}`],
        ["Open markets", stats.data.openMarkets.toLocaleString()],
      ]
    : [];
  if (stats.isError) return <ErrorState error={stats.error} className="py-4" />;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.isLoading
        ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)
        : items.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-card p-4 shadow-card">
              <div className="text-[13px] text-muted">{k}</div>
              <div className="tnum mt-1 text-2xl font-bold">{v}</div>
            </div>
          ))}
    </div>
  );
}

function MarketActions({ market, pending, setPending }: { market: MarketSummary; pending: Pending; setPending: (p: Pending) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const invalidate = useInvalidateTrading();
  const action = useMutation({
    mutationFn: (kind: "close" | Side) => (kind === "close" ? api.adminClose(market.ticker) : api.adminResolve(market.ticker, kind)),
    onSuccess: (res, kind) => {
      toast.success(kind === "close" ? "Market closed" : `Resolved ${kind === "yes" ? "Yes" : "No"}`, res.market.title);
      setPending(null);
      invalidate();
      void qc.invalidateQueries({ queryKey: ["adminStats"] });
    },
    onError: (e) => toast.error("Action failed", errMsg(e)),
  });

  if (market.status === "settled") {
    return (
      <span className={clsx("text-xs font-semibold", market.result === "yes" ? "text-yes-strong" : "text-no-strong")}>
        Settled {market.result === "yes" ? "Yes" : "No"}
      </span>
    );
  }

  const mine = pending?.ticker === market.ticker ? pending : null;
  if (mine) {
    const text =
      mine.kind === "close"
        ? "Stop trading and refund open orders?"
        : `Pay out ${mine.kind === "yes" ? "Yes" : "No"} holders? This can't be undone.`;
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
        <span className="text-xs text-ink-2">{text}</span>
        <button onClick={() => action.mutate(mine.kind === "close" ? "close" : mine.kind)} disabled={action.isPending} className={btnInk}>
          {action.isPending && <Spinner className="size-3 text-on-ink" />}
          Confirm
        </button>
        <button onClick={() => setPending(null)} className={btnBack}>
          Back
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap justify-end gap-1.5">
      {market.status === "open" && (
        <button onClick={() => setPending({ ticker: market.ticker, kind: "close" })} className={btnGhost}>
          Close
        </button>
      )}
      <button
        onClick={() => setPending({ ticker: market.ticker, kind: "yes" })}
        className="rounded-md bg-yes-tint px-2.5 py-1 text-xs font-semibold text-yes-strong hover:bg-yes-tint-2"
      >
        Resolve Yes
      </button>
      <button
        onClick={() => setPending({ ticker: market.ticker, kind: "no" })}
        className="rounded-md bg-no-tint px-2.5 py-1 text-xs font-semibold text-no-strong hover:bg-no-tint-2"
      >
        Resolve No
      </button>
    </span>
  );
}

/** Invalidate everything an event-level admin action can touch. */
function useInvalidateAdmin() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTrading();
  return () => {
    invalidate();
    for (const key of ["adminStats", "adminUsers", "adminComments", "categories", "comments"]) void qc.invalidateQueries({ queryKey: [key] });
  };
}

function EventActions({ ev, panel, setPanel }: { ev: EventSummary; panel: Panel; setPanel: (p: Panel) => void }) {
  const toast = useToast();
  const invalidate = useInvalidateAdmin();
  const del = useMutation({
    mutationFn: () => api.adminDeleteEvent(ev.slug),
    onSuccess: () => {
      toast.success("Event voided", ev.title);
      setPanel(null);
      invalidate();
    },
    onError: (e) => toast.error("Delete failed", errMsg(e)),
  });
  const mine = panel?.slug === ev.slug ? panel.kind : null;
  const unsettled = ev.markets.some((m) => m.status !== "settled");

  if (mine === "delete") {
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
        <span className="text-xs text-ink-2">Void event? Refunds orders and positions at cost, then deletes it.</span>
        <button onClick={() => del.mutate()} disabled={del.isPending} className="inline-flex items-center gap-1 rounded-md bg-down px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">
          {del.isPending && <Spinner className="size-3 text-white" />}
          Delete
        </button>
        <button onClick={() => setPanel(null)} className={btnBack}>
          Back
        </button>
      </span>
    );
  }

  const toggle = (kind: NonNullable<Panel>["kind"]) => setPanel(mine === kind ? null : { slug: ev.slug, kind });
  const tab = (kind: NonNullable<Panel>["kind"]) => clsx(btnGhost, mine === kind && "bg-surface");
  return (
    <span className="inline-flex flex-wrap justify-end gap-1.5">
      <button onClick={() => toggle("edit")} className={tab("edit")}>
        Edit
      </button>
      <button onClick={() => toggle("add")} className={tab("add")}>
        Add outcome
      </button>
      {ev.mutuallyExclusive && unsettled && ev.markets.length > 1 && (
        <button onClick={() => toggle("resolve")} className={tab("resolve")}>
          Resolve winner
        </button>
      )}
      <button onClick={() => setPanel({ slug: ev.slug, kind: "delete" })} className="rounded-md px-2.5 py-1 text-xs font-medium text-down hover:bg-down-tint">
        Delete
      </button>
    </span>
  );
}

function EditEventPanel({ slug, onClose }: { slug: string; onClose: () => void }) {
  // No polling: the form keeps its own state once loaded.
  const ev = useQuery({ queryKey: qk.event(slug), queryFn: () => api.event(slug) });
  if (ev.isLoading) return <Skeleton className="h-64" />;
  if (ev.isError || !ev.data) return <ErrorState error={ev.error} onRetry={() => ev.refetch()} className="py-6" />;
  return <CreateEventForm event={ev.data} onDone={onClose} onCancel={onClose} />;
}

function AddOutcomePanel({ ev, onClose }: { ev: EventSummary; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateAdmin();
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [price, setPrice] = useState(String(Math.max(1, Math.round(100 / (ev.markets.length + 1)))));
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => api.adminAddMarket(ev.slug, { title: title.trim(), subtitle: subtitle.trim() || null, initialPrice: parseInt(price, 10) }),
    onSuccess: () => {
      toast.success("Outcome added", title.trim());
      invalidate();
      onClose();
    },
    onError: (e) => setError(errMsg(e)),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const p = parseInt(price, 10);
    if (!title.trim()) return setError("Name the outcome.");
    if (!Number.isInteger(p) || p < 1 || p > 99) return setError("Starting price must be 1 to 99.");
    add.mutate();
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-card p-4">
      <div className="text-sm font-semibold">Add outcome</div>
      <div className="flex flex-wrap items-center gap-2">
        <input className={clsx(input, "min-w-40 flex-1")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Outcome name" aria-label="Outcome name" />
        <input className={clsx(input, "min-w-40 flex-1")} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtitle (optional)" aria-label="Subtitle" />
        <div className="relative w-24 shrink-0">
          <input
            className={clsx(input, "tnum pr-6 text-right")}
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 2))}
            aria-label="Starting price in cents"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">¢</span>
        </div>
        <button type="submit" disabled={add.isPending} className={clsx(btnInk, "h-9 px-4")}>
          {add.isPending && <Spinner className="size-3 text-on-ink" />}
          Add
        </button>
        <button type="button" onClick={onClose} className={clsx(btnBack, "h-9")}>
          Cancel
        </button>
      </div>
      {error && <p className="rounded-lg bg-down-tint px-3 py-2 text-sm text-down">{error}</p>}
    </form>
  );
}

function ResolveWinnerPanel({ ev, onClose }: { ev: EventSummary; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateAdmin();
  const [winner, setWinner] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const resolve = useMutation({
    mutationFn: () => api.adminResolveEvent(ev.slug, winner!),
    onSuccess: () => {
      toast.success("Event resolved", ev.markets.find((m) => m.ticker === winner)?.title);
      invalidate();
      onClose();
    },
    onError: (e) => {
      setConfirming(false);
      toast.error("Resolve failed", errMsg(e));
    },
  });
  const winnerTitle = ev.markets.find((m) => m.ticker === winner)?.title;
  return (
    <div className="space-y-3 rounded-xl border border-line bg-card p-4">
      <div className="text-sm font-semibold">Pick the winning outcome</div>
      <p className="text-xs text-muted">The winner resolves Yes; every other unsettled outcome resolves No.</p>
      <div className="flex flex-wrap gap-1.5">
        {ev.markets.map((m) => (
          <button
            key={m.ticker}
            type="button"
            disabled={m.status === "settled"}
            onClick={() => {
              setWinner(m.ticker);
              setConfirming(false);
            }}
            className={clsx(
              "rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-40",
              winner === m.ticker ? "border-yes bg-yes-tint text-yes-strong" : "border-line hover:bg-surface",
            )}
          >
            {m.title} <span className="tnum text-xs text-muted">{pct(m.yesPrice)}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {confirming && winnerTitle ? (
          <>
            <span className="text-xs text-ink-2">Settle “{winnerTitle}” as the winner? This can't be undone.</span>
            <button onClick={() => resolve.mutate()} disabled={resolve.isPending} className={btnInk}>
              {resolve.isPending && <Spinner className="size-3 text-on-ink" />}
              Confirm
            </button>
            <button onClick={() => setConfirming(false)} className={btnBack}>
              Back
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setConfirming(true)} disabled={!winner} className={btnInk}>
              Resolve
            </button>
            <button onClick={onClose} className={btnBack}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function EventsAdminTable() {
  const [filter, setFilter] = useState("");
  const events = useEvents({ status: "all", sort: "new", limit: 200, q: filter || undefined }, { refetchInterval: 10_000 });
  const [pending, setPending] = useState<Pending>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const list = events.data?.events ?? [];
  const close = () => setPanel(null);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">All events</h2>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter"
          className="field h-9 w-full rounded-lg px-3 text-sm sm:w-56"
        />
      </div>
      {events.isLoading ? (
        <Skeleton className="h-64" />
      ) : events.isError ? (
        <ErrorState error={events.error} onRetry={() => events.refetch()} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Event / market</Th>
              <Th>Status</Th>
              <Th right>Chance</Th>
              <Th right>Volume</Th>
              <Th right>Closes</Th>
              <Th right>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((ev) => {
              const open = panel?.slug === ev.slug && panel.kind !== "delete" ? panel.kind : null;
              return [
                <tr key={`${ev.slug}:head`} className="border-t-2 border-line bg-surface/40">
                  <Td colSpan={5}>
                    <Link to={`/events/${ev.slug}`} className="block max-w-xl truncate font-semibold hover:underline">
                      {ev.icon} {ev.title}
                    </Link>
                    <span className="text-[11px] text-faint">
                      {ev.category} · {ev.markets.length} outcome{ev.markets.length === 1 ? "" : "s"}
                      {ev.mutuallyExclusive && " · mutually exclusive"} · closes {shortDate(ev.closeTime)}
                    </span>
                  </Td>
                  <Td right>
                    <EventActions ev={ev} panel={panel} setPanel={setPanel} />
                  </Td>
                </tr>,
                open && (
                  <tr key={`${ev.slug}:panel`}>
                    <Td colSpan={6} className="bg-surface/40">
                      {open === "edit" && <EditEventPanel slug={ev.slug} onClose={close} />}
                      {open === "add" && <AddOutcomePanel ev={ev} onClose={close} />}
                      {open === "resolve" && <ResolveWinnerPanel ev={ev} onClose={close} />}
                    </Td>
                  </tr>
                ),
                ...ev.markets.map((m) => (
                  <tr key={m.ticker}>
                    <Td>
                      <span className="block max-w-sm truncate font-medium">{m.title}</span>
                      <span className="block text-[11px] text-faint">{m.ticker}</span>
                    </Td>
                    <Td>
                      <span
                        className={clsx(
                          "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                          m.status === "open" ? "bg-yes-tint text-yes-strong" : m.status === "closed" ? "bg-surface text-ink-2" : "bg-no-tint text-no-strong",
                        )}
                      >
                        {m.status === "open" ? "Open" : m.status === "closed" ? "Closed" : "Settled"}
                      </span>
                    </Td>
                    <Td right>{pct(m.yesPrice)}</Td>
                    <Td right>${compactNumber(m.volume)}</Td>
                    <Td right className="text-muted">{shortDate(m.closeTime)}</Td>
                    <Td right>
                      <MarketActions market={m} pending={pending} setPending={setPending} />
                    </Td>
                  </tr>
                )),
              ];
            })}
            {list.length === 0 && (
              <tr>
                <Td colSpan={6} className="py-8 text-center text-muted">No events</Td>
              </tr>
            )}
          </tbody>
        </Table>
      )}
    </section>
  );
}

function CreditForm({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [dollars, setDollars] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const credit = useMutation({
    mutationFn: (amount: number) => api.adminCredit(user.id, { amount, reason: reason.trim() || undefined }),
    onSuccess: (res, amount) => {
      toast.success(amount > 0 ? "Credited" : "Debited", `${res.user.name}: ${money(amount, { sign: true })}`);
      for (const key of ["adminUsers", "leaderboard", "me", "portfolio"]) void qc.invalidateQueries({ queryKey: [key] });
      onClose();
    },
    onError: (e) => setError(errMsg(e)),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amount = Math.round(parseFloat(dollars) * 100);
    if (!Number.isFinite(amount) || amount === 0) return setError("Enter a non-zero dollar amount (negative removes).");
    if (user.balance + amount < 0) return setError(`Can remove at most ${money(user.balance)}.`);
    credit.mutate(amount);
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <div className="relative w-36 shrink-0">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
        <input
          autoFocus
          className={clsx(input, "tnum pl-6")}
          inputMode="decimal"
          value={dollars}
          onChange={(e) => setDollars(e.target.value.replace(/[^\d.-]/g, "").slice(0, 12))}
          placeholder="100.00 or -50"
          aria-label="Amount in dollars"
        />
      </div>
      <input className={clsx(input, "min-w-40 flex-1")} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" maxLength={200} aria-label="Reason" />
      <button type="submit" disabled={credit.isPending} className={clsx(btnInk, "h-9 px-4")}>
        {credit.isPending && <Spinner className="size-3 text-on-ink" />}
        Apply
      </button>
      <button type="button" onClick={onClose} className={clsx(btnBack, "h-9")}>
        Cancel
      </button>
      {error && <p className="w-full rounded-lg bg-down-tint px-3 py-2 text-sm text-down">{error}</p>}
    </form>
  );
}

function UsersTab() {
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.trim());
  const users = useQuery({ queryKey: qk.adminUsers(dq), queryFn: () => api.adminUsers(dq || undefined), refetchInterval: 30_000 });
  const [crediting, setCrediting] = useState<string | null>(null);
  const list = users.data?.users ?? [];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Users</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email"
          className="field h-9 w-full rounded-lg px-3 text-sm sm:w-64"
        />
      </div>
      {users.isLoading ? (
        <Skeleton className="h-64" />
      ) : users.isError ? (
        <ErrorState error={users.error} onRetry={() => users.refetch()} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>User</Th>
              <Th right>Balance</Th>
              <Th right>Total value</Th>
              <Th right>Volume</Th>
              <Th right>Joined</Th>
              <Th right>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => [
              <tr key={u.id}>
                <Td>
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="max-w-xs truncate">{u.name}</span>
                    {u.isAdmin && <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">ADMIN</span>}
                  </span>
                  <span className="block max-w-xs truncate text-[11px] text-faint">{u.email}</span>
                </Td>
                <Td right>{money(u.balance)}</Td>
                <Td right>{money(u.totalValue)}</Td>
                <Td right>${compactNumber(u.volume)}</Td>
                <Td right className="text-muted">{shortDate(u.createdAt)}</Td>
                <Td right>
                  <button onClick={() => setCrediting(crediting === u.id ? null : u.id)} className={clsx(btnGhost, crediting === u.id && "bg-surface")}>
                    Credit
                  </button>
                </Td>
              </tr>,
              crediting === u.id && (
                <tr key={`${u.id}:credit`}>
                  <Td colSpan={6} className="bg-surface/40">
                    <CreditForm user={u} onClose={() => setCrediting(null)} />
                  </Td>
                </tr>
              ),
            ])}
            {list.length === 0 && (
              <tr>
                <Td colSpan={6} className="py-8 text-center text-muted">No users</Td>
              </tr>
            )}
          </tbody>
        </Table>
      )}
    </section>
  );
}

function CommentsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const comments = useQuery({ queryKey: qk.adminComments, queryFn: api.adminComments, refetchInterval: 30_000 });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteComment(id),
    onSuccess: () => {
      toast.success("Comment deleted");
      void qc.invalidateQueries({ queryKey: ["adminComments"] });
      void qc.invalidateQueries({ queryKey: ["comments"] });
      void qc.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e) => toast.error("Delete failed", errMsg(e)),
  });
  const list = comments.data?.comments ?? [];

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Recent comments</h2>
      {comments.isLoading ? (
        <Skeleton className="h-64" />
      ) : comments.isError ? (
        <ErrorState error={comments.error} onRetry={() => comments.refetch()} />
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-line bg-card py-8 text-center text-sm text-muted">No comments yet</p>
      ) : (
        <ul className="divide-y divide-line-2 rounded-xl border border-line bg-card">
          {list.map((cm) => (
            <li key={cm.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
                  <span className="font-semibold text-ink">{cm.userName}</span>
                  <span>on</span>
                  <Link to={`/events/${cm.eventSlug}`} className="max-w-sm truncate font-medium text-ink-2 hover:underline">
                    {cm.eventTitle}
                  </Link>
                  <span>· {relTime(cm.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{cm.body}</p>
              </div>
              <button
                onClick={() => del.mutate(cm.id)}
                disabled={del.isPending && del.variables === cm.id}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-down hover:bg-down-tint disabled:opacity-50"
              >
                {del.isPending && del.variables === cm.id && <Spinner className="size-3" />}
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AdminsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const admins = useQuery({ queryKey: ["adminAdmins"], queryFn: api.adminAdmins });
  const [email, setEmail] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const onDone = (data: { admins: unknown }) => {
    qc.setQueryData(["adminAdmins"], data);
    void qc.invalidateQueries({ queryKey: ["adminUsers"] });
  };
  const add = useMutation({
    mutationFn: (e: string) => api.adminAddAdmin(e),
    onSuccess: (data, e) => {
      onDone(data);
      setEmail("");
      toast.success("Admin added", e);
    },
    onError: (e) => toast.error("Couldn't add admin", errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: (e: string) => api.adminRemoveAdmin(e),
    onSuccess: (data, e) => {
      onDone(data);
      setConfirming(null);
      toast.success("Admin removed", e);
    },
    onError: (e) => toast.error("Couldn't remove admin", errMsg(e)),
  });
  const list = admins.data?.admins ?? [];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Admins</h2>
        <p className="text-sm text-muted">Admins can create, edit, resolve and delete markets, credit users and add or remove other admins.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = email.trim();
          if (v) add.mutate(v);
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="f2025xxxx@pilani.bits-pilani.ac.in"
          className="field h-9 w-full rounded-lg px-3 text-sm sm:w-80"
        />
        <button type="submit" disabled={add.isPending || !email.trim()} className={clsx(btnInk, "h-9 px-4 text-sm")}>
          {add.isPending && <Spinner className="size-3" />}
          Add admin
        </button>
      </form>
      {admins.isLoading ? (
        <Skeleton className="h-40" />
      ) : admins.isError ? (
        <ErrorState error={admins.error} onRetry={() => admins.refetch()} />
      ) : (
        <ul className="divide-y divide-line-2 rounded-xl border border-line bg-card">
          {list.map((a) => (
            <li key={a.email} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{a.name ?? a.email}</span>
                  {a.source === "owner" && (
                    <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">OWNER</span>
                  )}
                  {!a.name && <span className="text-[11px] text-faint">hasn't signed in yet</span>}
                </div>
                <span className="block truncate text-[11px] text-faint">
                  {a.email}
                  {a.addedBy && ` · added by ${a.addedBy}`}
                  {a.createdAt && ` · ${relTime(a.createdAt)}`}
                </span>
              </div>
              {a.source === "added" &&
                (confirming === a.email ? (
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => remove.mutate(a.email)}
                      disabled={remove.isPending}
                      className="inline-flex items-center gap-1 rounded-md bg-down px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {remove.isPending && <Spinner className="size-3" />}
                      Confirm remove
                    </button>
                    <button onClick={() => setConfirming(null)} className={btnBack}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button onClick={() => setConfirming(a.email)} className="rounded-md px-2.5 py-1 text-xs font-medium text-down hover:bg-down-tint">
                    Remove
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.some(([k]) => k === raw) ? (raw as Tab) : "events";

  return (
    <RequireAuth admin>
      <PageTitle sub="Create markets, close trading, settle outcomes and manage users.">Admin</PageTitle>
      <div className="space-y-6">
        <Stats />
        <div role="tablist" className="flex gap-1 border-b border-line">
          {TABS.map(([k, name]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setParams(k === "events" ? {} : { tab: k }, { replace: true })}
              className={clsx(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                tab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {name}
            </button>
          ))}
        </div>
        {tab === "events" && <EventsAdminTable />}
        {tab === "create" && <CreateEventForm />}
        {tab === "users" && <UsersTab />}
        {tab === "comments" && <CommentsTab />}
        {tab === "admins" && <AdminsTab />}
      </div>
    </RequireAuth>
  );
}
