import { Link } from "react-router";
import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Logo />
        </div>
        <p className="max-w-md text-[13px] leading-relaxed">
          Play money only. Every account starts with $1,000 to trade on campus life and beyond. Nothing here is real
          money or financial advice.
        </p>
        <div className="flex gap-4 text-[13px]">
          <Link to="/leaderboard" className="hover:text-ink">Leaderboard</Link>
          <Link to="/activity" className="hover:text-ink">Activity</Link>
        </div>
      </div>
    </footer>
  );
}
