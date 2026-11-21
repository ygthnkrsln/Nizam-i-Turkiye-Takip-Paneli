import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Heart,
  Flame,
  Swords,
  Shield,
  RefreshCw,
  TrendingUp,
  Users,
  Info,
  Clock,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Award,
  CalendarDays,
} from "lucide-react";
import {
  fetchAllArmiesDailyDamageHistory,
  fetchManagementOverview,
  AllArmiesDailyDamageHistoryRecord,
  ManagementOverviewResponse,
  ManagementArmyItem,
} from "../services/wareraApi";
import { ActiveTab } from "../App";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface ManagementArmyTrackingSectionProps {
  onSelectArmy: (muId: string) => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

function formatDmg(value: number): string {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + "B";
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(1) + "K";
  return value.toLocaleString("tr-TR");
}

type DamageHistoryMode = "7d" | "14d" | "30d" | "week" | "month";

function getIstanbulDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function sumDamage(records: AllArmiesDailyDamageHistoryRecord[]): number {
  return records.reduce((sum, record) => sum + record.totalDamage, 0);
}

function formatPercentChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "0,0%" : "Yeni";
  const change = ((current - previous) / previous) * 100;
  return `${change > 0 ? "+" : ""}${change.toFixed(1).replace(".", ",")}%`;
}

export const ManagementArmyTrackingSection: React.FC<
  ManagementArmyTrackingSectionProps
