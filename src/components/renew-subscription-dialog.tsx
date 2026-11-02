"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

type CateringPackage = {
  id: string;
  name: string;
  price: number | string;
  isActive: boolean;
};

type Props = {
  customerId: string;
  customerName: string;
  customerCode: string;
  subscriptionId: string;
  initialPackageId: string;
  initialPaymentType: "FULL" | "HALF";
  initialStartDate: string;
  onSuccess: () => void;
};

function formatCurrency(value: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default function RenewSubscriptionDialog({
  customerName,
  customerCode,
  subscriptionId,
  initialPackageId,
  initialPaymentType,
  initialStartDate,
  onSuccess,
}: Props) {
  const [open, setOpen] = useState(false);
  const [packages, setPackages] = useState<CateringPackage[]>([]);
  const [packageId, setPackageId] = useState("");
  const [paymentType, setPaymentType] = useState<"FULL" | "HALF">(
    initialPaymentType,
  );
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;

    let active = true;

    async function loadPackages() {
      setLoadingPackages(true);

      try {
        const response = await fetch("/api/packages", {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Gagal mengambil paket katering.");
        }

        const activePackages = (
          Array.isArray(data) ? data : []
        ).filter((item: CateringPackage) => item.isActive);

        if (active) {
          setPackages(activePackages);

          const previousPackage = activePackages.find(
            (item: CateringPackage) => item.id === initialPackageId,
          );

          setPackageId(
            previousPackage?.id ?? activePackages[0]?.id ?? "",
          );
          setPaymentType(initialPaymentType);
        }
      } catch (error) {
        if (active) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Gagal mengambil paket katering.",
          );
        }
      } finally {
        if (active) setLoadingPackages(false);
      }
    }

    void loadPackages();

    return () => {
      active = false;
    };
  }, [open, initialPackageId, initialPaymentType]);

  async function handleSubmit() {
    if (!packageId) {
      toast.error("Pilih paket katering terlebih dahulu.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `/api/subscriptions/${subscriptionId}/renew`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            packageId,
            paymentType,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Gagal membuat langganan baru.",
        );
      }

      toast.success(
        "Perpanjangan berhasil",
        `Langganan baru untuk ${customerName} berhasil disimpan.`,
      );

      setOpen(false);
      onSuccess();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat memperpanjang langganan.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="customer-detail-button"
        onClick={() => setOpen(true)}
      >
        Perpanjang
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        busy={saving}
        title="Perpanjang Langganan"
        description="Buat periode langganan baru menggunakan data pelanggan yang sudah tersimpan."
        footer={
          <>
            <button
              type="button"
              className="customers-secondary-button"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              Batal
            </button>

            <button
              type="button"
              className="customers-primary-button"
              onClick={() => void handleSubmit()}
              disabled={saving || loadingPackages || packages.length === 0}
            >
              {saving ? "Menyimpan..." : "Simpan Perpanjangan"}
            </button>
          </>
        }
      >
        <div className="customers-form-grid">
          <div className="customers-field customers-field-full">
            <span>Nama pelanggan</span>
            <strong>{customerName}</strong>
          </div>

          <div className="customers-field customers-field-full">
            <span>Kode pelanggan</span>
            <strong>{customerCode}</strong>
          </div>

          <div className="customers-field customers-field-full">
            <span>Paket katering</span>
            <Select
              value={packageId}
              onChange={setPackageId}
              options={packages.map((item) => ({
                value: item.id,
                label: `${item.name} · ${formatCurrency(item.price)}`,
              }))}
              placeholder={
                loadingPackages
                  ? "Memuat paket..."
                  : "Pilih paket katering"
              }
              disabled={loadingPackages || packages.length === 0}
              aria-label="Paket katering"
            />
          </div>

          <div className="customers-field customers-field-full">
            <span>Periode pembayaran</span>
            <Select
              value={paymentType}
              onChange={(value) =>
                setPaymentType(value as "FULL" | "HALF")
              }
              options={[
                { value: "FULL", label: "30 hari · Bayar penuh" },
                { value: "HALF", label: "15 hari · Setengah harga" },
              ]}
              aria-label="Periode pembayaran"
              disabled={saving}
            />
          </div>

          <div className="customers-field customers-field-full">
            <span>Tanggal mulai</span>
            <strong>{formatDate(initialStartDate)}</strong>
          </div>
        </div>
      </Dialog>
    </>
  );
}