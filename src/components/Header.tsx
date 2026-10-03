import React from 'react';
import { HeartHandshake, Building2, BarChart3 } from 'lucide-react';

interface HeaderProps {
  activeTab: 'donations' | 'armyStats' | 'countryStats';
  onTabChange: (tab: 'donations' | 'armyStats' | 'countryStats') => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange }) => {
  return (
    <header id="main-header" className="border-b border-[#3282B8]/20 bg-[#1B262C]/90 backdrop-blur-md sticky top-0 z-30 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          {/* Left: Brand Emblem & Title */}
          <div 
            onClick={() => onTabChange('donations')}
            className="flex items-center gap-3 cursor-pointer group select-none"
            title="Ana Sayfa (Bağış Takip Paneli)"
          >
            <div className="relative group shrink-0">
              <div className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-[#0F4C75] via-[#3282B8] to-[#BBE1FA] opacity-50 blur-[2px] group-hover:opacity-80 transition duration-300" />
              <img
                src="/favicon.svg"
                alt="War Era Donation Tracker"
                className="relative w-8 h-8 rounded-full object-contain shrink-0 bg-[#1B262C] border border-[#3282B8]/40"
              />
            </div>

            <div className="text-left">
              <div className="text-xs font-black tracking-widest uppercase text-white font-mono leading-tight">
                War Era
              </div>
              <div className="text-[10px] text-[#BBE1FA] font-medium tracking-tight">
                Donation Tracker
              </div>
            </div>
          </div>

          {/* Right: Tab Navigation Switcher (Bağış Takip, Ordu İstatistikleri, Ülke İstatistikleri) */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#141C21] border border-[#3282B8]/25 shadow-inner w-full sm:w-auto overflow-x-auto">
            {/* Tab 1: Bağış Takip Paneli */}
            <button
              id="tab-donations-btn"
              type="button"
              onClick={() => onTabChange('donations')}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'donations'
                  ? 'bg-gradient-to-r from-[#0F4C75] to-[#3282B8]/80 text-white shadow-md border border-[#3282B8]/60'
                  : 'text-[#BBE1FA]/70 hover:text-white hover:bg-[#182329] border border-transparent'
              }`}
            >
              <HeartHandshake className="w-3.5 h-3.5 text-[#3282B8] shrink-0" />
              <span>Bağış Takip Paneli</span>
            </button>

            {/* Tab 2: Ordu İstatistikleri */}
            <button
              id="tab-armystats-btn"
              type="button"
              onClick={() => onTabChange('armyStats')}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'armyStats'
                  ? 'bg-gradient-to-r from-[#0F4C75] to-[#3282B8]/80 text-white shadow-md border border-[#3282B8]/60'
                  : 'text-[#BBE1FA]/70 hover:text-white hover:bg-[#182329] border border-transparent'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-[#3282B8] shrink-0" />
              <span>Ordu İstatistikleri</span>
            </button>

            {/* Tab 3: Ülke İstatistikleri */}
            <button
              id="tab-countrystats-btn"
              type="button"
              onClick={() => onTabChange('countryStats')}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'countryStats'
                  ? 'bg-gradient-to-r from-[#0F4C75] to-[#3282B8]/80 text-white shadow-md border border-[#3282B8]/60'
                  : 'text-[#BBE1FA]/70 hover:text-white hover:bg-[#182329] border border-transparent'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#3282B8] shrink-0" />
              <span>Ülke İstatistikleri</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
