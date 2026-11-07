import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Building2,
  CalendarDays,
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Copy,
  FileDown,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Target,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  fetchManagementOverview,
  fetchTrackedPlayerDirectory,
  fetchPlayerCompanyCalculation,
  fetchPlayerCompanyCalculations,
  ManagementMemberItem,
  ManagementOverviewResponse,
  PlayerCompanyCalculationResponse,
  TrackedPlayerDirectoryEntry,
} from "../services/wareraApi";
import { DonationCalculationModal } from "./DonationCalculationModal";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const GAME_RESET_MS = 3 * 60 * 60 * 1000;
const RULES_KEY = "nizam-donation-rules-v2";
const EXCLUDED_KEY = "nizam-donation-excluded-v2";
const CLASSES_KEY = "nizam-donation-classes-v2";

type DonationRules = {
  minLevel: number;
  rateMid: number; // 20k - 30k (%20)
  rateRich: number; // 30k+ (%25)
  wealthThresholdMid: number; // 20000
  wealthThresholdRich: number; // 30000
  startDate: string;
};

type DonationClass = "auto" | "eco" | "fighter";
type PaymentView = "total" | "country" | "mu";
type DonationCell = { country: number; mu: number; total: number; state: string; carry: number };

type DonationRow = ManagementMemberItem & {
  muId: string;
  armyName: string;
  donationCells: DonationCell[];
  donationClass: "eco" | "fighter";
  excluded: boolean;
  dailyTarget: number;
  weeklyTarget: number;
  previousTarget: number;
  previousPaid: number;
  carryIn: number;
  dueToDate: number;
  paidToDate: number;
  countryToDate: number;
  muToDate: number;
  paidThisWeek: number;
  countryThisWeek: number;
  muThisWeek: number;
  unpaid: number;
  surplus: number;
  statusLabel: string;
  autoIncome: number;
  workerIncome: number;
  totalDailyRevenue: number;
  donationRate: number;
  donationRateLabel: string;
};

type DonationDisplayItem = NonNullable<ManagementMemberItem["latestDonations"]>[number] & {
  dailySummary?: boolean;
};

const DEFAULT_RULES: DonationRules = {
  minLevel: 30,
  wealthThresholdMid: 20000,
  wealthThresholdRich: 30000,
  rateMid: 0.20,
  rateRich: 0.25,
  startDate: "",
};

function readStorage<T extends object>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? Object.assign({}, fallback, JSON.parse(stored)) as T : fallback;
  } catch {
    return fallback;
  }
}

function gameDayKeyNow() {
  return new Date(Date.now() - GAME_RESET_MS).toISOString().slice(0, 10);
}

