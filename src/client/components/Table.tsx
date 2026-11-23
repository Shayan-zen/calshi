import type { ReactNode } from "react";
import clsx from "clsx";

/** Horizontal-scroll wrapper + consistent table styling. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("overflow-x-auto rounded-xl border border-line", className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return (
    <th
      className={clsx(
        "whitespace-nowrap border-b border-line bg-surface/60 px-4 py-2.5 text-xs font-medium text-muted",
        right ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, right, className }: { children?: ReactNode; right?: boolean; className?: string }) {
  return (
    <td className={clsx("border-b border-line-2 px-4 py-3 align-middle", right && "tnum text-right", className)}>{children}</td>
  );
}
