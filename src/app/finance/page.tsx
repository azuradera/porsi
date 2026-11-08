"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MonthPicker } from "@/components/ui/month-picker";
import { useToast } from "@/components/ui/toast";
import IncomeOverview from "@/components/income-overview";

type Payment = {
  id: string;
  amount: number | string;
  paymentDate: string;
  notes?: string | null;
  customerCode: string;
  customerName: string;
  packageName: string;
};

type FinanceReport = {
  month: string;
  payments?: Payment[];
  message?: string;
};

type Transaction = {
  id: string;
  description: string;
  detail: string;
  date: string;
  amount: number;
  category: string;
};

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const getLastDayOfMonth = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
};

const formatRupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (value: string) => {
  const date = value.slice(0, 10);
  const [year, month, day] = date.split("-").map(Number);

  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Terjadi kesalahan";

const shiftMonth = (month: string, offset: number) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const monthShortLabel = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);

  return new Intl.DateTimeFormat("id-ID", { month: "short" }).format(
    new Date(year, monthNumber - 1, 1),
  );
};

const fetchMonthIncome = async (targetMonth: string) => {
  try {
    const response = await fetch(
      `/api/reports/finance?month=${targetMonth}`,
      { cache: "no-store" },
    );

    if (!response.ok) return 0;

    const data = (await response.json()) as FinanceReport;

    return Array.isArray(data.payments)
      ? data.payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
      : 0;
  } catch {
    return 0;
  }
};

