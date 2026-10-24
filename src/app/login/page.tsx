import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
          Memuat halaman login...
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}