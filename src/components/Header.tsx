import React from 'react';
import {
  BarChart3,
  Building2,
  Coins,
  Crosshair,
  Flame,
  HeartHandshake,
  Shield,
} from 'lucide-react';
import { ActiveTab } from '../App';
import { NizamTurkiyeLogo } from './NizamTurkiyeLogo';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

const groups: {
  label: string;
  theme: 'emerald' | 'rose' | 'amber';
  tabs: { id: ActiveTab; title: string; icon: React.ElementType }[];
}[] = [
  {
    label: 'EKONOMİ',
    theme: 'emerald',
    tabs: [
      { id: 'donations', title: 'Bağış Takip Paneli', icon: HeartHandshake },
      { id: 'armyStats', title: 'Ordu İstatistikleri', icon: Building2 },
      { id: 'countryStats', title: 'Ülke İstatistikleri', icon: BarChart3 },
    ],
  },
  {
    label: 'SAVAŞ',
    theme: 'rose',
    tabs: [
      { id: 'combatArmyInfo', title: 'Ordu Bilgisi', icon: Shield },
      { id: 'combatDetails', title: 'Detaylı Bilgi', icon: Crosshair },
      { id: 'combatDamage', title: 'Hasar', icon: Flame },
    ],
  },
  {
    label: 'YÖNETİM',
    theme: 'amber',
    tabs: [
      { id: 'mgmtArmies', title: 'Ordu Takibi', icon: Shield },
      { id: 'mgmtDonations', title: 'Bağış Takibi', icon: Coins },
    ],
  },
];

const colors = {
  emerald: {
    group: 'border-emerald-500/30', label: 'text-emerald-400/70',
    active: 'bg-emerald-950/90 text-emerald-200 border-emerald-500/50',
    idle: 'text-emerald-300/70 hover:text-emerald-100 hover:bg-emerald-950/40',
    icon: 'text-emerald-400',
  },
  rose: {
    group: 'border-rose-500/30', label: 'text-rose-400/70',
    active: 'bg-rose-950/90 text-rose-200 border-rose-500/50',
    idle: 'text-rose-300/70 hover:text-rose-100 hover:bg-rose-950/40',
    icon: 'text-rose-400',
  },
  amber: {
    group: 'border-amber-500/30', label: 'text-amber-400/70',
    active: 'bg-amber-950/90 text-amber-200 border-amber-500/50',
    idle: 'text-amber-300/70 hover:text-amber-100 hover:bg-amber-950/40',
    icon: 'text-amber-400',
  },
};

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange }) => (
  <header id="main-header" className="border-b border-[#3282B8]/20 bg-[#162026]/95 backdrop-blur-md sticky top-0 z-30 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => onTabChange('donations')}
        className="flex items-center gap-2.5 text-left shrink-0 group"
        title="Nizam-ı Türkiye Takip Paneli Ana Sayfa"
      >
        <NizamTurkiyeLogo className="w-10 h-10 sm:w-11 sm:h-11 drop-shadow-[0_2px_10px_rgba(223,178,83,0.35)]" />
        <span className="flex flex-col">
          <span className="text-sm sm:text-base font-black tracking-wider bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 bg-clip-text text-transparent font-serif uppercase">NİZAM-I TÜRKİYE</span>
          <span className="text-[11px] font-bold text-[#BBE1FA] font-mono tracking-tight -mt-0.5">Takip Paneli</span>
        </span>
      </button>

      <nav aria-label="Paneller" className="w-full xl:w-auto flex gap-2 overflow-x-auto pb-1 xl:pb-0">
        {groups.map((group) => {
          const color = colors[group.theme];
          return (
            <div key={group.label} className={`shrink-0 rounded-xl border bg-[#141C21] p-1 shadow-inner ${color.group}`}>
              <div className={`px-2 pt-0.5 pb-1 text-[9px] font-bold tracking-[0.18em] ${color.label}`}>{group.label}</div>
              <div className="flex items-center gap-1">
                {group.tabs.map(({ id, title, icon: Icon }) => {
                  const selected = activeTab === id;
                  return (
                    <button
                      key={id}
                      id={`tab-${id}-btn`}
                      type="button"
                      aria-current={selected ? 'page' : undefined}
                      onClick={() => onTabChange(id)}
                      className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-mono font-semibold transition-colors whitespace-nowrap border ${selected ? `${color.active} shadow-sm` : `${color.idle} border-transparent`}`}
                    >
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${color.icon}`} />
                      <span>{title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  </header>
);
