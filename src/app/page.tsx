"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LogoutButton from "@/components/logout-button";

type NavigationItem = {
  href: string;
  label: string;
  icon: string;
};

const navigationItems: NavigationItem[] = [
  { href: "/", label: "Dashboard", icon: "grid" },
  { href: "/customers", label: "Pelanggan", icon: "users" },
  { href: "/packages", label: "Paket", icon: "package" },
  { href: "/pickups", label: "Pengambilan", icon: "utensils" },
  { href: "/finance", label: "Keuangan", icon: "wallet" },
];

type DashboardData = {
  date: string;
  summary: {
    activeCustomers: number;
    activeSubscriptions: number;
    totalPickupRecords: number;
    totalPickupQuantity: number;
    totalNoMealDays: number;
    totalIncomeToday: number;
    totalExpensesToday: number;
    netCashFlowToday: number;
    subscriptionsEndingSoon: number;
  };
  todayPickups: {
    id: string;
    time: string;
    quantity: number;
    customer: {
      id: string;
      code: string;
      name: string;
    };
    package: {
      id: string;
      name: string;
    };
    meal: {
      id: string;
      name: string;
    };
  }[];
  subscriptionsEndingSoon: {
    id: string;
    startDate: string;
    endDate: string;
    customer: {
      id: string;
      code: string;
      name: string;
    };
    package: {
      id: string;
      name: string;
    };
  }[];
  recentPayments: {
    id: string;
    amount: number;
    paymentDate: string;
    customerName: string;
    customerCode: string;
    packageName: string;
  }[];
  recentExpenses: {
    id: string;
    description: string;
    category: string;
    amount: number;
    expenseDate: string;
  }[];
};

type FinanceReport = {
  payments?: {
    id: string;
    amount: number | string;
    paymentDate: string;
    customerName: string;
    customerCode: string;
    packageName: string;
  }[];
};

function Icon({
  name,
  size = 20,
}: {
  name: string;
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
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "package":
      return (
        <svg {...common}>
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 8 9 5 9-5M3 16l9 5 9-5M3 8v8m18-8v8M12 13v8" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      );
    case "utensils":
      return (
        <svg {...common}>
          <path d="M3 2v7a4 4 0 0 0 4 4h1V2M6 2v19M17 2v19M17 2c-3 3-3 8 0 11h4V2" />
        </svg>
      );
    case "calendar-days":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M16 3v4M8 3v4M3 11h18" />
          <path d="M8 15h.01M12 15h.01M16 15h.01M8 18h.01M12 18h.01" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M3 9h18M16 15h.01M7 5V3h10v2" />
        </svg>
      );
    case "arrow-up-right":
      return (
        <svg {...common}>
          <path d="M7 17 17 7M7 7h10v10" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "trending-up":
      return (
        <svg {...common}>
          <path d="m3 17 6-6 4 4 8-9" />
          <path d="M15 6h6v6" />
        </svg>
      );
    case "activity":
      return (
        <svg {...common}>
          <path d="M3 12h4l3-9 4 18 3-9h4" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...common}>
          <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" />
          <path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14Z" />
        </svg>
      );
    default:
      return null;
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00+07:00`));
}

function getGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );

  if (hour >= 4 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
}

function AmbientBackground() {
  const [position, setPosition] = useState({ x: 50, y: 20 });

  useEffect(() => {
    const updatePosition = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.pointerType === "mouse") {
        setPosition({
          x: (event.clientX / window.innerWidth) * 100,
          y: (event.clientY / window.innerHeight) * 100,
        });
      }
    };

    window.addEventListener("pointermove", updatePosition, {
      passive: true,
    });

    return () => {
      window.removeEventListener("pointermove", updatePosition);
    };
  }, []);

  return (
    <div
      className="ambient-background"
      style={
        {
          "--pointer-x": `${position.x}%`,
          "--pointer-y": `${position.y}%`,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <div className="ambient-orb ambient-orb-one" />
      <div className="ambient-orb ambient-orb-two" />
      <div className="ambient-orb ambient-orb-three" />
      <div className="ambient-grain" />
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-lockup ${compact ? "brand-compact" : ""}`}>
      <div className="brand-mark">
        <span>P</span>
        <span className="brand-mark-dot" />
      </div>
      <div className="brand-copy">
        <span className="brand-name">PORSi</span>
        <span className="brand-tagline">Katering, lebih teratur.</span>
      </div>
    </div>
  );
}

