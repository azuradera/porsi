"use client";

import { useState } from "react";

type Customer = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  status: "ACTIVE" | "INACTIVE";
};

type Props = {
  customer: Customer;
  onUpdated: (customer: Customer) => void;
  onCancel: () => void;
};

export default function CustomerEditForm({
  customer,
  onUpdated,
  onCancel,
}: Props) {
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Nama pelanggan wajib diisi.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          phone: phone.trim(),
          address: address.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Gagal memperbarui pelanggan.",
        );
      }

      onUpdated(result.customer);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat memperbarui pelanggan.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="customers-edit-form" onSubmit={handleSubmit}>
      <div className="customers-edit-heading">
        <div>
          <h2>Edit Pelanggan</h2>
          <p>Kode pelanggan tidak dapat diubah.</p>
        </div>
        <span className="customers-code">{customer.code}</span>
      </div>

      <label className="customers-edit-field">
        <span>Nama pelanggan</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          required
          disabled={loading}
        />
      </label>

      <label className="customers-edit-field">
        <span>Nomor telepon</span>
        <input
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          maxLength={20}
          placeholder="Masukkan nomor telepon"
          disabled={loading}
        />
      </label>

      <label className="customers-edit-field">
        <span>Alamat</span>
        <textarea
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          maxLength={5000}
          rows={3}
          placeholder="Masukkan alamat pelanggan"
          disabled={loading}
        />
      </label>

      <div className="customers-edit-info">
        Status pelanggan ditentukan otomatis berdasarkan langganan aktif.
      </div>

      {error && (
        <div className="customers-edit-error" role="alert">
          {error}
        </div>
      )}

      <div className="customers-edit-actions">
        <button
          type="button"
          className="customers-edit-cancel"
          onClick={onCancel}
          disabled={loading}
        >
          Batal
        </button>

        <button
          type="submit"
          className="customers-edit-submit"
          disabled={loading}
        >
          {loading ? "Menyimpan..." : "Simpan Perubahan"}
        </button>
      </div>
    </form>
  );
}