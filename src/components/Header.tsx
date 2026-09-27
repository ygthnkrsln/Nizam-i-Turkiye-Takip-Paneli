import React, { useState, useRef, useEffect } from 'react';
import { MilitaryUnitData, PRESET_MILITARY_UNITS } from '../types';
import { 
  Sun, 
  Moon, 
  RefreshCw, 
  Shield, 
  ChevronDown,
  Check,
  Building2
} from 'lucide-react';

interface HeaderProps {
  muData: MilitaryUnitData | null;
  currentMuId: string;
  onMuIdChange: (newId: string) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isLoading: boolean;
  onRefresh: () => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  lastUpdated: number | null;
  isLiveDonations: boolean;
  hasApiToken: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  muData,
  currentMuId,
  onMuIdChange,
  isDarkMode,
  onToggleDarkMode,
  isLoading,
  onRefresh,
  autoRefresh,
  onToggleAutoRefresh,
  lastUpdated,
  isLiveDonations,
  hasApiToken,
}) => {
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

  const activePreset = PRESET_MILITARY_UNITS.find((m) => m.id === currentMuId);
  const currentDisplayName = muData?.name || activePreset?.name || 'Turkic Tribe';
  const currentAvatarUrl = muData?.avatarUrl || activePreset?.avatarUrl;

  const handleSelectMu = (id: string) => {
    if (id !== currentMuId) {
      onMuIdChange(id);
    }
    setIsDropdownOpen(false);
  };

  return (
    <header id="main-header" className="border-b border-slate-200 dark:border-[#232b35] bg-white dark:bg-[#14191f] sticky top-0 z-30 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Left: Brand Emblem & Army Switcher Dropdown */}
          <div className="flex items-center gap-3 w-full sm:w-auto" ref={dropdownRef}>
            {/* App Brand Emblem (Flaming Crescent Globe) */}
            <div className="flex items-center gap-2.5 shrink-0">
              <img
                src="/favicon.svg"
                alt="War Era Donation Tracker"
                className="w-9 h-9 rounded-full object-contain shrink-0 drop-shadow-md hover:scale-105 transition-transform"
              />
              <div className="hidden md:block text-left">
                <div className="text-xs font-black tracking-wider uppercase text-slate-900 dark:text-slate-100 font-mono leading-tight">
                  War Era
                </div>
                <div className="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold tracking-tight">
                  Donation Tracker
                </div>
              </div>
            </div>

            <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-[#27323e] mx-0.5 shrink-0" />

            {/* Active Army Avatar */}
            {currentAvatarUrl ? (
              <img
                src={currentAvatarUrl}
                alt={currentDisplayName}
                className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-[#27323e] shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-[#12161b] border border-slate-200 dark:border-[#27323e] flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
                <Shield className="w-5 h-5" />
              </div>
            )}

            {/* Army Switcher Dropdown Button */}
            <div className="relative">
              <button
                id="mu-dropdown-trigger"
                type="button"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27323e] bg-slate-50 hover:bg-slate-100 dark:bg-[#161c23] dark:hover:bg-[#1d252f] transition-colors text-left group"
                title="Başka bir ordu seçin"
              >
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500 tracking-wider">
                    Askeri Birlik (Ordu)
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                    <span>{currentDisplayName}</span>
                  </div>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-transform duration-200 ml-1 ${
                    isDropdownOpen ? 'rotate-180 text-cyan-500 dark:text-cyan-400' : ''
                  }`}
                />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div
                  id="mu-dropdown-menu"
                  className="absolute left-0 mt-2 w-72 bg-white dark:bg-[#161c23] rounded-xl border border-slate-200 dark:border-[#27323e] p-2 z-50"
                >
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-[#232b35] mb-1 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-cyan-500" />
                      Ordular Listesi
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {PRESET_MILITARY_UNITS.length} Birlik
                    </span>
                  </div>

                  <div className="space-y-1">
                    {PRESET_MILITARY_UNITS.map((unit) => {
                      const isSelected = unit.id === currentMuId;
                      return (
                        <button
                          key={unit.id}
                          id={`select-mu-${unit.name.toLowerCase().replace(/\s+/g, '-')}`}
                          type="button"
                          onClick={() => handleSelectMu(unit.id)}
                          className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors ${
                            isSelected
                              ? 'bg-cyan-50 dark:bg-[#11151a] text-cyan-900 dark:text-cyan-300 border border-cyan-400/40 dark:border-cyan-600/40'
                              : 'hover:bg-slate-100 dark:hover:bg-[#1d252f] text-slate-800 dark:text-slate-200 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={unit.avatarUrl}
                              alt={unit.name}
                              className="w-8 h-8 rounded-md object-cover border border-slate-200 dark:border-[#27323e] shrink-0"
                              referrerPolicy="no-referrer"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">
                                {unit.name}
                              </div>
                              {unit.isDefault && (
                                <span className="text-[9.5px] text-slate-400 dark:text-slate-500">
                                  Varsayılan Birlik
                                </span>
                              )}
                            </div>
                          </div>

                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center shrink-0">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Controls & Actions (Clean: Refresh, Real-time status, Dark Mode) */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            {/* Real-time Status Toggle */}
            <button
              id="toggle-autorefresh-btn"
              onClick={onToggleAutoRefresh}
              title={autoRefresh ? 'Otomatik yenilemeyi durdur (30s)' : 'Otomatik yenilemeyi başlat'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                autoRefresh
                  ? 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800/60'
                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-[#161c23] dark:text-slate-400 dark:border-[#27323e]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-cyan-500' : 'bg-slate-400'}`} />
              <span>{autoRefresh ? 'Canlı Senkron' : 'Senkron Durdu'}</span>
            </button>

            {/* Manual Refresh Button */}
            <button
              id="manual-refresh-btn"
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-[#161c23] dark:hover:bg-[#1d252f] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#27323e] transition-colors disabled:opacity-50"
              title="Verileri yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-500' : ''}`} />
              <span className="hidden sm:inline">Yenile</span>
            </button>

            {/* Dark / Light Mode Toggle */}
            <button
              id="theme-toggle-btn"
              onClick={onToggleDarkMode}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#161c23] dark:hover:bg-[#1d252f] text-slate-600 dark:text-slate-300 border border-transparent dark:border-[#27323e] transition-colors"
              title={isDarkMode ? 'Açık Mod' : 'Koyu Mod'}
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-cyan-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
