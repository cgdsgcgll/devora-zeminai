"use client";
import { t } from "../i18n/index.ts";
import { useLocale } from "../i18n/react";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./session";
import { homeFor, routeRole } from "@/lib/auth";
import { LoadingState } from "./feedback";
export function AuthGuard({ children }: { children: ReactNode }) {
  useLocale();

  const { user, ready } = useSession();
  const path = usePathname();
  const router = useRouter();
  const required = routeRole(path);
  useEffect(() => {
    if (!ready || (!required && path !== "/kanit-istekleri")) return;
    if (!user) router.replace("/giris");
    else if (required && user.role !== required)
      router.replace(homeFor(user.role));
  }, [ready, required, user, router, path]);
  if (
    (required || path === "/kanit-istekleri") &&
    (!ready || !user || (required && user.role !== required))
  )
    return <LoadingState label={t("m247")} skeleton />;
  return children;
}
