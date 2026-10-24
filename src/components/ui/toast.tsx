"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type ToastVariant = "default" | "success" | "error";

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
};

type ToastItem = ToastInput & {
  id: number;
  leaving: boolean;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
  dismiss: (id: number) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setMounted(true);

    return () => {
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    const existingTimer = timers.current.get(id);

    if (existingTimer) {
      clearTimeout(existingTimer);
      timers.current.delete(id);
    }

    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, leaving: true } : item,
      ),
    );

    const removalTimer = setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
      timers.current.delete(id);
    }, 180);

    timers.current.set(id, removalTimer);
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = ++nextId.current;
      const duration = input.duration ?? 4000;

      setItems((current) => [
        ...current,
        {
          ...input,
          id,
          leaving: false,
          variant: input.variant ?? "default",
        },
      ]);

      const timer = setTimeout(() => {
        dismiss(id);
      }, duration);

      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const success = useCallback(
    (title: string, description?: string) => {
      toast({ title, description, variant: "success" });
    },
    [toast],
  );

  const error = useCallback(
    (title: string, description?: string) => {
      toast({ title, description, variant: "error", duration: 5500 });
    },
    [toast],
  );

  const info = useCallback(
    (title: string, description?: string) => {
      toast({ title, description, variant: "default" });
    },
    [toast],
  );

  const value = { toast, dismiss, success, error, info };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {mounted &&
        createPortal(
          <div className="toast-container" aria-live="polite" aria-relevant="additions">
            {items.map((item) => (
              <div
                key={item.id}
                role={item.variant === "error" ? "alert" : "status"}
                className={`toast toast-${item.variant}${item.leaving ? " is-leaving" : ""}`}
              >
                <div className="toast-icon" aria-hidden="true">
                  {item.variant === "success"
                    ? "✓"
                    : item.variant === "error"
                      ? "!"
                      : "i"}
                </div>

                <div className="toast-body">
                  <p className="toast-title">{item.title}</p>
                  {item.description && (
                    <p className="toast-message">{item.description}</p>
                  )}
                </div>

                <button
                  type="button"
                  className="toast-close"
                  aria-label={`Tutup notifikasi ${item.title}`}
                  onClick={() => dismiss(item.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast harus digunakan di dalam ToastProvider.");
  }

  return context;
}