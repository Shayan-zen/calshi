import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useUser } from "../hooks/queries";
import { Skeleton } from "./ui";

export default function RequireAuth({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, isLoading } = useUser();
  const location = useLocation();
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!user) return <Navigate replace to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} />;
  if (admin && !user.isAdmin) return <Navigate replace to="/" />;
  return <>{children}</>;
}
