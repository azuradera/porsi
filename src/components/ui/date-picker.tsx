"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useClientNow } from "@/lib/use-client-now";

const WEEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTH = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const keyOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const parse = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

type PopupPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Pilih tanggal",
  disabled,
  "aria-label": ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"top" | "bottom">("bottom");
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<PopupPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const now = useClientNow();
  const selected = parse(value);
  const [view, setView] = useState<Date | null>(null);
  const shown = view ?? selected ?? now;

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = rootRef.current?.querySelector("button");
    const popup = popupRef.current;

    if (!trigger || !popup) return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 8;
    const gap = 8;
    const width = Math.min(320, viewportWidth - margin * 2);
    const maxHeight = Math.max(180, viewportHeight - margin * 2);

    popup.style.width = `${width}px`;
    popup.style.maxHeight = `${maxHeight}px`;

    const popupHeight = Math.min(popup.scrollHeight, maxHeight);
    const spaceBelow = viewportHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const showAbove = spaceBelow < popupHeight && spaceAbove > spaceBelow;

    const top = showAbove
      ? Math.max(margin, rect.top - popupHeight - gap)
      : Math.min(
          rect.bottom + gap,
          Math.max(margin, viewportHeight - popupHeight - margin),
        );

    const left = Math.max(
      margin,
      Math.min(rect.left, viewportWidth - width - margin),
    );

    setPlacement(showAbove ? "top" : "bottom");
    setPosition({ top, left, width, maxHeight });
  }, []);

  useEffect(() => {
    if (!open || !mounted) {
      setPosition(null);
      return;
    }

    const frame = window.requestAnimationFrame(updatePosition);

    const handleViewportChange = () => updatePosition();

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(handleViewportChange)
        : null;

    if (rootRef.current) observer?.observe(rootRef.current);
    if (popupRef.current) observer?.observe(popupRef.current);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      observer?.disconnect();
    };
  }, [open, mounted, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const closeOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;

      if (
        !rootRef.current?.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("touchstart", closeOutside);
    document.addEventListener("keydown", closeEscape);

    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("touchstart", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  const days = useMemo(() => {
    if (!shown) return [];

    const first = new Date(shown.getFullYear(), shown.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [shown]);

  const shift = (amount: number) => {
    if (!shown) return;

    setView(new Date(shown.getFullYear(), shown.getMonth() + amount, 1));
  };

  const today = now ? keyOf(now) : "";
  const selectedKey = selected ? keyOf(selected) : "";

  const label = selected
    ? selected.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : placeholder;

  const calendar =
    open && shown && mounted
      ? createPortal(
          <div
            ref={popupRef}
            className={`date-popover date-popover-${placement}`}
            role="dialog"
            aria-label="Pilih tanggal"
          style={{
            position: "fixed",
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            width: `${position?.width ?? 320}px`,
            minWidth: 0,
            maxWidth: "calc(100vw - 16px)",
            maxHeight: `${position?.maxHeight ?? 390}px`,
            overflowX: "hidden",
            overflowY: "auto",
            overscrollBehavior: "contain",
            visibility: position ? "visible" : "hidden",
            zIndex: 9999,
          }}
          >
            <div className="date-head">
              <button
                type="button"
                className="date-nav"
                onClick={() => shift(-1)}
                aria-label="Bulan sebelumnya"
              >
                ‹
              </button>

              <span className="date-title">
                {MONTH[shown.getMonth()]} {shown.getFullYear()}
              </span>

              <button
                type="button"
                className="date-nav"
                onClick={() => shift(1)}
                aria-label="Bulan berikutnya"
              >
                ›
              </button>
            </div>

            <div className="date-grid date-weekdays">
              {WEEK.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="date-grid date-days">
              {days.map((date) => {
                const key = keyOf(date);
                const outside = date.getMonth() !== shown.getMonth();
                const blocked = Boolean(
                  (min && key < min) || (max && key > max),
                );

                return (
                  <button
                    type="button"
                    key={key}
                    disabled={blocked}
                    className={[
                      "date-day",
                      outside && "is-outside",
                      key === today && "is-today",
                      key === selectedKey && "is-selected",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      onChange(key);
                      setOpen(false);
                    }}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        ref={rootRef}
        className={`select-root date-root ${open ? "is-open" : ""}`}
      >
        <button
          type="button"
          className="select-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => {
            setView(null);
            setOpen((current) => !current);
          }}
        >
          <span className={selected ? "" : "select-placeholder"}>{label}</span>
        </button>
      </div>

      {calendar}
    </>
  );
}