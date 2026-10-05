import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Crown, 
  Copy, 
  Check, 
  TrendingUp, 
  Coins, 
  Sparkles, 
  Layers, 
  Flame, 
  Search, 
  RefreshCw, 
  Users, 
  Building2, 
  BedDouble, 
  Calendar, 
  X, 
  Award,
  Zap,
  Target
} from 'lucide-react';
import { MilitaryDetailsData, MilitaryDetailMember } from '../types';
import { fetchMilitaryDetails, getCachedMilitaryDetails } from '../services/wareraApi';
import { ActiveTab } from '../App';

interface MilitaryDetailsSectionProps {
  muId: string;
  onMuIdChange: (newId: string) => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

export const TierBadge: React.FC<{ tier?: string; className?: string }> = ({ tier = 'platinum', className = '' }) => {
  const t = (tier || 'platinum').toLowerCase();
  
  if (t === 'master') {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950/80 border border-purple-500/40 text-purple-300 font-mono text-[10px] font-bold ${className}`}>
        <span>★</span>
        <span>Master</span>
      </span>
    );
  }
  if (t === 'diamond') {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0F4C75]/40 border border-cyan-400/40 text-cyan-300 font-mono text-[10px] font-bold ${className}`}>
        <span>◆</span>
        <span>Diamond</span>
      </span>
    );
  }
  if (t === 'gold') {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold ${className}`}>
        <span>︽</span>
        <span>Gold</span>
      </span>
    );
  }
  if (t === 'silver') {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-700/50 border border-slate-400/30 text-slate-200 font-mono text-[10px] font-bold ${className}`}>
        <span>︽</span>
        <span>Silver</span>
      </span>
    );
  }
  if (t === 'bronze') {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/40 border border-amber-700/40 text-amber-500 font-mono text-[10px] font-bold ${className}`}>
        <span>•</span>
        <span>Bronze</span>
      </span>
    );
  }

  // Default: Platinum
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[10px] font-bold ${className}`}>
      <span>◆</span>
      <span>Platinum</span>
    </span>
  );
};

