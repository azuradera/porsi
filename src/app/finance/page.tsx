"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MonthPicker } from "@/components/ui/month-picker";
import { useToast } from "@/components/ui/toast";
import IncomeOverview from "@/components/income-overview";

type ExpenseCategory =
  | "INGREDIENTS"
  | "TRANSPORT"
  | "PACKAGING"
  | "SALARY"
  | "UTILITIES"
  | "EQUIPMENT"
  | "OTHER";

type Expense = {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number | string;
  expenseDate: string;
  notes: string | null;
  createdAt?: string;
};

type Payment = {
  id: string;
  amount: number | string;
  paymentDate: string;
  method?: string;
  notes?: string | null;
  customerCode: string;
  customerName: string;
  packageName: string;
};

type FinanceReport = {
  month: string;
  summary?: Record<string, number | undefined>;
  payments?: Payment[];
  expenses?: Expense[];
  message?: string;
  [key: string]: unknown;
};

type ExpenseResponse = { expenses?: Expense[]; message?: string };

type Transaction = {
  id: string;
  description: string;
  detail: string;
  date: string;
  amount: number;
  type: "income" | "expense";
  category: string;
};

const categories: { value: ExpenseCategory; label: string }[] = [
  { value: "INGREDIENTS", label: "Bahan makanan" },
  { value: "TRANSPORT", label: "Transportasi" },
  { value: "PACKAGING", label: "Kemasan" },
  { value: "SALARY", label: "Gaji" },
  { value: "UTILITIES", label: "Listrik dan air" },
  { value: "EQUIPMENT", label: "Peralatan" },
  { value: "OTHER", label: "Lainnya" },
];

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

const getCategoryLabel = (value: string) =>
  categories.find((c) => c.value === value)?.label ?? value;

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
    const response = await fetch(`/api/reports/finance?month=${targetMonth}`, {
      cache: "no-store",
    });
    if (!response.ok) return 0;
    const data = (await response.json()) as FinanceReport;
    return Array.isArray(data.payments)
      ? data.payments.reduce((sum, p) => sum + Number(p.amount), 0)
      : 0;
  } catch {
    return 0;
  }
};

