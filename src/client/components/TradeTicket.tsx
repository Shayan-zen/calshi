import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, Minus, Plus, X } from "lucide-react";
import clsx from "clsx";
import type { Action, EventDetail, MarketSummary, OrderType, PlaceOrderRequest, Side } from "../../shared/types";
import { api } from "../api";
import { useInvalidateTrading, useOrderbook, useOrders, usePortfolio, useUser } from "../hooks/queries";
import { estimateByBudget, estimateByCount, takerLevels } from "../lib/book";
import { cents, clampPrice, money } from "../lib/format";
import { useToast } from "./Toast";
import { SideBadge, Spinner } from "./ui";

type AmountMode = "dollars" | "contracts";

function Row({ label, value, strong, className }: { label: string; value: React.ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={clsx("flex items-center justify-between text-sm", className)}>
      <span className="text-muted">{label}</span>
      <span className={clsx("tnum", strong ? "font-semibold text-ink" : "text-ink-2")}>{value}</span>
    </div>
  );
}

export default function TradeTicket({
  event,
  market,
  side,
  onSideChange,
  onClose,
}: {
  event: EventDetail;
  market: MarketSummary;
  side: Side;
  onSideChange: (s: Side) => void;
  onClose?: () => void;
}) {
  const { user } = useUser();
  const location = useLocation();
  const toast = useToast();
  const invalidate = useInvalidateTrading();
  const book = useOrderbook(market.ticker);
  const portfolio = usePortfolio(!!user);

  const [action, setAction] = useState<Action>("buy");
  const [type, setType] = useState<OrderType>("market");
  const [mode, setMode] = useState<AmountMode>("dollars");
  const [amountText, setAmountText] = useState("");
  const [limitPrice, setLimitPrice] = useState<number>(50);
  const [typeOpen, setTypeOpen] = useState(false);

  const position = portfolio.data?.positions.find((p) => p.ticker === market.ticker) ?? null;
  const single = event.markets.length === 1;

  // Selling: dollars mode makes little sense; default to the side the user holds.
  useEffect(() => {
    if (action === "sell") {
      setMode("contracts");
      if (position && position.side !== side) onSideChange(position.side);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  // Reset limit price to the current best price when the market/side changes.
  const yesCost = market.yesAsk ?? market.yesPrice;
  const noCost = market.yesBid !== null ? 100 - market.yesBid : market.noPrice;
  const yesSell = market.yesBid ?? market.yesPrice;
  const noSell = market.yesAsk !== null ? 100 - market.yesAsk : market.noPrice;
  const sidePrice = (s: Side) => (action === "buy" ? (s === "yes" ? yesCost : noCost) : s === "yes" ? yesSell : noSell);
  useEffect(() => {
    setLimitPrice(clampPrice(sidePrice(side)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market.ticker, side, action]);

  const amount = Number(amountText);
  const amountValid = amountText !== "" && Number.isFinite(amount) && amount > 0;

  const levels = useMemo(() => takerLevels(book.data, side, action), [book.data, side, action]);

  const est = useMemo(() => {
    if (!amountValid) return null;
    if (type === "limit") {
      const count = Math.floor(amount);
      const immediate = estimateByCount(levels, count, limitPrice, action);
      return { count, total: count * limitPrice, avgPrice: limitPrice, immediate: immediate.count, exhausted: false };
    }
    if (action === "buy" && mode === "dollars") {
      const r = estimateByBudget(levels, Math.round(amount * 100));
      return { ...r, immediate: r.count };
    }
    const r = estimateByCount(levels, Math.floor(amount), undefined, action);
    return { ...r, immediate: r.count };
  }, [amountValid, amount, type, levels, limitPrice, action, mode]);

  const count = est?.count ?? 0;
  const cost = est?.total ?? 0;
  const payout = count * 100;
  const balance = user?.balance ?? 0;
  const insufficientCash = !!user && action === "buy" && cost > balance;
  const heldOnSide = position && position.side === side ? position.qty : 0;
  const insufficientPosition = !!user && action === "sell" && count > heldOnSide;

  const mutation = useMutation({
    mutationFn: (req: PlaceOrderRequest) => api.placeOrder(req),
    onSuccess: (res) => {
      const filled = res.fills.reduce((s, f) => s + f.qty, 0);
      const verb = res.order.action === "buy" ? "Bought" : "Sold";
      const sideLabel = res.order.side === "yes" ? "Yes" : "No";
      const avg = res.avgPrice !== null ? cents(res.avgPrice) : "";
      const what = single ? sideLabel : `${sideLabel} on ${market.title}`;
      if (filled > 0) {
        const resting = res.order.status === "open" ? ` ${res.order.remaining} resting at ${res.order.price}¢.` : "";
        toast.success(`${verb} ${filled} ${what} @ ${avg}`, `Cash balance ${money(res.balance)}.${resting}`);
      } else if (res.order.status === "open") {
        toast.success(
          `Limit order placed`,
          `${res.order.action === "buy" ? "Buy" : "Sell"} ${res.order.count} ${what} at ${res.order.price}¢. It fills when someone matches it.`,
        );
      } else {
        toast.error("Order didn't fill", "There wasn't enough liquidity at an acceptable price. Try a limit order.");
      }
      setAmountText("");
      invalidate();
    },
    onError: (err) => toast.error("Order failed", err instanceof Error ? err.message : String(err)),
  });

  const submit = () => {
    if (!user || !est) return;
    const n = type === "limit" ? Math.floor(amount) : est.count;
    if (n < 1) return;
    mutation.mutate({
      ticker: market.ticker,
      side,
      action,
      type,
      count: n,
      ...(type === "limit" ? { price: limitPrice } : {}),
    });
  };

  const sideLabel = side === "yes" ? "Yes" : "No";
  const closed = market.status !== "open";
  const disabled =
    closed || !amountValid || count < 1 || insufficientCash || insufficientPosition || mutation.isPending;

  let submitLabel = `${action === "buy" ? "Buy" : "Sell"} ${sideLabel}`;
  if (closed) submitLabel = market.status === "settled" ? "Market settled" : "Trading closed";
  else if (insufficientCash) submitLabel = "Not enough cash";
  else if (insufficientPosition) submitLabel = heldOnSide ? `You hold ${heldOnSide} ${sideLabel}` : `You don't hold ${sideLabel}`;

  return (
    <div className="rounded-xl border border-line bg-white shadow-card">
      <div className="flex items-start gap-2 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-muted">{event.title}</div>
          <div className="mt-0.5 truncate text-base font-semibold">
            {single ? (
              <>
                {action === "buy" ? "Buy" : "Sell"} <span className={side === "yes" ? "text-yes-strong" : "text-no-strong"}>{sideLabel}</span>
              </>
            ) : (
              market.title
            )}
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="-m-1 rounded-md p-1 text-muted hover:bg-surface">
            <X className="size-5" />
          </button>
        )}
      </div>

      {/* Buy / Sell + order type */}
      <div className="mt-3 flex items-center justify-between border-b border-line px-4">
        <div className="flex gap-4">
          {(["buy", "sell"] as Action[]).map((a) => (
            <button
              key={a}
              onClick={() => setAction(a)}
              className={clsx(
                "-mb-px border-b-2 pb-2 text-sm font-semibold",
                action === a ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {a === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
        <div className="relative pb-1.5">
          <button
            onClick={() => setTypeOpen((o) => !o)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-ink-2 hover:bg-surface"
            aria-haspopup="listbox"
            aria-expanded={typeOpen}
          >
            {type === "market" ? "Market" : "Limit"}
            <ChevronDown className="size-3.5" />
          </button>
          {typeOpen && (
            <div role="listbox" className="absolute right-0 top-9 z-20 w-36 rounded-lg border border-line bg-white p-1 shadow-pop">
              {(["market", "limit"] as OrderType[]).map((t) => (
                <button
                  key={t}
                  role="option"
                  aria-selected={type === t}
                  onClick={() => {
                    setType(t);
                    setTypeOpen(false);
                    if (t === "limit") setMode("contracts");
                  }}
                  className={clsx("block w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface", type === t && "font-semibold")}
                >
                  {t === "market" ? "Market order" : "Limit order"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {/* Side toggle */}
        <div className="grid grid-cols-2 gap-2">
          {(["yes", "no"] as Side[]).map((s) => {
            const active = side === s;
            const p = sidePrice(s);
            return (
              <button
                key={s}
                onClick={() => onSideChange(s)}
                className={clsx(
                  "tnum rounded-lg py-3 text-[15px] font-semibold transition-colors",
                  s === "yes"
                    ? active
                      ? "bg-yes text-white"
                      : "bg-yes-tint text-yes-strong hover:bg-yes-tint-2"
                    : active
                      ? "bg-no text-white"
                      : "bg-no-tint text-no-strong hover:bg-no-tint-2",
                )}
              >
                {s === "yes" ? "Yes" : "No"} {p}¢
              </button>
            );
          })}
        </div>

        {/* Limit price */}
        {type === "limit" && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-2">Limit price</label>
            <div className="flex items-center rounded-lg border border-line">
              <button
                onClick={() => setLimitPrice((p) => clampPrice(p - 1))}
                className="grid size-11 place-items-center text-muted hover:text-ink"
                aria-label="Lower price by 1 cent"
              >
                <Minus className="size-4" />
              </button>
              <input
                inputMode="numeric"
                value={limitPrice}
                onChange={(e) => {
                  const v = parseInt(e.target.value.replace(/\D/g, ""), 10);
                  setLimitPrice(Number.isFinite(v) ? Math.min(99, Math.max(1, v)) : 1);
                }}
                className="tnum w-full min-w-0 bg-transparent text-center text-lg font-semibold focus:outline-none"
                aria-label="Limit price in cents"
              />
              <span className="pr-1 text-sm text-muted">¢</span>
              <button
                onClick={() => setLimitPrice((p) => clampPrice(p + 1))}
                className="grid size-11 place-items-center text-muted hover:text-ink"
                aria-label="Raise price by 1 cent"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* Amount */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="ticket-amount" className="text-sm font-medium text-ink-2">
              {mode === "dollars" ? "Amount" : "Contracts"}
            </label>
            {type === "market" && action === "buy" && (
              <div className="flex rounded-md bg-surface p-0.5 text-xs font-semibold">
                {(["dollars", "contracts"] as AmountMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      setMode(m);
                      setAmountText("");
                    }}
                    className={clsx("rounded px-2 py-0.5", mode === m ? "bg-white text-ink shadow-card" : "text-muted")}
                  >
                    {m === "dollars" ? "$" : "Contracts"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            {mode === "dollars" && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted">$</span>}
            <input
              id="ticket-amount"
              inputMode={mode === "dollars" ? "decimal" : "numeric"}
              placeholder={mode === "dollars" ? "0" : "0"}
              value={amountText}
              onChange={(e) => {
                const raw = e.target.value.replace(mode === "dollars" ? /[^\d.]/g : /\D/g, "");
                setAmountText(raw);
              }}
              onKeyDown={(e) => e.key === "Enter" && !disabled && submit()}
              className={clsx(
                "tnum h-12 w-full rounded-lg border border-line bg-white text-right text-xl font-semibold placeholder:text-faint focus:border-ink-2/40 focus:outline-none",
                mode === "dollars" ? "pl-7 pr-3" : "px-3",
              )}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(mode === "dollars" ? [1, 10, 50, 100] : action === "sell" && heldOnSide ? [] : [1, 10, 50, 100]).map((v) => (
              <button
                key={v}
                onClick={() => setAmountText(String((Number(amountText) || 0) + v))}
                className="tnum rounded-md border border-line px-2 py-1 text-xs font-medium text-ink-2 hover:bg-surface"
              >
                +{mode === "dollars" ? `$${v}` : v}
              </button>
            ))}
            {action === "sell" && heldOnSide > 0 && (
              <>
                <button
                  onClick={() => setAmountText(String(Math.floor(heldOnSide / 2) || 1))}
                  className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink-2 hover:bg-surface"
                >
                  Half
                </button>
                <button
                  onClick={() => setAmountText(String(heldOnSide))}
                  className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink-2 hover:bg-surface"
                >
                  Max ({heldOnSide})
                </button>
              </>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-1.5 rounded-lg bg-surface px-3 py-2.5">
          <Row label={type === "limit" ? "Limit price" : "Avg price"} value={est?.avgPrice != null ? cents(est.avgPrice) : "—"} />
          <Row label="Contracts" value={count ? count.toLocaleString() : "—"} />
          <Row label={action === "buy" ? "Cost" : "Proceeds"} value={count ? money(cost) : "—"} strong />
          {action === "buy" ? (
            <div className="flex items-center justify-between pt-1 text-sm">
              <span className="text-muted">Payout if {sideLabel} wins</span>
              <span className="tnum text-base font-bold text-yes-strong">
                {count ? money(payout) : "—"}
                {count > 0 && cost > 0 && (
                  <span className="ml-1 text-xs font-medium">(+{Math.round(((payout - cost) / cost) * 100)}%)</span>
                )}
              </span>
            </div>
          ) : (
            position &&
            position.side === side &&
            count > 0 && (
              <Row
                label="Realized P&L (est.)"
                value={
                  <span className={cost - count * position.avgPrice >= 0 ? "text-up" : "text-down"}>
                    {money(Math.round(cost - count * position.avgPrice), { sign: true })}
                  </span>
                }
              />
            )
          )}
          {type === "market" && est?.exhausted && (
            <p className="pt-1 text-xs text-down">Not enough liquidity in the book to fill all of this.</p>
          )}
          {type === "limit" && est && est.count > 0 && (
            <p className="pt-1 text-xs text-muted">
              {est.immediate > 0
                ? `About ${est.immediate} fill now; the rest rests on the book.`
                : "Rests on the book until someone matches it."}
            </p>
          )}
        </div>

        {/* Submit */}
        {user ? (
          <button
            onClick={submit}
            disabled={disabled}
            className={clsx(
              "flex h-12 w-full items-center justify-center gap-2 rounded-lg text-[15px] font-semibold text-white transition-colors disabled:opacity-45",
              side === "yes" ? "bg-yes hover:bg-yes-strong" : "bg-no hover:bg-no-strong",
            )}
          >
            {mutation.isPending && <Spinner className="text-white" />}
            {submitLabel}
          </button>
        ) : (
          <Link
            to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-ink text-[15px] font-semibold text-white hover:bg-ink-2"
          >
            Log in to trade
          </Link>
        )}
        {user && (
          <div className="flex justify-between text-xs text-muted">
            <span>Cash available</span>
            <span className="tnum font-medium text-ink-2">{money(user.balance)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function PositionAndOrders({ market }: { market: MarketSummary }) {
  const { user } = useUser();
  const portfolio = usePortfolio(!!user);
  const orders = useOrders("open", market.ticker, !!user);
  const toast = useToast();
  const invalidate = useInvalidateTrading();
  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelOrder(id),
    onSuccess: () => {
      toast.success("Order cancelled");
      invalidate();
    },
    onError: (e) => toast.error("Couldn't cancel", e instanceof Error ? e.message : String(e)),
  });

  if (!user) return null;
  const pos = portfolio.data?.positions.find((p) => p.ticker === market.ticker);
  const open = orders.data?.orders.filter((o) => o.status === "open") ?? [];
  if (!pos && open.length === 0) return null;

  return (
    <div className="space-y-3 rounded-xl border border-line bg-white p-4">
      {pos && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Your position</h3>
          <div className="flex items-center gap-2 text-sm">
            <SideBadge side={pos.side} />
            <span className="tnum font-semibold">{pos.qty.toLocaleString()}</span>
            <span className="text-muted">@ {cents(pos.avgPrice)} avg</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted">Value</div>
              <div className="tnum font-semibold">{money(pos.value)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Return</div>
              <div className={clsx("tnum font-semibold", pos.pnl > 0 ? "text-up" : pos.pnl < 0 ? "text-down" : "text-muted")}>
                {money(pos.pnl, { sign: true })}
                {pos.costBasis > 0 && <span className="ml-1 text-xs">({Math.round((pos.pnl / pos.costBasis) * 100)}%)</span>}
              </div>
            </div>
          </div>
        </div>
      )}
      {open.length > 0 && (
        <div className={clsx(pos && "border-t border-line-2 pt-3")}>
          <h3 className="mb-2 text-sm font-semibold">Open orders</h3>
          <ul className="space-y-2">
            {open.map((o) => (
              <li key={o.id} className="flex items-center gap-2 text-sm">
                <span className="text-muted">{o.action === "buy" ? "Buy" : "Sell"}</span>
                <SideBadge side={o.side} />
                <span className="tnum">
                  {o.remaining}
                  <span className="text-faint">/{o.count}</span> @ {o.price}¢
                </span>
                <button
                  onClick={() => cancel.mutate(o.id)}
                  disabled={cancel.isPending && cancel.variables === o.id}
                  className="ml-auto rounded-md border border-line px-2 py-1 text-xs font-medium hover:border-down hover:text-down disabled:opacity-50"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
