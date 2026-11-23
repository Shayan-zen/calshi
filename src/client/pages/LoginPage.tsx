import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { api } from "../api";
import { useUser } from "../hooks/queries";
import Logo from "../components/Logo";
import { Spinner } from "../components/ui";

function safeRedirect(r: string | null): string {
  if (!r || !r.startsWith("/") || r.startsWith("//") || r.startsWith("/login")) return "/";
  return r;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function DevLogin({ redirect }: { redirect: string }) {
  const [email, setEmail] = useState("f20230001@pilani.bits-pilani.ac.in");
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const login = useMutation({
    mutationFn: () => api.devLogin(email.trim(), name.trim() || undefined),
    onSuccess: async (res) => {
      qc.setQueryData(["me"], { user: res.user });
      await qc.invalidateQueries();
      navigate(redirect, { replace: true });
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        login.mutate();
      }}
      className="mt-6 rounded-xl border border-dashed border-line p-4"
    >
      <p className="mb-3 text-xs font-semibold text-muted">Dev login (local only)</p>
      <div className="space-y-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          aria-label="Email"
          placeholder="you@pilani.bits-pilani.ac.in"
          className="field h-10 w-full rounded-lg px-3 text-sm"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Display name"
          placeholder="Display name (optional)"
          className="field h-10 w-full rounded-lg px-3 text-sm"
        />
        <button
          type="submit"
          disabled={login.isPending}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-ink text-sm font-semibold text-on-ink hover:bg-ink-2 disabled:opacity-50"
        >
          {login.isPending && <Spinner className="text-on-ink" />}
          Log in as this user
        </button>
        {login.isError && <p className="text-xs text-down">{login.error.message}</p>}
      </div>
    </form>
  );
}

export default function LoginPage() {
  const [params] = useSearchParams();
  const { user, isLoading } = useUser();
  const redirect = safeRedirect(params.get("redirect"));
  const authError = params.get("auth_error");

  if (!isLoading && user) return <Navigate replace to={redirect} />;

  const googleHref = `/api/auth/google?redirect=${encodeURIComponent(redirect)}`;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-[400px] rounded-2xl border border-line bg-card p-7 shadow-card sm:p-8">
        <Link to="/" className="inline-flex">
          <Logo />
        </Link>
        <h1 className="mt-7 text-2xl font-bold tracking-tight">Log in to trade</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Predict campus events, sports and more with $1,000 in play money. Your account is created on first login.
        </p>

        {authError && (
          <div role="alert" className="mt-5 flex gap-2.5 rounded-lg bg-down-tint px-3 py-2.5 text-sm text-down">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              {authError === "domain"
                ? "Please use your BITS Pilani email. Pick your @pilani.bits-pilani.ac.in account in Google's chooser."
                : "Google sign-in didn't complete. Try again."}
            </span>
          </div>
        )}

        <a
          href={googleHref}
          className="mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-line bg-card text-[15px] font-semibold text-ink transition-colors hover:bg-surface"
        >
          <GoogleIcon />
          Continue with Google
        </a>
        <p className="mt-3 text-center text-xs text-muted">Only @pilani.bits-pilani.ac.in accounts</p>

        {import.meta.env.DEV && <DevLogin redirect={redirect} />}
      </div>
      <Link to="/" className="mt-6 text-sm font-medium text-muted hover:text-ink">
        Browse markets without logging in
      </Link>
    </div>
  );
}