export default function FinancePage() {
  const [month, setMonth] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [history, setHistory] = useState<{ label: string; value: number }[]>([]);
  const toast = useToast();

  useEffect(() => {
    setMonth(currentMonth());
    setInitialized(true);
  }, []);

  const loadFinance = useCallback(async () => {
    if (!month) return;

    setLoading(true);

    try {
      const previousMonths = [-5, -4, -3, -2, -1].map((offset) =>
        shiftMonth(month, offset),
      );

      const [reportResponse, previousTotals] = await Promise.all([
        fetch(`/api/reports/finance?month=${month}`, {
          cache: "no-store",
        }),
        Promise.all(previousMonths.map(fetchMonthIncome)),
      ]);

      const reportData = (await reportResponse.json()) as FinanceReport;

      if (!reportResponse.ok) {
        throw new Error(
          reportData.message || "Gagal mengambil laporan keuangan",
        );
      }

      setPayments(
        Array.isArray(reportData.payments) ? reportData.payments : [],
      );

      setHistory(
        previousMonths.map((previousMonth, index) => ({
          label: monthShortLabel(previousMonth),
          value: previousTotals[index],
        })),
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
      setPayments([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [month, toast]);

  useEffect(() => {
    if (!initialized || !month) return;
    void loadFinance();
  }, [initialized, month, loadFinance]);

  const totalIncome = useMemo(
    () => payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    [payments],
  );

  const monthlyIncome = useMemo(
    () => [
      ...history,
      { label: month ? monthShortLabel(month) : "", value: totalIncome },
    ],
    [history, month, totalIncome],
  );

  const previousIncome = history.length
    ? history[history.length - 1].value
    : 0;

  const byPackage = useMemo(() => {
    const map = new Map<string, number>();

    payments.forEach((payment) => {
      map.set(
        payment.packageName,
        (map.get(payment.packageName) ?? 0) + Number(payment.amount),
      );
    });

    return Array.from(map, ([name, amount]) => ({ name, amount }));
  }, [payments]);

  const recentPayments = useMemo(
    () =>
      [...payments]
        .sort((a, b) =>
          b.paymentDate
            .slice(0, 10)
            .localeCompare(a.paymentDate.slice(0, 10)),
        )
        .map((payment) => ({
          id: payment.id,
          customerName: payment.customerName,
          packageName: payment.packageName,
          amount: Number(payment.amount),
          paymentDate: payment.paymentDate,
        })),
    [payments],
  );

  const transactions = useMemo<Transaction[]>(
    () =>
      payments.map((payment) => ({
        id: payment.id,
        description: payment.customerName,
        detail: `${payment.customerCode} · ${payment.packageName}`,
        date: payment.paymentDate,
        amount: Number(payment.amount),
        category: "Pembayaran langganan",
      })),
    [payments],
  );

  const filteredTransactions = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return transactions.filter(
      (transaction) =>
        !keyword ||
        transaction.description.toLowerCase().includes(keyword) ||
        transaction.detail.toLowerCase().includes(keyword) ||
        transaction.category.toLowerCase().includes(keyword),
    );
  }, [transactions, search]);

  const handleExport = () => {
    if (filteredTransactions.length === 0) {
      toast.error("Tidak ada data pemasukan untuk diekspor");
      return;
    }

    const header = [
      "Tanggal",
      "ID Pelanggan",
      "Nama Pelanggan",
      "Paket",
      "Nominal",
      "Keterangan",
    ];

    const rows = payments
      .filter((payment) =>
        filteredTransactions.some(
          (transaction) => transaction.id === payment.id,
        ),
      )
      .map((payment) => [
        payment.paymentDate.slice(0, 10),
        payment.customerCode,
        payment.customerName,
        payment.packageName,
        Number(payment.amount),
        payment.notes || "Pembayaran langganan",
      ]);

    const escapeCsv = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;

    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `laporan-pemasukan-${month}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  return (
    <main className="finance-page">
      <header className="finance-header">
        <div className="finance-heading">
          <div>
            <span className="finance-eyebrow">MANAJEMEN USAHA</span>
            <h1>Keuangan</h1>
            <p>Kelola pemasukan dari pembayaran langganan katering.</p>
          </div>
        </div>

        <div className="finance-header-actions">
          <div className="finance-month-picker">
            <span>Periode laporan</span>
            <MonthPicker
              value={month}
              onChange={setMonth}
              aria-label="Periode laporan"
            />
          </div>

          <div className="finance-action-buttons">
            <Link href="/" className="finance-back">
              <span>Dashboard</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="finance-summary-grid page-stats">
        <article className="finance-summary-card finance-income-card">
          <span className="finance-summary-label">Total pemasukan</span>
          <strong>{formatRupiah(totalIncome)}</strong>
          <p>Dari pembayaran yang tercatat pada periode ini</p>
        </article>
      </section>

      {!loading && (
        <IncomeOverview
          totalIncome={totalIncome}
          previousIncome={previousIncome}
          newSubscriptions={payments.length}
          monthlyIncome={monthlyIncome}
          byPackage={byPackage}
          recentPayments={recentPayments}
        />
      )}

      <section className="finance-transactions-card panel">
        <div className="finance-transactions-heading">
          <div className="finance-transactions-title-group">
            <div>
              <span className="finance-eyebrow">RIWAYAT PEMBAYARAN</span>
              <h2>Riwayat transaksi</h2>
              <p>Daftar pembayaran langganan pada bulan terpilih.</p>
            </div>

            <label className="finance-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari pembayaran..."
                aria-label="Cari pembayaran"
              />
            </label>
          </div>

          <button
            type="button"
            className="finance-export-button"
            onClick={handleExport}
            disabled={filteredTransactions.length === 0}
          >
            <span aria-hidden="true">↓</span>
            Ekspor CSV
          </button>
        </div>

        {loading ? (
          <div className="finance-state">
            <span className="finance-spinner" />
            <p>Memuat data keuangan...</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="finance-empty">
            <h3>Belum ada pembayaran</h3>
            <p>
              {search
                ? "Tidak ada pembayaran yang sesuai dengan pencarian."
                : "Pembayaran pada periode ini akan muncul di sini."}
            </p>
          </div>
        ) : (
          <>
            <div className="finance-table-wrap">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Transaksi</th>
                    <th>Kategori</th>
                    <th className="finance-amount-cell">Nominal</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTransactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="finance-date-cell">
                        {formatDate(transaction.date)}
                      </td>
                      <td>
                        <div className="finance-transaction-name">
                          <strong>{transaction.description}</strong>
                          <span>{transaction.detail}</span>
                        </div>
                      </td>
                      <td>
                        <span className="finance-category">
                          {transaction.category}
                        </span>
                      </td>
                      <td className="finance-amount-cell finance-amount-income">
                        +{formatRupiah(transaction.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="finance-mobile-transactions">
              {filteredTransactions.map((transaction) => (
                <article
                  className="finance-mobile-transaction"
                  key={transaction.id}
                >
                  <div className="finance-mobile-transaction-top">
                    <span className="finance-type-badge income">
                      Pemasukan
                    </span>
                    <time>{formatDate(transaction.date)}</time>
                  </div>

                  <strong>{transaction.description}</strong>
                  <span className="finance-mobile-detail">
                    {transaction.detail}
                  </span>

                  <div className="finance-mobile-transaction-bottom">
                    <span>{transaction.category}</span>
                    <strong className="finance-amount-income">
                      +{formatRupiah(transaction.amount)}
                    </strong>
                  </div>
                </article>
              ))}
            </div>

            <footer className="finance-table-footer">
              <span>
                Menampilkan {filteredTransactions.length} pembayaran
              </span>
              <span>
                Total {formatRupiah(
                  filteredTransactions.reduce(
                    (sum, transaction) => sum + transaction.amount,
                    0,
                  ),
                )}
              </span>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}