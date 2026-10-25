import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Boxes, Hammer, LoaderCircle, Package, RefreshCw, Search, Sparkles, Swords, Wheat } from "lucide-react";
import { fetchMarketPrices } from "../services/wareraApi";
import type { MarketPrices } from "../services/wareraApi";

type MarketCategory = "Kasalar" | "Üretim" | "Güçlendirmeler" | "Mühimmat" | "Gıda" | "İnşaat";
interface ItemMetadata { name: string; category: MarketCategory; tone: string }

const ITEMS: Record<string, ItemMetadata> = {
  cookedFish: { name: "Pişmiş Balık", category: "Gıda", tone: "#fb7185" },
  heavyAmmo: { name: "Ağır Mühimmat", category: "Mühimmat", tone: "#c4b5fd" },
  steel: { name: "Çelik", category: "İnşaat", tone: "#7dd3fc" },
  bread: { name: "Ekmek", category: "Gıda", tone: "#fbbf24" },
  grain: { name: "Tahıl", category: "Gıda", tone: "#fbbf24" },
  limestone: { name: "Kireçtaşı", category: "İnşaat", tone: "#cbd5e1" },
  coca: { name: "Koka", category: "Güçlendirmeler", tone: "#86efac" },
  concrete: { name: "Beton", category: "İnşaat", tone: "#6ee7b7" },
  oil: { name: "Ham Petrol", category: "İnşaat", tone: "#2dd4bf" },
  case1: { name: "Kasa I", category: "Kasalar", tone: "#a3a452" },
  lightAmmo: { name: "Hafif Mühimmat", category: "Mühimmat", tone: "#86efac" },
  steak: { name: "Biftek", category: "Gıda", tone: "#93c5fd" },
  livestock: { name: "Canlı Hayvan", category: "Gıda", tone: "#cbd5e1" },
  cocain: { name: "Kokain", category: "Güçlendirmeler", tone: "#c084fc" },
  lead: { name: "Kurşun", category: "Mühimmat", tone: "#94a3b8" },
  fish: { name: "Balık", category: "Gıda", tone: "#67e8f9" },
  petroleum: { name: "Petrol Ürünü", category: "İnşaat", tone: "#94a3b8" },
  ammo: { name: "Mühimmat", category: "Mühimmat", tone: "#c4b5fd" },
  iron: { name: "Demir", category: "İnşaat", tone: "#67e8f9" },
  scraps: { name: "Hurda", category: "Üretim", tone: "#60a5fa" },
  case2: { name: "Kasa II", category: "Kasalar", tone: "#a78bfa" },
  wood: { name: "Odun", category: "İnşaat", tone: "#d6a66a" },
  paper: { name: "Kağıt", category: "İnşaat", tone: "#c4b5fd" },
  woodenCase: { name: "Ahşap Kasa", category: "Kasalar", tone: "#d6a66a" },
};

const CATEGORY_ORDER: MarketCategory[] = ["Kasalar", "Üretim", "Güçlendirmeler", "Mühimmat", "Gıda", "İnşaat"];
const CATEGORY_STYLE: Record<MarketCategory, { icon: React.ElementType; color: string; border: string; tone: string }> = {
  Kasalar: { icon: Package, color: "text-amber-300", border: "border-amber-500/15", tone: "#fbbf24" },
  Üretim: { icon: Boxes, color: "text-sky-300", border: "border-sky-500/15", tone: "#60a5fa" },
  Güçlendirmeler: { icon: Sparkles, color: "text-violet-300", border: "border-violet-500/15", tone: "#c084fc" },
  Mühimmat: { icon: Swords, color: "text-indigo-300", border: "border-indigo-500/15", tone: "#a5b4fc" },
  Gıda: { icon: Wheat, color: "text-emerald-300", border: "border-emerald-500/15", tone: "#34d399" },
  İnşaat: { icon: Hammer, color: "text-cyan-300", border: "border-cyan-500/15", tone: "#67e8f9" },
};
const priceFormat = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function readableItemName(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (first) => first.toLocaleUpperCase("tr-TR"));
}

