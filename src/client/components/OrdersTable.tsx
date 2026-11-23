import { Link } from "react-router";
import { useMutation } from "@tanstack/react-query";
import clsx from "clsx";
import type { Order } from "../../shared/types";
import { api } from "../api";
import { useInvalidateTrading } from "../hooks/queries";
import { useToast } from "./Toast";
import { Table, Td, Th } from "./Table";
import { SideBadge } from "./ui";
import { relTime } from "../lib/format";

export default function OrdersTable({ orders }: { orders: Order[] }) {
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

  return (
    <Table>
      <thead>
        <tr>
          <Th>Market</Th>
          <Th>Order</Th>
          <Th right>Price</Th>
          <Th right>Filled</Th>
          <Th right>Placed</Th>
          <Th right>Status</Th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id} className="hover:bg-surface/50">
            <Td>
              <Link to={`/events/${o.eventSlug}?market=${encodeURIComponent(o.ticker)}`} className="block max-w-xs hover:underline">
                <span className="block truncate font-medium">{o.marketTitle}</span>
                {o.marketTitle !== o.eventTitle && <span className="block truncate text-xs text-muted">{o.eventTitle}</span>}
              </Link>
            </Td>
            <Td>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-ink-2">{o.action === "buy" ? "Buy" : "Sell"}</span>
                <SideBadge side={o.side} />
                <span className="text-xs text-muted">{o.type === "limit" ? "Limit" : "Market"}</span>
              </span>
            </Td>
            <Td right>{o.price}¢</Td>
            <Td right>
              {o.filled}
              <span className="text-faint">/{o.count}</span>
            </Td>
            <Td right className="text-muted">
              {relTime(o.createdAt)}
            </Td>
            <Td right>
              {o.status === "open" ? (
                <button
                  onClick={() => cancel.mutate(o.id)}
                  disabled={cancel.isPending && cancel.variables === o.id}
                  className="rounded-md border border-line px-2.5 py-1 text-xs font-medium hover:border-down hover:text-down disabled:opacity-50"
                >
                  Cancel
                </button>
              ) : (
                <span className={clsx("text-xs font-medium", o.status === "filled" ? "text-yes-strong" : "text-muted")}>
                  {o.status === "filled" ? "Filled" : "Cancelled"}
                </span>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
