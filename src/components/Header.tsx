import React from 'react';
import { 
  HeartHandshake, 
  Building2, 
  BarChart3, 
  Swords, 
  TrendingUp, 
  Shield, 
  Crosshair, 
  Flame 
} from 'lucide-react';
import { ActiveTab, AppMode } from '../App';

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
    <header id="main-header" className="border-b border-[#3282B8]/20 bg-[#1B262C]/90 backdrop-blur-md sticky top-0 z-30 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Left: Mode Switcher (Ekonomi Modu / Savaş Modu) */}
          <div className="inline-flex items-center rounded-xl bg-[#141C21] p-1 border border-[#3282B8]/25 shadow-inner">
            {/* Ekonomi Modu Butonu */}
            <button
              id="mode-economy-btn"
              type="button"
              onClick={() => onModeChange('economy')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                currentMode === 'economy'
                  ? 'bg-emerald-950/90 text-emerald-300 font-bold border border-emerald-500/50 shadow-sm'
                  : 'text-emerald-400/60 hover:text-emerald-300 hover:bg-[#182329] border border-transparent'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ekonomi Modu</span>
            </button>

            {/* Savaş Modu Butonu */}
            <button
              id="mode-combat-btn"
              type="button"
              onClick={() => onModeChange('combat')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                currentMode === 'combat'
                  ? 'bg-rose-950/90 text-rose-300 font-bold border border-rose-500/50 shadow-sm'
                  : 'text-rose-400/60 hover:text-rose-300 hover:bg-[#182329] border border-transparent'
              }`}
            >
              <Swords className="w-3.5 h-3.5 text-rose-400" />
              <span>Savaş Modu</span>
            </button>
          </div>

          {/* Right: Tab Navigation Switcher - Dynamic based on active mode */}
          {currentMode === 'economy' ? (
            /* Ekonomi Modu Butonları (Yeşil Tema) */
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#141C21] border border-emerald-500/25 shadow-inner w-full sm:w-auto overflow-x-auto">
              {/* Tab 1: Bağış Takip Paneli */}
              <button
                id="tab-donations-btn"
                type="button"
                onClick={() => onTabChange('donations')}
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
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
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
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
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'countryStats'
                    ? 'bg-emerald-950/90 text-emerald-300 font-bold border border-emerald-500/50 shadow-md shadow-emerald-950/40'
                    : 'text-emerald-400/60 hover:text-emerald-300 hover:bg-[#182329] border border-transparent'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Ülke İstatistikleri</span>
              </button>
            </div>
          ) : (
            /* Savaş Modu Butonları (Kırmızı/Rose Tema) */
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#141C21] border border-rose-500/25 shadow-inner w-full sm:w-auto overflow-x-auto">
              {/* Tab 1: Ordu Bilgisi */}
              <button
                id="tab-combat-armyinfo-btn"
                type="button"
                onClick={() => onTabChange('combatArmyInfo')}
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
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
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
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
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
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
        </div>
      </div>
    </header>
  );
};
