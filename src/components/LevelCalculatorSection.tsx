import React, { useMemo, useState } from "react";
import { AlertCircle, Calculator, LoaderCircle, Sparkles } from "lucide-react";
import { fetchUserLevelingProfile } from "../services/wareraApi";
import { levelForXp, MISSION_LABELS, MISSION_XP, MissionKey, prestigeXpMultiplier, totalXpForLevel } from "../utils/levelProgression";

const missionKeys: MissionKey[] = ["daily", "weekly", "monthly"];
const numberFormat = new Intl.NumberFormat("tr-TR");

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Istanbul" }).format(date);
}

export const LevelCalculatorSection: React.FC = () => {
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof fetchUserLevelingProfile>> | null>(null);
  const [completed, setCompleted] = useState<Record<MissionKey, boolean>>({ daily: false, weekly: false, monthly: false });
  const [remaining, setRemaining] = useState<Record<MissionKey, number>>({ ...MISSION_XP });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progression = useMemo(() => {
    if (!profile) return [];
    let xp = profile.leveling.xp;
    const levelNow = Math.min(50, Math.max(1, profile.leveling.level));
    const rows: { level: number; xp: number; date: Date | null; current: boolean }[] = [
      { level: levelNow, xp: totalXpForLevel(levelNow), date: null, current: true },
    ];
    const date = new Date();
    for (let day = 0; day < 365 && levelForXp(xp) < 50; day++) {
      const today = new Date(date);
      today.setUTCDate(today.getUTCDate() + day);
      const available = day === 0
        ? missionKeys.reduce((sum, key) => sum + (completed[key] ? 0 : remaining[key]), 0)
        : MISSION_XP.daily
          + (today.getUTCDay() === 1 ? MISSION_XP.weekly : 0)
          + (today.getUTCDate() === 1 ? MISSION_XP.monthly : 0);
      xp += Math.round(available * prestigeXpMultiplier(profile.leveling.prestigeLevel));
      const level = levelForXp(xp);
      while (rows.at(-1)!.level < level) {
        const nextLevel = rows.at(-1)!.level + 1;
        rows.push({ level: nextLevel, xp: totalXpForLevel(nextLevel), date: today, current: false });
      }
    }
    return rows;
  }, [profile, completed, remaining]);

  const handleLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    const id = userId.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    setProfile(null);
    try {
      setProfile(await fetchUserLevelingProfile(id));
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "Oyuncu bilgisi alınamadı.");
    } finally {
      setLoading(false);
    }
  };

  const multiplier = profile ? prestigeXpMultiplier(profile.leveling.prestigeLevel) : 1;

  return (
    <section className="space-y-5" aria-labelledby="level-calculator-title">
      <header className="rounded-2xl border border-cyan-400/20 bg-[#182329] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-2.5 text-cyan-300"><Calculator className="h-5 w-5" /></div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">Araçlar</p>
            <h1 id="level-calculator-title" className="mt-1 text-xl font-bold text-white sm:text-2xl">Seviye Hesaplayıcı</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#BBE1FA]/65">Oyuncu ID’si ve görev durumuna göre mevcut seviyeden 50. seviyeye kadar tahmini ulaşma tarihlerini hesapla.</p>
          </div>
        </div>
      </header>

      <form onSubmit={handleLookup} className="rounded-2xl border border-[#3282B8]/20 bg-[#182329] p-5 sm:p-6">
        <label htmlFor="level-user-id" className="mb-2 block text-sm font-semibold text-[#BBE1FA]">WarEra oyuncu ID’si</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input id="level-user-id" value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Örn. 68305110bbd6e3b4179f0110" autoComplete="off" className="min-w-0 flex-1 rounded-xl border border-[#3282B8]/25 bg-[#11191E] px-4 py-3 text-sm text-white outline-none placeholder:text-[#BBE1FA]/35 focus:border-cyan-400/60" />
          <button type="submit" disabled={loading || !userId.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-5 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}{loading ? "Oyuncu aranıyor..." : "Oyuncuyu getir"}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-rose-300"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
      </form>

      {profile && <>
        <section className="rounded-2xl border border-[#3282B8]/20 bg-[#182329] p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold text-white">{profile.username || "Oyuncu"}</h2><p className="mt-0.5 font-mono text-xs text-[#BBE1FA]/50">{userId.trim()}</p></div><span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200"><Sparkles className="h-3.5 w-3.5" />Prestij {profile.leveling.prestigeLevel} · x{multiplier.toFixed(1)} XP</span></div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[['Mevcut seviye', `${profile.leveling.level} / 50`], ['Toplam XP', numberFormat.format(profile.leveling.xp)], ['XP tablosuna göre seviye', `${levelForXp(profile.leveling.xp)} / 50`]].map(([label, value]) => <div key={label} className="rounded-xl border border-[#3282B8]/15 bg-[#11191E]/70 p-4"><p className="text-xs text-[#BBE1FA]/55">{label}</p><p className="mt-1 font-mono text-2xl font-bold text-white">{value}</p></div>)}
          </div>
        </section>

        <section className="rounded-2xl border border-[#3282B8]/20 bg-[#182329] p-5 sm:p-6">
          <h2 className="text-base font-bold text-white">Görev durumu</h2><p className="mt-1 text-xs text-[#BBE1FA]/55">Mevcut dönemde tamamlananları işaretle; tamamlanmayan görevlerde kalan XP’yi düzenle. Sonraki görev yenilenmelerinin tamamlanacağı varsayılır.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">{missionKeys.map((key) => <div key={key} className="rounded-xl border border-[#3282B8]/15 bg-[#11191E]/70 p-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#BBE1FA]"><input type="checkbox" checked={completed[key]} onChange={(event) => setCompleted((prev) => ({ ...prev, [key]: event.target.checked }))} className="h-4 w-4 accent-cyan-400" />{MISSION_LABELS[key]}</label>
            <div className="mt-3 flex items-center justify-between gap-3"><label htmlFor={`level-mission-${key}`} className="text-xs text-[#BBE1FA]/55">Kalan XP</label><div className="flex items-center gap-2"><input id={`level-mission-${key}`} type="number" min={0} max={MISSION_XP[key]} value={completed[key] ? 0 : remaining[key]} disabled={completed[key]} onChange={(event) => setRemaining((prev) => ({ ...prev, [key]: Math.min(MISSION_XP[key], Math.max(0, Number(event.target.value) || 0)) }))} className="w-24 rounded-lg border border-[#3282B8]/20 bg-[#0D1418] px-2.5 py-1.5 text-right font-mono text-sm text-white disabled:opacity-50" /><span className="text-xs text-[#BBE1FA]/50">XP</span></div></div>
            <p className="mt-2 text-[11px] text-[#BBE1FA]/40">Tam ödül: {numberFormat.format(MISSION_XP[key])} XP</p>
          </div>)}</div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#3282B8]/20 bg-[#182329]">
          <div className="border-b border-[#3282B8]/15 p-5 sm:px-6"><h2 className="text-lg font-bold text-white">50. seviyeye ilerleme tahmini</h2><p className="mt-1 text-xs text-[#BBE1FA]/55">Mevcut görev XP’si bugün eklenir; gelecekteki görevlerin yenilendikçe tamamlandığı varsayılır. Tahmin 365 günle sınırlıdır.</p></div>
          <div className="max-h-[560px] overflow-auto"><table className="w-full min-w-[560px] border-collapse text-left text-sm"><thead className="sticky top-0 bg-[#141C21] text-[10px] uppercase tracking-wide text-[#BBE1FA]/50"><tr><th className="px-5 py-3">Seviye</th><th className="px-5 py-3">Gerekli toplam XP</th><th className="px-5 py-3">Ulaşma tarihi</th></tr></thead><tbody>{progression.map((row) => <tr key={row.level} className={`border-t border-[#3282B8]/10 ${row.current ? "bg-cyan-400/[0.05]" : ""}`}><td className="px-5 py-3 font-bold text-white">{row.level}{row.current && <span className="ml-2 text-[10px] font-medium text-cyan-200">Mevcut seviye</span>}</td><td className="px-5 py-3 font-mono text-[#BBE1FA]/75">{numberFormat.format(row.xp)} XP</td><td className="px-5 py-3 text-cyan-200">{row.current ? "Şu an" : row.date ? formatDate(row.date) : "365 gün içinde ulaşılamıyor"}</td></tr>)}</tbody></table></div>
        </section>
      </>}
    </section>
  );
};
