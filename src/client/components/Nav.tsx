import { Link } from "react-router";
import Logo from "./Logo";
import SearchBox from "./SearchBox";
import UserMenu from "./UserMenu";
import CategoryTabs from "./CategoryTabs";
import { usePortfolio, useUser } from "../hooks/queries";
import { money } from "../lib/format";

function Balances() {
  const { user } = useUser();
  const portfolio = usePortfolio(!!user);
  if (!user) return null;
  const total = portfolio.data?.totalValue;
  return (
    <Link
      to="/portfolio"
      className="hidden items-stretch gap-1 rounded-lg px-1 py-1 hover:bg-surface md:flex"
      title="Open portfolio"
    >
      <div className="px-2 text-right">
        <div className="text-[11px] font-medium leading-tight text-muted">Portfolio</div>
        <div className="tnum text-[14px] font-semibold leading-tight text-yes-strong">
          {total === undefined ? "—" : money(total)}
        </div>
      </div>
      <div className="px-2 text-right">
        <div className="text-[11px] font-medium leading-tight text-muted">Cash</div>
        <div className="tnum text-[14px] font-semibold leading-tight text-ink">{money(user.balance)}</div>
      </div>
    </Link>
  );
}

export default function Nav() {
  const { user, isLoading } = useUser();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:gap-5 sm:px-6 lg:px-8">
        <Link to="/" className="shrink-0 rounded-md" aria-label="Pilani Predict home">
          <Logo compact />
        </Link>
        <div className="min-w-0 flex-1">
          <SearchBox />
        </div>
        <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
          {isLoading ? (
            <div className="h-8 w-24" />
          ) : user ? (
            <>
              <Balances />
              <UserMenu user={user} />
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden rounded-full px-3.5 py-2 text-sm font-semibold text-ink hover:bg-surface sm:inline-flex"
              >
                Log in
              </Link>
              <Link
                to="/login"
                className="inline-flex rounded-full bg-yes px-4 py-2 text-sm font-semibold text-white hover:bg-yes-strong"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
      <CategoryTabs />
    </header>
  );
}
