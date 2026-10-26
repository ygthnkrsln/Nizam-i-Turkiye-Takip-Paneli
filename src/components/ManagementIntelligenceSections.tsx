import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Coins,
  Flag,
  Landmark,
  RefreshCw,
  Shield,
  Swords,
  Users,
} from "lucide-react";
import {
  fetchManagementIntelligence,
  fetchManagementTreasury,
  ManagementIntelligenceView,
} from "../services/wareraApi";

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

function useManagementView<T extends AnyRecord>(view: ManagementIntelligenceView) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fetchManagementIntelligence<T>(view, force);
      setData(result);
    } catch (err: any) {
      setError(err?.message || "Veriler yüklenemedi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [view]);

  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, refreshing, reload: () => load(true) };
}

function PageHeading({ title, subtitle, onRefresh, refreshing }: { title: string; subtitle: string; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <div className="mb-5 flex flex-col gap-3 border-b border-[#3282B8]/20 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#3282B8]">NİZAM-I TÜRKİYE · YÖNETİM MODU</div>
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

function MetricCard({ label, value, detail, tone = "info", icon }: { label: string; value: React.ReactNode; detail?: React.ReactNode; tone?: Tone; icon?: React.ReactNode }) {
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

function Panel({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
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

function ActionList({ items }: { items: AnyRecord[] }) {
  if (!items?.length) return <div className="rounded-lg border border-emerald-500/15 bg-emerald-950/10 p-3 text-xs text-emerald-200/80">Şu an için öncelikli bir işlem görünmüyor.</div>;
  return <div className="space-y-2">{items.map((item, index) => (
    <div key={`${item.domain}-${index}`} className={`flex gap-3 rounded-lg border p-3 ${toneClasses[(item.tone || "info") as Tone] || toneClasses.info}`}>
      <span className="mt-0.5 text-[10px] font-black opacity-65">{String(index + 1).padStart(2, "0")}</span>
      <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-wider opacity-65">{item.domain}</div><p className="mt-0.5 text-xs leading-relaxed">{item.text}</p></div>
    </div>
  )}</div>;
}

function BattleCard({ battle }: { battle: AnyRecord }) {
  const total = Math.max(1, Number(battle.pointsOurs || 0) + Number(battle.pointsTheirs || 0));
  const oursPct = Math.max(0, Math.min(100, (Number(battle.pointsOurs || 0) / total) * 100));
  return (
    <article className="rounded-xl border border-[#3282B8]/20 bg-[#141C21] p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><div className="text-sm font-bold text-white">{battle.region}</div><div className="mt-1 text-[11px] text-[#BBE1FA]/55">{battle.typeLabel} · {battle.sideLabel} · rakip {battle.opponent}{battle.allied ? " · müttefik cephesi" : ""}</div></div>
        <Pill tone={battle.tone}>{battle.state}</Pill>
      </div>
      <div className="mt-3 flex justify-between gap-2 text-[11px]"><span>Bizim taraf <b className="text-white">{formatNumber(battle.pointsOurs)}</b></span><span>Tur {battle.round || "—"} · {battle.roundsOurs}-{battle.roundsTheirs}</span><span>Rakip <b className="text-white">{formatNumber(battle.pointsTheirs)}</b></span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-rose-950/60"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${oursPct}%` }} /></div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-[10px] text-[#BBE1FA]/50"><span>Hasar {formatNumber(battle.damageOurs)} · {formatNumber(battle.damageTheirs)}</span><span>{battle.startedAt ? `Başlangıç ${formatDate(battle.startedAt)}` : ""}</span></div>
      {battle.url && <a href={battle.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] font-semibold text-sky-300 hover:text-sky-200">WarEra muharebesini aç ↗</a>}
    </article>
  );
}

export function ManagementDailyDashboardSection() {
  const { data, error, loading, refreshing, reload } = useManagementView<AnyRecord>("daily-dashboard");
  const [treasury, setTreasury] = useState<AnyRecord | null>(null);
  useEffect(() => {
    let alive = true;
    fetchManagementTreasury().then((result) => { if (alive) setTreasury(result); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return (
    <div className="space-y-4">
      <PageHeading title="Günlük Yönetim Özeti" subtitle="Savaş, vatandaşlar, hükümet takvimi ve ülke göstergelerini tek ekranda toplayan günlük kontrol merkezi." onRefresh={reload} refreshing={refreshing} />
      <StatusMessage error={error} loading={loading && !data} />
      {data && <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {(data.domains || []).map((domain: AnyRecord) => <MetricCard key={domain.key} label={domain.label} value={domain.value === null || domain.value === undefined ? "—" : domain.key === "tax" ? `%${formatNumber(domain.value, 1)}` : formatNumber(domain.value)} detail={domain.detail} tone={domain.tone || "info"} />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Panel title="Bugünün öncelikleri" subtitle="Duruma göre sıralanan, yönetim kararlarını destekleyen öneriler.">
            <ActionList items={data.actions || []} />
          </Panel>
          <Panel title="Takvim ve hazine akışı" subtitle="Seçim tarihleri WarEra takviminden; hazine hareketleri bilinen işlem kayıtlarından gelir.">
            <div className="space-y-2">
              {(data.countdowns || []).map((item: AnyRecord) => <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg bg-[#141C21] px-3 py-2 text-xs"><span className="flex items-center gap-2 text-[#BBE1FA]/75"><CalendarClock className="h-3.5 w-3.5 text-sky-300" />{item.name}</span><b className="text-white">{formatNumber(item.hoursLeft, 0)} sa</b></div>)}
              {!data.countdowns?.length && <div className="text-xs text-[#BBE1FA]/55">Yaklaşan takvim olayı bulunamadı.</div>}
              {treasury?.success && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#3282B8]/10 pt-3">
                <div className="rounded-lg bg-[#141C21] p-3"><div className="text-[10px] uppercase text-[#BBE1FA]/50">7 günlük bilinen net akış</div><div className={`mt-1 text-sm font-bold ${treasury.totals?.netFlow7d >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatMoney(treasury.totals?.netFlow7d)}</div></div>
                <div className="rounded-lg bg-[#141C21] p-3"><div className="text-[10px] uppercase text-[#BBE1FA]/50">Bağışçı sayısı</div><div className="mt-1 text-sm font-bold text-white">{formatNumber(treasury.totals?.donors)}</div></div>
              </div>}
              <div className="text-[10px] leading-relaxed text-[#BBE1FA]/45">{(data.warnings || []).join(" ")}</div>
            </div>
          </Panel>
        </div>
        <div className="text-[10px] text-[#BBE1FA]/40">Son derleme: {formatDate(data.fetchedAt)} · {data.source}</div>
      </>}
    </div>
  );
}

export function ManagementWarRoomSection() {
  const { data, error, loading, refreshing, reload } = useManagementView<AnyRecord>("war-room");
  const active = [...(data?.activeBattles || []), ...(data?.alliedBattles || [])];
  return (
    <div className="space-y-4">
      <PageHeading title="Ülke Savaş Merkezi" subtitle="Türkiye ve müttefik cephelerindeki aktif muharebeler, sınır bölgelerinin risk durumu ve son savaş sonuçları." onRefresh={reload} refreshing={refreshing} />
      <StatusMessage error={error} loading={loading && !data} />
      {data && <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard label="Türkiye'nin aktif muharebesi" value={formatNumber(data.counts?.active)} detail={data.country?.name} tone={data.counts?.active ? "warn" : "good"} icon={<Swords className="h-4 w-4" />} />
          <MetricCard label="Müttefik muharebesi" value={formatNumber(data.counts?.allied)} detail="Genel aktif savaş listesinden" tone="info" icon={<Shield className="h-4 w-4" />} />
          <MetricCard label="Saldırı altındaki bölgeler" value={formatNumber(data.counts?.underAttack)} detail="Savunan taraf olduğumuz canlı muharebeler" tone={data.counts?.underAttack ? "bad" : "good"} icon={<AlertTriangle className="h-4 w-4" />} />
        </div>
        {(data.warnings || []).length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-950/15 p-3 text-xs text-amber-200">{data.warnings.join(" ")}</div>}
        <Panel title="Aktif muharebeler" subtitle="Çubuk iki tarafın mevcut tur puanlarını karşılaştırır.">
          {!active.length ? <div className="rounded-lg border border-emerald-500/15 bg-emerald-950/10 p-4 text-xs text-emerald-200/80">Aktif Türkiye veya müttefik muharebesi bulunamadı.</div> : <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{active.map((battle: AnyRecord) => <BattleCard key={battle.id} battle={battle} />)}</div>}
        </Panel>
        <Panel title="Bölge savunma durumu" subtitle="WarEra bölge komşulukları, savaş ilişkileri ve aktif muharebelerden hesaplanan risk sınıflandırması.">
          {!data.regions?.length ? <div className="text-xs text-[#BBE1FA]/55">Bölge verisi alınamadı.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="text-[10px] uppercase text-[#BBE1FA]/45"><tr><th className="pb-2">Bölge</th><th className="pb-2">Risk</th><th className="pb-2">Nüfus</th><th className="pb-2">Bunker</th><th className="pb-2">Tehdit komşuları</th></tr></thead><tbody>{data.regions.map((region: AnyRecord) => <tr key={region.id} className="border-t border-[#3282B8]/10"><td className="py-2.5 font-semibold text-white">{region.name}{region.capital && <span className="ml-2 text-[9px] text-amber-300">BAŞKENT</span>}</td><td className="py-2.5"><Pill tone={region.tone}>{region.risk}</Pill></td><td className="py-2.5 text-[#BBE1FA]/70">{formatNumber(region.population)}</td><td className="py-2.5 text-[#BBE1FA]/70">{formatNumber(region.bunkerLevel)}</td><td className="py-2.5 text-[#BBE1FA]/60">{region.hostileNeighbors?.join(", ") || "—"}</td></tr>)}</tbody></table></div>}
        </Panel>
        <Panel title="Son savaş geçmişi" subtitle="WarEra'nın son 40 savaş kaydından Türkiye tarafı.">
          {!data.history?.length ? <div className="text-xs text-[#BBE1FA]/55">Geçmiş savaş kaydı bulunamadı.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="text-[10px] uppercase text-[#BBE1FA]/45"><tr><th className="pb-2">Sonuç</th><th className="pb-2">Rakip</th><th className="pb-2">Bölge</th><th className="pb-2">Tur</th><th className="pb-2">Bitiş</th></tr></thead><tbody>{data.history.map((battle: AnyRecord) => <tr key={battle.id} className="border-t border-[#3282B8]/10"><td className="py-2.5"><Pill tone={battle.won ? "good" : "bad"}>{battle.result}</Pill></td><td className="py-2.5 font-semibold text-white">{battle.opponent}</td><td className="py-2.5 text-[#BBE1FA]/70">{battle.region}</td><td className="py-2.5 text-[#BBE1FA]/70">{battle.roundsOurs}-{battle.roundsTheirs}</td><td className="py-2.5 text-[#BBE1FA]/55">{formatDate(battle.endedAt)}</td></tr>)}</tbody></table></div>}
        </Panel>
        <div className="text-[10px] text-[#BBE1FA]/40">Son güncelleme: {formatDate(data.fetchedAt)} · {data.source}</div>
      </>}
    </div>
  );
}

const CITIZEN_FILTERS = ["Tümü", "Aktif", "Uykuda", "İnaktif", "Asker", "Ekonomist", "Karma", "Acemi", "Yeni", "Oy verebilen"];

export function ManagementCitizensSection() {
  const { data, error, loading, refreshing, reload } = useManagementView<AnyRecord>("citizens");
  const [filter, setFilter] = useState("Tümü");
  const [search, setSearch] = useState("");
  const rows = useMemo(() => (data?.rows || []).filter((row: AnyRecord) => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    const matchesQuery = !query || row.name.toLocaleLowerCase("tr-TR").includes(query);
    const matchesFilter = filter === "Tümü" || (filter === "Yeni" ? row.isNew : filter === "Oy verebilen" ? row.canVote : row.status === filter || row.build === filter);
    return matchesQuery && matchesFilter;
  }), [data, filter, search]);
  return (
    <div className="space-y-4">
      <PageHeading title="Vatandaşlar & Hükümet" subtitle="Vatandaş aktifliği, asker/ekonomist profili, seçmen yeterliliği, görev sahipleri ve seçim takvimi." onRefresh={reload} refreshing={refreshing} />
      <StatusMessage error={error} loading={loading && !data} />
      {data && <>
        {!data.complete && <div className="rounded-lg border border-amber-500/25 bg-amber-950/15 p-3 text-xs text-amber-200">{data.note} Liste, canlı API sayfalama sınırına kadar gösteriliyor.</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Aktif vatandaş" value={`${formatNumber(data.counts.active)} / ${formatNumber(data.counts.total)}`} detail={`${formatNumber(data.counts.sleeping)} uykuda · ${formatNumber(data.counts.inactive)} inaktif`} tone={data.counts.active / Math.max(1, data.counts.total) >= 0.6 ? "good" : "warn"} icon={<Activity className="h-4 w-4" />} />
          <MetricCard label="Yeni vatandaş" value={formatNumber(data.counts.new)} detail="Son 7 günde ülkeye katılan" tone={data.counts.new ? "good" : "info"} icon={<Users className="h-4 w-4" />} />
          <MetricCard label="Asker / ekonomist" value={`${formatNumber(data.counts.soldiers)} / ${formatNumber(data.counts.economists)}`} detail={`${formatNumber(data.counts.mixed)} karma · ${formatNumber(data.counts.novices)} acemi`} tone="info" icon={<Swords className="h-4 w-4" />} />
          <MetricCard label="Oy verebilen" value={formatNumber(data.counts.voters)} detail={`Seviye ${formatNumber(data.government.voters.minLevel)}+`} tone="info" icon={<CheckCircle2 className="h-4 w-4" />} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Panel title="Hükümet ve temsil" subtitle={`Parti: ${data.government.party.name}`}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(data.government.offices || []).map((person: AnyRecord) => <div key={person.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#141C21] p-3"><div><div className="text-[10px] uppercase tracking-wider text-[#BBE1FA]/45">{person.role}</div>{person.url ? <a href={person.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-bold text-white hover:text-sky-300">{person.name} ↗</a> : <div className="mt-1 text-xs font-bold text-white">{person.name}</div>}</div><Pill tone={person.tone as Tone}>{person.status}</Pill></div>)}
              {!data.government.offices?.length && <div className="text-xs text-[#BBE1FA]/55">Görevli bilgisi gelmedi.</div>}
            </div>
            {!!data.government.congress?.length && <div className="mt-3 border-t border-[#3282B8]/10 pt-3"><div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#BBE1FA]/45">Kongre üyeleri · {data.government.congress.length}</div><div className="flex flex-wrap gap-2">{data.government.congress.slice(0, 30).map((person: AnyRecord) => <a key={person.id} href={person.url} target="_blank" rel="noreferrer" className="rounded-md border border-[#3282B8]/20 bg-[#141C21] px-2 py-1 text-[10px] text-[#BBE1FA]/80 hover:text-white">{person.name}</a>)}</div></div>}
          </Panel>
          <Panel title="Seçim ve yönetim takvimi" subtitle={`Adaylık seviyesi ${formatNumber(data.government.voters.candidateMinLevel)}+`}>
            <div className="mb-3 rounded-lg border border-[#3282B8]/15 bg-[#141C21] p-3 text-xs text-[#BBE1FA]/75">Uygun seçmen: <b className="text-white">{formatNumber(data.government.voters.eligible)}</b> · Oy verme için gereken seviye: <b className="text-white">{formatNumber(data.government.voters.minLevel)}</b></div>
            <div className="space-y-2">{(data.government.countdowns || []).map((item: AnyRecord) => <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg bg-[#141C21] px-3 py-2.5 text-xs"><span className="flex items-center gap-2 text-[#BBE1FA]/70"><Clock3 className="h-3.5 w-3.5 text-amber-300" />{item.name}</span><span className="text-right"><b className="text-white">{formatNumber(item.hoursLeft, 0)} sa</b><span className="ml-2 text-[10px] text-[#BBE1FA]/45">{formatDate(item.at)}</span></span></div>)}{!data.government.countdowns?.length && <div className="text-xs text-[#BBE1FA]/55">Takvim verisi bulunamadı.</div>}</div>
          </Panel>
        </div>
        <Panel title="Vatandaş listesi" subtitle={`${formatNumber(data.counts.profiled)} profil · ${formatNumber(data.counts.total)} vatandaş kaydı`} right={<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="İsim ara" className="w-36 rounded-md border border-[#3282B8]/20 bg-[#141C21] px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#3282B8]/60 sm:w-48" />}>
          <div className="mb-3 flex flex-wrap gap-1.5">{CITIZEN_FILTERS.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${filter === item ? "border-sky-400/50 bg-sky-950/40 text-sky-100" : "border-[#3282B8]/15 bg-[#141C21] text-[#BBE1FA]/55 hover:text-white"}`}>{item}</button>)}</div>
          <div className="max-h-[560px] overflow-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="sticky top-0 bg-[#182329] text-[10px] uppercase text-[#BBE1FA]/45"><tr><th className="pb-2">Vatandaş</th><th className="pb-2">Durum</th><th className="pb-2">Seviye</th><th className="pb-2">Profil</th><th className="pb-2">Son giriş</th><th className="pb-2">Haftalık hasar</th><th className="pb-2">Seçmen</th><th className="pb-2">Görev</th></tr></thead><tbody>{rows.slice(0, 500).map((row: AnyRecord) => <tr key={row.id} className="border-t border-[#3282B8]/10"><td className="py-2.5 font-semibold text-white">{row.url ? <a href={row.url} target="_blank" rel="noreferrer" className="hover:text-sky-300">{row.name} ↗</a> : row.name}{row.isNew && <span className="ml-2 rounded bg-sky-950/50 px-1.5 py-0.5 text-[9px] text-sky-200">yeni</span>}</td><td className="py-2.5"><Pill tone={row.tone}>{row.status}</Pill></td><td className="py-2.5 text-[#BBE1FA]/75">{formatNumber(row.level)}</td><td className="py-2.5 text-[#BBE1FA]/75">{row.build}</td><td className="py-2.5 text-[#BBE1FA]/55">{row.hoursSinceConnection === null ? "—" : `${formatNumber(row.hoursSinceConnection, 0)} sa önce`}</td><td className="py-2.5 text-[#BBE1FA]/75">{formatNumber(row.weeklyDamage)}</td><td className="py-2.5">{row.canVote ? <span className="text-emerald-300">✓</span> : <span className="text-[#BBE1FA]/30">—</span>}</td><td className="py-2.5 text-[#BBE1FA]/55">{row.roles?.join(", ") || "—"}</td></tr>)}{!rows.length && <tr><td colSpan={8} className="py-5 text-center text-[#BBE1FA]/45">Bu filtrede vatandaş bulunamadı.</td></tr>}</tbody></table></div>
        </Panel>
        <div className="text-[10px] text-[#BBE1FA]/40">Veri: {data.source} · Son güncelleme: {formatDate(data.fetchedAt)} · {data.note}</div>
      </>}
    </div>
  );
}

const COUNTRY_METRICS = [
  { key: "wealth", label: "Ülke serveti", money: true },
  { key: "population", label: "Nüfus" },
  { key: "activePopulation", label: "Aktif nüfus" },
  { key: "development", label: "Gelişmişlik", digits: 1 },
  { key: "weeklyDamage", label: "Haftalık hasar" },
  { key: "totalDamage", label: "Toplam ülke hasarı" },
  { key: "taxRate", label: "Gelir vergisi", percent: true, digits: 1 },
];

const TRACKER_COLORS = ["#54a9e8", "#36c98f", "#f3b94f", "#dd6a76"];

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
  const { data, error, loading, refreshing, reload } = useManagementView<AnyRecord>("country-tracker");
  const [snapshots, setSnapshots] = useState<AnyRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [metric, setMetric] = useState("wealth");
  const [search, setSearch] = useState("");
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
    if (!selectedIds.length) {
      const candidates = [...data.countries].sort((a: AnyRecord, b: AnyRecord) => (b.weeklyDamage || 0) - (a.weeklyDamage || 0));
      setSelectedIds([data.homeCountryId, ...candidates.filter((row: AnyRecord) => row.id !== data.homeCountryId).slice(0, 2).map((row: AnyRecord) => row.id)]);
    }
  }, [data, selectedIds.length]);
  const countries = data?.countries || [];
  const filteredCountries = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    const rows = !q ? countries : countries.filter((row: AnyRecord) => `${row.name} ${row.code}`.toLocaleLowerCase("tr-TR").includes(q));
    return rows.slice(0, 80);
  }, [countries, search]);
  const chart = useMemo(() => indexedChart(snapshots, selectedIds, metric), [snapshots, selectedIds, metric]);
  const metricInfo = COUNTRY_METRICS.find((item) => item.key === metric) || COUNTRY_METRICS[0];
  const toggleCountry = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length >= 4 ? current : [...current, id]);
  const selectedCountries = selectedIds.map((id) => countries.find((row: AnyRecord) => row.id === id)).filter(Boolean) as AnyRecord[];
  const baseline = snapshots[0];
  return (
    <div className="space-y-4">
      <PageHeading title="Ülke Takibi & Karşılaştırma" subtitle="Ülke serveti, nüfus, gelişmişlik, vergi ve ülke hasarını günlük snapshot’lar üzerinden karşılaştır." onRefresh={reload} refreshing={refreshing} />
      <StatusMessage error={error} loading={loading && !data} />
      {data && <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard label="Takip edilen ülke" value={formatNumber(countries.length)} detail="WarEra ülke listesi" tone="info" icon={<Flag className="h-4 w-4" />} />
          <MetricCard label="Kayıtlı günlük geçmiş" value={`${snapshots.length} / 30`} detail={snapshots.length < 2 ? "Günlük cron yeni noktalar ekleyecek" : `${snapshots[0]?.date} — ${snapshots[snapshots.length - 1]?.date}`} tone={snapshots.length >= 2 ? "good" : "warn"} icon={<Activity className="h-4 w-4" />} />
          <MetricCard label="Karşılaştırma" value={`${selectedIds.length} / 4`} detail="Grafikte en fazla dört ülke" tone="info" icon={<Users className="h-4 w-4" />} />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_2fr]">
          <Panel title="Ülke seçimi" subtitle="Türkiye varsayılan olarak seçilidir. En fazla dört ülke seçebilirsin." right={<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ülke ara" className="w-32 rounded-md border border-[#3282B8]/20 bg-[#141C21] px-2 py-1.5 text-xs text-white outline-none focus:border-[#3282B8]/60" />}>
            <div className="max-h-[250px] space-y-1 overflow-auto pr-1">{filteredCountries.map((country: AnyRecord) => <label key={country.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-[#141C21]"><input type="checkbox" checked={selectedIds.includes(country.id)} disabled={!selectedIds.includes(country.id) && selectedIds.length >= 4} onChange={() => toggleCountry(country.id)} className="accent-sky-400"/><span className="min-w-0 flex-1 truncate text-[#BBE1FA]/80">{country.name}</span><span className="text-[9px] text-[#BBE1FA]/35">{country.code}</span></label>)}</div>
          </Panel>
          <Panel title="Günlük değişim" subtitle="Grafik, ilk görülen günün değerini 100 kabul ederek göreli değişimi gösterir." right={<select value={metric} onChange={(event) => setMetric(event.target.value)} className="rounded-md border border-[#3282B8]/20 bg-[#141C21] px-2 py-1.5 text-xs text-white">{COUNTRY_METRICS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>}>
            {chart.lines.length < 1 ? <div className="flex h-48 items-center justify-center text-xs text-[#BBE1FA]/50">Grafik için ülke seç.</div> : <>
              <div className="overflow-x-auto"><svg viewBox="0 0 700 220" role="img" aria-label={`${metricInfo.label} karşılaştırma grafiği`} className="h-52 min-w-[560px] w-full">
                {[30, 70, 110, 150, 190].map((y) => <line key={y} x1="30" x2="670" y1={y} y2={y} stroke="rgba(187,225,250,.09)" strokeDasharray={y === 190 ? undefined : "4 5"} />)}
                <line x1="30" x2="670" y1="190" y2="190" stroke="rgba(187,225,250,.18)" />
                <text x="4" y="34" fill="rgba(187,225,250,.4)" fontSize="10">↑</text><text x="4" y="190" fill="rgba(187,225,250,.4)" fontSize="10">100</text>
                {chart.lines.map((line: AnyRecord) => <g key={line.id}><polyline points={line.points} fill="none" stroke={line.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />{line.values.map((point: AnyRecord, index: number) => index === line.values.length - 1 ? <circle key={point.date} cx={point.x} cy={190 - (point.y / Math.max(110, ...chart.lines.flatMap((l: AnyRecord) => l.values.map((p: AnyRecord) => p.y)))) * 160} r="4" fill={line.color} /> : null)}</g>)}
                <text x="30" y="210" fill="rgba(187,225,250,.4)" fontSize="9">{chart.points[0] || ""}</text><text x="670" y="210" textAnchor="end" fill="rgba(187,225,250,.4)" fontSize="9">{chart.points.at(-1) || ""}</text>
              </svg></div>
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
        <div className="rounded-lg border border-[#3282B8]/15 bg-[#141C21] p-3 text-[10px] leading-relaxed text-[#BBE1FA]/50">Kaynak: {data.source}. İlk kullanımda geçmiş yalnızca bugünden itibaren oluşur. Günlük tarihî kayıtlar mevcut hasar cron’unda tutulur; tarayıcı geçmişi de bu cihazda yedeklenir. {data.note}</div>
      </>}
    </div>
  );
}

interface TaxAssumptions { dailyTaxBase: number; fixedDailyIncome: number; sensitivity: number }
const DEFAULT_TAX_ASSUMPTIONS: TaxAssumptions = { dailyTaxBase: 0, fixedDailyIncome: 0, sensitivity: 2.5 };

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

export function ManagementTaxSimulationSection() {
  const { data, error, loading, refreshing, reload } = useManagementView<AnyRecord>("tax-simulator");
  const [assumptions, setAssumptions] = useState<TaxAssumptions>(DEFAULT_TAX_ASSUMPTIONS);
  const [targetTax, setTargetTax] = useState(0);
  useEffect(() => {
    if (!data?.country?.id) return;
    const key = `nizam_tax_assumptions_${data.country.id}`;
    let stored = DEFAULT_TAX_ASSUMPTIONS;
    try { stored = { ...DEFAULT_TAX_ASSUMPTIONS, ...JSON.parse(localStorage.getItem(key) || "{}") }; } catch {}
    setAssumptions(stored);
    setTargetTax(Number(data.currentTaxPct || 0));
  }, [data?.country?.id]);
  useEffect(() => {
    if (!data?.country?.id) return;
    try { localStorage.setItem(`nizam_tax_assumptions_${data.country.id}`, JSON.stringify(assumptions)); } catch {}
  }, [assumptions, data?.country?.id]);
  const currentTax = Number(data?.currentTaxPct || 0);
  const maxTax = Math.max(0, Number(data?.maxTaxPct || 45));
  const rates = useMemo(() => {
    const values = Array.from({ length: Math.floor(maxTax) + 1 }, (_, index) => index);
    if (!values.some((value) => Math.abs(value - currentTax) < 0.01)) values.push(currentTax);
    return Array.from(new Set(values)).sort((a, b) => a - b);
  }, [maxTax, currentTax]);
  const rows = rates.map((taxPct) => {
    const tax = Math.max(0, assumptions.dailyTaxBase) * taxPct / 100;
    const retained = clamp(1 - Math.max(0, taxPct - currentTax) * Math.max(0, assumptions.sensitivity) / 100, 0, 1);
    return { taxPct, mechanicalTax: tax, retentionPct: retained * 100, behavioralTax: tax * retained, dailyTotal: tax * retained + Math.max(0, assumptions.fixedDailyIncome) };
  });
  const currentRow = rows.find((row) => Math.abs(row.taxPct - currentTax) < 0.01) || rows[0];
  const selectedRow = rows.find((row) => Math.abs(row.taxPct - targetTax) < 0.01) || rows[0];
  const optimum = rows.reduce((best, row) => row.dailyTotal > best.dailyTotal ? row : best, rows[0] || { taxPct: currentTax, dailyTotal: 0 });
  const forecastHorizons = [1, 3, 7, 30];
  return (
    <div className="space-y-4">
      <PageHeading title="Vergi Simülatörü & Gelir Tahmini" subtitle="Vergi oranı değiştiğinde sabit ücret matrahı ve kullanıcı tarafından belirlenen elde tutma varsayımıyla günlük geliri hesapla." onRefresh={reload} refreshing={refreshing} />
      <StatusMessage error={error} loading={loading && !data} />
      {data && <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard label="Mevcut vergi" value={`%${formatNumber(currentTax, 1)}`} detail="WarEra ülke verisinden" tone="info" icon={<Landmark className="h-4 w-4" />} />
          <MetricCard label="Seçtiğin oran" value={`%${formatNumber(targetTax, 1)}`} detail={`${formatMoney(selectedRow?.dailyTotal)} / gün · tahmini`} tone="warn" icon={<Coins className="h-4 w-4" />} />
          <MetricCard label="Varsayım optimumu" value={`%${formatNumber(optimum?.taxPct, 1)}`} detail={`${formatMoney(optimum?.dailyTotal)} / gün · bu modelin sonucu`} tone="good" icon={<Activity className="h-4 w-4" />} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Panel title="Simülasyon girdileri" subtitle="WarEra API günlük toplam maaş/vergi gelirini vermediğinden matrahı açıkça sen giriyorsun.">
            <div className="space-y-4">
              <label className="block"><span className="mb-1 block text-xs font-semibold text-white">Günlük brüt maaş matrahı <span className="text-[#BBE1FA]/45">(100% vergi oranındaki tutar)</span></span><div className="flex items-center rounded-lg border border-[#3282B8]/20 bg-[#141C21] px-3"><input type="number" min="0" step="100" value={assumptions.dailyTaxBase || ""} onChange={(event) => setAssumptions((current) => ({ ...current, dailyTaxBase: Math.max(0, Number(event.target.value || 0)) }))} placeholder="Örn. 250000" className="w-full bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-[#BBE1FA]/25"/><span className="text-xs text-[#BBE1FA]/45">₮/gün</span></div></label>
              <label className="block"><span className="mb-1 block text-xs font-semibold text-white">Vergiden bağımsız günlük gelir <span className="text-[#BBE1FA]/45">(isteğe bağlı)</span></span><div className="flex items-center rounded-lg border border-[#3282B8]/20 bg-[#141C21] px-3"><input type="number" min="0" step="100" value={assumptions.fixedDailyIncome || ""} onChange={(event) => setAssumptions((current) => ({ ...current, fixedDailyIncome: Math.max(0, Number(event.target.value || 0)) }))} placeholder="0" className="w-full bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-[#BBE1FA]/25"/><span className="text-xs text-[#BBE1FA]/45">₮/gün</span></div></label>
              <label className="block"><span className="mb-1 flex justify-between gap-2 text-xs font-semibold text-white"><span>Vergi artışında işçi/şirket elde tutma hassasiyeti</span><b className="text-amber-200">%{formatNumber(assumptions.sensitivity, 1)} / puan</b></span><input type="range" min="0" max="8" step="0.5" value={assumptions.sensitivity} onChange={(event) => setAssumptions((current) => ({ ...current, sensitivity: Number(event.target.value) }))} className="w-full accent-amber-400"/><span className="text-[10px] leading-relaxed text-[#BBE1FA]/45">Her 1 puanlık vergi artışında model, çalışan matrahının bu oran kadar azalacağını varsayar.</span></label>
              <label className="block"><span className="mb-1 flex justify-between text-xs font-semibold text-white"><span>Denenecek gelir vergisi</span><b className="text-sky-200">%{formatNumber(targetTax, 1)}</b></span><input type="range" min="0" max={maxTax} step="1" value={targetTax} onChange={(event) => setTargetTax(Number(event.target.value))} className="w-full accent-sky-400"/><div className="flex justify-between text-[10px] text-[#BBE1FA]/40"><span>%0</span><span>Oyun sınırı %{formatNumber(maxTax, 1)}</span></div></label>
            </div>
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-950/10 p-3 text-[10px] leading-relaxed text-amber-100/70">Bu cihazda saklanır. Vergi matrahı ve elde tutma hassasiyeti kullanıcı varsayımıdır; modelin çıktısı gerçek vergi geliri garantisi değildir.</div>
          </Panel>
          <Panel title="Seçilen oran ne getirir?" subtitle="Mekanik hesap ücret matrahını sabit tutar; tahmini hesap vergi artışındaki elde tutma varsayımını uygular.">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-[#141C21] p-3"><div className="text-[10px] uppercase text-[#BBE1FA]/45">Kimse ayrılmasa</div><div className="mt-1 text-sm font-bold text-white">{formatMoney(selectedRow?.mechanicalTax)} / gün</div><div className="mt-1 text-[10px] text-[#BBE1FA]/45">Vergi geliri; matrah sabit</div></div>
              <div className="rounded-lg bg-[#141C21] p-3"><div className="text-[10px] uppercase text-[#BBE1FA]/45">Davranış varsayımıyla</div><div className="mt-1 text-sm font-bold text-white">{formatMoney(selectedRow?.behavioralTax)} / gün</div><div className="mt-1 text-[10px] text-[#BBE1FA]/45">Matrah elde tutma: %{formatNumber(selectedRow?.retentionPct, 1)}</div></div>
              <div className="rounded-lg bg-[#141C21] p-3"><div className="text-[10px] uppercase text-[#BBE1FA]/45">Vergiden bağımsız gelir</div><div className="mt-1 text-sm font-bold text-white">{formatMoney(assumptions.fixedDailyIncome)} / gün</div></div>
              <div className="rounded-lg bg-[#141C21] p-3"><div className="text-[10px] uppercase text-[#BBE1FA]/45">Mevcut orana göre fark</div><div className={`mt-1 text-sm font-bold ${(selectedRow?.dailyTotal || 0) >= (currentRow?.dailyTotal || 0) ? "text-emerald-300" : "text-rose-300"}`}>{(selectedRow?.dailyTotal || 0) - (currentRow?.dailyTotal || 0) >= 0 ? "+" : ""}{formatMoney((selectedRow?.dailyTotal || 0) - (currentRow?.dailyTotal || 0))} / gün</div></div>
            </div>
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-xs"><thead className="text-[10px] uppercase text-[#BBE1FA]/45"><tr><th className="pb-2">Gün</th><th className="pb-2">Mevcut politika</th><th className="pb-2">Seçilen oran</th><th className="pb-2">Tahmini fark</th></tr></thead><tbody>{forecastHorizons.map((days) => { const current = (currentRow?.dailyTotal || 0) * days; const selected = (selectedRow?.dailyTotal || 0) * days; return <tr key={days} className="border-t border-[#3282B8]/10"><td className="py-2.5 font-semibold text-white">{days} gün</td><td className="py-2.5 text-[#BBE1FA]/70">{formatMoney(current)}</td><td className="py-2.5 text-[#BBE1FA]/70">{formatMoney(selected)}</td><td className={`py-2.5 font-semibold ${selected >= current ? "text-emerald-300" : "text-rose-300"}`}>{selected - current >= 0 ? "+" : ""}{formatMoney(selected - current)}</td></tr>; })}</tbody></table></div>
            <div className="mt-3 text-[10px] text-[#BBE1FA]/40">Tahmin, günlük girdilerin değişmeden kaldığını varsayar; trend ve şirket göçü WarEra verisinden doğrulanmıyor.</div>
          </Panel>
        </div>
        <Panel title="Vergi oranı tablosu" subtitle="Öneri, bu cihazdaki matrah ve hassasiyet ayarlarının günlük tahmini toplamına göre seçilir.">
          <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="text-[10px] uppercase text-[#BBE1FA]/45"><tr><th className="pb-2">Vergi</th><th className="pb-2">Mekanik vergi</th><th className="pb-2">Tahmini matrah payı</th><th className="pb-2">Günlük tahmini toplam</th><th className="pb-2">İşaret</th></tr></thead><tbody>{rows.map((row) => <tr key={row.taxPct} className={`border-t border-[#3282B8]/10 ${Math.abs(row.taxPct - targetTax) < 0.01 ? "bg-sky-950/10" : ""}`}><td className="py-2.5 font-semibold text-white">%{formatNumber(row.taxPct, 1)}</td><td className="py-2.5 text-[#BBE1FA]/70">{formatMoney(row.mechanicalTax)}</td><td className="py-2.5 text-[#BBE1FA]/70">%{formatNumber(row.retentionPct, 1)}</td><td className="py-2.5 font-semibold text-white">{formatMoney(row.dailyTotal)}</td><td className="py-2.5">{Math.abs(row.taxPct - currentTax) < 0.01 ? <Pill>mevcut</Pill> : Math.abs(row.taxPct - optimum.taxPct) < 0.01 ? <Pill tone="good">model optimumu</Pill> : Math.abs(row.taxPct - targetTax) < 0.01 ? <Pill tone="warn">seçilen</Pill> : ""}</td></tr>)}</tbody></table></div>
        </Panel>
        <div className="rounded-lg border border-[#3282B8]/15 bg-[#141C21] p-3 text-[10px] leading-relaxed text-[#BBE1FA]/50">Kaynak: {data.source}. Oyun sınırı ve bugünkü oran API’dan gelir. Gelir tahminleri açıkça belirtilen matrah, sabit gelir ve elde tutma varsayımlarıyla hesaplanır; Cameroonera’daki ayrıntılı şirket davranış modeli için Nizam’da bulunmayan fabrika/işçi ücret verileri gerekir.</div>
      </>}
    </div>
  );
}
