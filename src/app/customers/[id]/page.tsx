"use client";

import { Suspense,useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import CustomerEditForm from "@/components/customer-edit-form";
import { useToast } from "@/components/ui/toast";


type Customer = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt?: string;
};

type Payment = {
  id: string;
  amount: number | string;
  paymentDate: string;
  method: string | null;
  notes: string | null;
};

type Extension = {
  id: string;
  type: string;
  days: number;
  reason: string | null;
  previousEndDate: string;
  newEndDate: string;
  createdAt: string;
};

type Subscription = {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  price: number | string;
  startDate: string;
  endDate: string;
  package: {
    id: string;
    name: string;
    dailyQuota: number;
    meals?: { id: string; mealName: string }[];
  };
  payments: Payment[];
  extensions: Extension[];
};

type Pickup = {
  id: string;
  date: string;
  time: string;
  quantity: number;
  customer: { id: string; code: string; name: string };
  subscription: {
    id: string;
    status: string;
    startDate: string;
    endDate: string;
  };
  package: { id: string; name: string; dailyQuota: number };
  meal: { id: string; name: string };
  dailyUsedQuota: number;
  remainingQuota: number;
};

type NoMealDay = {
  id: string;
  date: string;
  processed: boolean;
  customer: { id: string; code: string; name: string };
  subscription: {
    id: string;
    status: string;
    packageName: string;
    startDate: string;
    endDate: string;
  };
  extension: {
    id: string;
    type: string;
    days: number;
    previousEndDate: string;
    newEndDate: string;
  } | null;
};

type CalendarData = {
  pickups: Pickup[];
  noMealDays: NoMealDay[];
};

type DayInfo = {
  date: string;
  pickups: Pickup[];
  noMealDays: NoMealDay[];
};

