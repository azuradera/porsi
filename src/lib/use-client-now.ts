"use client";

import { useEffect, useState } from "react";

// Mengembalikan null saat prerender/SSR, lalu Date sekarang setelah mount.
// Dengan ini, waktu tidak pernah dibekukan saat build.
export function useClientNow(refreshMs?: number) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());

    if (!refreshMs) return;
    const id = window.setInterval(() => setNow(new Date()), refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);

  return now;
}

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}