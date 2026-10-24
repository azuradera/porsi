"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

type Customer = {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
};

type Meal = { id: string; mealName: string };

type CateringPackage = {
  id: string;
  name: string;
  dailyQuota: number;
  meals: Meal[];
};

type Subscription = {
  id: string;
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  customer: Customer;
  package: CateringPackage;
};

type Pickup = {
  id: string;
  subscriptionId: string;
  packageMealId: string;
  pickupDate: string;
  pickupTime: string;
  quantity: number;
  packageMeal: Meal;
  subscription: {
    id: string;
    customer: Customer;
    package: CateringPackage;
  };
};

type ApiResponse<T> = {
  message?: string;
  subscriptions?: T[];
  count?: number;
};

type RecognitionResult = {
  customerQuery: string;
  mealQuery: string;
  quantity: number;
};

type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = {
  0: SpeechRecognitionAlternative;
  isFinal: boolean;
};
type SpeechRecognitionResultList = {
  length: number;
  [index: number]: SpeechRecognitionResult;
};
type SpeechRecognitionEvent = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};
type SpeechRecognitionErrorEvent = { error: string };
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;
type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function getToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getCurrentTime() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

function formatDate(value: string) {
  const dateValue = value.slice(0, 10);
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIndonesianNumber(value: string) {
  const normalized = normalizeText(value);
  const digits: Record<string, number> = {
    satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5,
    enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10,
  };
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return digits[normalized] ?? null;
}

function parseVoiceCommand(transcript: string): RecognitionResult | null {
  const normalized = normalizeText(transcript);
  if (!normalized) return null;

  const tokens = normalized.split(/\s+/);

  const numberWords: Record<string, number> = {
    satu: 1,
    dua: 2,
    tiga: 3,
    empat: 4,
    lima: 5,
    enam: 6,
    tujuh: 7,
    delapan: 8,
    sembilan: 9,
    sepuluh: 10,
  };

  const quantityToken = tokens[tokens.length - 1];
  const quantity = /^\d+$/.test(quantityToken)
    ? Number(quantityToken)
    : numberWords[quantityToken];

  if (!quantity || quantity < 1 || quantity > 100) return null;

  const commandTokens = tokens.slice(0, -1);
  let customerQuery = "";
  let codeEndIndex = -1;

  for (let i = 0; i < commandTokens.length; i++) {
    const combined = commandTokens.slice(i, i + 6).join("");
    const match = combined.match(/^([a-z]{2})((?:\d\s*){4})$/i);

    if (match) {
      customerQuery = `${match[1]}${match[2].replace(/\s/g, "")}`.toUpperCase();
      codeEndIndex = i + 6;
      break;
    }

    const singleTokenMatch = commandTokens[i].match(/^([a-z]{2})(\d{4})$/i);

    if (singleTokenMatch) {
      customerQuery = commandTokens[i].toUpperCase();
      codeEndIndex = i + 1;
      break;
    }

    const spacedMatch = commandTokens.slice(i, i + 2).join("").match(/^([a-z]{2})(\d{4})$/i);

    if (spacedMatch) {
      customerQuery = spacedMatch[0].toUpperCase();
      codeEndIndex = i + 2;
      break;
    }
  }

  if (!customerQuery) {
    const compact = commandTokens.join("");
    const match = compact.match(/([a-z]{2}\d{4})/i);

    if (!match) return null;

    customerQuery = match[1].toUpperCase();
    const codeCharacters = match.index! + match[1].length;
    let characters = 0;

    for (let i = 0; i < commandTokens.length; i++) {
      characters += commandTokens[i].length;

      if (characters >= codeCharacters) {
        codeEndIndex = i + 1;
        break;
      }
    }
  }

  const mealTokens = commandTokens.filter((_, index) => {
    if (codeEndIndex < 0) return true;
    return index >= codeEndIndex;
  });

  const mealQuery = mealTokens.join(" ").trim();

  if (!mealQuery) return null;

  return { customerQuery, mealQuery, quantity };
}

function getSubscriptionState(subscription: Subscription, today: string) {
  const start = subscription.startDate.slice(0, 10);
  const end = subscription.endDate.slice(0, 10);

  if (subscription.status !== "ACTIVE") return subscription.status;
  if (!today) return "UPCOMING";
  if (start > today) return "UPCOMING";
  if (end < today) return "COMPLETED";
  return "ACTIVE";
}

function getPickupDate(value: string) {
  return value.slice(0, 10);
}

function getPickupTime(value: string) {
  if (value.includes("T")) return value.slice(11, 16);
  return value.slice(0, 5);
}

function getErrorMessage(data: unknown, fallback: string) {
  if (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof (data as { message?: unknown }).message === "string"
  ) {
    return (data as { message: string }).message;
  }
  return fallback;
}

export default function PickupsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [todayDate, setTodayDate] = useState("");
  const [historyDate, setHistoryDate] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [packageMealId, setPackageMealId] = useState("");
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [showVoiceDialog, setShowVoiceDialog] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [pendingVoice, setPendingVoice] = useState<RecognitionResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const toast = useToast();

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const loadingRef = useRef(false);

  const loadData = useCallback(async (showLoader = true) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (showLoader) setLoading(true);

    try {
      const [subscriptionResponse, pickupResponse] = await Promise.all([
        fetch("/api/subscriptions", { cache: "no-store" }),
        fetch("/api/meal-pickups", { cache: "no-store" }),
      ]);

      if (subscriptionResponse.status === 401 || pickupResponse.status === 401) {
        window.location.href = "/login";
        return;
      }

      const [subscriptionData, pickupData] = (await Promise.all([
        subscriptionResponse.json(),
        pickupResponse.json(),
      ])) as [ApiResponse<Subscription>, ApiResponse<Pickup> | Pickup[]];

      if (!subscriptionResponse.ok) {
        throw new Error(
          getErrorMessage(subscriptionData, "Gagal mengambil data langganan."),
        );
      }
      if (!pickupResponse.ok) {
        throw new Error(
          getErrorMessage(pickupData, "Gagal mengambil riwayat pengambilan."),
        );
      }

      setSubscriptions(subscriptionData.subscriptions ?? []);
      setPickups(Array.isArray(pickupData) ? pickupData : []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Terjadi kesalahan saat mengambil data.",
      );
    } 
    finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const today = getToday();
    setTodayDate(today);
    setHistoryDate(today);
    setPickupDate(today);
    setPickupTime(getCurrentTime());
  }, []);

  useEffect(() => {
    void loadData();

    const speechWindow = window as SpeechWindow;
    setVoiceSupported(
      Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition),
    );

    return () => {
      recognitionRef.current?.abort();
    };
  }, [loadData]);

  const eligibleSubscriptions = useMemo(() => {
    return subscriptions.filter(
      (subscription) =>
        subscription.customer.status === "ACTIVE" &&
        getSubscriptionState(subscription, todayDate) === "ACTIVE" &&
        pickupDate >= subscription.startDate.slice(0, 10) &&
        pickupDate <= subscription.endDate.slice(0, 10),
    );
  }, [subscriptions, pickupDate, todayDate]);

  const selectedSubscription = subscriptions.find((s) => s.id === subscriptionId);
  const selectedMeal = selectedSubscription?.package.meals.find(
    (meal) => meal.id === packageMealId,
  );

  const dailyQuantity = useMemo(() => {
    if (!subscriptionId || !pickupDate) return 0;
    return pickups.reduce((total, pickup) => {
      if (
        pickup.subscriptionId === subscriptionId &&
        getPickupDate(pickup.pickupDate) === pickupDate
      ) {
        return total + Number(pickup.quantity);
      }
      return total;
    }, 0);
  }, [pickups, subscriptionId, pickupDate]);

  const remainingQuota = selectedSubscription
    ? Math.max(0, selectedSubscription.package.dailyQuota - dailyQuantity)
    : 0;

  const filteredSubscriptions = useMemo(() => {
    const query = normalizeText(customerQuery);
    return eligibleSubscriptions.filter((subscription) => {
      if (!query) return true;
      return (
        normalizeText(subscription.customer.name).includes(query) ||
        normalizeText(subscription.customer.code).includes(query) ||
        normalizeText(subscription.package.name).includes(query)
      );
    });
  }, [eligibleSubscriptions, customerQuery]);

  const filteredPickups = useMemo(() => {
    const query = normalizeText(search);
    return pickups.filter((pickup) => {
      const matchesSearch =
        !query ||
        normalizeText(pickup.subscription.customer.name).includes(query) ||
        normalizeText(pickup.subscription.customer.code).includes(query) ||
        normalizeText(pickup.subscription.package.name).includes(query) ||
        normalizeText(pickup.packageMeal.mealName).includes(query);
      const matchesDate =
        !historyDate || getPickupDate(pickup.pickupDate) === historyDate;
      return matchesSearch && matchesDate;
    });
  }, [pickups, search, historyDate]);

  const summary = useMemo(() => {
    const todayPickups = pickups.filter(
      (pickup) => getPickupDate(pickup.pickupDate) === todayDate,
    );
    return {
      todayTransactions: todayPickups.length,
      todayQuantity: todayPickups.reduce((t, p) => t + Number(p.quantity), 0),
      activeSubscriptions: subscriptions.filter(
        (s) =>
          s.customer.status === "ACTIVE" &&
          getSubscriptionState(s, todayDate) === "ACTIVE",
      ).length,
      historyCount: pickups.length,
    };
  }, [pickups, subscriptions, todayDate]);

  function resetMessages() {}

  function selectSubscription(id: string) {
    setSubscriptionId(id);
    setPackageMealId("");
    setPendingVoice(null);
    setVoiceStatus("");
  }

  function applyVoiceResult(result: RecognitionResult) {
    const query = normalizeText(result.customerQuery);

    const activeCandidates = eligibleSubscriptions.filter(
      (s) =>
        normalizeText(s.customer.code) === query ||
        normalizeText(s.customer.name) === query,
    );

    if (activeCandidates.length === 0) {
      const knownCandidates = subscriptions.filter(
        (s) =>
          normalizeText(s.customer.code) === query ||
          normalizeText(s.customer.name) === query,
      );
      setVoiceStatus(
        knownCandidates.length > 0
          ? "Pelanggan ditemukan, tetapi langganannya tidak aktif pada tanggal yang dipilih."
          : `Pelanggan "${result.customerQuery}" tidak ditemukan secara pasti. Pilih pelanggan secara manual.`,
      );
      setPendingVoice(null);
      return;
    }

    if (activeCandidates.length > 1) {
      setVoiceStatus(
        "Nama pelanggan cocok dengan lebih dari satu langganan. Pilih pelanggan secara manual.",
      );
      setPendingVoice(null);
      return;
    }

    const customer = activeCandidates[0];
    const mealQuery = normalizeText(result.mealQuery);

    const exactMeals = customer.package.meals.filter(
      (meal) => normalizeText(meal.mealName) === mealQuery,
    );

    let meal: Meal | undefined;

    if (exactMeals.length === 1) {
      meal = exactMeals[0];
    } else if (exactMeals.length > 1) {
      setVoiceStatus(
        "Nama menu cocok dengan lebih dari satu pilihan. Pilih menu secara manual.",
      );
      setPendingVoice(null);
      return;
    } else {
      const partialMeals = customer.package.meals.filter((item) => {
        const mealName = normalizeText(item.mealName);
        return mealName.includes(mealQuery) || mealQuery.includes(mealName);
      });
      if (partialMeals.length === 1) meal = partialMeals[0];
    }

    if (!meal) {
      setVoiceStatus(
        `Menu "${result.mealQuery}" tidak cocok secara pasti dengan menu paket. Pilih menu secara manual.`,
      );
      setPendingVoice(null);
      return;
    }

    const usedQuota = pickups.reduce((total, pickup) => {
      if (
        pickup.subscriptionId === customer.id &&
        getPickupDate(pickup.pickupDate) === pickupDate
      ) {
        return total + Number(pickup.quantity);
      }
      return total;
    }, 0);

    const availableQuota = Math.max(0, customer.package.dailyQuota - usedQuota);

    if (availableQuota < 1) {
      setVoiceStatus("Kuota harian pelanggan sudah habis untuk tanggal yang dipilih.");
      setPendingVoice(null);
      return;
    }

    if (result.quantity > availableQuota) {
      setVoiceStatus(
        `Jumlah yang disebutkan melebihi sisa kuota ${availableQuota} porsi. Sesuaikan jumlah secara manual.`,
      );
      setPendingVoice(null);
      return;
    }

    setCustomerQuery(customer.customer.name);
    setSubscriptionId(customer.id);
    setPackageMealId(meal.id);
    setQuantity(result.quantity);
    setPendingVoice(result);
    setVoiceStatus(
      `Suara dikenali: ${customer.customer.name}, ${meal.mealName}, ${result.quantity} porsi. Periksa kembali sebelum menyimpan.`,
    );
  }

  function startVoiceRecognition() {
    resetMessages();
    setPendingVoice(null);
    setVoiceStatus("");
    setShowVoiceDialog(true);

    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setIsListening(false);
      setVoiceStatus(
        "Browser ini tidak mendukung pengenalan suara. Gunakan Chrome atau isi formulir secara manual.",
      );
      return;
    }

    try {
      recognitionRef.current?.abort();

      const recognition = new Recognition();
      recognition.lang = "id-ID";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event) => {
        const transcripts: string[] = [];

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          transcripts.push(event.results[i][0].transcript);
        }

        const transcript = transcripts.join(" ").trim();
        const result = parseVoiceCommand(transcript);

        if (!result) {
          setVoiceStatus(
            `Ucapan "${transcript || "tidak terdeteksi"}" belum dapat dipahami. Contoh: pelanggan AB1234, lauk ayam, sebanyak dua.`,
          );
          setPendingVoice(null);
          return;
        }

        applyVoiceResult(result);
      };

      recognition.onerror = (event) => {
        setIsListening(false);

        setVoiceStatus(
          event.error === "not-allowed"
            ? "Akses mikrofon ditolak. Izinkan penggunaan mikrofon pada browser."
            : event.error === "no-speech"
              ? "Tidak ada suara yang terdeteksi. Coba bicara lebih jelas."
              : "Pengenalan suara gagal. Coba lagi atau isi formulir secara manual.",
        );
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();

      setIsListening(true);
      setVoiceStatus(
        "Mendengarkan. Sebutkan kode atau nama pelanggan, lauk, dan jumlah porsi.",
      );
    } catch {
      setIsListening(false);
      setVoiceStatus("Mikrofon tidak dapat dimulai. Periksa izin browser.");
    }
  }

  function stopVoiceRecognition() {
    recognitionRef.current?.stop();
    setIsListening(false);
    setShowVoiceDialog(false);
  }

  function handleSavePickup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetMessages();

    if (!subscriptionId || !packageMealId || !pickupDate || !pickupTime) {
      toast.error("Pelanggan, menu, tanggal, dan waktu wajib diisi.");
      return;
    }
    if (pickupDate > todayDate) {
      toast.error("Tanggal pengambilan tidak boleh di masa depan.");
      return;
    }
    if (!selectedSubscription || !selectedMeal) {
      toast.error("Data langganan atau menu tidak valid.");
      return;
    }
    if (
      selectedSubscription.customer.status !== "ACTIVE" ||
      getSubscriptionState(selectedSubscription, todayDate) !== "ACTIVE" ||
      pickupDate < selectedSubscription.startDate.slice(0, 10) ||
      pickupDate > selectedSubscription.endDate.slice(0, 10)
    ) {
      toast.error("Langganan pelanggan tidak aktif pada tanggal pengambilan.");
      return;
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > remainingQuota) {
      toast.error(`Jumlah pengambilan harus antara 1 dan ${remainingQuota} porsi.`);
      return;
    }

    setShowConfirm(true);
  }

  async function confirmSavePickup() {
    if (!selectedSubscription || !selectedMeal || saving) return;

    setSaving(true);
    resetMessages();

    try {
      const response = await fetch("/api/meal-pickups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId,
          packageMealId,
          pickupDate,
          pickupTime,
          quantity,
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Gagal mencatat pengambilan makanan.")
        );
      }

      toast.success(
        "Pengambilan berhasil dicatat",
        data.message ?? "Data pengambilan makanan berhasil disimpan."
      );
      setShowConfirm(false);
      setCustomerQuery("");
      setSubscriptionId("");
      setPackageMealId("");
      setQuantity(1);
      setPickupDate(todayDate);
      setPickupTime(getCurrentTime());
      setHistoryDate(todayDate);
      setPendingVoice(null);
      setVoiceStatus("");

      await loadData(false);
    } catch (err) {
      toast.error(
        "Gagal mencatat pengambilan",
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menyimpan pengambilan."
      );
      setShowConfirm(false);
    }
    finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setCustomerQuery("");
    setSubscriptionId("");
    setPackageMealId("");
    setQuantity(1);
    setPickupDate(todayDate);
    setPickupTime(getCurrentTime());
    setPendingVoice(null);
    setVoiceStatus("");
    setShowConfirm(false);
    resetMessages();
  }

  const subscriptionOptions = filteredSubscriptions.map((s) => ({
    value: s.id,
    label: `${s.customer.code} · ${s.customer.name} · ${s.package.name}`,
  }));

  const mealOptions = (selectedSubscription?.package.meals ?? []).map((m) => ({
    value: m.id,
    label: m.mealName,
  }));

  return (
    <main className="subscriptions-page pickups-page">
      <div className="subscriptions-heading">
        <div>
          <div className="subscriptions-eyebrow">MANAJEMEN KATERING</div>
          <h1>Pengambilan</h1>
          <p>Catat pengambilan makanan pelanggan dan pantau kuota harian.</p>
        </div>

        <div className="subscriptions-heading-actions">
          <Link href="/" className="subscriptions-secondary-button">
            Dashboard
          </Link>
          <button
            type="button"
            className="subscriptions-refresh-button"
            onClick={() => void loadData()}
            disabled={loading}
          >
            {loading ? "Memuat..." : "↻ Segarkan"}
          </button>
        </div>
      </div>

      <section className="subscriptions-stats page-stats">
        <article className="subscriptions-stat-card">
          <span className="subscriptions-stat-label">Transaksi Hari Ini</span>
          <strong>{summary.todayTransactions}</strong>
          <span className="subscriptions-stat-caption">Catatan pengambilan</span>
        </article>

        <article className="subscriptions-stat-card">
          <span className="subscriptions-stat-label">Porsi Hari Ini</span>
          <strong>{summary.todayQuantity}</strong>
          <span className="subscriptions-stat-caption">Total porsi tercatat</span>
        </article>

        <article className="subscriptions-stat-card">
          <span className="subscriptions-stat-label">Langganan Aktif</span>
          <strong>{summary.activeSubscriptions}</strong>
          <span className="subscriptions-stat-caption">Langganan yang masih berlaku</span>
        </article>

        <article className="subscriptions-stat-card">
          <span className="subscriptions-stat-label">Total Riwayat</span>
          <strong>{summary.historyCount}</strong>
          <span className="subscriptions-stat-caption">Semua catatan pengambilan</span>
        </article>
      </section>

      <section className="subscriptions-form-panel panel">
        <div className="subscriptions-section-heading">
          <div>
            <h2>Catat Pengambilan</h2>
            <p>Pilih pelanggan atau gunakan input suara untuk mengisi formulir.</p>
          </div>
        </div>

        <div className="pickups-voice-panel">
          <div className="pickups-voice-description">
            <span className="pickups-voice-icon">🎙</span>
            <div>
              <strong>Input Suara</strong>
              <p>Sebutkan nama atau kode pelanggan, lauk, dan jumlah porsi.</p>
            </div>
          </div>

          <button
            type="button"
            className="subscriptions-primary-button pickups-voice-button"
            onClick={isListening ? stopVoiceRecognition : startVoiceRecognition}
            disabled={saving || loading}
          >
            {isListening ? "Hentikan Mikrofon" : "Mulai Bicara"}
          </button>

          {!voiceSupported && (
            <small className="pickups-voice-note">
              Browser mungkin tidak mendukung pengenalan suara. Kamu tetap bisa
              mengisi formulir secara manual.
            </small>
          )}
        </div>

        <form onSubmit={handleSavePickup} className="subscriptions-form">
          <div className="subscriptions-field">
            <span>Tanggal Pengambilan</span>
            <DatePicker
              value={pickupDate}
              max={todayDate}
              aria-label="Tanggal pengambilan"
              onChange={(value) => {
                setPickupDate(value);
                setSubscriptionId("");
                setPackageMealId("");
                setPendingVoice(null);
                setVoiceStatus("");
              }}
            />
            <small>Hanya tanggal hari ini atau sebelumnya yang diizinkan.</small>
          </div>

          <div className="subscriptions-field pickups-time-field">
            <span>Waktu Pengambilan</span>

            <div className="pickups-time-picker">
              <div className="pickups-time-unit">
                <span>Jam</span>
                <Select
                  value={pickupTime.split(":")[0] || "00"}
                  onChange={(hour) => {
                    const minute = pickupTime.split(":")[1] || "00";
                    setPickupTime(`${hour}:${minute}`);
                  }}
                  options={Array.from({ length: 24 }, (_, hour) => {
                    const value = String(hour).padStart(2, "0");
                    return { value, label: value };
                  })}
                  aria-label="Jam pengambilan"
                  className="pickups-time-select"
                />
              </div>

              <span className="pickups-time-separator">:</span>

              <div className="pickups-time-unit">
                <span>Menit</span>
                <Select
                  value={pickupTime.split(":")[1] || "00"}
                  onChange={(minute) => {
                    const hour = pickupTime.split(":")[0] || "00";
                    setPickupTime(`${hour}:${minute}`);
                  }}
                  options={Array.from({ length: 60 }, (_, minute) => {
                    const value = String(minute).padStart(2, "0");
                    return { value, label: value };
                  })}
                  aria-label="Menit pengambilan"
                  className="pickups-time-select"
                />
              </div>
            </div>
          </div>
          <label className="subscriptions-field">
            <span>Cari Pelanggan</span>
            <input
              type="search"
              value={customerQuery}
              onChange={(event) => {
                setCustomerQuery(event.target.value);
                setSubscriptionId("");
                setPackageMealId("");
                setPendingVoice(null);
                setVoiceStatus("");
              }}
              placeholder="Nama atau kode pelanggan..."
            />
          </label>

          <div className="subscriptions-field">
            <span>Pelanggan dan Langganan</span>
            <Select
              value={subscriptionId}
              onChange={selectSubscription}
              options={subscriptionOptions}
              placeholder="Pilih pelanggan"
              aria-label="Pelanggan dan langganan"
            />
            {filteredSubscriptions.length === 0 && (
              <small>
                Tidak ada langganan aktif yang cocok pada tanggal tersebut.
              </small>
            )}
          </div>

          {selectedSubscription && (
            <div className="pickups-customer-summary">
              <div>
                <span>Pelanggan</span>
                <strong>{selectedSubscription.customer.name}</strong>
                <small>{selectedSubscription.customer.code}</small>
              </div>
              <div>
                <span>Paket</span>
                <strong>{selectedSubscription.package.name}</strong>
                <small>
                  {selectedSubscription.package.meals
                    .map((meal) => meal.mealName)
                    .join(", ")}
                </small>
              </div>
              <div>
                <span>Kuota Harian</span>
                <strong>{selectedSubscription.package.dailyQuota} porsi</strong>
                <small>
                  Terpakai {dailyQuantity} · Sisa {remainingQuota}
                </small>
              </div>
              <div>
                <span>Periode Langganan</span>
                <strong>{formatDate(selectedSubscription.startDate)}</strong>
                <small>Sampai {formatDate(selectedSubscription.endDate)}</small>
              </div>
            </div>
          )}

          <div className="subscriptions-field">
            <span>Lauk atau Menu</span>
            <Select
              value={packageMealId}
              onChange={(value) => {
                setPackageMealId(value);
                setPendingVoice(null);
              }}
              options={mealOptions}
              placeholder="Pilih lauk"
              disabled={!selectedSubscription}
              aria-label="Lauk atau menu"
            />
          </div>

          <label className="subscriptions-field">
            <span>Jumlah Porsi</span>
            <input
              type="number"
              min={1}
              max={remainingQuota}
              step={1}
              value={quantity}
              onChange={(event) => {
                const value = event.target.value;
                setQuantity(value === "" ? 0 : Number(value));
                setPendingVoice(null);
              }}
              required
              disabled={!selectedSubscription || remainingQuota < 1}
            />
            <small>
              {selectedSubscription
                ? `Maksimal ${remainingQuota} porsi untuk tanggal ini.`
                : "Pilih pelanggan terlebih dahulu."}
            </small>
          </label>

          {pendingVoice && (
            <div className="pickups-voice-confirmation">
              <strong>Periksa Hasil Pengenalan Suara</strong>
              <p>Pelanggan: {pendingVoice.customerQuery}</p>
              <p>Menu: {pendingVoice.mealQuery}</p>
              <p>Jumlah: {pendingVoice.quantity} porsi</p>
              <small>
                Hasil suara hanya mengisi formulir. Data belum disimpan sampai
                kamu mengonfirmasi pencatatan.
              </small>
            </div>
          )}

          {selectedSubscription && remainingQuota < 1 && (
            <div className="subscriptions-alert subscriptions-alert-error">
              Kuota pengambilan pelanggan ini sudah habis untuk tanggal yang
              dipilih.
            </div>
          )}

          <div className="subscriptions-form-actions">
            <button
              type="button"
              className="subscriptions-secondary-button"
              disabled={saving}
              onClick={resetForm}
            >
              Reset Form
            </button>

            <button
              type="submit"
              className="subscriptions-primary-button"
              disabled={
                saving ||
                loading ||
                !selectedSubscription ||
                !selectedMeal ||
                remainingQuota < 1
              }
            >
              Catat Pengambilan
            </button>
          </div>
        </form>
      </section>

      <section className="subscriptions-list-panel panel">
        <div className="subscriptions-section-heading">
          <div>
            <h2>Riwayat Pengambilan</h2>
            <p>
              {filteredPickups.length} data ditemukan dari {pickups.length} catatan.
            </p>
          </div>
        </div>

        <div className="subscriptions-filters pickups-history-filters">
          <label className="subscriptions-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              placeholder="Cari nama, kode, paket, atau lauk..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <div className="pickups-date-filter">
            <span>Filter tanggal</span>
            <DatePicker
              value={historyDate}
              onChange={setHistoryDate}
              aria-label="Filter tanggal riwayat"
            />
          </div>

          <button
            type="button"
            className="subscriptions-secondary-button"
            onClick={() => setHistoryDate("")}
          >
            Semua Tanggal
          </button>
        </div>

        {loading ? (
          <div className="subscriptions-empty-state">
            <span className="subscriptions-loading-indicator" />
            <p>Memuat riwayat pengambilan...</p>
          </div>
        ) : filteredPickups.length === 0 ? (
          <div className="subscriptions-empty-state">
            <h3>Belum ada riwayat pengambilan</h3>
            <p>
              Catatan yang sesuai dengan pencarian dan filter akan muncul di sini.
            </p>
          </div>
        ) : (
          <>
            <div className="subscriptions-table-wrapper">
              <table className="subscriptions-table pickups-table">
                <thead>
                  <tr>
                    <th>Pelanggan</th>
                    <th>Paket dan Lauk</th>
                    <th>Tanggal</th>
                    <th>Waktu</th>
                    <th>Jumlah</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredPickups.map((pickup) => (
                    <tr key={pickup.id}>
                      <td>
                        <div className="subscriptions-customer-cell">
                          <span className="subscriptions-avatar">
                            {pickup.subscription.customer.name
                              .trim()
                              .charAt(0)
                              .toUpperCase() || "?"}
                          </span>
                          <span>
                            <strong>{pickup.subscription.customer.name}</strong>
                            <small>{pickup.subscription.customer.code}</small>
                          </span>
                        </div>
                      </td>

                      <td>
                        <strong>{pickup.subscription.package.name}</strong>
                        <small className="subscriptions-subtext">
                          {pickup.packageMeal.mealName}
                        </small>
                      </td>

                      <td>{formatDate(pickup.pickupDate)}</td>
                      <td>{getPickupTime(pickup.pickupTime)}</td>

                      <td>
                        <span className="pickups-quantity-badge">
                          {pickup.quantity} porsi
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="subscriptions-mobile-list">
              {filteredPickups.map((pickup) => (
                <article className="subscriptions-mobile-card" key={pickup.id}>
                  <div className="subscriptions-mobile-card-top">
                    <div>
                      <strong>{pickup.subscription.customer.name}</strong>
                      <small>{pickup.subscription.customer.code}</small>
                    </div>
                    <span className="pickups-quantity-badge">
                      {pickup.quantity} porsi
                    </span>
                  </div>

                  <div className="subscriptions-mobile-package">
                    <span>Paket</span>
                    <strong>{pickup.subscription.package.name}</strong>
                    <small>{pickup.packageMeal.mealName}</small>
                  </div>

                  <div className="subscriptions-mobile-dates">
                    <div>
                      <span>Tanggal</span>
                      <strong>{formatDate(pickup.pickupDate)}</strong>
                    </div>
                    <div>
                      <span>Waktu</span>
                      <strong>{getPickupTime(pickup.pickupTime)}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <Dialog
        open={showConfirm && Boolean(selectedSubscription && selectedMeal)}
        onClose={() => setShowConfirm(false)}
        busy={saving}
        icon="✓"
        title="Konfirmasi pengambilan"
        description="Periksa data berikut sebelum mencatat pengambilan ke riwayat."
        footer={
          <>
            <button
              type="button"
              className="subscriptions-secondary-button"
              disabled={saving}
              onClick={() => setShowConfirm(false)}
            >
              Periksa lagi
            </button>
            <button
              type="button"
              className="subscriptions-primary-button"
              disabled={saving}
              onClick={() => void confirmSavePickup()}
            >
              {saving ? "Menyimpan..." : "Ya, catat"}
            </button>
          </>
        }
      >
        <dl className="dialog-rows">
          <div>
            <dt>Pelanggan</dt>
            <dd>{selectedSubscription?.customer.name}</dd>
          </div>
          <div>
            <dt>Kode</dt>
            <dd>{selectedSubscription?.customer.code}</dd>
          </div>
          <div>
            <dt>Paket</dt>
            <dd>{selectedSubscription?.package.name}</dd>
          </div>
          <div>
            <dt>Menu</dt>
            <dd>{selectedMeal?.mealName}</dd>
          </div>
          <div>
            <dt>Tanggal</dt>
            <dd>{formatDate(pickupDate)}</dd>
          </div>
          <div>
            <dt>Waktu</dt>
            <dd>{pickupTime}</dd>
          </div>
          <div>
            <dt>Jumlah</dt>
            <dd>{quantity} porsi</dd>
          </div>
          <div>
            <dt>Sisa kuota</dt>
            <dd>{remainingQuota - quantity} porsi</dd>
          </div>
        </dl>
      </Dialog>

      <Dialog
        open={showVoiceDialog}
        onClose={stopVoiceRecognition}
        title="Input Suara"
        description="Sebutkan kode atau nama pelanggan, nama lauk, dan jumlah porsi."
        icon="🎙"
      >
        <div className="pickups-voice-dialog-content">
          <div
            className={`pickups-voice-dialog-indicator ${
              isListening ? "is-listening" : ""
            }`}
            aria-hidden="true"
          >
            {isListening ? "◉" : "🎙"}
          </div>

          <p
            className="pickups-voice-dialog-status"
            role="status"
            aria-live="polite"
          >
            {voiceStatus || "Siap menerima perintah suara."}
          </p>

          <div className="pickups-voice-dialog-example">
            <span>Contoh ucapan</span>
            <strong>
              Pelanggan AB1234, lauk ayam, sebanyak dua.
            </strong>
          </div>

          {pendingVoice && selectedSubscription && selectedMeal && (
            <div className="pickups-voice-dialog-example">
              <span>Hasil pengenalan suara</span>
              <strong>{selectedSubscription.customer.name}</strong>
              <strong>Kode: {selectedSubscription.customer.code}</strong>
              <strong>Menu: {selectedMeal.mealName}</strong>
              <strong>Jumlah: {quantity} porsi</strong>
              <strong>Sisa kuota setelah pengambilan: {remainingQuota - quantity} porsi</strong>
            </div>
          )}
        </div>

        <div className="pickups-voice-dialog-actions">
          {isListening ? (
            <button
              type="button"
              className="subscriptions-primary-button"
              onClick={stopVoiceRecognition}
            >
              Berhenti
            </button>
          ) : (
            <>
              <button
                type="button"
                className="subscriptions-secondary-button"
                onClick={stopVoiceRecognition}
              >
                Tutup
              </button>

              <button
                type="button"
                className="subscriptions-secondary-button"
                onClick={startVoiceRecognition}
                disabled={saving || loading}
              >
                Coba Lagi
              </button>

              <button
                type="button"
                className="subscriptions-primary-button"
                disabled={
                  !pendingVoice ||
                  !selectedSubscription ||
                  !selectedMeal ||
                  saving ||
                  loading
                }
                onClick={() => {
                  stopVoiceRecognition();
                  void confirmSavePickup();
                }}
              >
                Catat Pengambilan
              </button>
            </>
          )}
        </div>
      </Dialog>
    </main>
  );
}