function Sidebar({ mobile = false }: { mobile?: boolean }) {
  return (
    <aside className={mobile ? "mobile-navigation" : "desktop-sidebar"}>
      {!mobile && (
        <div className="sidebar-brand">
          <Brand />
        </div>
      )}

      <div className="navigation-heading">MENU UTAMA</div>

      <nav
        className={mobile ? "mobile-navigation-list" : "navigation-list"}
        aria-label="Navigasi utama"
      >
        {navigationItems.map((item) => {
          const active = item.href === "/";

          return (
            <Link
              href={item.href}
              key={item.href}
              aria-current={active ? "page" : undefined}
              className={`navigation-item${active ? " navigation-active" : ""}`}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
              {active && <span className="navigation-indicator" />}
            </Link>
          );
        })}
      </nav>

      {!mobile && (
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <div className="sidebar-tip-icon">
              <Icon name="sparkles" size={19} />
            </div>
            <p className="sidebar-tip-title">Usaha lebih tertata</p>
            <p className="sidebar-tip-description">
              Catat pengambilan, pantau langganan, dan kendalikan keuangan
              dari satu tempat.
            </p>
          </div>

          <div className="sidebar-profile">
            <div className="profile-avatar">A</div>
            <div className="profile-copy">
              <span className="profile-name">Administrator</span>
              <span className="profile-status">
                <span className="status-dot" />
                Sesi aktif
              </span>
            </div>
            <LogoutButton />
          </div>
        </div>
      )}
    </aside>
  );
}