export default function FinancePage() {
  const [month, setMonth] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "income" | "expense">("all");
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
      const lastDay = getLastDayOfMonth(month);
      const previousMonths = [-5, -4, -3, -2, -1].map((o) => shiftMonth(month, o));

      const [expenseResponse, reportResponse, previousTotals] = await Promise.all([
        fetch(
          `/api/expenses?startDate=${month}-01&endDate=${month}-${String(lastDay).padStart(2, "0")}`,
          { cache: "no-store" },
        ),
        fetch(`/api/reports/finance?month=${month}`, { cache: "no-store" }),
        Promise.all(previousMonths.map(fetchMonthIncome)),
      ]);

      const expenseData = (await expenseResponse.json()) as ExpenseResponse;
      const reportData = (await reportResponse.json()) as FinanceReport;

      if (!expenseResponse.ok) {
        throw new Error(expenseData.message || "Gagal mengambil data pengeluaran");
      }
      if (!reportResponse.ok) {
        throw new Error(reportData.message || "Gagal mengambil laporan keuangan");
      }

      setExpenses(Array.isArray(expenseData.expenses) ? expenseData.expenses : []);
      setPayments(Array.isArray(reportData.payments) ? reportData.payments : []);
      setHistory(
        previousMonths.map((m, i) => ({
          label: monthShortLabel(m),
          value: previousTotals[i],
        })),
      );
    } catch (err) {
      toast.error(getErrorMessage(err));
      setExpenses([]);
      setPayments([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (!initialized || !month) return;
    void loadFinance();
  }, [initialized, month, loadFinance]);

  const totalIncome = useMemo(
    () => payments.reduce((sum, p) => sum + Number(p.amount), 0),
    [payments],
  );

  const totalExpenses = useMemo(
    () => expenses.reduce((sum, e) => sum + Number(e.amount), 0),
    [expenses],
  );

  const netCashFlow = totalIncome - totalExpenses;

  const monthlyIncome = useMemo(
    () => [
      ...history,
      { label: month ? monthShortLabel(month) : "", value: totalIncome },
    ],
    [history, month, totalIncome],
  );

  const previousIncome = history.length ? history[history.length - 1].value : 0;

  const byPackage = useMemo(() => {
    const map = new Map<string, number>();
    payments.forEach((p) =>
      map.set(p.packageName, (map.get(p.packageName) ?? 0) + Number(p.amount)),
    );
    return Array.from(map, ([name, amount]) => ({ name, amount }));
  }, [payments]);

  const recentPayments = useMemo(
    () =>
      [...payments]
        .sort((a, b) =>
          b.paymentDate.slice(0, 10).localeCompare(a.paymentDate.slice(0, 10)),
        )
        .map((p) => ({
          id: p.id,
          customerName: p.customerName,
          packageName: p.packageName,
          amount: Number(p.amount),
          paymentDate: p.paymentDate,
        })),
    [payments],
  );

  const transactions = useMemo<Transaction[]>(() => {
    const incomeTransactions: Transaction[] = payments.map((payment) => ({
      id: `income-${payment.id}`,
      description: payment.customerName,
      detail: `${payment.customerCode} · ${payment.packageName}`,
      date: payment.paymentDate,
      amount: Number(payment.amount),
      type: "income",
      category: "Pembayaran langganan",
    }));

    const expenseTransactions: Transaction[] = expenses.map((expense) => ({
      id: `expense-${expense.id}`,
      description: expense.description,
      detail: expense.notes || getCategoryLabel(expense.category),
      date: expense.expenseDate,
      amount: Number(expense.amount),
      type: "expense",
      category: getCategoryLabel(expense.category),
    }));

    return [...incomeTransactions, ...expenseTransactions].sort((a, b) =>
      b.date.slice(0, 10).localeCompare(a.date.slice(0, 10)),
    );
  }, [payments, expenses]);

  const filteredTransactions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return transactions.filter((t) => {
      const matchesTab = activeTab === "all" || t.type === activeTab;
      const matchesSearch =
        !keyword ||
        t.description.toLowerCase().includes(keyword) ||
        t.detail.toLowerCase().includes(keyword) ||
        t.category.toLowerCase().includes(keyword);
      return matchesTab && matchesSearch;
    });
  }, [transactions, activeTab, search]);

  const handleExport = () => {
    const keyword = search.trim().toLowerCase();

    const exportPayments = payments.filter((payment) => {
      return (
        !keyword ||
        payment.customerName.toLowerCase().includes(keyword) ||
        payment.customerCode.toLowerCase().includes(keyword) ||
        payment.packageName.toLowerCase().includes(keyword) ||
        (payment.method ?? "").toLowerCase().includes(keyword) ||
        (payment.notes ?? "").toLowerCase().includes(keyword)
      );
    });

    if (exportPayments.length === 0) {
      toast.error("Tidak ada data pemasukan untuk diekspor");
      return;
    }

    const header = [
      "Tanggal",
      "ID Pelanggan",
      "Nama Pelanggan",
      "Paket",
      "Nominal",
      "Metode Pembayaran",
      "Keterangan",
    ];

    const rows = exportPayments.map((payment) => [
      payment.paymentDate.slice(0, 10),
      payment.customerCode,
      payment.customerName,
      payment.packageName,
      Number(payment.amount),
      payment.method || "Tidak dicantumkan",
      payment.notes || "Pembayaran langganan",
    ]);

    const escapeCsv = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;

    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(";"))
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

  const incomeFiltered = filteredTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <main className="finance-page">
      <header className="finance-header">
        <div className="finance-heading">
          <div>
            <span className="finance-eyebrow">MANAJEMEN USAHA</span>
            <h1>Keuangan</h1>
            <p>
              Catat pemasukan dan pengeluaran usaha katering dalam satu tempat.
            </p>
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

        <article
          className={`finance-summary-card ${
            netCashFlow >= 0 ? "finance-net-positive" : "finance-net-negative"
          }`}
        >
          <span className="finance-summary-label">Arus kas bersih</span>
          <strong>{formatRupiah(netCashFlow)}</strong>
          <p>
            {netCashFlow >= 0
              ? "Pemasukan lebih besar daripada pengeluaran"
              : "Pengeluaran lebih besar daripada pemasukan"}
          </p>
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
              <span className="finance-eyebrow">BUKU KAS</span>
              <h2>Riwayat transaksi</h2>
              <p>Semua transaksi yang tercatat pada bulan terpilih.</p>
            </div>

            <label className="finance-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari transaksi..."
                aria-label="Cari transaksi"
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

        <div className="finance-transaction-controls">
          <div className="finance-tabs" role="tablist" aria-label="Jenis transaksi">
            {(
              [
                { key: "all", label: "Semua" },
                { key: "income", label: "Pemasukan" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={activeTab === tab.key ? "active" : ""}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="finance-state">
            <span className="finance-spinner" />
            <p>Memuat data keuangan...</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="finance-empty">
            <h3>Belum ada transaksi</h3>
            <p>
              {search
                ? "Tidak ada transaksi yang sesuai dengan pencarian."
                : "Transaksi pada periode ini akan muncul di sini."}
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
                    <th>Jenis</th>
                    <th className="finance-amount-cell">Nominal</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTransactions.map((t) => (
                    <tr key={t.id}>
                      <td className="finance-date-cell">{formatDate(t.date)}</td>
                      <td>
                        <div className="finance-transaction-name">
                          <strong>{t.description}</strong>
                          <span>{t.detail}</span>
                        </div>
                      </td>
                      <td>
                        <span className="finance-category">{t.category}</span>
                      </td>
                      <td>
                        <span
                          className={`finance-type-badge ${
                            t.type === "income" ? "income" : "expense"
                          }`}
                        >
                          {t.type === "income" ? "Pemasukan" : "Pengeluaran"}
                        </span>
                      </td>
                      <td
                        className={`finance-amount-cell ${
                          t.type === "income"
                            ? "finance-amount-income"
                            : "finance-amount-expense"
                        }`}
                      >
                        {t.type === "income" ? "+" : "−"}
                        {formatRupiah(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="finance-mobile-transactions">
              {filteredTransactions.map((t) => (
                <article className="finance-mobile-transaction" key={t.id}>
                  <div className="finance-mobile-transaction-top">
                    <span
                      className={`finance-type-badge ${
                        t.type === "income" ? "income" : "expense"
                      }`}
                    >
                      {t.type === "income" ? "Pemasukan" : "Pengeluaran"}
                    </span>
                    <time>{formatDate(t.date)}</time>
                  </div>

                  <strong>{t.description}</strong>
                  <span className="finance-mobile-detail">{t.detail}</span>

                  <div className="finance-mobile-transaction-bottom">
                    <span>{t.category}</span>
                    <strong
                      className={
                        t.type === "income"
                          ? "finance-amount-income"
                          : "finance-amount-expense"
                      }
                    >
                      {t.type === "income" ? "+" : "−"}
                      {formatRupiah(t.amount)}
                    </strong>
                  </div>
                </article>
              ))}
            </div>

            <footer className="finance-table-footer">
              <span>Menampilkan {filteredTransactions.length} transaksi</span>
              <span>Pemasukan {formatRupiah(incomeFiltered)}</span>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}