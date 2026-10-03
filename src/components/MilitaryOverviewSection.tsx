import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  Swords, 
  Trophy, 
  TrendingUp, 
  Coins, 
  Shield, 
  Crown, 
  Medal, 
  Zap, 
  BarChart3, 
  CheckCircle2, 
  ChevronRight, 
  ChevronDown, 
  Check, 
  Building2, 
  X, 
  Search, 
  Flame 
} from 'lucide-react';
import { MilitaryOverviewData, PRESET_MILITARY_UNITS } from '../types';
import { fetchMilitaryOverview, getCachedMilitaryOverview } from '../services/wareraApi';
import { ActiveTab } from '../App';

interface MilitaryOverviewSectionProps {
  muId: string;
  onMuIdChange: (newId: string) => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

export const MilitaryOverviewSection: React.FC<MilitaryOverviewSectionProps> = ({
  muId,
  onMuIdChange,
  onNavigateTab,
}) => {
  const [data, setData] = useState<MilitaryOverviewData | null>(() => getCachedMilitaryOverview(muId));
  const [isLoading, setIsLoading] = useState(!data);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadData = async (forceRefresh = false) => {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      const cached = getCachedMilitaryOverview(muId);
      if (cached) {
        setData(cached);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
    }
    setError(null);

    try {
      const overview = await fetchMilitaryOverview(muId, forceRefresh);
      setData(overview);
    } catch (err: any) {
      console.error('Error fetching military overview:', err);
      setError(err.message || 'Ordu bilgileri yüklenemedi');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [muId]);

  const handleSelectMu = (newId: string) => {
    if (newId !== muId) {
      onMuIdChange(newId);
    }
    setIsDropdownOpen(false);
  };

  const activePreset = PRESET_MILITARY_UNITS.find((m) => m.id === muId);
  const currentDisplayName = data?.muInfo?.name || activePreset?.name || 'Turkic Tribe';
  const currentAvatarUrl = data?.muInfo?.avatarUrl || activePreset?.avatarUrl;

  // Formatters
  const formatDamage = (dmg?: number) => {
    if (!dmg) return '0';
    if (dmg >= 1e9) return `${(dmg / 1e9).toFixed(2)}B`;
    if (dmg >= 1e6) return `${(dmg / 1e6).toFixed(2)}M`;
    if (dmg >= 1e3) return `${(dmg / 1e3).toFixed(1)}K`;
    return dmg.toLocaleString('tr-TR');
  };

  const formatWealth = (w?: number) => {
    if (!w) return '$0';
    if (w >= 1e6) return `$${(w / 1e6).toFixed(1)}M`;
    if (w >= 1e3) return `$${(w / 1e3).toFixed(1)}K`;
    return `$${Math.round(w).toLocaleString('tr-TR')}`;
  };

  // Filter members for modal
  const filteredMembers = (data?.members || []).filter((m) => {
    if (!memberSearchQuery.trim()) return true;
    return m.username.toLowerCase().includes(memberSearchQuery.toLowerCase());
  });

  return (
    <div className="w-full space-y-5">
      {/* 4 Kartlık Tek Satır: Askeri Birlik (Üye & Seviye Bilgisiyle), Haftalık Hasar, Toplam Hasar, Toplam Servet */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {/* 1. Askeri Birlik (Ordu) Seçimi Kartı + Üye Sayısı & Seviye Ortalaması Bilgileri */}
        <div
          id="card-mu-selector"
          ref={dropdownRef}
          className="bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 rounded-xl p-5 transition-all duration-300 flex flex-col justify-between h-full relative shadow-lg shadow-black/25 group"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-[#BBE1FA]/80 uppercase tracking-widest font-mono">
                Askeri Birlik (Ordu)
              </span>
              <div className="w-8 h-8 rounded-lg bg-[#0F4C75]/25 text-[#3282B8] flex items-center justify-center border border-[#3282B8]/30 group-hover:border-[#3282B8]/60 transition-colors">
                <Shield className="w-4 h-4" />
              </div>
            </div>

            {/* Interactive Trigger Button */}
            <button
              id="mu-dropdown-trigger"
              type="button"
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              className="w-full flex items-center justify-between p-2.5 rounded-lg border border-[#3282B8]/30 hover:border-[#3282B8]/60 bg-[#141C21]/80 hover:bg-[#141C21] transition-all text-left cursor-pointer shadow-inner"
              title="Başka bir ordu seçin"
            >
              <div className="flex items-center gap-3 min-w-0">
                {currentAvatarUrl ? (
                  <img
                    src={currentAvatarUrl}
                    alt={currentDisplayName}
                    className="w-9 h-9 rounded-lg object-cover border border-[#3282B8]/40 shrink-0 shadow-sm"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-[#0F4C75]/30 flex items-center justify-center text-[#3282B8] shrink-0 border border-[#3282B8]/40">
                    <Shield className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate group-hover:text-[#BBE1FA] transition-colors">
                    {currentDisplayName}
                  </div>
                  <div className="text-[11px] text-[#BBE1FA]/60 font-mono flex items-center gap-1.5 mt-0.5">
                    <span>{data?.stats?.memberCount ?? 21} Asker</span>
                    <span>•</span>
                    <span>Lv. 1</span>
                  </div>
                </div>
              </div>

              <ChevronDown
                className={`w-4 h-4 text-[#3282B8] transition-transform duration-200 shrink-0 ml-2 ${
                  isDropdownOpen ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>
          </div>

          {/* Askeri Birlik Butonunun Altındaki Birleştirilmiş Bilgiler (Üye Sayısı & Seviye Ortalaması) */}
          <div className="mt-3 pt-2.5 border-t border-[#3282B8]/20 grid grid-cols-2 gap-2 text-[11px] font-mono">
            {/* Üye Sayısı */}
            <div className="min-w-0">
              <span className="text-[#BBE1FA]/60 block text-[10px]">Üye Sayısı:</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-sm font-black text-white font-mono">{data?.stats?.memberCount ?? '-'}</span>
                <span className="text-[10px] text-cyan-400 font-bold">Asker</span>
              </div>
              <span className="text-[10px] text-cyan-400/90 block truncate mt-0.5">
                {data?.stats?.commanderCount ?? 0} Yetkili
              </span>
            </div>

            {/* Seviye Ortalaması */}
            <div className="min-w-0 border-l border-[#3282B8]/15 pl-2.5">
              <span className="text-[#BBE1FA]/60 block text-[10px]">Seviye Ort.:</span>
              <div className="mt-0.5">
                <span className="text-sm font-black text-white font-mono">Lv. {data?.stats?.averageLevel ?? '-'}</span>
              </div>
              <span className="text-[10px] text-emerald-400/90 block truncate mt-0.5" title={data?.mvps?.mostExperienced?.username}>
                En Den: {data?.mvps?.mostExperienced?.username || '-'}
              </span>
            </div>
          </div>

          {/* 6 Armies Dropdown Menu */}
          {isDropdownOpen && (
            <div
              id="mu-dropdown-menu"
              className="absolute left-0 right-0 top-full mt-2 bg-[#182329] rounded-xl border border-rose-500/40 p-2 shadow-2xl z-50 max-h-72 overflow-y-auto backdrop-blur-xl animate-in fade-in duration-150"
            >
              <div className="px-3 py-1.5 border-b border-[#3282B8]/20 mb-1 flex items-center justify-between">
                <span className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Building2 className="w-3.5 h-3.5 text-[#3282B8]" />
                  Kayıtlı Ordular
                </span>
                <span className="text-[10px] text-[#BBE1FA]/70 font-mono">
                  {PRESET_MILITARY_UNITS.length} Birlik
                </span>
              </div>

              <div className="space-y-1">
                {PRESET_MILITARY_UNITS.map((unit) => {
                  const isSelected = unit.id === muId;
                  return (
                    <button
                      key={unit.id}
                      type="button"
                      onClick={() => handleSelectMu(unit.id)}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs font-mono transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#0F4C75]/40 border border-[#3282B8]/60 text-white font-bold'
                          : 'text-[#BBE1FA]/80 hover:text-white hover:bg-[#141C21] border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={unit.avatarUrl}
                          alt={unit.name}
                          className={`w-7 h-7 rounded-lg object-cover border shrink-0 ${
                            isSelected ? 'border-[#3282B8]' : 'border-transparent'
                          }`}
                          referrerPolicy="no-referrer"
                        />
                        <span className="truncate">{unit.name}</span>
                      </div>

                      {isSelected && (
                        <Check className="w-4 h-4 text-[#3282B8] shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 2. HAFTALIK HASAR Kartı */}
        <div className="bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 rounded-xl p-5 transition-all shadow-lg flex flex-col justify-between h-full group">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-rose-400">
                HAFTALIK HASAR
              </span>
              <div className="w-8 h-8 rounded-lg bg-rose-950/60 border border-rose-500/30 flex items-center justify-center text-rose-400 group-hover:scale-105 transition-transform">
                <Swords className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-white font-mono">
                {data ? formatDamage(data.stats.totalWeeklyDamage) : '-'}
              </span>
            </div>
            <p className="text-[11px] text-[#BBE1FA]/60 mt-1">
              Bu hafta vurulan toplam hasar
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-rose-500/15 flex items-center justify-between text-[11px] font-mono">
            <span className="text-[#BBE1FA]/60">Haftalık Lider:</span>
            <span className="font-bold text-rose-400 truncate max-w-[140px]" title={data?.mvps?.weeklyDamageLeader?.username}>
              {data?.mvps?.weeklyDamageLeader?.username || '-'}
            </span>
          </div>
        </div>

        {/* 3. TOPLAM HASAR Kartı */}
        <div className="bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 rounded-xl p-5 transition-all shadow-lg flex flex-col justify-between h-full group">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-400">
                TOPLAM HASAR
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                <Trophy className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                {data ? formatDamage(data.stats.totalAllTimeDamage) : '-'}
              </span>
            </div>
            <p className="text-[11px] text-[#BBE1FA]/60 mt-1">
              Kuruluştan bu yana kümülatif
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-rose-500/15 flex items-center justify-between text-[11px] font-mono">
            <span className="text-[#BBE1FA]/60">Tüm Zamanlar:</span>
            <span className="font-bold text-amber-400 truncate max-w-[140px]" title={data?.mvps?.allTimeDamageLeader?.username}>
              {data?.mvps?.allTimeDamageLeader?.username || '-'}
            </span>
          </div>
        </div>

        {/* 4. TOPLAM SERVET Kartı */}
        <div className="bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 rounded-xl p-5 transition-all shadow-lg flex flex-col justify-between h-full group">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-300">
                TOPLAM SERVET
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-300 group-hover:scale-105 transition-transform">
                <Coins className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl sm:text-3xl font-black text-amber-300 font-mono">
                {data ? formatWealth(data.stats.totalWealth) : '-'}
              </span>
            </div>
            <p className="text-[11px] text-[#BBE1FA]/60 mt-1">
              Tüm üyelerin toplam ekonomik varlığı
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-yellow-500/15 flex items-center justify-between text-[11px] font-mono">
            <span className="text-[#BBE1FA]/60">Üye Ortalaması:</span>
            <span className="font-bold text-amber-300">
              {data ? formatWealth(data.stats.averageWealth) : '-'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. SATIR: Liderlik Kadrosu, Birlik Öncüleri (MVP), Seviye Spektrumu */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sütun 1: LİDERLİK KADROSU */}
        <div className="rounded-2xl bg-[#182329]/90 border border-rose-500/25 hover:border-rose-500/40 p-5 flex flex-col justify-between shadow-xl transition-all">
          <div>
            {/* Kart Başlığı */}
            <div className="flex items-center justify-between pb-3.5 border-b border-rose-500/15 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Crown className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold font-mono text-white tracking-wide uppercase">
                    LİDERLİK KADROSU
                  </h3>
                  <p className="text-[11px] text-[#BBE1FA]/60 font-sans">
                    Birlik komuta ve yönetim heyeti
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMembersModalOpen(true)}
                className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 font-mono font-semibold transition-colors cursor-pointer"
              >
                <span>Tüm Üyeler</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Liderler Listesi */}
            <div className="space-y-2.5">
              {data?.leadership && data.leadership.length > 0 ? (
                data.leadership.map((leader) => {
                  const isMainLeader = leader.role === 'leader';
                  return (
                    <div
                      key={leader.userId}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#141C21]/80 hover:bg-[#141C21] border border-[#3282B8]/15 hover:border-[#3282B8]/40 transition-all group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Avatar */}
                        {leader.avatarUrl ? (
                          <img
                            src={leader.avatarUrl}
                            alt={leader.username}
                            className={`w-9 h-9 rounded-full object-cover shrink-0 border ${
                              isMainLeader ? 'border-amber-500/60 shadow-xs' : 'border-[#3282B8]/30'
                            }`}
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-[#182329] border border-[#3282B8]/30 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                            {leader.username.slice(0, 2).toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white text-xs font-mono truncate group-hover:text-cyan-300 transition-colors">
                              {leader.username}
                            </span>
                            {isMainLeader ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                                LİDER
                              </span>
                            ) : leader.role === 'commander' ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#0F4C75]/40 text-cyan-300 border border-cyan-500/30 shrink-0">
                                Komutan
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                                Yönetici
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-[#BBE1FA]/50 truncate mt-0.5">
                            {leader.roleLabel}
                          </p>
                        </div>
                      </div>

                      {/* Level Badge */}
                      <div className="px-2.5 py-1 rounded-lg bg-[#182329] border border-[#3282B8]/30 font-mono text-xs font-bold text-white shrink-0 ml-2">
                        Lv. {leader.level}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-[#BBE1FA]/50 text-xs font-mono">
                  Liderlik bilgisi yükleniyor...
                </div>
              )}
            </div>
          </div>

          {/* Alt Kısım */}
          <div className="mt-4 pt-3 border-t border-[#3282B8]/15 flex items-center justify-between text-xs font-mono text-[#BBE1FA]/60">
            <span>Toplam Komutan Sayısı:</span>
            <span className="font-bold text-white">
              {data?.leadership?.length || 0}
            </span>
          </div>
        </div>

        {/* Sütun 2: BİRLİK ÖNCÜLERİ (MVP) */}
        <div className="rounded-2xl bg-[#182329]/90 border border-rose-500/25 hover:border-rose-500/40 p-5 flex flex-col justify-between shadow-xl transition-all">
          <div>
            {/* Kart Başlığı */}
            <div className="flex items-center gap-2.5 pb-3.5 border-b border-rose-500/15 mb-4">
              <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Medal className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold font-mono text-white tracking-wide uppercase">
                  BİRLİK ÖNCÜLERİ (MVP)
                </h3>
                <p className="text-[11px] text-[#BBE1FA]/60 font-sans">
                  En yüksek skor ve katılım sağlayanlar
                </p>
              </div>
            </div>

            {/* 3 MVP Kartı */}
            <div className="space-y-3">
              {/* 1. Haftalık Hasar Lideri */}
              <div className="p-3.5 rounded-xl bg-[#141C21]/90 border border-rose-500/30 flex items-center justify-between group hover:border-rose-500/50 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-rose-950/80 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                    <Swords className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-400 block">
                      HAFTALIK HASAR LİDERİ
                    </span>
                    <span className="text-sm font-bold font-mono text-white group-hover:text-rose-200 transition-colors">
                      {data?.mvps?.weeklyDamageLeader?.username || '-'}
                    </span>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div className="text-sm font-black text-rose-400">
                    {data?.mvps?.weeklyDamageLeader?.formattedValue || '0'}
                  </div>
                  <span className="text-[10px] text-[#BBE1FA]/50 block">hasar</span>
                </div>
              </div>

              {/* 2. En Deneyimli Asker */}
              <div className="p-3.5 rounded-xl bg-[#141C21]/90 border border-emerald-500/30 flex items-center justify-between group hover:border-emerald-500/50 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 block">
                      EN DENEYİMLİ ASKER
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold font-mono text-white group-hover:text-emerald-200 transition-colors">
                        {data?.mvps?.mostExperienced?.username || '-'}
                      </span>
                      {data?.mvps?.mostExperienced?.prestigeLevel ? (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-purple-950/80 text-purple-300 border border-purple-500/40">
                          Prestij {data.mvps.mostExperienced.prestigeLevel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div className="text-sm font-black text-emerald-400">
                    {data?.mvps?.mostExperienced?.formattedValue || '0 XP'}
                  </div>
                  <span className="text-[10px] text-[#BBE1FA]/50 block">
                    Lv. {data?.mvps?.mostExperienced?.level || '-'}
                  </span>
                </div>
              </div>

              {/* 3. En Varlıklı Üye */}
              <div className="p-3.5 rounded-xl bg-[#141C21]/90 border border-amber-500/30 flex items-center justify-between group hover:border-amber-500/50 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-950/80 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 block">
                      EN VARLIKLI ÜYE
                    </span>
                    <span className="text-sm font-bold font-mono text-white group-hover:text-amber-200 transition-colors">
                      {data?.mvps?.wealthiest?.username || '-'}
                    </span>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <div className="text-sm font-black text-amber-300">
                    {data?.mvps?.wealthiest?.formattedValue || '$0'}
                  </div>
                  <span className="text-[10px] text-[#BBE1FA]/50 block">servet</span>
                </div>
              </div>
            </div>
          </div>

          {/* Alt Kısım */}
          <div className="mt-4 pt-3 border-t border-[#3282B8]/15 flex items-center justify-between text-xs font-mono">
            <span className="text-[#BBE1FA]/60">Birlik Durumu:</span>
            <span className="font-bold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Tam Muharebe Hazır</span>
            </span>
          </div>
        </div>

        {/* Sütun 3: SEVİYE SPEKTRUMU */}
        <div className="rounded-2xl bg-[#182329]/90 border border-rose-500/25 hover:border-rose-500/40 p-5 flex flex-col justify-between shadow-xl transition-all">
          <div>
            {/* Kart Başlığı */}
            <div className="flex items-center gap-2.5 pb-3.5 border-b border-rose-500/15 mb-4">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold font-mono text-white tracking-wide uppercase">
                  SEVİYE SPEKTRUMU
                </h3>
                <p className="text-[11px] text-[#BBE1FA]/60 font-sans">
                  Üyelerin kademelere göre dağılımı (Maks. Lv. 50)
                </p>
              </div>
            </div>

            {/* İlerleme Çubukları */}
            <div className="space-y-3.5">
              {data?.levelSpectrum && data.levelSpectrum.length > 0 ? (
                data.levelSpectrum.map((item, idx) => {
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-[#BBE1FA]/80 font-medium">
                          {item.range}
                        </span>
                        <span className="text-white font-bold">
                          {item.count} Üye{' '}
                          <span className="text-[#BBE1FA]/60 font-normal">
                            (%{item.percentage})
                          </span>
                        </span>
                      </div>

                      {/* Çubuk */}
                      <div className="h-2 w-full rounded-full bg-[#141C21] border border-[#3282B8]/20 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            item.percentage > 0
                              ? idx === 0
                                ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                                : idx === 1
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                : idx === 2
                                ? 'bg-gradient-to-r from-[#0F4C75] to-[#3282B8]'
                                : 'bg-slate-500'
                              : 'bg-transparent'
                          }`}
                          style={{ width: `${Math.max(item.percentage, item.count > 0 ? 5 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-[#BBE1FA]/50 text-xs font-mono">
                  Spektrum hesaplanıyor...
                </div>
              )}
            </div>
          </div>

          {/* Alt Butonlar */}
          <div className="mt-5 pt-3 border-t border-[#3282B8]/15 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onNavigateTab('combatDamage')}
              className="px-3 py-2 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 text-rose-300 hover:text-white border border-rose-500/40 text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span>Hasar Tablosu</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateTab('armyStats')}
              className="px-3 py-2 rounded-xl bg-[#141C21] hover:bg-[#182329] text-emerald-300 hover:text-white border border-emerald-500/40 text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Coins className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ekonomi Tablosu</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tüm Üyeler Modal */}
      {isMembersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl max-h-[85vh] bg-[#182329] border border-rose-500/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-rose-500/20 flex items-center justify-between bg-[#141C21]/80">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-sm font-bold font-mono text-white">
                    Tüm Ordu Üyeleri ({data?.members?.length || 0} Asker)
                  </h3>
                  <p className="text-[11px] text-[#BBE1FA]/60 font-sans">
                    {data?.muInfo?.name} bünyesindeki tüm kayıtlı askerler
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMembersModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-[#141C21] border border-[#3282B8]/30 text-[#BBE1FA] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Search Filter */}
            <div className="p-3 border-b border-[#3282B8]/15 bg-[#141C21]/40">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#3282B8]" />
                <input
                  type="text"
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  placeholder="Asker adına göre ara..."
                  className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-[#3282B8]/30 bg-[#141C21] text-white placeholder:text-[#BBE1FA]/40 focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>
            </div>

            {/* Modal Members List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 divide-y divide-[#3282B8]/10">
              {filteredMembers.map((member, idx) => (
                <div
                  key={member.userId || idx}
                  className="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs font-mono"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt={member.username}
                        className="w-8 h-8 rounded-full object-cover border border-[#3282B8]/30 shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#141C21] text-[#BBE1FA] flex items-center justify-center text-xs font-bold border border-[#3282B8]/30 shrink-0 font-mono">
                        {member.username.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white truncate">{member.username}</span>
                        {member.prestigeLevel ? (
                          <span className="px-1 py-0.2 rounded text-[9px] bg-purple-950/80 text-purple-300 border border-purple-500/30">
                            P{member.prestigeLevel}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-[10px] text-[#BBE1FA]/50 block">
                        Haftalık: {formatDamage(member.weeklyDamage)} hasar
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-amber-300 text-[11px]">
                      {formatWealth(member.wealth)}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[#141C21] border border-[#3282B8]/30 font-bold text-white text-[11px]">
                      Lv. {member.level}
                    </span>
                  </div>
                </div>
              ))}

              {filteredMembers.length === 0 && (
                <div className="py-8 text-center text-[#BBE1FA]/50 text-xs font-mono">
                  Eşleşen asker bulunamadı.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-[#3282B8]/20 bg-[#141C21]/80 text-right">
              <button
                type="button"
                onClick={() => setIsMembersModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-[#0F4C75] hover:bg-[#3282B8] text-white font-mono text-xs font-semibold transition-colors cursor-pointer"
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