export const MilitaryDetailsSection: React.FC<MilitaryDetailsSectionProps> = ({
  muId,
  onMuIdChange,
  onNavigateTab,
}) => {
  const [data, setData] = useState<MilitaryDetailsData | null>(() => getCachedMilitaryDetails(muId));
  const [isLoading, setIsLoading] = useState(!data);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states
  const [roleFilter, setRoleFilter] = useState<'all' | 'commanders' | 'managers'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Copied IDs state (key: string, value: boolean)
  const [copiedMap, setCopiedMap] = useState<Record<string, boolean>>({});

  // Detail Modal state
  const [selectedMember, setSelectedMember] = useState<MilitaryDetailMember | null>(null);

  const loadData = async (forceRefresh = false) => {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      const cached = getCachedMilitaryDetails(muId);
      if (cached) {
        setData(cached);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
    }
    setError(null);

    try {
      const details = await fetchMilitaryDetails(muId, forceRefresh);
      setData(details);
    } catch (err: any) {
      console.error('Error fetching military details:', err);
      setError(err.message || 'Birlik detayları yüklenemedi');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [muId]);

  const handleCopyId = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedMap((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopiedMap((prev) => ({ ...prev, [id]: false }));
    }, 2000);
  };

  // Formatters
  const formatDamage = (dmg?: number) => {
    if (!dmg) return '0';
    if (dmg >= 1e9) return `${(dmg / 1e9).toFixed(2)}B`;
    if (dmg >= 1e6) return `${(dmg / 1e6).toFixed(2)}M`;
    if (dmg >= 1e3) return `${(dmg / 1e3).toFixed(1)}K`;
    return dmg.toLocaleString('tr-TR');
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '24.03.2026';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '24.03.2026';
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Filter members
  const members = data?.members || [];
  const commandersCount = members.filter((m) => m.role === 'commander' || m.role === 'leader').length;
  const managersCount = members.filter((m) => m.role === 'manager').length;

  const filteredMembers = members.filter((m) => {
    // Role filter
    if (roleFilter === 'commanders' && m.role !== 'commander' && m.role !== 'leader') return false;
    if (roleFilter === 'managers' && m.role !== 'manager') return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = m.username.toLowerCase().includes(q);
      const matchId = m.userId.toLowerCase().includes(q);
      if (!matchName && !matchId) return false;
    }

    return true;
  });

  const mu = data?.muInfo;

  return (
    <div className="w-full space-y-6 text-white font-mono">
      {/* 1. ÜST BİRLİK BAŞLIĞI (Header Banner) */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/40 p-5 sm:p-6 shadow-2xl backdrop-blur-md transition-all">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          {/* Sol: Avatar, Lv rozeti, Birlik Adı ve Rozetler */}
          <div className="flex items-center gap-4 sm:gap-5 min-w-0">
            {/* Avatar & Lv Badge */}
            <div className="relative shrink-0 group">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#141C21] border-2 border-rose-500/50 p-1 flex items-center justify-center overflow-hidden shadow-lg shadow-black/40">
                {mu?.avatarUrl ? (
                  <img
                    src={mu.avatarUrl}
                    alt={mu.name}
                    className="w-full h-full object-cover rounded-xl"
                  />
                ) : (
                  <Shield className="w-10 h-10 text-rose-400" />
                )}
              </div>
              <div className="absolute -bottom-1.5 -right-1.5 px-2 py-0.5 rounded-full bg-[#182329] text-rose-300 border border-rose-500/60 font-mono text-[10px] font-black shadow-md">
                Lv.{mu?.level || 1}
              </div>
            </div>

            {/* Birlik İsmi ve Üst Rozetler */}
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-white font-mono tracking-wider uppercase truncate">
                  {mu?.name || 'TURKIC TRIBE'}
                </h1>

                {/* Canlı API Senkron Rozeti */}
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Canlı API Senkron</span>
                </div>

                {/* Birlik Ligi Rozeti */}
                <TierBadge tier={mu?.overallTier || 'platinum'} />

                {/* Birlik Sahibi Rozeti */}
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold">
                  <Crown className="w-3 h-3 text-amber-400" />
                  <span>Birlik Sahibi:</span>
                  <span className="text-amber-200">{mu?.leaderUsername || 'Muhtarr'}</span>
                </div>
              </div>

              {/* Alt Satır: Tıklanabilir MU ID, İtibar, Toplam Üye */}
              <div className="flex items-center gap-2.5 flex-wrap text-xs font-mono">
                {/* Copyable MU ID button */}
                <button
                  type="button"
                  onClick={() => handleCopyId(mu?.id || muId)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141C21] hover:bg-[#182329] border border-rose-500/30 text-rose-300 hover:text-white transition-all cursor-pointer group shadow-inner"
                  title="Birlik ID'sini kopyala"
                >
                  <span className="text-[11px] text-[#BBE1FA]/60">MU ID:</span>
                  <span className="text-[11px] font-bold truncate max-w-[150px] sm:max-w-none">{mu?.id || muId}</span>
                  {copiedMap[mu?.id || muId] ? (
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-400" />
                      Kopyalandı
                    </span>
                  ) : (
                    <Copy className="w-3 h-3 text-rose-400 group-hover:text-rose-200" />
                  )}
                </button>

                <div className="px-2.5 py-1 rounded-lg bg-[#141C21] border border-rose-500/20 text-xs">
                  <span className="text-[#BBE1FA]/60">İtibar: </span>
                  <span className="font-bold text-amber-400">{mu?.reputation ?? 11.91}</span>
                </div>

                <div className="px-2.5 py-1 rounded-lg bg-[#141C21] border border-rose-500/20 text-xs">
                  <span className="text-[#BBE1FA]/60">Toplam Üye: </span>
                  <span className="font-bold text-rose-300">{mu?.memberCount ?? members.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. KARARGAH BİNALARI ŞERİDİ (Headquarters Buildings Strip) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Karargah Seviyesi */}
        <div className="rounded-xl bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 p-4 flex items-center gap-3.5 shadow-lg transition-all">
          <div className="w-9 h-9 rounded-lg bg-rose-950/60 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-mono text-[#BBE1FA]/60 block">Karargah Seviyesi</span>
            <span className="text-sm font-black font-mono text-rose-300">
              Level {mu?.activeUpgradeLevels?.headquarters ?? 4}
            </span>
          </div>
        </div>

        {/* Yatakhaneler */}
        <div className="rounded-xl bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 p-4 flex items-center gap-3.5 shadow-lg transition-all">
          <div className="w-9 h-9 rounded-lg bg-rose-950/60 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
            <BedDouble className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-mono text-[#BBE1FA]/60 block">Yatakhaneler</span>
            <span className="text-sm font-black font-mono text-rose-300">
              Level {mu?.activeUpgradeLevels?.dormitories ?? 5}
            </span>
          </div>
        </div>

        {/* Oluşturulma Tarihi */}
        <div className="rounded-xl bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 p-4 flex items-center gap-3.5 shadow-lg transition-all">
          <div className="w-9 h-9 rounded-lg bg-rose-950/60 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[11px] font-mono text-[#BBE1FA]/60 block">Oluşturulma</span>
            <span className="text-sm font-black font-mono text-white">
              {formatDate(mu?.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* 3. 6 ADET STRATEJİK SIRALAMA KARTI (Leaderboard Grid) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-rose-400 flex items-center gap-2">
            <Award className="w-4 h-4 text-rose-400" />
            <span>Birlik Sıralamaları & Başarı Dereceleri</span>
          </h2>
          <span className="text-[11px] font-mono text-[#BBE1FA]/60">Güncel Sezon Verileri</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {/* Kart 1: Haftalık Hasar */}
          <div className="rounded-xl bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 p-4 flex flex-col justify-between shadow-lg transition-all group">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-rose-950/60 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <TrendingUp className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-mono font-bold text-rose-400">Haftalık Hasar</span>
              </div>
              <TierBadge tier={mu?.rankings?.muWeeklyDamages?.tier || 'platinum'} />
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-2xl font-black text-white">
                  {formatDamage(mu?.rankings?.muWeeklyDamages?.value ?? 0)}
                </span>
                <span className="text-[10px] text-[#BBE1FA]/60 font-bold">DMG</span>
              </div>
              <div className="px-2 py-0.5 rounded bg-[#141C21] border border-rose-500/30 text-[11px] font-mono text-rose-300">
                Rank: <span className="font-bold">#{mu?.rankings?.muWeeklyDamages?.rank ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Kart 2: Toplam Hasar */}
          <div className="rounded-xl bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 p-4 flex flex-col justify-between shadow-lg transition-all group">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-mono font-bold text-amber-400">Toplam Hasar</span>
              </div>
              <TierBadge tier={mu?.rankings?.muDamages?.tier || 'platinum'} />
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-2xl font-black text-amber-400">
                  {formatDamage(mu?.rankings?.muDamages?.value ?? 1028447657)}
                </span>
                <span className="text-[10px] text-[#BBE1FA]/60 font-bold">DMG</span>
              </div>
              <div className="px-2 py-0.5 rounded bg-[#141C21] border border-rose-500/30 text-[11px] font-mono text-rose-300">
                Rank: <span className="font-bold">#{mu?.rankings?.muDamages?.rank ?? 135}</span>
              </div>
            </div>
          </div>

          {/* Kart 3: Kazanılan Ödül */}
          <div className="rounded-xl bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 p-4 flex flex-col justify-between shadow-lg transition-all group">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-300">
                  <Coins className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-mono font-bold text-amber-300">Kazanılan Ödül</span>
              </div>
              <TierBadge tier={mu?.rankings?.muBounty?.tier || 'platinum'} />
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-2xl font-black text-amber-300">
                  {((mu?.rankings?.muBounty?.value ?? 17441) / 1000).toFixed(1)}K
                </span>
                <span className="text-amber-400 font-bold text-xs">🪙</span>
              </div>
              <div className="px-2 py-0.5 rounded bg-[#141C21] border border-rose-500/30 text-[11px] font-mono text-rose-300">
                Rank: <span className="font-bold">#{mu?.rankings?.muBounty?.rank ?? 205}</span>
              </div>
            </div>
          </div>

          {/* Kart 4: Paralı Asker İtibarı */}
          <div className="rounded-xl bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 p-4 flex flex-col justify-between shadow-lg transition-all group">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400">Paralı Asker İtibarı</span>
              </div>
              <TierBadge tier={mu?.rankings?.muReputation?.tier || 'platinum'} />
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-2xl font-black text-white">
                  {mu?.rankings?.muReputation?.value ?? 11.91}
                </span>
                <span className="text-[10px] text-[#BBE1FA]/60 font-bold">PTS</span>
              </div>
              <div className="px-2 py-0.5 rounded bg-[#141C21] border border-rose-500/30 text-[11px] font-mono text-rose-300">
                Rank: <span className="font-bold">#{mu?.rankings?.muReputation?.rank ?? 68}</span>
              </div>
            </div>
          </div>

          {/* Kart 5: Arazi Hakimiyeti */}
          <div className="rounded-xl bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 p-4 flex flex-col justify-between shadow-lg transition-all group">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-rose-950/60 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-mono font-bold text-[#BBE1FA]">Arazi Hakimiyeti</span>
              </div>
              <TierBadge tier={mu?.rankings?.muTerrain?.tier || 'platinum'} />
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-2xl font-black text-white">
                  {((mu?.rankings?.muTerrain?.value ?? 23899) / 1000).toFixed(1)}K
                </span>
                <span className="text-[10px] text-[#BBE1FA]/60 font-bold">KM²</span>
              </div>
              <div className="px-2 py-0.5 rounded bg-[#141C21] border border-rose-500/30 text-[11px] font-mono text-rose-300">
                Rank: <span className="font-bold">#{mu?.rankings?.muTerrain?.rank ?? 243}</span>
              </div>
            </div>
          </div>

          {/* Kart 6: Birlik Varlığı */}
          <div className="rounded-xl bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 p-4 flex flex-col justify-between shadow-lg transition-all group">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-300">
                  <Coins className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-mono font-bold text-amber-300">Birlik Varlığı</span>
              </div>
              <TierBadge tier={mu?.rankings?.muWealth?.tier || 'silver'} />
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-2xl font-black text-amber-300">
                  {mu?.rankings?.muWealth?.value ?? 679.97}
                </span>
                <span className="text-[10px] text-amber-400 font-bold">GOLD</span>
              </div>
              <div className="px-2 py-0.5 rounded bg-[#141C21] border border-rose-500/30 text-[11px] font-mono text-rose-300">
                Rank: <span className="font-bold">#{mu?.rankings?.muWealth?.rank ?? 661}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. ÜYE LİSTESİ & KONTROL ÇUBUĞU (Member Roster) */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl bg-[#182329]/90 border border-rose-500/25 hover:border-rose-500/40 shadow-xl transition-all">
          {/* Başlık */}
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-white">
                Birlik Üye Listesi & Askeri Kadro
              </h3>
            </div>
            <p className="text-[11px] text-[#BBE1FA]/60 font-sans mt-0.5">
              {mu?.name || 'Turkic Tribe'} bünyesindeki {members.length} üyenin kullanıcı adı, seviye ve güncel unvanları.
            </p>
          </div>

          {/* Kontrol Elemanları: Rol Filtresi, Arama, Yenile */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Rol Filtre Butonları */}
            <div className="inline-flex items-center p-1 rounded-xl bg-[#141C21] border border-rose-500/25 font-mono text-xs">
              <button
                type="button"
                onClick={() => setRoleFilter('all')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  roleFilter === 'all'
                    ? 'bg-rose-950/90 text-rose-300 border border-rose-500/50 font-bold shadow-xs'
                    : 'text-[#BBE1FA]/70 hover:text-white'
                }`}
              >
                Tümü ({members.length})
              </button>

              <button
                type="button"
                onClick={() => setRoleFilter('commanders')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  roleFilter === 'commanders'
                    ? 'bg-rose-950/90 text-rose-300 border border-rose-500/50 font-bold shadow-xs'
                    : 'text-[#BBE1FA]/70 hover:text-white'
                }`}
              >
                Komutanlar ({commandersCount})
              </button>

              <button
                type="button"
                onClick={() => setRoleFilter('managers')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  roleFilter === 'managers'
                    ? 'bg-rose-950/90 text-rose-300 border border-rose-500/50 font-bold shadow-xs'
                    : 'text-[#BBE1FA]/70 hover:text-white'
                }`}
              >
                Yöneticiler ({managersCount})
              </button>
            </div>

            {/* Arama Kutusu */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-rose-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Kullanıcı adı veya ID ara..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#141C21] border border-rose-500/30 text-xs font-mono text-white placeholder:text-[#BBE1FA]/40 focus:outline-none focus:border-rose-400 transition-colors"
              />
            </div>

            {/* Üye Verilerini Güncelle Butonu */}
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isRefreshing || isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/40 text-xs font-mono font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-rose-300 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Üye verilerini güncelle</span>
            </button>
          </div>
        </div>

        {/* 5. TEK SÜTUN ASKER LİSTESİ SATIRLARI (Member Rows) */}
        <div className="space-y-2">
          {filteredMembers.map((member, idx) => {
            const rankNo = idx + 1;
            const isTop3 = rankNo <= 3;
            const isLeader = member.role === 'leader';
            const isCommander = member.role === 'commander';

            return (
              <div
                key={member.userId}
                onClick={() => setSelectedMember(member)}
                className="rounded-xl bg-[#141C21]/80 hover:bg-[#182329] border border-rose-500/15 hover:border-rose-500/45 p-3.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md cursor-pointer group"
              >
                {/* Sol Elemanlar: Sıralama No, Avatar, Lv, İsim, Rozetler */}
                <div className="flex items-center gap-3 min-w-0">
                  {/* Sıralama No Rozeti */}
                  <div
                    className={`w-6 h-6 rounded-full font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                      rankNo === 1
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60 shadow-xs'
                        : isTop3
                        ? 'bg-rose-950/60 text-rose-300 border border-rose-500/50'
                        : 'bg-[#182329] text-[#BBE1FA]/60 border border-rose-500/25'
                    }`}
                  >
                    {rankNo}
                  </div>

                  {/* Avatar & Lv rozeti */}
                  <div className="relative shrink-0">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt={member.username}
                        className="w-10 h-10 rounded-full object-cover border border-rose-500/30 group-hover:border-rose-400 transition-colors"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#182329] border border-rose-500/30 text-rose-300 font-mono text-xs font-bold flex items-center justify-center">
                        {member.username.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="absolute -bottom-1 -right-1 px-1 py-0.2 rounded bg-[#141C21] border border-rose-500/40 font-mono text-[9px] font-bold text-[#BBE1FA]">
                      Lv.{member.level}
                    </span>
                  </div>

                  {/* Oyuncu Adı, Komutan/Lider Rozeti, Tier, User ID */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-white font-mono group-hover:text-rose-200 transition-colors truncate">
                        {member.username}
                      </span>

                      {/* Komutan (C) / Lider (L) / Yönetici (M) rozeti */}
                      {isLeader ? (
                        <span
                          className="px-1.5 py-0.2 rounded font-mono text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/50 shrink-0"
                          title="Birlik Sahibi / Kurucu"
                        >
                          L
                        </span>
                      ) : isCommander ? (
                        <span
                          className="px-1.5 py-0.2 rounded font-mono text-[9px] font-black bg-rose-950/80 text-rose-300 border border-rose-500/50 shrink-0"
                          title="Komutan"
                        >
                          C
                        </span>
                      ) : member.role === 'manager' ? (
                        <span
                          className="px-1.5 py-0.2 rounded font-mono text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shrink-0"
                          title="Yönetici"
                        >
                          M
                        </span>
                      ) : null}

                      {/* Kişisel TierBadge */}
                      <TierBadge tier={member.weeklyTier} />
                    </div>

                    {/* Tıklanabilir User ID Rozeti */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => handleCopyId(member.userId, e)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#182329] hover:bg-[#141C21] border border-rose-500/20 text-[10px] font-mono text-[#BBE1FA]/60 hover:text-rose-300 transition-all cursor-pointer"
                        title="Oyuncu ID'sini kopyala"
                      >
                        <span>ID: {member.userId}</span>
                        {copiedMap[member.userId] ? (
                          <Check className="w-2.5 h-2.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-2.5 h-2.5 text-rose-400" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sağ: Haftalık Hasar Miktarı */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-rose-500/15 pt-2 sm:pt-0 shrink-0 font-mono">
                  <span className="text-[10px] text-[#BBE1FA]/50 sm:text-right block">Haftalık Hasar</span>
                  <div className="flex items-center gap-1.5 text-rose-400 font-bold text-sm">
                    <Flame className="w-3.5 h-3.5 text-rose-400" />
                    <span>{formatDamage(member.weeklyDamage)}</span>
                    <span className="text-[10px] text-[#BBE1FA]/60">DMG</span>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredMembers.length === 0 && (
            <div className="py-12 text-center text-[#BBE1FA]/50 font-mono text-xs rounded-xl bg-[#141C21]/60 border border-rose-500/20">
              Arama kriterlerine uygun üye bulunamadı.
            </div>
          )}
        </div>
      </div>

      {/* 6. ÜYE PROFİL DETAY MODALI */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-[#182329] border border-rose-500/40 rounded-2xl shadow-2xl p-6 flex flex-col overflow-hidden text-white font-mono">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-rose-500/20 mb-4">
              <div className="flex items-center gap-3.5">
                <div className="relative">
                  {selectedMember.avatarUrl ? (
                    <img
                      src={selectedMember.avatarUrl}
                      alt={selectedMember.username}
                      className="w-14 h-14 rounded-full object-cover border-2 border-rose-500/50"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-[#141C21] border-2 border-rose-500/50 text-rose-300 font-bold text-base flex items-center justify-center">
                      {selectedMember.username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-full bg-[#141C21] border border-rose-500/60 text-[10px] font-black text-rose-300">
                    Lv.{selectedMember.level}
                  </span>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">{selectedMember.username}</h3>
                    <TierBadge tier={selectedMember.weeklyTier} />
                  </div>
                  <p className="text-xs text-rose-300/80 mt-0.5">{selectedMember.roleLabel}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="p-1 rounded-lg bg-[#141C21] border border-rose-500/30 text-[#BBE1FA] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Stats Grid */}
            <div className="space-y-4">
              {/* Copyable ID Bar */}
              <div className="p-2.5 rounded-xl bg-[#141C21] border border-rose-500/20 flex items-center justify-between text-xs">
                <span className="text-[#BBE1FA]/60">Oyuncu ID:</span>
                <button
                  type="button"
                  onClick={() => handleCopyId(selectedMember.userId)}
                  className="flex items-center gap-1.5 text-rose-300 hover:text-white cursor-pointer"
                >
                  <span className="font-bold">{selectedMember.userId}</span>
                  {copiedMap[selectedMember.userId] ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-rose-400" />
                  )}
                </button>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#141C21] border border-rose-500/20">
                  <span className="text-[#BBE1FA]/60 block text-[10px]">Haftalık Hasar</span>
                  <span className="text-rose-400 font-bold text-base block mt-0.5">
                    {formatDamage(selectedMember.weeklyDamage)} DMG
                  </span>
                  <span className="text-[10px] text-[#BBE1FA]/50">Lig Rank: #{selectedMember.weeklyRank || '-'}</span>
                </div>

                <div className="p-3 rounded-xl bg-[#141C21] border border-rose-500/20">
                  <span className="text-[#BBE1FA]/60 block text-[10px]">Tüm Zamanlar Hasar</span>
                  <span className="text-amber-400 font-bold text-base block mt-0.5">
                    {formatDamage(selectedMember.allTimeDamage)} DMG
                  </span>
                  <span className="text-[10px] text-[#BBE1FA]/50">Lig Rank: #{selectedMember.allTimeRank || '-'}</span>
                </div>

                <div className="p-3 rounded-xl bg-[#141C21] border border-rose-500/20">
                  <span className="text-[#BBE1FA]/60 block text-[10px]">Toplam Tecrübe (XP)</span>
                  <span className="text-emerald-400 font-bold text-base block mt-0.5">
                    {selectedMember.totalXp.toLocaleString('tr-TR')} XP
                  </span>
                  <span className="text-[10px] text-purple-300">
                    {selectedMember.prestigeLevel ? `Prestij: ${selectedMember.prestigeLevel}` : 'Prestij Yok'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[#141C21] border border-rose-500/20">
                  <span className="text-[#BBE1FA]/60 block text-[10px]">Toplam Servet</span>
                  <span className="text-amber-300 font-bold text-base block mt-0.5">
                    ${Math.round(selectedMember.wealth).toLocaleString('tr-TR')}
                  </span>
                  <span className="text-[10px] text-[#BBE1FA]/50">Varlık Puanı</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-4 mt-4 border-t border-rose-500/20 text-right">
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="px-4 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-200 font-mono text-xs font-bold transition-all cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