const monthNames = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const dayNames = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value: string) {
  return parseDate(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(value: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function getMonthRange(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  return {
    startDate: dateKey(first),
    endDate: dateKey(last),
  };
}

function getSubscriptionStatus(status: Subscription["status"]) {
  if (status === "ACTIVE") return "Aktif";
  if (status === "COMPLETED") return "Selesai";
  return "Dibatalkan";
}

function CustomerDetailContent() {
  const params = useParams<{ id: string }>();;
  const router = useRouter();
  const customerId = params.id;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [calendar, setCalendar] = useState<CalendarData>({
    pickups: [],
    noMealDays: [],
  });

  const [loading, setLoading] = useState(true);
  const [error] = useState("");
  const toast = useToast();
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [selectedDate, setSelectedDate] = useState<DayInfo | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const { startDate, endDate } = getMonthRange(
        currentMonth.year,
        currentMonth.month,
      );

      const [customerResponse, subscriptionResponse, calendarResponse] =
        await Promise.all([
          fetch(`/api/customers/${customerId}`, { cache: "no-store" }),
          fetch(
            `/api/subscriptions?customerId=${encodeURIComponent(customerId)}`,
            { cache: "no-store" },
          ),
          fetch(
            `/api/calendar?startDate=${startDate}&endDate=${endDate}`,
            { cache: "no-store" },
          ),
        ]);

      const [customerData, subscriptionData, calendarData] =
        await Promise.all([
          customerResponse.json(),
          subscriptionResponse.json(),
          calendarResponse.json(),
        ]);

      if (!customerResponse.ok) {
        throw new Error(
          customerData.message || "Gagal mengambil data pelanggan.",
        );
      }

      if (!subscriptionResponse.ok) {
        throw new Error(
          subscriptionData.message || "Gagal mengambil riwayat langganan.",
        );
      }

      if (!calendarResponse.ok) {
        throw new Error(
          calendarData.message || "Gagal mengambil data kalender.",
        );
      }

      setCustomer(customerData.customer);
      setSubscriptions(subscriptionData.subscriptions ?? []);
      setCalendar({
        pickups: (calendarData.pickups ?? []).filter(
          (item: Pickup) => item.customer.id === customerId,
        ),
        noMealDays: (calendarData.noMealDays ?? []).filter(
          (item: NoMealDay) => item.customer.id === customerId,
        ),
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat mengambil data.",
      );
    } finally {
      setLoading(false);
    }
  }, [customerId, currentMonth]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeSubscription = useMemo(
    () =>
      subscriptions.find((subscription) => subscription.status === "ACTIVE") ??
      null,
    [subscriptions],
  );

  const calendarDays = useMemo(() => {
    const first = new Date(currentMonth.year, currentMonth.month, 1);
    const last = new Date(currentMonth.year, currentMonth.month + 1, 0);
    const mondayOffset = (first.getDay() + 6) % 7;
    const totalCells = Math.ceil((mondayOffset + last.getDate()) / 7) * 7;

    return Array.from({ length: totalCells }, (_, index) => {
      const dayNumber = index - mondayOffset + 1;

      if (dayNumber < 1 || dayNumber > last.getDate()) {
        return null;
      }

      const date = new Date(
        currentMonth.year,
        currentMonth.month,
        dayNumber,
      );

      const key = dateKey(date);

      const pickups = calendar.pickups.filter(
        (pickup) => pickup.date.slice(0, 10) === key,
      );

      const noMealDays = calendar.noMealDays.filter(
        (day) => day.date.slice(0, 10) === key,
      );

      const subscription = subscriptions.find(
        (item) =>
          key >= item.startDate.slice(0, 10) &&
          key <= item.endDate.slice(0, 10),
      );

      const hasExtension = subscriptions.some((item) =>
        item.extensions.some(
          (extension) => extension.newEndDate.slice(0, 10) === key,
        ),
      );

      let status = "outside";

      if (subscription) status = "period";
      if (hasExtension) status = "extension";
      if (noMealDays.length > 0) status = "no-meal";
      if (pickups.length > 0) status = "pickup";

      return {
        key,
        dayNumber,
        status,
        pickups,
        noMealDays,
        inSubscription: Boolean(subscription),
      };
    });
  }, [currentMonth, calendar, subscriptions]);

  const totalPickupQuantity = calendar.pickups.reduce(
    (total, pickup) => total + pickup.quantity,
    0,
  );

  function changeMonth(amount: number) {
    setCurrentMonth((previous) => {
      const date = new Date(
        previous.year,
        previous.month + amount,
        1,
      );

      return {
        year: date.getFullYear(),
        month: date.getMonth(),
      };
    });

    setSelectedDate(null);
  }

  function selectDay(
    date: string,
    pickups: Pickup[],
    noMealDays: NoMealDay[],
  ) {
    setSelectedDate({ date, pickups, noMealDays });
  }

  if (loading && !customer) {
    return (
      <main className="customer-detail-page">
        <div className="customer-detail-loading">
          Memuat detail pelanggan...
        </div>
      </main>
    );
  }

  if (error && !customer) {
    return (
      <main className="customer-detail-page">
        <button
          type="button"
          className="customer-detail-back"
          onClick={() => router.push("/customers")}
        >
          ← Kembali ke pelanggan
        </button>

        <div className="customer-detail-error" role="alert">
          {error}
        </div>

        <button
          type="button"
          className="customer-detail-button"
          onClick={() => void loadData()}
        >
          Coba Lagi
        </button>
      </main>
    );
  }

  if (!customer) return null;

  return (
    <main className="customer-detail-page">
      <div className="customer-detail-topbar">
        <button
          type="button"
          className="customer-detail-back"
          onClick={() => router.push("/customers")}
        >
          ← Daftar Pelanggan
        </button>

        <span className="customer-detail-brand">PORSi</span>
      </div>

      <section className="customer-detail-hero">
        <div className="customer-detail-avatar">
          {customer.name.trim().charAt(0).toUpperCase()}
        </div>

        <div className="customer-detail-identity">
          <div className="customer-detail-code">{customer.code}</div>
          <h1>{customer.name}</h1>
          <span
            className={`customer-detail-status ${
              customer.status === "ACTIVE" ? "is-active" : "is-inactive"
            }`}
          >
            {customer.status === "ACTIVE" ? "Pelanggan Aktif" : "Tidak Aktif"}
          </span>
        </div>

        <button
          type="button"
          className="customer-detail-button"
          onClick={() => setEditingCustomer((value) => !value)}
        >
          {editingCustomer ? "Tutup Formulir" : "Edit Pelanggan"}
        </button>
      </section>

      {editingCustomer && (
        <section className="customer-detail-edit-section">
          <CustomerEditForm
            customer={customer}
            onCancel={() => setEditingCustomer(false)}
            onUpdated={(updatedCustomer) => {
              setCustomer((previous) =>
                previous ? { ...previous, ...updatedCustomer } : previous,
            );
                setEditingCustomer(false);
            }}
          />
        </section>
      )}

      <section className="customer-detail-info-grid">
        <article className="customer-detail-info-card">
          <span>Nomor Telepon</span>
          <strong>{customer.phone || "Belum diisi"}</strong>
        </article>

        <article className="customer-detail-info-card">
          <span>Alamat</span>
          <strong>{customer.address || "Belum diisi"}</strong>
        </article>

        <article className="customer-detail-info-card">
          <span>Jumlah Langganan</span>
          <strong>{subscriptions.length}</strong>
        </article>

        <article className="customer-detail-info-card">
          <span>Total Pengambilan Tercatat Bulan Ini</span>
          <strong>{totalPickupQuantity}</strong>
        </article>
      </section>

      <section className="customer-detail-section">
        <div className="customer-detail-section-heading">
          <div>
            <span className="customer-detail-eyebrow">LANGGANAN</span>
            <h2>Riwayat Langganan</h2>
          </div>
        </div>

        {activeSubscription && (
          <article className="customer-detail-active-subscription">
            <div>
              <span className="customer-detail-eyebrow">LANGGANAN AKTIF</span>
              <h3>{activeSubscription.package.name}</h3>
              <p>
                {formatDate(activeSubscription.startDate)} sampai{" "}
                {formatDate(activeSubscription.endDate)}
              </p>
            </div>

            <div className="customer-detail-subscription-price">
              {formatCurrency(activeSubscription.price)}
              <span>Harga langganan</span>
            </div>
          </article>
        )}

        {subscriptions.length === 0 ? (
          <div className="customer-detail-empty">
            Pelanggan ini belum memiliki riwayat langganan.
          </div>
        ) : (
          <div className="customer-detail-subscription-list">
            {subscriptions.map((subscription) => (
              <article
                key={subscription.id}
                className="customer-detail-subscription-card"
              >
                <div className="customer-detail-subscription-heading">
                  <div>
                    <h3>{subscription.package.name}</h3>
                    <span>{getSubscriptionStatus(subscription.status)}</span>
                  </div>

                  <strong>{formatCurrency(subscription.price)}</strong>
                </div>

                <div className="customer-detail-subscription-dates">
                  <div>
                    <span>Mulai</span>
                    <strong>{formatDate(subscription.startDate)}</strong>
                  </div>

                  <div>
                    <span>Berakhir</span>
                    <strong>{formatDate(subscription.endDate)}</strong>
                  </div>

                  <div>
                    <span>Jatah Harian</span>
                    <strong>
                      {subscription.package.dailyQuota} porsi
                    </strong>
                  </div>
                </div>

                {subscription.package.meals &&
                  subscription.package.meals.length > 0 && (
                    <div className="customer-detail-meals">
                      {subscription.package.meals.map((meal) => (
                        <span key={meal.id}>{meal.mealName}</span>
                      ))}
                    </div>
                  )}

                {subscription.extensions.length > 0 && (
                  <div className="customer-detail-history">
                    <h4>Riwayat Perpanjangan</h4>

                    {subscription.extensions.map((extension) => (
                      <div
                        key={extension.id}
                        className="customer-detail-history-row"
                      >
                        <div>
                          <strong>+{extension.days} hari</strong>
                          <span>
                            {extension.reason || "Tidak ada alasan tercatat"}
                          </span>
                        </div>

                        <div>
                          <span>Tanggal akhir baru</span>
                          <strong>{formatDate(extension.newEndDate)}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {subscription.payments.length > 0 && (
                  <div className="customer-detail-history">
                    <h4>Riwayat Pembayaran</h4>

                    {subscription.payments.map((payment) => (
                      <div
                        key={payment.id}
                        className="customer-detail-history-row"
                      >
                        <div>
                          <strong>{formatCurrency(payment.amount)}</strong>
                          <span>
                            {payment.method || "Metode tidak dicatat"}
                          </span>
                        </div>

                        <div>
                          <span>{formatDate(payment.paymentDate)}</span>
                          {payment.notes && <span>{payment.notes}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="customer-detail-section">
        <div className="customer-detail-section-heading">
          <div>
            <span className="customer-detail-eyebrow">AKTIVITAS</span>
            <h2>Kalender Pengambilan</h2>
          </div>

          <div className="customer-detail-month-controls">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              aria-label="Bulan sebelumnya"
            >
              ‹
            </button>

            <strong>
              {monthNames[currentMonth.month]} {currentMonth.year}
            </strong>

            <button
              type="button"
              onClick={() => changeMonth(1)}
              aria-label="Bulan berikutnya"
            >
              ›
            </button>
          </div>
        </div>

        <div className="customer-detail-calendar">
          <div className="customer-detail-weekdays">
            {dayNames.map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>

          <div className="customer-detail-calendar-grid">
            {calendarDays.map((day, index) => {
              if (!day) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="customer-detail-calendar-empty"
                  />
                );
              }

              return (
                <button
                  type="button"
                  key={day.key}
                  className={`customer-detail-calendar-day status-${day.status} ${
                    selectedDate?.date === day.key ? "is-selected" : ""
                  }`}
                  onClick={() =>
                    selectDay(day.key, day.pickups, day.noMealDays)
                  }
                >
                  <span>{day.dayNumber}</span>

                  {day.pickups.length > 0 && (
                    <small>{day.pickups.length} pengambilan</small>
                  )}

                  {day.noMealDays.length > 0 && (
                    <small>
                      {day.noMealDays.some((item) => item.extension)
                        ? "Diperpanjang"
                        : "Tanpa pengambilan"}
                    </small>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="customer-detail-calendar-legend">
          <span><i className="legend-period" /> Periode langganan</span>
          <span><i className="legend-pickup" /> Ada pengambilan</span>
          <span><i className="legend-extension" /> Perpanjangan</span>
          <span><i className="legend-no-meal" /> Tanpa pengambilan tercatat</span>
        </div>

        {selectedDate && (
          <article className="customer-detail-day-panel">
            <div className="customer-detail-section-heading">
              <div>
                <span className="customer-detail-eyebrow">DETAIL TANGGAL</span>
                <h3>{formatDate(selectedDate.date)}</h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDate(null)}
              >
                Tutup
              </button>
            </div>

            {selectedDate.pickups.length === 0 &&
              selectedDate.noMealDays.length === 0 && (
                <p className="customer-detail-muted">
                  Tidak ada aktivitas yang tercatat pada tanggal ini. Hal itu
                  tidak otomatis berarti pelanggan tidak mengambil makanan.
                </p>
              )}

            {selectedDate.pickups.map((pickup) => (
              <div
                key={pickup.id}
                className="customer-detail-activity-row"
              >
                <div>
                  <strong>{pickup.meal.name}</strong>
                  <span>
                    {pickup.time} · {pickup.package.name}
                  </span>
                </div>

                <div>
                  <strong>{pickup.quantity} porsi</strong>
                  <span>
                    Sisa kuota: {pickup.remainingQuota}
                  </span>
                </div>
              </div>
            ))}

            {selectedDate.noMealDays.map((day) => (
              <div
                key={day.id}
                className="customer-detail-activity-row"
              >
                <div>
                  <strong>Hari tanpa pengambilan</strong>
                  <span>
                    {day.processed
                      ? "Sudah diproses"
                      : "Belum diproses"}
                  </span>
                </div>

                <div>
                  {day.extension ? (
                    <>
                      <strong>+{day.extension.days} hari</strong>
                      <span>
                        Berakhir: {formatDate(day.extension.newEndDate)}
                      </span>
                    </>
                  ) : (
                    <span>Belum ada perpanjangan tercatat</span>
                  )}
                </div>
              </div>
            ))}
          </article>
        )}
      </section>

      <div className="customer-detail-footer">
        <span>Kode pelanggan: {customer.code}</span>
        <button
          type="button"
          onClick={() => router.push("/customers")}
        >
          Kembali ke Daftar Pelanggan
        </button>
      </div>
    </main>
  );
}
export default function CustomerDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="customer-detail-page">
          <div className="customer-detail-loading">
            Memuat detail pelanggan...
          </div>
        </main>
      }
    >
      <CustomerDetailContent />
    </Suspense>
  );
}