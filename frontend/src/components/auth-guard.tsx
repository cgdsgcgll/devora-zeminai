"use client";
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./session";
import { homeFor, routeRole } from "@/lib/auth";
import { LoadingState } from "./feedback";
export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, ready } = useSession();
  const path = usePathname();
  const router = useRouter();
  const required = routeRole(path);
  useEffect(() => {
    if (!ready || !required) return;
    if (!user) router.replace("/giris");
    else if (user.role !== required) router.replace(homeFor(user.role));
  }, [ready, required, user, router]);
  if (required && (!ready || !user || user.role !== required))
    return <LoadingState label="Hesabınız kontrol ediliyor…" skeleton />;
  return children;
}
