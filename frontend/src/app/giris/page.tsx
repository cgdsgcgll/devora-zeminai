"use client";

import { useLocale } from "../../i18n/react";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
export default function LoginPage() {
  useLocale();

  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
