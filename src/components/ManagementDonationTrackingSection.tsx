import React, { useState, useEffect, useMemo } from "react";
import {
  Coins,
  Target,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Calendar,
  Search,
  ChevronDown,
  ChevronUp,
  Info,
  Users,
  TrendingUp,
  Swords,
  Award,
  Check,
  X,
  ShieldCheck,
  Building2,
} from "lucide-react";
import {
  fetchManagementOverview,
  ManagementOverviewResponse,
  ManagementArmyItem,
  ManagementMemberItem,
} from "../services/wareraApi";

interface ManagementDonationTrackingSectionProps {
  currentMuId: string;
  onSelectArmy: (muId: string) => void;
}

export const ManagementDonationTrackingSection: React.FC<
  ManagementDonationTrackingSectionProps
> = ({ currentMuId, onSelectArmy }) => {
  const [data, setData] = useState<ManagementOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected date in YYYY-MM-DD
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
    }).format(new Date());
  });

  // Selected army for member drilldown view
  const [activeDrilldownMuId, setActiveDrilldownMuId] =
    useState<string>(currentMuId);

  // Member table filter & search
  const [memberSearch, setMemberSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState<
    "all" | "eligible" | "combat" | "completed" | "pending" | "exempt"
  >("all");

  const loadData = async (forceRefresh = false) => {
    if (forceRefresh) setIsRefreshing(true);
    else if (!data) setIsLoading(true);
    setError(null);
    try {
      const res = await fetchManagementOverview(selectedDate, forceRefresh);
      setData(res);
    } catch (err: any) {
      console.error("Error fetching management donation overview:", err);
      setError(err.message || "Bağış takip verileri yüklenemedi");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, [selectedDate]);

  // Keep activeDrilldownMuId in sync if currentMuId changes
  useEffect(() => {
    if (currentMuId) {
      setActiveDrilldownMuId(currentMuId);
    }
  }, [currentMuId]);

  const alliance = data?.alliance;
  const armies = data?.armies || [];

  // Active army for drilldown
  const activeArmy = useMemo(() => {
    return (
      armies.find((a) => a.muId === activeDrilldownMuId) || armies[0] || null
    );
  }, [armies, activeDrilldownMuId]);

  // Filtered members of active army
  const filteredMembers = useMemo(() => {
    if (!activeArmy?.members) return [];
    return activeArmy.members.filter((m) => {
      // Search query
      if (memberSearch.trim()) {
        const q = memberSearch.toLowerCase();
        if (
          !m.username.toLowerCase().includes(q) &&
          !m.userId.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      // Status filter
      if (memberFilter === "eligible" && !m.isEligible) return false;
      if (memberFilter === "combat" && m.playerMode !== "combat") return false;
      if (memberFilter === "completed" && m.status !== "completed")
        return false;
      if (
        memberFilter === "pending" &&
        (!m.isEligible || (m.status !== "pending" && m.status !== "partial"))
      )
        return false;
      if (memberFilter === "exempt" && m.isEligible) return false;
      return true;
    });
  }, [activeArmy, memberSearch, memberFilter]);

  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(new Date());
  const yesterdayDate = new Date(Date.now() - 24 * 3600 * 1000);
  const yesterdayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(yesterdayDate);

  return (
    <div className="w-full space-y-6 text-white font-mono bg-gradient-to-b from-[#182329] via-[#141C21] to-[#141C21] p-4 sm:p-6 rounded-2xl border border-emerald-500/35 shadow-2xl relative">
      {/* 1. ÜST BAŞLIK VE TARİH KONTROLLERİ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-emerald-500/20">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Coins className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase">
              YÖNETİM BAĞIŞ HEDEF & TAKİP SİSTEMİ
            </h1>
            <span
              className="text-emerald-400 hover:text-emerald-300 cursor-pointer text-sm"
              title="Ekonomi modundaki 30+ seviye oyuncuların katsayıları ve tarih bazlı bağış toplama takibi"
            >
              <Info className="w-4 h-4" />
            </span>
          </div>
          <p className="text-xs text-[#BBE1FA]/70 mt-1">
            Her ordunun hedef bağış miktarı (Ekonomi modunda ve 30+ seviye:
            servet &lt; 30k ise 1.5x, servet &ge; 30k ise 2.0x; Savaş modu ve
            &lt;30 Lv muaf)
          </p>
        </div>

        {/* Tarih Seçici ve Hızlı Butonlar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center rounded-xl bg-[#141C21] p-1 border border-emerald-500/30 text-xs shadow-inner">
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                selectedDate === todayStr
                  ? "bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 shadow-sm"
                  : "text-[#BBE1FA]/60 hover:text-white"
              }`}
            >
              Bugün
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(yesterdayStr)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                selectedDate === yesterdayStr
                  ? "bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 shadow-sm"
                  : "text-[#BBE1FA]/60 hover:text-white"
              }`}
            >
              Dün
            </button>
          </div>

          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-[#141C21] border border-emerald-500/40 text-xs text-emerald-200 focus:outline-none focus:border-emerald-400 cursor-pointer font-mono"
            />
          </div>

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-200 hover:text-white text-xs font-bold transition-all cursor-pointer shadow-md disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-emerald-400 ${isRefreshing ? "animate-spin" : ""}`}
            />
            <span>{isRefreshing ? "Hesaplanıyor..." : "Yenile"}</span>
          </button>
        </div>
      </div>

      {/* 2. FORMÜL & KURALLAR BİLGİ KUTUSU */}
      <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/35 p-3.5 text-xs text-emerald-200/90 space-y-1.5 shadow-md">
        <div className="flex items-center gap-2 font-bold text-emerald-300 uppercase tracking-wider text-[11px]">
          <Info className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>HEDEF BAĞIŞ HESAPLAMA KRİTERLERİ (EKONOMİ MODU ZORUNLU)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1 text-[11px] text-[#BBE1FA]/80">
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-[#141C21]/60 border border-emerald-500/20">
            <span className="text-emerald-400 font-black">1.5x</span>
            <span>Ekonomi & 30+ Lv & Servet &lt; 30k</span>
          </div>
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-[#141C21]/60 border border-emerald-500/20">
            <span className="text-yellow-400 font-black">2.0x</span>
            <span>Ekonomi & 30+ Lv & Servet &ge; 30k</span>
          </div>
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-[#141C21]/60 border border-rose-500/20">
            <span className="text-rose-400 font-black">Muaf</span>
            <span>Savaş Modundaki Oyuncular</span>
          </div>
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-[#141C21]/60 border border-slate-500/20">
            <span className="text-slate-400 font-black">Muaf</span>
            <span>30 Seviye Altı Oyuncular</span>
          </div>
        </div>
      </div>

      {/* 3. İTTİFAK TOPLAM GÖSTERGE KARTLARI (Hedef, Toplanan, Kalan, Başarı) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KART 1: TOPLAM HEDEF BAĞIŞ */}
        <div className="rounded-xl bg-[#182329]/80 border border-emerald-500/30 p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              TOPLAM HEDEF BAĞIŞ
            </span>
            <Target className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-300">
            {alliance?.donations?.totalTarget?.toLocaleString("tr-TR") ?? 0}
            <span className="text-xs font-normal text-emerald-400/80 ml-1.5">
              Gold
            </span>
          </div>
          <div className="text-[11px] text-[#BBE1FA]/60 mt-1">
            8 Ordunun 30+ Lv asker hedefleri toplamı
          </div>
        </div>

        {/* KART 2: TOPLANAN BAĞIŞ */}
        <div className="rounded-xl bg-[#182329]/80 border border-emerald-500/30 p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              TOPLANAN BAĞIŞ
            </span>
            <Coins className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400">
            {alliance?.donations?.totalCollected?.toLocaleString("tr-TR") ?? 0}
            <span className="text-xs font-normal text-emerald-400/80 ml-1.5">
              Gold
            </span>
          </div>
          <div className="text-[11px] text-[#BBE1FA]/60 mt-1">
            {selectedDate} tarihinde toplanan toplam miktar
          </div>
        </div>

        {/* KART 3: KALAN / EKSİK BAĞIŞ */}
        <div className="rounded-xl bg-[#182329]/80 border border-rose-500/30 p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-rose-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              KALAN / AÇIK
            </span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-400">
            {alliance?.donations?.totalRemaining?.toLocaleString("tr-TR") ?? 0}
            <span className="text-xs font-normal text-rose-400/80 ml-1.5">
              Gold
            </span>
          </div>
          <div className="text-[11px] text-[#BBE1FA]/60 mt-1">
            Hedefe ulaşmak için gereken miktar
          </div>
        </div>

        {/* KART 4: GENEL BAŞARI ORANI */}
        <div className="rounded-xl bg-[#182329]/80 border border-cyan-500/30 p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between text-cyan-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              GENEL BAŞARI ORANI
            </span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-cyan-400">
            %{alliance?.donations?.completionPercentage ?? 0}
          </div>
          <div className="w-full h-2 rounded-full bg-[#141C21] overflow-hidden p-0.5 border border-cyan-500/20 mt-1.5">
            <div
              style={{
                width: `${Math.min(100, alliance?.donations?.completionPercentage ?? 0)}%`,
              }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
            />
          </div>
        </div>
      </div>

      {/* 4. 8 ORDUNUN HEDEF VE TOPLANAN BAĞIŞ LİSTESİ */}
      <div className="rounded-xl bg-[#182329]/90 border border-emerald-500/30 overflow-hidden shadow-xl">
        <div className="p-3.5 bg-[#141C21] border-b border-emerald-500/20 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-xs uppercase tracking-wider text-emerald-200">
              8 ORDU BAĞIŞ HEDEF & GERÇEKLEŞME TABLOSU ({selectedDate})
            </span>
          </div>
          <span className="text-[11px] text-[#BBE1FA]/60">
            Asker bazlı detaylarını görmek istediğiniz ordunun satırına tıklayın
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="bg-[#141C21]/80 border-b border-emerald-500/20 text-[#BBE1FA]/70 text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4 text-center w-12">#</th>
                <th className="py-3 px-4">Ordu Adı</th>
                <th className="py-3 px-4 text-center">30+ Lv & Eko / Toplam</th>
                <th className="py-3 px-4 text-right">Hedef Bağış</th>
                <th className="py-3 px-4 text-right">Toplanan Bağış</th>
                <th className="py-3 px-4 text-right">Kalan</th>
                <th className="py-3 px-4 min-w-[180px]">Başarı Oranı</th>
                <th className="py-3 px-4 text-center w-28">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-500/15">
              {armies.map((army, idx) => {
                const isSelected = army.muId === activeDrilldownMuId;
                const d = army.donations;
                const pct = d.completionPercentage;
                const statusBadge =
                  pct >= 100 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
                      <Check className="w-3 h-3" /> Tamamlandı
                    </span>
                  ) : pct >= 50 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
                      <Clock className="w-3 h-3" /> Devam Ediyor
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/40 text-rose-300 text-[10px] font-bold">
                      <AlertCircle className="w-3 h-3" /> Kritik
                    </span>
                  );

                return (
                  <tr
                    key={army.muId}
                    onClick={() => {
                      setActiveDrilldownMuId(army.muId);
                      onSelectArmy(army.muId);
                    }}
                    className={`transition-colors cursor-pointer group ${
                      isSelected
                        ? "bg-emerald-950/40 border-l-4 border-l-emerald-400"
                        : "hover:bg-emerald-950/20"
                    }`}
                  >
                    {/* Sıra */}
                    <td className="py-3.5 px-4 text-center font-bold text-emerald-400">
                      #{idx + 1}
                    </td>

                    {/* Ordu Adı */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={army.avatarUrl}
                          alt={army.name}
                          className="w-8 h-8 rounded-lg object-cover border border-emerald-500/30 shrink-0"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              "https://media.warera.io/avatars/mu/mu-69c229c4449287ea1a26a5b3-1787680897144-8qglepbh.png";
                          }}
                        />
                        <div>
                          <div
                            className={`font-bold text-sm transition-colors ${isSelected ? "text-emerald-300" : "text-white group-hover:text-emerald-300"}`}
                          >
                            {army.name}
                          </div>
                          <div className="text-[10px] text-[#BBE1FA]/50">
                            {army.memberCount} Asker
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 30+ Seviye / Toplam */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#141C21] border border-emerald-500/30 text-emerald-200 text-xs font-bold">
                        <Users className="w-3 h-3 text-emerald-400" />
                        <span>
                          {d.eligibleMemberCount} / {army.memberCount}
                        </span>
                      </span>
                    </td>

                    {/* Hedef Bağış */}
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-300">
                      {d.targetDonation.toLocaleString("tr-TR")} Gold
                    </td>

                    {/* Toplanan Bağış */}
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-400">
                      {d.collectedDonation.toLocaleString("tr-TR")} Gold
                    </td>

                    {/* Kalan */}
                    <td className="py-3.5 px-4 text-right font-bold text-rose-400">
                      {d.remainingDonation.toLocaleString("tr-TR")} Gold
                    </td>

                    {/* Başarı Oranı Barı */}
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold text-emerald-300">
                            %{pct}
                          </span>
                          <span className="text-[10px] text-[#BBE1FA]/60">
                            {d.completedMemberCount} / {d.eligibleMemberCount}{" "}
                            Asker Tamamladı
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[#141C21] overflow-hidden p-0.5 border border-emerald-500/20">
                          <div
                            style={{ width: `${Math.min(100, pct)}%` }}
                            className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-400 transition-all duration-300"
                          />
                        </div>
                      </div>
                    </td>

                    {/* Durum */}
                    <td className="py-3.5 px-4 text-center">{statusBadge}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. SEÇİLİ ORDUNUN ASKER BAZLI DETAY LİSTESİ (Drilldown Table) */}
      {activeArmy && (
        <div className="rounded-xl bg-[#182329]/95 border border-emerald-500/35 overflow-hidden shadow-2xl mt-4">
          <div className="p-4 bg-[#141C21] border-b border-emerald-500/20 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src={activeArmy.avatarUrl}
                alt={activeArmy.name}
                className="w-9 h-9 rounded-lg object-cover border border-emerald-400 shrink-0"
              />
              <div>
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <span>
                    {activeArmy.name} - Asker Bazlı Günlük Hedef & Bağış
                    İncelemesi
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/40">
                    {selectedDate}
                  </span>
                </h3>
                <p className="text-xs text-[#BBE1FA]/60">
                  Toplam Hedef:{" "}
                  <strong className="text-emerald-300">
                    {activeArmy.donations.targetDonation} Gold
                  </strong>{" "}
                  | Toplanan:{" "}
                  <strong className="text-emerald-400">
                    {activeArmy.donations.collectedDonation} Gold
                  </strong>{" "}
                  | Kalan:{" "}
                  <strong className="text-rose-400">
                    {activeArmy.donations.remainingDonation} Gold
                  </strong>
                </p>
              </div>
            </div>

            {/* Arama ve Filtre Butonları */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-400" />
                <input
                  type="text"
                  placeholder="Asker ara..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg bg-[#182329] border border-emerald-500/30 text-xs text-white placeholder:text-[#BBE1FA]/40 focus:outline-none focus:border-emerald-400 w-36 sm:w-48 font-mono"
                />
              </div>

              {/* Filtre Switcher */}
              <div className="inline-flex items-center rounded-lg bg-[#141C21] p-0.5 border border-emerald-500/30 text-[11px] flex-wrap">
                <button
                  type="button"
                  onClick={() => setMemberFilter("all")}
                  className={`px-2.5 py-1 rounded transition-colors ${memberFilter === "all" ? "bg-emerald-950 text-emerald-300 font-bold" : "text-[#BBE1FA]/60 hover:text-white"}`}
                >
                  Tümü ({activeArmy.members.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMemberFilter("eligible")}
                  className={`px-2.5 py-1 rounded transition-colors ${memberFilter === "eligible" ? "bg-emerald-950 text-emerald-300 font-bold" : "text-[#BBE1FA]/60 hover:text-white"}`}
                >
                  Ekonomi & 30+ Lv ({activeArmy.donations.eligibleMemberCount})
                </button>
                <button
                  type="button"
                  onClick={() => setMemberFilter("combat")}
                  className={`px-2.5 py-1 rounded transition-colors ${memberFilter === "combat" ? "bg-rose-950 text-rose-300 font-bold" : "text-[#BBE1FA]/60 hover:text-white"}`}
                >
                  Savaş Modu (
                  {
                    activeArmy.members.filter((m) => m.playerMode === "combat")
                      .length
                  }
                  )
                </button>
                <button
                  type="button"
                  onClick={() => setMemberFilter("completed")}
                  className={`px-2.5 py-1 rounded transition-colors ${memberFilter === "completed" ? "bg-emerald-950 text-emerald-300 font-bold" : "text-[#BBE1FA]/60 hover:text-white"}`}
                >
                  Tamamlayan ({activeArmy.donations.completedMemberCount})
                </button>
                <button
                  type="button"
                  onClick={() => setMemberFilter("pending")}
                  className={`px-2.5 py-1 rounded transition-colors ${memberFilter === "pending" ? "bg-rose-950 text-rose-300 font-bold" : "text-[#BBE1FA]/60 hover:text-white"}`}
                >
                  Eksik
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="bg-[#141C21]/80 border-b border-emerald-500/20 text-[#BBE1FA]/70 text-[11px] uppercase tracking-wider">
                  <th className="py-2.5 px-4 text-center w-12">#</th>
                  <th className="py-2.5 px-4">Asker Adı & Rütbe</th>
                  <th className="py-2.5 px-4 text-center">Mod</th>
                  <th className="py-2.5 px-4 text-center">Seviye</th>
                  <th className="py-2.5 px-4 text-right">Servet (Wealth)</th>
                  <th className="py-2.5 px-4 text-center">Katsayı</th>
                  <th className="py-2.5 px-4 text-right">Bireysel Hedef</th>
                  <th className="py-2.5 px-4 text-right">
                    {selectedDate} Bağışı
                  </th>
                  <th className="py-2.5 px-4 text-right">Kalan</th>
                  <th className="py-2.5 px-4 text-center w-32">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-500/15">
                {filteredMembers.map((m, idx) => {
                  let badge = (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px]">
                      <ShieldCheck className="w-3 h-3 text-slate-400" /> &lt;30
                      Lv (Muaf)
                    </span>
                  );
                  if (
                    m.playerMode === "combat" ||
                    m.exemptReason === "combat_mode"
                  ) {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/70 border border-rose-500/30 text-rose-300 text-[10px] font-bold">
                        <Swords className="w-3 h-3 text-rose-400" /> Savaş Modu
                        (Muaf)
                      </span>
                    );
                  } else if (m.isEligible) {
                    if (m.status === "completed") {
                      badge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
                          <Check className="w-3 h-3" /> Tamamladı
                        </span>
                      );
                    } else if (m.status === "partial") {
                      badge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
                          <Clock className="w-3 h-3" /> Kısmi Bağış
                        </span>
                      );
                    } else {
                      badge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/90 border border-rose-500/40 text-rose-300 text-[10px] font-bold">
                          <AlertCircle className="w-3 h-3" /> Bekliyor
                        </span>
                      );
                    }
                  }

                  return (
                    <tr
                      key={m.userId}
                      className="hover:bg-emerald-950/20 transition-colors"
                    >
                      <td className="py-2.5 px-4 text-center text-[#BBE1FA]/50">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-white text-xs">
                          {m.username}
                        </div>
                        <div className="text-[10px] text-[#BBE1FA]/50 capitalize">
                          {m.role}
                        </div>
                      </td>
                      {/* Oyuncu Modu (Beceriye Dayalı) */}
                      <td className="py-2.5 px-4 text-center">
                        {m.playerMode === "economy" ? (
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
                              <TrendingUp className="w-3 h-3 text-emerald-400" />
                              <span>Ekonomi</span>
                            </span>
                            {m.totalSkillPoints ? (
                              <span
                                className="text-[9px] text-emerald-400/80 font-mono mt-0.5"
                                title={`Ekonomi Beceri Puanı: ${m.ecoSkillPoints} / Toplam Harcanan: ${m.totalSkillPoints} SP`}
                              >
                                {m.ecoSkillPoints} / {m.totalSkillPoints} SP
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/40 text-rose-300 text-[10px] font-bold">
                              <Swords className="w-3 h-3 text-rose-400" />
                              <span>Savaş</span>
                            </span>
                            {m.totalSkillPoints ? (
                              <span
                                className="text-[9px] text-rose-400/70 font-mono mt-0.5"
                                title={`Ekonomi Beceri Puanı: ${m.ecoSkillPoints} / Toplam Harcanan: ${m.totalSkillPoints} SP`}
                              >
                                {m.ecoSkillPoints} / {m.totalSkillPoints} SP
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-center font-bold text-emerald-300">
                        Lv.{m.level}
                      </td>
                      <td className="py-2.5 px-4 text-right text-[#BBE1FA]/80">
                        {m.wealth.toLocaleString("tr-TR")} Gold
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {m.isEligible ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${m.multiplier === 2 ? "bg-yellow-950 text-yellow-300 border border-yellow-500/30" : "bg-emerald-950 text-emerald-300 border border-emerald-500/30"}`}
                          >
                            {m.multiplier}x
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#BBE1FA]/40">
                            -
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-emerald-300">
                        {m.targetDonation > 0
                          ? `${m.targetDonation} Gold`
                          : "-"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                        {m.collectedDonation > 0
                          ? `${m.collectedDonation} Gold`
                          : "0 Gold"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-rose-400">
                        {m.remainingDonation > 0
                          ? `${m.remainingDonation} Gold`
                          : "0 Gold"}
                      </td>
                      <td className="py-2.5 px-4 text-center">{badge}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
