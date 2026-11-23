import { Link } from "react-router";
import { LogoMark } from "../components/Logo";

export default function NotFoundPage({ what = "page" }: { what?: string }) {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <LogoMark size={44} />
      <p className="tnum mt-6 text-5xl font-bold tracking-tight">404</p>
      <h1 className="mt-2 text-lg font-semibold">This {what} doesn't exist</h1>
      <p className="mt-1 max-w-sm text-sm text-muted">The link may be wrong, or the {what} was removed.</p>
      <Link to="/" className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-2">
        Browse markets
      </Link>
    </div>
  );
}
