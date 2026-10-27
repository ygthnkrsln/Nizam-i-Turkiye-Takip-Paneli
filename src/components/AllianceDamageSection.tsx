import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Handshake, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { fetchManagementIntelligence } from "../services/wareraApi";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
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

const COLORS = ["#f4c76b", "#38bdf8", "#34d399", "#fb7185", "#a78bfa", "#2dd4bf", "#f97316", "#c084fc"];
const number = (value: number | null | undefined) => Number(value || 0).toLocaleString("tr-TR");
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" }).format(new Date(`${value}T12:00:00`)) : "—";

function CountryDamagePie({ countries }: { countries: AllianceCountry[] }) {
  const total = countries.reduce((sum, country) => sum + Math.max(0, country.weeklyDamage || 0), 0);
  const chartData = countries
    .map((country) => ({ ...country, value: Math.max(0, country.weeklyDamage || 0) }))
    .filter((country) => country.value > 0);
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[minmax(270px,0.9fr)_1.1fr]">
      <div className="relative mx-auto h-[290px] w-full max-w-[330px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="62%" outerRadius="88%" paddingAngle={chartData.length > 1 ? 3 : 0} stroke="#182329" strokeWidth={3} isAnimationActive>
              {chartData.map((country) => <Cell key={country.id} fill={COLORS[countries.findIndex((item) => item.id === country.id) % COLORS.length]} />)}
            </Pie>
            <Tooltip
              formatter={(value) => [`${number(Number(value))} hasar`, "Haftalık hasar"]}
              contentStyle={{ background: "#10191e", border: "1px solid rgba(56,189,248,.25)", borderRadius: 12, color: "#fff", boxShadow: "0 12px 32px rgba(0,0,0,.35)" }}
              itemStyle={{ color: "#e2e8f0", fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#BBE1FA]/50">İttifak hasarı</span>
          <strong className="mt-1 text-2xl font-black tabular-nums text-white">{total ? `${(total / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}M` : "—"}</strong>
          <span className="mt-1 text-[10px] text-[#BBE1FA]/40">son 7 gün</span>
        </div>
      </div>
      <div className="space-y-2">
        {chartData.map((country) => {
          const index = countries.findIndex((item) => item.id === country.id);
          const share = total ? country.value / total * 100 : 0;
          return <div key={country.id} className="group flex items-center gap-3 rounded-xl border border-white/[0.045] bg-[#141C21]/75 px-3.5 py-3 transition hover:border-white/10 hover:bg-[#141C21]">
          <span className="h-3 w-3 shrink-0 rounded-full ring-4 ring-white/[0.035]" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{country.name}</div>
            {country.memberCountries?.length ? <div className="mt-0.5 truncate text-[10px] text-[#BBE1FA]/45">{country.memberCountries.join(" · ")}</div> : null}
          </div>
          <div className="text-right">
            <div className="text-sm font-bold tabular-nums text-white">{number(country.value)}</div>
            <div className="text-[10px] font-semibold tabular-nums text-[#BBE1FA]/50">{share.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%</div>
          </div>
        </div>})}
        {!chartData.length && <p className="rounded-xl border border-white/[0.05] bg-[#141C21]/70 p-4 text-xs text-[#BBE1FA]/50">Grafik için ittifak hasar verisi bulunamadı.</p>}
        {total > 0 && <p className="pt-1 text-[10px] text-[#BBE1FA]/40">Dilim büyüklüğü ülkelerin son 7 günlük hasar payını gösterir.</p>}
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
  const comparisonChartHeight = Math.max(340, (data?.countries.length || 0) * 54);

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

      <section className="rounded-2xl border border-[#3282B8]/20 bg-[#182329]/90 p-4 sm:p-5">
        <h2 className="mb-4 text-sm font-bold text-white">Haftalık hasar payları</h2>
        <CountryDamagePie countries={data.countries} />
      </section>

      <section className="rounded-2xl border border-[#3282B8]/20 bg-[#182329]/90 p-4 sm:p-5">
        <h2 className="mb-1 text-sm font-bold text-white">Ülkelere göre haftalık karşılaştırma</h2>
        <p className="mb-4 text-[11px] text-[#BBE1FA]/50">Bu hafta ve {data.previousSnapshotDate ? date(data.previousSnapshotDate) : "geçen hafta snapshotı yok"} karşılaştırması</p>
        <div className="w-full" style={{ height: comparisonChartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.countries} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 8 }} barCategoryGap="28%">
              <CartesianGrid stroke="#94a3b8" strokeOpacity={0.12} strokeDasharray="3 5" horizontal={false} />
              <XAxis type="number" tickFormatter={(value) => `${(Number(value) / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}M`} tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={112} tick={{ fill: "#dbeafe", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value, name) => [`${number(Number(value))} hasar`, String(name)]}
                contentStyle={{ background: "#10191e", border: "1px solid rgba(56,189,248,.25)", borderRadius: 12, color: "#fff", boxShadow: "0 12px 32px rgba(0,0,0,.35)" }}
                labelStyle={{ color: "#fff", fontWeight: 700, marginBottom: 6 }}
                itemStyle={{ color: "#e2e8f0", fontSize: 12 }}
              />
              <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 11, paddingTop: 8 }} />
              <Bar dataKey="weeklyDamage" name="Bu hafta" fill="#38bdf8" radius={[0, 5, 5, 0]} maxBarSize={18} />
              <Bar dataKey="previousWeeklyDamage" name="Geçen hafta" fill="#64748b" radius={[0, 5, 5, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <p className="rounded-lg border border-[#3282B8]/15 bg-[#141C21] p-3 text-[11px] leading-relaxed text-[#BBE1FA]/55">{data.note} Veriler: {data.fetchedAt ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(data.fetchedAt)) : "—"}.</p>
    </>}
  </div>;
};
