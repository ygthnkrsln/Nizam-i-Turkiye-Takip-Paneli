import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Copy,
  RefreshCw,
  Search,
  Settings2,
  Target,
  Users,
} from "lucide-react";
import {
  fetchManagementOverview,
  ManagementMemberItem,
  ManagementOverviewResponse,
} from "../services/wareraApi";

const GAME_RESET_MS = 3 * 60 * 60 * 1000;
const RULES_KEY = "nizam-donation-rules-v1";
const EXCLUDED_KEY = "nizam-donation-excluded-v1";
const CLASSES_KEY = "nizam-donation-classes-v1";

type DonationRules = {
  minLevel: number;
  multiplier: number;
  multiplierRich: number;
  wealthThreshold: number;
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
};
const DEFAULT_RULES: DonationRules = {
  minLevel: 30,
  multiplier: 1.5,
  multiplierRich: 2,
  wealthThreshold: 30000,
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
    minLevel: String(rules.minLevel), multiplier: String(rules.multiplier),
    multiplierRich: String(rules.multiplierRich), wealthThreshold: String(rules.wealthThreshold),
    startDate: rules.startDate,
  }));
  const [paymentView, setPaymentView] = useState<PaymentView>("total");
  const [armyFilter, setArmyFilter] = useState("all");
  const [memberFilter, setMemberFilter] = useState("owing");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

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
      if (requestId === requestSequence.current) setData(response);
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
  const activeWeekDays = dates.filter((date) => !rules.startDate || date >= rules.startDate).length;
  const rows = useMemo<DonationRow[]>(() => {
    if (!data) return [];
    return data.armies.flatMap((army) => army.members.map((member) => {
      const storedClass = manualClasses[member.userId];
      const donationClass: "eco" | "fighter" = storedClass && storedClass !== "auto"
        ? storedClass
        : member.playerMode === "economy" ? "eco" : "fighter";
      const excluded = excludedIds.includes(member.userId);
      const eligible = member.level >= rules.minLevel && donationClass === "eco" && !excluded;
      const multiplier = member.wealth >= rules.wealthThreshold ? rules.multiplierRich : rules.multiplier;
      const dailyTarget = eligible ? Math.round(member.level * multiplier) : 0;
      const previousActiveDays = previousDates.filter((date) => !rules.startDate || date >= rules.startDate).length;
      const previousTarget = dailyTarget * previousActiveDays;
      const previousPaid = previousDates.reduce((sum, date) => sum + (member.donationsByDate?.[date]?.total || 0), 0);
      const carryIn = eligible ? Math.max(0, previousPaid - previousTarget) : 0;
      let carry = carryIn;
      const donationCells = dates.map((date) => {
        const raw = member.donationsByDate?.[date] || { country: 0, mu: 0, total: 0 };
        const payment = { country: Number(raw.country) || 0, mu: Number(raw.mu) || 0, total: Number(raw.total) || 0 };
        let state = "free";
        const dayActive = !rules.startDate || date >= rules.startDate;
        if (!dayActive) state = payment.total ? "extra" : "pre";
        else if (!eligible) state = payment.total ? "extra" : "free";
        else if (date > visibleThrough) state = "future";
        else {
          const available = carry + payment.total;
          if (payment.total >= dailyTarget) state = "ok";
          else if (available >= dailyTarget) state = "covered";
          else if (date === today) state = payment.total ? "partial" : "today";
          else state = payment.total ? "partial" : "missed";
          carry = Math.max(0, available - dailyTarget);
        }
        return { ...payment, state, carry: Math.max(0, carry) };
      });
      const paidFor = (keys: string[], view: PaymentView) => keys.reduce((sum, date) => {
        const cell = donationCells[dates.indexOf(date)];
        return sum + (cell ? amountFor(cell, view) : 0);
      }, 0);
      const dueDays = dates.filter((date) => date <= visibleThrough && (!rules.startDate || date >= rules.startDate)).length;
      const weeklyTarget = dailyTarget * activeWeekDays;
      const dueToDate = dailyTarget * dueDays;
      const paidToDate = paidFor(visibleDates, "total");
      const countryToDate = paidFor(visibleDates, "country");
      const muToDate = paidFor(visibleDates, "mu");
      const paidThisWeek = paidFor(dates, "total");
      const countryThisWeek = paidFor(dates, "country");
      const muThisWeek = paidFor(dates, "mu");
      const memberStatus = excluded ? "Hariç tutuldu" : dailyTarget === 0
        ? (donationClass === "fighter" ? "Savaş modu — muaf" : `Seviye ${rules.minLevel} altı — muaf`)
        : Math.max(0, dueToDate - paidToDate - carryIn) > 0 ? "Eksik ödeme" : "Güncel";
      return {
        ...member, muId: army.muId, armyName: army.name, donationCells, donationClass, excluded,
        dailyTarget, weeklyTarget, previousTarget, previousPaid, carryIn, dueToDate, paidToDate, countryToDate, muToDate,
        paidThisWeek, countryThisWeek, muThisWeek,
        unpaid: Math.max(0, dueToDate - (paidToDate + carryIn)), surplus: Math.max(0, paidToDate + carryIn - dueToDate),
        statusLabel: memberStatus,
      };
    }));
  }, [data, dates, previousDates, visibleThrough, today, rules, excludedIds, manualClasses, activeWeekDays]);

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
    if (memberFilter === "below" && row.level >= rules.minLevel) return false;
    if (memberFilter === "excluded" && !row.excluded) return false;
    return true;
  }).sort((a, b) => b.unpaid - a.unpaid || b.level - a.level), [rows, armyFilter, search, memberFilter, rules.minLevel]);

  const saveRules = () => {
    const asNum = (value: string, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const nextRules: DonationRules = {
      minLevel: Math.max(1, asNum(ruleDraft.minLevel, DEFAULT_RULES.minLevel)),
      multiplier: Math.max(0, asNum(ruleDraft.multiplier, DEFAULT_RULES.multiplier)),
      multiplierRich: Math.max(0, asNum(ruleDraft.multiplierRich, DEFAULT_RULES.multiplierRich)),
      wealthThreshold: Math.max(0, asNum(ruleDraft.wealthThreshold, DEFAULT_RULES.wealthThreshold)),
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

  const changeWeek = (offset: number) => setWeekStart((current) => shiftDate(current, offset * 7));
  const weekEndLabel = dateLabel(dates[6], { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="w-full space-y-5 text-white font-mono">
      <section className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-[#182329] to-[#141C21] p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-300">
              <Coins className="w-5 h-5" />
              <h1 className="text-lg sm:text-xl font-black tracking-wide">HAFTALIK BAĞIŞ TAKİBİ</h1>
            </div>
            <p className="mt-1 text-xs text-[#BBE1FA]/65">Fazla ödeme sonraki günlere ve geçen haftadan bu haftaya devreder; eksik bakiye sonraki haftaya taşınmaz. Oyun haftası Pazartesi 03:00 UTC’de başlar.</p>
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
            <button type="button" onClick={() => setSettingsOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-950/50"><Settings2 className="w-3.5 h-3.5" /> Kurallar</button>
          </div>
        </div>
        {settingsOpen && <div className="mt-4 rounded-xl border border-emerald-500/20 bg-[#10171b] p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><div className="text-sm font-bold text-emerald-200">Bağış kuralı</div><div className="text-[10px] text-[#BBE1FA]/45">Bu ayarlar bu tarayıcıda saklanır.</div></div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[11px] text-[#BBE1FA]/65">Asgari seviye<input type="number" min="1" value={ruleDraft.minLevel} onChange={(e) => setRuleDraft({ ...ruleDraft, minLevel: e.target.value })} className="mt-1 block w-28 rounded-lg border border-[#3282B8]/25 bg-[#141C21] px-2.5 py-2 text-sm text-white" /></label>
            <label className="text-[11px] text-[#BBE1FA]/65">Servet eşiği<input type="number" min="0" value={ruleDraft.wealthThreshold} onChange={(e) => setRuleDraft({ ...ruleDraft, wealthThreshold: e.target.value })} className="mt-1 block w-32 rounded-lg border border-[#3282B8]/25 bg-[#141C21] px-2.5 py-2 text-sm text-white" /></label>
            <label className="text-[11px] text-[#BBE1FA]/65">Eşik altı çarpan<input type="number" min="0" step="0.1" value={ruleDraft.multiplier} onChange={(e) => setRuleDraft({ ...ruleDraft, multiplier: e.target.value })} className="mt-1 block w-28 rounded-lg border border-[#3282B8]/25 bg-[#141C21] px-2.5 py-2 text-sm text-white" /></label>
            <label className="text-[11px] text-[#BBE1FA]/65">Eşik üstü çarpan<input type="number" min="0" step="0.1" value={ruleDraft.multiplierRich} onChange={(e) => setRuleDraft({ ...ruleDraft, multiplierRich: e.target.value })} className="mt-1 block w-28 rounded-lg border border-[#3282B8]/25 bg-[#141C21] px-2.5 py-2 text-sm text-white" /></label>
            <label className="text-[11px] text-[#BBE1FA]/65">Başlangıç günü<input type="date" value={ruleDraft.startDate} onChange={(e) => setRuleDraft({ ...ruleDraft, startDate: e.target.value })} className="mt-1 block rounded-lg border border-[#3282B8]/25 bg-[#141C21] px-2.5 py-2 text-sm text-white" /></label>
            <button type="button" onClick={saveRules} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600">Kaydet</button>
          </div>
          <p className="mt-3 text-[10px] text-[#BBE1FA]/45">Varsayılan: seviye 30+, günlük seviye × 1,5; serveti {rules.wealthThreshold.toLocaleString("tr-TR")} Gold ve üzeri için × {rules.multiplierRich}. Savaş modu varsayılan olarak muaf tutulur.</p>
        </div>}
        {error && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200"><span>{error}</span><button type="button" onClick={() => loadData(true)} className="shrink-0 rounded-lg border border-rose-500/30 px-3 py-1.5 font-bold">Tekrar dene</button></div>}
        {(isLoading || isRefreshing) && <div className="mt-4 rounded-xl border border-[#3282B8]/20 bg-[#141C21] p-3 text-xs text-[#BBE1FA]/70">Üyeler ve haftalık bağış işlemleri WarEra’dan güncelleniyor…</div>}
      </section>

      {data && <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Haftalık hedef", value: money(totals.weeklyQuota), note: `${totals.eligible} yükümlü üye`, icon: Target },
            { label: "Bu haftaki bağış", value: money(totals.paidThisWeek), note: `Şu ana kadar ${money(totals.paidToDate)}`, icon: Coins },
            { label: "Şu ana kadarki açık", value: money(totals.gap), note: `${totals.owing} kişinin bireysel eksiği var`, icon: AlertCircle },
            { label: "Kota tamamlanma", value: `%${Math.round(totals.completion)}`, note: `${money(totals.unpaid)} kişisel borç`, icon: CheckCircle2 },
          ].map((card) => { const Icon = card.icon; return <div key={card.label} className="rounded-xl border border-emerald-500/20 bg-[#182329]/90 p-4 shadow-lg">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-[#BBE1FA]/60"><span>{card.label}</span><Icon className="h-4 w-4 text-emerald-400" /></div>
            <div className="mt-2 text-xl font-black text-emerald-200">{card.value}</div>
            <div className="mt-1 text-[10px] text-[#BBE1FA]/45">{card.note}</div>
          </div>; })}
        </div>

        <section className="rounded-xl border border-emerald-500/20 bg-[#182329]/80 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div><div className="text-sm font-bold text-emerald-200">Haftalık kota havuzu</div><div className="mt-1 text-[11px] text-[#BBE1FA]/55">Bugüne kadar beklenen {money(totals.quotaToDate)} · geçen haftadan devreden {money(totals.poolCarryIn)} · ödenen tüm bağışlar kotaya sayılır.</div></div>
            <div className="text-sm font-bold text-white">{money(totals.paidToDate)} <span className="text-[#BBE1FA]/45">/ {money(totals.quotaToDate)}</span></div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#10171b]"><div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-300 transition-all" style={{ width: `${totals.completion}%` }} /></div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-[10px] text-[#BBE1FA]/45"><span>Eksik kota: {money(totals.gap)}</span><span>Günlük sıfırlama: 06:00 Türkiye saati</span></div>
        </section>

        <section className="overflow-hidden rounded-xl border border-emerald-500/20 bg-[#182329]/80 shadow-lg">
          <div className="flex flex-col gap-2 border-b border-emerald-500/15 bg-[#141C21] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-sm font-bold text-emerald-200">Birlik bazında haftalık durum</h2><p className="mt-1 text-[10px] text-[#BBE1FA]/45">Birliği seçerek üye listesini süzebilirsiniz.</p></div>
            <button type="button" onClick={copyReminder} className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/25 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-950/40"><Copy className="h-3.5 w-3.5" />{copied ? "Kopyalandı" : "Eksiklere hatırlatma kopyala"}</button>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-[10px] uppercase text-[#BBE1FA]/45"><tr><th className="px-4 py-3">Birlik</th><th className="px-4 py-3 text-center">Yükümlü</th><th className="px-4 py-3 text-right">Haftalık hedef</th><th className="px-4 py-3 text-right">Havuz · devir dahil</th><th className="px-4 py-3 text-right">Kişisel açık</th><th className="px-4 py-3">Uyum</th></tr></thead>
            <tbody className="divide-y divide-emerald-500/10">{armyTotals.map((army) => {
              const selected = armyFilter === army.muId;
              const pct = army.quota ? Math.min(100, (army.paid / army.quota) * 100) : 100;
              return <tr key={army.muId} onClick={() => { setArmyFilter(selected ? "all" : army.muId); onSelectArmy(army.muId); }} className={`cursor-pointer hover:bg-emerald-950/20 ${selected ? "bg-emerald-950/30" : ""}`}>
                <td className="px-4 py-3 font-bold text-white">{army.name}<span className="ml-2 text-[10px] font-normal text-[#BBE1FA]/40">{army.memberCount} üye</span></td><td className="px-4 py-3 text-center text-emerald-200">{army.eligible}</td><td className="px-4 py-3 text-right">{money(army.quota)}</td><td className="px-4 py-3 text-right text-emerald-300">{money(army.paid)}</td><td className="px-4 py-3 text-right text-rose-300">{money(army.unpaid)}</td><td className="min-w-36 px-4 py-3"><div className="h-1.5 rounded-full bg-[#10171b]"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} /></div><div className="mt-1 text-[10px] text-[#BBE1FA]/45">%{Math.round(pct)}</div></td>
              </tr>;
            })}</tbody>
          </table></div>
        </section>

        <section className="overflow-hidden rounded-xl border border-emerald-500/20 bg-[#182329]/80 shadow-lg">
          <div className="flex flex-col gap-3 border-b border-emerald-500/15 bg-[#141C21] p-4 xl:flex-row xl:items-center xl:justify-between">
            <div><h2 className="text-sm font-bold text-emerald-200">Üye bazında gün gün bağış</h2><p className="mt-1 text-[10px] text-[#BBE1FA]/45">Hücre üzerine gelerek ülke ve birlik bağış ayrımını görün.</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative"><Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-emerald-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Oyuncu ara" className="w-40 rounded-lg border border-emerald-500/20 bg-[#182329] py-1.5 pl-8 pr-2 text-xs text-white placeholder:text-[#BBE1FA]/35" /></div>
              <select value={armyFilter} onChange={(e) => setArmyFilter(e.target.value)} className="rounded-lg border border-emerald-500/20 bg-[#182329] px-2.5 py-1.5 text-xs text-white"><option value="all">Tüm birlikler</option>{data.armies.map((army) => <option key={army.muId} value={army.muId}>{army.name}</option>)}</select>
              <select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} className="rounded-lg border border-emerald-500/20 bg-[#182329] px-2.5 py-1.5 text-xs text-white"><option value="owing">Eksik ödeyenler</option><option value="paid">Güncel olanlar</option><option value="eco">Ekonomi modu</option><option value="fighter">Savaş modu</option><option value="below">Seviye altı</option><option value="excluded">Hariç tutulanlar</option><option value="all">Herkes</option></select>
              <div className="inline-flex rounded-lg border border-emerald-500/20 bg-[#182329] p-0.5 text-[10px]">{([["total", "Toplam"], ["country", "Ülke"], ["mu", "Birlik"]] as [PaymentView, string][]).map(([key, label]) => <button key={key} onClick={() => setPaymentView(key)} className={`rounded-md px-2 py-1 ${paymentView === key ? "bg-emerald-900 text-emerald-100" : "text-[#BBE1FA]/50"}`}>{label}</button>)}</div>
            </div>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-[11px]">
            <thead className="bg-[#141C21]/70 text-[9px] uppercase tracking-wide text-[#BBE1FA]/45"><tr><th className="sticky left-0 z-10 min-w-48 bg-[#141C21] px-3 py-3">Oyuncu / birlik</th><th className="px-2 py-3 text-center">Sv</th><th className="px-2 py-3 text-right">Servet</th><th className="px-2 py-3">Sınıf</th><th className="px-2 py-3 text-right">Günlük hedef</th>{dates.map((date, index) => <th key={date} className={`min-w-20 px-1 py-3 text-center ${date === today ? "text-emerald-300" : ""}`}>{["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"][index]}<br />{dateLabel(date)}</th>)}<th className="px-2 py-3 text-right">Ödenen</th><th className="px-2 py-3 text-right">Fazla</th><th className="px-2 py-3 text-right">Eksik</th><th className="px-3 py-3">Durum</th><th className="px-3 py-3">Kural</th></tr></thead>
            <tbody className="divide-y divide-emerald-500/10">{filteredRows.map((row) => <tr key={`${row.muId}-${row.userId}`} className="hover:bg-emerald-950/15">
              <td className="sticky left-0 z-10 bg-[#182329] px-3 py-2"><div className="font-bold text-white">{row.username}</div><div className="text-[9px] text-[#BBE1FA]/40">{row.armyName} · {row.role}</div></td>
              <td className="px-2 py-2 text-center text-emerald-200">{row.level}</td><td className="px-2 py-2 text-right text-[#BBE1FA]/65">{Math.round(row.wealth).toLocaleString("tr-TR")}</td>
              <td className="px-2 py-2"><select value={manualClasses[row.userId] || "auto"} onChange={(e) => changeMemberClass(row.userId, e.target.value as DonationClass)} className="rounded border border-emerald-500/20 bg-[#141C21] px-1.5 py-1 text-[9px] text-white"><option value="auto">Otomatik ({row.playerMode === "economy" ? "Eco" : "Savaş"})</option><option value="eco">Eco</option><option value="fighter">Savaş</option></select></td>
              <td className="px-2 py-2 text-right font-bold text-emerald-200">{row.dailyTarget ? money(row.dailyTarget) : "—"}</td>
              {row.donationCells.map((cell, index) => {
                const day = dates[index];
                const shown = amountFor(cell, paymentView);
                return <td key={day} title={`${STATE_LABEL[cell.state]} · ülke ${money(cell.country)} · birlik ${money(cell.mu)}${cell.carry ? ` · devreden ${money(cell.carry)}` : ""}`} className="px-1 py-2 text-center"><span className={`inline-flex min-h-8 min-w-[58px] flex-col items-center justify-center rounded-md border px-1 text-[9px] ${stateStyle(cell.state)}`}>{shown ? Math.round(shown).toLocaleString("tr-TR") : (cell.state === "covered" ? "✓" : cell.state === "future" || cell.state === "pre" ? "·" : "—")}<span className="opacity-70">{STATE_LABEL[cell.state]}</span></span></td>;
              })}
              <td className="px-2 py-2 text-right font-bold text-emerald-300">{money(paymentView === "country" ? row.countryThisWeek : paymentView === "mu" ? row.muThisWeek : row.paidThisWeek)}</td><td className="px-2 py-2 text-right text-emerald-300">{row.surplus ? `+${money(row.surplus)}` : "—"}</td><td className="px-2 py-2 text-right text-rose-300">{row.unpaid ? money(row.unpaid) : "—"}</td>
              <td className="px-3 py-2"><span className={`whitespace-nowrap rounded-full border px-2 py-1 text-[9px] ${row.unpaid > 0 ? "border-rose-500/25 bg-rose-950/40 text-rose-200" : row.dailyTarget ? "border-emerald-500/25 bg-emerald-950/30 text-emerald-200" : "border-slate-600/30 bg-slate-900/50 text-slate-400"}`}>{row.statusLabel}</span></td>
              <td className="px-3 py-2"><button type="button" onClick={() => toggleExcluded(row.userId)} className={`whitespace-nowrap text-[9px] ${row.excluded ? "text-amber-200" : "text-[#BBE1FA]/40 hover:text-amber-200"}`}>{row.excluded ? "Hariçte · geri al" : "Hariç tut"}</button></td>
            </tr>)}</tbody>
          </table>
          {filteredRows.length === 0 && <div className="p-8 text-center text-xs text-[#BBE1FA]/45">Bu filtrede üye bulunamadı.</div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-500/10 bg-[#141C21]/50 px-4 py-3 text-[10px] text-[#BBE1FA]/40"><span><Users className="mr-1 inline h-3.5 w-3.5" />{filteredRows.length} üye gösteriliyor · bağışlar ülke ve askeri birlik alıcılarına göre ayrılır.</span><span>Oyuncu sınıfı ve hariç tutma tercihleri bu tarayıcıda saklanır.</span></div>
        </section>
      </>}
    </div>
  );
};
