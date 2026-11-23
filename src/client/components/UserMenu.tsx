import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, ChevronDown, ListOrdered, LogOut, Shield, Trophy, Wallet } from "lucide-react";
import type { User } from "../../shared/types";
import { api } from "../api";
import Avatar from "./Avatar";
import { money } from "../lib/format";

export default function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const logout = async () => {
    setOpen(false);
    try {
      await api.logout();
    } finally {
      qc.setQueryData(["me"], { user: null });
      qc.removeQueries({ queryKey: ["portfolio"] });
      qc.removeQueries({ queryKey: ["orders"] });
      await qc.invalidateQueries();
      navigate("/");
    }
  };

  const item = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink hover:bg-surface";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1 rounded-full p-0.5 pr-1.5 hover:bg-surface"
      >
        <Avatar name={user.name} url={user.avatarUrl} size={32} />
        <ChevronDown className="size-3.5 text-muted" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-64 animate-fade-in rounded-xl border border-line bg-white p-1.5 shadow-pop"
        >
          <div className="flex items-center gap-2.5 px-2.5 pb-2.5 pt-1.5">
            <Avatar name={user.name} url={user.avatarUrl} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{user.name}</div>
              <div className="truncate text-xs text-muted">{user.email}</div>
            </div>
          </div>
          <div className="mx-1 mb-1 flex justify-between rounded-lg bg-surface px-2.5 py-2 text-xs md:hidden">
            <span className="text-muted">Cash</span>
            <span className="tnum font-semibold">{money(user.balance)}</span>
          </div>
          <div className="border-t border-line-2 pt-1">
            <Link role="menuitem" to="/portfolio" onClick={() => setOpen(false)} className={item}>
              <Wallet className="size-4 text-muted" /> Portfolio
            </Link>
            <Link role="menuitem" to="/orders" onClick={() => setOpen(false)} className={item}>
              <ListOrdered className="size-4 text-muted" /> Orders
            </Link>
            <Link role="menuitem" to="/leaderboard" onClick={() => setOpen(false)} className={item}>
              <Trophy className="size-4 text-muted" /> Leaderboard
            </Link>
            <Link role="menuitem" to="/activity" onClick={() => setOpen(false)} className={item}>
              <BarChart3 className="size-4 text-muted" /> Live activity
            </Link>
            {user.isAdmin && (
              <Link role="menuitem" to="/admin" onClick={() => setOpen(false)} className={item}>
                <Shield className="size-4 text-muted" /> Admin
              </Link>
            )}
          </div>
          <div className="mt-1 border-t border-line-2 pt-1">
            <button role="menuitem" onClick={logout} className={item}>
              <LogOut className="size-4 text-muted" /> Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
