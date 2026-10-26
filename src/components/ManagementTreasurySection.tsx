import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Coins, Landmark, RefreshCw, Wallet } from "lucide-react";
import { fetchManagementTreasury, ManagementTreasuryResponse } from "../services/wareraApi";

const ANCHOR_KEY = "nizam-turkey-treasury-anchor-v1";
type Anchor = { balance: number; at: string };

function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("tr-TR")} Gold`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function readAnchor(): Anchor | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(ANCHOR_KEY) || "null");
    return value && Number.isFinite(Number(value.balance)) && value.at ? value : null;
  } catch {
    return null;
  }
}

export const ManagementTreasurySection: React.FC = () => {
  const [data, setData] = useState<ManagementTreasuryResponse | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [balanceDraft, setBalanceDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (force = false) => {
    if (force) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const result = await fetchManagementTreasury(force);
      setData(result);
    } catch (err: any) {
      setError(err.message || "Hazine verileri yüklenemedi");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setAnchor(readAnchor());
    load();
  }, []);

  const estimate = useMemo(() => {
    if (!anchor || !data) return null;
    const anchorTime = new Date(anchor.at).getTime();
    const knownFlow = data.transactions
      .filter((tx) => new Date(tx.createdAt).getTime() > anchorTime)
      .reduce((sum, tx) => sum + tx.flow, 0);
    return {
      value: anchor.balance + knownFlow,
      knownFlow,
      hours: Math.max(0, (Date.now() - anchorTime) / 3600000),
      olderThanHistory: Date.now() - anchorTime > 30 * 24 * 60 * 60 * 1000,
    };
  }, [anchor, data]);

  const saveAnchor = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(balanceDraft.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(value) || value < 0) return;
    const next = { balance: value, at: new Date().toISOString() };
    window.localStorage.setItem(ANCHOR_KEY, JSON.stringify(next));
    setAnchor(next);
    setBalanceDraft("");
  };

  const maxFlow = Math.max(1, ...(data?.days.map((day) => Math.abs(day.netFlow)) || []));

  return <div className="w-full space-y-5 text-white font-mono">
    <section className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-[#182329] to-[#141C21] p-4 sm:p-6 shadow-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex items-center gap-2 text-amber-200"><Landmark className="h-5 w-5" /><h1 className="text-lg font-black tracking-wide">TÜRKİYE HAZİNE TAKİBİ</h1></div><p className="mt-1 text-xs text-[#BBE1FA]/60">Bağış ve ülkeler arası transferler kesin hareket olarak işlenir. Piyasa satışı tutarı yalnızca bilgi amaçlı gösterilir.</p></div>
        <button type="button" onClick={() => load(true)} disabled={loading || refreshing} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#3282B8]/35 bg-[#0F4C75]/35 px-3 py-2 text-xs font-bold text-[#BBE1FA] hover:bg-[#0F4C75]/60 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />Yenile</button>
      </div>
      {error && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-200"><span>{error}</span><button type="button" onClick={() => load(true)} className="rounded-lg border border-rose-500/30 px-3 py-1.5 font-bold">Tekrar dene</button></div>}
      {loading && <div className="mt-4 rounded-xl border border-[#3282B8]/20 bg-[#141C21] p-3 text-xs text-[#BBE1FA]/65">Türkiye hazine işlemleri WarEra’dan getiriliyor…</div>}
    </section>

    {data && <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Vatandaş bağışları · 7 gün", value: data.totals.donations7d, icon: Coins, note: "Ülkeye gelen bağış işlemleri" },
          { label: "Transfer neti · 7 gün", value: data.totals.transfersIn7d - data.totals.transfersOut7d, icon: Wallet, note: `${formatMoney(data.totals.transfersIn7d)} giriş · ${formatMoney(data.totals.transfersOut7d)} çıkış` },
          { label: "Net hazine hareketi · 7 gün", value: data.totals.netFlow7d, icon: Landmark, note: "Bağışlar ve ülke transferleri" },
          { label: "Piyasa satışları · 24 saat", value: data.totals.sales24h, icon: ArrowUpRight, note: "Brüt satış; hazine bakiyesine eklenmez" },
        ].map((card) => { const Icon = card.icon; return <div key={card.label} className="rounded-xl border border-amber-500/15 bg-[#182329]/90 p-4 shadow-lg">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-[#BBE1FA]/55"><span>{card.label}</span><Icon className="h-4 w-4 text-amber-300" /></div>
          <div className={`mt-2 text-xl font-black ${card.value < 0 ? "text-rose-300" : "text-amber-100"}`}>{formatMoney(card.value)}</div>
          <div className="mt-1 text-[10px] text-[#BBE1FA]/40">{card.note}</div>
        </div>; })}
      </div>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-xl border border-amber-500/20 bg-[#182329]/80 p-4 shadow-lg">
          <div className="mb-4 flex items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-amber-100">Günlük net hareket</h2><p className="mt-1 text-[10px] text-[#BBE1FA]/45">Son 14 oyun günü · sıfırlama 03:00 UTC</p></div><span className="text-[10px] text-[#BBE1FA]/40">{data.days.length} gün</span></div>
          <div className="flex h-44 items-end gap-1.5 sm:gap-2">{data.days.map((day) => {
            const height = Math.max(4, (Math.abs(day.netFlow) / maxFlow) * 100);
            return <div key={day.day} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={`${day.day}: ${formatMoney(day.netFlow)} net`}>
              <div className={`mb-1 truncate text-center text-[8px] ${day.netFlow < 0 ? "text-rose-300" : "text-emerald-300"}`}>{Math.abs(day.netFlow) >= 1000 ? `${(day.netFlow / 1000).toFixed(0)}k` : Math.round(day.netFlow)}</div>
              <div className={`w-full rounded-t-sm ${day.netFlow < 0 ? "bg-rose-500/70" : "bg-emerald-500/75"}`} style={{ height: `${height}%` }} />
              <div className="mt-1 truncate text-center text-[8px] text-[#BBE1FA]/40">{day.day.slice(5)}</div>
            </div>;
          })}</div>
          <div className="mt-3 flex flex-wrap gap-3 text-[9px] text-[#BBE1FA]/45"><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-500/75" />Net giriş</span><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-rose-500/70" />Net çıkış</span></div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-[#182329]/80 p-4 shadow-lg">
          <div className="flex items-center gap-2 text-amber-100"><Wallet className="h-4 w-4" /><h2 className="text-sm font-bold">Görünen hazine bakiyesi</h2></div>
          {estimate ? <>
            <div className="mt-4 text-2xl font-black text-amber-100">{formatMoney(estimate.value)}</div>
            <div className="mt-2 rounded-lg bg-[#141C21] p-3 text-[10px] text-[#BBE1FA]/60"><div>Girilen bakiye <b className="text-white">{formatMoney(anchor!.balance)}</b></div><div className="mt-1">Sonraki bilinen hareketler <b className={estimate.knownFlow < 0 ? "text-rose-300" : "text-emerald-300"}>{estimate.knownFlow >= 0 ? "+" : "−"}{formatMoney(Math.abs(estimate.knownFlow))}</b></div><div className="mt-1">Bakiye giriş zamanı <b className="text-white">{formatDate(anchor!.at)}</b></div></div>
            <p className="mt-3 text-[10px] leading-relaxed text-[#BBE1FA]/45">Hesaplama, oyunda gördüğünüz son bakiyeye bu tarihten sonra kaydedilen bağış ve transferleri ekler. Günlük vergi geliri eklenmez.</p>
            {estimate.olderThanHistory && <p className="mt-2 rounded-lg border border-amber-500/20 bg-amber-950/20 p-2 text-[10px] text-amber-200">Girilen bakiye 30 günden eski; görünen işlem geçmişi bu yüzden kısmi olabilir.</p>}
          </> : <p className="mt-3 text-xs leading-relaxed text-[#BBE1FA]/50">Oyunda görünen mevcut hazineyi girin. Sonraki kesin bağış ve ülke transferleri bu değere eklenerek tahmini bakiye hesaplanır.</p>}
          <form onSubmit={saveAnchor} className="mt-4 flex gap-2"><input value={balanceDraft} onChange={(e) => setBalanceDraft(e.target.value)} inputMode="decimal" placeholder="Oyundaki hazine (Gold)" className="min-w-0 flex-1 rounded-lg border border-amber-500/20 bg-[#141C21] px-3 py-2 text-xs text-white placeholder:text-[#BBE1FA]/30" /><button type="submit" disabled={!balanceDraft} className="shrink-0 rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-40">Bakiyeyi kaydet</button></form>
          {anchor && <button type="button" onClick={() => { window.localStorage.removeItem(ANCHOR_KEY); setAnchor(null); }} className="mt-2 text-[10px] text-[#BBE1FA]/35 hover:text-rose-300">Girilen bakiyeyi sil</button>}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="overflow-hidden rounded-xl border border-amber-500/20 bg-[#182329]/80 shadow-lg">
          <div className="border-b border-amber-500/15 bg-[#141C21] p-4"><h2 className="text-sm font-bold text-amber-100">Son ülke işlemleri</h2><p className="mt-1 text-[10px] text-[#BBE1FA]/45">Son 30 gün içinden en güncel 100 işlem · son güncelleme {formatDate(data.fetchedAt)}</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="text-[9px] uppercase text-[#BBE1FA]/40"><tr><th className="px-4 py-3">İşlem</th><th className="px-3 py-3">Oyuncu / karşı taraf</th><th className="px-3 py-3">Tarih</th><th className="px-4 py-3 text-right">Hareket</th></tr></thead><tbody className="divide-y divide-amber-500/10">{data.transactions.slice(0, 100).map((tx) => <tr key={tx.id} className="hover:bg-amber-950/10"><td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-[#BBE1FA]/75">{tx.flow < 0 ? <ArrowUpRight className="h-3.5 w-3.5 text-rose-300" /> : <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-300" />}{tx.category}<span className="text-[9px] text-[#BBE1FA]/35">{tx.direction}</span></span></td><td className="max-w-48 truncate px-3 py-3 text-[#BBE1FA]/65">{tx.player || tx.counterparty || "—"}</td><td className="px-3 py-3 text-[10px] text-[#BBE1FA]/40">{formatDate(tx.createdAt)}</td><td className={`px-4 py-3 text-right font-bold ${tx.flow < 0 ? "text-rose-300" : tx.flow > 0 ? "text-emerald-300" : "text-[#BBE1FA]/60"}`}>{tx.flow ? `${tx.flow > 0 ? "+" : "−"}${formatMoney(Math.abs(tx.flow))}` : formatMoney(tx.amount)}</td></tr>)}</tbody></table>{data.transactions.length === 0 && <div className="p-8 text-center text-xs text-[#BBE1FA]/45">Son 30 günde ülke işlemi bulunamadı.</div>}</div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-[#182329]/80 p-4 shadow-lg"><h2 className="text-sm font-bold text-amber-100">En çok bağış yapanlar</h2><p className="mt-1 text-[10px] text-[#BBE1FA]/45">Son 30 gün</p><div className="mt-3 space-y-2">{data.topDonors.slice(0, 12).map((donor, index) => <div key={`${donor.player}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-[#141C21]/70 px-3 py-2"><span className="min-w-0 truncate text-xs text-[#BBE1FA]/75">{index + 1}. {donor.player}</span><b className="shrink-0 text-xs text-emerald-300">{formatMoney(donor.amount)}</b></div>)}{data.topDonors.length === 0 && <div className="text-xs text-[#BBE1FA]/45">Bağış kaydı bulunamadı.</div>}</div></div>
      </section>
      <p className="rounded-xl border border-[#3282B8]/15 bg-[#141C21]/70 p-3 text-[10px] leading-relaxed text-[#BBE1FA]/45">{data.note} Hazine bakiyesi ve manuel kayıt bu tarayıcıda saklanır; gelir vergisi ve dışarıdaki vatandaşlardan gelen pay bu ekranda tahmin edilmez.</p>
    </>}
  </div>;
};
