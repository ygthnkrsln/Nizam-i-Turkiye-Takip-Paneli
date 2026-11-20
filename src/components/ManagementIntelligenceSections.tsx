import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpDown,
  CheckCircle2,
  Copy,
  Clock3,
  Flag,
  Factory,
  Search,
  RefreshCw,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import {
  fetchManagementIntelligence,
  ManagementIntelligenceView,
} from "../services/wareraApi";
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Tone = "good" | "warn" | "bad" | "info";
type AnyRecord = Record<string, any>;

const toneClasses: Record<Tone, string> = {
  good: "border-emerald-500/30 bg-emerald-950/20 text-emerald-200",
  warn: "border-amber-500/30 bg-amber-950/20 text-amber-200",
  bad: "border-rose-500/30 bg-rose-950/20 text-rose-200",
  info: "border-sky-500/30 bg-sky-950/20 text-sky-200",
};

const formatNumber = (value: unknown, digits = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(number);
};

const formatMoney = (value: unknown) => `${formatNumber(value, 0)} ₮`;

const formatDate = (value: unknown) => {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

const turkeyDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

function useManagementView<T extends AnyRecord>(view: ManagementIntelligenceView, queryParams: Record<string, string> = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const queryKey = new URLSearchParams(Object.entries(queryParams).sort(([left], [right]) => left.localeCompare(right))).toString();
  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fetchManagementIntelligence<T>(view, force, Object.fromEntries(new URLSearchParams(queryKey)));
      setData(result);
    } catch (err: any) {
      setError(err?.message || "Veriler yüklenemedi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [view, queryKey]);

  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, refreshing, reload: () => load(true) };
}

function PageHeading({ title, subtitle, onRefresh, refreshing }: { title: string; subtitle: string; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <div className="mb-5 flex flex-col gap-3 border-b border-[#3282B8]/20 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#3282B8]">TÜRKERA · YÖNETİM MODU</div>
        <h1 className="text-xl font-black text-white sm:text-2xl">{title}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#BBE1FA]/65">{subtitle}</p>
      </div>
      {onRefresh && (
        <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[#3282B8]/30 bg-[#182329] px-3 py-2 text-xs font-semibold text-[#BBE1FA] transition hover:border-[#3282B8]/70 hover:bg-[#1B2B34] disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Yenile
        </button>
      )}
    </div>
  );
}

function StatusMessage({ error, loading, note }: { error: string | null; loading: boolean; note?: string }) {
  if (error) return <div className="rounded-xl border border-rose-500/30 bg-rose-950/25 p-4 text-sm text-rose-200">{error}</div>;
  if (loading) return <div className="rounded-xl border border-[#3282B8]/20 bg-[#182329] p-5 text-sm text-[#BBE1FA]/70">Yönetim verileri yükleniyor…</div>;
  if (note) return <div className="rounded-xl border border-[#3282B8]/20 bg-[#182329] p-3 text-xs leading-relaxed text-[#BBE1FA]/70">{note}</div>;
  return null;
}

function MetricCard({ label, value, detail, tone = "info", icon }: { key?: React.Key; label: string; value: React.ReactNode; detail?: React.ReactNode; tone?: Tone; icon?: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider opacity-75">
        <span>{label}</span>{icon}
      </div>
      <div className="mt-2 text-xl font-black text-white">{value}</div>
      {detail && <div className="mt-1 text-[11px] leading-snug opacity-70">{detail}</div>}
    </div>
  );
}

function Panel({ title, subtitle, children, right }: { key?: React.Key; title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-[#3282B8]/20 bg-[#182329]/90 p-4 shadow-lg sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-[#3282B8]/10 pb-3">
        <div><h2 className="text-sm font-bold text-white">{title}</h2>{subtitle && <p className="mt-1 text-[11px] text-[#BBE1FA]/55">{subtitle}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Pill({ children, tone = "info" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${toneClasses[tone]}`}>{children}</span>;
}

const CITIZEN_FILTERS = ["Tümü", "Aktif", "Uykuda", "İnaktif", "Asker", "Ekonomist", "Karma", "Acemi", "Yeni", "Oy verebilen"];
type CitizenSortKey = "country" | "name" | "status" | "level" | "build" | "lastConnection" | "weeklyDamage" | "canVote" | "roles";
type SortDirection = "asc" | "desc";

function CitizenSortHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <th className="pb-2">
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label} sütununa göre sırala${active ? direction === "asc" ? ", artan" : ", azalan" : ""}`}
        aria-sort={active ? direction === "asc" ? "ascending" : "descending" : "none"}
        className={`inline-flex items-center gap-1 text-left transition hover:text-sky-200 ${active ? "text-sky-200" : "text-[#BBE1FA]/55"}`}
      >
        {label}
        <span className="inline-flex w-3 justify-center">
          {active ? direction === "asc" ? "↑" : "↓" : <ArrowUpDown className="h-3 w-3 opacity-60" />}
        </span>
      </button>
    </th>
  );
}

export function ManagementCitizensSection() {
  const [countryFilter, setCountryFilter] = useState("all");
  const { data, error, loading, refreshing, reload } = useManagementView<AnyRecord>("citizens", { country: countryFilter });
  const counts = data?.counts || {};
  const [filter, setFilter] = useState("Tümü");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<CitizenSortKey>("level");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const rows = useMemo(() => (data?.rows || []).filter((row: AnyRecord) => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    const matchesQuery = !query || row.name.toLocaleLowerCase("tr-TR").includes(query);
    const matchesFilter = filter === "Tümü" || (filter === "Yeni" ? row.isNew : filter === "Oy verebilen" ? row.canVote : row.status === filter || row.build === filter);
    return matchesQuery && matchesFilter;
  }), [data, filter, search]);
  const sortedRows = useMemo(() => [...rows].sort((left: AnyRecord, right: AnyRecord) => {
    let result = 0;
    if (sortKey === "country") {
      result = String(left.countryName || "").localeCompare(String(right.countryName || ""), "tr-TR");
    } else if (sortKey === "name") {
      result = String(left.name || "").localeCompare(String(right.name || ""), "tr-TR");
    } else if (sortKey === "status") {
      const order: Record<string, number> = { Aktif: 0, Uykuda: 1, İnaktif: 2, Bilinmiyor: 3 };
      result = (order[String(left.status)] ?? 4) - (order[String(right.status)] ?? 4);
      if (result === 0) result = String(left.status || "").localeCompare(String(right.status || ""), "tr-TR");
    } else if (sortKey === "level") {
      result = (Number(left.level) || 0) - (Number(right.level) || 0);
    } else if (sortKey === "lastConnection") {
      const leftHours = left.hoursSinceConnection;
      const rightHours = right.hoursSinceConnection;
      if (leftHours === null && rightHours !== null) return 1;
      if (rightHours === null && leftHours !== null) return -1;
      result = (Number(leftHours) || 0) - (Number(rightHours) || 0);
    } else if (sortKey === "weeklyDamage") {
      result = (Number(left.weeklyDamage) || 0) - (Number(right.weeklyDamage) || 0);
    } else if (sortKey === "canVote") {
      result = Number(Boolean(left.canVote)) - Number(Boolean(right.canVote));
    } else if (sortKey === "roles") {
      result = String(left.roles?.join(", ") || "").localeCompare(String(right.roles?.join(", ") || ""), "tr-TR");
    } else {
      result = String(left.build || "").localeCompare(String(right.build || ""), "tr-TR");
    }
    return sortDirection === "asc" ? result : -result;
  }), [rows, sortKey, sortDirection]);
  const toggleSort = (key: CitizenSortKey) => {
    if (sortKey === key) setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDirection(key === "level" ? "desc" : "asc");
    }
  };
  return (
    <div className="space-y-4">
      <PageHeading title="Vatandaşlar & Hükümet" subtitle="Türkiye, Azerbaycan ve Kamerun vatandaşlarını birlikte görüntüleyin veya ülke seçerek ayrı filtreleyin." onRefresh={reload} refreshing={refreshing} />
      <div className="flex flex-wrap gap-2 rounded-xl border border-[#3282B8]/15 bg-[#182329] p-2">
        {[{ key: "all", label: "Tümü" }, ...(data?.countries || [{ key: "tr", label: "Türkiye" }, { key: "az", label: "Azerbaycan" }, { key: "cm", label: "Kamerun" }])].map((country: AnyRecord) => (
          <button key={country.key} type="button" onClick={() => setCountryFilter(country.key)} className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${countryFilter === country.key ? "border-sky-400/40 bg-sky-950/40 text-sky-100" : "border-transparent text-[#BBE1FA]/60 hover:bg-[#141C21] hover:text-white"}`}>
            {country.label || country.name}
          </button>
        ))}
      </div>
      <StatusMessage error={error} loading={loading && !data} />
      {data && <>
        {!data.complete && <div className="rounded-lg border border-amber-500/25 bg-amber-950/15 p-3 text-xs text-amber-200">{data.note} Liste, canlı API sayfalama sınırına kadar gösteriliyor.</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Aktif vatandaş" value={`${formatNumber(counts.active)} / ${formatNumber(counts.total)}`} detail={`${formatNumber(counts.sleeping)} uykuda · ${formatNumber(counts.inactive)} inaktif`} tone={counts.active / Math.max(1, counts.total) >= 0.6 ? "good" : "warn"} icon={<Activity className="h-4 w-4" />} />
          <MetricCard label="Yeni vatandaş" value={formatNumber(counts.new)} detail="Son 7 günde ülkeye katılan" tone={counts.new ? "good" : "info"} icon={<Users className="h-4 w-4" />} />
          <MetricCard label="Asker / ekonomist" value={`${formatNumber(counts.soldiers)} / ${formatNumber(counts.economists)}`} detail={`${formatNumber(counts.mixed)} karma · ${formatNumber(counts.novices)} acemi`} tone="info" icon={<Swords className="h-4 w-4" />} />
          <MetricCard label="Oy verebilen" value={formatNumber(counts.voters)} detail={`Seviye ${formatNumber(data.government?.voters?.minLevel)}+`} tone="info" icon={<CheckCircle2 className="h-4 w-4" />} />
        </div>
        <Panel title="Vatandaş aktivite dağılımı" subtitle="Aktiflik sınıflarına göre vatandaşların mevcut durumu.">
          {(() => {
            const activity = [
              { name: "Aktif", value: Number(counts.active) || 0, color: "#34d399" },
              { name: "Uykuda", value: Number(counts.sleeping) || 0, color: "#fbbf24" },
              { name: "İnaktif", value: Number(counts.inactive) || 0, color: "#fb7185" },
            ].filter((item) => item.value > 0);
            return <div className="grid items-center gap-4 sm:grid-cols-[250px_1fr]">
              <div className="relative mx-auto h-60 w-full max-w-[260px]">
                <ResponsiveContainer width="100%" height="100%"><PieChart>
                  <Pie data={activity} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="58%" outerRadius="86%" paddingAngle={activity.length > 1 ? 3 : 0} stroke="#182329" strokeWidth={3}>
                    {activity.map((item) => <Cell key={item.name} fill={item.color} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [formatNumber(value), String(name)]} contentStyle={{ background: "#0b1419", border: "1px solid rgba(56,189,248,.35)", borderRadius: 10, color: "#fff" }} />
                </PieChart></ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-[10px] uppercase tracking-wider text-[#BBE1FA]/50">Vatandaş</span><b className="mt-1 text-2xl text-white">{formatNumber(counts.total)}</b><span className="text-[10px] text-[#BBE1FA]/45">toplam</span></div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {activity.map((item) => <div key={item.name} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#141C21] p-3"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} /><div className="min-w-0"><div className="text-[10px] uppercase tracking-wider text-[#BBE1FA]/50">{item.name}</div><div className="text-lg font-black text-white">{formatNumber(item.value)}</div><div className="text-[10px] text-[#BBE1FA]/45">{(item.value / Math.max(1, Number(counts.total)) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%</div></div></div>)}
              </div>
            </div>;
          })()}
        </Panel>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {(data.governments || []).map((government: AnyRecord) => <Panel key={government.country.key} title={`${government.country.label || government.country.name} · Hükümet`} subtitle={`Parti: ${government.government.party.name}`}>
            <div className="mb-3 rounded-lg border border-[#3282B8]/15 bg-[#141C21] p-3 text-xs text-[#BBE1FA]/75">Uygun seçmen: <b className="text-white">{formatNumber(government.government.voters.eligible)}</b> · Oy verme seviyesi: <b className="text-white">{formatNumber(government.government.voters.minLevel)}+</b></div>
            <div className="space-y-2">
              {(government.government.offices || []).map((person: AnyRecord) => <div key={person.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#141C21] p-2.5"><div><div className="text-[9px] uppercase tracking-wider text-[#BBE1FA]/45">{person.role}</div>{person.url ? <a href={person.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-bold text-white hover:text-sky-300">{person.name} ↗</a> : <div className="mt-1 text-xs font-bold text-white">{person.name}</div>}</div><Pill tone={person.tone as Tone}>{person.status}</Pill></div>)}
              {!government.government.offices?.length && <div className="text-xs text-[#BBE1FA]/55">Görevli bilgisi gelmedi.</div>}
            </div>
            {!!government.government.congress?.length && <div className="mt-3 border-t border-[#3282B8]/10 pt-3"><div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#BBE1FA]/45">Kongre · {government.government.congress.length}</div><div className="flex flex-wrap gap-2">{government.government.congress.slice(0, 12).map((person: AnyRecord) => <a key={person.id} href={person.url} target="_blank" rel="noreferrer" className="rounded-md border border-[#3282B8]/20 bg-[#141C21] px-2 py-1 text-[10px] text-[#BBE1FA]/80 hover:text-white">{person.name}</a>)}</div></div>}
            {!!government.government.countdowns?.length && <div className="mt-3 space-y-1 border-t border-[#3282B8]/10 pt-3">{government.government.countdowns.filter((item: AnyRecord) => item.key.includes("Election")).map((item: AnyRecord) => <div key={item.key} className="flex items-center justify-between gap-2 text-[10px] text-[#BBE1FA]/65"><span className="flex items-center gap-1"><Clock3 className="h-3 w-3 text-amber-300" />{item.name}</span><b className="text-white">{formatNumber(item.hoursLeft, 0)} sa</b></div>)}</div>}
          </Panel>)}
        </div>
        <Panel title="Vatandaş listesi" subtitle={`${formatNumber(counts.profiled)} profil · ${formatNumber(counts.total)} vatandaş kaydı · sıralamak için sütun başlığına tıklayın`} right={<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="İsim ara" className="w-36 rounded-md border border-[#3282B8]/20 bg-[#141C21] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#3282B8]/60 sm:w-48" />}>
          <div className="mb-3 flex flex-wrap gap-1.5">{CITIZEN_FILTERS.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${filter === item ? "border-sky-400/50 bg-sky-950/40 text-sky-100" : "border-[#3282B8]/15 bg-[#141C21] text-[#BBE1FA]/55 hover:text-white"}`}>{item}</button>)}</div>
          <div className="max-h-[560px] overflow-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="sticky top-0 bg-[#182329] text-[10px] uppercase text-[#BBE1FA]/45"><tr>
            <CitizenSortHeader label="Ülke" active={sortKey === "country"} direction={sortDirection} onClick={() => toggleSort("country")} />
            <CitizenSortHeader label="Vatandaş" active={sortKey === "name"} direction={sortDirection} onClick={() => toggleSort("name")} />
            <CitizenSortHeader label="Durum" active={sortKey === "status"} direction={sortDirection} onClick={() => toggleSort("status")} />
            <CitizenSortHeader label="Seviye" active={sortKey === "level"} direction={sortDirection} onClick={() => toggleSort("level")} />
            <CitizenSortHeader label="Profil" active={sortKey === "build"} direction={sortDirection} onClick={() => toggleSort("build")} />
            <CitizenSortHeader label="Son giriş" active={sortKey === "lastConnection"} direction={sortDirection} onClick={() => toggleSort("lastConnection")} />
            <CitizenSortHeader label="Haftalık hasar" active={sortKey === "weeklyDamage"} direction={sortDirection} onClick={() => toggleSort("weeklyDamage")} />
            <CitizenSortHeader label="Seçmen" active={sortKey === "canVote"} direction={sortDirection} onClick={() => toggleSort("canVote")} />
            <CitizenSortHeader label="Görev" active={sortKey === "roles"} direction={sortDirection} onClick={() => toggleSort("roles")} />
          </tr></thead><tbody>{sortedRows.slice(0, 500).map((row: AnyRecord) => <tr key={`${row.countryKey}-${row.id}`} className="border-t border-[#3282B8]/10"><td className="py-2.5 text-[#BBE1FA]/60">{row.countryName}</td><td className="py-2.5 font-semibold text-white">{row.url ? <a href={row.url} target="_blank" rel="noreferrer" className="hover:text-sky-300">{row.name} ↗</a> : row.name}{row.isNew && <span className="ml-2 rounded bg-sky-950/50 px-1.5 py-0.5 text-[9px] text-sky-200">yeni</span>}</td><td className="py-2.5"><Pill tone={row.tone}>{row.status}</Pill></td><td className="py-2.5 text-[#BBE1FA]/75">{formatNumber(row.level)}</td><td className="py-2.5 text-[#BBE1FA]/75">{row.build}</td><td className="py-2.5 text-[#BBE1FA]/55">{row.hoursSinceConnection === null ? "—" : `${formatNumber(row.hoursSinceConnection, 0)} sa önce`}</td><td className="py-2.5 text-[#BBE1FA]/75">{formatNumber(row.weeklyDamage)}</td><td className="py-2.5">{row.canVote ? <span className="text-emerald-300">✓</span> : <span className="text-[#BBE1FA]/30">—</span>}</td><td className="py-2.5 text-[#BBE1FA]/55">{row.roles?.join(", ") || "—"}</td></tr>)}{!sortedRows.length && <tr><td colSpan={9} className="py-5 text-center text-[#BBE1FA]/45">Bu filtrede vatandaş bulunamadı.</td></tr>}</tbody></table></div>
        </Panel>
        <div className="text-[10px] text-[#BBE1FA]/40">Veri: {data.source} · Son güncelleme: {formatDate(data.fetchedAt)} · {data.note}</div>
      </>}
    </div>
  );
}

export function ManagementFactoryAuditSection() {
  const { data, error, loading, refreshing, reload } = useManagementView<AnyRecord>("factory-audit");
  const counts = data?.counts || {};
  const [countryFilter, setCountryFilter] = useState("all");
  const [foreignOnly, setForeignOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [copyStatus, setCopyStatus] = useState<"copied" | "error" | null>(null);
  const rows = useMemo(() => (data?.rows || []).filter((row: AnyRecord) => {
    const matchesCountry = countryFilter === "all" || row.countryKey === countryFilter;
    const query = search.trim().toLocaleLowerCase("tr-TR");
    const matchesSearch = !query || String(row.name || "").toLocaleLowerCase("tr-TR").includes(query);
    return matchesCountry && matchesSearch && (!foreignOnly || Number(row.outsideFactoryCount) > 0);
  }), [data, countryFilter, foreignOnly, search]);
  const countries = data?.countries || [];
  const copyMessage = async () => {
    const reportRows = (data?.rows || []).filter((row: AnyRecord) =>
      Number(row.outsideFactoryCount) > 0 && (countryFilter === "all" || row.countryKey === countryFilter),
    );
    const activeFactoryCount = reportRows.reduce((total: number, row: AnyRecord) => total + Number(row.outsideFactoryCount || 0), 0);
    const names = reportRows.map((row: AnyRecord) => row.name).join("\n") || "Listelenecek vatandaş bulunmuyor.";
    const message = `Vergi kaçıran aktif fabrika sayısı: ${formatNumber(activeFactoryCount)}\n\nDüzenleme yapması gereken oyuncular:\n${names}`;
    try {
      await navigator.clipboard.writeText(message);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  return (
    <div className="space-y-4">
      <PageHeading title="Fabrika Konum Takibi" subtitle="Yalnızca son 24 saatte giriş yapan oyuncuları ve aktif fabrika slotlarını tarayın; kendi ülkesi dışındaki fabrikaları topluca kopyalayın." onRefresh={reload} refreshing={refreshing} />
      <StatusMessage error={error} loading={loading && !data} />
      {data && <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Aktif oyuncu" value={`${formatNumber(counts.activePlayers)} / ${formatNumber(counts.citizens)}`} detail="Son 24 saatte giriş yapan" icon={<Users className="h-4 w-4" />} />
          <MetricCard label="Aktif fabrika" value={formatNumber(counts.factories)} detail="Açık fabrika slotları" tone="good" icon={<Factory className="h-4 w-4" />} />
          <MetricCard label="Kendi ülkesi dışındaki fabrika" value={formatNumber(counts.outsideFactories)} detail={`${formatNumber(counts.citizensWithOutsideFactories)} vatandaşta bulunuyor`} tone={counts.outsideFactories ? "warn" : "good"} icon={<Flag className="h-4 w-4" />} />
          <MetricCard label="Eksik tarama" value={formatNumber(counts.incompleteScans)} detail="Profil veya fabrika sayfalaması tamamlanamadı" tone={counts.incompleteScans ? "warn" : "good"} icon={<Activity className="h-4 w-4" />} />
        </div>
        <Panel title="Fabrika sahipleri" subtitle={`${formatNumber(rows.length)} kişi gösteriliyor · fabrika sayısı vatandaşın kendi ülkesine göre hesaplanır`} right={<div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => void copyMessage()} disabled={loading || !data} className="inline-flex items-center gap-1.5 rounded-md border border-sky-400/30 bg-sky-950/25 px-2.5 py-1.5 text-[10px] font-bold text-sky-100 transition hover:bg-sky-900/40 disabled:opacity-50"><Copy className="h-3.5 w-3.5" />{copyStatus === "copied" ? "Mesaj kopyalandı" : copyStatus === "error" ? "Kopyalama başarısız" : "Mesajı kopyala"}</button><label className="relative block"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#BBE1FA]/40" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Vatandaş ara" className="w-36 rounded-md border border-[#3282B8]/20 bg-[#141C21] py-1.5 pl-8 pr-2.5 text-xs text-white outline-none focus:border-[#3282B8]/60 sm:w-48" /></label></div>}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {[{ key: "all", label: "Türkiye + Kamerun" }, ...countries.map((country: AnyRecord) => ({ key: country.key, label: country.label }))].map((country: AnyRecord) => <button key={country.key} type="button" onClick={() => setCountryFilter(country.key)} className={`rounded-full border px-3 py-1.5 text-[10px] font-bold transition ${countryFilter === country.key ? "border-sky-400/40 bg-sky-950/40 text-sky-100" : "border-[#3282B8]/15 bg-[#141C21] text-[#BBE1FA]/55 hover:text-white"}`}>{country.label}</button>)}
            <button type="button" onClick={() => setForeignOnly((value) => !value)} aria-pressed={foreignOnly} className={`rounded-full border px-3 py-1.5 text-[10px] font-bold transition ${foreignOnly ? "border-amber-400/40 bg-amber-950/30 text-amber-100" : "border-[#3282B8]/15 bg-[#141C21] text-[#BBE1FA]/55 hover:text-white"}`}>{foreignOnly ? "✓ Kendi ülkesi dışında fabrikası olanlar" : "Tüm vatandaşlar"}</button>
          </div>
          <div className="max-h-[620px] overflow-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="sticky top-0 bg-[#182329] text-[10px] uppercase text-[#BBE1FA]/45"><tr><th className="pb-2">Vatandaş</th><th className="pb-2">Vatandaşlık</th><th className="pb-2">Toplam fabrika</th><th className="pb-2">Türkiye dışında</th><th className="pb-2">Fabrika konumları</th><th className="pb-2">Tarama</th></tr></thead><tbody>
            {rows.map((row: AnyRecord) => <tr key={row.id} className="border-t border-[#3282B8]/10 align-top"><td className="py-3 font-semibold text-white"><a href={row.url} target="_blank" rel="noreferrer" className="hover:text-sky-300">{row.name} ↗</a></td><td className="py-3 text-[#BBE1FA]/65">{row.countryName}</td><td className="py-3 text-[#BBE1FA]/80">{formatNumber(row.factoryCount)}</td><td className="py-3"><Pill tone={row.outsideFactoryCount ? "warn" : "good"}>{formatNumber(row.outsideFactoryCount)}</Pill></td><td className="max-w-[440px] py-3 text-[#BBE1FA]/70">{row.outsideFactories?.length || row.unknownLocationCount ? <div className="flex flex-wrap gap-1.5">{row.outsideFactories?.map((factory: AnyRecord) => <span key={factory.id} title={factory.name} className="rounded-md border border-amber-500/20 bg-amber-950/20 px-2 py-1 text-[10px] text-amber-100">{factory.name} · {[factory.regionName, factory.countryName].filter(Boolean).join(", ")}</span>)}{row.unknownLocationCount > 0 && <span className="rounded-md border border-rose-500/20 bg-rose-950/20 px-2 py-1 text-[10px] text-rose-100">{formatNumber(row.unknownLocationCount)} konum çözülemedi</span>}</div> : <span className="text-[#BBE1FA]/35">{row.countryName} dışında fabrika yok</span>}</td><td className="py-3">{row.scanComplete ? <Pill tone="good">Tamam</Pill> : <Pill tone="warn">Eksik</Pill>}</td></tr>)}
            {!rows.length && <tr><td colSpan={6} className="py-8 text-center text-[#BBE1FA]/45">Bu filtrelerde gösterilecek vatandaş bulunamadı.</td></tr>}
          </tbody></table></div>
        </Panel>
        <div className="text-[10px] text-[#BBE1FA]/40">Veri: {data.source} · Son tarama: {formatDate(data.fetchedAt)} · {data.note}</div>
      </>}
    </div>
  );
}

export function CountryWarsSection() {
  const { data, error, loading, refreshing, reload } = useManagementView<AnyRecord>("country-wars");
  const [countryFilter, setCountryFilter] = useState("all");
  const countries = data?.countries || [];
  const filteredWars = (data?.wars || []).filter((war: AnyRecord) => {
    if (countryFilter === "all") return true;
    const target = countries.find((country: AnyRecord) => country.key === countryFilter);
    return Boolean(target && [war.attacker, war.defender].some((side: AnyRecord) => side.mainCountry.id === target.id || side.countries?.some((country: AnyRecord) => country.id === target.id)));
  });
  const formatPercent = (value: unknown) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return `${number > 0 ? "+" : ""}${formatNumber(number, 1)}%`;
  };
  const [rankingCountry, setRankingCountry] = useState("tr");
  const ranking = (data?.playerRankings || []).find((item: AnyRecord) => item.key === rankingCountry);
  const sidePanel = (side: AnyRecord, label: string, color: "rose" | "sky") => (
    <div className={`rounded-xl border p-2 ${color === "rose" ? "border-rose-500/20 bg-rose-950/10" : "border-sky-500/20 bg-sky-950/10"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.06] pb-1.5">
        <div><div className={`text-[9px] font-bold uppercase tracking-[0.18em] ${color === "rose" ? "text-rose-300" : "text-sky-300"}`}>{label}</div><div className="mt-0.5 text-sm font-black text-white">{side.mainCountry.name}</div></div>
        <div className="text-right"><div className="text-[9px] uppercase tracking-wider text-[#BBE1FA]/45">ülke bonusları</div></div>
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-[#BBE1FA]/60"><span>Bu tur hasarı</span><b className="text-white">{formatNumber(side.damage)}</b></div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-[#BBE1FA]/60"><span>Tur puanı</span><b className="text-white">{formatNumber(side.points)}</b></div>
      <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
        {(side.countries || []).map((country: AnyRecord) => <div key={country.id} className="rounded-md border border-white/[0.06] bg-[#11191E]/80 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold text-white">{country.name}</span><span className={`text-[11px] font-black ${country.bonusPercent < 0 ? "text-rose-300" : "text-emerald-300"}`}>{formatPercent(country.bonusPercent)}</span></div>
          <div className="mt-1 flex flex-wrap gap-1">{(country.bonuses || []).map((bonus: AnyRecord, index: number) => <span key={`${bonus.name}-${index}`} className="rounded border border-[#3282B8]/15 bg-[#182329] px-1 py-0.5 text-[8px] text-[#BBE1FA]/65">{bonus.name} {formatPercent(bonus.percent)}</span>)}</div>
        </div>)}
        {!side.countries?.length && <div className="py-2 text-center text-[10px] text-[#BBE1FA]/40">Ülke bonusu bulunamadı.</div>}
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      <PageHeading title="Türkiye & Kamerun Aktif Savaşları" subtitle="Türkiye ve Kamerun’un devam eden savaşlarını, iki taraftaki ülkelerin hasar bonuslarıyla birlikte görüntüleyin." onRefresh={reload} refreshing={refreshing} />
      <StatusMessage error={error} loading={loading && !data} />
      {data && <>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Aktif muharebe" value={formatNumber(data.counts?.wars)} detail="Türkiye veya Kamerun’un katıldığı" icon={<Swords className="h-4 w-4" />} />
          <MetricCard label="Türkiye savaşları" value={formatNumber(data.counts?.turkey)} detail="Savaş, direniş ve devrim" tone="bad" icon={<Flag className="h-4 w-4" />} />
          <MetricCard label="Kamerun savaşları" value={formatNumber(data.counts?.cameroon)} detail="Savaş, direniş ve devrim" tone="warn" icon={<Flag className="h-4 w-4" />} />
        </div>
        <div className="flex flex-wrap gap-2 rounded-xl border border-[#3282B8]/15 bg-[#182329] p-2">
          {[{ key: "all", label: "Türkiye + Kamerun" }, ...countries].map((country: AnyRecord) => <button key={country.key} type="button" onClick={() => setCountryFilter(country.key)} className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${countryFilter === country.key ? "border-sky-400/40 bg-sky-950/40 text-sky-100" : "border-transparent text-[#BBE1FA]/60 hover:bg-[#141C21] hover:text-white"}`}>{country.label}</button>)}
        </div>
        <Panel title="Haftalık oyuncu hasar sıralaması" subtitle="Ülke vatandaşlarının API profillerindeki bu haftaki hasarı, en yüksekten düşüğe." right={<select value={rankingCountry} onChange={(event) => setRankingCountry(event.target.value)} className="rounded-md border border-[#3282B8]/20 bg-[#141C21] px-2 py-1.5 text-xs text-white">{countries.map((country: AnyRecord) => <option key={country.key} value={country.key}>{country.label}</option>)}</select>}>
          <div className="mb-2 flex items-center gap-2 text-[10px] text-[#BBE1FA]/50"><Trophy className="h-3.5 w-3.5 text-amber-300" />{ranking?.profiledCount || 0} / {ranking?.playerCount || 0} oyuncu profili{ranking?.complete ? " · Liste tamamlandı" : " · İlk 2.000 vatandaş tarandı"}</div>
          <div className="max-h-80 overflow-auto rounded-lg border border-white/[0.06]"><table className="w-full min-w-[440px] text-left text-xs"><thead className="sticky top-0 bg-[#141C21] text-[9px] uppercase tracking-wider text-[#BBE1FA]/50"><tr><th className="px-2.5 py-2">#</th><th className="px-2.5 py-2">Oyuncu</th><th className="px-2.5 py-2 text-right">Haftalık hasar</th></tr></thead><tbody>{(ranking?.players || []).map((player: AnyRecord, index: number) => <tr key={player.id || index} className="border-t border-white/[0.05]"><td className="px-2.5 py-2 font-mono text-[#BBE1FA]/40">{index + 1}</td><td className="px-2.5 py-2 font-semibold text-white">{player.url ? <a href={player.url} target="_blank" rel="noreferrer" className="hover:text-sky-300">{player.name} ↗</a> : player.name}</td><td className="px-2.5 py-2 text-right font-mono text-cyan-200">{formatNumber(player.weeklyDamage)}</td></tr>)}{!ranking?.players?.length && <tr><td colSpan={3} className="px-3 py-5 text-center text-[#BBE1FA]/40">Haftalık hasar profili bulunamadı.</td></tr>}</tbody></table></div>
        </Panel>
        {filteredWars.map((war: AnyRecord) => <Panel key={war.id} title={`${war.typeLabel} · ${war.region}`} subtitle={`Tur ${formatNumber(war.round)} / ${formatNumber(war.roundsToWin)} · ${formatDate(war.startedAt)}`} right={war.url && <a href={war.url} target="_blank" rel="noreferrer" className="rounded-md border border-[#3282B8]/20 bg-[#141C21] px-2.5 py-1.5 text-[10px] font-bold text-sky-200 hover:text-white">Savaşı aç ↗</a>}>
          <div className="grid gap-3 xl:grid-cols-2">{sidePanel(war.attacker, "Saldıran taraf", "rose")}{sidePanel(war.defender, "Savunan taraf", "sky")}</div>
        </Panel>)}
        {!filteredWars.length && !loading && <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-5 text-center text-sm text-emerald-200">Seçilen ülkeler için aktif savaş bulunmuyor.</div>}
        <div className="text-[10px] leading-relaxed text-[#BBE1FA]/40">Veri: {data.source} · Güncelleme: {formatDate(data.fetchedAt)} · {data.note}</div>
      </>}
    </div>
  );
}

const COUNTRY_METRICS = [
  { key: "activeCitizenWealth", label: "Aktif vatandaş serveti", money: true },
  { key: "wealth", label: "Ülke serveti", money: true },
  { key: "treasury", label: "Hazine bakiyesi", money: true },
  { key: "population", label: "Nüfus" },
  { key: "activePopulation", label: "Aktif nüfus" },
  { key: "development", label: "Gelişmişlik", digits: 1 },
  { key: "weeklyDamage", label: "Haftalık hasar" },
  { key: "totalDamage", label: "Toplam ülke hasarı" },
  { key: "taxRate", label: "Gelir vergisi", percent: true, digits: 1 },
];

const COUNTRY_SELECTION_KEY = "nizam_country_tracker_selected_v2";
const LEGACY_COUNTRY_SELECTION_KEY = "nizam_country_tracker_selected_v1";
const DEFAULT_COUNTRY_TRACKER_IDS = [
  "6813b6d446e731854c7ac7eb", // Türkiye
  "6813b6d546e731854c7ac8d1", // Azerbaycan
  "6873d0ea1758b40e712b5ef5", // Kamerun
];
const TRACKER_COLORS = ["#54a9e8", "#36c98f", "#f3b94f", "#dd6a76"];

function loadCountryTrackerSelection(): string[] {
  if (typeof window === "undefined") return DEFAULT_COUNTRY_TRACKER_IDS;
  try {
    const saved = localStorage.getItem(COUNTRY_SELECTION_KEY);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.filter((id) => typeof id === "string").slice(0, 4)
        : DEFAULT_COUNTRY_TRACKER_IDS;
    }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_COUNTRY_SELECTION_KEY) || "[]");
    if (Array.isArray(legacy)) {
      const legacyIds = legacy.filter((id) => typeof id === "string").slice(0, 4);
      if (legacyIds.length) return legacyIds;
    }
  } catch {}
  return DEFAULT_COUNTRY_TRACKER_IDS;
}

function countryMetric(snapshot: AnyRecord | undefined, metric: string): number | null {
  const value = Number(snapshot?.[metric]);
  return snapshot?.[metric] === null || snapshot?.[metric] === undefined || !Number.isFinite(value) ? null : value;
}

function indexedChart(snapshots: AnyRecord[], selectedIds: string[], metric: string) {
  if (!snapshots.length) return { points: [], lines: [] as AnyRecord[] };
  const sorted = [...snapshots].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const lines: AnyRecord[] = selectedIds.flatMap((id, index) => {
    const series = sorted.map((snapshot) => {
      const row = (snapshot.countries || []).find((country: AnyRecord) => country.id === id);
      return { date: snapshot.date, value: countryMetric(row, metric) };
    }).filter((item) => item.value !== null) as Array<{ date: string; value: number }>;
    if (!series.length) return [];
    const baseline = series[0].value || 1;
    return [{ id, color: TRACKER_COLORS[index % TRACKER_COLORS.length], values: series.map((point, pointIndex) => ({ ...point, x: series.length < 2 ? 350 : 30 + pointIndex * (640 / (series.length - 1)), y: point.value / baseline * 100 })) }];
  });
  const max = Math.max(110, ...lines.flatMap((line) => line.values.map((point: AnyRecord) => point.y)));
  for (const line of lines) line.points = line.values.map((point: AnyRecord) => `${point.x},${190 - (point.y / max) * 160}`).join(" ");
  return { points: sorted.map((snapshot) => snapshot.date), lines };
}

export function ManagementCountryTrackerSection() {
  const [selectedIds, setSelectedIds] = useState<string[]>(loadCountryTrackerSelection);
  const countryQuery = selectedIds.length ? { countries: [...selectedIds].sort().join(",") } : {};
  const { data, error, loading, refreshing, reload } = useManagementView<AnyRecord>("country-tracker", countryQuery);
  const [snapshots, setSnapshots] = useState<AnyRecord[]>([]);
  const [metric, setMetric] = useState("activeCitizenWealth");
  const [search, setSearch] = useState("");
  useEffect(() => {
    try { localStorage.setItem(COUNTRY_SELECTION_KEY, JSON.stringify(selectedIds)); } catch {}
  }, [selectedIds]);
  useEffect(() => {
    if (!data?.countries) return;
    const current = { date: turkeyDate(), timestamp: Date.now(), countries: data.countries };
    let local: AnyRecord[] = [];
    try { local = JSON.parse(localStorage.getItem("nizam_country_tracker_v1") || "[]"); } catch {}
    const byDate = new Map<string, AnyRecord>();
    for (const snapshot of [...(Array.isArray(data.snapshots) ? data.snapshots : []), ...(Array.isArray(local) ? local : []), current]) {
      if (snapshot?.date && Array.isArray(snapshot?.countries)) byDate.set(String(snapshot.date), snapshot);
    }
    const merged = Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-30);
    setSnapshots(merged);
    try { localStorage.setItem("nizam_country_tracker_v1", JSON.stringify(merged)); } catch {}
    const validIds = selectedIds.filter((id) => data.countries.some((row: AnyRecord) => row.id === id));
    if (validIds.length !== selectedIds.length) {
      const fallbackIds = selectedIds.length && !validIds.length
        ? DEFAULT_COUNTRY_TRACKER_IDS.filter((id) => data.countries.some((row: AnyRecord) => row.id === id))
        : validIds;
      setSelectedIds(fallbackIds);
    }
  }, [data, selectedIds]);
  const countries = data?.countries || [];
  const filteredCountries = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    const rows = !q ? countries : countries.filter((row: AnyRecord) => `${row.name} ${row.code}`.toLocaleLowerCase("tr-TR").includes(q));
    return rows.slice(0, 80);
  }, [countries, search]);
  const chart = useMemo(() => indexedChart(snapshots, selectedIds, metric), [snapshots, selectedIds, metric]);
  const chartRows = useMemo(() => chart.points.map((point: string) => {
    const row: AnyRecord = { date: point };
    chart.lines.forEach((line: AnyRecord) => {
      const sample = line.values.find((value: AnyRecord) => value.date === point);
      const baselineValue = Number(line.values[0]?.value || 0);
      row[line.id] = sample && baselineValue ? sample.value / baselineValue * 100 : null;
    });
    return row;
  }), [chart]);
  const metricInfo = COUNTRY_METRICS.find((item) => item.key === metric) || COUNTRY_METRICS[0];
  const toggleCountry = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length >= 4 ? current : [...current, id]);
  const selectedCountries = selectedIds.map((id) => countries.find((row: AnyRecord) => row.id === id)).filter(Boolean) as AnyRecord[];
  const selectedActiveCitizenCount = selectedCountries.reduce((sum, country) => sum + Number(country.activeCitizenCount || 0), 0);
  const selectedActiveCitizenWealth = selectedCountries.reduce((sum, country) => sum + Number(country.activeCitizenWealth || 0), 0);
  const baseline = snapshots[0];
  return (
    <div className="space-y-4">
      <PageHeading title="Ülke Takibi & Karşılaştırma" subtitle="Seçili ülkelerin aktif vatandaş sayısı ve toplam serveti ile ülke göstergelerini günlük snapshot’lar üzerinden karşılaştır." onRefresh={reload} refreshing={refreshing} />
      <StatusMessage error={error} loading={loading && !data} />
      {data && <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard label="Takip edilen ülke" value={formatNumber(countries.length)} detail="WarEra ülke listesi" tone="info" icon={<Flag className="h-4 w-4" />} />
          <MetricCard label="Kayıtlı günlük geçmiş" value={`${snapshots.length} / 30`} detail={snapshots.length < 2 ? "Günlük cron yeni noktalar ekleyecek" : `${snapshots[0]?.date} — ${snapshots[snapshots.length - 1]?.date}`} tone={snapshots.length >= 2 ? "good" : "warn"} icon={<Activity className="h-4 w-4" />} />
          <MetricCard label="Karşılaştırma" value={`${selectedIds.length} / 4`} detail="Grafikte en fazla dört ülke" tone="info" icon={<Users className="h-4 w-4" />} />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_2fr]">
          <Panel title="Ülke seçimi" subtitle="Türkiye, Azerbaycan ve Kamerun varsayılan olarak seçilidir. En fazla dört ülke seçebilirsin." right={<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ülke ara" className="w-32 rounded-md border border-[#3282B8]/20 bg-[#141C21] px-2 py-1.5 text-xs text-white outline-none focus:border-[#3282B8]/60" />}>
            <div className="max-h-[250px] space-y-1 overflow-auto pr-1">{filteredCountries.map((country: AnyRecord) => <label key={country.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-[#141C21]"><input type="checkbox" checked={selectedIds.includes(country.id)} disabled={!selectedIds.includes(country.id) && selectedIds.length >= 4} onChange={() => toggleCountry(country.id)} className="accent-sky-400"/><span className="min-w-0 flex-1 truncate text-[#BBE1FA]/80">{country.name}</span><span className="text-[9px] text-[#BBE1FA]/35">{country.code}</span></label>)}</div>
          </Panel>
          <Panel title="Günlük değişim" subtitle="Grafik, ilk görülen günün değerini 100 kabul ederek göreli değişimi gösterir." right={<select value={metric} onChange={(event) => setMetric(event.target.value)} className="rounded-md border border-[#3282B8]/20 bg-[#141C21] px-2 py-1.5 text-xs text-white">{COUNTRY_METRICS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>}>
            {chart.lines.length < 1 ? <div className="flex h-48 items-center justify-center text-xs text-[#BBE1FA]/50">Grafik için ülke seç.</div> : <>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartRows} margin={{ top: 8, right: 18, bottom: 2, left: 2 }}>
                    <CartesianGrid stroke="#9fb3c8" strokeOpacity={0.16} strokeDasharray="3 5" />
                    <XAxis dataKey="date" tickFormatter={(value) => String(value).slice(5)} tick={{ fill: "#BBE1FA", fillOpacity: 0.55, fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={18} />
                    <YAxis tickFormatter={(value) => `${Math.round(Number(value))}%`} tick={{ fill: "#BBE1FA", fillOpacity: 0.55, fontSize: 9 }} axisLine={false} tickLine={false} width={46} />
                    <Tooltip labelFormatter={(value) => `Tarih: ${value}`} formatter={(value, name) => [`${Number(value).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`, countries.find((country: AnyRecord) => country.id === name)?.name || String(name)]} contentStyle={{ background: "#0b1419", border: "1px solid rgba(56,189,248,.35)", borderRadius: 10, color: "#fff" }} labelStyle={{ color: "#fff", fontWeight: 700 }} />
                    {chart.lines.map((line: AnyRecord) => <Line key={line.id} type="monotone" dataKey={line.id} name={countries.find((country: AnyRecord) => country.id === line.id)?.name || line.id} stroke={line.color} strokeWidth={2.5} dot={{ r: 2.5, fill: line.color, strokeWidth: 0 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 1 }} connectNulls />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">{chart.lines.map((line: AnyRecord) => <div key={line.id} className="flex items-center gap-1.5 text-[10px] text-[#BBE1FA]/65"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />{countries.find((row: AnyRecord) => row.id === line.id)?.name || line.id}</div>)}</div>
            </>}
          </Panel>
        </div>
        <Panel title={`${metricInfo.label} karşılaştırması`} subtitle={baseline ? `Değişim, kayıtlı ilk gün (${baseline.date}) ile bugünün değerini karşılaştırır.` : "Henüz günlük geçmiş bulunmuyor."}>
          <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="text-[10px] uppercase text-[#BBE1FA]/45"><tr><th className="pb-2">Ülke</th><th className="pb-2">Güncel</th><th className="pb-2">İlk kayıt</th><th className="pb-2">Değişim</th><th className="pb-2">Gelir vergisi</th></tr></thead><tbody>{selectedCountries.map((country) => {
            const base = baseline?.countries?.find((row: AnyRecord) => row.id === country.id);
            const current = countryMetric(country, metric);
            const first = countryMetric(base, metric);
            const delta = current !== null && first !== null ? current - first : null;
            return <tr key={country.id} className="border-t border-[#3282B8]/10"><td className="py-2.5 font-semibold text-white">{country.name}</td><td className="py-2.5 text-[#BBE1FA]/80">{current === null ? "—" : metricInfo.percent ? `%${formatNumber(current, 1)}` : metricInfo.money ? formatMoney(current) : formatNumber(current, metricInfo.digits || 0)}</td><td className="py-2.5 text-[#BBE1FA]/50">{first === null ? "—" : metricInfo.percent ? `%${formatNumber(first, 1)}` : metricInfo.money ? formatMoney(first) : formatNumber(first, metricInfo.digits || 0)}</td><td className={`py-2.5 font-semibold ${delta === null ? "text-[#BBE1FA]/40" : delta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{delta === null ? "—" : `${delta >= 0 ? "+" : ""}${metricInfo.percent ? `%${formatNumber(delta, 1)}` : metricInfo.money ? formatMoney(delta) : formatNumber(delta, metricInfo.digits || 0)}`}</td><td className="py-2.5 text-[#BBE1FA]/65">{country.taxRate === null ? "—" : `%${formatNumber(country.taxRate, 1)}`}</td></tr>;
          })}{!selectedCountries.length && <tr><td colSpan={5} className="py-4 text-center text-[#BBE1FA]/45">Karşılaştırmak için ülke seç.</td></tr>}</tbody></table></div>
        </Panel>
        <Panel title="Seçili ülkelerin aktif vatandaş serveti" subtitle="Son 24 saatte giriş yapmış tüm vatandaşların bireysel servet sıralama değerleri toplanır.">
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetricCard label="Seçili aktif vatandaş serveti" value={formatMoney(selectedActiveCitizenWealth)} detail="Seçili ülkelerin toplamı" tone="info" />
            <MetricCard label="Aktif vatandaş profili" value={formatNumber(selectedActiveCitizenCount)} detail="Son 24 saat içinde giriş yapmış" tone="good" />
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="text-[10px] uppercase text-[#BBE1FA]/45"><tr><th className="pb-2">Ülke</th><th className="pb-2">Aktif vatandaş</th><th className="pb-2">Güncel servet toplamı</th><th className="pb-2">İlk snapshot</th><th className="pb-2">Değişim</th><th className="pb-2">Profil kapsamı</th></tr></thead><tbody>{selectedCountries.map((country) => {
            const first = baseline?.countries?.find((row: AnyRecord) => row.id === country.id);
            const wealth = countryMetric(country, "activeCitizenWealth");
            const firstWealth = countryMetric(first, "activeCitizenWealth");
            const delta = wealth !== null && firstWealth !== null ? wealth - firstWealth : null;
            const profiled = Number(country.activeCitizenProfiledCount || 0);
            const roster = Number(country.activeCitizenRosterCount || 0);
            const complete = country.activeCitizenWealthComplete === true;
            return <tr key={country.id} className="border-t border-[#3282B8]/10"><td className="py-2.5 font-semibold text-white">{country.name}</td><td className="py-2.5 text-[#BBE1FA]/75">{country.activeCitizenCount === undefined ? "—" : formatNumber(country.activeCitizenCount)}</td><td className="py-2.5 font-semibold text-emerald-200">{wealth === null ? "—" : formatMoney(wealth)}</td><td className="py-2.5 text-[#BBE1FA]/55">{firstWealth === null ? "—" : formatMoney(firstWealth)}</td><td className={`py-2.5 font-semibold ${delta === null ? "text-[#BBE1FA]/40" : delta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{delta === null ? "—" : `${delta >= 0 ? "+" : ""}${formatMoney(delta)}`}</td><td className="py-2.5"><Pill tone={complete ? "good" : "warn"}>{complete ? `${formatNumber(profiled)} / ${formatNumber(roster)} tam` : `${formatNumber(profiled)} / ${formatNumber(roster)} kısmi`}</Pill></td></tr>;
          })}{!selectedCountries.length && <tr><td colSpan={6} className="py-4 text-center text-[#BBE1FA]/45">Aktif vatandaş servetini izlemek için ülke seç.</td></tr>}</tbody></table></div>
        </Panel>
        <div className="rounded-lg border border-[#3282B8]/15 bg-[#141C21] p-3 text-[10px] leading-relaxed text-[#BBE1FA]/50">Kaynak: {data.source}. İlk kullanımda geçmiş yalnızca bugünden itibaren oluşur. Günlük tarihî kayıtlar mevcut hasar cron’unda tutulur; tarayıcı geçmişi de bu cihazda yedeklenir. {data.note}</div>
      </>}
    </div>
  );
}
