import React, { useState, useMemo } from 'react';
import { PlayerStats, SortField, SortDirection } from '../types';
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Search, 
  Clock, 
  FileDown,
  RefreshCw
} from 'lucide-react';
import { formatNumber, formatRelativeTime } from '../utils/formatters';
import { exportPlayerTableToPDF } from '../utils/exportPdf';
import { 
  DestinationBadge, 
  TurkeyFlagSVG, 
  UAEFlagSVG, 
  AzerbaijanFlagSVG, 
  CameroonFlagSVG, 
  ArmyFlagSVG 
} from './DestinationFlag';

interface PlayerTableProps {
  players: PlayerStats[];
  isLoading: boolean;
  muName?: string;
  muAvatarUrl?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const PlayerTable: React.FC<PlayerTableProps> = ({
  players,
  isLoading,
  muName = 'Turkic Tribe',
  muAvatarUrl,
  onRefresh,
  isRefreshing = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('latestDonation');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isExporting, setIsExporting] = useState(false);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'username' ? 'asc' : 'desc');
    }
  };

  const formatLastLogin = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  // Helper to extract unique destinations for a player
  const getPlayerDestinations = (player: PlayerStats) => {
    const donations = player.latestDonations || [];
    const countryCount = donations.filter((d) => d.target === 'country' || !d.target).length;
    const muCount = donations.filter((d) => d.target === 'mu').length;

    // Detect country breakdown
    const uaeCount = donations.filter(
      (d) =>
        d.target === 'country' &&
        (d.countryCode?.toUpperCase() === 'AE' ||
          (d.targetName && (d.targetName.toLowerCase().includes('emirlik') || d.targetName.toLowerCase().includes('arap'))))
    ).length;

    const azCount = donations.filter(
      (d) =>
        d.target === 'country' &&
        (d.countryCode?.toUpperCase() === 'AZ' ||
          (d.targetName && d.targetName.toLowerCase().includes('azer')))
    ).length;

    const cmCount = donations.filter(
      (d) =>
        d.target === 'country' &&
        (d.countryCode?.toUpperCase() === 'CM' ||
          (d.targetName && d.targetName.toLowerCase().includes('kamerun')))
    ).length;

    const trCount = countryCount - uaeCount - azCount - cmCount;

    return {
      countryCount,
      muCount,
      uaeCount,
      azCount,
      cmCount,
      trCount: Math.max(0, trCount),
      totalCount: donations.length,
      primaryTarget: countryCount >= muCount ? 'country' : 'mu',
    };
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
          case 'totalDonations':
            aVal = a.totalDonations;
            bVal = b.totalDonations;
            break;
          case 'latestDonation': {
            const aLatest = a.latestDonations && a.latestDonations.length > 0
              ? Math.max(...a.latestDonations.map((d) => new Date(d.timestamp).getTime()))
              : 0;
            const bLatest = b.latestDonations && b.latestDonations.length > 0
              ? Math.max(...b.latestDonations.map((d) => new Date(d.timestamp).getTime()))
              : 0;
            aVal = aLatest;
            bVal = bLatest;
            break;
          }
          case 'target': {
            const aDest = getPlayerDestinations(a);
            const bDest = getPlayerDestinations(b);
            aVal = aDest.primaryTarget;
            bVal = bDest.primaryTarget;
            return sortDirection === 'asc'
              ? aVal.localeCompare(bVal)
              : bVal.localeCompare(aVal);
          }
          case 'wealth':
            aVal = a.wealth;
            bVal = b.wealth;
            break;
          default: {
            const aLatest = a.latestDonations && a.latestDonations.length > 0
              ? Math.max(...a.latestDonations.map((d) => new Date(d.timestamp).getTime()))
              : 0;
            const bLatest = b.latestDonations && b.latestDonations.length > 0
              ? Math.max(...b.latestDonations.map((d) => new Date(d.timestamp).getTime()))
              : 0;
            aVal = aLatest;
            bVal = bLatest;
          }
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
  }, [players, searchQuery, sortField, sortDirection]);

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-[#BBE1FA]/40 group-hover:text-[#BBE1FA] transition-colors ml-1" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-[#3282B8] ml-1" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-[#3282B8] ml-1" />
    );
  };

  const handleExportPdf = () => {
    setIsExporting(true);
    try {
      exportPlayerTableToPDF(filteredAndSortedPlayers, muName || 'Turkic Tribe');
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Helper to render mini flag/avatar for each donation
  const renderDonationChipVisual = (donation: typeof players[0]['latestDonations'][0]) => {
    const isArmy = donation.target === 'mu';
    const cCode = donation.countryCode?.toUpperCase();
    const tNameLower = (donation.targetName || '').toLowerCase();

    if (isArmy) {
      const armyAvatar = donation.targetAvatarUrl || muAvatarUrl;
      if (armyAvatar) {
        return (
          <img
            src={armyAvatar}
            alt={donation.targetName || muName}
            className="w-3.5 h-3.5 rounded-xs object-cover border border-[#3282B8]/40 shrink-0 inline-block shadow-xs"
            referrerPolicy="no-referrer"
          />
        );
      }
      return <ArmyFlagSVG className="w-3.5 h-2.5 shrink-0" />;
    }

    if (cCode === 'AE' || tNameLower.includes('emirlik') || tNameLower.includes('arap')) {
      return <UAEFlagSVG className="w-3.5 h-2.5 shrink-0" />;
    }
    if (cCode === 'AZ' || tNameLower.includes('azer')) {
      return <AzerbaijanFlagSVG className="w-3.5 h-2.5 shrink-0" />;
    }
    if (cCode === 'CM' || tNameLower.includes('kamerun')) {
      return <CameroonFlagSVG className="w-3.5 h-2.5 shrink-0" />;
    }
    return <TurkeyFlagSVG className="w-3.5 h-2.5 shrink-0" />;
  };

  return (
    <div id="player-table-container" className="bg-[#182329]/95 border border-[#3282B8]/25 rounded-xl overflow-hidden shadow-2xl shadow-black/40 backdrop-blur-sm">
      {/* Table Header & Search Toolbar */}
      <div className="p-4 border-b border-[#3282B8]/15 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#141C21]/60">
        <div className="flex items-center gap-3 flex-1">
          {/* Search Input */}
          <div className="w-full sm:w-80 relative group">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#3282B8] group-focus-within:text-white transition-colors" />
            <input
              id="player-search-input"
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

        {/* Action Buttons: PDF Export & Refresh */}
        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            id="export-pdf-button"
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting || players.length === 0}
            title="Asker listesini PDF olarak indir"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[#141C21] hover:bg-[#0F4C75]/40 text-[#BBE1FA] hover:text-white border border-[#3282B8]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
          >
            <FileDown className="w-3.5 h-3.5 text-[#3282B8]" />
            <span>{isExporting ? 'PDF Hazırlanıyor...' : 'PDF İndir'}</span>
            <span className="text-[10px] text-[#BBE1FA]/60 font-mono ml-0.5">
              ({filteredAndSortedPlayers.length})
            </span>
          </button>

          {/* Manual Refresh Button (Yenile) */}
          {onRefresh && (
            <button
              id="table-manual-refresh-btn"
              type="button"
              onClick={onRefresh}
              disabled={isLoading || isRefreshing}
              title="Verileri API'den yenile"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-[#141C21] hover:bg-[#0F4C75]/40 text-[#BBE1FA] hover:text-white border border-[#3282B8]/30 transition-all disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${(isLoading || isRefreshing) ? 'animate-spin text-[#BBE1FA]' : 'text-[#3282B8]'}`} />
              <span>Yenile</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Responsive Data Table */}
      <div className="overflow-x-auto">
        <table id="donations-data-table" className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#3282B8]/20 bg-[#141C21]/90 text-[11px] font-semibold text-[#BBE1FA]/80 uppercase tracking-widest font-mono select-none">
              <th
                onClick={() => handleSort('username')}
                className="py-3 px-4 cursor-pointer hover:text-white group min-w-[200px]"
              >
                <div className="flex items-center">
                  <span>Asker / Oyuncu</span>
                  {renderSortIndicator('username')}
                </div>
              </th>

              {/* Latest 7 Donations Column */}
              <th
                onClick={() => handleSort('latestDonation')}
                className="py-3 px-4 cursor-pointer hover:text-white group min-w-[560px]"
              >
                <div className="flex items-center flex-wrap gap-2">
                  <span className="text-white font-bold">Son 7 Bağış</span>
                  {renderSortIndicator('latestDonation')}
                  <span className="text-[10px] text-[#BBE1FA]/50 font-normal lowercase">
                    (en yeni → eski)
                  </span>
                </div>
              </th>

              {/* Donation Destination Column */}
              <th
                onClick={() => handleSort('target')}
                className="py-3 px-4 cursor-pointer hover:text-white group min-w-[220px]"
              >
                <div className="flex items-center">
                  <span>Bağış Hedefi</span>
                  {renderSortIndicator('target')}
                </div>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#3282B8]/10 text-sm">
            {isLoading && players.length === 0 ? (
              // Loading Skeleton
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="animate-pulse bg-[#182329]/40">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#141C21]" />
                      <div className="space-y-1">
                        <div className="w-24 h-3 bg-[#141C21] rounded" />
                        <div className="w-28 h-2.5 bg-[#141C21] rounded" />
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex gap-2">
                      {Array.from({ length: 7 }).map((_, idx) => (
                        <div key={idx} className="w-18 h-8 bg-[#141C21] rounded-lg shrink-0" />
                      ))}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-4 bg-[#141C21] rounded" />
                      <div className="w-24 h-3 bg-[#141C21] rounded" />
                    </div>
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
                const dest = getPlayerDestinations(player);
                const hasBoth = dest.countryCount > 0 && dest.muCount > 0;

                // Inactive check: > 3 days without login or missing lastActive
                const isInactive = Boolean(
                  !player.lastActive ||
                  Date.now() - new Date(player.lastActive).getTime() > 3 * 24 * 3600 * 1000
                );

                return (
                  <tr
                    key={player.userId}
                    id={`player-row-${player.userId}`}
                    className={`group transition-colors duration-150 ${
                      isInactive
                        ? 'opacity-40 hover:opacity-90 bg-[#141C21]/40 hover:bg-[#0F4C75]/20 text-[#BBE1FA]/80'
                        : 'bg-[#182329]/40 hover:bg-[#0F4C75]/25 text-white'
                    }`}
                  >
                    {/* Player Info (Avatar, Username, Last Login Date) */}
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
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-white text-sm group-hover:text-[#BBE1FA] transition-colors truncate">
                              {player.username}
                            </span>
                            {isInactive && (
                              <span
                                title="3 günden uzun süredir aktif değil"
                                className="text-[9px] px-1.5 py-0.2 rounded font-mono bg-[#141C21] text-[#BBE1FA]/60 border border-[#3282B8]/20 shrink-0"
                              >
                                Pasif
                              </span>
                            )}
                          </div>
                          {/* Last login date */}
                          <div className="text-[11px] text-[#BBE1FA]/60 font-mono truncate mt-0.5">
                            {formatLastLogin(player.lastActive)}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Latest 7 Donations */}
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {player.latestDonations && player.latestDonations.length > 0 ? (
                          [...player.latestDonations]
                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                            .slice(0, 7)
                            .map((donation, idx) => {
                              const isArmyDonation = donation.target === 'mu';

                              return (
                                <div
                                  key={donation.id || idx}
                                  title={`#${idx + 1} ${isArmyDonation ? 'Ordu' : 'Ülke'} Bağışı: +${formatNumber(donation.amount)} ${donation.currency} (${donation.targetName || (isArmyDonation ? muName : 'Türkiye')}) - ${new Date(donation.timestamp).toLocaleDateString('tr-TR')} ${formatRelativeTime(donation.timestamp)}`}
                                  className={`flex flex-col px-2 py-1 rounded-md border text-xs transition-all shrink-0 min-w-[76px] ${
                                    idx === 0
                                      ? 'bg-gradient-to-b from-[#1E2E38] to-[#141E24] border-[#3282B8]/60 text-white shadow-[0_0_8px_rgba(50,130,184,0.15)]'
                                      : 'bg-[#141C21]/80 border-[#3282B8]/20 hover:border-[#3282B8]/50 text-white'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="flex items-center gap-1">
                                      {/* Mini Flag / Avatar for each donation */}
                                      {renderDonationChipVisual(donation)}
                                      <span className="font-bold text-xs tracking-tight text-white font-mono">
                                        +{formatNumber(donation.amount)}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-[#3282B8] font-bold font-mono ml-0.5">
                                      {donation.currency === 'Gold' ? 'G' : donation.currency}
                                    </span>
                                  </div>
                                  <div className="text-[9px] text-[#BBE1FA]/50 flex items-center justify-between gap-1 mt-0.5 font-mono">
                                    <div className="flex items-center gap-0.5 truncate">
                                      <Clock className="w-2.5 h-2.5 opacity-60 text-[#3282B8] shrink-0" />
                                      <span className="truncate">{formatRelativeTime(donation.timestamp)}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                        ) : null}
                      </div>
                    </td>

                    {/* Destination Column (Flag + Destination Details) */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {dest.totalCount === 0 ? null : hasBoth ? (
                        <div className="space-y-1.5">
                          {/* Country Destination */}
                          <div className="flex items-center gap-2">
                            {dest.uaeCount > 0 ? (
                              <UAEFlagSVG className="w-5 h-3.5 shrink-0" />
                            ) : dest.azCount > 0 ? (
                              <AzerbaijanFlagSVG className="w-5 h-3.5 shrink-0" />
                            ) : dest.cmCount > 0 ? (
                              <CameroonFlagSVG className="w-5 h-3.5 shrink-0" />
                            ) : (
                              <TurkeyFlagSVG className="w-5 h-3.5 shrink-0" />
                            )}
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-white">
                                {dest.uaeCount > 0
                                  ? 'BAE'
                                  : dest.azCount > 0
                                  ? 'Azerbaycan'
                                  : dest.cmCount > 0
                                  ? 'Kamerun'
                                  : 'Türkiye'}
                              </span>
                              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#0F4C75]/40 text-[#BBE1FA] border border-[#3282B8]/30">
                                Ülke
                              </span>
                              <span className="text-[10px] text-[#BBE1FA]/60 font-mono">
                                ({dest.countryCount}x)
                              </span>
                            </div>
                          </div>
                          {/* Army Destination */}
                          <div className="flex items-center gap-2">
                            {muAvatarUrl ? (
                              <img
                                src={muAvatarUrl}
                                alt={muName}
                                className="w-5 h-5 rounded-xs object-cover border border-[#3282B8]/30 shrink-0 shadow-xs"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <ArmyFlagSVG className="w-5 h-3.5 shrink-0" />
                            )}
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                                {muName}
                              </span>
                              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-[#0F4C75]/40 text-[#BBE1FA] border border-[#3282B8]/30">
                                Ordu
                              </span>
                              <span className="text-[10px] text-[#BBE1FA]/60 font-mono">
                                ({dest.muCount}x)
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : dest.muCount > 0 ? (
                        <DestinationBadge
                          target="mu"
                          targetName={muName}
                          muAvatarUrl={muAvatarUrl}
                          count={dest.muCount}
                        />
                      ) : (
                        <DestinationBadge
                          target="country"
                          targetName={
                            dest.uaeCount > 0
                              ? 'Birleşik Arap Emirlikleri'
                              : dest.azCount > 0
                              ? 'Azerbaycan'
                              : dest.cmCount > 0
                              ? 'Kamerun'
                              : 'Türkiye'
                          }
                          countryCode={
                            dest.uaeCount > 0
                              ? 'AE'
                              : dest.azCount > 0
                              ? 'AZ'
                              : dest.cmCount > 0
                              ? 'CM'
                              : 'TR'
                          }
                          count={dest.countryCount}
                        />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer: Clean Soldier Count */}
      <div className="px-4 py-3 bg-[#141C21]/90 border-t border-[#3282B8]/20 text-xs text-[#BBE1FA]/70 font-mono flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>
          Toplam <span className="font-bold text-white">{filteredAndSortedPlayers.length}</span> /{' '}
          <span className="font-bold text-white">{players.length}</span> asker listeleniyor
        </div>
      </div>
    </div>
  );
};
