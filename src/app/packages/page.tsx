"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

type Meal = { id: string; mealName: string };

type CateringPackage = {
  id: string;
  name: string;
  description: string | null;
  price: string | number;
  durationDays: number;
  dailyQuota: number;
  isActive: boolean;
  createdAt: string;
  meals: Meal[];
  _count?: { subscriptions: number };
};

type PackageResponse = {
  message?: string;
  package?: CateringPackage;
};

type ConfirmAction = { item: CateringPackage; nextStatus: boolean } | null;

const PRICE_PRESETS = [
  { label: "Rp150 rb", value: "150000" },
  { label: "Rp200 rb", value: "200000" },
  { label: "Rp250 rb", value: "250000" },
  { label: "Rp300 rb", value: "300000" },
  { label: "Rp350 rb", value: "350000" },
  { label: "Rp400 rb", value: "400000" },
];

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<CateringPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const toast = useToast();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [dailyQuota, setDailyQuota] = useState<2 | 3>(2);
  const [mealNames, setMealNames] = useState<string[]>([""]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [deleteTarget, setDeleteTarget] = useState<CateringPackage | null>(null);

  const loadPackages = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/packages", { cache: "no-store" });
      const data = await response.json();

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) {
        throw new Error(data.message ?? "Gagal mengambil data paket.");
      }
      if (!Array.isArray(data)) {
        throw new Error("Format data paket dari server tidak sesuai.");
      }

      setPackages(data);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat mengambil data paket.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  const filteredPackages = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");

    return packages.filter((item) => {
      const matchesSearch =
        !query ||
        item.name.toLocaleLowerCase("id-ID").includes(query) ||
        item.meals.some((meal) =>
          meal.mealName.toLocaleLowerCase("id-ID").includes(query),
        );

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && item.isActive) ||
        (statusFilter === "INACTIVE" && !item.isActive);

      return matchesSearch && matchesStatus;
    });
  }, [packages, search, statusFilter]);

  const summary = useMemo(
    () => ({
      total: packages.length,
      active: packages.filter((item) => item.isActive).length,
      inactive: packages.filter((item) => !item.isActive).length,
      averagePrice:
        packages.length > 0
          ? packages.reduce((total, item) => total + Number(item.price), 0) /
            packages.length
          : 0,
    }),
    [packages],
  );

  function resetForm() {
    setName("");
    setPrice("");
    setDailyQuota(2);
    setMealNames([""]);
  }

  function closeForm() {
    resetForm();
    setEditingPackageId(null);
    setShowForm(false);
  }

  function startCreateForm() {
    resetForm();
    setEditingPackageId(null);
    setShowForm(true);
  }

  function startEditPackage(item: CateringPackage) {
    setEditingPackageId(item.id);
    setName(item.name);
    setPrice(String(Number(item.price)));
    setDailyQuota(item.dailyQuota === 3 ? 3 : 2);
    setMealNames(
      item.meals.length > 0 ? item.meals.map((meal) => meal.mealName) : [""],
    );
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateMealName(index: number, value: string) {
    setMealNames((previous) => {
      const updated = previous.map((meal, i) => (i === index ? value : meal));
      const lastIndex = updated.length - 1;
      if (updated[lastIndex].trim() && updated.length < 10) updated.push("");
      return updated;
    });
  }

  function removeMealField(index: number) {
    setMealNames((previous) => {
      if (previous.length <= 1) return [""];
      const updated = previous.filter((_, i) => i !== index);
      const lastIndex = updated.length - 1;
      if (updated[lastIndex].trim() && updated.length < 10) updated.push("");
      return updated;
    });
  }

  async function handleSavePackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const numericPrice = Number(price);
    const normalizedMeals = mealNames.map((m) => m.trim()).filter(Boolean);

    if (!trimmedName) return toast.error("Nama paket wajib diisi.");
    if (trimmedName.length > 50) return toast.error("Nama paket maksimal 50 karakter.");
    if (!price.trim() || !Number.isFinite(numericPrice) || numericPrice <= 0) {
      return toast.error("Masukkan harga paket yang valid.");
    }
    if (numericPrice > 9999999999.99) return toast.error("Harga paket melebihi batas maksimum.");
    if (Math.round(numericPrice * 100) !== numericPrice * 100) {
      return toast.error("Harga paket maksimal memiliki dua angka desimal.");
    }
    if (normalizedMeals.length === 0) return toast.error("Minimal satu jenis menu harus diisi.");
    if (normalizedMeals.length > 10) return toast.error("Maksimal sepuluh jenis menu per paket.");
    if (normalizedMeals.some((m) => m.length > 50)) return toast.error("Nama menu maksimal 50 karakter.");

    const comparable = normalizedMeals.map((m) => m.toLocaleLowerCase("id-ID"));
    if (new Set(comparable).size !== comparable.length) {
      return toast.error("Jenis menu tidak boleh duplikat.");
    }

    setSaving(true);

    try {
      const isEditing = editingPackageId !== null;
      const endpoint = isEditing ? `/api/packages/${editingPackageId}` : "/api/packages";

      const response = await fetch(endpoint, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          price: numericPrice,
          dailyQuota,
          mealNames: normalizedMeals,
        }),
      });

      const data: PackageResponse = await response.json();

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) {
        throw new Error(
          data.message ??
            (isEditing ? "Gagal memperbarui paket." : "Gagal membuat paket katering."),
        );
      }

      toast.success(
        data.message ??
          (isEditing ? "Paket berhasil diperbarui." : "Paket katering berhasil dibuat."),
      );
      resetForm();
      setEditingPackageId(null);
      setShowForm(false);
      await loadPackages();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan paket.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePackage() {
    if (!confirmAction) return;
    const { item, nextStatus } = confirmAction;

    setSaving(true);

    try {
      const response = await fetch(`/api/packages/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextStatus }),
      });
      const data: PackageResponse = await response.json();

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) {
        throw new Error(data.message ?? "Gagal mengubah status paket.");
      }
      if (!data.package) {
        throw new Error("Server tidak mengembalikan data paket terbaru.");
      }

      const updated = data.package;
      setPackages((previous) =>
        previous.map((p) => (p.id === updated.id ? updated : p)),
      );
      setConfirmAction(null);
      toast.success(
        nextStatus
          ? `Paket "${item.name}" berhasil diaktifkan.`
          : `Paket "${item.name}" berhasil dinonaktifkan.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Terjadi kesalahan saat mengubah status paket.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePackage() {
    if (!deleteTarget) return;
    const item = deleteTarget;

    setSaving(true);

    try {
      const response = await fetch(`/api/packages/${item.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data: PackageResponse = await response.json();

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) {
        throw new Error(data.message ?? "Gagal menghapus paket.");
      }

      setPackages((previous) => previous.filter((p) => p.id !== item.id));
      setDeleteTarget(null);
      toast.success(data.message ?? "Paket berhasil dihapus secara permanen.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Terjadi kesalahan saat menghapus paket.",
      );
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="packages-page">
      <header className="packages-heading">
        <div>
          <div className="packages-eyebrow">MANAJEMEN KATERING</div>
          <h1>Paket Katering</h1>
          <p>Atur pilihan paket, menu, kuota harian, dan harga langganan.</p>
        </div>

        <div className="packages-heading-actions">
          <Link href="/" className="packages-secondary-button">
            Dashboard
          </Link>
          <button
            type="button"
            className="packages-refresh-button"
            onClick={() => void loadPackages()}
            disabled={loading || saving}
          >
            {loading ? "Memuat..." : "↻ Segarkan"}
          </button>

          <button
            type="button"
            className="packages-primary-button"
            onClick={() => (showForm ? closeForm() : startCreateForm())}
            disabled={saving}
          >
            {showForm ? "Tutup Form" : "+ Tambah Paket"}
          </button>
        </div>
      </header>

      <section className="packages-stats page-stats">
        <article className="packages-stat-card">
          <span className="packages-stat-label">Total Paket</span>
          <strong>{summary.total}</strong>
          <small>Semua paket terdaftar</small>
        </article>

        <article className="packages-stat-card">
          <span className="packages-stat-label">Paket Aktif</span>
          <strong>{summary.active}</strong>
          <small>Dapat dipilih untuk langganan</small>
        </article>

        <article className="packages-stat-card">
          <span className="packages-stat-label">Paket Nonaktif</span>
          <strong>{summary.inactive}</strong>
          <small>Tidak tersedia untuk langganan baru</small>
        </article>

        <article className="packages-stat-card">
          <span className="packages-stat-label">Rata-rata Harga</span>
          <strong className="packages-average-price">
            {formatCurrency(summary.averagePrice)}
          </strong>
          <small>Rata-rata seluruh paket</small>
        </article>
      </section>

      {showForm && (
        <section className="packages-form-panel panel">
          <div className="packages-section-heading">
            <div>
              <h2>{editingPackageId ? "Edit Paket" : "Tambah Paket Baru"}</h2>
              <p>
                {editingPackageId
                  ? "Perbarui nama, harga, kuota, atau pilihan menu."
                  : "Buat paket katering dengan durasi awal 30 hari."}
              </p>
            </div>
          </div>

          <form className="packages-form" onSubmit={handleSavePackage}>
            <label className="packages-field">
              <span>Nama Paket *</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Contoh: Paket Ayam Ikan Lele"
                maxLength={50}
                required
              />
            </label>

            <div className="packages-field">
              <span>Harga Paket untuk 30 Hari *</span>

              <div className="packages-price-presets">
                {PRICE_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.value}
                    className={`packages-price-preset ${
                      price === preset.value ? "is-selected" : ""
                    }`}
                    onClick={() => setPrice(preset.value)}
                    disabled={saving}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="packages-price-input">
                <span>Rp</span>
                <input
                  type="number"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="Atau masukkan harga sendiri"
                  min="0"
                  max="9999999999.99"
                  step="1000"
                  required
                />
              </div>

              {price && Number(price) > 0 && (
                <small>
                  Perkiraan harga untuk 15 hari: {formatCurrency(Number(price) / 2)}
                </small>
              )}
            </div>

            <div className="packages-field">
              <span>Kuota Pengambilan Harian *</span>
              <Select
                value={String(dailyQuota)}
                onChange={(v) => setDailyQuota(Number(v) as 2 | 3)}
                aria-label="Kuota pengambilan harian"
                options={[
                  { value: "2", label: "2 kali pengambilan per hari" },
                  { value: "3", label: "3 kali pengambilan per hari" },
                ]}
              />
              <small>
                Kuota menentukan jumlah pengambilan yang tersedia setiap hari.
              </small>
            </div>

            <div className="packages-meals-field">
              <div className="packages-meals-heading">
                <div>
                  <span>Daftar Menu *</span>
                  <small>Isi minimal satu menu. Kolom kosong akan diabaikan.</small>
                </div>
              </div>

              <div className="packages-meal-inputs">
                {mealNames.map((meal, index) => (
                  <div
                    className="packages-meal-input-row"
                    key={`${editingPackageId ?? "new"}-${index}`}
                  >
                    <span className="packages-meal-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <input
                      type="text"
                      value={meal}
                      onChange={(event) => updateMealName(index, event.target.value)}
                      placeholder={`Nama menu ${index + 1}`}
                      maxLength={50}
                      aria-label={`Nama menu ${index + 1}`}
                      disabled={saving}
                    />

                    <button
                      type="button"
                      className="packages-remove-meal-button"
                      onClick={() => removeMealField(index)}
                      disabled={mealNames.length <= 1 || saving}
                      aria-label={`Hapus menu ${index + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <small className="packages-meal-count">
                {mealNames.filter((m) => m.trim()).length} dari 10 menu diisi
              </small>
            </div>

            <div className="packages-form-note">
              <span>ⓘ</span>
              <p>
                Durasi awal paket adalah 30 hari. Pembayaran 15 hari dihitung
                setengah dari harga paket. Mengubah harga paket tidak mengubah
                nominal pembayaran yang sudah tercatat.
              </p>
            </div>

            <div className="packages-form-actions">
              <button
                type="button"
                className="packages-secondary-button"
                onClick={closeForm}
                disabled={saving}
              >
                Batal
              </button>

              <button type="submit" className="packages-primary-button" disabled={saving}>
                {saving
                  ? "Menyimpan..."
                  : editingPackageId
                    ? "Simpan Perubahan"
                    : "Simpan Paket"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="packages-list-panel panel">
        <div className="packages-section-heading">
          <div>
            <h2>Daftar Paket</h2>
            <p>
              Menampilkan {filteredPackages.length} dari {packages.length} paket.
            </p>
          </div>
        </div>

        <div className="packages-filters">
          <label className="packages-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari paket atau jenis menu..."
            />
          </label>

          <div className="packages-status-filter">
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              aria-label="Filter status paket"
              options={[
                { value: "ALL", label: "Semua status" },
                { value: "ACTIVE", label: "Aktif" },
                { value: "INACTIVE", label: "Nonaktif" },
              ]}
            />
          </div>
        </div>

        {loading ? (
          <div className="packages-empty-state">
            <span className="packages-loading-indicator" />
            <p>Memuat daftar paket...</p>
          </div>
        ) : filteredPackages.length === 0 ? (
          <div className="packages-empty-state">
            <h3>Belum ada paket yang cocok</h3>
            <p>Ubah pencarian atau tambahkan paket katering baru.</p>
          </div>
        ) : (
          <div className="packages-grid">
            {filteredPackages.map((item, index) => (
              <article className="packages-card" key={item.id}>
                <div className="packages-card-top">
                  <span className="packages-card-number">
                    PAKET {String(index + 1).padStart(2, "0")}
                  </span>

                  <span
                    className={`packages-status-badge ${
                      item.isActive ? "active" : "inactive"
                    }`}
                  >
                    <span />
                    {item.isActive ? "Aktif" : "Nonaktif"}
                  </span>
                </div>

                <div className="packages-card-main">
                  <h3>{item.name}</h3>
                  <p>Paket katering untuk kebutuhan harian.</p>
                </div>

                <div className="packages-card-price">
                  <strong>{formatCurrency(item.price)}</strong>
                  <span>/ 30 hari</span>
                </div>

                <div className="packages-card-divider" />

                <div className="packages-card-info">
                  <div>
                    <span>Durasi</span>
                    <strong>{item.durationDays} hari</strong>
                  </div>
                  <div>
                    <span>Kuota Harian</span>
                    <strong>{item.dailyQuota} kali</strong>
                  </div>
                </div>

                <div className="packages-card-meals">
                  <span className="packages-card-meals-title">Pilihan Menu</span>
                  <div className="packages-meal-chips">
                    {item.meals.map((meal) => (
                      <span key={meal.id}>{meal.mealName}</span>
                    ))}
                  </div>
                </div>

                <div className="packages-card-footer">
                  <span>Dibuat {formatDate(item.createdAt)}</span>
                </div>

                <div className="packages-card-actions">
                  <button
                    type="button"
                    className="packages-secondary-button"
                    onClick={() => startEditPackage(item)}
                    disabled={saving}
                  >
                    Edit Paket
                  </button>

                  <button
                    type="button"
                    className={`packages-toggle-button ${
                      item.isActive ? "is-inactive" : "is-active"
                    }`}
                    onClick={() =>
                      setConfirmAction({ item, nextStatus: !item.isActive })
                    }
                    disabled={saving}
                  >
                    {item.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </button>

                  {(item._count?.subscriptions ?? 0) === 0 ? (
                    <button
                      type="button"
                      className="packages-delete-button"
                      onClick={() => setDeleteTarget(item)}
                      disabled={saving}
                    >
                      Hapus Paket
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <Dialog
        open={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        busy={saving}
        danger={confirmAction ? !confirmAction.nextStatus : false}
        icon={confirmAction?.nextStatus ? "✓" : "!"}
        title={confirmAction?.nextStatus ? "Aktifkan paket?" : "Nonaktifkan paket?"}
        description={
          confirmAction?.nextStatus
            ? `Paket "${confirmAction.item.name}" akan tersedia kembali untuk langganan baru.`
            : `Paket "${confirmAction?.item.name}" tidak dapat digunakan untuk langganan baru. Langganan dan riwayat lama tetap dipertahankan.`
        }
        footer={
          <>
            <button
              type="button"
              className="packages-secondary-button"
              onClick={() => setConfirmAction(null)}
              disabled={saving}
            >
              Batal
            </button>
            <button
              type="button"
              className={
                confirmAction?.nextStatus
                  ? "packages-primary-button"
                  : "packages-toggle-button is-inactive"
              }
              onClick={() => void handleTogglePackage()}
              disabled={saving}
            >
              {saving
                ? "Memproses..."
                : confirmAction?.nextStatus
                  ? "Ya, aktifkan"
                  : "Ya, nonaktifkan"}
            </button>
          </>
        }
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        busy={saving}
        danger
        icon="!"
        title="Hapus paket permanen?"
        description={
          deleteTarget
            ? `Paket "${deleteTarget.name}" (${formatCurrency(deleteTarget.price)}) akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.`
            : ""
        }
        footer={
          <>
            <button
              type="button"
              className="packages-secondary-button"
              onClick={() => setDeleteTarget(null)}
              disabled={saving}
            >
              Batal
            </button>
            <button
              type="button"
              className="packages-delete-button"
              onClick={() => void handleDeletePackage()}
              disabled={saving}
            >
              {saving ? "Menghapus..." : "Ya, hapus permanen"}
            </button>
          </>
        }
      />
    </main>
  );
}