> = ({ onSelectArmy, onNavigateTab }) => {
  const [data, setData] = useState<ManagementOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [historyMode, setHistoryMode] = useState<DamageHistoryMode>("30d");
  const [historyMonth, setHistoryMonth] = useState(() => getIstanbulDate().slice(0, 7));
  const [historyWeek, setHistoryWeek] = useState(1);
  const [isHistoryPeriodPickerOpen, setIsHistoryPeriodPickerOpen] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<AllArmiesDailyDamageHistoryRecord[]>([]);
  const [recentHistoryRecords, setRecentHistoryRecords] = useState<AllArmiesDailyDamageHistoryRecord[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const requestInFlight = useRef(false);

  const loadData = async (forceRefresh = false) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    if (forceRefresh) setIsRefreshing(true);
    else if (!data) setIsLoading(true);
    setError(null);
    try {
      const res = await fetchManagementOverview(undefined, forceRefresh, undefined, false);
      setData(res);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      console.error("Error loading management army tracking:", err);
      setError(err.message || "Veriler alınamadı");
    } finally {
      requestInFlight.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
    const interval = setInterval(() => {
      loadData(false);
    }, 25000);
    return () => clearInterval(interval);
  }, []);

  const handleGoToArmyDamage = (armyId: string) => {
    onSelectArmy(armyId);
    onNavigateTab("combatDamage");
  };

  const alliance = data?.alliance;
  const armies = data?.armies || [];
  const today = getIstanbulDate();
  const currentMonth = today.slice(0, 7);
  const historyRange = useMemo(() => {
    if (historyMode === "7d") return { from: shiftDate(today, -6), to: today };
    if (historyMode === "14d") return { from: shiftDate(today, -13), to: today };
    if (historyMode === "30d") return { from: shiftDate(today, -29), to: today };
    const monthLength = daysInMonth(historyMonth);
    if (historyMode === "month") {
      return {
        from: `${historyMonth}-01`,
        to: historyMonth === currentMonth
          ? today
          : `${historyMonth}-${String(monthLength).padStart(2, "0")}`,
      };
    }
    const startDay = (historyWeek - 1) * 7 + 1;
    const endDay = Math.min(
      startDay + 6,
      monthLength,
      historyMonth === currentMonth ? Number(today.slice(-2)) : monthLength,
    );
    return {
      from: `${historyMonth}-${String(startDay).padStart(2, "0")}`,
      to: `${historyMonth}-${String(endDay).padStart(2, "0")}`,
    };
  }, [historyMode, historyMonth, historyWeek, today, currentMonth]);

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      setIsHistoryLoading(true);
      setHistoryError(null);
      setHistoryRecords([]);
      setRecentHistoryRecords([]);
      try {
        const [selectedRange, recentRange] = await Promise.all([
          fetchAllArmiesDailyDamageHistory(shiftDate(historyRange.from, -1), historyRange.to),
          fetchAllArmiesDailyDamageHistory(shiftDate(today, -30), today),
        ]);
        if (cancelled) return;
        setHistoryRecords(selectedRange);
        setRecentHistoryRecords(recentRange);
      } catch (error) {
        if (cancelled) return;
        setHistoryError(error instanceof Error ? error.message : "Günlük hasar geçmişi alınamadı.");
      } finally {
        if (!cancelled) setIsHistoryLoading(false);
      }
    };
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [historyRange.from, historyRange.to, today]);

  const selectedHistory = useMemo(
    () => historyRecords.filter(
      (record) => record.date >= historyRange.from && record.date <= historyRange.to,
    ),
    [historyRecords, historyRange.from, historyRange.to],
  );
  const selectedCompleteHistory = useMemo(
    () => selectedHistory.filter((record) => record.isComplete),
    [selectedHistory],
  );
  const recentCompleteHistory = useMemo(
    () => recentHistoryRecords.filter((record) => record.isComplete),
    [recentHistoryRecords],
  );
  const last7Start = shiftDate(today, -6);
  const last30Start = shiftDate(today, -29);
  const last7History = recentCompleteHistory.filter((record) => record.date >= last7Start);
  const last30History = recentCompleteHistory.filter((record) => record.date >= last30Start);
  const average30Damage = last30History.length
    ? sumDamage(last30History) / last30History.length
    : 0;
  const highest30Damage = last30History.length
    ? Math.max(...last30History.map((record) => record.totalDamage))
    : 0;
  const lowest30Damage = last30History.length
    ? Math.min(...last30History.map((record) => record.totalDamage))
    : 0;
  const latestHistory = recentCompleteHistory[recentCompleteHistory.length - 1];
  const changeForDays = (days: number) => {
    if (!latestHistory) return "—";
    const baseline = recentCompleteHistory.find(
      (record) => record.date === shiftDate(latestHistory.date, -days),
    );
    return baseline
      ? formatPercentChange(latestHistory.totalDamage, baseline.totalDamage)
      : "—";
  };
  const dailyChange = changeForDays(1);
  const selectedRangeLabel = historyMode === "week"
    ? `${historyWeek}. hafta · ${historyRange.from} – ${historyRange.to}`
    : historyMode === "month"
      ? historyMonth
      : historyMode === "7d"
        ? "Son 7 gün"
        : historyMode === "14d"
          ? "Son 14 gün"
          : historyMode === "30d"
            ? "Son 30 gün"
            : `${historyRange.from} – ${historyRange.to}`;
  const selectedExpectedDays = Math.max(
    1,
    Math.round((Date.parse(`${historyRange.to}T00:00:00Z`) - Date.parse(`${historyRange.from}T00:00:00Z`)) / 86_400_000) + 1,
  );
  const selectedHistoryByDate = new Map<string, AllArmiesDailyDamageHistoryRecord>(
    selectedHistory.map((record): [string, AllArmiesDailyDamageHistoryRecord] => [record.date, record]),
  );
  const historyChartData = Array.from({ length: selectedExpectedDays }, (_, index) => {
    const date = shiftDate(historyRange.from, index);
    const record = selectedHistoryByDate.get(date);
    return {
      date,
      chartDamage: record?.isComplete ? record.totalDamage : null,
    };
  });
  const historyModeButtonClass = (mode: DamageHistoryMode) =>
    `rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
      historyMode === mode
        ? "border border-cyan-400/50 bg-cyan-950/80 text-cyan-200"
        : "text-[#BBE1FA]/60 hover:bg-[#25333b] hover:text-white"
    }`;

  // Sort armies by today's damage descending
  const sortedArmies = [...armies].sort((a, b) => {
    if (b.todayDamage !== a.todayDamage) return b.todayDamage - a.todayDamage;
    return b.health.percentage - a.health.percentage;
  });

  return (
    <div className="w-full space-y-6 text-white font-mono bg-gradient-to-b from-[#1C242B] to-[#141C21] p-4 sm:p-6 rounded-2xl border border-amber-500/30 shadow-2xl relative">
      {/* 1. ÜST BAŞLIK VE KONTROLLER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-amber-500/20">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-950/80 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Shield className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase">
              ORDU TAKİBİ & HARBE HAZIRLIK
            </h1>
            <span
              className="text-amber-400 hover:text-amber-300 cursor-pointer text-sm"
              title="Takip edilen orduların anlık can, açlık doluluk oranları ve günlük toplam hasar tablosu"
            >
              <Info className="w-4 h-4" />
            </span>
          </div>
          <p className="text-xs text-[#BBE1FA]/70 mt-1">
            Türk ordularının anlık toplam can ve açlık barı doluluk oranları ile
            02:55 TSİ günlük snapshot ile kaydedilen hasarları
          </p>
        </div>

        {/* Canlı Yenileme ve Zaman Rozeti */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#141C21] border border-amber-500/30 text-xs text-amber-300 shadow-inner">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Son Güncelleme: </span>
            <span className="font-bold text-white">
              {lastRefreshedAt.toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-500/40 text-amber-200 hover:text-white text-xs font-bold transition-all cursor-pointer shadow-md disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-amber-400 ${isRefreshing ? "animate-spin" : ""}`}
            />
            <span>{isRefreshing ? "Yenileniyor..." : "Tazele"}</span>
          </button>
        </div>
      </div>

      {/* 2. ÜST 3 BÜYÜK GÖSTERGE KARTI (Türk Topluluğu Toplam Can, Açlık, Günlük Hasar) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KART 1: TÜRK TOPLULUĞU TOPLAM CAN DOLULUK ORANI */}
        <div className="rounded-xl bg-[#182329] border border-rose-500/30 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-rose-400">
              <div className="w-7 h-7 rounded-lg bg-rose-950/80 border border-rose-500/30 flex items-center justify-center">
                <Heart className="w-4 h-4 text-rose-400" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider">
                TÜRK TOPLULUĞU TOPLAM CAN
              </span>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-500/30">
              {data?.armies?.length ?? 0} Ordu
            </span>
          </div>

          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-rose-400">
                %{alliance?.totalHealth?.percentage ?? 0}
              </span>
              <span className="text-xs text-[#BBE1FA]/60">Doluluk</span>
            </div>
            <div className="text-xs text-[#BBE1FA]/70 mt-1 font-mono">
              {alliance?.totalHealth?.current?.toLocaleString("tr-TR") ?? 0} /{" "}
              {alliance?.totalHealth?.max?.toLocaleString("tr-TR") ?? 0} HP
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2.5 rounded-full bg-[#141C21] overflow-hidden p-0.5 border border-rose-500/20 mt-2">
            <div
              style={{
                width: `${Math.min(100, alliance?.totalHealth?.percentage ?? 0)}%`,
              }}
              className="h-full rounded-full bg-gradient-to-r from-rose-600 via-rose-500 to-emerald-400 transition-all duration-500"
            />
          </div>
        </div>

        {/* KART 2: TÜRK TOPLULUĞU TOPLAM AÇLIK DOLULUK ORANI */}
        <div className="rounded-xl bg-[#182329] border border-amber-500/30 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-amber-400">
              <div className="w-7 h-7 rounded-lg bg-amber-950/80 border border-amber-500/30 flex items-center justify-center">
                <Flame className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider">
                TÜRK TOPLULUĞU TOPLAM AÇLIK
              </span>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-500/30">
              Canlı Enerji
            </span>
          </div>

          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-amber-400">
                %{alliance?.totalHunger?.percentage ?? 0}
              </span>
              <span className="text-xs text-[#BBE1FA]/60">Doluluk</span>
            </div>
            <div className="text-xs text-[#BBE1FA]/70 mt-1 font-mono">
              {alliance?.totalHunger?.current?.toLocaleString("tr-TR") ?? 0} /{" "}
              {alliance?.totalHunger?.max?.toLocaleString("tr-TR") ?? 0} Açlık
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2.5 rounded-full bg-[#141C21] overflow-hidden p-0.5 border border-amber-500/20 mt-2">
            <div
              style={{
                width: `${Math.min(100, alliance?.totalHunger?.percentage ?? 0)}%`,
              }}
              className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-300 transition-all duration-500"
            />
          </div>
        </div>

        {/* KART 3: TÜRK TOPLULUĞU GÜNLÜK TOPLAM HASAR */}
        <div className="rounded-xl bg-[#182329] border border-cyan-500/30 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-cyan-400">
              <div className="w-7 h-7 rounded-lg bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center">
                <Swords className="w-4 h-4 text-cyan-400" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider">
                TÜRK TOPLULUĞU GÜNLÜK HASAR
              </span>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
              Günlük snapshot bazlı
            </span>
          </div>

          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-cyan-400">
                {formatDmg(alliance?.totalTodayDamage ?? 0)}
              </span>
              <span className="text-xs font-bold text-cyan-300">DMG</span>
            </div>
            <div className="text-xs text-[#BBE1FA]/70 mt-1 font-mono">
              Toplam {alliance?.totalMembers ?? 0} Savaşçı Bünyesinde
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-[#BBE1FA]/80 pt-2 border-t border-cyan-500/20">
            <span>Lider Birlik:</span>
            <span className="font-bold text-amber-300">
              {sortedArmies[0]?.name || "Turkic Tribe"} (
              {formatDmg(sortedArmies[0]?.todayDamage || 0)})
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-[#182329] border border-violet-500/30 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
          <div className="flex items-center gap-2 text-violet-300">
            <div className="w-7 h-7 rounded-lg bg-violet-950/80 border border-violet-500/30 flex items-center justify-center"><Swords className="w-4 h-4" /></div>
            <span className="text-xs font-bold uppercase tracking-wider">TAHMİNİ POTANSİYEL HASAR</span>
          </div>
          <div className="my-3">
            <div className="text-3xl sm:text-4xl font-black text-violet-300">{formatDmg(alliance?.totalPotentialDamage ?? 0)}</div>
            <div className="mt-1 text-[10px] text-[#BBE1FA]/65">Savaş buildi · mevcut can ve açlık oranıyla</div>
          </div>
          <div className="border-t border-violet-500/20 pt-2 text-[10px] text-[#BBE1FA]/50">Prestij eğrisi, can ve yemek oranıyla ölçeklenir; 72 saati aşan inaktiflik hesaba katılmaz.</div>
        </div>
      </div>

      <section className="rounded-xl border border-cyan-500/20 bg-[#182329] p-4 shadow-lg">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_230px]">
          <div className="min-w-0 rounded-lg border border-cyan-500/10 bg-[#111A20] p-3 sm:p-4">
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-sm font-bold text-cyan-200">
                  Türk Topluluğu Günlük Hasar · {selectedRangeLabel}
                </h2>
                <p className="mt-1 text-[9px] uppercase tracking-wider text-[#BBE1FA]/40">
                  Günlük snapshot · Her gün 02:55 TSİ · {selectedCompleteHistory.length}/{selectedExpectedDays} eksiksiz kayıt
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/20 bg-[#0B1419] p-1">
                  {(["7d", "14d", "30d"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={historyMode === mode}
                      className={historyModeButtonClass(mode)}
                      onClick={() => {
                        setHistoryMode(mode);
                        setIsHistoryPeriodPickerOpen(false);
                      }}
                    >
                      {mode.slice(0, -1)} gün
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  aria-expanded={isHistoryPeriodPickerOpen}
                  onClick={() => {
                    if (!isHistoryPeriodPickerOpen && historyMode !== "week" && historyMode !== "month") {
                      setHistoryMode("month");
                    }
                    setIsHistoryPeriodPickerOpen((open) => !open);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
                    historyMode === "week" || historyMode === "month"
                      ? "border-cyan-400/40 bg-cyan-950/50 text-cyan-200"
                      : "border-cyan-500/20 bg-[#0B1419] text-[#BBE1FA]/60 hover:text-white"
                  }`}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Geçmiş
                </button>
              </div>
            </div>

            {isHistoryPeriodPickerOpen && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-cyan-500/15 bg-[#0B1419] p-2">
                <select
                  value={historyMode === "week" ? "week" : "month"}
                  onChange={(event) => setHistoryMode(event.target.value as "week" | "month")}
                  className="rounded-md border border-cyan-500/20 bg-[#141C21] px-2 py-1.5 text-[10px] text-cyan-100"
                  aria-label="Geçmiş dönem türü"
                >
                  <option value="month">Aylık</option>
                  <option value="week">Ay içi hafta</option>
                </select>
                <input
                  type="month"
                  value={historyMonth}
                  max={currentMonth}
                  onChange={(event) => {
                    setHistoryMonth(event.target.value);
                    setHistoryWeek(1);
                  }}
                  className="rounded-md border border-cyan-500/20 bg-[#141C21] px-2 py-1.5 text-[10px] text-cyan-100 [color-scheme:dark]"
                  aria-label="Hasar geçmişi ayı"
                />
                {historyMode === "week" && (
                  <select
                    value={historyWeek}
                    onChange={(event) => setHistoryWeek(Number(event.target.value))}
                    className="rounded-md border border-cyan-500/20 bg-[#141C21] px-2 py-1.5 text-[10px] text-cyan-100"
                    aria-label="Ay içindeki hafta"
                  >
                    {Array.from({
                      length: Math.ceil(
                        (historyMonth === currentMonth ? Number(today.slice(-2)) : daysInMonth(historyMonth)) / 7,
                      ),
                    }, (_, index) => {
                      const week = index + 1;
                      const startDay = index * 7 + 1;
                      const endDay = Math.min(startDay + 6, daysInMonth(historyMonth));
                      return <option key={week} value={week}>{week}. hafta ({startDay}–{endDay})</option>;
                    })}
                  </select>
                )}
              </div>
            )}

            {historyError && (
              <div className="mb-3 rounded-lg border border-rose-500/25 bg-rose-950/20 px-3 py-2 text-[11px] text-rose-200">
                Günlük hasar geçmişi yüklenemedi: {historyError}
              </div>
            )}
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historyChartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                  <CartesianGrid stroke="#9fb3c8" strokeOpacity={0.15} strokeDasharray="3 5" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => String(value).slice(5).replace("-", ".")}
                    tick={{ fill: "#cbd5e1", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={16}
                  />
                  <YAxis
                    yAxisId="damage"
                    tickFormatter={(value) => formatDmg(Number(value))}
                    tick={{ fill: "#cbd5e1", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={54}
                  />
                  <Tooltip
                    labelFormatter={(value) => `Snapshot · ${value}`}
                    formatter={(value) => [value == null ? "Eksik snapshot" : `${formatDmg(Number(value))} hasar`, "Günlük hasar"]}
                    contentStyle={{ background: "#0b1419", border: "1px solid rgba(56,189,248,.35)", borderRadius: 10, color: "#fff" }}
                    labelStyle={{ color: "#fff", fontWeight: 700 }}
                  />
                  <Legend wrapperStyle={{ color: "#dbeafe", fontSize: 10 }} />
                  <Line
                    yAxisId="damage"
                    type="linear"
                    dataKey="chartDamage"
                    name="Günlük hasar"
                    stroke="#38bdf8"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#38bdf8", strokeWidth: 0 }}
                    activeDot={{ r: 5, stroke: "#fff", strokeWidth: 1 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {!isHistoryLoading && !historyError && selectedCompleteHistory.length === 0 && (
              <div className="mt-2 text-center text-[11px] text-[#BBE1FA]/45">
                {selectedRangeLabel} için henüz günlük hasar snapshot’ı bulunmuyor.
              </div>
            )}
            {isHistoryLoading && (
              <div className="mt-2 text-center text-[10px] text-[#BBE1FA]/45">Hasar geçmişi yükleniyor…</div>
            )}
            <div className="mt-2 text-[9px] text-[#BBE1FA]/40">
              Eksik snapshot’lar toplam ve çizgi hesabına katılmaz.
            </div>
          </div>

          <aside className="grid grid-cols-2 gap-2 xl:flex xl:flex-col">
            <div className="rounded-lg border border-cyan-500/15 bg-[#141C21] p-3">
              <div className="text-[9px] uppercase tracking-wider text-[#BBE1FA]/50">Seçili dönem toplamı</div>
              <div className="mt-1 text-lg font-black text-cyan-300">{formatDmg(sumDamage(selectedCompleteHistory))}</div>
              <div className="text-[9px] text-[#BBE1FA]/40">{selectedCompleteHistory.length}/{selectedExpectedDays} gün eksiksiz</div>
            </div>
            <div className="rounded-lg border border-cyan-500/15 bg-[#141C21] p-3">
              <div className="text-[9px] uppercase tracking-wider text-[#BBE1FA]/50">7 / 30 günlük toplam</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[9px] text-[#BBE1FA]/40">7 gün</div>
                  <div className="text-sm font-bold text-white">{formatDmg(sumDamage(last7History))}</div>
                </div>
                <div>
                  <div className="text-[9px] text-[#BBE1FA]/40">30 gün</div>
                  <div className="text-sm font-bold text-white">{formatDmg(sumDamage(last30History))}</div>
                </div>
              </div>
              <div className="mt-1 text-[9px] text-[#BBE1FA]/40">{last7History.length}/7 · {last30History.length}/30 kayıt</div>
            </div>
            <div className="rounded-lg border border-cyan-500/15 bg-[#141C21] p-3">
              <div className="text-[9px] uppercase tracking-wider text-[#BBE1FA]/50">30 günlük ortalama</div>
              <div className="mt-1 text-lg font-black text-amber-300">{formatDmg(average30Damage)}</div>
              <div className="mt-2 flex justify-between gap-2 text-[9px]">
                <span className="text-[#BBE1FA]/45">En yüksek <b className="text-[#BBE1FA]/80">{formatDmg(highest30Damage)}</b></span>
                <span className="text-[#BBE1FA]/45">En düşük <b className="text-[#BBE1FA]/80">{formatDmg(lowest30Damage)}</b></span>
              </div>
            </div>
            <div className="rounded-lg border border-amber-500/15 bg-[#141C21] p-3">
              <div className="text-[9px] uppercase tracking-wider text-[#BBE1FA]/50">Hasar değişimi</div>
              <div className={`mt-1 text-lg font-black ${
                dailyChange.startsWith("-") ? "text-rose-300" : dailyChange === "—" ? "text-[#BBE1FA]/50" : "text-emerald-300"
              }`}>{dailyChange}</div>
              <div className="text-[9px] text-[#BBE1FA]/40">Günlük · {latestHistory?.date || "veri bekleniyor"}</div>
              <div className="mt-2 grid grid-cols-3 gap-1 border-t border-amber-500/10 pt-2 text-[9px]">
                {[7, 14, 30].map((days) => (
                  <div key={days}>
                    <div className="text-[#BBE1FA]/35">{days}g</div>
                    <div className="font-bold text-[#BBE1FA]/75">{changeForDays(days)}</div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="rounded-xl border border-cyan-500/20 bg-[#182329] p-4 shadow-lg">
        <div className="mb-3">
          <h2 className="text-sm font-bold text-cyan-200">Birliklere göre günlük ve potansiyel hasar</h2>
          <p className="mt-1 text-[10px] text-[#BBE1FA]/50">Günlük gerçek hasarı, mevcut hazırlık seviyesindeki tahmini potansiyelle karşılaştır.</p>
        </div>
        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sortedArmies} layout="vertical" margin={{ top: 4, right: 22, bottom: 4, left: 4 }} barCategoryGap="28%">
              <CartesianGrid stroke="#9fb3c8" strokeOpacity={0.18} strokeDasharray="3 5" horizontal={false} />
              <XAxis type="number" tickFormatter={(value) => formatDmg(Number(value))} tick={{ fill: "#cbd5e1", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={138} tick={{ fill: "#f1f5f9", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value, name, item) => [item.payload?.dataAvailable === false ? "—" : `${formatDmg(Number(value))} hasar`, String(name)]} contentStyle={{ background: "#0b1419", border: "1px solid rgba(56,189,248,.35)", borderRadius: 10, color: "#fff" }} labelStyle={{ color: "#fff", fontWeight: 700 }} />
              <Legend wrapperStyle={{ color: "#dbeafe", fontSize: 11 }} />
              <Bar dataKey="todayDamage" name="Bugünkü hasar" fill="#38bdf8" radius={[0, 5, 5, 0]} maxBarSize={16} />
              <Bar dataKey="potentialDamage" name="Potansiyel hasar" fill="#a78bfa" radius={[0, 5, 5, 0]} maxBarSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* 3. TAKİP EDİLEN ORDULARIN CANLI TABLOSU */}
      <div className="rounded-xl bg-[#182329] border border-amber-500/25 overflow-hidden shadow-xl">
        <div className="p-3.5 bg-[#141C21] border-b border-amber-500/20 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-xs uppercase tracking-wider text-amber-200">
              ORDU HARBE HAZIRLIK & CANLI HASAR LİSTESİ
            </span>
          </div>
          <span className="text-[11px] text-[#BBE1FA]/60">
            Can ve açlık barları her 25 saniyede otomatik tazelenir
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-xs font-mono">
            <thead>
              <tr className="bg-[#141C21]/80 border-b border-amber-500/20 text-[#BBE1FA]/70 text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4 text-center w-12">#</th>
                <th className="py-3 px-4">Ordu Adı</th>
                <th className="py-3 px-4 text-center">Asker</th>
                <th className="py-3 px-4 min-w-[200px]">
                  Can Doluluk Oranı (HP)
                </th>
                <th className="py-3 px-4 min-w-[200px]">Açlık Doluluk Oranı</th>
                <th className="py-3 px-4 text-right">Potansiyel Hasar</th>
                <th className="py-3 px-4 text-right">Bugünkü Hasar</th>
                <th className="py-3 px-4 text-center w-28">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3282B8]/15">
              {sortedArmies.map((army, idx) => {
                if (army.dataAvailable === false) {
                  return (
                    <tr key={army.muId} className="text-[#BBE1FA]/50">
                      <td className="py-3.5 px-4 text-center">—</td>
                      <td className="py-3.5 px-4 font-bold text-white">{army.name}</td>
                      <td className="py-3.5 px-4 text-center" title={army.dataError}>—</td>
                      <td className="py-3.5 px-4 text-center" title={army.dataError}>—</td>
                      <td className="py-3.5 px-4 text-center" title={army.dataError}>—</td>
                      <td className="py-3.5 px-4 text-right" title={army.dataError}>—</td>
                      <td className="py-3.5 px-4 text-right" title={army.dataError}>—</td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleGoToArmyDamage(army.muId)}
                          className="text-amber-200 hover:text-white"
                          title="Bu ordunun hasar detay sayfasına git"
                        >
                          Detay
                        </button>
                      </td>
                    </tr>
                  );
                }
                const healthColor =
                  army.health.percentage >= 75
                    ? "text-emerald-400"
                    : army.health.percentage >= 45
                      ? "text-amber-400"
                      : "text-rose-400";

                const hungerColor =
                  army.hunger.percentage >= 75
                    ? "text-amber-400"
                    : army.hunger.percentage >= 45
                      ? "text-yellow-400"
                      : "text-rose-400";

                return (
                  <tr
                    key={army.muId}
                    className="hover:bg-amber-950/20 transition-colors group cursor-pointer"
                    onClick={() => handleGoToArmyDamage(army.muId)}
                  >
                    {/* Sıra */}
                    <td className="py-3.5 px-4 text-center font-bold text-amber-400">
                      #{idx + 1}
                    </td>

                    {/* Ordu Adı & Avatar */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={army.avatarUrl}
                          alt={army.name}
                          className="w-8 h-8 rounded-lg object-cover border border-amber-500/30 group-hover:border-amber-400 transition-colors shrink-0"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              "https://media.warera.io/avatars/mu/mu-69c229c4449287ea1a26a5b3-1787680897144-8qglepbh.png";
                          }}
                        />
                        <div>
                          <div className="font-bold text-white group-hover:text-amber-300 transition-colors text-sm">
                            {army.name}
                          </div>
                          <div className="text-[10px] text-[#BBE1FA]/50 font-sans">
                            ID: {army.muId.slice(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Asker Sayısı */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#141C21] border border-amber-500/30 text-amber-200 text-xs font-bold">
                        <Users className="w-3 h-3 text-amber-400" />
                        <span>{army.memberCount}</span>
                      </span>
                    </td>

                    {/* Can Doluluk Oranı */}
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className={`font-bold ${healthColor}`}>
                            %{army.health.percentage}
                          </span>
                          <span className="text-[11px] text-[#BBE1FA]/70">
                            {army.health.current.toLocaleString("tr-TR")} /{" "}
                            {army.health.max.toLocaleString("tr-TR")} HP
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[#141C21] overflow-hidden p-0.5 border border-rose-500/20">
                          <div
                            style={{
                              width: `${Math.min(100, army.health.percentage)}%`,
                            }}
                            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-emerald-400 transition-all duration-300"
                          />
                        </div>
                      </div>
                    </td>

                    {/* Açlık Doluluk Oranı */}
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className={`font-bold ${hungerColor}`}>
                            %{army.hunger.percentage}
                          </span>
                          <span className="text-[11px] text-[#BBE1FA]/70">
                            {army.hunger.current.toLocaleString("tr-TR")} /{" "}
                            {army.hunger.max.toLocaleString("tr-TR")}
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[#141C21] overflow-hidden p-0.5 border border-amber-500/20">
                          <div
                            style={{
                              width: `${Math.min(100, army.hunger.percentage)}%`,
                            }}
                            className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-300 transition-all duration-300"
                          />
                        </div>
                      </div>
                    </td>

                    {/* Bugünkü Hasar */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-violet-300 text-sm">{formatDmg(army.potentialDamage || 0)} DMG</div>
                      <div className="text-[10px] text-[#BBE1FA]/45">Savaşçı build tahmini</div>
                    </td>

                    {/* Bugünkü Hasar */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-rose-400 text-sm">
                        {formatDmg(army.todayDamage)} DMG
                      </div>
                      <div className="text-[10px] text-[#BBE1FA]/50">
                        Haftalık: {formatDmg(army.weeklyDamage)}
                      </div>
                    </td>

                    {/* Aksiyon */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGoToArmyDamage(army.muId);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#141C21] hover:bg-amber-950/60 border border-amber-500/30 hover:border-amber-400 text-amber-200 hover:text-white text-[11px] transition-all cursor-pointer"
                        title="Bu ordunun hasar detay sayfasına git"
                      >
                        <span>Detay</span>
                        <ChevronRight className="w-3 h-3 text-amber-400" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
