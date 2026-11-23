import { Link, useLocation, useSearchParams } from "react-router";
import clsx from "clsx";
import { TrendingUp, Sparkles } from "lucide-react";
import { useCategories } from "../hooks/queries";

const DEFAULT_CATEGORIES = ["Campus", "Politics", "Sports", "Economics", "Crypto", "Tech", "Culture", "Climate"];

export default function CategoryTabs() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const cats = useCategories();
  const names = cats.data?.length ? cats.data.map((c) => c.name) : DEFAULT_CATEGORIES;
  // Keep the canonical order, then anything new from the API.
  const ordered = [
    ...DEFAULT_CATEGORIES.filter((c) => names.includes(c)),
    ...names.filter((c) => !DEFAULT_CATEGORIES.includes(c)),
  ];

  const onHome = pathname === "/";
  const category = params.get("category");
  const sort = params.get("sort");
  const q = params.get("q");

  const tabs: Array<{ key: string; label: string; to: string; active: boolean; icon?: React.ReactNode }> = [
    {
      key: "trending",
      label: "Trending",
      to: "/",
      active: onHome && !category && sort !== "new" && !q,
      icon: <TrendingUp className="size-3.5" />,
    },
    {
      key: "new",
      label: "New",
      to: "/?sort=new",
      active: onHome && !category && sort === "new",
      icon: <Sparkles className="size-3.5" />,
    },
    ...ordered.map((c) => ({
      key: c,
      label: c,
      to: `/?category=${encodeURIComponent(c)}`,
      active: onHome && category === c,
    })),
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
      <div className="no-scrollbar -mb-px flex gap-5 overflow-x-auto">
        {tabs.map((t, i) => (
          <Link
            key={t.key}
            to={t.to}
            className={clsx(
              "flex shrink-0 items-center gap-1.5 border-b-2 py-2.5 text-sm font-medium transition-colors",
              t.active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
              i === 1 && "mr-1",
            )}
          >
            {t.icon}
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
