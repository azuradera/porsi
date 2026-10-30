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

type NoMealDay = {
  id: string;
  customerId: string;
  subscriptionId: string;
  date: string;
  processed: boolean;
  createdAt: string;
  customer: Customer;
  subscription: {
    id: string;
    startDate: string;
    endDate: string;
    status: "ACTIVE" | "COMPLETED" | "CANCELLED";
    package: CateringPackage;
  };
  extension?: {
    id: string;
    days: number;
    type: "AUTOMATIC" | "MANUAL";
    previousEndDate: string;
    newEndDate: string;
  } | null;
};

type ApiResponse<T> = {
  message?: string;
  subscriptions?: T[];
  count?: number;
};

type RecognitionResult = {
  customerQuery: string;
  mealQueries: string[];
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


function parseVoiceCommand(transcript: string): RecognitionResult | null {
  const normalized = normalizeText(transcript);
  if (!normalized) return null;

  const commandTokens = normalized
    .replace(/\b(kode pelanggan|kode|pelanggan)\b/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  let customerQuery = "";
  let codeStart = -1;
  let codeEnd = -1;

  const digitWords: Record<string, string> = {
    nol: "0",
    kosong: "0",
    satu: "1",
    dua: "2",
    tiga: "3",
    empat: "4",
    lima: "5",
    enam: "6",
    tujuh: "7",
    delapan: "8",
    sembilan: "9",
  };

  const letterWords: Record<string, string> = {
    a: "A",
    be: "B",
    ce: "C",
    de: "D",
    e: "E",
    ef: "F",
    ge: "G",
    ha: "H",
    i: "I",
    je: "J",
    ka: "K",
    el: "L",
    em: "M",
    en: "N",
    o: "O",
    pe: "P",
    ki: "Q",
    er: "R",
    es: "S",
    te: "T",
    u: "U",
    ve: "V",
    we: "W",
    eks: "X",
    ye: "Y",
    zet: "Z",
  };

  for (let i = 0; i < commandTokens.length; i++) {
    const token = commandTokens[i].toUpperCase();
    const directMatch = token.match(/^([A-Z])(\d{2})$/);

    if (directMatch) {
      customerQuery = directMatch[0];
      codeStart = i;
      codeEnd = i + 1;
      break;
    }

    if (/^[A-Z]$/.test(token) && /^\d{2}$/.test(commandTokens[i + 1] ?? "")) {
      customerQuery = `${token}${commandTokens[i + 1]}`;
      codeStart = i;
      codeEnd = i + 2;
      break;
    }

    const letter = letterWords[commandTokens[i]];
    const firstDigit = digitWords[commandTokens[i + 1] ?? ""];
    const secondDigit = digitWords[commandTokens[i + 2] ?? ""];

    if (letter && firstDigit !== undefined && secondDigit !== undefined) {
      customerQuery = `${letter}${firstDigit}${secondDigit}`;
      codeStart = i;
      codeEnd = i + 3;
      break;
    }
  }

  if (!customerQuery) return null;

  const mealText = commandTokens
    .filter((_, index) => index < codeStart || index >= codeEnd)
    .join(" ")
    .trim();

  if (!mealText) return null;

  const mealQueries = mealText
    .split(/\s+(?:dan|lalu|kemudian)\s+|,\s*/)
    .map((meal) => normalizeText(meal))
    .filter(Boolean);

  if (!mealQueries.length) return null;

  return { customerQuery, mealQueries };
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
  const [noMealDays, setNoMealDays] = useState<NoMealDay[]>([]);
  const [skipDate, setSkipDate] = useState("");
  const [skipSubscriptionId, setSkipSubscriptionId] = useState("");
  const [skipSearch, setSkipSearch] = useState("");
  const [skipDropdownOpen, setSkipDropdownOpen] = useState(false);
  const [skipSaving, setSkipSaving] = useState(false);
  const [skipHistoryDate, setSkipHistoryDate] = useState("");
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [todayDate, setTodayDate] = useState("");
  const [historyDate, setHistoryDate] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [packageMealIds, setPackageMealIds] = useState<string[]>([]);
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [showVoiceDialog, setShowVoiceDialog] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [pendingVoice, setPendingVoice] = useState<RecognitionResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const toast = useToast();

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const loadingRef = useRef(false);
  const customerAutocompleteRef = useRef<HTMLDivElement>(null);
  const skipAutocompleteRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async (showLoader = true) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (showLoader) setLoading(true);

    try {
      const [
        subscriptionResponse,
        pickupResponse,
        noMealDayResponse,
      ] = await Promise.all([
        fetch("/api/subscriptions", { cache: "no-store" }),
        fetch("/api/meal-pickups", { cache: "no-store" }),
        fetch("/api/no-meal-days", { cache: "no-store" }),
      ]);

      if (
        subscriptionResponse.status === 401 ||
        pickupResponse.status === 401 ||
        noMealDayResponse.status === 401
      ) {
        window.location.href = "/login";
        return;
      }

      const [
        subscriptionData,
        pickupData,
        noMealDayData,
      ] = await Promise.all([
        subscriptionResponse.json(),
        pickupResponse.json(),
        noMealDayResponse.json(),
      ]) as [
        ApiResponse<Subscription>,
        ApiResponse<Pickup> | Pickup[],
        NoMealDay[] | { message?: string },
      ];

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

      if (!noMealDayResponse.ok) {
        throw new Error(
          getErrorMessage(
            noMealDayData,
            "Gagal mengambil riwayat tidak mengambil makanan.",
          ),
        );
      }

      setSubscriptions(subscriptionData.subscriptions ?? []);
      setPickups(Array.isArray(pickupData) ? pickupData : []);
      setNoMealDays(Array.isArray(noMealDayData) ? noMealDayData : []);
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
    function updateCurrentDateTime() {
      const today = getToday();

      setTodayDate(today);
      setPickupDate(today);
      setPickupTime(getCurrentTime());
    }

    updateCurrentDateTime();

    const interval = window.setInterval(updateCurrentDateTime, 10000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!historyDate && todayDate) {
      setHistoryDate(todayDate);
    }
  }, [todayDate, historyDate]);

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

  useEffect(() => {
    function handleOutsideClick(event: PointerEvent) {
      const target = event.target as Node;

      if (
        customerAutocompleteRef.current &&
        !customerAutocompleteRef.current.contains(target)
      ) {
        setCustomerDropdownOpen(false);
      }

      if (
        skipAutocompleteRef.current &&
        !skipAutocompleteRef.current.contains(target)
      ) {
        setSkipDropdownOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsideClick);

    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
    };
  }, []);

  const eligibleSubscriptions = useMemo(() => {
    return subscriptions.filter((subscription) => {
      const eligible =
        subscription.customer.status === "ACTIVE" &&
        getSubscriptionState(subscription, todayDate) === "ACTIVE" &&
        pickupDate >= subscription.startDate.slice(0, 10) &&
        pickupDate <= subscription.endDate.slice(0, 10);

      if (!eligible) return false;

      const alreadySkipped = noMealDays.some(
        (item) =>
          item.subscriptionId === subscription.id &&
          item.date.slice(0, 10) === pickupDate,
      );

      return !alreadySkipped;
    });
  }, [subscriptions, pickupDate, todayDate, noMealDays]);

  const eligibleSkipSubscriptions = useMemo(() => {
    return subscriptions.filter((subscription) => {
      const startDate = subscription.startDate.slice(0, 10);
      const endDate = subscription.endDate.slice(0, 10);

      const eligible =
        subscription.customer.status === "ACTIVE" &&
        subscription.status === "ACTIVE" &&
        skipDate >= startDate &&
        skipDate <= endDate;

      if (!eligible) return false;

      const alreadySkipped = noMealDays.some(
        (item) =>
          item.subscriptionId === subscription.id &&
          item.date.slice(0, 10) === skipDate,
      );

      const alreadyPickedUp = pickups.some(
        (item) =>
          item.subscriptionId === subscription.id &&
          getPickupDate(item.pickupDate) === skipDate,
      );

      return !alreadySkipped && !alreadyPickedUp;
    });
  }, [subscriptions, skipDate, noMealDays, pickups]);

  const filteredSkipSubscriptions = useMemo(() => {
    const query = normalizeText(skipSearch);

    if (!query) return eligibleSkipSubscriptions;

    return eligibleSkipSubscriptions.filter(
      (subscription) =>
        normalizeText(subscription.customer.name).includes(query) ||
        normalizeText(subscription.customer.code).includes(query) ||
        normalizeText(subscription.package.name).includes(query),
    );
  }, [eligibleSkipSubscriptions, skipSearch]);

  const skipCustomerSuggestions = skipSubscriptionId
    ? eligibleSkipSubscriptions
    : filteredSkipSubscriptions;

  const selectedSubscription = subscriptions.find(
    (subscription) => subscription.id === subscriptionId,
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
    ? Math.max(
        0,
        selectedSubscription.package.dailyQuota - dailyQuantity,
      )
    : 0;

  const selectedMeals =
    selectedSubscription?.package.meals.filter((meal) =>
      packageMealIds.includes(meal.id),
    ) ?? [];

  const takenMealIds = useMemo(() => {
    if (!subscriptionId || !pickupDate) return [];

    return pickups
      .filter(
        (pickup) =>
          pickup.subscriptionId === subscriptionId &&
          getPickupDate(pickup.pickupDate) === pickupDate,
      )
      .map((pickup) => pickup.packageMealId);
  }, [pickups, subscriptionId, pickupDate]);

  const availableMealOptions =
    selectedSubscription?.package.meals.filter(
      (meal) => !takenMealIds.includes(meal.id),
    ) ?? [];

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

  const customerSuggestions = subscriptionId
  ? eligibleSubscriptions
  : filteredSubscriptions;

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

  const filteredNoMealDays = useMemo(() => {
    return noMealDays.filter(
      (item) =>
        !skipHistoryDate || item.date.slice(0, 10) === skipHistoryDate,
    );
  }, [noMealDays, skipHistoryDate]);

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
    const subscription = eligibleSubscriptions.find((item) => item.id === id);

    if (!subscription) return;

    setSubscriptionId(id);
    setCustomerQuery(subscription.customer.name);
    setCustomerDropdownOpen(false);
    setPackageMealIds([]);
    setPendingVoice(null);
    setVoiceStatus("");
  }

  function toggleMeal(mealId: string) {
    setPackageMealIds((current) => {
      if (current.includes(mealId)) {
        return current.filter((id) => id !== mealId);
      }
      return current.length < remainingQuota ? [...current, mealId] : current;
    });
    setPendingVoice(null);
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
    const matchedMeals: Meal[] = [];

    for (const mealQuery of result.mealQueries) {
      const matches = customer.package.meals.filter((meal) => {
        const baseMealName = normalizeText(meal.mealName.split(/\s+dan\s+/i)[0]);
        return (
          baseMealName === mealQuery ||
          baseMealName.includes(mealQuery) ||
          mealQuery.includes(baseMealName)
        );
      });

      if (matches.length !== 1) {
        setVoiceStatus(
          `Menu "${mealQuery}" tidak cocok secara pasti dengan lauk dalam paket pelanggan.`,
        );
        setPendingVoice(null);
        return;
      }

      if (matchedMeals.some((meal) => meal.id === matches[0].id)) {
        setVoiceStatus("Lauk yang sama disebutkan lebih dari satu kali.");
        setPendingVoice(null);
        return;
      }

      matchedMeals.push(matches[0]);

      const alreadyTakenMeal = matchedMeals.find((meal) =>
        pickups.some(
          (pickup) =>
            pickup.subscriptionId === customer.id &&
            pickup.packageMealId === meal.id &&
            getPickupDate(pickup.pickupDate) === pickupDate,
        ),
      );

      if (alreadyTakenMeal) {
        setVoiceStatus(
          `${alreadyTakenMeal.mealName} sudah diambil hari ini. Silakan sebutkan menu lain.`,
        );
        setPendingVoice(null);
        return;
      }
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

    const availableQuota = Math.max(
      0,
      customer.package.dailyQuota - usedQuota,
    );

    if (matchedMeals.length > availableQuota) {
      setVoiceStatus(
        `Jumlah lauk melebihi sisa kuota ${availableQuota}.`,
      );
      setPendingVoice(null);
      return;
    }

    if (matchedMeals.length > customer.package.meals.length) {
      setVoiceStatus("Jumlah lauk melebihi isi paket pelanggan.");
      setPendingVoice(null);
      return;
    }

    setCustomerQuery(customer.customer.name);
    setSubscriptionId(customer.id);
    setPackageMealIds(matchedMeals.map((meal) => meal.id));
    setPendingVoice(result);

    setVoiceStatus(
      `Suara dikenali: ${customer.customer.name}, ${matchedMeals.map((meal) => meal.mealName).join(", ")}. Periksa kembali sebelum menyimpan.`,
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
            `Ucapan "${transcript || "tidak terdeteksi"}" belum dapat dipahami. Contoh: kode pelanggan K65, ayam dan ikan.`);
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
        "Mendengarkan. Sebutkan kode pelanggan dan lauk yang diambil."
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

  function closeVoiceDialog() {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setIsListening(false);
    setShowVoiceDialog(false);
    setPendingVoice(null);
    setVoiceStatus("");
    setCustomerQuery("");
    setSubscriptionId("");
    setPackageMealIds([]);
    setCustomerDropdownOpen(false);
  }

  function handleSavePickup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetMessages();

    if (
      !subscriptionId ||
      !packageMealIds.length ||
      !pickupDate ||
      !pickupTime
    ) {
      toast.error("Pelanggan, lauk, tanggal, dan waktu wajib diisi.");
      return;
    }

    if (pickupDate > todayDate) {
      toast.error("Tanggal pengambilan tidak boleh di masa depan.");
      return;
    }

    if (!selectedSubscription || selectedMeals.length !== packageMealIds.length) {
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

    if (
        new Set(packageMealIds).size !== packageMealIds.length ||
        packageMealIds.length > remainingQuota ||
        packageMealIds.length > availableMealOptions.length
      ) {
        toast.error("Jumlah atau pilihan lauk tidak valid.");
        return;
      }

    if (packageMealIds.some((id) => takenMealIds.includes(id))) {
      toast.error("Salah satu lauk sudah diambil pada tanggal tersebut.");
      return;
    }

    setShowConfirm(true);
  }

  async function confirmSavePickup() {
    if (!selectedSubscription || !selectedMeals.length || saving) return;

    setSaving(true);
    resetMessages();

    try {
      const response = await fetch("/api/meal-pickups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionId,
          packageMealIds,
          pickupDate,
          pickupTime,
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Gagal mencatat pengambilan makanan."),
        );
      }

      toast.success(
        "Pengambilan berhasil dicatat",
        data.message ?? "Data pengambilan makanan berhasil disimpan.",
      );

      setShowConfirm(false);
      setCustomerQuery("");
      setSubscriptionId("");
      setPackageMealIds([]);
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
          : "Terjadi kesalahan saat menyimpan pengambilan.",
      );
      setShowConfirm(false);
    } finally {
      setSaving(false);
    }
  }

  async function confirmSaveSkipDay() {
    if (!skipDate || !skipSubscriptionId || skipSaving) return;

    const subscription = subscriptions.find(
      (item) => item.id === skipSubscriptionId,
    );

    if (!subscription) {
      toast.error("Langganan pelanggan tidak ditemukan.");
      return;
    }

    setSkipSaving(true);

    try {
      const response = await fetch("/api/no-meal-days", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerId: subscription.customer.id,
          subscriptionId: subscription.id,
          date: skipDate,
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Gagal mencatat jadwal tidak mengambil makanan."),
        );
      }

      toast.success(
        "Skip Day berhasil dicatat",
        data.message ?? "Jadwal tidak mengambil makanan berhasil disimpan.",
      );

      setShowSkipConfirm(false);
      setSkipSubscriptionId("");
      setSkipSearch("");
      setSkipHistoryDate(skipDate);

      await loadData(false);
    } catch (error) {
      toast.error(
        "Gagal mencatat Skip Day",
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menyimpan data.",
      );
    } finally {
      setSkipSaving(false);
    }
  }

  function resetForm() {
    setCustomerQuery("");
    setSubscriptionId("");
    setCustomerDropdownOpen(false);
    setCustomerDropdownOpen(false);
    setPackageMealIds([]);
    setPickupDate(todayDate);
    setPickupTime(getCurrentTime());
    setPendingVoice(null);
    setVoiceStatus("");
    setShowConfirm(false);
    resetMessages();
  }

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

      {/* 1. Input Suara, di atas card */}
      <div className="pickups-voice-panel">
        <div className="pickups-voice-description">
          <span className="pickups-voice-icon">🎙</span>
          <div>
            <strong>Input Suara</strong>
            <p>Sebutkan kode pelanggan, menu, dan jumlah porsi untuk mencatat pengambilan.</p>
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

      {/* 2. Catat Pengambilan */}
      <section className="subscriptions-form-panel panel">
        <div className="subscriptions-section-heading">
          <div>
            <h2>Catat Pengambilan</h2>
            <p>Pilih pelanggan atau gunakan input suara untuk mengisi formulir.</p>
          </div>
        </div>

         <form onSubmit={handleSavePickup} className="subscriptions-form">
          <div className="subscriptions-field pickups-customer-field">
            <span>Nama Pelanggan</span>

            <div
                className="pickups-customer-autocomplete"
                ref={customerAutocompleteRef}
            >
              <input
                type="text"
                value={customerQuery}
                onChange={(event) => {
                  setCustomerQuery(event.target.value);
                  setSubscriptionId("");
                  setPackageMealIds([]);
                  setPendingVoice(null);
                  setVoiceStatus("");
                  setCustomerDropdownOpen(true);
                }}
                onFocus={() => setCustomerDropdownOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setCustomerDropdownOpen(false);
                  }

                  if (event.key === "Enter" && customerDropdownOpen) {
                    event.preventDefault();

                    if (customerSuggestions.length === 1) {
                      selectSubscription(customerSuggestions[0].id);
                    }
                  }
                }}
                placeholder="Cari atau pilih nama pelanggan..."
                autoComplete="off"
                role="combobox"
                aria-expanded={customerDropdownOpen}
                aria-controls="pickups-customer-options"
                aria-autocomplete="list"
              />

              {customerDropdownOpen && (
                <div
                  id="pickups-customer-options"
                  className="pickups-customer-options"
                  role="listbox"
                >
                  {customerSuggestions.length > 0 ? (
                    customerSuggestions.map((subscription) => (
                      <button
                        key={subscription.id}
                        type="button"
                        role="option"
                        aria-selected={subscription.id === subscriptionId}
                        className={`pickups-customer-option${
                          subscription.id === subscriptionId ? " is-selected" : ""
                        }`}
                        onClick={() => selectSubscription(subscription.id)}
                      >
                        <span className="pickups-customer-option-main">
                          <strong>{subscription.customer.name}</strong>
                          <small>
                            {subscription.customer.code} · {subscription.package.name}
                          </small>
                        </span>

                        {subscription.id === subscriptionId && (
                          <span className="pickups-customer-option-check">✓</span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="pickups-customer-empty">
                      Tidak ada pelanggan aktif yang cocok pada tanggal tersebut.
                    </div>
                  )}
                </div>
              )}
            </div>

            <small>
              Ketik nama atau kode pelanggan, atau klik kolom untuk memilih dari daftar.
            </small>
          </div>

          <div className="subscriptions-field pickups-current-datetime">
            <span>Tanggal Pengambilan</span>
            <div className="pickups-current-datetime-value">
              <strong>{pickupDate ? formatDate(pickupDate) : "Memuat..."}</strong>
              <small>Otomatis mengikuti tanggal hari ini</small>
            </div>
          </div>

          <div className="subscriptions-field pickups-current-datetime">
            <span>Waktu Pengambilan</span>
            <div className="pickups-current-datetime-value">
              <strong>{pickupTime || "Memuat..."}</strong>
              <small>Diperbarui secara otomatis</small>
            </div>
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

          {selectedSubscription && (
            <div className="subscriptions-field pickups-meal-field">
              <div className="pickups-meal-heading">
                <span>Pilih Lauk</span>
                <small>
                  {selectedMeals.length} dipilih · Sisa kuota{" "}
                  {Math.max(0, remainingQuota - selectedMeals.length)}
                </small>
              </div>

              <div className="pickups-meal-grid" role="group" aria-label="Pilih lauk">
                {selectedSubscription.package.meals.map((meal) => {
                  const checked = packageMealIds.includes(meal.id);
                  const taken = takenMealIds.includes(meal.id);
                  const limitReached = !checked && selectedMeals.length >= remainingQuota;

                  return (
                    <button
                      key={meal.id}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      disabled={saving || taken || limitReached}
                      onClick={() => toggleMeal(meal.id)}
                      className={`pickups-meal-card${checked ? " is-checked" : ""}${
                        taken ? " is-taken" : ""
                      }`}
                    >
                      <span className="pickups-meal-check" aria-hidden="true">
                        <svg viewBox="0 0 16 16" width="12" height="12">
                          <path
                            d="M3 8.5 6.5 12 13 4.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="pickups-meal-name">{meal.mealName}</span>
                      <small className="pickups-meal-status">
                        {taken ? "Sudah diambil" : checked ? "Dipilih" : ""}
                      </small>
                    </button>
                  );
                })}
              </div>

              {remainingQuota < 1 && (
                <small>Kuota pengambilan sudah habis.</small>
              )}
            </div>
          )}

          {pendingVoice && (
            <div className="pickups-voice-confirmation">
              <strong>Periksa Hasil Pengenalan Suara</strong>
              <p>Pelanggan: {pendingVoice.customerQuery}</p>
              <p>
                Menu: {selectedMeals.map((meal) => meal.mealName).join(", ")}
              </p>
              <p>Jumlah: {selectedMeals.length} lauk</p>
              <small>
                Periksa nama pelanggan dan lauk sebelum menyimpan. Data belum tersimpan sampai pencatatan dikonfirmasi.
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
                selectedMeals.length === 0 ||
                selectedMeals.length !== packageMealIds.length ||
                remainingQuota < 1
              }
            >
              Catat Pengambilan
            </button>
          </div>
        </form>
      </section>

      {/* 3. Tandai Tidak Ambil */}
      <section className="subscriptions-form-panel panel">
        <div className="subscriptions-section-heading">
          <div>
            <h2>Tandai Tidak Ambil</h2>
            <p>
              Catat pelanggan yang tidak mengambil makanan pada tanggal tertentu.
            </p>
          </div>
        </div>

        <form
          className="subscriptions-form"
          onSubmit={(event) => {
            event.preventDefault();

            if (!skipDate || !skipSubscriptionId) {
              toast.error("Tanggal dan pelanggan wajib dipilih.");
              return;
            }

            setShowSkipConfirm(true);
          }}
        >
          <div className="subscriptions-field">
            <span>Tanggal Tidak Ambil</span>
            <DatePicker
              value={skipDate}
              aria-label="Tanggal tidak mengambil makanan"
              onChange={(value) => {
                setSkipDate(value);
                setSkipSubscriptionId("");
                setSkipSearch("");
                setSkipDropdownOpen(false);
              }}
            />
          </div>

          <div className="subscriptions-field pickups-customer-field">
          <span>Nama Pelanggan</span>

          <div
            className="pickups-customer-autocomplete"
            ref={skipAutocompleteRef}
          >
            <input
              type="text"
              value={skipSearch}
              onChange={(event) => {
                setSkipSearch(event.target.value);
                setSkipSubscriptionId("");
                setSkipDropdownOpen(true);
              }}
              onFocus={() => setSkipDropdownOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSkipDropdownOpen(false);
                }

                if (event.key === "Enter" && skipDropdownOpen) {
                  event.preventDefault();

                  if (skipCustomerSuggestions.length === 1) {
                    const subscription = skipCustomerSuggestions[0];
                    setSkipSubscriptionId(subscription.id);
                    setSkipSearch(subscription.customer.name);
                    setSkipDropdownOpen(false);
                  }
                }
              }}
              placeholder="Cari atau pilih nama pelanggan..."
              autoComplete="off"
              role="combobox"
              aria-expanded={skipDropdownOpen}
            />

            {skipDropdownOpen && (
              <div className="pickups-customer-options" role="listbox">
                {skipCustomerSuggestions.length > 0 ? (
                  skipCustomerSuggestions.map((subscription) => (
                    <button
                      key={subscription.id}
                      type="button"
                      role="option"
                      aria-selected={subscription.id === skipSubscriptionId}
                      className={`pickups-customer-option${
                        subscription.id === skipSubscriptionId ? " is-selected" : ""
                      }`}
                      onClick={() => {
                        setSkipSubscriptionId(subscription.id);
                        setSkipSearch(subscription.customer.name);
                        setSkipDropdownOpen(false);
                      }}
                    >
                      <span className="pickups-customer-option-main">
                        <strong>{subscription.customer.name}</strong>
                        <small>
                          {subscription.customer.code} · {subscription.package.name}
                        </small>
                      </span>

                      {subscription.id === skipSubscriptionId && (
                        <span className="pickups-customer-option-check">✓</span>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="pickups-customer-empty">
                    {skipDate
                      ? "Tidak ada pelanggan aktif yang memenuhi syarat pada tanggal tersebut."
                      : "Pilih tanggal terlebih dahulu."}
                  </div>
                )}
              </div>
            )}
          </div>

          <small>
            Ketik nama atau kode pelanggan, atau klik kolom untuk memilih dari daftar.
          </small>
        </div>

          <div className="subscriptions-form-actions">
            <button
              type="button"
              className="subscriptions-secondary-button"
              disabled={skipSaving}
              onClick={() => {
                setSkipSubscriptionId("");
                setSkipSearch("");
                setSkipDropdownOpen(false);
              }}
            >
              Reset Form
            </button>

            <button
              type="submit"
              className="subscriptions-primary-button"
              disabled={
                loading ||
                skipSaving ||
                !skipDate ||
                !skipSubscriptionId
              }
            >
              Tandai Tidak Ambil
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

      <section className="subscriptions-list-panel panel">
        <div className="subscriptions-section-heading">
          <div>
            <h2>Riwayat Tidak Ambil</h2>
            <p>
              {filteredNoMealDays.length} catatan tidak mengambil makanan.
            </p>
          </div>
        </div>

        <div className="subscriptions-filters pickups-history-filters">
          <div className="pickups-date-filter">
            <span>Filter tanggal</span>
            <DatePicker
              value={skipHistoryDate}
              onChange={setSkipHistoryDate}
              aria-label="Filter tanggal riwayat tidak ambil"
            />
          </div>

          <button
            type="button"
            className="subscriptions-secondary-button"
            onClick={() => setSkipHistoryDate("")}
          >
            Semua Tanggal
          </button>
        </div>

        {filteredNoMealDays.length === 0 ? (
          <div className="subscriptions-empty-state">
            <h3>Belum ada catatan Tidak Ambil</h3>
            <p>Catatan yang sesuai dengan filter akan muncul di sini.</p>
          </div>
        ) : (
          <div className="subscriptions-table-wrapper">
            <table className="subscriptions-table">
              <thead>
                <tr>
                  <th>Pelanggan</th>
                  <th>Paket</th>
                  <th>Tanggal Tidak Ambil</th>
                  <th>Perpanjangan</th>
                </tr>
              </thead>

              <tbody>
                {filteredNoMealDays.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="subscriptions-customer-cell">
                        <span className="subscriptions-avatar">
                          {item.customer.name
                            .trim()
                            .charAt(0)
                            .toUpperCase() || "?"}
                        </span>

                        <span>
                          <strong>{item.customer.name}</strong>
                          <small>{item.customer.code}</small>
                        </span>
                      </div>
                    </td>

                    <td>{item.subscription.package.name}</td>

                    <td>{formatDate(item.date)}</td>

                    <td>
                      {item.extension
                        ? `${item.extension.days} hari`
                        : "Belum diperpanjang"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog
        open={showConfirm && Boolean(selectedSubscription && selectedMeals.length)}
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
            <dd>{selectedMeals.map((meal) => meal.mealName).join(", ")}</dd>
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
            <dt>Jumlah Lauk</dt>
            <dd>{selectedMeals.length} lauk</dd>
          </div>
           <div>
            <dt>Sisa kuota</dt>
            <dd>{remainingQuota - selectedMeals.length} porsi</dd>
          </div>
        </dl>
      </Dialog>

      <Dialog
        open={showSkipConfirm}
        onClose={() => setShowSkipConfirm(false)}
        busy={skipSaving}
        icon="!"
        title="Konfirmasi Tidak Ambil"
        description="Pastikan pelanggan dan tanggal sudah benar sebelum menyimpan."
        footer={
          <>
            <button
              type="button"
              className="subscriptions-secondary-button"
              disabled={skipSaving}
              onClick={() => setShowSkipConfirm(false)}
            >
              Periksa Lagi
            </button>

            <button
              type="button"
              className="subscriptions-primary-button"
              disabled={skipSaving}
              onClick={() => void confirmSaveSkipDay()}
            >
              {skipSaving ? "Menyimpan..." : "Ya, Catat"}
            </button>
          </>
        }
      >
        <dl className="dialog-rows">
          <div>
            <dt>Pelanggan</dt>
            <dd>
              {
                subscriptions.find(
                  (item) => item.id === skipSubscriptionId,
                )?.customer.name ?? "-"
              }
            </dd>
          </div>

          <div>
            <dt>Kode Pelanggan</dt>
            <dd>
              {
                subscriptions.find(
                  (item) => item.id === skipSubscriptionId,
                )?.customer.code ?? "-"
              }
            </dd>
          </div>

          <div>
            <dt>Paket</dt>
            <dd>
              {
                subscriptions.find(
                  (item) => item.id === skipSubscriptionId,
                )?.package.name ?? "-"
              }
            </dd>
          </div>

          <div>
            <dt>Tanggal</dt>
            <dd>{formatDate(skipDate)}</dd>
          </div>
        </dl>
      </Dialog>

      <Dialog
        open={showVoiceDialog}
        onClose={closeVoiceDialog}
        title="Input Suara"
        description="Sebutkan kode pelanggan dan nama lauk yang diambil."
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
            <strong>Kode pelanggan K65, ayam dan ikan.</strong>
          </div>

          {pendingVoice && selectedSubscription && selectedMeals.length > 0 && (
            <div className="pickups-voice-dialog-example">
              <span>Hasil pengenalan suara</span>
              <strong>{selectedSubscription.customer.name}</strong>
              <strong>Kode: {selectedSubscription.customer.code}</strong>
              <strong>
                Menu: {selectedMeals.map((meal) => meal.mealName).join(", ")}
              </strong>
              <strong>Jumlah: {selectedMeals.length} lauk</strong>
              <strong>
                Sisa kuota setelah pengambilan: {remainingQuota - selectedMeals.length} porsi
              </strong>
            </div>
          )}
        </div>

        <div className="pickups-voice-dialog-actions">
          {isListening ? (
            <button
              type="button"
              className="subscriptions-primary-button"
              onClick={closeVoiceDialog}
            >
              Berhenti
            </button>
          ) : (
            <>
              <button
                type="button"
                className="subscriptions-secondary-button"
                onClick={closeVoiceDialog}
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
                  selectedMeals.length === 0 ||
                  selectedMeals.length !== packageMealIds.length ||
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