type MonthlyIncome = { label: string; value: number };
type PackageIncome = { name: string; amount: number };
type RecentPayment = {
  id: string;
  customerName: string;
  packageName: string;
  amount: number;
  paymentDate: string;
};

export type IncomeOverviewProps = {
  /** Total pemasukan bulan yang dipilih */
  totalIncome: number;
  /** Total pemasukan bulan sebelumnya (untuk persentase) */
  previousIncome: number;
  /** Jumlah langganan baru di bulan yang dipilih */
  newSubscriptions: number;
  /** 6 bulan terakhir, urutan lama -> baru. Item terakhir = bulan dipilih */
  monthlyIncome: MonthlyIncome[];
  /** Pemasukan dikelompokkan per paket */
  byPackage: PackageIncome[];
  /** Pembayaran terbaru bulan ini */
  recentPayments: RecentPayment[];
  /** Catatan kecil di bawah (opsional) */
  note?: string;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00+07:00`));
}

export default function IncomeOverview({
  totalIncome,
  previousIncome,
  newSubscriptions,
  monthlyIncome,
  byPackage,
  recentPayments,
  note,
}: IncomeOverviewProps) {
  const change =
    previousIncome > 0
      ? Math.round(((totalIncome - previousIncome) / previousIncome) * 100)
      : null;
  const isDown = change !== null && change < 0;

  const average =
    newSubscriptions > 0 ? Math.round(totalIncome / newSubscriptions) : 0;

  const maxMonthly = Math.max(...monthlyIncome.map((m) => m.value), 1);
  const packages = [...byPackage].sort((a, b) => b.amount - a.amount);

  return (
    <section className="income-overview" aria-label="Ringkasan pemasukan">
      <div className="income-overview-top">
        {/* Total pemasukan */}
        <article className="card income-card">
          <span className="income-card-label">Total pemasukan</span>
          <strong className="income-total">{formatCurrency(totalIncome)}</strong>

          {change === null ? (
            <span className="income-trend is-neutral">
              Belum ada data bulan lalu
            </span>
          ) : (
            <span className={`income-trend${isDown ? " is-down" : ""}`}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {isDown ? (
                  <>
                    <path d="m3 7 6 6 4-4 8 9" />
                    <path d="M15 18h6v-6" />
                  </>
                ) : (
                  <>
                    <path d="m3 17 6-6 4 4 8-9" />
                    <path d="M15 6h6v6" />
                  </>
                )}
              </svg>
              <strong>
                {change > 0 ? "+" : ""}
                {change}%
              </strong>{" "}
              dari bulan lalu
            </span>
          )}

          <dl className="income-stats">
            <div>
              <dt>Langganan baru</dt>
              <dd>{newSubscriptions}</dd>
            </div>
            <div>
              <dt>Rata-rata per langganan</dt>
              <dd>{formatCurrency(average)}</dd>
            </div>
          </dl>
        </article>

        {/* Grafik 6 bulan */}
        <article className="card income-card">
          <div className="income-card-head">
            <span className="income-card-label">Pemasukan 6 bulan terakhir</span>
            <span className="income-unit">dalam ribuan rupiah</span>
          </div>

          <div className="income-chart" role="img" aria-label="Grafik pemasukan 6 bulan terakhir">
            {monthlyIncome.map((item, index) => {
              const current = index === monthlyIncome.length - 1;
              const height = Math.max((item.value / maxMonthly) * 100, 2);

              return (
                <div className="income-bar-col" key={`${item.label}-${index}`}>
                  <div className="income-bar-track">
                    <div
                      className={`income-bar${current ? " is-current" : ""}`}
                      style={{ height: `${height}%` }}
                    >
                      <span className="income-bar-value">
                        {Math.round(item.value / 1000)}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`income-bar-label${current ? " is-current" : ""}`}
                  >
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </article>
      </div>

      <div className="income-overview-bottom">
        {/* Per paket */}
        <article className="card income-card">
          <span className="income-card-label">Pemasukan per paket</span>

          {packages.length ? (
            <ul className="income-package-list">
              {packages.map((item) => {
                const percent =
                  totalIncome > 0
                    ? Math.min(Math.round((item.amount / totalIncome) * 100), 100)
                    : 0;

                return (
                  <li key={item.name}>
                    <div className="income-package-row">
                      <strong>{item.name}</strong>
                      <span>{formatCurrency(item.amount)}</span>
                    </div>
                    <div className="income-progress" aria-hidden="true">
                      <div
                        className="income-progress-fill"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <small>{percent}% dari total pemasukan</small>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="income-empty">Belum ada pemasukan di bulan ini.</p>
          )}
        </article>

        {/* Pembayaran terbaru */}
        <article className="card income-card">
          <span className="income-card-label">Pembayaran terbaru</span>

          {recentPayments.length ? (
            <ul className="income-payment-list">
              {recentPayments.slice(0, 5).map((payment) => (
                <li key={payment.id}>
                  <div>
                    <strong>{payment.customerName}</strong>
                    <span>
                      {formatDay(payment.paymentDate)} · {payment.packageName}
                    </span>
                  </div>
                  <strong className="income-payment-amount">
                    +{formatCurrency(payment.amount)}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="income-empty">Belum ada pembayaran di bulan ini.</p>
          )}
        </article>
      </div>

      {note && <p className="income-note">{note}</p>}
    </section>
  );
}
