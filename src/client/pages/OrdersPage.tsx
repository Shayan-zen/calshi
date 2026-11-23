import { useState } from "react";
import { ListOrdered } from "lucide-react";
import clsx from "clsx";
import RequireAuth from "../components/RequireAuth";
import OrdersTable from "../components/OrdersTable";
import { useOrders } from "../hooks/queries";
import { EmptyState, ErrorState, PageTitle, Skeleton } from "../components/ui";

function Orders() {
  const [status, setStatus] = useState<"open" | "all">("open");
  const orders = useOrders(status);
  const list = orders.data?.orders ?? [];
  return (
    <>
      <div className="mb-4 flex gap-1">
        {(["open", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={clsx(
              "rounded-full px-3.5 py-1.5 text-sm font-medium",
              status === s ? "bg-ink text-white" : "text-muted hover:bg-surface hover:text-ink",
            )}
          >
            {s === "open" ? "Open" : "All orders"}
          </button>
        ))}
      </div>
      {orders.isLoading ? (
        <Skeleton className="h-64" />
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-line">
          <EmptyState
            icon={<ListOrdered className="size-5" />}
            title={status === "open" ? "No open orders" : "No orders yet"}
            body="Limit orders that haven't filled yet wait here until they match or you cancel them."
          />
        </div>
      ) : (
        <OrdersTable orders={list} />
      )}
    </>
  );
}

export default function OrdersPage() {
  return (
    <RequireAuth>
      <PageTitle>Orders</PageTitle>
      <Orders />
    </RequireAuth>
  );
}
