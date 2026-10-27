import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Handshake, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { fetchManagementIntelligence } from "../services/wareraApi";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AllianceCountry = {
  id: string;
  name: string;
  code: string;
  weeklyDamage: number | null;
  previousWeeklyDamage: number | null;
  memberCountries?: string[];
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

const number = (value: number | null | undefined) => Number(value || 0).toLocaleString("tr-TR");
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" }).format(new Date(`${value}T12:00:00`)) : "—";

function CountryDamageBarChart({
  countries,
  previousWeek = false,
  snapshotDate,
}: {
  countries: AllianceCountry[];
  previousWeek?: boolean;
  snapshotDate?: string | null;
}) {
  const valueKey = previousWeek ? "previousWeeklyDamage" : "weeklyDamage";
  const chartData = countries
    .filter((country) => country[valueKey] !== null && country[valueKey] !== undefined)
    .map((country) => ({ ...country, chartDamage: country[valueKey] || 0 }))
    .sort((left, right) => right.chartDamage - left.chartDamage);
  const chartHeight = Math.max(260, chartData.length * 48 + 54);
  const barColor = previousWeek ? "#f4c76b" : "#2dd4bf";
  const periodLabel = previousWeek ? "Geçen hafta" : "Bu hafta";

  return (
    <section className="rounded-2xl border border-[#3282B8]/20 bg-[#182329]/90 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white">{periodLabel} ülke hasarları</h2>
          <p className="mt-1 text-[11px] text-[#BBE1FA]/50">{snapshotDate ? `Snapshot: ${date(snapshotDate)}` : "Bu dönem için kayıtlı snapshot yok"} · En yüksek hasardan düşüğe</p>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-[10px] font-bold" style={{ color: barColor, borderColor: `${barColor}55`, backgroundColor: `${barColor}12` }}>{periodLabel}</span>
      </div>
      {!chartData.length ? (
        <div className="rounded-xl border border-white/[0.06] bg-[#10191e] px-4 py-8 text-center text-xs text-[#BBE1FA]/55">{previousWeek ? "Geçen haftaya ait ülke snapshotı henüz bulunmuyor." : "İttifak ülke hasar verisi bulunamadı."}</div>
      ) : (
        <div className="w-full" style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 6, right: 22, bottom: 8, left: 4 }} barCategoryGap="34%">
              <CartesianGrid stroke="#9fb3c8" strokeOpacity={0.2} strokeDasharray="3 5" horizontal={false} />
              <XAxis type="number" tickFormatter={(value) => `${(Number(value) / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}M`} tick={{ fill: "#cbd5e1", fontSize: 10 }} axisLine={{ stroke: "#64748b", strokeOpacity: 0.45 }} tickLine={false} />
              <YAxis type="category" dataKey="name" width={128} tick={{ fill: "#f1f5f9", fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "#ffffff", fillOpacity: 0.07 }}
                content={({ active, payload }) => {
                  const country = payload?.[0]?.payload as (AllianceCountry & { chartDamage: number }) | undefined;
                  if (!active || !country) return null;
                  return <div className="rounded-xl border border-white/15 bg-[#081116] px-3.5 py-2.5 shadow-2xl">
                    <div className="text-xs font-bold text-white">{country.name}</div>
                    {country.memberCountries?.length ? <div className="mt-0.5 text-[10px] text-slate-300">{country.memberCountries.join(" · ")}</div> : null}
                    <div className="mt-1.5 text-sm font-black tabular-nums" style={{ color: barColor }}>{number(country.chartDamage)} hasar</div>
                  </div>;
                }}
              />
              <Bar dataKey="chartDamage" name={`${periodLabel} hasarı`} fill={barColor} radius={[0, 6, 6, 0]} maxBarSize={24} activeBar={{ fill: barColor, stroke: "#ffffff", strokeOpacity: 0.45, strokeWidth: 1 }} isAnimationActive />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
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
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">Turkish Union · Bu hafta</div><div className="mt-2 text-lg font-black text-white">{number(data.currentTotal)}</div><div className="mt-1 text-xs text-[#BBE1FA]/55">Snapshot: {date(data.currentSnapshotDate)}</div></div>
        <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-amber-200/70">Turkish Union · Geçen haftaya göre</div><div className="mt-2 flex items-center gap-1.5 text-lg font-black text-white">{change === null ? "Veri bekleniyor" : <>{change >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-300" /> : <TrendingDown className="h-4 w-4 text-rose-300" />}{change > 0 ? "+" : ""}{change.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%</>}</div><div className="mt-1 text-xs text-[#BBE1FA]/55">{data.previousTotal === null ? "Geçmiş snapshot henüz yok" : `${number(data.previousTotal)} · ${date(data.previousSnapshotDate)}`}</div></div>
      </div>

      <div className="space-y-5">
        <CountryDamageBarChart countries={data.countries} snapshotDate={data.currentSnapshotDate} />
        <CountryDamageBarChart countries={data.countries} previousWeek snapshotDate={data.previousSnapshotDate} />
      </div>
      <p className="rounded-lg border border-[#3282B8]/15 bg-[#141C21] p-3 text-[11px] leading-relaxed text-[#BBE1FA]/55">{data.note} Veriler: {data.fetchedAt ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(data.fetchedAt)) : "—"}.</p>
    </>}
  </div>;
};
