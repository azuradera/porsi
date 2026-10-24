"use client";

import { useMemo } from "react";
import { Select, type SelectOption } from "./select";
import { useClientNow } from "@/lib/use-client-now";

const MONTH = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

type Props = {
  value: string; // "YYYY-MM"
  onChange: (value: string) => void;
  monthsBack?: number;
  monthsForward?: number;
  "aria-label"?: string;
};

export function MonthPicker({
  value,
  onChange,
  monthsBack = 24,
  monthsForward = 3,
  "aria-label": ariaLabel,
}: Props) {
  const now = useClientNow();

  const options = useMemo<SelectOption[]>(() => {
    if (!now) return [];

    const list: SelectOption[] = [];
    for (let i = monthsForward; i >= -monthsBack; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      list.push({ value: v, label: `${MONTH[d.getMonth()]} ${d.getFullYear()}` });
    }
    return list;
  }, [now, monthsBack, monthsForward]);

  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      placeholder={value || "Pilih bulan"}
      aria-label={ariaLabel}
    />
  );
}