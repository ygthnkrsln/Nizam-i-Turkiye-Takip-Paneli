import React from 'react';
import {
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Crosshair,
  Flame,
  HeartHandshake,
  Menu,
  Shield,
  X,
} from 'lucide-react';
import { ActiveTab } from '../App';
import { NizamTurkiyeLogo } from './NizamTurkiyeLogo';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  open: boolean;
  onToggle: () => void;
}

const groups: {
  label: string;
  theme: 'emerald' | 'rose' | 'amber';
  tabs: { id: ActiveTab; title: string; icon: React.ElementType }[];
}[] = [
  {
    label: 'Ekonomi',
    theme: 'emerald',
    tabs: [
      { id: 'donations', title: 'Bağış Takip Paneli', icon: HeartHandshake },
      { id: 'armyStats', title: 'Ordu İstatistikleri', icon: Building2 },
      { id: 'countryStats', title: 'Ülke İstatistikleri', icon: BarChart3 },
    ],
  },
  {
    label: 'Savaş',
    theme: 'rose',
    tabs: [
      { id: 'combatArmyInfo', title: 'Ordu Bilgisi', icon: Shield },
      { id: 'combatDetails', title: 'Detaylı Bilgi', icon: Crosshair },
      { id: 'combatDamage', title: 'Hasar', icon: Flame },
    ],
  },
  {
    label: 'Yönetim',
    theme: 'amber',
    tabs: [
      { id: 'mgmtArmies', title: 'Ordu Takibi', icon: Shield },
      { id: 'mgmtDonations', title: 'Bağış Takibi', icon: Coins },
    ],
  },
];

const colors = {
  emerald: {
    label: 'text-emerald-300', dot: 'bg-emerald-400',
    active: 'border-emerald-500/50 bg-[#1B2B34] text-white',
    hover: 'hover:bg-emerald-950/30',
  },
  rose: {
    label: 'text-rose-300', dot: 'bg-rose-400',
    active: 'border-rose-500/50 bg-[#1B2B34] text-white',
    hover: 'hover:bg-rose-950/30',
  },
  amber: {
    label: 'text-amber-300', dot: 'bg-amber-400',
    active: 'border-amber-500/50 bg-[#1B2B34] text-white',
    hover: 'hover:bg-amber-950/30',
  },
};

export const Header: React.FC<HeaderProps> = ({ activeTab, onTabChange, open, onToggle }) => (
  <>
    {open && (
      <button
        type="button"
        aria-label="Menüyü kapat"
        onClick={onToggle}
        className="fixed inset-0 z-30 bg-black/60 md:hidden"
      />
    )}
    {!open && (
      <button
        type="button"
        aria-label="Menüyü aç"
        onClick={onToggle}
        className="fixed left-3 top-3 z-20 rounded-lg border border-[#3282B8]/30 bg-[#162026] p-2.5 text-[#BBE1FA] shadow-lg md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
    )}

    <aside
      id="main-sidebar"
      className={`fixed inset-y-0 left-0 z-40 flex h-screen flex-col border-r border-[#3282B8]/20 bg-[#162026] shadow-2xl transition-[width,transform] duration-200 md:sticky md:top-0 md:translate-x-0 ${
        open ? 'w-64 translate-x-0' : 'w-64 -translate-x-full md:w-[72px] md:translate-x-0'
      }`}
    >
      <div className={`flex h-[76px] shrink-0 items-center border-b border-[#3282B8]/15 ${open ? 'justify-between px-4' : 'justify-between px-2'}`}>
        <button
          type="button"
          onClick={() => onTabChange('donations')}
          className={`flex min-w-0 items-center gap-2.5 text-left ${open ? '' : 'mr-auto'}`}
          title="Nizam-ı Türkiye ana sayfa"
        >
          <NizamTurkiyeLogo className="h-10 w-10 shrink-0 drop-shadow-[0_2px_10px_rgba(223,178,83,0.35)]" />
          {open && (
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-black tracking-wide bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 bg-clip-text text-transparent font-serif uppercase">NİZAM-I TÜRKİYE</span>
              <span className="text-[11px] font-bold text-[#BBE1FA] font-mono">Takip Paneli</span>
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? 'Menüyü daralt' : 'Menüyü genişlet'}
          title={open ? 'Menüyü daralt' : 'Menüyü genişlet'}
          className="hidden rounded-lg p-1.5 text-[#BBE1FA]/70 hover:bg-[#1B2B34] hover:text-white md:inline-flex"
        >
          {open ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <button type="button" onClick={onToggle} aria-label="Menüyü kapat" className="rounded-lg p-1.5 text-[#BBE1FA]/70 hover:bg-[#1B2B34] md:hidden">
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav aria-label="Paneller" className="flex-1 space-y-5 overflow-y-auto px-2 py-5">
        {groups.map((group) => {
          const color = colors[group.theme];
          return (
            <section key={group.label} aria-label={group.label}>
              {open ? (
                <h2 className={`mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] ${color.label}`}>
                  <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${color.dot}`} />
                  {group.label}
                </h2>
              ) : (
                <div className={`mx-auto mb-2 h-px w-8 ${color.dot}`} aria-hidden="true" />
              )}
              <div className="space-y-1">
                {group.tabs.map(({ id, title, icon: Icon }) => {
                  const selected = activeTab === id;
                  return (
                    <button
                      key={id}
                      id={`tab-${id}-btn`}
                      type="button"
                      aria-current={selected ? 'page' : undefined}
                      aria-label={title}
                      title={open ? undefined : title}
                      onClick={() => {
                        onTabChange(id);
                        if (window.innerWidth < 768) onToggle();
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
                        selected
                          ? color.active
                          : `border-transparent text-[#BBE1FA]/75 ${color.hover} hover:text-white`
                      } ${open ? '' : 'justify-center px-0'}`}
                    >
                      <Icon className={`h-[17px] w-[17px] shrink-0 ${selected ? color.label : 'text-[#BBE1FA]/60'}`} />
                      {open && <span className="truncate">{title}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>
    </aside>
  </>
);
