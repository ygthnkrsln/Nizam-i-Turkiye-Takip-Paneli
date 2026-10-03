import React from 'react';
import { 
  HeartHandshake, 
  Building2, 
  BarChart3, 
  Swords, 
  TrendingUp, 
  Shield, 
  Crosshair, 
  Flame,
  Crown,
  ScrollText,
  Coins,
  Handshake
} from 'lucide-react';
import { ActiveTab, AppMode } from '../App';
import { NizamTurkiyeLogo } from './NizamTurkiyeLogo';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  activeTab, 
  onTabChange, 
  currentMode, 
  onModeChange 
}) => {
  return (
    <header id="main-header" className="border-b border-[#3282B8]/20 bg-[#162026]/95 backdrop-blur-md sticky top-0 z-30 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          
          {/* 1. Sol Kısım: Nizam-ı Türkiye Logosu ve Site İsmi */}
          <div className="flex items-center gap-3 shrink-0">
            <button 
              type="button" 
              onClick={() => onTabChange('donations')} 
              className="flex items-center gap-2.5 text-left group cursor-pointer transition-transform hover:scale-[1.01]"
              title="Nizam-ı Türkiye Takip Paneli Ana Sayfa"
            >
              <div className="relative shrink-0">
                <NizamTurkiyeLogo className="w-10 h-10 sm:w-11 sm:h-11 drop-shadow-[0_2px_10px_rgba(223,178,83,0.35)]" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm sm:text-base font-black tracking-wider bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 bg-clip-text text-transparent font-serif uppercase">
                    NİZAM-I TÜRKİYE
                  </span>
                </div>
                <span className="text-[11px] font-bold text-[#BBE1FA] font-mono tracking-tight -mt-0.5">
                  Takip Paneli
                </span>
              </div>
            </button>
          </div>

          {/* 2. Sağ Kısım: Mod Switch Butonları ve Hemen Yanına Yaslı Sekme Butonları */}
          <div className="flex flex-wrap items-center gap-2 lg:gap-2.5 w-full md:w-auto justify-start md:justify-end">
            
            {/* Ekonomi / Savaş / Yönetim Modu Switcher */}
            <div className="inline-flex items-center rounded-xl bg-[#141C21] p-1 border border-[#3282B8]/25 shadow-inner shrink-0">
              {/* Ekonomi Modu */}
              <button
                id="mode-economy-btn"
                type="button"
                onClick={() => onModeChange('economy')}
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  currentMode === 'economy'
                    ? 'bg-emerald-950/90 text-emerald-300 font-bold border border-emerald-500/50 shadow-sm'
                    : 'text-emerald-400/60 hover:text-emerald-300 hover:bg-[#182329] border border-transparent'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Ekonomi</span>
              </button>

              {/* Savaş Modu */}
              <button
                id="mode-combat-btn"
                type="button"
                onClick={() => onModeChange('combat')}
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  currentMode === 'combat'
                    ? 'bg-rose-950/90 text-rose-300 font-bold border border-rose-500/50 shadow-sm'
                    : 'text-rose-400/60 hover:text-rose-300 hover:bg-[#182329] border border-transparent'
                }`}
              >
                <Swords className="w-3.5 h-3.5 text-rose-400" />
                <span>Savaş</span>
              </button>

              {/* Altın Renginde Yönetim Modu */}
              <button
                id="mode-management-btn"
                type="button"
                onClick={() => onModeChange('management')}
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  currentMode === 'management'
                    ? 'bg-amber-950/90 text-amber-300 font-bold border border-amber-500/50 shadow-md shadow-amber-950/40'
                    : 'text-amber-400/70 hover:text-amber-300 hover:bg-[#182329] border border-transparent'
                }`}
              >
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>Yönetim</span>
              </button>
            </div>

            {/* Dinamik Sekme Butonları: Mod Değiştiriciye Yaslı */}
            {currentMode === 'economy' && (
              /* Ekonomi Modu Butonları (Yeşil Tema) */
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#141C21] border border-emerald-500/25 shadow-inner overflow-x-auto">
                {/* Tab 1: Bağış Takip Paneli */}
                <button
                  id="tab-donations-btn"
                  type="button"
                  onClick={() => onTabChange('donations')}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'donations'
                      ? 'bg-emerald-950/90 text-emerald-300 font-bold border border-emerald-500/50 shadow-md shadow-emerald-950/40'
                      : 'text-emerald-400/60 hover:text-emerald-300 hover:bg-[#182329] border border-transparent'
                  }`}
                >
                  <HeartHandshake className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Bağış Takip Paneli</span>
                </button>

                {/* Tab 2: Ordu İstatistikleri */}
                <button
                  id="tab-armystats-btn"
                  type="button"
                  onClick={() => onTabChange('armyStats')}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'armyStats'
                      ? 'bg-emerald-950/90 text-emerald-300 font-bold border border-emerald-500/50 shadow-md shadow-emerald-950/40'
                      : 'text-emerald-400/60 hover:text-emerald-300 hover:bg-[#182329] border border-transparent'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Ordu İstatistikleri</span>
                </button>

                {/* Tab 3: Ülke İstatistikleri */}
                <button
                  id="tab-countrystats-btn"
                  type="button"
                  onClick={() => onTabChange('countryStats')}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'countryStats'
                      ? 'bg-emerald-950/90 text-emerald-300 font-bold border border-emerald-500/50 shadow-md shadow-emerald-950/40'
                      : 'text-emerald-400/60 hover:text-emerald-300 hover:bg-[#182329] border border-transparent'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Ülke İstatistikleri</span>
                </button>
              </div>
            )}

            {currentMode === 'combat' && (
              /* Savaş Modu Butonları (Kırmızı/Rose Tema) */
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#141C21] border border-rose-500/25 shadow-inner overflow-x-auto">
                {/* Tab 1: Ordu Bilgisi */}
                <button
                  id="tab-combat-armyinfo-btn"
                  type="button"
                  onClick={() => onTabChange('combatArmyInfo')}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'combatArmyInfo'
                      ? 'bg-rose-950/90 text-rose-300 font-bold border border-rose-500/50 shadow-md shadow-rose-950/40'
                      : 'text-rose-400/60 hover:text-rose-300 hover:bg-[#182329] border border-transparent'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>Ordu Bilgisi</span>
                </button>

                {/* Tab 2: Detaylı Bilgi */}
                <button
                  id="tab-combat-details-btn"
                  type="button"
                  onClick={() => onTabChange('combatDetails')}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'combatDetails'
                      ? 'bg-rose-950/90 text-rose-300 font-bold border border-rose-500/50 shadow-md shadow-rose-950/40'
                      : 'text-rose-400/60 hover:text-rose-300 hover:bg-[#182329] border border-transparent'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>Detaylı Bilgi</span>
                </button>

                {/* Tab 3: Hasar */}
                <button
                  id="tab-combat-damage-btn"
                  type="button"
                  onClick={() => onTabChange('combatDamage')}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'combatDamage'
                      ? 'bg-rose-950/90 text-rose-300 font-bold border border-rose-500/50 shadow-md shadow-rose-950/40'
                      : 'text-rose-400/60 hover:text-rose-300 hover:bg-[#182329] border border-transparent'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>Hasar</span>
                </button>
              </div>
            )}

            {currentMode === 'management' && (
              /* Yönetim Modu Butonları (Altın/Amber Tema) */
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#141C21] border border-amber-500/30 shadow-inner overflow-x-auto">
                {/* Tab 1: Birlik Yönetimi */}
                <button
                  id="tab-mgmt-unit-btn"
                  type="button"
                  onClick={() => onTabChange('mgmtUnit')}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'mgmtUnit'
                      ? 'bg-amber-950/90 text-amber-300 font-bold border border-amber-500/50 shadow-md shadow-amber-950/40'
                      : 'text-amber-400/60 hover:text-amber-300 hover:bg-[#182329] border border-transparent'
                  }`}
                >
                  <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Birlik Yönetimi</span>
                </button>

                {/* Tab 2: Görev & Emirler */}
                <button
                  id="tab-mgmt-orders-btn"
                  type="button"
                  onClick={() => onTabChange('mgmtOrders')}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'mgmtOrders'
                      ? 'bg-amber-950/90 text-amber-300 font-bold border border-amber-500/50 shadow-md shadow-amber-950/40'
                      : 'text-amber-400/60 hover:text-amber-300 hover:bg-[#182329] border border-transparent'
                  }`}
                >
                  <ScrollText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Görev & Emirler</span>
                </button>

                {/* Tab 3: Kasa & Lojistik */}
                <button
                  id="tab-mgmt-treasury-btn"
                  type="button"
                  onClick={() => onTabChange('mgmtTreasury')}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'mgmtTreasury'
                      ? 'bg-amber-950/90 text-amber-300 font-bold border border-amber-500/50 shadow-md shadow-amber-950/40'
                      : 'text-amber-400/60 hover:text-amber-300 hover:bg-[#182329] border border-transparent'
                  }`}
                >
                  <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Kasa & Lojistik</span>
                </button>

                {/* Tab 4: İttifak & Diplomasi */}
                <button
                  id="tab-mgmt-diplomacy-btn"
                  type="button"
                  onClick={() => onTabChange('mgmtDiplomacy')}
                  className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'mgmtDiplomacy'
                      ? 'bg-amber-950/90 text-amber-300 font-bold border border-amber-500/50 shadow-md shadow-amber-950/40'
                      : 'text-amber-400/60 hover:text-amber-300 hover:bg-[#182329] border border-transparent'
                  }`}
                >
                  <Handshake className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>İttifak & Diplomasi</span>
                </button>
              </div>
            )}

          </div>

        </div>
      </div>
    </header>
  );
};
