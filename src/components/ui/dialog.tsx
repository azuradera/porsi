"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  busy?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  icon,
  danger,
  busy,
  children,
  footer,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, busy, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="dialog"
      >
        <div className={`dialog-icon ${danger ? "is-danger" : ""}`}>
          {icon ?? (danger ? "!" : "?")}
        </div>
        <h2 className="dialog-title">{title}</h2>
        {description && <div className="dialog-body">{description}</div>}
        {children}
        {footer && <div className="dialog-actions">{footer}</div>}
      </section>
    </div>,
    document.body,
  );
}