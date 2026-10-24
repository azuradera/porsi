"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";

function LoginIcon({
  name,
  size = 20,
}: {
  name: "lock" | "arrow" | "eye" | "eye-off" | "sparkles";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "lock":
      return (
        <svg {...common}>
          <rect x="4" y="10" width="16" height="11" rx="3" />
          <path d="M8 10V7a4 4 0 1 1 8 0v3" />
          <path d="M12 14v3" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "eye-off":
      return (
        <svg {...common}>
          <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.2 6.3C3.5 8.1 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...common}>
          <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" />
          <path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14Z" />
        </svg>
      );
  }
}

function LoginBrand() {
  return (
    <div className="login-brand">
      <div className="login-brand-mark">
        <span>P</span>
        <span className="login-brand-dot" />
      </div>
      <div className="login-brand-copy">
        <span className="login-brand-name">PORSi</span>
        <span className="login-brand-tagline">Katering, lebih teratur.</span>
      </div>
    </div>
  );
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error] = useState("");
  const [loading, setLoading] = useState(false);
  const [pointer, setPointer] = useState({ x: 50, y: 35 });

  useEffect(() => {
    const updatePointer = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || event.pointerType === "touch") {
        setPointer({
          x: (event.clientX / window.innerWidth) * 100,
          y: (event.clientY / window.innerHeight) * 100,
        });
      }
    };

    window.addEventListener("pointermove", updatePointer, {
      passive: true,
    });

    return () => {
      window.removeEventListener("pointermove", updatePointer);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!password.trim() || loading) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.message || "Login gagal. Periksa kembali kata sandi.");
        return;
      }

      const next = searchParams.get("next");

      const destination =
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : "/";

      router.replace(destination);
      router.refresh();
    } catch {
      toast.error("Tidak dapat terhubung ke server. Periksa koneksi internet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="login-shell"
      style={
        {
          "--login-pointer-x": `${pointer.x}%`,
          "--login-pointer-y": `${pointer.y}%`,
        } as React.CSSProperties
      }
    >
      <div className="login-ambient pointer-events-none" aria-hidden="true">
        <div className="login-orb login-orb-one" />
        <div className="login-orb login-orb-two" />
        <div className="login-orb login-orb-three" />
        <div className="login-grid-pattern" />
        <div className="login-pointer-glow" />
      </div>

      <div className="login-container">
        <header className="login-header">
          <LoginBrand />

          <div className="login-access-badge">
            <span className="login-access-dot" />
            ADMIN WORKSPACE
          </div>
        </header>

        <section className="login-content">
          <div className="login-introduction">
            <div className="login-eyebrow">
              <span className="login-eyebrow-line" />
              <span>SELAMAT DATANG</span>
            </div>

            <h1 className="login-heading">
              Semua urusan,
              <br />
              <span>satu ruang.</span>
            </h1>

            <p className="login-description">
              Kelola pelanggan, pantau pengambilan, dan jaga operasional
              katering tetap teratur dari satu tempat.
            </p>

            <div className="login-feature-list">
              <div className="login-feature">
                <span className="login-feature-icon">
                  <LoginIcon name="sparkles" size={18} />
                </span>
                <div>
                  <strong>Operasional terorganisasi</strong>
                  <span>Data penting tersusun dalam satu dashboard.</span>
                </div>
              </div>

              <div className="login-feature">
                <span className="login-feature-icon login-feature-gold">
                  <LoginIcon name="lock" size={18} />
                </span>
                <div>
                  <strong>Akses administrator</strong>
                  <span>Pengelolaan usaha melalui sesi admin.</span>
                </div>
              </div>
            </div>
          </div>

          <section className="login-card">
            <div className="login-card-decoration pointer-events-none" aria-hidden="true" />

            <div className="login-card-heading">
              <div className="login-card-icon">
                <LoginIcon name="lock" size={23} />
              </div>

              <div className="login-card-title-group">
                <h2>Masuk ke PORSi</h2>
                <p>Gunakan kata sandi administrator.</p>
              </div>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              <label className="login-label" htmlFor="admin-password">
                Kata sandi
              </label>

              <div className="login-input-wrapper">
                <span className="login-input-icon">
                  <LoginIcon name="lock" size={18} />
                </span>

                <input
                  id="admin-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Masukkan kata sandi"
                  autoComplete="current-password"
                  required
                  autoFocus
                  disabled={loading}
                  className="login-input"
                />

                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={
                    showPassword
                      ? "Sembunyikan kata sandi"
                      : "Tampilkan kata sandi"
                  }
                  aria-pressed={showPassword}
                >
                  <LoginIcon
                    name={showPassword ? "eye-off" : "eye"}
                    size={18}
                  />
                </button>
              </div>

              {error && (
                <div className="login-error" role="alert">
                  <span className="login-error-symbol">!</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="login-submit"
                disabled={loading || !password.trim()}
              >
                <span>{loading ? "Memverifikasi..." : "Masuk ke dashboard"}</span>
                {!loading && <LoginIcon name="arrow" size={19} />}
                {loading && <span className="login-spinner" />}
              </button>
            </form>

            <div className="login-security-note">
              <LoginIcon name="lock" size={15} />
              <span>Akses terbatas untuk administrator.</span>
            </div>

            <div className="login-card-footer">
              <span className="login-footer-line" />
              <span>PORSi MANAGEMENT SYSTEM</span>
              <span className="login-footer-line" />
            </div>
          </section>
        </section>

        <footer className="login-footer">
          <span>
            <span className="login-footer-status" />
            Sistem manajemen katering
          </span>
          <span>Dibuat untuk usaha yang lebih tertata.</span>
        </footer>
      </div>
    </main>
  );
}