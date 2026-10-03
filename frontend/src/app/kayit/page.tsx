import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
export default function RegisterPage() {
  return (
    <Suspense>
      <AuthForm register />
    </Suspense>
  );
}
