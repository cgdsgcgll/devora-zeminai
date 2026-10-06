"use client";

import { useLocale } from "../../i18n/react";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
export default function RegisterPage() {
  useLocale();

  return (
    <Suspense>
      <AuthForm register />
    </Suspense>
  );
}
