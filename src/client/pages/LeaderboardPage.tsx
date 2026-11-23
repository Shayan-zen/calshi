import clsx from "clsx";
import { Trophy } from "lucide-react";
import { useLeaderboard, useUser } from "../hooks/queries";
import Avatar from "../components/Avatar";
import { EmptyState, ErrorState, PageTitle, Pnl, Skeleton } from "../components/ui";
import { Table, Td, Th } from "../components/Table";
import { compactNumber } from "../lib/format";

const MEDAL = ["#d4a017", "#9aa0ab", "#b87333"];

export default function LeaderboardPage() {
  const lb = useLeaderboard(100);
  const { user } = useUser();
  const entries = lb.data?.entries ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle sub="Ranked by profit and loss, marked to current prices. Everyone starts with $1,000.">Leaderboard</PageTitle>
      {lb.isLoading ? (
        <Skeleton className="h-96" />
      ) : lb.isError ? (
        <ErrorState error={lb.error} onRetry={() => lb.refetch()} />
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={<Trophy className="size-5" />} title="No traders yet" body="Place a trade to get on the board." />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th className="w-16">Rank</Th>
              <Th>Trader</Th>
              <Th right>Volume</Th>
              <Th right>P&L</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const me = user?.id === e.userId;
              return (
                <tr key={e.userId} className={clsx(me ? "bg-yes-tint/70" : "hover:bg-surface/50")}>
                  <Td>
                    {e.rank <= 3 ? (
                      <span
                        className="tnum inline-grid size-7 place-items-center rounded-full text-xs font-bold text-white"
                        style={{ background: MEDAL[e.rank - 1] }}
                      >
                        {e.rank}
                      </span>
                    ) : (
                      <span className="tnum pl-2 font-medium text-muted">{e.rank}</span>
                    )}
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={e.name} url={e.avatarUrl} size={32} />
                      <span className="font-medium">{e.name}</span>
                      {me && <span className="rounded bg-yes px-1.5 py-0.5 text-[11px] font-semibold text-white">You</span>}
                    </span>
                  </Td>
                  <Td right className="text-ink-2">
                    ${compactNumber(e.volume)}
                  </Td>
                  <Td right>
                    <Pnl cents={e.pnl} className="font-semibold" />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
