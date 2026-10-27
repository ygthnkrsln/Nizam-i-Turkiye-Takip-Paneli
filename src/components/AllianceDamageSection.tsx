import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Handshake, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { fetchManagementIntelligence } from "../services/wareraApi";

type AllianceCountry = {
  id: string;
  name: string;
  code: string;
  weeklyDamage: number | null;
  previousWeeklyDamage: number | null;
};
type AllianceDamageData = {
  success: boolean;
  alliance: { id: string | null; name: string };
  countries: AllianceCountry[];
  currentTotal: number;
  previousTotal: number | null;
  currentSnapshotDate: string;
  previousSnapshotDate: string | null;
  previousAvailable: boolean;
  fetchedAt: string;
  note: string;
};

const COLORS = ["#38bdf8", "#34d399", "#fbbf24", "#fb7185", "#a78bfa", "#2dd4bf", "#f97316", "#c084fc"];
const number = (value: number | null | undefined) => Number(value || 0).toLocaleString("tr-TR");
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" }).format(new Date(`${value}T12:00:00`)) : "—";

function CountryDamagePie({ countries }: { countries: AllianceCountry[] }) {
  const total = countries.reduce((sum, country) => sum + Math.max(0, country.weeklyDamage || 0), 0);
  let cursor = 0;
  const gradient = countries.map((country, index) => {
    const share = total ? Math.max(0, country.weeklyDamage || 0) / total * 100 : 0;
    const start = cursor;
    cursor += share;
    return `${COLORS[index % COLORS.length]} ${start}% ${cursor}%`;
  }).join(", ");
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative h-44 w-44 shrink-0 rounded-full border border-white/10" style={{ background: total ? `conic-gradient(${gradient})` : "#26343b" }}>
        <div className="absolute inset-8 flex flex-col items-center justify-center rounded-full bg-[#162026] text-center">
          <span className="text-[10px] uppercase tracking-wider text-[#BBE1FA]/55">İttifak hasarı</span>
          <strong className="mt-1 text-lg text-white">{total ? `${(total / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}M` : "—"}</strong>
        </div>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {countries.map((country, index) => {
          const share = total ? (country.weeklyDamage || 0) / total * 100 : 0;
          return <div key={country.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-[#141C21] px-3 py-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate text-xs text-[#BBE1FA]/75">{country.name}</span>
            <span className="text-xs font-bold text-white">{share.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%</span>
          </div>;
        })}
        {!countries.length && <p className="text-xs text-[#BBE1FA]/50">İttifak ülkesi verisi bulunamadı.</p>}
      </div>
    </div>
  );
}

export const AllianceDamageSection: React.FC = () => {
  const [data, setData] = useState<AllianceDamageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    force ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const result = await fetchManagementIntelligence<AllianceDamageData>("alliance-damage", force);
      if (!result || !Array.isArray(result.countries)) {
        throw new Error("İttifak API yanıtı beklenen ülke listesini içermiyor. Sunucu güncellendikten sonra Yenile ile tekrar deneyin.");
      }
      setData({
        ...result,
        alliance: result.alliance || { id: null, name: "Turkish Union" },
        currentTotal: Number(result.currentTotal) || 0,
        countries: result.countries,
      });
    } catch (err: any) {
      setError(err?.message || "İttifak hasar verileri alınamadı.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const change = useMemo(() => {
    if (data?.previousTotal === null || data?.previousTotal === undefined || data.previousTotal === 0) return null;
    return (data.currentTotal - data.previousTotal) / data.previousTotal * 100;
  }, [data]);
  const barMax = Math.max(1, ...(data?.countries || []).flatMap((country) => [country.weeklyDamage || 0, country.previousWeeklyDamage || 0]));

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 border-b border-[#3282B8]/20 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#3282B8]">TÜRKERA · İTTİFAK</div>
        <h1 className="flex items-center gap-2 text-xl font-black text-white sm:text-2xl"><Handshake className="h-5 w-5 text-amber-300" />İttifak Hasarı</h1>
        <p className="mt-1 text-xs text-[#BBE1FA]/65">TürkEra ülkelerinin ve mevcut ittifak üyelerinin haftalık hasar dağılımı.</p>
      </div>
      <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#3282B8]/30 bg-[#182329] px-3 py-2 text-xs font-semibold text-[#BBE1FA] hover:bg-[#1B2B34] disabled:opacity-50">
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Yenile
      </button>
    </header>

    {error && <div className="rounded-xl border border-rose-500/30 bg-rose-950/25 p-4 text-sm text-rose-200">{error}</div>}
    {loading && !data && <div className="rounded-xl border border-[#3282B8]/20 bg-[#182329] p-5 text-sm text-[#BBE1FA]/70">İttifak verileri yükleniyor…</div>}
    {data && <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-sky-500/25 bg-sky-950/20 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-sky-200/70">İttifak</div><div className="mt-2 text-lg font-black text-white">{data.alliance.name || "Turkish Union"}</div><div className="mt-1 text-xs text-[#BBE1FA]/55">{data.countries.length} ülke</div></div>
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">Bu haftanın hasarı</div><div className="mt-2 text-lg font-black text-white">{number(data.currentTotal)}</div><div className="mt-1 text-xs text-[#BBE1FA]/55">Snapshot: {date(data.currentSnapshotDate)}</div></div>
        <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-amber-200/70">Geçen haftaya göre</div><div className="mt-2 flex items-center gap-1.5 text-lg font-black text-white">{change === null ? "Veri bekleniyor" : <>{change >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-300" /> : <TrendingDown className="h-4 w-4 text-rose-300" />}{change > 0 ? "+" : ""}{change.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%</>}</div><div className="mt-1 text-xs text-[#BBE1FA]/55">{data.previousTotal === null ? "Geçmiş snapshot henüz yok" : `${number(data.previousTotal)} · ${date(data.previousSnapshotDate)}`}</div></div>
      </div>

      <section className="rounded-2xl border border-[#3282B8]/20 bg-[#182329]/90 p-4 sm:p-5">
        <h2 className="mb-4 text-sm font-bold text-white">Hasarın ülkelere dağılımı · Pie chart</h2>
        <CountryDamagePie countries={data.countries} />
      </section>

      <section className="rounded-2xl border border-[#3282B8]/20 bg-[#182329]/90 p-4 sm:p-5">
        <h2 className="mb-1 text-sm font-bold text-white">Ülkelere göre haftalık karşılaştırma</h2>
        <p className="mb-4 text-[11px] text-[#BBE1FA]/50">Mavi: bu hafta · Gri: {data.previousSnapshotDate ? date(data.previousSnapshotDate) : "geçen hafta snapshotı yok"}</p>
        <div className="space-y-4">
          {data.countries.map((country) => <div key={country.id}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="truncate font-semibold text-[#BBE1FA]/80">{country.name}</span><span className="shrink-0 text-white">{number(country.weeklyDamage)}{country.previousWeeklyDamage !== null ? <span className="ml-2 text-[#BBE1FA]/45">/ {number(country.previousWeeklyDamage)}</span> : null}</span></div>
            <div className="space-y-1"><div className="h-2 overflow-hidden rounded-full bg-[#0e171c]"><div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.max(0, (country.weeklyDamage || 0) / barMax * 100)}%` }} /></div><div className="h-1.5 overflow-hidden rounded-full bg-[#0e171c]"><div className="h-full rounded-full bg-slate-500" style={{ width: `${Math.max(0, (country.previousWeeklyDamage || 0) / barMax * 100)}%` }} /></div></div>
          </div>)}
        </div>
      </section>
      <p className="rounded-lg border border-[#3282B8]/15 bg-[#141C21] p-3 text-[11px] leading-relaxed text-[#BBE1FA]/55">{data.note} Veriler: {data.fetchedAt ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(data.fetchedAt)) : "—"}.</p>
    </>}
  </div>;
};
