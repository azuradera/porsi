"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import IncomeOverview from "@/components/income-overview";

type Subscription = {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  package: { id: string; name: string };
};

type Customer = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  subscriptions: Subscription[];
};

type CateringPackage = {
  id: string;
  name: string;
  price: number | string;
  isActive: boolean;
  dailyQuota: number;
  meals?: { id: string; mealName: string }[];
};

type CustomerResponse = {
  count: number;
  customers: Customer[];
  message?: string;
};

type ConfirmState = {
  customer: Customer;
  action: "activate" | "deactivate" | "delete";
} | null;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function formatCurrency(value: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function getCurrentSubscription(customer: Customer) {
  return customer.subscriptions?.[0] ?? null;
}

function getTodayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [packages, setPackages] = useState<CateringPackage[]>([]);
  const [packageId, setPackageId] = useState("");
  const [todayDate, setTodayDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [paymentType, setPaymentType] = useState<"FULL" | "HALF">("FULL");
  const [submittingId, setSubmittingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmState>(null);
  const toast = useToast();

  useEffect(() => {
    const today = getTodayDate();
    setTodayDate(today);
    setStartDate(today);
  }, []);

  const loadCustomers = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const response = await fetch(`/api/customers?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as CustomerResponse;

      if (!response.ok) {
        throw new Error(data.message || "Gagal mengambil data pelanggan");
      }

      setCustomers(data.customers ?? []);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat mengambil data pelanggan",
      );
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCustomers();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadCustomers]);

  useEffect(() => {
    let active = true;

    async function loadPackages() {
      try {
        const response = await fetch("/api/packages", { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Gagal mengambil paket katering");
        }

        const activePackages = (Array.isArray(data) ? data : []).filter(
          (item: CateringPackage) => item.isActive,
        ) as CateringPackage[];

        if (active) {
          setPackages(activePackages);
          setPackageId((current) => current || activePackages[0]?.id || "");
        }
      } catch (err) {
        if (active) {
          toast.error(
            err instanceof Error ? err.message : "Gagal mengambil paket katering",
          );
        }
      }
    }

    void loadPackages();
    return () => {
      active = false;
    };
  }, []);

  async function handleCreateCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      toast.error("Nama pelanggan wajib diisi.");
      return;
    }
    if (!packageId) {
      toast.error("Pilih paket katering aktif terlebih dahulu.");
      return;
    }
    if (!startDate) {
      toast.error("Tanggal mulai langganan wajib diisi.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          packageId,
          startDate,
          paymentType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Gagal menambahkan pelanggan dan langganan.");
      }

      const createdCustomer = data.customer as Customer;
      const selectedPackage = packages.find((item) => item.id === packageId);

      toast.success(
      "Pelanggan berhasil ditambahkan",
      `Pelanggan ${createdCustomer.code} berhasil ditambahkan dengan paket ${selectedPackage?.name ?? "pilihan"}.`
    );

      setName("");
      setPhone("");
      setAddress("");
      setPackageId(packages[0]?.id ?? "");
      setStartDate(todayDate);
      setPaymentType("FULL");
      setSearch("");
      setStatusFilter("ALL");
      setShowForm(false);

      await loadCustomers();
    } catch (err) {
      toast.error(
         "Gagal menambahkan pelanggan",
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menyimpan pelanggan.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleCustomerStatus(customer: Customer) {
    const nextStatus = customer.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    setSubmittingId(customer.id);

    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Gagal mengubah status pelanggan");
      }

      setConfirmAction(null);
      toast.success(  "Status pelanggan diperbarui",
      `Status pelanggan ${customer.name} berhasil diubah.`);
      await loadCustomers();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat mengubah status pelanggan",
      );
    } finally {
      setSubmittingId("");
    }
  }

  async function deleteCustomer(customer: Customer) {
    setDeletingId(customer.id);

    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Gagal menghapus pelanggan");
      }

      setConfirmAction(null);
      toast.success(`Pelanggan ${customer.name} berhasil dihapus permanen.`);
      await loadCustomers();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menghapus pelanggan",
      );
    } finally {
      setDeletingId("");
    }
  }

  const activeCount = customers.filter((c) => c.status === "ACTIVE").length;
  const inactiveCount = customers.filter((c) => c.status === "INACTIVE").length;
  const busy = Boolean(submittingId || deletingId);

  const confirmTitle =
    confirmAction?.action === "delete"
      ? "Hapus pelanggan permanen?"
      : confirmAction?.action === "deactivate"
        ? "Nonaktifkan pelanggan?"
        : "Aktifkan pelanggan?";

  const confirmText = confirmAction
    ? confirmAction.action === "delete"
      ? `Pelanggan ${confirmAction.customer.name} akan dihapus. Data langganan dan data terkait juga dapat terhapus sesuai aturan relasi basis data. Tindakan ini tidak dapat dibatalkan.`
      : confirmAction.action === "deactivate"
        ? `Pelanggan ${confirmAction.customer.name} akan dinonaktifkan.`
        : `Pelanggan ${confirmAction.customer.name} akan diaktifkan kembali.`
    : "";

  return (
    <main className="customers-page">
      <header className="customers-header">
        <div>
          <div className="customers-eyebrow">MANAJEMEN PELANGGAN</div>
          <h1 className="customers-title">Pelanggan</h1>
          <p className="customers-subtitle">
            Kelola data pelanggan dan pantau langganan mereka.
          </p>
        </div>

        <div className="customers-header-actions">
          <Link href="/" className="customers-secondary-button">
            Dashboard
          </Link>

          <button
            type="button"
            className="customers-primary-button"
            onClick={() => {
              setShowForm((current) => !current);
            }}
          >
            {showForm ? "Tutup formulir" : "+ Tambah pelanggan"}
          </button>
        </div>
      </header>

      {showForm && (
        <section className="customers-form-panel panel">
          <div className="customers-panel-heading">
            <div>
              <h2>Tambah pelanggan baru</h2>
              <p>Kode pelanggan akan dibuat secara otomatis.</p>
            </div>
          </div>

          <form onSubmit={handleCreateCustomer}>
            <div className="customers-form-grid">
              <label className="customers-field">
                <span>Nama pelanggan *</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Masukkan nama pelanggan"
                  maxLength={100}
                  autoComplete="name"
                  required
                />
              </label>

              <label className="customers-field">
                <span>Nomor telepon</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="08xxxxxxxxxx"
                  maxLength={20}
                  autoComplete="tel"
                />
              </label>

              <div className="customers-field">
                <span>Paket katering *</span>
                <Select
                  value={packageId}
                  onChange={setPackageId}
                  options={packages.map((p) => ({
                    value: p.id,
                    label: `${p.name} · ${formatCurrency(p.price)}`,
                  }))}
                  placeholder={
                    packages.length === 0
                      ? "Tidak ada paket aktif"
                      : "Pilih paket katering"
                  }
                  disabled={packages.length === 0}
                  aria-label="Paket katering"
                />
              </div>

              <div className="customers-field">
                <span>Tanggal mulai langganan *</span>
                <DatePicker
                  value={startDate}
                  onChange={setStartDate}
                  min={todayDate}
                  aria-label="Tanggal mulai langganan"
                />
              </div>

              <div className="customers-field">
                <span>Periode pembayaran *</span>
                <Select
                  value={paymentType}
                  onChange={(v) => setPaymentType(v as "FULL" | "HALF")}
                  options={[
                    { value: "FULL", label: "30 hari · Bayar penuh" },
                    { value: "HALF", label: "15 hari · Setengah harga" },
                  ]}
                  aria-label="Periode pembayaran"
                />
              </div>

              <label className="customers-field customers-field-full">
                <span>Alamat</span>
                <textarea
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Masukkan alamat pelanggan"
                  maxLength={5000}
                  rows={3}
                  autoComplete="street-address"
                />
              </label>
            </div>

            <div className="customers-form-actions">
              <button
                type="button"
                className="customers-secondary-button"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Batal
              </button>

              <button
                type="submit"
                className="customers-primary-button"
                disabled={saving || packages.length === 0}
              >
                {saving ? "Menyimpan..." : "Simpan pelanggan"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="customers-stats page-stats">
        <article className="customers-stat-card">
          <span className="customers-stat-label">Hasil pencarian</span>
          <strong className="customers-stat-value">
            {loading ? "..." : customers.length}
          </strong>
          <span className="customers-stat-caption">Pelanggan ditemukan</span>
        </article>

        <article className="customers-stat-card">
          <span className="customers-stat-label">Aktif</span>
          <strong className="customers-stat-value">
            {loading ? "..." : activeCount}
          </strong>
          <span className="customers-stat-caption">Pelanggan aktif dalam hasil</span>
        </article>

        <article className="customers-stat-card">
          <span className="customers-stat-label">Nonaktif</span>
          <strong className="customers-stat-value">
            {loading ? "..." : inactiveCount}
          </strong>
          <span className="customers-stat-caption">Pelanggan nonaktif dalam hasil</span>
        </article>
      </section>

      <section className="customers-panel panel">
        <div className="customers-toolbar">
          <div className="customers-panel-heading">
            <div>
              <h2>Daftar pelanggan</h2>
              <p>
                Pilih nama pelanggan untuk membuka detail dan kalender
                langganannya.
              </p>
            </div>
          </div>

          <div className="customers-filters">
            <label className="customers-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama, kode, atau telepon"
                aria-label="Cari pelanggan"
              />
            </label>

            <div className="customers-status-filter">
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                aria-label="Filter status pelanggan"
                options={[
                  { value: "ALL", label: "Semua status" },
                  { value: "ACTIVE", label: "Aktif" },
                  { value: "INACTIVE", label: "Nonaktif" },
                ]}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="customers-empty">
            <span className="customers-loader" />
            <p>Memuat data pelanggan...</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="customers-empty">
            <div className="customers-empty-icon">◎</div>
            <h3>Belum ada pelanggan ditemukan</h3>
            <p>
              Coba ubah kata pencarian atau filter status, atau tambahkan
              pelanggan baru.
            </p>
            <button
              type="button"
              className="customers-secondary-button"
              onClick={() => {
                setSearch("");
                setStatusFilter("ALL");
              }}
            >
              Reset filter
            </button>
          </div>
        ) : (
          <>
            <div className="customers-table-wrapper">
              <table className="customers-table">
                <thead>
                  <tr>
                    <th>Pelanggan</th>
                    <th>Kontak</th>
                    <th>Paket terakhir</th>
                    <th>Status</th>
                    <th>Bergabung</th>
                    <th>Aksi</th>
                  </tr>
                </thead>

                <tbody>
                  {customers.map((customer) => {
                    const subscription = getCurrentSubscription(customer);
                    const isActive = customer.status === "ACTIVE";
                    const rowBusy =
                      submittingId === customer.id || deletingId === customer.id;

                    return (
                      <tr key={customer.id}>
                        <td>
                          <Link
                            href={`/customers/${customer.id}`}
                            className="customers-person-link"
                          >
                            <span className="customers-avatar">
                              {customer.name.trim().charAt(0).toUpperCase()}
                            </span>
                            <span className="customers-person-info">
                              <strong>{customer.name}</strong>
                              <span>{customer.code}</span>
                            </span>
                          </Link>
                        </td>

                        <td>
                          <div className="customers-contact">
                            <span>{customer.phone || "Belum diisi"}</span>
                            <span className="customers-address">
                              {customer.address || "Alamat belum diisi"}
                            </span>
                          </div>
                        </td>

                        <td>
                          {subscription ? (
                            <div className="customers-package-info">
                              <strong>{subscription.package.name}</strong>
                              <span>
                                {formatDate(subscription.startDate)} –{" "}
                                {formatDate(subscription.endDate)}
                              </span>
                            </div>
                          ) : (
                            <span className="customers-muted">Belum berlangganan</span>
                          )}
                        </td>

                        <td>
                          <span
                            className={`customers-status-badge ${
                              isActive ? "is-active" : "is-inactive"
                            }`}
                          >
                            <span className="customers-status-dot" />
                            {isActive ? "Aktif" : "Nonaktif"}
                          </span>
                        </td>

                        <td>
                          <span className="customers-date">
                            {formatDate(customer.createdAt)}
                          </span>
                        </td>

                        <td>
                          <div className="customers-row-actions">
                            <Link
                              href={`/customers/${customer.id}`}
                              className="customers-detail-button"
                            >
                              Detail
                            </Link>

                            <button
                              type="button"
                              className={`customers-toggle-button ${
                                isActive ? "is-deactivate" : "is-activate"
                              }`}
                              onClick={() =>
                                setConfirmAction({
                                  customer,
                                  action: isActive ? "deactivate" : "activate",
                                })
                              }
                              disabled={rowBusy}
                            >
                              {submittingId === customer.id
                                ? "Memproses..."
                                : isActive
                                  ? "Nonaktifkan"
                                  : "Aktifkan"}
                            </button>

                            <button
                              type="button"
                              className="customers-delete-button"
                              onClick={() =>
                                setConfirmAction({ customer, action: "delete" })
                              }
                              disabled={rowBusy}
                            >
                              {deletingId === customer.id ? "Menghapus..." : "Hapus"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="customers-mobile-list">
              {customers.map((customer) => {
                const subscription = getCurrentSubscription(customer);
                const isActive = customer.status === "ACTIVE";
                const rowBusy =
                  submittingId === customer.id || deletingId === customer.id;

                return (
                  <article key={customer.id} className="customers-mobile-card">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="customers-mobile-card-link"
                    >
                      <div className="customers-mobile-card-header">
                        <span className="customers-avatar">
                          {customer.name.trim().charAt(0).toUpperCase()}
                        </span>

                        <div className="customers-person-info">
                          <strong>{customer.name}</strong>
                          <span>{customer.code}</span>
                        </div>

                        <span
                          className={`customers-status-badge ${
                            isActive ? "is-active" : "is-inactive"
                          }`}
                        >
                          <span className="customers-status-dot" />
                          {isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </div>

                      <div className="customers-mobile-card-details">
                        <div>
                          <span>Telepon</span>
                          <strong>{customer.phone || "Belum diisi"}</strong>
                        </div>
                        <div>
                          <span>Paket</span>
                          <strong>
                            {subscription
                              ? subscription.package.name
                              : "Belum berlangganan"}
                          </strong>
                        </div>
                        {subscription && (
                          <div>
                            <span>Masa langganan</span>
                            <strong>
                              {formatDate(subscription.startDate)} –{" "}
                              {formatDate(subscription.endDate)}
                            </strong>
                          </div>
                        )}
                      </div>

                      <div className="customers-mobile-detail-link">
                        Lihat detail dan kalender <span>→</span>
                      </div>
                    </Link>

                    <div className="customers-mobile-actions">
                      <button
                        type="button"
                        className={`customers-toggle-button ${
                          isActive ? "is-deactivate" : "is-activate"
                        }`}
                        onClick={() =>
                          setConfirmAction({
                            customer,
                            action: isActive ? "deactivate" : "activate",
                          })
                        }
                        disabled={rowBusy}
                      >
                        {submittingId === customer.id
                          ? "Memproses..."
                          : isActive
                            ? "Nonaktifkan"
                            : "Aktifkan"}
                      </button>

                      <button
                        type="button"
                        className="customers-delete-button"
                        onClick={() =>
                          setConfirmAction({ customer, action: "delete" })
                        }
                        disabled={rowBusy}
                      >
                        {deletingId === customer.id ? "Menghapus..." : "Hapus permanen"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {!loading && customers.length > 0 && (
          <div className="customers-list-footer">
            Menampilkan {customers.length} pelanggan
          </div>
        )}
      </section>

      <Dialog
        open={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        busy={busy}
        danger={confirmAction?.action === "delete"}
        title={confirmTitle}
        description={confirmText}
        footer={
          <>
            <button
              type="button"
              className="customers-secondary-button"
              onClick={() => setConfirmAction(null)}
              disabled={busy}
            >
              Batal
            </button>
            <button
              type="button"
              className={
                confirmAction?.action === "delete"
                  ? "customers-delete-button"
                  : "customers-primary-button"
              }
              disabled={busy}
              onClick={() => {
                if (!confirmAction) return;
                const { customer, action } = confirmAction;
                if (action === "delete") {
                  void deleteCustomer(customer);
                } else {
                  void toggleCustomerStatus(customer);
                }
              }}
            >
              {busy
                ? "Memproses..."
                : confirmAction?.action === "delete"
                  ? "Ya, hapus permanen"
                  : confirmAction?.action === "deactivate"
                    ? "Ya, nonaktifkan"
                    : "Ya, aktifkan"}
            </button>
          </>
        }
      />
    </main>
  );
}