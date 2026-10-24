"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/logout-button";

const navigation = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/customers", label: "Pelanggan", icon: "customers" },
  { href: "/packages", label: "Paket", icon: "packages" },
  { href: "/pickups", label: "Pengambilan", icon: "pickups" },
  { href: "/finance", label: "Keuangan", icon: "finance" },
];

function NavigationIcon({
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
    case "dashboard":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "customers":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3 20v-1.5a6 6 0 0 1 12 0V20" />
          <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14a5 5 0 0 1 3 4.5V20" />
        </svg>
      );
    case "packages":
      return (
        <svg {...common}>
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 12 9 5 9-5M3 16l9 5 9-5M12 13v8" />
        </svg>
      );
    case "pickups":
      return (
        <svg {...common}>
          <path d="M4 7h16l-1 13H5L4 7Z" />
          <path d="M9 9V6a3 3 0 0 1 6 0v3M8 12h8" />
        </svg>
      );
    case "finance":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="15" rx="2" />
          <path d="M3 10h18M7 15h4" />
        </svg>
      );
    default:
      return null;
  }
}

function Brand() {
  return (
    <Link href="/" className="app-shell-brand">
      <span className="app-shell-brand-mark">P</span>
      <span className="app-shell-brand-copy">
        <strong>PORSi</strong>
        <small>Katering, lebih teratur.</small>
      </span>
    </Link>
  );
}

function Navigation({
  mobile = false,
}: {
  mobile?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={mobile ? "app-shell-mobile-nav" : "app-shell-navigation"}
      aria-label="Navigasi utama"
    >
      {navigation.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href ||
              pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`app-shell-nav-item${active ? " is-active" : ""}`}
          >
            <NavigationIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function AppShellContent({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <div className="app-shell-layout">
        <aside className="app-shell-sidebar">
          <Brand />
          <p className="app-shell-section-label">MENU UTAMA</p>
          <Navigation />

          <div className="app-shell-sidebar-bottom">
            <div className="app-shell-tip">
              <strong>Usaha lebih tertata</strong>
              <p>
                Kelola pelanggan, pengambilan, langganan, dan keuangan
                dalam satu tempat.
              </p>
            </div>

            <div className="app-shell-profile">
              <div className="app-shell-avatar">A</div>
              <div className="app-shell-profile-copy">
                <strong>Administrator</strong>
                <span>Sesi admin</span>
              </div>
              <LogoutButton />
            </div>
          </div>
        </aside>

        <div className="app-shell-main">
          <header className="app-shell-topbar">
            <Brand />
            <div className="app-shell-topbar-account">
              <span className="app-shell-status-dot" />
              <span className="app-shell-topbar-admin">Administrator</span>
            </div>
          </header>

          <main className="app-shell-content">{children}</main>
        </div>
      </div>

      <Navigation mobile />
    </div>
  );
}

export default function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AppShellContent>{children}</AppShellContent>
    </Suspense>
  );
}