import React, { useState, useEffect } from "react";
import {
  Heart,
  Flame,
  Swords,
  Shield,
  RefreshCw,
  TrendingUp,
  Users,
  Info,
  Clock,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Award,
} from "lucide-react";
import {
  fetchManagementOverview,
  ManagementOverviewResponse,
  ManagementArmyItem,
} from "../services/wareraApi";
import { ActiveTab } from "../App";

interface ManagementArmyTrackingSectionProps {
  onSelectArmy: (muId: string) => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

function formatDmg(value: number): string {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + "B";
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(1) + "K";
  return value.toLocaleString("tr-TR");
}

export const ManagementArmyTrackingSection: React.FC<
  ManagementArmyTrackingSectionProps
> = ({ onSelectArmy, onNavigateTab }) => {
  const [data, setData] = useState<ManagementOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const loadData = async (forceRefresh = false) => {
    if (forceRefresh) setIsRefreshing(true);
    else if (!data) setIsLoading(true);
    setError(null);
    try {
      const res = await fetchManagementOverview(undefined, forceRefresh);
      setData(res);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      console.error("Error loading management army tracking:", err);
      setError(err.message || "Veriler alınamadı");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
    const interval = setInterval(() => {
      loadData(false);
    }, 25000);
    return () => clearInterval(interval);
  }, []);

  const handleGoToArmyDamage = (armyId: string) => {
    onSelectArmy(armyId);
    onNavigateTab("combatDamage");
  };

  const alliance = data?.alliance;
  const armies = data?.armies || [];

  // Sort armies by today's damage descending
  const sortedArmies = [...armies].sort((a, b) => {
    if (b.todayDamage !== a.todayDamage) return b.todayDamage - a.todayDamage;
    return b.health.percentage - a.health.percentage;
  });

  return (
    <div className="w-full space-y-6 text-white font-mono bg-gradient-to-b from-[#1C242B] to-[#141C21] p-4 sm:p-6 rounded-2xl border border-amber-500/30 shadow-2xl relative">
      {/* 1. ÜST BAŞLIK VE KONTROLLER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-amber-500/20">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-950/80 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Shield className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase">
              ORDU TAKİBİ & HARBE HAZIRLIK
            </h1>
            <span
              className="text-amber-400 hover:text-amber-300 cursor-pointer text-sm"
              title="8 ordunun anlık can, açlık doluluk oranları ve günlük toplam hasar tablosu"
            >
              <Info className="w-4 h-4" />
            </span>
          </div>
          <p className="text-xs text-[#BBE1FA]/70 mt-1">
            8 Türk ordusunun anlık toplam can ve açlık barı doluluk oranları ile
            02:55 TSİ bazlı günlük hasarları
          </p>
        </div>

        {/* Canlı Yenileme ve Zaman Rozeti */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#141C21] border border-amber-500/30 text-xs text-amber-300 shadow-inner">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Son Güncelleme: </span>
            <span className="font-bold text-white">
              {lastRefreshedAt.toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/80 hover:bg-amber-900 border border-amber-500/40 text-amber-200 hover:text-white text-xs font-bold transition-all cursor-pointer shadow-md disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-amber-400 ${isRefreshing ? "animate-spin" : ""}`}
            />
            <span>{isRefreshing ? "Yenileniyor..." : "Tazele"}</span>
          </button>
        </div>
      </div>

      {/* 2. ÜST 3 BÜYÜK GÖSTERGE KARTI (İttifak Toplam Can, Açlık, Günlük Hasar) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KART 1: İTTİFAK TOPLAM CAN DOLULUK ORANI */}
        <div className="rounded-xl bg-[#182329] border border-rose-500/30 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-rose-400">
              <div className="w-7 h-7 rounded-lg bg-rose-950/80 border border-rose-500/30 flex items-center justify-center">
                <Heart className="w-4 h-4 text-rose-400" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider">
                İTTİFAK TOPLAM CAN
              </span>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-500/30">
              8 Ordu
            </span>
          </div>

          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-rose-400">
                %{alliance?.totalHealth?.percentage ?? 0}
              </span>
              <span className="text-xs text-[#BBE1FA]/60">Doluluk</span>
            </div>
            <div className="text-xs text-[#BBE1FA]/70 mt-1 font-mono">
              {alliance?.totalHealth?.current?.toLocaleString("tr-TR") ?? 0} /{" "}
              {alliance?.totalHealth?.max?.toLocaleString("tr-TR") ?? 0} HP
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2.5 rounded-full bg-[#141C21] overflow-hidden p-0.5 border border-rose-500/20 mt-2">
            <div
              style={{
                width: `${Math.min(100, alliance?.totalHealth?.percentage ?? 0)}%`,
              }}
              className="h-full rounded-full bg-gradient-to-r from-rose-600 via-rose-500 to-emerald-400 transition-all duration-500"
            />
          </div>
        </div>

        {/* KART 2: İTTİFAK TOPLAM AÇLIK DOLULUK ORANI */}
        <div className="rounded-xl bg-[#182329] border border-amber-500/30 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-amber-400">
              <div className="w-7 h-7 rounded-lg bg-amber-950/80 border border-amber-500/30 flex items-center justify-center">
                <Flame className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider">
                İTTİFAK TOPLAM AÇLIK
              </span>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-500/30">
              Canlı Enerji
            </span>
          </div>

          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-amber-400">
                %{alliance?.totalHunger?.percentage ?? 0}
              </span>
              <span className="text-xs text-[#BBE1FA]/60">Doluluk</span>
            </div>
            <div className="text-xs text-[#BBE1FA]/70 mt-1 font-mono">
              {alliance?.totalHunger?.current?.toLocaleString("tr-TR") ?? 0} /{" "}
              {alliance?.totalHunger?.max?.toLocaleString("tr-TR") ?? 0} Açlık
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2.5 rounded-full bg-[#141C21] overflow-hidden p-0.5 border border-amber-500/20 mt-2">
            <div
              style={{
                width: `${Math.min(100, alliance?.totalHunger?.percentage ?? 0)}%`,
              }}
              className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-300 transition-all duration-500"
            />
          </div>
        </div>

        {/* KART 3: İTTİFAK GÜNLÜK TOPLAM HASAR */}
        <div className="rounded-xl bg-[#182329] border border-cyan-500/30 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-cyan-400">
              <div className="w-7 h-7 rounded-lg bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center">
                <Swords className="w-4 h-4 text-cyan-400" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider">
                İTTİFAK GÜNLÜK HASAR
              </span>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
              02:55 TSİ Bazlı
            </span>
          </div>

          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-cyan-400">
                {formatDmg(alliance?.totalTodayDamage ?? 0)}
              </span>
              <span className="text-xs font-bold text-cyan-300">DMG</span>
            </div>
            <div className="text-xs text-[#BBE1FA]/70 mt-1 font-mono">
              Toplam {alliance?.totalMembers ?? 0} Savaşçı Bünyesinde
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-[#BBE1FA]/80 pt-2 border-t border-cyan-500/20">
            <span>Lider Birlik:</span>
            <span className="font-bold text-amber-300">
              {sortedArmies[0]?.name || "Turkic Tribe"} (
              {formatDmg(sortedArmies[0]?.todayDamage || 0)})
            </span>
          </div>
        </div>
      </div>

      {/* 3. 8 ORDU CANLI TABLOSU */}
      <div className="rounded-xl bg-[#182329] border border-amber-500/25 overflow-hidden shadow-xl">
        <div className="p-3.5 bg-[#141C21] border-b border-amber-500/20 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-xs uppercase tracking-wider text-amber-200">
              8 ORDU HARBE HAZIRLIK & CANLI HASAR LİSTESİ
            </span>
          </div>
          <span className="text-[11px] text-[#BBE1FA]/60">
            Can ve açlık barları her 25 saniyede otomatik tazelenir
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="bg-[#141C21]/80 border-b border-amber-500/20 text-[#BBE1FA]/70 text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4 text-center w-12">#</th>
                <th className="py-3 px-4">Ordu Adı</th>
                <th className="py-3 px-4 text-center">Asker</th>
                <th className="py-3 px-4 min-w-[200px]">
                  Can Doluluk Oranı (HP)
                </th>
                <th className="py-3 px-4 min-w-[200px]">Açlık Doluluk Oranı</th>
                <th className="py-3 px-4 text-right">Bugünkü Hasar</th>
                <th className="py-3 px-4 text-center w-28">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3282B8]/15">
              {sortedArmies.map((army, idx) => {
                const healthColor =
                  army.health.percentage >= 75
                    ? "text-emerald-400"
                    : army.health.percentage >= 45
                      ? "text-amber-400"
                      : "text-rose-400";

                const hungerColor =
                  army.hunger.percentage >= 75
                    ? "text-amber-400"
                    : army.hunger.percentage >= 45
                      ? "text-yellow-400"
                      : "text-rose-400";

                return (
                  <tr
                    key={army.muId}
                    className="hover:bg-amber-950/20 transition-colors group cursor-pointer"
                    onClick={() => handleGoToArmyDamage(army.muId)}
                  >
                    {/* Sıra */}
                    <td className="py-3.5 px-4 text-center font-bold text-amber-400">
                      #{idx + 1}
                    </td>

                    {/* Ordu Adı & Avatar */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={army.avatarUrl}
                          alt={army.name}
                          className="w-8 h-8 rounded-lg object-cover border border-amber-500/30 group-hover:border-amber-400 transition-colors shrink-0"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              "https://media.warera.io/avatars/mu/mu-69c229c4449287ea1a26a5b3-1787680897144-8qglepbh.png";
                          }}
                        />
                        <div>
                          <div className="font-bold text-white group-hover:text-amber-300 transition-colors text-sm">
                            {army.name}
                          </div>
                          <div className="text-[10px] text-[#BBE1FA]/50 font-sans">
                            ID: {army.muId.slice(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Asker Sayısı */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#141C21] border border-amber-500/30 text-amber-200 text-xs font-bold">
                        <Users className="w-3 h-3 text-amber-400" />
                        <span>{army.memberCount}</span>
                      </span>
                    </td>

                    {/* Can Doluluk Oranı */}
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className={`font-bold ${healthColor}`}>
                            %{army.health.percentage}
                          </span>
                          <span className="text-[11px] text-[#BBE1FA]/70">
                            {army.health.current.toLocaleString("tr-TR")} /{" "}
                            {army.health.max.toLocaleString("tr-TR")} HP
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[#141C21] overflow-hidden p-0.5 border border-rose-500/20">
                          <div
                            style={{
                              width: `${Math.min(100, army.health.percentage)}%`,
                            }}
                            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-emerald-400 transition-all duration-300"
                          />
                        </div>
                      </div>
                    </td>

                    {/* Açlık Doluluk Oranı */}
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className={`font-bold ${hungerColor}`}>
                            %{army.hunger.percentage}
                          </span>
                          <span className="text-[11px] text-[#BBE1FA]/70">
                            {army.hunger.current.toLocaleString("tr-TR")} /{" "}
                            {army.hunger.max.toLocaleString("tr-TR")}
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[#141C21] overflow-hidden p-0.5 border border-amber-500/20">
                          <div
                            style={{
                              width: `${Math.min(100, army.hunger.percentage)}%`,
                            }}
                            className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-300 transition-all duration-300"
                          />
                        </div>
                      </div>
                    </td>

                    {/* Bugünkü Hasar */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold text-rose-400 text-sm">
                        {formatDmg(army.todayDamage)} DMG
                      </div>
                      <div className="text-[10px] text-[#BBE1FA]/50">
                        Haftalık: {formatDmg(army.weeklyDamage)}
                      </div>
                    </td>

                    {/* Aksiyon */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGoToArmyDamage(army.muId);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#141C21] hover:bg-amber-950/60 border border-amber-500/30 hover:border-amber-400 text-amber-200 hover:text-white text-[11px] transition-all cursor-pointer"
                        title="Bu ordunun hasar detay sayfasına git"
                      >
                        <span>Detay</span>
                        <ChevronRight className="w-3 h-3 text-amber-400" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
