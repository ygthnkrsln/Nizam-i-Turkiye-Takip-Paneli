import React, { useState, useMemo } from 'react';
import { PlayerStats, SortDirection, FactoryItem } from '../types';
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Search, 
  RefreshCw,
  Building2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Boxes,
  MapPin,
  Lock
} from 'lucide-react';

interface ArmyStatsTableProps {
  players: PlayerStats[];
  isLoading: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  muName?: string;
}

type ArmySortField = 'username' | 'level' | 'factoryCount' | 'totalAutomatedLevel';

export const ArmyStatsTable: React.FC<ArmyStatsTableProps> = ({
  players,
  isLoading,
  onRefresh,
  isRefreshing = false,
  muName = 'Turkic Tribe',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<ArmySortField>('factoryCount');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set());

  // Aggregate stats for footer
  const summary = useMemo(() => {
    let totalActiveFactories = 0;
    let totalActiveEnginePower = 0;

    players.forEach((p) => {
      const activeFCount = p.factoryCount ?? p.activeFactoryCount ?? (p.factories?.length || 0);
      totalActiveFactories += activeFCount;
      totalActiveEnginePower += p.totalAutomatedLevel || 0;
    });

    return {
      totalActiveFactories,
      totalActiveEnginePower,
    };
  }, [players]);

  const handleSort = (field: ArmySortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'username' ? 'asc' : 'desc');
    }
  };

  const togglePlayerExpand = (userId: string) => {
    setExpandedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const formatLastLogin = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  // Helper for human-readable item translations, codes and icons
  const getItemDetails = (itemCode: string) => {
    const code = (itemCode || '').toLowerCase();
    if (code.includes('fish')) return { name: 'Balık', icon: '🐟', color: 'text-cyan-400' };
    if (code.includes('lead')) return { name: 'Kurşun', icon: '🪨', color: 'text-slate-400' };
    if (code.includes('iron')) return { name: 'Demir', icon: '⛏️', color: 'text-slate-300' };
    if (code.includes('grain') || code.includes('wheat')) return { name: 'Tahıl', icon: '🌾', color: 'text-amber-300' };
    if (code.includes('bread') || code.includes('food')) return { name: 'Ekmek', icon: '🍞', color: 'text-amber-400' };
    if (code.includes('oil')) return { name: 'Petrol', icon: '🛢️', color: 'text-amber-500' };
    if (code.includes('tank')) return { name: 'Tank', icon: '🛡️', color: 'text-emerald-400' };
    if (code.includes('weapon') || code.includes('gun')) return { name: 'Silah', icon: '⚔️', color: 'text-red-400' };
    if (code.includes('ammo')) return { name: 'Mühimmat', icon: '💥', color: 'text-orange-400' };
    return { name: itemCode || 'Ürün', icon: '📦', color: 'text-[#BBE1FA]' };
  };

  const filteredAndSortedPlayers = useMemo(() => {
    return players
      .filter((player) => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
          player.username.toLowerCase().includes(query) ||
          player.userId.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        let aVal: any = 0;
        let bVal: any = 0;

        switch (sortField) {
          case 'username':
            aVal = a.username.toLowerCase();
            bVal = b.username.toLowerCase();
            return sortDirection === 'asc'
              ? aVal.localeCompare(bVal)
              : bVal.localeCompare(aVal);
          case 'level':
            aVal = a.level || 0;
            bVal = b.level || 0;
            break;
          case 'factoryCount':
            aVal = a.factoryCount ?? a.activeFactoryCount ?? 0;
            bVal = b.factoryCount ?? b.activeFactoryCount ?? 0;
            break;
          case 'totalAutomatedLevel':
            aVal = a.totalAutomatedLevel || 0;
            bVal = b.totalAutomatedLevel || 0;
            break;
          default:
            aVal = a.factoryCount || 0;
            bVal = b.factoryCount || 0;
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
  }, [players, searchQuery, sortField, sortDirection]);

  const renderSortIndicator = (field: ArmySortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-[#BBE1FA]/40 group-hover:text-[#BBE1FA] transition-colors ml-1" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-[#3282B8] ml-1" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-[#3282B8] ml-1" />
    );
  };

  return (
    <div id="army-stats-table-container" className="bg-[#182329]/95 border border-[#3282B8]/25 rounded-xl overflow-hidden shadow-2xl shadow-black/40 backdrop-blur-sm">
      {/* Table Header & Toolbar */}
      <div className="p-4 border-b border-[#3282B8]/15 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#141C21]/60">
        <div className="flex items-center gap-3 flex-1">
          {/* Search Input */}
          <div className="w-full sm:w-80 relative group">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#3282B8] group-focus-within:text-white transition-colors" />
            <input
              id="army-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Asker veya oyuncu adına göre ara..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-[#3282B8]/30 focus:border-[#3282B8] bg-[#182329] text-white placeholder:text-[#BBE1FA]/40 focus:outline-none focus:ring-1 focus:ring-[#3282B8]/50 transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[#BBE1FA]/60 hover:text-white transition-colors"
              >
                ×
              </button>
            )}
          </div>

          <span className="hidden sm:inline-block text-xs text-[#BBE1FA]/70 font-mono">
            Toplam <span className="text-white font-bold">{filteredAndSortedPlayers.length}</span> asker listelendi
          </span>
        </div>

        {/* Action Toolbar: Yenile Butonu (Bağış paneliyle uyumlu sade tasarım) */}
        {onRefresh && (
          <div className="flex items-center justify-end shrink-0">
            <button
              id="army-table-refresh-btn"
              type="button"
              onClick={onRefresh}
              disabled={isLoading || isRefreshing}
              title="Ordu ve fabrika verilerini API'den yenile"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[#141C21] hover:bg-[#0F4C75]/40 text-[#BBE1FA] hover:text-white border border-[#3282B8]/30 transition-all disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${(isLoading || isRefreshing) ? 'animate-spin text-[#BBE1FA]' : 'text-[#3282B8]'}`} />
              <span>Yenile</span>
            </button>
          </div>
        )}
      </div>

      {/* Ana Tablo (3 Sütun) */}
      <div className="overflow-x-auto">
        <table id="army-stats-data-table" className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#3282B8]/20 bg-[#141C21]/90 text-[11px] font-semibold text-[#BBE1FA]/80 uppercase tracking-widest font-mono select-none">
              {/* 1. Sütun: Asker / Oyuncu */}
              <th
                onClick={() => handleSort('username')}
                className="py-3.5 px-4 cursor-pointer hover:text-white group min-w-[240px]"
              >
                <div className="flex items-center">
                  <span>Asker / Oyuncu</span>
                  {renderSortIndicator('username')}
                </div>
              </th>

              {/* 2. Sütun: Oyuncu Seviyesi */}
              <th
                onClick={() => handleSort('level')}
                className="py-3.5 px-4 cursor-pointer hover:text-white group min-w-[150px]"
              >
                <div className="flex items-center">
                  <span>Oyuncu Seviyesi</span>
                  {renderSortIndicator('level')}
                </div>
              </th>

              {/* 3. Sütun: Fabrika Sayısı ve Otomatik Seviyesi */}
              <th
                onClick={() => handleSort('factoryCount')}
                className="py-3.5 px-4 cursor-pointer hover:text-white group min-w-[340px]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span>Fabrika Sayısı & Otomatik Seviye</span>
                    {renderSortIndicator('factoryCount')}
                  </div>
                  <span className="text-[10px] text-[#BBE1FA]/50 font-normal lowercase">
                    (detay için tıkla)
                  </span>
                </div>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#3282B8]/10 text-sm">
            {isLoading && players.length === 0 ? (
              // Skeleton Rows
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="animate-pulse bg-[#182329]/40">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#141C21]" />
                      <div className="space-y-1.5">
                        <div className="w-24 h-3 bg-[#141C21] rounded" />
                        <div className="w-28 h-2.5 bg-[#141C21] rounded" />
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="w-20 h-4 bg-[#141C21] rounded" />
                  </td>
                  <td className="py-4 px-4">
                    <div className="w-48 h-4 bg-[#141C21] rounded" />
                  </td>
                </tr>
              ))
            ) : filteredAndSortedPlayers.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-12 text-center text-[#BBE1FA]/70 bg-[#182329]/30">
                  <div className="flex flex-col items-center justify-center">
                    <Search className="w-8 h-8 mb-2 opacity-50 text-[#3282B8]" />
                    <p className="font-semibold text-white">Aranan kritere uygun asker bulunamadı</p>
                    <p className="text-xs text-[#BBE1FA]/60 mt-0.5">Arama terimini değiştirmeyi deneyebilirsiniz</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredAndSortedPlayers.map((player) => {
                const isExpanded = expandedUserIds.has(player.userId);

                // Aktif fabrika sayısı (beceri limitine göre)
                const activeFactoryCount = player.factoryCount ?? player.activeFactoryCount ?? (player.factories?.length || 0);
                const totalOwnedFactories = player.totalOwnedFactories ?? (player.factories?.length || activeFactoryCount);
                const factoryLimit = player.factoryLimit ?? 2;
                const totalAutomated = player.totalAutomatedLevel ?? 0;
                const factories = player.factories || [];

                // Bağış takip panelindeki pasif renklendirme mantığı:
                const isInactive = Boolean(
                  !player.lastActive ||
                  Date.now() - new Date(player.lastActive).getTime() > 3 * 24 * 3600 * 1000
                );

                return (
                  <React.Fragment key={player.userId}>
                    {/* Ana Asker Satırı */}
                    <tr
                      id={`army-player-row-${player.userId}`}
                      onClick={() => togglePlayerExpand(player.userId)}
                      className={`group transition-colors duration-150 cursor-pointer select-none ${
                        isExpanded
                          ? 'bg-[#0F4C75]/35 border-l-4 border-l-[#3282B8]'
                          : isInactive
                          ? 'opacity-40 hover:opacity-90 bg-[#141C21]/40 hover:bg-[#0F4C75]/20 text-[#BBE1FA]/80'
                          : 'bg-[#182329]/40 hover:bg-[#0F4C75]/25 text-white'
                      }`}
                    >
                      {/* 1. Sütun: Asker / Oyuncu */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {player.avatarUrl ? (
                            <img
                              src={player.avatarUrl}
                              alt={player.username}
                              className={`w-8 h-8 rounded-full object-cover border border-[#3282B8]/30 shadow-xs shrink-0 ${
                                isInactive ? 'grayscale-70 opacity-60' : ''
                              }`}
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#141C21] text-[#BBE1FA] flex items-center justify-center text-xs font-bold border border-[#3282B8]/30 shrink-0 font-mono">
                              {player.username.slice(0, 2).toUpperCase()}
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-white text-sm group-hover:text-[#BBE1FA] transition-colors truncate">
                                {player.username}
                              </span>

                              {/* Role Badge */}
                              {player.role && player.role !== 'Member' && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-mono bg-[#0F4C75]/60 text-[#BBE1FA] border border-[#3282B8]/40 shrink-0">
                                  {player.role === 'Leader' ? 'Lider' : player.role === 'Commander' ? 'Komutan' : 'Yönetici'}
                                </span>
                              )}

                              {/* Pasif Rozeti */}
                              {isInactive && (
                                <span
                                  title="3 günden uzun süredir aktif değil"
                                  className="text-[9px] px-1.5 py-0.2 rounded font-mono bg-[#141C21] text-[#BBE1FA]/60 border border-[#3282B8]/20 shrink-0"
                                >
                                  Pasif
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-[#BBE1FA]/60 font-mono truncate mt-0.5">
                              {formatLastLogin(player.lastActive)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Sütun: Oyuncu Seviyesi */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141C21] border border-[#3282B8]/30 text-white font-mono font-bold text-xs shadow-xs">
                          <span className="w-2 h-2 rounded-full bg-[#3282B8]" />
                          Seviye {player.level}
                        </span>
                      </td>

                      {/* 3. Sütun: Fabrika Sayısı ve Otomatik Seviyesi */}
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            {/* Aktif Fabrika Sayısı */}
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141C21] border border-[#3282B8]/30 text-white font-mono font-bold text-xs">
                              <Building2 className="w-3.5 h-3.5 text-[#3282B8]" />
                              {activeFactoryCount} Fabrika
                              {totalOwnedFactories > activeFactoryCount && (
                                <span className="text-[10px] text-[#BBE1FA]/60 font-normal">
                                  ({totalOwnedFactories} Toplam)
                                </span>
                              )}
                            </span>

                            {/* Aktif Otomasyon Motor Gücü */}
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0F4C75]/40 border border-[#3282B8]/40 text-[#BBE1FA] font-mono font-semibold text-xs">
                              <Cpu className="w-3.5 h-3.5 text-[#3282B8]" />
                              Motor Gücü: {totalAutomated}
                            </span>
                          </div>

                          {/* Genişletme Göstergesi */}
                          <div className="flex items-center gap-1 text-xs text-[#BBE1FA]/70 group-hover:text-white transition-colors shrink-0">
                            <span className="hidden md:inline text-[11px] font-mono">
                              {isExpanded ? 'Kapat' : 'Detay'}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-[#3282B8]" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[#BBE1FA]/60 group-hover:text-white" />
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Akordeon: Fabrika Detayları */}
                    {isExpanded && (
                      <tr className="bg-[#141C21]/95 border-b border-[#3282B8]/25">
                        <td colSpan={3} className="p-4 sm:p-5">
                          <div className="space-y-3">
                            {/* Başlık: Aktif vs Pasif Bilgisi */}
                            <div className="flex items-center justify-between border-b border-[#3282B8]/15 pb-2.5 flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-[#3282B8]" />
                                <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                                  {player.username} — Fabrika Listesi ({activeFactoryCount} Aktif / {totalOwnedFactories} Toplam • Beceri Limiti: {factoryLimit})
                                </span>
                              </div>
                              <div className="text-xs font-mono text-[#BBE1FA]/80 flex items-center gap-2">
                                <span>
                                  Aktif Motor Gücü: <strong className="text-white font-bold">{totalAutomated} Lv</strong>
                                </span>
                                {totalOwnedFactories > activeFactoryCount && (
                                  <span className="text-[11px] text-[#BBE1FA]/50 font-normal">
                                    (En yüksek {activeFactoryCount} fabrika aktif, {totalOwnedFactories - activeFactoryCount} fabrika limit dışı pasif)
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Fabrika Kartları Izgarası */}
                            {factories.length === 0 ? (
                              <div className="py-6 text-center text-xs text-[#BBE1FA]/60 font-mono">
                                Bu oyuncuya ait kayıtlı fabrika bulunamadı.
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-1">
                                {factories.map((factory: FactoryItem, idx: number) => {
                                  const itemDetails = getItemDetails(factory.itemCode);
                                  const isActiveWithinLimit = factory.isActiveFactory ?? (idx < activeFactoryCount);

                                  return (
                                    <div
                                      key={factory.id || idx}
                                      className={`rounded-xl p-3.5 transition-all shadow-md flex flex-col justify-between group/card ${
                                        isActiveWithinLimit
                                          ? 'bg-[#182329] border border-[#3282B8]/35 hover:border-[#3282B8]/70 shadow-black/30'
                                          : 'opacity-50 hover:opacity-85 grayscale-40 bg-[#141C21]/60 border border-[#3282B8]/15 hover:border-[#3282B8]/30'
                                      }`}
                                    >
                                      <div>
                                        {/* Kart Üst Başlık */}
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                          <div className="min-w-0">
                                            <div className="text-xs font-bold text-white group-hover/card:text-[#BBE1FA] transition-colors truncate" title={factory.name}>
                                              {factory.name || `Fabrika #${idx + 1}`}
                                            </div>
                                            <div className="text-[10px] text-[#BBE1FA]/60 font-mono mt-0.5 flex items-center gap-1.5 flex-wrap">
                                              <span>{itemDetails.icon} {itemDetails.name}</span>
                                              <span className="text-[9px] text-[#BBE1FA]/40 font-mono">({factory.itemCode})</span>
                                              {factory.region && (
                                                <span className="inline-flex items-center gap-0.5 text-[9px] text-[#BBE1FA]/50">
                                                  <MapPin className="w-2.5 h-2.5" />
                                                  {factory.region}
                                                </span>
                                              )}
                                            </div>
                                          </div>

                                          {/* Aktif / Pasif (Limit Dışı) Rozeti */}
                                          {isActiveWithinLimit ? (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded font-mono bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 shrink-0">
                                              Aktif
                                            </span>
                                          ) : (
                                            <span
                                              title="Beceri limitini aştığı için bu fabrika pasif durumdadır"
                                              className="text-[9px] font-medium px-1.5 py-0.5 rounded font-mono bg-[#141C21] text-[#BBE1FA]/50 border border-[#3282B8]/20 shrink-0 flex items-center gap-1"
                                            >
                                              <Lock className="w-2.5 h-2.5 text-[#BBE1FA]/40" />
                                              Pasif
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* İstatistikler: Sadece Motor Gücü & Depo Seviyesi (Mola, İşçi, Üretim kaldırıldı) */}
                                      <div className="pt-2.5 mt-2 border-t border-[#3282B8]/15 text-[11px] font-mono">
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="flex items-center gap-1.5 text-[#BBE1FA]/80">
                                            <Cpu className="w-3.5 h-3.5 text-[#3282B8] shrink-0" />
                                            <span>Motor: <strong className="text-white font-bold">Lv. {factory.automatedLevel}</strong></span>
                                          </div>
                                          <div className="flex items-center gap-1.5 text-[#BBE1FA]/80">
                                            <Boxes className="w-3.5 h-3.5 text-[#3282B8] shrink-0" />
                                            <span>Depo: <strong className="text-white font-bold">Lv. {factory.storageLevel}</strong></span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Tablo Alt Bilgisi */}
      <div className="px-4 py-3 bg-[#141C21]/90 border-t border-[#3282B8]/20 text-xs text-[#BBE1FA]/70 font-mono flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>
          Toplam <span className="font-bold text-white">{filteredAndSortedPlayers.length}</span> /{' '}
          <span className="font-bold text-white">{players.length}</span> asker listeleniyor ({summary.totalActiveFactories} Aktif Fabrika • Toplam Aktif Motor Gücü: {summary.totalActiveEnginePower})
        </div>
        <div className="text-[11px] text-[#BBE1FA]/50">
          Detaylı fabrika ve otomasyon bilgilerini görmek için ilgili askerin satırına tıklayabilirsiniz
        </div>
      </div>
    </div>
  );
};