export const MarketPricesSection: React.FC = () => {
  const [prices, setPrices] = useState<MarketPrices>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadPrices = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fetchMarketPrices();
      setPrices(result);
      setUpdatedAt(new Date());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Market fiyatları alınamadı.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadPrices(); }, [loadPrices]);

  const groupedPrices = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
    const filtered = Object.entries(prices).filter((entry): entry is [string, number] => {
      const [key, price] = entry;
      if (typeof price !== "number" || !Number.isFinite(price)) return false;
      const name = ITEMS[key]?.name || readableItemName(key);
      return !normalizedQuery || `${name} ${key}`.toLocaleLowerCase("tr-TR").includes(normalizedQuery);
    });
    const groups = new Map<MarketCategory, [string, number][]>(CATEGORY_ORDER.map((category) => [category, []]));
    const unknown: [string, number][] = [];
    for (const entry of filtered) {
      const category = ITEMS[entry[0]]?.category;
      if (category) groups.get(category)?.push(entry);
      else unknown.push(entry);
    }
    return [...CATEGORY_ORDER.map((category) => [category, groups.get(category) || []] as const), ...(unknown.length ? [["Diğer", unknown] as const] : [])].filter(([, entries]) => entries.length);
  }, [prices, query]);

  const itemCount = Object.keys(prices).length;
  const average = itemCount ? (Object.values(prices) as number[]).reduce((sum, price) => sum + price, 0) / itemCount : 0;

  return (
    <section className="space-y-5" aria-labelledby="market-prices-title">
      <header className="rounded-2xl border border-emerald-500/20 bg-[#182329] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-emerald-300"><ShoppingCartIcon /></div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Ekonomi</p>
              <h1 id="market-prices-title" className="mt-1 text-xl font-bold text-white sm:text-2xl">Market Fiyatları</h1>
              <p className="mt-1 text-sm text-[#BBE1FA]/60">WarEra marketindeki güncel ortalama ürün fiyatları</p>
            </div>
          </div>
          <button type="button" onClick={() => void loadPrices(true)} disabled={loading || refreshing} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-[#11191E] px-3 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-950/30 disabled:cursor-not-allowed disabled:opacity-50">
            {refreshing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{refreshing ? "Yenileniyor..." : "Yenile"}
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Listelenen ürün" value={loading ? "—" : String(itemCount)} />
        <SummaryCard label="Ortalama fiyat" value={loading || !itemCount ? "—" : `${priceFormat.format(average)} G`} />
        <SummaryCard label="Son güncelleme" value={updatedAt ? updatedAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "—"} />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#BBE1FA]/40" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ürün adına göre ara..." aria-label="Ürün adına göre ara" className="w-full rounded-xl border border-[#3282B8]/20 bg-[#182329] py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-[#BBE1FA]/35 focus:border-emerald-400/45" />
      </div>

      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-500/20 bg-rose-950/15 p-4 text-sm text-rose-200"><span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</span><button type="button" onClick={() => void loadPrices(true)} className="shrink-0 rounded-lg border border-rose-500/25 px-3 py-1.5 text-xs hover:bg-rose-950/30">Tekrar dene</button></div>}

      {loading ? <div className="grid min-h-48 place-items-center rounded-2xl border border-[#3282B8]/15 bg-[#182329]"><div className="flex items-center gap-2 text-sm text-[#BBE1FA]/60"><LoaderCircle className="h-4 w-4 animate-spin" />Market fiyatları yükleniyor...</div></div>
        : !itemCount && !error ? <div className="grid min-h-48 place-items-center rounded-2xl border border-[#3282B8]/15 bg-[#182329] text-sm text-[#BBE1FA]/50">API henüz fiyat verisi döndürmedi.</div>
          : !groupedPrices.length && !error ? <div className="grid min-h-40 place-items-center rounded-2xl border border-[#3282B8]/15 bg-[#182329] text-sm text-[#BBE1FA]/50">Bu aramayla eşleşen ürün bulunamadı.</div>
            : <div className="space-y-5">{groupedPrices.map(([category, entries]) => {
              const style = CATEGORY_STYLE[category as MarketCategory] || { icon: Package, color: "text-[#BBE1FA]/70", border: "border-[#3282B8]/15", tone: "#BBE1FA" };
              const CategoryIcon = style.icon;
              return <section key={category} className="space-y-3" aria-label={category}>
                <h2 className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] ${style.color}`}><CategoryIcon className="h-4 w-4" />{category}<span className="font-mono text-[10px] opacity-50">{entries.length}</span></h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{entries.map(([key, price]) => {
                  const item = ITEMS[key];
                  const tone = item?.tone || style.tone;
                  return <article key={key} className={`rounded-xl border ${style.border} p-4 transition duration-150 hover:brightness-110`} style={{ backgroundColor: `${tone}12`, borderColor: `${tone}45` }} title={`${key}: ${price}`}>
                    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-white">{item?.name || readableItemName(key)}</h3><p className="mt-1 text-[10px] text-[#BBE1FA]/45">{key}</p></div><span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border bg-[#11191E]/80" style={{ color: tone, borderColor: `${tone}55`, backgroundColor: `${tone}18` }}><CategoryIcon className="h-4 w-4" /><img src={`/assets/${key}.png`} alt="" className="absolute inset-0 h-full w-full object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} /></span></div>
                    <div className="mt-4 font-mono text-2xl font-bold tracking-tight" style={{ color: tone }}>{priceFormat.format(price)}<span className="ml-1.5 text-xs font-medium text-[#BBE1FA]/65">G</span></div>
                    <div className="mt-1 text-[10px] text-[#BBE1FA]/40">Birim başına fiyat</div>
                  </article>;
                })}</div>
              </section>;
            })}</div>}
    </section>
  );
};

const SummaryCard: React.FC<{ label: string; value: string }> = ({ label, value }) => <div className="rounded-xl border border-[#3282B8]/15 bg-[#182329] p-4"><div className="text-[10px] uppercase tracking-wider text-[#BBE1FA]/45">{label}</div><div className="mt-1 font-mono text-xl font-semibold text-white">{value}</div></div>;
const ShoppingCartIcon: React.FC = () => <Package className="h-5 w-5" />;
