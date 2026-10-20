import React, { useMemo, useState } from "react";
import { AlertCircle, Calculator, Clock3, LoaderCircle, Sparkles } from "lucide-react";
import { fetchUserLevelingProfile } from "../services/wareraApi";
import {
  levelForXp,
  MISSION_LABELS,
  MISSION_XP,
  MissionKey,
  prestigeXpMultiplier,
  simulateYearlyTimeline,
  totalXpForLevel,
  xpRequiredForLevel,
} from "../utils/levelProgression";

const missionKeys: MissionKey[] = ["daily", "weekly", "monthly"];
const numberFormat = new Intl.NumberFormat("tr-TR");

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(date);
}

export const LevelCalculatorSection: React.FC = () => {
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchUserLevelingProfile>> | null>(null);
  const [completed, setCompleted] = useState<Record<MissionKey, boolean>>({ daily: false, weekly: false, monthly: false });
  const [remaining, setRemaining] = useState<Record<MissionKey, number>>({ ...MISSION_XP });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const multiplier = profile ? prestigeXpMultiplier(profile.leveling.prestigeLevel) : 1;
  const yearlyProjection = useMemo(() => {
    if (!profile) return null;
    return simulateYearlyTimeline(
      profile.leveling.xp,
      profile.leveling.level,
      profile.leveling.prestigeLevel,
      {
        daily: completed.daily ? 0 : remaining.daily,
        weekly: completed.weekly ? 0 : remaining.weekly,
        monthly: completed.monthly ? 0 : remaining.monthly,
      },
    );
  }, [profile, completed, remaining]);

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
            <h1 id="level-calculator-title" className="mt-1 text-xl font-bold text-white sm:text-2xl">Seviye Hesaplayıcı</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#BBE1FA]/65">Oyuncu XP’sini ve görevlerden kalan XP’yi girerek 50. seviyeye kadar tahmini ilerlemeyi görüntüle.</p>
          </div>
        </div>
      </header>

      <form onSubmit={handleLookup} className="rounded-2xl border border-[#3282B8]/20 bg-[#182329] p-5 sm:p-6">
        <label htmlFor="level-user-id" className="mb-2 block text-sm font-semibold text-[#BBE1FA]">WarEra oyuncu ID’si</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="level-user-id"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="Örn. 68305110bbd6e3b4179f0110"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-[#3282B8]/25 bg-[#11191E] px-4 py-3 text-sm text-white outline-none placeholder:text-[#BBE1FA]/35 focus:border-amber-400/60"
          />
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

          {yearlyProjection && (
            <section className="overflow-hidden rounded-2xl border border-[#3282B8]/20 bg-[#182329]">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#3282B8]/15 p-5 sm:px-6">
                <div>
                  <h2 className="text-base font-bold text-white">1 yıllık seviye takvimi</h2>
                  <p className="mt-1 text-xs text-[#BBE1FA]/55">Tahmini ulaşma tarihleri, her prestij dönemine göre gruplanır.</p>
                </div>
                <div className="text-xs text-cyan-200">+{yearlyProjection.earnedPrestiges} prestij · Yıl sonu: Prestij {yearlyProjection.endingPrestigeLevel}, Seviye {yearlyProjection.endingLevel}</div>
              </div>
              <div className="max-h-[620px] overflow-auto">
                {yearlyProjection.events.map((event, index) => event.type === "period" ? (
                  <div key={`prestige-${event.prestigeLevel}-${index}`} className={`flex items-center justify-between gap-3 border-t-2 px-5 py-3 ${index === 0 ? "border-t-0" : "border-cyan-500/35"} bg-[#11191E]/75`}>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[11px] font-bold tracking-wide text-cyan-200">PRESTİJ {event.prestigeLevel}</span>
                      <span className="truncate text-xs text-[#BBE1FA]/55">{event.date ? `Seviye ${event.resetLevel}’e sıfırlandı` : `Mevcut dönem · Seviye ${event.resetLevel}`}</span>
                    </div>
                    {event.date && <span className="shrink-0 text-xs text-[#BBE1FA]/65">{formatDate(event.date)}</span>}
                  </div>
                ) : (
                  <div key={`level-${event.level}-${index}`} className={`flex items-center justify-between border-t border-[#3282B8]/10 px-5 py-3 ${event.current ? "bg-amber-400/[0.05]" : ""}`}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 min-w-8 items-center justify-center rounded-md border border-[#3282B8]/20 bg-[#1B2B34] px-2 font-mono text-sm font-bold text-white">{event.level}</span>
                      <span className="text-sm text-[#BBE1FA]/75">Seviye {event.level}</span>
                      {event.current && <span className="rounded-full border border-amber-400/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">Mevcut</span>}
                    </div>
                    <span className={`text-sm ${event.current ? "text-amber-200" : "text-cyan-200"}`}>{event.date ? formatDate(event.date) : "Şu an"}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-[#3282B8]/15 px-5 py-3 text-[11px] text-[#BBE1FA]/45">
                <Clock3 className="h-3.5 w-3.5 shrink-0" />Tahmin; görevlerin her dönemde tamamlandığını, UTC sıfırlanmalarını ve 50. seviyede hemen prestij yapıldığını varsayar.
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
};
