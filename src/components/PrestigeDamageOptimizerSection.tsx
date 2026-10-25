import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, Calculator, Clock3, LoaderCircle, Settings2, Sparkles, Trophy } from "lucide-react";
import { fetchUserLevelingProfile } from "../services/wareraApi";
import { PlayerDirectorySearch } from "./PlayerDirectorySearch";
import {
  levelForXp,
  MISSION_LABELS,
  MISSION_XP,
  MissionKey,
  prestigeXpMultiplier,
  totalXpForLevel,
  xpRequiredForLevel,
} from "../utils/levelProgression";
import {
  DEFAULT_LEVEL_DAMAGE,
  DEFAULT_OPTIMIZER_SETTINGS,
  LevelDamageRate,
  PrestigeOptimizerSettings,
  PrestigeStrategyResult,
  simulatePrestigeOptimization,
} from "../utils/prestigeOptimizer";

const missionKeys: MissionKey[] = ["daily", "weekly", "monthly"];
const numberFormat = new Intl.NumberFormat("tr-TR");
const OPTIMIZER_STORAGE_KEY = "nizam_level_prestige_optimizer_v1";

function loadOptimizerPreferences(): { settings: PrestigeOptimizerSettings; damageRates: LevelDamageRate[] } {
  if (typeof window === "undefined") return { settings: DEFAULT_OPTIMIZER_SETTINGS, damageRates: DEFAULT_LEVEL_DAMAGE };
  try {
    const saved = JSON.parse(window.localStorage.getItem(OPTIMIZER_STORAGE_KEY) || "null");
    return {
      settings: { ...DEFAULT_OPTIMIZER_SETTINGS, ...(saved?.settings || {}) },
      damageRates: Array.isArray(saved?.damageRates) && saved.damageRates.length
        ? saved.damageRates.map((row: any) => ({ level: Number(row.level), dailyDamage: Math.max(0, Number(row.dailyDamage) || 0) }))
        : DEFAULT_LEVEL_DAMAGE,
    };
  } catch {
    return { settings: DEFAULT_OPTIMIZER_SETTINGS, damageRates: DEFAULT_LEVEL_DAMAGE };
  }
}

function compactNumber(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return numberFormat.format(Math.round(value));
}

function damageChartPoints(strategy: PrestigeStrategyResult, maxDamage: number): string {
  const lastIndex = Math.max(1, strategy.days.length - 1);
  return strategy.days.map((day, index) => {
    const x = 24 + (index / lastIndex) * 952;
    const y = 216 - (day.cumulativeDamage / maxDamage) * 190;
    return `${x},${y}`;
  }).join(" ");
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(date);
}