function StatCard({
  label,
  value,
  description,
  icon,
  accent,
}: {
  label: string;
  value: string;
  description: string;
  icon: string;
  accent: string;
}) {
  return (
    <article className={`stat-card stat-${accent}`}>
      <div className="stat-card-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">
          <Icon name={icon} size={21} />
        </span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-description">{description}</div>
      <div className="stat-card-glow" />
    </article>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon name="sparkles" size={22} />
      </div>
      <p className="empty-state-title">{title}</p>
      <p className="empty-state-description">{description}</p>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    setGreeting(getGreeting());
  }, []);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(
          now.getMonth() + 1,
        ).padStart(2, "0")}`;

        const [response, financeResponse] = await Promise.all([
          fetch("/api/dashboard", {
            cache: "no-store",
          }),
          fetch(`/api/reports/finance?month=${currentMonth}`, {
            cache: "no-store",
          }),
        ]);

        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Sesi admin berakhir. Silakan masuk kembali."
              : "Data dashboard tidak dapat dimuat.",
          );
        }

        const result = (await response.json()) as DashboardData;

        if (!financeResponse.ok) {
          throw new Error("Laporan pemasukan bulan ini tidak dapat dimuat.");
        }

        const financeData = (await financeResponse.json()) as FinanceReport;
        const monthlyPayments = Array.isArray(financeData.payments)
          ? financeData.payments
          : [];

        result.summary.totalIncomeToday = monthlyPayments.reduce(
          (total, payment) => total + Number(payment.amount),
          0,
        );

        result.recentPayments = monthlyPayments
          .sort((a, b) =>
            b.paymentDate.slice(0, 10).localeCompare(a.paymentDate.slice(0, 10)),
          )
          .map((payment) => ({
            ...payment,
            amount: Number(payment.amount),
          }));

        if (active) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Terjadi kesalahan saat memuat dashboard.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <AmbientBackground />
      <div className="page-content dashboard-page">
            <section className="welcome-section">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-line" />
                  <span>OVERVIEW USAHA</span>
                </div>

                <h1 className="welcome-title">
                  {greeting || "Selamat datang"},
                  <br />
                  <span>mulai catat.</span>
                </h1>

                <p className="welcome-description">
                  pencatatan sederhana agar mudah mencatat katering.
                </p>
              </div>

              <div className="welcome-decoration" aria-hidden="true">
                <div className="decoration-ring decoration-ring-one" />
                <div className="decoration-ring decoration-ring-two" />
                <div className="decoration-core">
                  <Icon name="sparkles" size={30} />
                </div>
                <span className="decoration-star decoration-star-one">✦</span>
                <span className="decoration-star decoration-star-two">✧</span>
              </div>
            </section>

            {error && (
              <div className="error-banner" role="alert">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="text-button"
                >
                  Muat ulang
                </button>
              </div>
            )}

            <section className="stats-grid" aria-label="Ringkasan usaha">
              <StatCard
                label="Pelanggan aktif"
                value={
                  loading ? "—" : String(data?.summary.activeCustomers ?? 0)
                }
                description="Total pelanggan terdaftar aktif"
                icon="users"
                accent="violet"
              />
              <StatCard
                label="Langganan berjalan"
                value={
                  loading
                    ? "—"
                    : String(data?.summary.activeSubscriptions ?? 0)
                }
                description="Langganan yang berlaku hari ini"
                icon="activity"
                accent="gold"
              />
              <StatCard
                label="Pengambilan hari ini"
                value={
                  loading
                    ? "—"
                    : String(data?.summary.totalPickupQuantity ?? 0)
                }
                description={`${data?.summary.totalPickupRecords ?? 0} catatan pengambilan`}
                icon="utensils"
                accent="mint"
              />
              <StatCard
              label="Pemasukan bulan ini"
              value={
                loading
                  ? "—"
                  : formatCurrency(data?.summary.totalIncomeToday ?? 0)
              }
              description="Total pembayaran pada bulan berjalan"
              icon="trending-up"
              accent="blue"
              />
            </section>

            <section className="dashboard-grid">
              <article className="panel pickup-panel">
                <div className="panel-header">
                  <div>
                    <div className="panel-kicker">OPERASIONAL</div>
                    <h2 className="panel-title">Pengambilan hari ini</h2>
                    <p className="panel-description">
                      Daftar pengambilan makanan yang sudah dicatat.
                    </p>
                  </div>

                  <Link href="/pickups" className="panel-link">
                    Lihat semua <Icon name="arrow-up-right" size={16} />
                  </Link>
                </div>

                <div className="panel-content">
                  {loading ? (
                    <div className="loading-list">
                      <div className="skeleton-row" />
                      <div className="skeleton-row" />
                      <div className="skeleton-row" />
                    </div>
                  ) : data?.todayPickups.length ? (
                    <div className="pickup-list">
                      {data.todayPickups.slice(0, 6).map((pickup) => (
                        <div className="pickup-row" key={pickup.id}>
                          <div className="pickup-time">
                            <Icon name="clock" size={15} />
                            <span>{pickup.time}</span>
                          </div>

                          <div className="pickup-avatar">
                            {pickup.customer.name
                              .trim()
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div className="pickup-details">
                            <span className="pickup-customer">
                              {pickup.customer.name}
                            </span>
                            <span className="pickup-meta">
                              {pickup.customer.code} · {pickup.package.name}
                            </span>
                          </div>

                          <div className="pickup-meal">
                            <span className="meal-name">
                              {pickup.meal.name}
                            </span>
                            <span className="meal-quantity">
                              {pickup.quantity} porsi
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="Belum ada pengambilan"
                      description="Catatan pengambilan hari ini akan muncul di sini."
                    />
                  )}
                </div>

                <div className="panel-footer">
                  <div className="footer-metric">
                    <span className="footer-metric-dot" />
                    <span>
                      {loading
                        ? "Memuat aktivitas..."
                        : `${data?.summary.totalPickupRecords ?? 0} transaksi tercatat`}
                    </span>
                  </div>
                  <span className="footer-metric-secondary">
                    {data?.summary.totalNoMealDays ?? 0} hari tanpa pengambilan
                  </span>
                </div>
              </article>

              <article className="panel ending-panel">
                <div className="panel-header">
                  <div>
                    <div className="panel-kicker">PERLU DIPANTAU</div>
                    <h2 className="panel-title">Langganan segera berakhir</h2>
                    <p className="panel-description">
                      Periode langganan dalam tujuh hari ke depan.
                    </p>
                  </div>
                  <span className="panel-count">
                    {data?.subscriptionsEndingSoon.length ?? 0}
                  </span>
                </div>

                <div className="panel-content">
                  {loading ? (
                    <div className="loading-list">
                      <div className="skeleton-row" />
                      <div className="skeleton-row" />
                    </div>
                  ) : data?.subscriptionsEndingSoon.length ? (
                    <div className="ending-list">
                      {data.subscriptionsEndingSoon
                        .slice(0, 5)
                        .map((subscription) => (
                          <div
                            className="ending-row"
                            key={subscription.id}
                          >
                            <div className="ending-icon">
                              <Icon name="calendar" size={18} />
                            </div>

                            <div className="ending-details">
                              <span className="ending-name">
                                {subscription.customer.name}
                              </span>
                              <span className="ending-meta">
                                {subscription.customer.code} ·{" "}
                                {subscription.package.name}
                              </span>
                            </div>

                            <div className="ending-date">
                              <span>Berakhir</span>
                              <strong>
                                {formatDate(subscription.endDate)}
                              </strong>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="Semua masih terkendali"
                      description="Tidak ada langganan yang berakhir dalam tujuh hari ke depan."
                    />
                  )}
                </div>

                <div className="panel-footer">
                  <Link href="/customers" className="panel-link">
                    Kelola langganan{" "}
                    <Icon name="arrow-up-right" size={16} />
                  </Link>
                </div>
              </article>
            </section>

            <section className="dashboard-grid secondary-grid">
              <article className="panel finance-panel">
                <div className="panel-header">
                  <div>
                    <div className="panel-kicker">KEUANGAN</div>
                    <h2 className="panel-title">Pemasukan bulan ini</h2>
                    <p className="panel-description">
                      Total pembayaran pelanggan pada bulan berjalan.
                    </p>
                  </div>
                  <Link href="/finance" className="panel-link">
                    Detail <Icon name="arrow-up-right" size={16} />
                  </Link>
                </div>

                <div className="finance-summary">
                  <div className="finance-item">
                    <span className="finance-label">
                      <span className="finance-dot income-dot" />
                      Pemasukan bulan ini
                    </span>
                    <strong className="finance-amount">
                      {loading
                        ? "—"
                        : formatCurrency(data?.summary.totalIncomeToday ?? 0)}
                    </strong>
                  </div>
                </div>
              </article>

              <article className="panel payments-panel">
                <div className="panel-header">
                  <div>
                    <div className="panel-kicker">AKTIVITAS TERBARU</div>
                    <h2 className="panel-title">Pembayaran terbaru</h2>
                    <p className="panel-description">
                      Riwayat pemasukan terakhir.
                    </p>
                  </div>
                  <Link href="/finance" className="panel-link">
                    Semua <Icon name="arrow-up-right" size={16} />
                  </Link>
                </div>

                <div className="panel-content">
                  {loading ? (
                    <div className="loading-list">
                      <div className="skeleton-row" />
                      <div className="skeleton-row" />
                    </div>
                  ) : data?.recentPayments.length ? (
                    <div className="payment-list">
                      {data.recentPayments.slice(0, 4).map((payment) => (
                        <div className="payment-row" key={payment.id}>
                          <div className="payment-icon">
                            <Icon name="trending-up" size={17} />
                          </div>
                          <div className="payment-details">
                            <span className="payment-name">
                              {payment.customerName}
                            </span>
                            <span className="payment-meta">
                              {payment.customerCode} · {payment.packageName}
                            </span>
                          </div>
                          <strong className="payment-amount">
                            +{formatCurrency(payment.amount)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="Belum ada pembayaran"
                      description="Pembayaran yang dicatat akan muncul di sini."
                    />
                  )}
                </div>
              </article>
            </section>

            <footer className="app-footer">
              <span>
                <span className="footer-brand-dot" />
                PORSi <span className="footer-divider">·</span> Ruang kerja
                kateringmu
              </span>
              <span>Dibuat untuk operasional yang lebih tertata.</span>
            </footer>
      </div>
    </>
  );
}