function currentGameWeekStart() {
  const monday = new Date(`${gameDayKeyNow()}T03:00:00.000Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function weekDates(start: string) {
  const first = new Date(`${start}T03:00:00.000Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function shiftDate(date: string, days: number) {
  const next = new Date(`${date}T03:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function money(value: number) {
  return `${Math.round(value).toLocaleString("tr-TR")} Gold`;
}

function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) {
  return new Date(`${date}T12:00:00.000Z`).toLocaleDateString("tr-TR", options);
}

function relativeDonationTime(timestamp: string) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "şimdi";
  if (minutes < 60) return `${minutes} dk önce`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)} sa önce`;
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

function recentDonationsForRow(row: DonationRow): DonationDisplayItem[] {
  const detailed = row.latestDonations || [];
  if (detailed.length) {
    return [...detailed]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 7);
  }

  return Object.entries(row.donationsByDate || {}).flatMap(([date, amounts]) => {
    const timestamp = `${date}T12:00:00.000Z`;
    const summaries: DonationDisplayItem[] = [];
    if (amounts.country > 0) summaries.push({
      id: `${row.userId}-${date}-country-summary`, amount: amounts.country, currency: "Gold", timestamp,
      target: "country", targetName: "Ülke · günlük toplam", dailySummary: true,
    });
    if (amounts.mu > 0) summaries.push({
      id: `${row.userId}-${date}-mu-summary`, amount: amounts.mu, currency: "Gold", timestamp,
      target: "mu", targetName: `${row.armyName} · günlük toplam`, dailySummary: true,
    });
    return summaries;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 7);
}

function amountFor(cell: { country: number; mu: number; total: number }, view: PaymentView) {
  return view === "country" ? cell.country : view === "mu" ? cell.mu : cell.total;
}

function stateStyle(state: string) {
  if (state === "ok" || state === "covered") return "bg-emerald-950/70 text-emerald-300 border-emerald-500/30";
  if (state === "partial" || state === "today") return "bg-amber-950/70 text-amber-200 border-amber-500/30";
  if (state === "missed") return "bg-rose-950/70 text-rose-300 border-rose-500/30";
  if (state === "future" || state === "pre") return "bg-slate-900/70 text-slate-500 border-slate-700/60";
  return "bg-[#141C21] text-[#BBE1FA]/55 border-[#3282B8]/15";
}

const STATE_LABEL: Record<string, string> = {
  ok: "Tamam", covered: "Fazlası karşıladı", partial: "Kısmi", missed: "Eksik",
  today: "Bugün bekleniyor", future: "Bekleniyor", pre: "Sistem öncesi", free: "Muaf", extra: "Gönüllü",
};
const STATE_SHORT_LABEL: Record<string, string> = {
  ok: "Tamam",
  covered: "Devir",
  partial: "Kısmi",
  missed: "Eksik",
  today: "Bugün",
  future: "Bekliyor",
  pre: "Önce",
  free: "Muaf",
  extra: "Gönüllü",
};

interface Props {
  currentMuId: string;
  onSelectArmy: (muId: string) => void;
}

export const ManagementDonationTrackingSection: React.FC<Props> = ({ onSelectArmy }) => {
  const [data, setData] = useState<ManagementOverviewResponse | null>(null);
  const [weekStart, setWeekStart] = useState(currentGameWeekStart);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const activeCompanyCalculationsRequest = useRef<AbortController | null>(null);

  const [rules, setRules] = useState<DonationRules>(() => readStorage(RULES_KEY, DEFAULT_RULES));
  const [excludedIds, setExcludedIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem(EXCLUDED_KEY) || "[]"); } catch { return []; }
  });
  const [manualClasses, setManualClasses] = useState<Record<string, DonationClass>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(window.localStorage.getItem(CLASSES_KEY) || "{}"); } catch { return {}; }
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState(() => ({
    minLevel: String(rules.minLevel),
    rateMid: String(rules.rateMid * 100),
    rateRich: String(rules.rateRich * 100),
    wealthThresholdMid: String(rules.wealthThresholdMid),
    wealthThresholdRich: String(rules.wealthThresholdRich),
    startDate: rules.startDate,
  }));

  const [paymentView, setPaymentView] = useState<PaymentView>("total");
  const [armyFilter, setArmyFilter] = useState("all");
  const [memberFilter, setMemberFilter] = useState("owing");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Company revenue calculations state
  const [companyCalcs, setCompanyCalcs] = useState<Record<string, PlayerCompanyCalculationResponse>>({});
  const [activeCalculationModalData, setActiveCalculationModalData] = useState<PlayerCompanyCalculationResponse | null>(null);
  const [isCalculatingModal, setIsCalculatingModal] = useState(false);
  const [calculationModalError, setCalculationModalError] = useState<string | null>(null);

  // Top Player Search Bar (Maddeler 11)
  const [trackedPlayers, setTrackedPlayers] = useState<TrackedPlayerDirectoryEntry[]>([]);
  const [topSearchQuery, setTopSearchQuery] = useState("");
  const [topSearchOpen, setTopSearchOpen] = useState(false);
  const [selectedTopUserCalc, setSelectedTopUserCalc] = useState<PlayerCompanyCalculationResponse | null>(null);
  const [isLoadingTopUser, setIsLoadingTopUser] = useState(false);
  const [topUserError, setTopUserError] = useState<string | null>(null);

  // Load tracked player directory for top search
  useEffect(() => {
    let active = true;
    fetchTrackedPlayerDirectory()
      .then((players) => {
        if (active) setTrackedPlayers(players);
      })
      .catch((e) => console.warn("Failed loading player directory:", e));
    return () => { active = false; };
  }, []);

  const topSearchMatches = useMemo(() => {
    const q = topSearchQuery.trim().toLocaleLowerCase("tr-TR");
    if (q.length < 2) return [];
    return trackedPlayers
      .filter((p) => p.username.toLocaleLowerCase("tr-TR").includes(q) || p.userId.toLowerCase().includes(q))
      .slice(0, 8);
  }, [trackedPlayers, topSearchQuery]);

  const handleSelectTopPlayer = async (player: TrackedPlayerDirectoryEntry) => {
    setTopSearchQuery(player.username);
    setTopSearchOpen(false);
    setIsLoadingTopUser(true);
    setTopUserError(null);
    try {
      const calc = companyCalcs[player.userId] || await fetchPlayerCompanyCalculation(player.userId);
      setCompanyCalcs((prev) => ({ ...prev, [player.userId]: calc }));
      setSelectedTopUserCalc(calc);
    } catch (err: any) {
      setTopUserError(err.message || "Oyuncu şirket hesaplaması alınamadı");
    } finally {
      setIsLoadingTopUser(false);
    }
  };

  const openCalculationModal = async (userId: string) => {
    setIsCalculatingModal(true);
    setCalculationModalError(null);
    try {
      const calc = companyCalcs[userId] || await fetchPlayerCompanyCalculation(userId);
      setCompanyCalcs((prev) => ({ ...prev, [userId]: calc }));
      setActiveCalculationModalData(calc);
    } catch (err: any) {
      setCalculationModalError(err.message || "Hesaplama ayrıntıları alınamadı");
    } finally {
      setIsCalculatingModal(false);
    }
  };

  const loadData = async (forceRefresh = false) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const requestId = ++requestSequence.current;
    if (forceRefresh) setIsRefreshing(true);
    else {
      setIsLoading(true);
      setData(null);
    }
    setError(null);
    try {
      const response = await fetchManagementOverview(weekStart, forceRefresh, controller.signal);
      if (requestId === requestSequence.current) {
        setData(response);
        // Pre-populate company calcs from response if available
        const calcs: Record<string, PlayerCompanyCalculationResponse> = {};
        for (const army of response.armies) {
          for (const m of army.members) {
            if (m.factoryCalculation) {
              calcs[m.userId] = m.factoryCalculation;
            }
          }
        }
        if (Object.keys(calcs).length > 0) {
          setCompanyCalcs((prev) => ({ ...prev, ...calcs }));
        }
      }
    } catch (err: any) {
      if (!controller.signal.aborted && requestId === requestSequence.current) {
        setError(err.message || "Haftalık bağış verileri yüklenemedi");
      }
    } finally {
      if (requestId === requestSequence.current && !controller.signal.aborted) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    loadData(false);
    return () => activeRequest.current?.abort();
  }, [weekStart]);

  useEffect(() => {
    if (!data) return;

    activeCompanyCalculationsRequest.current?.abort();
    const controller = new AbortController();
    activeCompanyCalculationsRequest.current = controller;
    const calculationsInResponse = new Set(
      data.armies.flatMap((army) =>
        army.members
          .filter((member) => member.factoryCalculation)
          .map((member) => member.userId),
      ),
    );
    const userIds = Array.from(new Set<string>(
      data.armies
        .filter((army) => army.dataAvailable !== false)
        .flatMap((army) =>
          army.members
            .filter((member) => !member.incomeCalculated)
            .map((member) => member.userId),
        ),
    )).filter((userId) =>
      !companyCalcs[userId] && !calculationsInResponse.has(userId),
    );
    if (userIds.length === 0) return () => controller.abort();

    void fetchPlayerCompanyCalculations(userIds, controller.signal)
      .then(({ calculations, errors }) => {
        if (controller.signal.aborted) return;
        setCompanyCalcs((previous) => ({ ...previous, ...calculations }));
        const failedCount = Object.keys(errors).length;
        if (failedCount > 0) {
          console.warn(`Şirket gelirleri ${failedCount} oyuncu için hesaplanamadı.`);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.warn("Toplu şirket gelirleri yüklenemedi:", error);
        }
      });

    return () => controller.abort();
  }, [data]);

  useEffect(() => {
    window.localStorage.setItem(RULES_KEY, JSON.stringify(rules));
    window.localStorage.setItem(EXCLUDED_KEY, JSON.stringify(excludedIds));
    window.localStorage.setItem(CLASSES_KEY, JSON.stringify(manualClasses));
  }, [rules, excludedIds, manualClasses]);

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const previousDates = useMemo(() => dates.map((date) => shiftDate(date, -7)), [dates]);
  const today = gameDayKeyNow();
  const isCurrentWeek = weekStart === currentGameWeekStart();
  const visibleThrough = isCurrentWeek ? today : dates[6];
  const visibleDates = dates.filter((date) => date <= visibleThrough);
  const rows = useMemo<DonationRow[]>(() => {
    if (!data) return [];
    return data.armies.flatMap((army) => army.members.map((member) => {
      const storedClass = manualClasses[member.userId];
      const manualMode = storedClass && storedClass !== "auto" ? storedClass : null;
      const isEconomyOnDate = (date: string) => {
        if (manualMode) return manualMode === "eco";
        const recordedMode = member.donationTargetsByDate?.[date]?.playerMode ??
          member.playerModeByDate?.[date];
        if (recordedMode) return recordedMode === "economy";
        if (date === today) return member.playerMode === "economy";
        return date > today && member.playerMode === "economy";
      };
      const isEcoMode = isEconomyOnDate(today);
      const donationClass: "eco" | "fighter" = isEcoMode ? "eco" : "fighter";
      const excluded = excludedIds.includes(member.userId);

      // Yeni Kural:
      // Sadece 30+ seviye, 20k+ servet ve EKONOMİ modundaki oyuncular bağış atacak:
      // - Savaş modu: %0 (Muaf)
      // - 20k- servet bağış oranı: %0
      // - 20k - 30k arası servet bağış oranı: %20
      // - 30k+ arası servet bağış oranı: %25
      const calc = companyCalcs[member.userId] || member.factoryCalculation;
      const currentTargetSnapshot = member.donationTargetsByDate?.[today];
      const autoIncome = calc?.totalAutoIncome ??
        currentTargetSnapshot?.autoIncome ?? member.autoIncome ?? 0;
      const workerIncome = calc?.totalWorkerIncome ??
        currentTargetSnapshot?.workerIncome ?? member.workerIncome ?? 0;
      const totalDailyRevenue = calc?.totalDailyRevenue ??
        currentTargetSnapshot?.revenue ?? member.totalDailyRevenue ?? (autoIncome + workerIncome);
      const rateForDate = (date: string) => {
        const snapshot = member.donationTargetsByDate?.[date];
        const level = snapshot?.level ?? member.level;
        const prestigeLevel = snapshot?.prestigeLevel ?? member.prestigeLevel;
        const wealth = snapshot?.wealth ?? member.wealth;
        const isActiveOnDate = snapshot?.isActive ?? member.isActive;
        if (
          !isActiveOnDate ||
          !isEconomyOnDate(date) ||
          (level < rules.minLevel && prestigeLevel <= 0) ||
          wealth < rules.wealthThresholdMid ||
          excluded
        ) return 0;
        return wealth <= rules.wealthThresholdRich ? rules.rateMid : rules.rateRich;
      };
      const targetForDate = (date: string) => {
        const dateRate = rateForDate(date);
        if (dateRate <= 0) return 0;
        const snapshot = member.donationTargetsByDate?.[date];
        if (snapshot && !manualMode) {
          if (snapshot.incomeCalculated === false && date === today && calc) {
            return Math.round(totalDailyRevenue * dateRate);
          }
          if (snapshot.revenue !== null && Number.isFinite(Number(snapshot.revenue))) {
            return Math.round(Number(snapshot.revenue) * dateRate);
          }
          if (snapshot.eligible && snapshot.rate > 0) {
            return Math.round(snapshot.target * dateRate / snapshot.rate);
          }
          const level = snapshot.level ?? member.level;
          const wealth = snapshot.wealth ?? member.wealth;
          return Math.round(level * (wealth >= rules.wealthThresholdRich ? 2 : 1.5));
        }
        if (calc) return Math.round(totalDailyRevenue * dateRate);
        if (date === today && member.targetDonation !== undefined) return member.targetDonation;
        const snapshotLevel = snapshot?.level ?? member.level;
        const snapshotWealth = snapshot?.wealth ?? member.wealth;
        return Math.round(snapshotLevel * (snapshotWealth >= rules.wealthThresholdRich ? 2 : 1.5));
      };
      const rate = rateForDate(today);

      const rateLabel = !isEcoMode
        ? "%0 (Savaş)"
        : rate === 0
        ? "%0"
        : rate === rules.rateMid
        ? "%20"
        : "%25";
      const isEligible = rate > 0;

      const dailyTarget = isEligible
        ? targetForDate(today)
        : 0;

      const previousTarget = previousDates.reduce(
        (sum, date) => sum + ((!rules.startDate || date >= rules.startDate) ? targetForDate(date) : 0),
        0,
      );
      const previousPaid = previousDates.reduce((sum, date) => sum + (member.donationsByDate?.[date]?.total || 0), 0);
      const carryIn = isEligible ? Math.max(0, previousPaid - previousTarget) : 0;
      let carry = carryIn;

      const donationCells = dates.map((date) => {
        const raw = member.donationsByDate?.[date] || { country: 0, mu: 0, total: 0 };
        const payment = { country: Number(raw.country) || 0, mu: Number(raw.mu) || 0, total: Number(raw.total) || 0 };
        let state = "free";
        const dayActive = !rules.startDate || date >= rules.startDate;
        const dayTarget = dayActive ? targetForDate(date) : 0;
        if (!dayActive) state = payment.total ? "extra" : "pre";
        else if (dayTarget <= 0) state = payment.total ? "extra" : "free";
        else if (date > visibleThrough) state = "future";
        else {
          const available = carry + payment.total;
          if (payment.total >= dayTarget) state = "ok";
          else if (available >= dayTarget) state = "covered";
          else if (date === today) state = payment.total ? "partial" : "today";
          else state = payment.total ? "partial" : "missed";
          carry = Math.max(0, available - dayTarget);
        }
        return { ...payment, state, carry: Math.max(0, carry) };
      });

      const paidFor = (keys: string[], view: PaymentView) => keys.reduce((sum, date) => {
        const cell = donationCells[dates.indexOf(date)];
        return sum + (cell ? amountFor(cell, view) : 0);
      }, 0);

      const dueDates = dates.filter((date) => date <= visibleThrough && (!rules.startDate || date >= rules.startDate));
      const weeklyTarget = dates.reduce(
        (sum, date) => sum + ((!rules.startDate || date >= rules.startDate) ? targetForDate(date) : 0),
        0,
      );
      const dueToDate = dueDates.reduce((sum, date) => sum + targetForDate(date), 0);
      const paidToDate = paidFor(visibleDates, "total");
      const countryToDate = paidFor(visibleDates, "country");
      const muToDate = paidFor(visibleDates, "mu");
      const paidThisWeek = paidFor(dates, "total");
      const countryThisWeek = paidFor(dates, "country");
      const muThisWeek = paidFor(dates, "mu");
      const todaySnapshot = member.donationTargetsByDate?.[today];
      const todayLevel = todaySnapshot?.level ?? member.level;

      const memberStatus = !member.isActive
        ? "Pasif — bağış yükümlülüğü yok"
        : excluded
        ? "Hariç tutuldu"
        : Math.max(0, dueToDate - paidToDate - carryIn) > 0
        ? "Eksik ödeme"
        : !isEcoMode
        ? "Savaş modu — muaf"
        : dailyTarget === 0
        ? (todaySnapshot?.eligible
            ? "Bağış hedefi 0 G"
            : todayLevel < rules.minLevel &&
              (todaySnapshot?.prestigeLevel ?? member.prestigeLevel) <= 0
            ? `Seviye ${rules.minLevel} altı — muaf`
            : "20k altı servet — muaf")
        : "Güncel";

      return {
        ...member,
        muId: army.muId,
        armyName: army.name,
        donationCells,
        donationClass,
        excluded,
        dailyTarget,
        weeklyTarget,
        previousTarget,
        previousPaid,
        carryIn,
        dueToDate,
        paidToDate,
        countryToDate,
        muToDate,
        paidThisWeek,
        countryThisWeek,
        muThisWeek,
        unpaid: Math.max(0, dueToDate - (paidToDate + carryIn)),
        surplus: Math.max(0, paidToDate + carryIn - dueToDate),
        statusLabel: memberStatus,
        autoIncome,
        workerIncome,
        totalDailyRevenue,
        donationRate: rate,
        donationRateLabel: rateLabel,
      };
    }));
  }, [data, dates, previousDates, visibleThrough, today, rules, excludedIds, manualClasses, companyCalcs]);

  const totals = useMemo(() => {
    const sum = (key: keyof DonationRow) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
    const quotaToDate = rows.reduce((total, row) => total + row.dueToDate, 0);
    const weeklyQuota = rows.reduce((total, row) => total + row.weeklyTarget, 0);
    const paidToDate = sum("paidToDate");
    const previousPaid = sum("previousPaid");
    const previousQuota = sum("previousTarget");
    const poolCarryIn = Math.max(0, previousPaid - previousQuota);
    return {
      quotaToDate, weeklyQuota, paidToDate, paidThisWeek: sum("paidThisWeek"), poolCarryIn,
      unpaid: sum("unpaid"), remainingWeek: Math.max(0, weeklyQuota - sum("paidThisWeek")),
      gap: Math.max(0, quotaToDate - paidToDate - poolCarryIn),
      completion: quotaToDate ? Math.min(100, ((paidToDate + poolCarryIn) / quotaToDate) * 100) : 0,
      eligible: rows.filter((row) => row.dailyTarget > 0).length,
      owing: rows.filter((row) => row.unpaid > 0).length,
    };
  }, [rows]);

  const armyTotals = useMemo(() => data?.armies.map((army) => {
    const armyRows = rows.filter((row) => row.muId === army.muId);
    const previousPaid = armyRows.reduce((sum, row) => sum + row.previousPaid, 0);
    const previousQuota = armyRows.reduce((sum, row) => sum + row.previousTarget, 0);
    const poolCarryIn = Math.max(0, previousPaid - previousQuota);
    return {
      ...army,
      dataAvailable: army.dataAvailable !== false,
      quota: armyRows.reduce((sum, row) => sum + row.weeklyTarget, 0),
      toDate: armyRows.reduce((sum, row) => sum + row.dueToDate, 0),
      paid: armyRows.reduce((sum, row) => sum + row.paidThisWeek, 0) + poolCarryIn,
      poolCarryIn,
      unpaid: armyRows.reduce((sum, row) => sum + row.unpaid, 0),
      eligible: armyRows.filter((row) => row.dailyTarget > 0).length,
    };
  }) || [], [data, rows]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (armyFilter !== "all" && row.muId !== armyFilter) return false;
    if (search.trim() && !row.username.toLowerCase().includes(search.toLowerCase()) && !row.userId.toLowerCase().includes(search.toLowerCase())) return false;
    if (memberFilter === "owing" && row.unpaid <= 0) return false;
    if (memberFilter === "paid" && (row.dailyTarget <= 0 || row.unpaid > 0)) return false;
    if (memberFilter === "eco" && row.donationClass !== "eco") return false;
    if (memberFilter === "fighter" && row.donationClass !== "fighter") return false;
    if (
      memberFilter === "below" &&
      (row.level >= rules.minLevel || row.prestigeLevel > 0)
    ) return false;
    if (memberFilter === "excluded" && !row.excluded) return false;
    if (memberFilter === "inactive" && row.isActive) return false;
    return true;
  }).sort((a, b) => b.unpaid - a.unpaid || b.level - a.level), [rows, armyFilter, search, memberFilter, rules.minLevel]);

  const recentDonationRows = useMemo(() => rows
    .filter((row) => {
      if (armyFilter !== "all" && row.muId !== armyFilter) return false;
      if (search.trim() && !row.username.toLowerCase().includes(search.toLowerCase()) && !row.userId.toLowerCase().includes(search.toLowerCase())) return false;
      return recentDonationsForRow(row).length > 0;
    })
    .sort((a, b) => {
      const latestA = Math.max(...recentDonationsForRow(a).map((donation) => new Date(donation.timestamp).getTime()));
      const latestB = Math.max(...recentDonationsForRow(b).map((donation) => new Date(donation.timestamp).getTime()));
      return latestB - latestA;
    }), [rows, armyFilter, search]);

  const saveRules = () => {
    const asNum = (value: string, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const nextRules: DonationRules = {
      minLevel: Math.max(1, asNum(ruleDraft.minLevel, DEFAULT_RULES.minLevel)),
      rateMid: Math.max(0, asNum(ruleDraft.rateMid, 20)) / 100,
      rateRich: Math.max(0, asNum(ruleDraft.rateRich, 25)) / 100,
      wealthThresholdMid: Math.max(0, asNum(ruleDraft.wealthThresholdMid, DEFAULT_RULES.wealthThresholdMid)),
      wealthThresholdRich: Math.max(0, asNum(ruleDraft.wealthThresholdRich, DEFAULT_RULES.wealthThresholdRich)),
      startDate: ruleDraft.startDate,
    };
    setRules(nextRules);
    setSettingsOpen(false);
  };

  const changeMemberClass = (userId: string, value: DonationClass) => {
    const next = { ...manualClasses, [userId]: value };
    setManualClasses(next);
  };

  const toggleExcluded = (userId: string) => {
    const next = excludedIds.includes(userId)
      ? excludedIds.filter((id) => id !== userId)
      : [...excludedIds, userId];
    setExcludedIds(next);
  };

  const copyReminder = async () => {
    const owingRows = rows.filter((row) => row.unpaid > 0 && !row.excluded);
    const message = `Haftalık bağış hatırlatması (${dateLabel(dates[0])}–${dateLabel(dates[6])})\n` +
      owingRows.map((row) => `@${row.username}: ${money(row.unpaid)} eksik`).join("\n");
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Hatırlatma kopyalanamadı. Tarayıcı pano iznini kontrol edin.");
    }
  };

  const exportPdf = async () => {
    if (!data || isExportingPdf) return;
    setIsExportingPdf(true);
    setPdfError(null);
    try {
      const { generateDonationTrackingPdf } = await import("../services/donationReportGenerator");
      const paymentLabels: Record<PaymentView, string> = { total: "Toplam", country: "Ulke", mu: "Birlik" };
      const memberFilterLabels: Record<string, string> = {
        owing: "Eksik odeyenler", paid: "Guncel olanlar", eco: "Ekonomi modu",
        fighter: "Savas modu", below: "Seviye alti", excluded: "Haric tutulanlar",
        inactive: "Pasif oyuncular", all: "Herkes",
      };
      const selectedArmy = armyFilter === "all" ? "Tum birlikler" : data.armies.find((army) => army.muId === armyFilter)?.name || "Secili birlik";
      const activeFilters = [selectedArmy, memberFilterLabels[memberFilter] || "Herkes"];
      if (search.trim()) activeFilters.push(`Arama: ${search.trim()}`);
      const ruleLabel = `Seviye ${rules.minLevel}+ | 20k-30k servet %${rules.rateMid * 100} | 30k+ servet %${rules.rateRich * 100} fabrika geliri`;

      generateDonationTrackingPdf({
        weekStart,
        dates,
        generatedAt: new Date(),
        paymentViewLabel: paymentLabels[paymentView],
        filterLabel: activeFilters.join(" | "),
        ruleLabel,
        summary: {
          weeklyQuota: totals.weeklyQuota,
          paidThisWeek: totals.paidThisWeek,
          paidToDate: totals.paidToDate,
          poolCarryIn: totals.poolCarryIn,
          gap: totals.gap,
          completion: totals.completion,
          eligible: totals.eligible,
          owing: totals.owing,
        },
        armies: armyTotals
          .filter((army) => armyFilter === "all" || army.muId === armyFilter)
          .map((army) => ({
            name: army.name,
            memberCount: army.memberCount,
            eligible: army.eligible,
            quota: army.quota,
            paid: army.paid,
            poolCarryIn: army.poolCarryIn,
            unpaid: army.unpaid,
          })),
        members: filteredRows.map((row) => ({
          username: row.username,
          armyName: row.armyName,
          level: row.level,
          wealth: row.wealth,
          donationClass: row.donationClass,
          dailyTarget: row.dailyTarget,
          weeklyTarget: row.weeklyTarget,
          days: row.donationCells.map((cell) => ({ amount: amountFor(cell, paymentView), state: cell.state })),
          weeklyPaid: paymentView === "country" ? row.countryThisWeek : paymentView === "mu" ? row.muThisWeek : row.paidThisWeek,
          surplus: row.surplus,
          unpaid: row.unpaid,
          status: row.statusLabel,
        })),
      });
    } catch (exportError) {
      console.error("Donation report PDF export error:", exportError);
      setPdfError("PDF olusturulamadi. Tekrar deneyin.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const changeWeek = (offset: number) => setWeekStart((current) => shiftDate(current, offset * 7));
  const weekEndLabel = dateLabel(dates[6], { day: "2-digit", month: "long", year: "numeric" });

  // Matching row for top searched player
  const topSearchMemberRow = useMemo(() => {
    if (!selectedTopUserCalc) return null;
    return rows.find((r) => r.userId === selectedTopUserCalc.userId) || null;
  }, [selectedTopUserCalc, rows]);

  return (
    <div className="w-full space-y-5 text-white font-mono">
      {/* 11. MADDE: Üst Oyuncu Arama ve Hızlı Bağış Sorgulama Satırı */}
      <section className="rounded-2xl border border-emerald-500/35 bg-gradient-to-r from-[#111c22] via-[#14232a] to-[#121c22] p-4 sm:p-5 shadow-2xl relative">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-300">
              <Sparkles className="h-5 w-5 text-emerald-400" />
              <h2 className="text-base sm:text-lg font-black tracking-wide">
                BİREYSEL BAĞIŞ & ŞİRKET GELİRİ SORGULA
              </h2>
            </div>
            <p className="text-xs text-[#BBE1FA]/65">
              İsminizi veya WarEra ID’nizi aratarak fabrikalarınızın günlük kazancını ve ülkeye atmanız gereken günlük bağış miktarını anında öğrenin.
            </p>
          </div>

          <div className="relative w-full md:w-80 lg:w-96">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400" />
              <input
                value={topSearchQuery}
                onChange={(e) => {
                  setTopSearchQuery(e.target.value);
                  setTopSearchOpen(true);
                }}
                onFocus={() => setTopSearchOpen(true)}
                placeholder="Oyuncu adı veya WarEra ID..."
                className="w-full rounded-xl border border-emerald-500/30 bg-[#0e171c] py-2.5 pl-10 pr-9 text-xs sm:text-sm text-white placeholder:text-[#BBE1FA]/35 outline-none focus:border-emerald-400 transition-colors"
              />
              {isLoadingTopUser && (
                <LoaderCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-emerald-400" />
              )}
            </div>

            {/* Autocomplete Dropdown */}
            {topSearchOpen && topSearchMatches.length > 0 && (
              <ul className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-emerald-500/30 bg-[#0e171c] p-1.5 shadow-2xl">
                {topSearchMatches.map((p) => (
                  <li key={p.userId}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectTopPlayer(p)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-emerald-950/40 transition-colors"
                    >
                      <UserRound className="h-4 w-4 shrink-0 text-emerald-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold text-white">{p.username}</div>
                        <div className="truncate font-mono text-[9px] text-[#BBE1FA]/40">{p.userId}</div>
                      </div>
                      <span className="shrink-0 rounded bg-[#16232b] px-1.5 py-0.5 text-[9px] text-emerald-300">
                        {p.armyNames[0] || "Birlik"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Selected Player Detail Card */}
        {selectedTopUserCalc && (
          <div className="mt-4 rounded-xl border border-emerald-500/40 bg-[#0d161a] p-4 sm:p-5 shadow-xl animate-fadeIn">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl border border-emerald-500/40 bg-emerald-950/40 text-emerald-300">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-white">{selectedTopUserCalc.username}</span>
                    <span className="rounded-md border border-cyan-500/30 bg-cyan-950/40 px-2 py-0.5 text-xs font-bold text-cyan-200">
                      Lv. {selectedTopUserCalc.level}
                    </span>
                    <span className="rounded-md border border-amber-500/30 bg-amber-950/40 px-2 py-0.5 text-xs font-bold text-amber-200">
                      ${Math.round(selectedTopUserCalc.wealth).toLocaleString("tr-TR")}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[#BBE1FA]/60">
                    Aktif Fabrikalar: {selectedTopUserCalc.activeFactoryCount} adet · {selectedTopUserCalc.statusReason}
                  </div>
                </div>
              </div>

              {/* Stat breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-lg border border-[#3282B8]/20 bg-[#121c22] p-2.5">
                  <div className="text-[9px] uppercase text-[#BBE1FA]/50">Otom. Motor (24s)</div>
                  <div className="mt-1 font-bold text-cyan-300">
                    +{Math.round(selectedTopUserCalc.totalAutoIncome).toLocaleString("tr-TR")} G
                  </div>
                </div>

                <div className="rounded-lg border border-[#3282B8]/20 bg-[#121c22] p-2.5">
                  <div className="text-[9px] uppercase text-[#BBE1FA]/50">Çalışan Net (24s)</div>
                  <div className="mt-1 font-bold text-emerald-300">
                    +{Math.round(selectedTopUserCalc.totalWorkerIncome).toLocaleString("tr-TR")} G
                  </div>
                </div>

                <div className="rounded-lg border border-[#3282B8]/20 bg-[#121c22] p-2.5">
                  <div className="text-[9px] uppercase text-[#BBE1FA]/50">Toplam Şirket Geliri</div>
                  <div className="mt-1 font-bold text-white">
                    {Math.round(selectedTopUserCalc.totalDailyRevenue).toLocaleString("tr-TR")} G
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-2.5">
                  <div className="text-[9px] uppercase text-emerald-300 flex items-center justify-between">
                    <span>Günlük Bağış</span>
                    <span className="font-bold text-emerald-200">{selectedTopUserCalc.donationRateLabel}</span>
                  </div>
                  <div className="mt-1 text-base font-black text-emerald-200">
                    {selectedTopUserCalc.dailyDonationTarget.toLocaleString("tr-TR")} Gold
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openCalculationModal(selectedTopUserCalc.userId)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-700/80 hover:bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors"
                >
                  <Calculator className="h-3.5 w-3.5" /> Hesaplamayı Göster
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearch(selectedTopUserCalc.username);
                    const el = document.getElementById("donations-data-table");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="rounded-lg border border-[#3282B8]/30 bg-[#121c22] px-3 py-2 text-xs text-[#BBE1FA] hover:bg-[#18262f]"
                >
                  Tabloda Konumlandır
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTopUserCalc(null);
                    setTopSearchQuery("");
                  }}
                  className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-white"
                  title="Temizle"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Payment status badge for the current week */}
            {topSearchMemberRow && (
              <div className="mt-3 flex flex-wrap items-center justify-between border-t border-emerald-500/15 pt-2.5 text-xs text-[#BBE1FA]/60">
                <div className="flex items-center gap-3">
                  <span>
                    Bu hafta ödenen: <strong className="text-emerald-300">{money(topSearchMemberRow.paidThisWeek)}</strong>
                  </span>
                  <span>
                    Kalan eksik: <strong className={topSearchMemberRow.unpaid > 0 ? "text-rose-300" : "text-emerald-300"}>{money(topSearchMemberRow.unpaid)}</strong>
                  </span>
                </div>
                <span className="rounded-full border border-emerald-500/25 bg-emerald-950/30 px-2.5 py-0.5 text-[10px] text-emerald-200">
                  Durum: {topSearchMemberRow.statusLabel}
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Main Header & Week Controls */}
      <section className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-[#182329] to-[#141C21] p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-300">
              <Coins className="w-5 h-5" />
              <h1 className="text-lg sm:text-xl font-black tracking-wide">HAFTALIK BAĞIŞ TAKİBİ</h1>
            </div>
            <p className="mt-1 text-xs text-[#BBE1FA]/65">
              30+ seviye ve 20k+ servete sahip EKONOMİ modu oyuncuların aktif fabrika kazancına göre hesaplanan günlük bağış takip merkezi (Savaşçılar muaftır).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-xl border border-emerald-500/25 bg-[#141C21] p-1">
              <button type="button" onClick={() => changeWeek(-1)} className="rounded-lg p-2 text-[#BBE1FA]/70 hover:bg-emerald-950 hover:text-white" title="Önceki hafta"><ChevronLeft className="w-4 h-4" /></button>
              <div className="min-w-40 px-2 text-center text-xs font-bold text-emerald-200"><CalendarDays className="mr-1 inline w-3.5 h-3.5" />{dateLabel(dates[0])} – {weekEndLabel}</div>
              <button type="button" onClick={() => changeWeek(1)} disabled={weekStart >= currentGameWeekStart()} className="rounded-lg p-2 text-[#BBE1FA]/70 hover:bg-emerald-950 hover:text-white disabled:opacity-30" title="Sonraki hafta"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <button type="button" onClick={() => setWeekStart(currentGameWeekStart())} className="rounded-lg border border-emerald-500/25 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-950/50">Bu hafta</button>
            <button type="button" onClick={() => loadData(true)} disabled={isRefreshing || isLoading} className="inline-flex items-center gap-2 rounded-lg border border-[#3282B8]/35 bg-[#0F4C75]/35 px-3 py-2 text-xs font-bold text-[#BBE1FA] hover:bg-[#0F4C75]/60 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Yenile
            </button>
            <button type="button" onClick={exportPdf} disabled={!data || isLoading || isExportingPdf} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/35 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-50">
              <FileDown className={`w-3.5 h-3.5 ${isExportingPdf ? "animate-pulse" : ""}`} /> {isExportingPdf ? "PDF hazirlaniyor" : "PDF indir"}
            </button>
            <button type="button" onClick={() => setSettingsOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-950/50"><Settings2 className="w-3.5 h-3.5" /> Kurallar</button>
          </div>
        </div>

        {/* Kurallar Ayarları */}
        {settingsOpen && (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-[#10171b] p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-emerald-200">Bağış ve Servet Oranı Kuralları</div>
              <div className="text-[10px] text-[#BBE1FA]/45">Ayarlar bu tarayıcıda saklanır.</div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-[11px] text-[#BBE1FA]/65">Asgari Seviye
                <input type="number" min="1" value={ruleDraft.minLevel} onChange={(e) => setRuleDraft({ ...ruleDraft, minLevel: e.target.value })} className="mt-1 block w-28 rounded-lg border border-[#3282B8]/25 bg-[#141C21] px-2.5 py-2 text-sm text-white" />
              </label>
              <label className="text-[11px] text-[#BBE1FA]/65">20k-30k Oranı (%)
                <input type="number" min="0" max="100" value={ruleDraft.rateMid} onChange={(e) => setRuleDraft({ ...ruleDraft, rateMid: e.target.value })} className="mt-1 block w-28 rounded-lg border border-[#3282B8]/25 bg-[#141C21] px-2.5 py-2 text-sm text-white" />
              </label>
              <label className="text-[11px] text-[#BBE1FA]/65">30k+ Oranı (%)
                <input type="number" min="0" max="100" value={ruleDraft.rateRich} onChange={(e) => setRuleDraft({ ...ruleDraft, rateRich: e.target.value })} className="mt-1 block w-28 rounded-lg border border-[#3282B8]/25 bg-[#141C21] px-2.5 py-2 text-sm text-white" />
              </label>
              <label className="text-[11px] text-[#BBE1FA]/65">Başlangıç Günü
                <input type="date" value={ruleDraft.startDate} onChange={(e) => setRuleDraft({ ...ruleDraft, startDate: e.target.value })} className="mt-1 block rounded-lg border border-[#3282B8]/25 bg-[#141C21] px-2.5 py-2 text-sm text-white" />
              </label>
              <button type="button" onClick={saveRules} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600">Kaydet</button>
            </div>
            <p className="mt-3 text-[10px] text-[#BBE1FA]/45">
              Standart Kural: Yalnızca 30+ seviye oyuncular bağış atar. 20k altı servet: %0 (Muaf); 20k–30k arası servet: %20; 30k ve üzeri servet: %25.
            </p>
          </div>
        )}

        {pdfError && <div role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200">{pdfError}</div>}
        {error && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200"><span>{error}</span><button type="button" onClick={() => loadData(true)} className="shrink-0 rounded-lg border border-rose-500/30 px-3 py-1.5 font-bold">Tekrar dene</button></div>}
        {(isLoading || isRefreshing) && <div className="mt-4 rounded-xl border border-[#3282B8]/20 bg-[#141C21] p-3 text-xs text-[#BBE1FA]/70">Üyeler ve haftalık bağış işlemleri WarEra’dan güncelleniyor…</div>}
      </section>

      {data && (
        <>
          {/* Metrik Kartları */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Haftalık hedef", value: money(totals.weeklyQuota), note: `${totals.eligible} yükümlü üye`, icon: Target },
              { label: "Bu haftaki bağış", value: money(totals.paidThisWeek), note: `Şu ana kadar ${money(totals.paidToDate)}`, icon: Coins },
              { label: "Şu ana kadarki açık", value: money(totals.gap), note: `${totals.owing} kişinin bireysel eksiği var`, icon: AlertCircle },
              { label: "Kota tamamlanma", value: `%${Math.round(totals.completion)}`, note: `${money(totals.unpaid)} kişisel borç`, icon: CheckCircle2 },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="rounded-xl border border-emerald-500/20 bg-[#182329]/90 p-4 shadow-lg">
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-[#BBE1FA]/60">
                    <span>{card.label}</span>
                    <Icon className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="mt-2 text-xl font-black text-emerald-200">{card.value}</div>
                  <div className="mt-1 text-[10px] text-[#BBE1FA]/45">{card.note}</div>
                </div>
              );
            })}
          </div>

          {/* Kota Barı */}
          <section className="rounded-xl border border-emerald-500/20 bg-[#182329]/80 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-bold text-emerald-200">Haftalık kota havuzu</div>
                <div className="mt-1 text-[11px] text-[#BBE1FA]/55">
                  Bugüne kadar beklenen {money(totals.quotaToDate)} · geçen haftadan devreden {money(totals.poolCarryIn)} · ödenen tüm bağışlar kotaya sayılır.
                </div>
              </div>
              <div className="text-sm font-bold text-white">
                {money(totals.paidToDate)} <span className="text-[#BBE1FA]/45">/ {money(totals.quotaToDate)}</span>
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#10171b]">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-300 transition-all" style={{ width: `${totals.completion}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-[10px] text-[#BBE1FA]/45">
              <span>Eksik kota: {money(totals.gap)}</span>
              <span>Günlük sıfırlama: 06:00 Türkiye saati</span>
            </div>
          </section>

          {/* Birlik Grafik */}
          <section className="rounded-xl border border-emerald-500/20 bg-[#182329]/85 p-4 shadow-lg">
            <div className="mb-3">
              <h2 className="text-sm font-bold text-emerald-200">Birliklere göre haftalık bağış performansı</h2>
              <p className="mt-1 text-[10px] text-[#BBE1FA]/50">Haftalık hedef ile ödenen bağış ve devreden havuz tutarını karşılaştır.</p>
            </div>
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={armyTotals} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }} barCategoryGap="30%">
                  <CartesianGrid stroke="#9fb3c8" strokeOpacity={0.18} strokeDasharray="3 5" horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => `${(Number(value) / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}K`} tick={{ fill: "#cbd5e1", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={136} tick={{ fill: "#f1f5f9", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value, name, item) => [item.payload?.dataAvailable === false ? "—" : money(Number(value)), String(name)]} contentStyle={{ background: "#0b1419", border: "1px solid rgba(52,211,153,.35)", borderRadius: 10, color: "#fff" }} labelStyle={{ color: "#fff", fontWeight: 700 }} />
                  <Legend wrapperStyle={{ color: "#dbeafe", fontSize: 11 }} />
                  <Bar dataKey="quota" name="Haftalık hedef" fill="#34d399" radius={[0, 5, 5, 0]} maxBarSize={16} />
                  <Bar dataKey="paid" name="Ödenen + devir" fill="#f4c76b" radius={[0, 5, 5, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Birlik Tablosu */}
          <section className="overflow-hidden rounded-xl border border-emerald-500/20 bg-[#182329]/80 shadow-lg">
            <div className="flex flex-col gap-2 border-b border-emerald-500/15 bg-[#141C21] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-bold text-emerald-200">Birlik bazında haftalık durum</h2>
                <p className="mt-1 text-[10px] text-[#BBE1FA]/45">Birliği seçerek üye listesini süzebilirsiniz.</p>
              </div>
              <button type="button" onClick={copyReminder} className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/25 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-950/40">
                <Copy className="h-3.5 w-3.5" />{copied ? "Kopyalandı" : "Eksiklere hatırlatma kopyala"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="text-[10px] uppercase text-[#BBE1FA]/45">
                  <tr>
                    <th className="px-4 py-3">Birlik</th>
                    <th className="px-4 py-3 text-center">Yükümlü</th>
                    <th className="px-4 py-3 text-right">Haftalık hedef</th>
                    <th className="px-4 py-3 text-right">Havuz · devir dahil</th>
                    <th className="px-4 py-3 text-right">Kişisel açık</th>
                    <th className="px-4 py-3">Uyum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-500/10">
                  {armyTotals.map((army) => {
                    const selected = armyFilter === army.muId;
                    const pct = army.dataAvailable && army.quota ? Math.min(100, (army.paid / army.quota) * 100) : 0;
                    return (
                      <tr
                        key={army.muId}
                        onClick={() => { setArmyFilter(selected ? "all" : army.muId); onSelectArmy(army.muId); }}
                        className={`cursor-pointer hover:bg-emerald-950/20 ${selected ? "bg-emerald-950/30" : ""}`}
                      >
                        <td className="px-4 py-3 font-bold text-white">
                          {army.name}
                          <span className="ml-2 text-[10px] font-normal text-[#BBE1FA]/40">{army.dataAvailable ? `${army.memberCount} üye` : "Veri yok"}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-emerald-200">{army.dataAvailable ? army.eligible : "—"}</td>
                        <td className="px-4 py-3 text-right">{army.dataAvailable ? money(army.quota) : "—"}</td>
                        <td className="px-4 py-3 text-right text-emerald-300">{army.dataAvailable ? money(army.paid) : "—"}</td>
                        <td className="px-4 py-3 text-right text-rose-300">{army.dataAvailable ? money(army.unpaid) : "—"}</td>
                        <td className="min-w-36 px-4 py-3">
                          <div className="h-1.5 rounded-full bg-[#10171b]">
                            {army.dataAvailable && <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />}
                          </div>
                          <div className="mt-1 text-[10px] text-[#BBE1FA]/45">{army.dataAvailable ? `%${Math.round(pct)}` : "—"}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Ana Üye Tablosu - Otomatik Motor, Çalışan ve Hesaplamayı Göster Butonlu */}
          <section className="overflow-hidden rounded-xl border border-emerald-500/20 bg-[#182329]/80 shadow-lg">
            <div className="flex flex-col gap-3 border-b border-emerald-500/15 bg-[#141C21] p-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-sm font-bold text-emerald-200">Üye bazında fabrika gelirleri ve günlük bağış</h2>
                <p className="mt-1 text-[10px] text-[#BBE1FA]/45">
                  Her üyenin otomatik motor ve çalışan net kazancı ve ülkeye atması gereken günlük bağış tutarı gösterilmektedir.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-emerald-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Oyuncu ara"
                    className="w-40 rounded-lg border border-emerald-500/20 bg-[#182329] py-1.5 pl-8 pr-2 text-xs text-white placeholder:text-[#BBE1FA]/35"
                  />
                </div>
                <select
                  value={armyFilter}
                  onChange={(e) => setArmyFilter(e.target.value)}
                  className="rounded-lg border border-emerald-500/20 bg-[#182329] px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="all">Tüm birlikler</option>
                  {data.armies.map((army) => (
                    <option key={army.muId} value={army.muId}>{army.name}</option>
                  ))}
                </select>
                <select
                  value={memberFilter}
                  onChange={(e) => setMemberFilter(e.target.value)}
                  className="rounded-lg border border-emerald-500/20 bg-[#182329] px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="owing">Eksik ödeyenler</option>
                  <option value="paid">Güncel olanlar</option>
                  <option value="eco">Ekonomi modu</option>
                  <option value="fighter">Savaş modu</option>
                  <option value="below">Seviye altı</option>
                  <option value="excluded">Hariç tutulanlar</option>
                  <option value="inactive">Pasif oyuncular</option>
                  <option value="all">Herkes</option>
                </select>
                <div className="inline-flex rounded-lg border border-emerald-500/20 bg-[#182329] p-0.5 text-[10px]">
                  {([["total", "Toplam"], ["country", "Ülke"], ["mu", "Birlik"]] as [PaymentView, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setPaymentView(key)}
                      className={`rounded-md px-2 py-1 ${paymentView === key ? "bg-emerald-900 text-emerald-100" : "text-[#BBE1FA]/50"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table id="donations-data-table" className="w-full min-w-[1320px] text-left text-[11px]">
                <thead className="bg-[#141C21]/70 text-[9px] uppercase tracking-wide text-[#BBE1FA]/45">
                  <tr>
                    <th className="sticky left-0 z-10 min-w-44 bg-[#141C21] px-3 py-3">Oyuncu / Birlik</th>
                    <th className="px-2 py-3 text-center">Sv</th>
                    <th className="px-2 py-3 text-right">Servet</th>
                    <th className="px-2 py-3">Mod</th>
                    <th className="px-2 py-3 text-right">Otom. Motor</th>
                    <th className="px-2 py-3 text-right">Çalışan Net</th>
                    <th className="px-2 py-3 text-right">Oran</th>
                    <th className="px-2 py-3 text-right font-bold text-emerald-300">Günlük Hedef</th>
                    {dates.map((date, index) => (
                      <th key={date} className={`min-w-20 px-1 py-3 text-center ${date === today ? "text-emerald-300" : ""}`}>
                        {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"][index]}<br />{dateLabel(date)}
                      </th>
                    ))}
                    <th className="px-2 py-3 text-right">Ödenen</th>
                    <th className="px-2 py-3 text-right">Fazla</th>
                    <th className="px-2 py-3 text-right">Eksik</th>
                    <th className="px-3 py-3">Durum</th>
                    <th className="px-3 py-3 text-center">Hesaplama</th>
                    <th className="px-2 py-3 text-center">Kural</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-500/10">
                  {filteredRows.map((row) => {
                    const isRowSelected = selectedTopUserCalc?.userId === row.userId;

                    return (
                      <tr
                        key={`${row.muId}-${row.userId}`}
                        className={`hover:bg-emerald-950/20 transition-colors ${
                          !row.isActive ? "opacity-60" : ""
                        } ${
                          isRowSelected ? "bg-emerald-950/40 ring-1 ring-emerald-400/50" : ""
                        }`}
                      >
                        <td className="sticky left-0 z-10 bg-[#182329] px-3 py-2">
                          <div className="font-bold text-white flex items-center gap-1.5">
                            <span>{row.username}</span>
                            {!row.isActive && (
                              <span
                                title={row.lastActive
                                  ? `Son aktiflik: ${new Date(row.lastActive).toLocaleString("tr-TR")}`
                                  : "Son aktiflik bilgisi bulunamadı"}
                                className="rounded border border-slate-500/30 bg-slate-700/40 px-1 py-0.5 text-[8px] font-medium text-slate-300"
                              >
                                Pasif
                              </span>
                            )}
                            {isRowSelected && (
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                            )}
                          </div>
                          <div className="text-[9px] text-[#BBE1FA]/40">{row.armyName} · {row.role}</div>
                        </td>
                        <td className="px-2 py-2 text-center text-emerald-200">
                          {row.level}
                          {row.prestigeLevel > 0 && (
                            <span className="ml-1 text-[9px] text-amber-300">P{row.prestigeLevel}</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right text-[#BBE1FA]/65">
                          ${Math.round(row.wealth).toLocaleString("tr-TR")}
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={manualClasses[row.userId] || "auto"}
                            onChange={(e) => changeMemberClass(row.userId, e.target.value as DonationClass)}
                            className="rounded border border-emerald-500/20 bg-[#141C21] px-1.5 py-1 text-[9px] text-white"
                          >
                            <option value="auto">Otomatik ({row.playerMode === "economy" ? "Eco" : "Savaş"})</option>
                            <option value="eco">Eco</option>
                            <option value="fighter">Savaş</option>
                          </select>
                        </td>

                        {/* Otomatik Motor Geliri */}
                        <td className="px-2 py-2 text-right font-medium text-cyan-300">
                          {row.autoIncome > 0
                            ? `+${Math.round(row.autoIncome).toLocaleString("tr-TR")} G`
                            : "—"}
                        </td>

                        {/* Çalışan Geliri */}
                        <td
                          className={`px-2 py-2 text-right font-medium ${row.workerIncome < 0 ? "text-rose-300" : "text-emerald-300"}`}
                        >
                          {row.workerIncome !== 0
                            ? `${row.workerIncome > 0 ? "+" : ""}${Math.round(row.workerIncome).toLocaleString("tr-TR")} G`
                            : "—"}
                        </td>

                        {/* Bağış Oranı */}
                        <td className="px-2 py-2 text-right text-amber-300 font-semibold">
                          {row.donationRateLabel}
                        </td>

                        {/* Günlük Bağış Hedefi */}
                        <td className="px-2 py-2 text-right font-black text-emerald-200">
                          <span
                            title={row.donationTargetsByDate?.[today]
                              ? `${row.donationTargetsByDate[today].source === "fallback"
                                  ? "Şirket hesabı alınamadı; kayıtlı seviye/servet hedefi kullanıldı."
                                  : row.donationTargetsByDate[today].source === "companies"
                                    ? "02:55'teki şirket gelirine göre sabitlendi."
                                    : "02:55'teki mod, seviye ve servet bilgisine göre sabitlendi."} ${new Date(row.donationTargetsByDate[today].capturedAt).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul" })}`
                              : undefined}
                          >
                            {row.dailyTarget ? money(row.dailyTarget) : "—"}
                          </span>
                        </td>

                        {/* Günlük Hücreler */}
                        {row.donationCells.map((cell, index) => {
                          const day = dates[index];
                          const shown = amountFor(cell, paymentView);
                          const recordedMode =
                            row.donationTargetsByDate?.[day]?.playerMode ??
                            row.playerModeByDate?.[day] ??
                            (day === today ? row.playerMode : undefined);
                          const modeLabel = recordedMode === "economy"
                            ? "Ekonomi"
                            : recordedMode === "combat"
                              ? "Savaşçı"
                              : "Mod yok";
                          return (
                            <td
                              key={day}
                              title={`${STATE_LABEL[cell.state]} · ${modeLabel} modu · ülke ${money(cell.country)} · birlik ${money(cell.mu)}${cell.carry ? ` · devreden ${money(cell.carry)}` : ""}`}
                              className="px-1 py-1.5 text-center align-middle"
                            >
                              <div className="mx-auto flex w-[68px] flex-col items-center gap-1">
                                <span className={`flex h-9 w-full flex-col items-center justify-center overflow-hidden rounded-md border px-1 text-[9px] leading-3 ${stateStyle(cell.state)}`}>
                                  <span className="max-w-full truncate font-semibold">
                                    {shown
                                      ? Math.round(shown).toLocaleString("tr-TR")
                                      : cell.state === "covered"
                                        ? "✓"
                                        : cell.state === "future" || cell.state === "pre"
                                          ? "·"
                                          : "—"}
                                  </span>
                                  <span className="max-w-full truncate opacity-75">
                                    {STATE_SHORT_LABEL[cell.state] || STATE_LABEL[cell.state]}
                                  </span>
                                </span>
                                <span
                                  title={recordedMode
                                    ? `${dateLabel(day)} tarihinde ${modeLabel} modundaydı`
                                    : `${dateLabel(day)} için mod kaydı bulunamadı`}
                                  className={`flex h-4 w-full items-center justify-center overflow-hidden rounded border px-1 text-[8px] leading-none ${
                                    recordedMode === "economy"
                                      ? "border-cyan-500/25 bg-cyan-950/30 text-cyan-200/75"
                                      : recordedMode === "combat"
                                        ? "border-orange-500/20 bg-orange-950/20 text-orange-200/65"
                                        : "border-slate-700/40 bg-slate-900/30 text-slate-500"
                                  }`}
                                >
                                  <span className="truncate">{modeLabel}</span>
                                </span>
                              </div>
                            </td>
                          );
                        })}

                        <td className="px-2 py-2 text-right font-bold text-emerald-300">
                          {money(paymentView === "country" ? row.countryThisWeek : paymentView === "mu" ? row.muThisWeek : row.paidThisWeek)}
                        </td>
                        <td className="px-2 py-2 text-right text-emerald-300">
                          {row.surplus ? `+${money(row.surplus)}` : "—"}
                        </td>
                        <td className="px-2 py-2 text-right text-rose-300">
                          {row.unpaid ? money(row.unpaid) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`whitespace-nowrap rounded-full border px-2 py-1 text-[9px] ${row.unpaid > 0 ? "border-rose-500/25 bg-rose-950/40 text-rose-200" : row.dailyTarget ? "border-emerald-500/25 bg-emerald-950/30 text-emerald-200" : "border-slate-600/30 bg-slate-900/50 text-slate-400"}`}>
                            {row.statusLabel}
                          </span>
                        </td>

                        {/* 10. MADDE: Hesaplamayı Göster Butonu */}
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => openCalculationModal(row.userId)}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-950/50 px-2 py-1 text-[10px] font-bold text-emerald-300 hover:bg-emerald-800/60 hover:text-white transition-colors"
                          >
                            <Calculator className="h-3 w-3" />
                            <span>Hesaplamayı göster</span>
                          </button>
                        </td>

                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggleExcluded(row.userId)}
                            className={`whitespace-nowrap text-[9px] ${row.excluded ? "text-amber-200" : "text-[#BBE1FA]/40 hover:text-amber-200"}`}
                          >
                            {row.excluded ? "Geri al" : "Hariç tut"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredRows.length === 0 && (
                <div className="p-8 text-center text-xs text-[#BBE1FA]/45">Bu filtrede üye bulunamadı.</div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-500/10 bg-[#141C21]/50 px-4 py-3 text-[10px] text-[#BBE1FA]/40">
              <span>
                <Users className="mr-1 inline h-3.5 w-3.5" />{filteredRows.length} üye gösteriliyor · bağış hedefleri fabrika kazançlarının %20 veya %25’i olarak hesaplanır.
              </span>
              <span>Oyuncu sınıfı ve hariç tutma tercihleri bu tarayıcıda saklanır.</span>
            </div>
          </section>

          {/* Son Bağış İşlemleri Tablosu */}
          <section className="overflow-hidden rounded-xl border border-emerald-500/20 bg-[#182329]/80 shadow-lg">
            <div className="border-b border-emerald-500/15 bg-[#141C21] p-4">
              <h2 className="text-sm font-bold text-emerald-200">Son bağış işlemleri</h2>
              <p className="mt-1 text-[10px] text-[#BBE1FA]/45">
                Haftalık kota verisiyle aynı kaynaktan son 7 bağış; ayrıntı henüz yoksa ülke ve birlik günlük toplamları gösterilir.
              </p>
            </div>
            <div className="max-h-[620px] overflow-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="sticky top-0 z-10 bg-[#141C21] text-[10px] uppercase text-[#BBE1FA]/45">
                  <tr>
                    <th className="px-4 py-3">Üye / birlik</th>
                    <th className="px-4 py-3">Son bağışlar · en yeni → eski</th>
                    <th className="px-4 py-3 text-right">Servet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-500/10">
                  {recentDonationRows.map((row) => (
                    <tr key={`${row.muId}-${row.userId}`} className="hover:bg-emerald-950/15">
                      <td className="px-4 py-3">
                        <div className="font-bold text-white">{row.username}</div>
                        <div className="mt-0.5 text-[10px] text-[#BBE1FA]/45">{row.armyName} · Sv. {row.level}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {recentDonationsForRow(row).map((donation, index) => (
                            <div
                              key={donation.id || index}
                              title={`${donation.targetName || (donation.target === "mu" ? "Askeri Birlik" : "Ülke")} · ${new Date(donation.timestamp).toLocaleString("tr-TR")}`}
                              className={`min-w-[92px] rounded-md border px-2 py-1 ${index === 0 ? "border-emerald-500/40 bg-emerald-950/35" : "border-emerald-500/15 bg-[#141C21]/70"}`}
                            >
                              <div className="font-bold text-emerald-200">+{Math.round(donation.amount).toLocaleString("tr-TR")} G</div>
                              <div className="mt-0.5 truncate text-[9px] text-[#BBE1FA]/55">{donation.targetName || (donation.target === "mu" ? "Askeri Birlik" : "Ülke")}</div>
                              <div className="mt-0.5 text-[9px] text-[#BBE1FA]/35">
                                {donation.dailySummary ? new Date(donation.timestamp).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }) : relativeDonationTime(donation.timestamp)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-violet-200">
                        {Math.round(row.wealth).toLocaleString("tr-TR")} Gold
                      </td>
                    </tr>
                  ))}
                  {!recentDonationRows.length && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-[#BBE1FA]/45">Bu filtrede gösterilecek bağış işlemi bulunamadı.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-emerald-500/10 px-4 py-2 text-[10px] text-[#BBE1FA]/40">{recentDonationRows.length} üye · kişi başına en fazla 7 son işlem</div>
          </section>
        </>
      )}

      {/* Hesaplamayı Göster Modalı */}
      <DonationCalculationModal
        data={activeCalculationModalData}
        isLoading={isCalculatingModal}
        error={calculationModalError}
        onClose={() => setActiveCalculationModalData(null)}
      />
    </div>
  );
};
