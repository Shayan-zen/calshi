import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import type { MarketSummary, Side } from "../../shared/types";
import { api } from "../api";
import { qk, useEvents, useInvalidateTrading } from "../hooks/queries";
import RequireAuth from "../components/RequireAuth";
import CreateEventForm from "../components/admin/CreateEventForm";
import { useToast } from "../components/Toast";
import { ErrorState, PageTitle, Skeleton, Spinner } from "../components/ui";
import { Table, Td, Th } from "../components/Table";
import { compactNumber, pct, shortDate } from "../lib/format";

type Pending = { ticker: string; kind: "close" | "yes" | "no" } | null;

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
            <div key={k} className="rounded-xl border border-line p-4">
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
    onError: (e) => toast.error("Action failed", e instanceof Error ? e.message : String(e)),
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
        <button
          onClick={() => action.mutate(mine.kind === "close" ? "close" : mine.kind)}
          disabled={action.isPending}
          className="inline-flex items-center gap-1 rounded-md bg-ink px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
        >
          {action.isPending && <Spinner className="size-3 text-white" />}
          Confirm
        </button>
        <button onClick={() => setPending(null)} className="rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface">
          Back
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap justify-end gap-1.5">
      {market.status === "open" && (
        <button
          onClick={() => setPending({ ticker: market.ticker, kind: "close" })}
          className="rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:bg-surface"
        >
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

function EventsAdminTable() {
  const [filter, setFilter] = useState("");
  const events = useEvents({ status: "all", sort: "new", limit: 200, q: filter || undefined }, { refetchInterval: 10_000 });
  const [pending, setPending] = useState<Pending>(null);
  const list = events.data?.events ?? [];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">All events</h2>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter"
          className="h-9 w-56 rounded-lg border border-line px-3 text-sm focus:border-ink-2/40 focus:outline-none"
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
            {list.map((ev) =>
              ev.markets.map((m, i) => (
                <tr key={m.ticker} className={clsx(i === 0 && "border-t-2 border-line")}>
                  <Td>
                    {i === 0 && (
                      <Link to={`/events/${ev.slug}`} className="mb-0.5 block max-w-sm truncate text-xs font-semibold text-muted hover:underline">
                        {ev.icon} {ev.title}
                      </Link>
                    )}
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
            )}
            {list.length === 0 && (
              <tr>
                <Td className="py-8 text-center text-muted">No events</Td>
              </tr>
            )}
          </tbody>
        </Table>
      )}
    </section>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth admin>
      <PageTitle sub="Create markets, close trading and settle outcomes.">Admin</PageTitle>
      <div className="space-y-8">
        <Stats />
        <CreateEventForm />
        <EventsAdminTable />
      </div>
    </RequireAuth>
  );
}