export const PrestigeDamageOptimizerSection: React.FC = () => {
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchUserLevelingProfile>> | null>(null);
  const [completed, setCompleted] = useState<Record<MissionKey, boolean>>({ daily: false, weekly: false, monthly: false });
  const [remaining, setRemaining] = useState<Record<MissionKey, number>>({ ...MISSION_XP });
  const [savedPreferences] = useState(loadOptimizerPreferences);
  const [optimizerSettings, setOptimizerSettings] = useState(savedPreferences.settings);
  const [damageRates, setDamageRates] = useState(savedPreferences.damageRates);
  const [selectedStrategyId, setSelectedStrategyId] = useState<PrestigeStrategyResult["id"]>("immediate");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const multiplier = profile ? prestigeXpMultiplier(profile.leveling.prestigeLevel) : 1;
  const strategyResults = useMemo(() => {
    if (!profile) return null;
    const currentLevel = Math.max(1, Math.min(50, profile.leveling.level));
    return simulatePrestigeOptimization({
      startDate: new Date(),
      currentLevel,
      currentXpInLevel: Math.max(0, profile.leveling.xp - totalXpForLevel(currentLevel)),
      currentPrestige: profile.leveling.prestigeLevel,
      availableMissionXp: {
        daily: completed.daily ? 0 : remaining.daily,
        weekly: completed.weekly ? 0 : remaining.weekly,
        monthly: completed.monthly ? 0 : remaining.monthly,
      },
      damageRates,
      settings: optimizerSettings,
    });
  }, [profile, completed, remaining, damageRates, optimizerSettings]);

  const bestStrategyId = strategyResults?.reduce<PrestigeStrategyResult["id"]>(
    (bestId, current) => current.totalDamage > (strategyResults.find((row) => row.id === bestId)?.totalDamage || -1) ? current.id : bestId,
    strategyResults[0]?.id || "immediate",
  ) || "immediate";
  const selectedStrategy = strategyResults?.find((strategy) => strategy.id === selectedStrategyId) || strategyResults?.[0] || null;

  useEffect(() => {
    try {
      window.localStorage.setItem(OPTIMIZER_STORAGE_KEY, JSON.stringify({ settings: optimizerSettings, damageRates }));
    } catch {
      // The optimizer remains usable if browser storage is unavailable.
    }
  }, [optimizerSettings, damageRates]);

  const handleLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedId = userId.trim();
    if (!normalizedId) return;
    setLoading(true);
    setError(null);
    setProfile(null);
    try {
      setProfile(await fetchUserLevelingProfile(normalizedId));
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "Oyuncu bilgisi alınamadı.");
    } finally {
      setLoading(false);
    }
  };

  const currentLevel = profile ? Math.min(50, Math.max(1, profile.leveling.level)) : 1;
  const currentXp = profile?.leveling.xp ?? 0;
  const xpIntoLevel = Math.max(0, currentXp - totalXpForLevel(currentLevel));
  const xpForNextLevel = currentLevel < 50 ? xpRequiredForLevel(currentLevel + 1) : 0;
  const derivedLevel = levelForXp(currentXp);
  const remainingTaskXp = profile
    ? missionKeys.reduce((total, key) => total + (completed[key] ? 0 : remaining[key]), 0)
    : 0;

  return (
    <section className="space-y-5" aria-labelledby="level-calculator-title">
      <header className="rounded-2xl border border-amber-400/20 bg-[#182329] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-2.5 text-amber-300">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">Araçlar</p>
            <h1 id="level-calculator-title" className="mt-1 text-xl font-bold text-white sm:text-2xl">Prestij - Hasar Optimizasyonu</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#BBE1FA]/65">Oyuncu ID’sine bağlı XP ve görev durumuyla bir yıllık prestij stratejilerini tahmini hasara göre karşılaştır.</p>
          </div>
        </div>
      </header>

      <form onSubmit={handleLookup} className="rounded-2xl border border-[#3282B8]/20 bg-[#182329] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0 flex-1"><PlayerDirectorySearch onSelect={setUserId} onManualInput={setUserId} /></div>
          <button
            type="submit"
            disabled={loading || !userId.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-5 py-3 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            {loading ? "Oyuncu aranıyor..." : "Oyuncuyu getir"}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-rose-300"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
      </form>

      {profile && (
        <>
          <section className="rounded-2xl border border-[#3282B8]/20 bg-[#182329] p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-white">{profile.username || "Oyuncu"}</h2>
                <p className="mt-0.5 font-mono text-xs text-[#BBE1FA]/50">{userId.trim()}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200">
                <Sparkles className="h-3.5 w-3.5" />Prestij {profile.leveling.prestigeLevel} · x{multiplier.toFixed(1)} XP
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[#3282B8]/15 bg-[#11191E]/70 p-4">
                <p className="text-xs text-[#BBE1FA]/55">Mevcut seviye</p>
                <p className="mt-1 font-mono text-2xl font-bold text-white">{profile.leveling.level}<span className="ml-1 text-sm font-medium text-[#BBE1FA]/45">/ 50</span></p>
                {derivedLevel !== profile.leveling.level && <p className="mt-1 text-[11px] text-amber-200/80">XP tablosuna göre seviye {derivedLevel}</p>}
              </div>
              <div className="rounded-xl border border-[#3282B8]/15 bg-[#11191E]/70 p-4">
                <p className="text-xs text-[#BBE1FA]/55">Toplam XP</p>
                <p className="mt-1 font-mono text-2xl font-bold text-cyan-300">{numberFormat.format(currentXp)}</p>
              </div>
              <div className="rounded-xl border border-[#3282B8]/15 bg-[#11191E]/70 p-4">
                <p className="text-xs text-[#BBE1FA]/55">Bu seviyedeki ilerleme</p>
                <p className="mt-1 font-mono text-2xl font-bold text-white">{numberFormat.format(xpIntoLevel)}<span className="text-sm text-[#BBE1FA]/55"> / {numberFormat.format(xpForNextLevel)}</span></p>
                {currentLevel < 50 && <p className="mt-1 text-[11px] text-[#BBE1FA]/55">Sonraki seviye için {numberFormat.format(Math.max(0, totalXpForLevel(currentLevel + 1) - currentXp))} XP</p>}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#3282B8]/20 bg-[#182329] p-5 sm:p-6">
            <div className="mb-4">
              <h2 className="text-base font-bold text-white">Görev durumu</h2>
              <p className="mt-1 text-xs text-[#BBE1FA]/55">Tamamlananları işaretle; tamamlanmayan görevlerde kazanabileceğin kalan XP’yi düzenle.</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {missionKeys.map((key) => (
                <div key={key} className="rounded-xl border border-[#3282B8]/15 bg-[#11191E]/70 p-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#BBE1FA]">
                    <input
                      type="checkbox"
                      checked={completed[key]}
                      onChange={(event) => setCompleted((previous) => ({ ...previous, [key]: event.target.checked }))}
                      className="h-4 w-4 accent-amber-400"
                    />
                    {MISSION_LABELS[key]}
                  </label>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <label htmlFor={`mission-xp-${key}`} className="text-xs text-[#BBE1FA]/55">Kalan XP</label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`mission-xp-${key}`}
                        type="number"
                        min={0}
                        max={MISSION_XP[key]}
                        step={1}
                        value={completed[key] ? 0 : remaining[key]}
                        disabled={completed[key]}
                        onChange={(event) => setRemaining((previous) => ({
                          ...previous,
                          [key]: Math.min(MISSION_XP[key], Math.max(0, Number(event.target.value) || 0)),
                        }))}
                        className="w-24 rounded-lg border border-[#3282B8]/20 bg-[#0D1418] px-2.5 py-1.5 text-right font-mono text-sm text-white outline-none focus:border-amber-400/50 disabled:opacity-50"
                      />
                      <span className="text-xs text-[#BBE1FA]/50">XP</span>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-[#BBE1FA]/40">Tam ödül: {numberFormat.format(MISSION_XP[key])} XP</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] px-4 py-3 text-sm">
              <span className="text-[#BBE1FA]/70">Şu anki görevlerden alınabilir XP</span>
              <span className="font-mono font-bold text-amber-200">{numberFormat.format(Math.round(remainingTaskXp * multiplier))} XP <span className="font-sans text-xs font-normal text-[#BBE1FA]/45">(bonus dahil)</span></span>
            </div>
          </section>

              <details className="rounded-2xl border border-[#3282B8]/20 bg-[#182329]">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-[#BBE1FA]"><Settings2 className="h-4 w-4 text-cyan-300" />Simülasyon varsayımları ve optimizasyon ayarları</summary>
                <div className="grid gap-3 border-t border-[#3282B8]/10 p-5 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="rounded-xl border border-[#3282B8]/15 bg-[#11191E]/60 p-3 text-xs text-[#BBE1FA]/70">
                    Hasar hesabı
                    <select value={optimizerSettings.damageTiming} onChange={(event) => setOptimizerSettings((settings) => ({ ...settings, damageTiming: event.target.value as PrestigeOptimizerSettings["damageTiming"] }))} className="mt-2 w-full rounded-lg border border-[#3282B8]/20 bg-[#0D1418] px-3 py-2 text-sm text-white">
                      <option value="start_of_day">Gün başındaki seviye/prestij</option><option value="end_of_day">Gün sonundaki seviye/prestij</option>
                    </select>
                  </label>
                  <label className="rounded-xl border border-[#3282B8]/15 bg-[#11191E]/60 p-3 text-xs text-[#BBE1FA]/70">
                    Prestij başına hasar bonusu (%)
                    <input type="number" min={0} max={200} value={optimizerSettings.prestigeDamageBonusPercent} onChange={(event) => setOptimizerSettings((settings) => ({ ...settings, prestigeDamageBonusPercent: Math.max(0, Number(event.target.value) || 0) }))} className="mt-2 w-full rounded-lg border border-[#3282B8]/20 bg-[#0D1418] px-3 py-2 font-mono text-sm text-white" />
                  </label>
                  <label className="rounded-xl border border-[#3282B8]/15 bg-[#11191E]/60 p-3 text-xs text-[#BBE1FA]/70">
                    XP biriktirme planı eşiği
                    <input type="number" min={10000} max={500000} step={1000} value={optimizerSettings.accumulatedXpThreshold} onChange={(event) => setOptimizerSettings((settings) => ({ ...settings, accumulatedXpThreshold: Math.max(10000, Number(event.target.value) || 65000) }))} className="mt-2 w-full rounded-lg border border-[#3282B8]/20 bg-[#0D1418] px-3 py-2 font-mono text-sm text-white" />
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[#3282B8]/15 bg-[#11191E]/60 p-3 text-xs text-[#BBE1FA]/70">
                    <input type="checkbox" checked={optimizerSettings.pauseXpBonusAtMaxLevel} onChange={(event) => setOptimizerSettings((settings) => ({ ...settings, pauseXpBonusAtMaxLevel: event.target.checked }))} className="mt-0.5 accent-cyan-400" />
                    50. seviyedeyken XP bonusunu durdur
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[#3282B8]/15 bg-[#11191E]/60 p-3 text-xs text-[#BBE1FA]/70">
                    <input type="checkbox" checked={optimizerSettings.carryoverExcessXp} onChange={(event) => setOptimizerSettings((settings) => ({ ...settings, carryoverExcessXp: event.target.checked }))} className="mt-0.5 accent-cyan-400" />
                    Prestijde mevcut seviye XP’sini koru
                  </label>
                  <label className="rounded-xl border border-[#3282B8]/15 bg-[#11191E]/60 p-3 text-xs text-[#BBE1FA]/70">
                    XP yuvarlama
                    <select value={optimizerSettings.rounding} onChange={(event) => setOptimizerSettings((settings) => ({ ...settings, rounding: event.target.value as PrestigeOptimizerSettings["rounding"] }))} className="mt-2 w-full rounded-lg border border-[#3282B8]/20 bg-[#0D1418] px-3 py-2 text-sm text-white">
                      <option value="round">En yakın tam sayı</option><option value="floor">Aşağı yuvarla</option><option value="ceil">Yukarı yuvarla</option>
                    </select>
                  </label>
                </div>
                <p className="px-5 pb-4 text-[11px] text-[#BBE1FA]/45">Görevler UTC 00.00’da yenilenir; haftalık görev Pazartesi, aylık görev ayın 1’inde yenilenir. 50. seviyede bonusun durması, XP taşıma ve hasar hesabı kaynak koddaki varsayımlara göre uygulanır.</p>
              </details>

              <details className="rounded-2xl border border-[#3282B8]/20 bg-[#182329]">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-[#BBE1FA]"><BarChart3 className="h-4 w-4 text-emerald-300" />Seviyeye göre günlük temel hasar varsayımları</summary>
                <p className="border-t border-[#3282B8]/10 px-5 pt-4 text-[11px] leading-relaxed text-amber-200/70">Bu değerler eklediğin optimizer kodundaki tahmini hasar tablosundan alındı; WarEra API’sinden gelen oyuncu verisi değildir. Kendi ortalamanla güncelleyebilirsin.</p>
                <div className="grid max-h-80 gap-2 overflow-auto p-5 sm:grid-cols-2 lg:grid-cols-3">
                  {damageRates.slice().sort((a, b) => a.level - b.level).map((rate) => (
                    <label key={rate.level} className="flex items-center justify-between gap-2 rounded-lg border border-[#3282B8]/10 bg-[#11191E]/60 px-3 py-2 text-xs text-[#BBE1FA]/70">
                      <span>Seviye {rate.level}</span>
                      <input type="number" min={0} step={50000} value={rate.dailyDamage} onChange={(event) => setDamageRates((rates) => rates.map((row) => row.level === rate.level ? { ...row, dailyDamage: Math.max(0, Number(event.target.value) || 0) } : row))} className="w-32 rounded-md border border-[#3282B8]/20 bg-[#0D1418] px-2 py-1.5 text-right font-mono text-white" />
                    </label>
                  ))}
                </div>
                <div className="flex justify-end px-5 pb-5"><button type="button" onClick={() => setDamageRates(DEFAULT_LEVEL_DAMAGE)} className="rounded-lg border border-[#3282B8]/20 px-3 py-1.5 text-xs text-[#BBE1FA]/70 hover:bg-[#1B2B34]">Varsayılan hasar tablosuna dön</button></div>
              </details>


          {strategyResults && selectedStrategy && (
            <>
              <section className="space-y-4 rounded-2xl border border-[#3282B8]/20 bg-[#182329] p-5 sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Prestij optimizasyonu</p>
                    <h2 className="mt-1 text-lg font-bold text-white">1 yıllık strateji karşılaştırması</h2>
                    <p className="mt-1 text-xs text-[#BBE1FA]/55">Aynı görev ve hasar varsayımlarıyla üç prestij planı karşılaştırılır.</p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2 text-xs text-emerald-200">
                    <Trophy className="h-4 w-4" />En yüksek tahmini hasar: {strategyResults.find((row) => row.id === bestStrategyId)?.name}
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  {strategyResults.map((strategy) => {
                    const selected = selectedStrategy.id === strategy.id;
                    const best = bestStrategyId === strategy.id;
                    const difference = strategy.totalDamage - (strategyResults.find((row) => row.id === bestStrategyId)?.totalDamage || 0);
                    return (
                      <button
                        key={strategy.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedStrategyId(strategy.id)}
                        className={`rounded-xl border p-4 text-left transition-colors ${selected ? "bg-[#11191E]" : "bg-[#11191E]/50 hover:bg-[#11191E]"}`}
                        style={{ borderColor: selected ? `${strategy.color}88` : "rgba(50,130,184,0.16)" }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-bold text-white">{strategy.name}</span>
                          {best && <span className="rounded-full border border-emerald-400/20 px-2 py-0.5 text-[10px] text-emerald-200">En yüksek</span>}
                        </div>
                        <p className="mt-1 min-h-8 text-[11px] leading-relaxed text-[#BBE1FA]/50">{strategy.description}</p>
                        <div className="mt-3 border-t border-[#3282B8]/10 pt-3">
                          <p className="text-[10px] uppercase tracking-wide text-[#BBE1FA]/45">Tahmini toplam hasar</p>
                          <p className="mt-0.5 font-mono text-2xl font-bold" style={{ color: strategy.color }}>{compactNumber(strategy.totalDamage)}</p>
                          <p className={`mt-1 text-xs ${difference === 0 ? "text-emerald-300" : "text-[#BBE1FA]/55"}`}>
                            {difference === 0 ? "En yüksek sonuç" : `${compactNumber(Math.abs(difference))} daha düşük`}
                          </p>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-y-2 text-[11px]">
                          <span className="text-[#BBE1FA]/45">Yıl sonu</span><span className="text-right font-mono text-white">Sv. {strategy.endLevel} · P{strategy.endPrestige}</span>
                          <span className="text-[#BBE1FA]/45">Prestij sayısı</span><span className="text-right font-mono text-white">{strategy.prestigesPerformed}</span>
                          <span className="text-[#BBE1FA]/45">50. seviye günleri</span><span className="text-right font-mono text-white">{strategy.daysAtMaxLevel}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#3282B8]/10 pt-3">
                          {strategy.prestigeDates.length ? strategy.prestigeDates.map((entry) => (
                            <span key={`${strategy.id}-${entry.prestige}-${entry.dayIndex}`} className="rounded-md border border-[#3282B8]/15 px-2 py-1 text-[10px] text-[#BBE1FA]/65">P{entry.prestige} · {formatDate(entry.date)}</span>
                          )) : <span className="text-[10px] text-[#BBE1FA]/40">Bu dönemde prestij yok</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-xl border border-[#3282B8]/15 bg-[#11191E]/60 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><BarChart3 className="h-4 w-4 text-cyan-300" />Kümülatif hasar karşılaştırması</div>
                  <div className="h-56 w-full overflow-hidden">
                    <svg viewBox="0 0 1000 240" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Bir yıllık stratejilerin kümülatif hasar çizgileri">
                      {[0, 1, 2, 3].map((line) => <line key={line} x1="24" x2="976" y1={26 + line * 60} y2={26 + line * 60} stroke="rgba(187,225,250,0.10)" strokeDasharray="4 6" />)}
                      {strategyResults.map((strategy) => (
                        <polyline key={strategy.id} fill="none" stroke={strategy.color} strokeWidth={selectedStrategy.id === strategy.id ? 3 : 1.8} strokeOpacity={selectedStrategy.id === strategy.id ? 1 : 0.65} strokeLinejoin="round" strokeLinecap="round" points={damageChartPoints(strategy, Math.max(1, ...strategyResults.map((row) => row.totalDamage)))}>
                          <title>{strategy.name}: {numberFormat.format(Math.round(strategy.totalDamage))} hasar</title>
                        </polyline>
                      ))}
                    </svg>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {strategyResults.map((strategy) => <span key={strategy.id} className="inline-flex items-center gap-1.5 text-[10px] text-[#BBE1FA]/60"><span className="h-2 w-2 rounded-full" style={{ background: strategy.color }} />{strategy.name}</span>)}
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-[#3282B8]/20 bg-[#182329]">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#3282B8]/15 p-5 sm:px-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: selectedStrategy.color }}>Seçili plan</p>
                    <h2 className="mt-1 text-base font-bold text-white">{selectedStrategy.name} · seviye takvimi</h2>
                    <p className="mt-1 text-xs text-[#BBE1FA]/55">Prestij dönemleri çizgiyle ayrılır; her satır seviyeye ulaşılan tarihi gösterir.</p>
                  </div>
                  <div className="text-xs text-cyan-200">Yıl sonu: Prestij {selectedStrategy.endPrestige} · Seviye {selectedStrategy.endLevel}</div>
                </div>
                <div className="max-h-[560px] overflow-auto">
                  {selectedStrategy.timeline.map((event, index) => event.type === "period" ? (
                    <div key={`period-${index}`} className={`flex items-center justify-between gap-3 bg-[#11191E]/75 px-5 py-3 ${index === 0 ? "" : "border-t-2 border-amber-400/35"}`}>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-2 py-1 text-[11px] font-bold tracking-wide text-amber-200">PRESTİJ {event.prestige}</span>
                        <span className="text-xs text-[#BBE1FA]/50">Mevcut döngü · Seviye {event.resetLevel}</span>
                      </div>
                    </div>
                  ) : event.type === "prestige" ? (
                    <div key={`prestige-${index}`} className="flex items-center justify-between gap-3 border-t-2 border-amber-400/40 bg-[#11191E]/75 px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-2 py-1 text-[11px] font-bold tracking-wide text-amber-200">PRESTİJ {event.prestige}</span>
                        <span className="text-xs text-[#BBE1FA]/50">Seviye {event.resetLevel}’e sıfırlandı</span>
                      </div>
                      <span className="shrink-0 text-xs text-[#BBE1FA]/65">{formatDate(event.date)}</span>
                    </div>
                  ) : (
                    <div key={`level-${index}`} className={`flex items-center justify-between border-t border-[#3282B8]/10 px-5 py-2.5 ${event.current ? "bg-cyan-400/[0.04]" : ""}`}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-7 min-w-8 items-center justify-center rounded-md border border-[#3282B8]/20 bg-[#1B2B34] px-2 font-mono text-sm font-bold text-white">{event.level}</span>
                        <span className="text-sm text-[#BBE1FA]/75">Seviye {event.level}</span>
                        {event.current && <span className="rounded-full border border-cyan-400/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-200">Mevcut</span>}
                      </div>
                      <span className={`text-sm ${event.current ? "text-cyan-200" : "text-[#BBE1FA]/75"}`}>{event.date ? formatDate(event.date) : "Şu an"}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-[#3282B8]/15 px-5 py-3 text-[11px] text-[#BBE1FA]/45">
                  Tahmin 365 gündür; gelecek günlük, haftalık ve aylık görevlerin tamamlandığını varsayar. Mevcut görev XP’si ilk güne eklenir.
                </div>
              </section>

              <details className="overflow-hidden rounded-2xl border border-[#3282B8]/20 bg-[#182329]">
                <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-[#BBE1FA]">{selectedStrategy.name} · 365 günlük simülasyon kayıtları</summary>
                <div className="max-h-[520px] overflow-auto border-t border-[#3282B8]/10">
                  <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                    <thead className="sticky top-0 bg-[#141C21] text-[10px] uppercase tracking-wide text-[#BBE1FA]/50">
                      <tr><th className="px-4 py-3">Tarih</th><th className="px-4 py-3">Seviye / Prestij</th><th className="px-4 py-3 text-right">Kazanılan XP</th><th className="px-4 py-3 text-right">Günlük hasar</th><th className="px-4 py-3 text-right">Kümülatif hasar</th><th className="px-4 py-3">Olay</th></tr>
                    </thead>
                    <tbody>{selectedStrategy.days.map((day) => (
                      <tr key={day.dayIndex} className={`border-t border-[#3282B8]/10 ${day.prestigeTriggered ? "bg-amber-400/[0.04]" : ""}`}>
                        <td className="whitespace-nowrap px-4 py-2.5 text-[#BBE1FA]/70">{formatDate(day.date)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-white">{day.startLevel} → {day.endLevel} · P{day.startPrestige} → P{day.endPrestige}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-cyan-200">{numberFormat.format(day.earnedXp)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-emerald-200">{compactNumber(day.dailyDamage)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-white">{compactNumber(day.cumulativeDamage)}</td>
                        <td className="max-w-72 px-4 py-2.5 text-[#BBE1FA]/50">{day.notes.join(" · ") || "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
};
