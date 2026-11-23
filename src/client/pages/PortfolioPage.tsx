import { Link } from "react-router";
import clsx from "clsx";
import { Briefcase, History, ListOrdered } from "lucide-react";
import RequireAuth from "../components/RequireAuth";
import { useOrders, usePortfolio } from "../hooks/queries";
import { EmptyState, ErrorState, PageTitle, Pnl, SideBadge, Skeleton } from "../components/ui";
import { Table, Td, Th } from "../components/Table";
import OrdersTable from "../components/OrdersTable";
import { cents, money, shortDate } from "../lib/format";
import { STARTING_BALANCE } from "../../shared/types";

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "up" | "down" }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4 shadow-card">
      <div className="text-[13px] text-muted">{label}</div>
      <div className={clsx("tnum mt-1 text-2xl font-bold tracking-tight", tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink")}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <span className="text-muted">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Portfolio() {
  const p = usePortfolio();
  const orders = useOrders("open");

  if (p.isLoading)
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  if (!p.data) return <ErrorState error={p.error} onRetry={() => p.refetch()} />;
  const d = p.data;
  const pnlPct = (d.allTimePnl / STARTING_BALANCE) * 100;
  const openOrders = orders.data?.orders.filter((o) => o.status === "open") ?? [];

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Portfolio value" value={money(d.totalValue)} sub="Cash, positions and open orders" />
        <StatCard label="Cash" value={money(d.balance)} sub={d.lockedInOrders > 0 ? `${money(d.lockedInOrders)} held in orders` : "Available to trade"} />
        <StatCard label="Positions" value={money(d.positionsValue)} sub={`${d.positions.length} open`} />
        <StatCard
          label="All-time P&L"
          value={money(d.allTimePnl, { sign: true })}
          tone={d.allTimePnl > 0 ? "up" : d.allTimePnl < 0 ? "down" : undefined}
          sub={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}% since you joined`}
        />
      </div>

      <Section title="Positions" icon={<Briefcase className="size-4" />}>
        {d.positions.length === 0 ? (
          <div className="rounded-xl border border-line bg-card">
            <EmptyState
              title="No open positions"
              body="Buy Yes or No on any market and it will show up here."
              action={
                <Link to="/" className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-on-ink hover:bg-ink-2">
                  Find a market
                </Link>
              }
            />
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Market</Th>
                <Th right>Contracts</Th>
                <Th right>Avg price</Th>
                <Th right>Current</Th>
                <Th right>Value</Th>
                <Th right>Return</Th>
              </tr>
            </thead>
            <tbody>
              {d.positions.map((pos) => (
                <tr key={pos.ticker} className="hover:bg-surface/50">
                  <Td>
                    <Link to={`/events/${pos.eventSlug}?market=${encodeURIComponent(pos.ticker)}&side=${pos.side}`} className="flex items-center gap-2.5 hover:underline">
                      <SideBadge side={pos.side} />
                      <span className="min-w-0 max-w-xs">
                        <span className="block truncate font-medium">{pos.marketTitle}</span>
                        {pos.marketTitle !== pos.eventTitle && <span className="block truncate text-xs text-muted">{pos.eventTitle}</span>}
                      </span>
                      {pos.marketStatus === "closed" && <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] text-muted">Closed</span>}
                    </Link>
                  </Td>
                  <Td right>{pos.qty.toLocaleString()}</Td>
                  <Td right>{cents(pos.avgPrice)}</Td>
                  <Td right>{cents(pos.markPrice)}</Td>
                  <Td right className="font-semibold">{money(pos.value)}</Td>
                  <Td right>
                    <Pnl cents={pos.pnl} />
                    {pos.costBasis > 0 && (
                      <span className={clsx("ml-1 text-xs", pos.pnl >= 0 ? "text-up" : "text-down")}>
                        ({pos.pnl >= 0 ? "+" : ""}
                        {((pos.pnl / pos.costBasis) * 100).toFixed(1)}%)
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title="Open orders" icon={<ListOrdered className="size-4" />}>
        {openOrders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">No resting orders</div>
        ) : (
          <OrdersTable orders={openOrders} />
        )}
      </Section>

      <Section title="Settled" icon={<History className="size-4" />}>
        {d.settled.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
            Positions in resolved markets will be listed here.
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Market</Th>
                <Th>Result</Th>
                <Th right>Contracts</Th>
                <Th right>Payout</Th>
                <Th right>P&L</Th>
                <Th right>Settled</Th>
              </tr>
            </thead>
            <tbody>
              {d.settled.map((s) => (
                <tr key={`${s.ticker}-${s.side}-${s.settledAt}`}>
                  <Td>
                    <Link to={`/events/${s.eventSlug}`} className="flex items-center gap-2.5 hover:underline">
                      <SideBadge side={s.side} />
                      <span className="block max-w-xs truncate font-medium">{s.marketTitle}</span>
                    </Link>
                  </Td>
                  <Td>
                    <span className={clsx("text-xs font-semibold", s.result === s.side ? "text-up" : "text-down")}>
                      {s.result === s.side ? "Won" : "Lost"}
                    </span>
                    <span className="ml-1.5 text-xs text-muted">resolved {s.result === "yes" ? "Yes" : "No"}</span>
                  </Td>
                  <Td right>{s.qty.toLocaleString()}</Td>
                  <Td right>{money(s.payout)}</Td>
                  <Td right>
                    <Pnl cents={s.pnl} />
                  </Td>
                  <Td right className="text-muted">
                    {shortDate(s.settledAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <RequireAuth>
      <PageTitle>Portfolio</PageTitle>
      <Portfolio />
    </RequireAuth>
  );
}
