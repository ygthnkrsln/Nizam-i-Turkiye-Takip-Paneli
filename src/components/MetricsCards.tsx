import React, { useState, useRef, useEffect } from 'react';
import { Shield, ChevronDown, Check, Building2, ShieldCheck, Cpu } from 'lucide-react';
import { MilitaryUnitData, PRESET_MILITARY_UNITS } from '../types';

interface MetricsCardsProps {
  totalMembers: number;
  activePlayers: number;
  totalActiveFactories: number;
  totalAllFactories: number;
  totalActiveEnginePower: number;
  muData: MilitaryUnitData | null;
  currentMuId: string;
  onMuIdChange: (newId: string) => void;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({
  totalMembers,
  activePlayers,
  totalActiveFactories,
  totalAllFactories,
  totalActiveEnginePower,
  muData,
  currentMuId,
  onMuIdChange,
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

  const activeRate = totalMembers > 0 ? Math.round((activePlayers / totalMembers) * 100) : 0;

  return (
    <div id="metrics-summary-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 items-stretch">
      {/* 1. Askeri Birlik (Ordu) Seçimi */}
      <div
        id="card-mu-selector"
        ref={dropdownRef}
        className="bg-gradient-to-b from-[#1C2830] to-[#162127] border border-emerald-500/25 hover:border-emerald-500/50 rounded-xl p-5 transition-all duration-300 flex flex-col justify-between h-full relative shadow-lg shadow-black/25 group"
      >
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-[#BBE1FA]/80 uppercase tracking-widest font-mono">
              Askeri Birlik (Ordu)
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950/40 text-emerald-400 flex items-center justify-center border border-emerald-500/30 group-hover:border-emerald-500/60 transition-colors">
              <Shield className="w-4 h-4" />
            </div>
          </div>

          {/* Interactive Trigger Button */}
          <button
            id="mu-dropdown-trigger"
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="w-full flex items-center justify-between p-2.5 rounded-lg border border-emerald-500/30 hover:border-emerald-500/60 bg-[#141C21]/80 hover:bg-[#141C21] transition-all text-left cursor-pointer shadow-inner"
            title="Başka bir ordu seçin"
          >
            <div className="flex items-center gap-3 min-w-0">
              {currentAvatarUrl ? (
                <img
                  src={currentAvatarUrl}
                  alt={currentDisplayName}
                  className="w-9 h-9 rounded-lg object-cover border border-emerald-500/40 shrink-0 shadow-sm"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-emerald-950/50 flex items-center justify-center text-emerald-400 shrink-0 border border-emerald-500/40">
                  <Shield className="w-4 h-4" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate group-hover:text-emerald-300 transition-colors">
                  {currentDisplayName}
                </div>
                <div className="text-[11px] text-[#BBE1FA]/60 font-mono flex items-center gap-1.5 mt-0.5">
                  <span>{totalMembers} Asker</span>
                  {muData?.level && (
                    <>
                      <span>•</span>
                      <span>Lv. {muData.level}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <ChevronDown
              className={`w-4 h-4 text-emerald-400 transition-transform duration-200 shrink-0 ml-2 ${
                isDropdownOpen ? 'rotate-180 text-white' : ''
              }`}
            />
          </button>
        </div>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div
            id="mu-dropdown-menu"
            className="absolute left-0 right-0 top-full mt-2 bg-[#182329] rounded-xl border border-emerald-500/50 p-2 shadow-2xl z-50 max-h-72 overflow-y-auto backdrop-blur-xl"
          >
            <div className="px-3 py-1.5 border-b border-emerald-500/20 mb-1 flex items-center justify-between">
              <span className="text-[11px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                Kayıtlı Ordular
              </span>
              <span className="text-[10px] text-[#BBE1FA]/70 font-mono">
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
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-950/70 text-white border border-emerald-500/60 shadow-sm'
                        : 'hover:bg-[#141C21] text-[#BBE1FA] hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={unit.avatarUrl}
                        alt={unit.name}
                        className="w-7 h-7 rounded-md object-cover border border-emerald-500/30 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">
                          {unit.name}
                        </div>
                        {unit.isDefault && (
                          <span className="text-[9px] text-[#BBE1FA]/60 font-mono">
                            Varsayılan Birlik
                          </span>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <div className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. Aktif Asker */}
      <div
        id="metric-active-soldiers"
        className="bg-gradient-to-b from-[#1C2830] to-[#162127] border border-emerald-500/25 hover:border-emerald-500/50 rounded-xl p-5 transition-all duration-300 flex flex-col justify-between h-full shadow-lg shadow-black/25 group"
      >
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-[#BBE1FA]/80 uppercase tracking-widest font-mono">
              Aktif Asker
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950/40 text-emerald-400 flex items-center justify-center border border-emerald-500/30 group-hover:border-emerald-500/60 transition-colors">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <div className="text-3xl font-extrabold text-white font-mono tracking-tight">
              {activePlayers}
            </div>
            <span className="text-xs text-[#BBE1FA]/70 font-mono">
              / {totalMembers} asker ({activeRate}%)
            </span>
          </div>
        </div>

        <div>
          <div className="w-full bg-[#141C21] rounded-full h-2 mt-3 overflow-hidden border border-emerald-500/20">
            <div
              className="bg-gradient-to-r from-emerald-700 via-emerald-500 to-emerald-300 h-2 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
              style={{ width: `${Math.min(100, activeRate)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. Aktif Fabrika */}
      <div
        id="metric-active-factories"
        className="bg-gradient-to-b from-[#1C2830] to-[#162127] border border-emerald-500/25 hover:border-emerald-500/50 rounded-xl p-5 transition-all duration-300 flex flex-col justify-between h-full shadow-lg shadow-black/25 group"
      >
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-[#BBE1FA]/80 uppercase tracking-widest font-mono">
              Aktif Fabrika
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950/40 text-emerald-400 flex items-center justify-center border border-emerald-500/30 group-hover:border-emerald-500/60 transition-colors">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <div className="text-3xl font-extrabold text-white font-mono tracking-tight">
              {totalActiveFactories}
            </div>
            <span className="text-xs text-[#BBE1FA]/70 font-mono">
              ({totalAllFactories} Toplam)
            </span>
          </div>
        </div>

        <div className="text-[11px] text-[#BBE1FA]/60 font-mono mt-3">
          Oyuncuların beceri limitlerine göre aktif olan fabrikalar
        </div>
      </div>

      {/* 4. Aktif Motor Gücü */}
      <div
        id="metric-active-engine-power"
        className="bg-gradient-to-b from-[#1C2830] to-[#162127] border border-emerald-500/25 hover:border-emerald-500/50 rounded-xl p-5 transition-all duration-300 flex flex-col justify-between h-full shadow-lg shadow-black/25 group"
      >
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-[#BBE1FA]/80 uppercase tracking-widest font-mono">
              Aktif Motor Gücü
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950/40 text-amber-300 flex items-center justify-center border border-emerald-500/30 group-hover:border-emerald-500/60 transition-colors">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <div className="text-3xl font-extrabold text-white font-mono tracking-tight">
              {totalActiveEnginePower}
            </div>
            <span className="text-xs font-bold text-amber-300 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30 uppercase font-mono tracking-wider">
              Lv
            </span>
          </div>
        </div>

        <div className="text-[11px] text-[#BBE1FA]/60 font-mono mt-3">
          Aktif fabrikaların toplam otomasyon motor seviyesi
        </div>
      </div>
    </div>
  );
};
