"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        if (!response.ok) {
          router.replace(
            `/login?next=${encodeURIComponent(pathname)}`,
          );
          return;
        }

        if (active) {
          setAuthorized(true);
        }
      } catch {
        router.replace("/login");
      }
    }

    checkSession();

    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        Memeriksa sesi admin...
      </main>
    );
  }

  return children;
}