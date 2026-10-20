import React, { useMemo, useState } from "react";
import { AlertCircle, Calculator, Check, Clock3, LoaderCircle, Sparkles } from "lucide-react";
import { fetchUserLevelingProfile } from "../services/wareraApi";
import {
  levelForXp,
  MISSION_LABELS,
  MISSION_XP,
  MissionKey,
  prestigeXpMultiplier,
  simulateLevelMilestones,
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
  const milestones = useMemo(() => {
    if (!profile) return [];
    return simulateLevelMilestones(
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

          <section className="overflow-hidden rounded-2xl border border-[#3282B8]/20 bg-[#182329]">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#3282B8]/15 p-5 sm:px-6">
              <div>
                <h2 className="text-base font-bold text-white">50. seviyeye kadar tahmin</h2>
                <p className="mt-1 text-xs text-[#BBE1FA]/55">Gelecek görev ödüllerinin tamamlandığı ve UTC sıfırlanmalarının izlendiği varsayılır.</p>
              </div>
              <div className="inline-flex items-center gap-1.5 text-xs text-[#BBE1FA]/55"><Clock3 className="h-3.5 w-3.5" />Mevcut görev XP’si bugün eklenir</div>
            </div>
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-[#141C21] text-[11px] uppercase tracking-wide text-[#BBE1FA]/50">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Seviye</th>
                    <th className="px-5 py-3 font-semibold">Gerekli toplam XP</th>
                    <th className="px-5 py-3 font-semibold">Ulaşma durumu / tarihi</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((milestone) => (
                    <tr key={milestone.level} className={`border-t border-[#3282B8]/10 ${milestone.status === "current" ? "bg-amber-400/[0.06]" : ""}`}>
                      <td className="px-5 py-2.5 font-mono font-semibold text-white">{milestone.level}</td>
                      <td className="px-5 py-2.5 font-mono text-[#BBE1FA]/65">{numberFormat.format(milestone.requiredXp)} XP</td>
                      <td className="px-5 py-2.5">
                        {milestone.status === "reached" ? <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300"><Check className="h-3.5 w-3.5" />Ulaşıldı</span>
                          : milestone.status === "current" ? <span className="text-xs font-semibold text-amber-200">Mevcut seviye</span>
                            : milestone.date ? <span className="text-xs text-cyan-200">{formatDate(milestone.date)}</span>
                              : <span className="text-xs text-[#BBE1FA]/40">Hesaplanamadı</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
};
