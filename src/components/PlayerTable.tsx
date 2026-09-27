import React, { useState, useMemo } from 'react';
import { PlayerStats, SortField, SortDirection } from '../types';
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Search, 
  Clock, 
  FileDown,
  Filter
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
}

export const PlayerTable: React.FC<PlayerTableProps> = ({
  players,
  isLoading,
  muName = 'Turkic Tribe',
  muAvatarUrl,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [targetFilter, setTargetFilter] = useState<'ALL' | 'country' | 'mu' | 'TR' | 'AE' | 'AZ' | 'CM'>('ALL');
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
        const matchesSearch =
          player.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
          player.userId.toLowerCase().includes(searchQuery.toLowerCase());

        if (!matchesSearch) return false;

        if (targetFilter === 'ALL') return true;

        const dest = getPlayerDestinations(player);
        if (targetFilter === 'country') return dest.countryCount > 0;
        if (targetFilter === 'mu') return dest.muCount > 0;
        if (targetFilter === 'TR') return dest.trCount > 0;
        if (targetFilter === 'AE') return dest.uaeCount > 0;
        if (targetFilter === 'AZ') return dest.azCount > 0;
        if (targetFilter === 'CM') return dest.cmCount > 0;

        return true;
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
  }, [players, searchQuery, targetFilter, sortField, sortDirection]);

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity ml-1" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 ml-1" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 ml-1" />
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
            className="w-3.5 h-3.5 rounded-xs object-cover border border-cyan-500/40 shrink-0 inline-block"
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
    <div id="player-table-container" className="bg-white dark:bg-[#161c23] border border-slate-200 dark:border-[#27323e] rounded-xl overflow-hidden transition-colors duration-200">
      {/* Table Header & Filtering Toolbar */}
      <div className="p-4 border-b border-slate-200 dark:border-[#232b35] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-[#161c23]">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          {/* Search Input */}
          <div className="w-full sm:w-72 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="player-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Asker veya oyuncu adına göre ara..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-[#27323e] bg-slate-50 dark:bg-[#11151a] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-cyan-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ×
              </button>
            )}
          </div>

          {/* Destination Quick Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs text-slate-400 dark:text-slate-500 mr-1 flex items-center gap-1 shrink-0">
              <Filter className="w-3 h-3" />
              Hedef:
            </span>
            <button
              id="filter-target-all"
              onClick={() => setTargetFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                targetFilter === 'ALL'
                  ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#11151a] dark:hover:bg-[#1b222a] text-slate-600 dark:text-slate-300 border border-transparent dark:border-[#232b35]'
              }`}
            >
              Tümü
            </button>
            <button
              id="filter-target-tr"
              onClick={() => setTargetFilter('TR')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                targetFilter === 'TR'
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#11151a] dark:hover:bg-[#1b222a] text-slate-600 dark:text-slate-300 border border-transparent dark:border-[#232b35]'
              }`}
            >
              <TurkeyFlagSVG className="w-3.5 h-2.5" />
              <span>Türkiye</span>
            </button>
            <button
              id="filter-target-ae"
              onClick={() => setTargetFilter('AE')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                targetFilter === 'AE'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#11151a] dark:hover:bg-[#1b222a] text-slate-600 dark:text-slate-300 border border-transparent dark:border-[#232b35]'
              }`}
            >
              <UAEFlagSVG className="w-3.5 h-2.5" />
              <span>BAE</span>
            </button>
            <button
              id="filter-target-az"
              onClick={() => setTargetFilter('AZ')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                targetFilter === 'AZ'
                  ? 'bg-sky-700 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#11151a] dark:hover:bg-[#1b222a] text-slate-600 dark:text-slate-300 border border-transparent dark:border-[#232b35]'
              }`}
            >
              <AzerbaijanFlagSVG className="w-3.5 h-2.5" />
              <span>Azerbaycan</span>
            </button>
            <button
              id="filter-target-cm"
              onClick={() => setTargetFilter('CM')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                targetFilter === 'CM'
                  ? 'bg-green-700 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#11151a] dark:hover:bg-[#1b222a] text-slate-600 dark:text-slate-300 border border-transparent dark:border-[#232b35]'
              }`}
            >
              <CameroonFlagSVG className="w-3.5 h-2.5" />
              <span>Kamerun</span>
            </button>
            <button
              id="filter-target-mu"
              onClick={() => setTargetFilter('mu')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                targetFilter === 'mu'
                  ? 'bg-cyan-700 text-white hover:bg-cyan-600'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#11151a] dark:hover:bg-[#1b222a] text-slate-600 dark:text-slate-300 border border-transparent dark:border-[#232b35]'
              }`}
            >
              {muAvatarUrl ? (
                <img src={muAvatarUrl} alt={muName} className="w-3.5 h-3.5 rounded-xs object-cover" />
              ) : (
                <ArmyFlagSVG className="w-3.5 h-2.5" />
              )}
              <span>Ordu ({muName})</span>
            </button>
          </div>
        </div>

        {/* Action Buttons: PDF Export */}
        <div className="flex items-center justify-end gap-2 shrink-0">
          <button
            id="export-pdf-button"
            onClick={handleExportPdf}
            disabled={isExporting || players.length === 0}
            title="Asker listesini PDF olarak indir"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-[#11151a] dark:hover:bg-[#1b222a] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27323e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileDown className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>{isExporting ? 'PDF Hazırlanıyor...' : 'PDF İndir'}</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-0.5">
              ({filteredAndSortedPlayers.length})
            </span>
          </button>
        </div>
      </div>

      {/* Main Responsive Data Table */}
      <div className="overflow-x-auto">
        <table id="donations-data-table" className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-[#232b35] bg-slate-50 dark:bg-[#12161b] text-xs font-semibold text-slate-600 dark:text-slate-400 select-none">
              <th
                onClick={() => handleSort('username')}
                className="py-3.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100 group min-w-[200px]"
              >
                <div className="flex items-center">
                  <span>Asker / Oyuncu</span>
                  {renderSortIndicator('username')}
                </div>
              </th>

              {/* Latest 7 Donations Column */}
              <th
                onClick={() => handleSort('latestDonation')}
                className="py-3.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100 group min-w-[560px]"
              >
                <div className="flex items-center flex-wrap gap-2">
                  <span className="text-slate-900 dark:text-slate-200 font-bold">Son 7 Bağış</span>
                  {renderSortIndicator('latestDonation')}
                  <span className="text-[10px] text-slate-400 font-normal">
                    (En Yeni → Eski)
                  </span>
                </div>
              </th>

              {/* Donation Destination Column */}
              <th
                onClick={() => handleSort('target')}
                className="py-3.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100 group min-w-[220px]"
              >
                <div className="flex items-center">
                  <span>Bağış Hedefi</span>
                  <span className="text-[10px] text-slate-400 font-normal ml-1">
                    (Bayrak & Logo)
                  </span>
                  {renderSortIndicator('target')}
                </div>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-[#202731] text-sm">
            {isLoading && players.length === 0 ? (
              // Loading Skeleton
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="animate-pulse">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-[#1b222a]" />
                      <div className="space-y-1">
                        <div className="w-24 h-3 bg-slate-200 dark:bg-[#1b222a] rounded" />
                        <div className="w-28 h-2.5 bg-slate-200 dark:bg-[#1b222a] rounded" />
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex gap-2">
                      {Array.from({ length: 7 }).map((_, idx) => (
                        <div key={idx} className="w-18 h-8 bg-slate-200 dark:bg-[#1b222a] rounded-lg shrink-0" />
                      ))}
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-4 bg-slate-200 dark:bg-[#1b222a] rounded" />
                      <div className="w-24 h-3 bg-slate-200 dark:bg-[#1b222a] rounded" />
                    </div>
                  </td>
                </tr>
              ))
            ) : filteredAndSortedPlayers.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-12 text-center text-slate-400 dark:text-slate-500">
                  <div className="flex flex-col items-center justify-center">
                    <Search className="w-8 h-8 mb-2 opacity-40" />
                    <p className="font-medium text-slate-600 dark:text-slate-400">Aranan kritere uygun asker bulunamadı</p>
                    <p className="text-xs mt-0.5">Arama terimini veya hedef filtresini değiştirmeyi deneyebilirsiniz</p>
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
                        ? 'opacity-40 hover:opacity-85 bg-slate-100/40 dark:bg-[#11151a]/40 text-slate-500 dark:text-slate-400'
                        : 'hover:bg-slate-50 dark:hover:bg-[#1b222a]'
                    }`}
                  >
                    {/* Player Info (Avatar, Username, Last Login Date) */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        {player.avatarUrl ? (
                          <img
                            src={player.avatarUrl}
                            alt={player.username}
                            className={`w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-[#27323e] shrink-0 ${
                              isInactive ? 'grayscale-70 opacity-60' : ''
                            }`}
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#12161b] text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs font-bold border border-slate-200 dark:border-[#27323e] shrink-0">
                            {player.username.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors truncate">
                              {player.username}
                            </span>
                            {isInactive && (
                              <span
                                title="3 günden uzun süredir aktif değil"
                                className="text-[9px] px-1 py-0.2 rounded font-medium bg-slate-200 dark:bg-[#202832] text-slate-500 dark:text-slate-400 shrink-0"
                              >
                                Pasif
                              </span>
                            )}
                          </div>
                          {/* Last login date without any prefix */}
                          <div className="text-[11px] text-slate-400 dark:text-slate-400 font-mono truncate mt-0.5">
                            {formatLastLogin(player.lastActive)}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Latest 7 Donations */}
                    <td className="py-3 px-4">
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
                                  className={`flex flex-col px-2 py-1 rounded-lg border text-xs transition-colors shrink-0 min-w-[76px] ${
                                    idx === 0
                                      ? 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-300 dark:border-cyan-800 text-cyan-950 dark:text-cyan-200 font-medium'
                                      : 'bg-slate-50 dark:bg-[#11151a] border-slate-200 dark:border-[#232b35] text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <div className="flex items-center gap-1">
                                      {/* Mini Flag / Avatar for each donation */}
                                      {renderDonationChipVisual(donation)}
                                      <span className="font-bold text-xs tracking-tight">
                                        +{formatNumber(donation.amount)}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold ml-0.5">
                                      {donation.currency === 'Gold' ? 'G' : donation.currency}
                                    </span>
                                  </div>
                                  <div className="text-[9.5px] text-slate-400 dark:text-slate-400 flex items-center justify-between gap-1 mt-0.5">
                                    <div className="flex items-center gap-0.5 truncate">
                                      <Clock className="w-2.5 h-2.5 opacity-70 shrink-0" />
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
                    <td className="py-3.5 px-4 whitespace-nowrap">
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
                              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                {dest.uaeCount > 0
                                  ? 'BAE'
                                  : dest.azCount > 0
                                  ? 'Azerbaycan'
                                  : dest.cmCount > 0
                                  ? 'Kamerun'
                                  : 'Türkiye'}
                              </span>
                              <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/60">
                                Ülke
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
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
                                className="w-5 h-5 rounded-xs object-cover border border-cyan-500/40 shrink-0"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <ArmyFlagSVG className="w-5 h-3.5 shrink-0" />
                            )}
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[100px]">
                                {muName}
                              </span>
                              <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60">
                                Ordu
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
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

      {/* Table Footer: Clean Soldier Count Only */}
      <div className="px-4 py-3 bg-slate-50 dark:bg-[#12161b] border-t border-slate-200 dark:border-[#232b35] text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>
          Toplam <span className="font-semibold text-slate-700 dark:text-slate-200">{filteredAndSortedPlayers.length}</span> /{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-200">{players.length}</span> asker listeleniyor
        </div>
      </div>
    </div>
  );
};
