import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LevelStatItem, CountryStatsResponse } from '../types';
import { fetchCountryStats } from '../services/wareraApi';
import { 
  Users, 
  Building2, 
  Cpu, 
  Shield, 
  BarChart3,
  Coins,
  RefreshCw,
  FileDown,
  Swords,
  TrendingUp
} from 'lucide-react';
import { exportCountryStatsToPDF } from '../utils/exportCountryPdf';

const PRESET_ARMIES = [
  { id: '69c229c4449287ea1a26a5b3', name: 'Turkic Tribe', memberCount: 21, avatarUrl: 'https://media.warera.io/avatars/mu/mu-69c229c4449287ea1a26a5b3-1787680897144-8qglepbh.png' },
  { id: '689f69064e095b8b9f1b885a', name: 'ASHINA', memberCount: 13, avatarUrl: 'https://media.warera.io/avatars/mu/mu-689f69064e095b8b9f1b885a-1781036697919-z15zttgr.png' },
  { id: '68bc9bcb4870c8e343e42855', name: 'ASHINA Reserve', memberCount: 16, avatarUrl: 'https://media.warera.io/avatars/mu/mu-68bc9bcb4870c8e343e42855-1788975231586-trvgqowg.png' },
  { id: '690088ce4864a132a2d92d07', name: 'Legio Panthera', memberCount: 25, avatarUrl: 'https://media.warera.io/avatars/mu/mu-690088ce4864a132a2d92d07-1789328739738-1v6foes6.png' },
  { id: '6902269a560184d196a6fba8', name: 'BEASTs', memberCount: 25, avatarUrl: 'https://media.warera.io/avatars/mu/mu-6902269a560184d196a6fba8-1787571170299-iczr3flz.jpg' },
  { id: '6a0f1495478fe2a58d2868d6', name: 'Deliler', memberCount: 24, avatarUrl: 'https://media.warera.io/avatars/mu/mu-6a0f1495478fe2a58d2868d6-1779887796291-bfgxnrms.png' },
];

let sessionCountryStatsCache: CountryStatsResponse | null = null;

interface ChartProps {
  data: LevelStatItem[];
  valueKey: 'playerCount' | 'avgFactories' | 'avgAutomatedLevel' | 'avgWealth';
  color: string;
  gradientId: string;
  unit: string;
  isLoading: boolean;
}

const InteractiveLineChart: React.FC<ChartProps> = ({
  data,
  valueKey,
  color,
  gradientId,
  unit,
  isLoading,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const svgWidth = 800;
  const svgHeight = 260;
  const padding = { top: 25, right: 30, bottom: 35, left: 55 };
  const innerWidth = svgWidth - padding.left - padding.right;
  const innerHeight = svgHeight - padding.top - padding.bottom;

  const hasData = !isLoading && data && data.length > 0;

  const values = hasData ? data.map((d) => Number(d[valueKey] || 0)) : [0, 10];
  const minVal = hasData ? Math.min(...values) : 0;
  const maxVal = hasData ? Math.max(...values) : 10;
  const yRange = maxVal - minVal || 1;
  const yMargin = yRange * 0.1;
  const domainMin = Math.max(0, minVal - yMargin);
  const domainMax = maxVal + yMargin;

  const points = hasData
    ? data.map((d, i) => {
        const x = padding.left + (i / (data.length - 1 || 1)) * innerWidth;
        const yVal = Number(d[valueKey] || 0);
        const y = padding.top + innerHeight - ((yVal - domainMin) / (domainMax - domainMin || 1)) * innerHeight;
        return { x, y, data: d };
      })
    : [];

  const linePath = points.reduce((acc, curr, idx) => {
    return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
  }, '');

  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`
    : '';

  const yTicks = [0, 0.33, 0.66, 1].map((ratio) => {
    const val = domainMin + (domainMax - domainMin) * ratio;
    const y = padding.top + innerHeight - ratio * innerHeight;
    let label = '-';
    if (hasData) {
      if (val >= 1000000) {
        label = `${(val / 1000000).toFixed(1)}M`;
      } else if (val >= 1000) {
        label = `${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k`;
      } else if (val < 10) {
        label = val.toFixed(1);
      } else {
        label = Math.round(val).toString();
      }
    }
    return { y, label };
  });

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current || points.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const svgX = (mouseX / rect.width) * svgWidth;

    let closestIdx = 0;
    let minDiff = Infinity;
    points.forEach((p, idx) => {
      const diff = Math.abs(p.x - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    setHoverIndex(closestIdx);
  };

  const activePoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden select-none">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto cursor-crosshair block"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.40" />
            <stop offset="80%" stopColor={color} stopOpacity="0.05" />
            <stop offset="100%" stopColor={color} stopOpacity="0.00" />
          </linearGradient>
        </defs>

        {yTicks.map((t, idx) => (
          <g key={`y-grid-${idx}`}>
            <line
              x1={padding.left}
              y1={t.y}
              x2={padding.left + innerWidth}
              y2={t.y}
              stroke="#3282B8"
              strokeOpacity="0.12"
              strokeDasharray="3 3"
            />
            <text
              x={padding.left - 10}
              y={t.y + 4}
              textAnchor="end"
              className="text-[10px] font-mono fill-[#BBE1FA]/50"
            >
              {t.label}
            </text>
          </g>
        ))}

        {points.map((p, idx) => {
          if (idx % 4 !== 0 && idx !== points.length - 1) return null;
          return (
            <line
              key={`x-grid-${idx}`}
              x1={p.x}
              y1={padding.top}
              x2={p.x}
              y2={padding.top + innerHeight}
              stroke="#3282B8"
              strokeOpacity="0.08"
            />
          );
        })}

        {hasData && areaPath && (
          <path d={areaPath} fill={`url(#${gradientId})`} />
        )}

        {hasData && linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {points.map((p, idx) => (
          <circle
            key={`pt-${idx}`}
            cx={p.x}
            cy={p.y}
            r={hoverIndex === idx ? 6 : 3}
            fill={hoverIndex === idx ? '#FFFFFF' : color}
            stroke="#182329"
            strokeWidth="1.5"
            className="transition-all duration-150"
          />
        ))}

        {activePoint && (
          <line
            x1={activePoint.x}
            y1={padding.top}
            x2={activePoint.x}
            y2={padding.top + innerHeight}
            stroke="#BBE1FA"
            strokeOpacity="0.4"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
        )}

        {points.map((p, idx) => {
          if (idx % 4 !== 0 && idx !== points.length - 1) return null;
          return (
            <text
              key={`x-txt-${idx}`}
              x={p.x}
              y={padding.top + innerHeight + 18}
              textAnchor="middle"
              className="text-[10px] font-mono fill-[#BBE1FA]/60"
            >
              Lv.{p.data.level}
            </text>
          );
        })}
      </svg>

      {activePoint && (
        <div
          className="absolute z-20 pointer-events-none px-3 py-1.5 rounded-lg bg-[#141C21]/95 border border-[#3282B8]/40 shadow-xl backdrop-blur-md text-xs font-mono transform -translate-x-1/2 -translate-y-full"
          style={{
            left: `${(activePoint.x / svgWidth) * 100}%`,
            top: `${(activePoint.y / svgHeight) * 100 - 10}%`,
          }}
        >
          <div className="text-white font-bold">
            Seviye {activePoint.data.level}:{' '}
            <span style={{ color }}>
              {valueKey === 'avgWealth'
                ? `${Math.round(Number(activePoint.data.avgWealth || 0)).toLocaleString('tr-TR')} ${unit}`
                : `${Number(activePoint.data[valueKey]).toFixed(valueKey === 'playerCount' ? 0 : 2)} ${unit}`}
            </span>
          </div>
          <div className="text-[10px] text-[#BBE1FA]/60 mt-0.5">
            {activePoint.data.playerCount} oyuncu ({activePoint.data.percentage || 0}%)
          </div>
        </div>
      )}
    </div>
  );
};

export const CountryStatsPanel: React.FC = () => {
  const [data, setData] = useState<CountryStatsResponse | null>(() => {
    if (
      sessionCountryStatsCache &&
      sessionCountryStatsCache.levelStats?.[0]?.combatFactories !== undefined
    ) {
      return sessionCountryStatsCache;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(
    !sessionCountryStatsCache ||
    sessionCountryStatsCache.levelStats?.[0]?.combatFactories === undefined
  );
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'combat' | 'economy' | 'all'>('combat');

  const handleExportPdf = () => {
    if (!data) return;
    setIsExporting(true);
    try {
      exportCountryStatsToPDF(data, viewMode);
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const loadData = (force = false) => {
    if (force) setIsRefreshing(true);
    else setIsLoading(true);

    fetchCountryStats(force)
      .then((json) => {
        if (json && json.success) {
          sessionCountryStatsCache = json;
          setData(json);
        }
      })
      .catch((err) => {
        console.error('Error fetching country stats:', err);
      })
      .finally(() => {
        setIsLoading(false);
        setIsRefreshing(false);
      });
  };

  useEffect(() => {
    if (!sessionCountryStatsCache || sessionCountryStatsCache.levelStats?.[0]?.combatFactories === undefined) {
      loadData(false);
    }
  }, []);

  const stats = data?.levelStats || [];
  const armies = data?.armies || PRESET_ARMIES;
  const totalPlayers = data?.totalPlayers || 0;

  const totalCombat = data?.totalCombatPlayers ?? stats.reduce((sum, s) => sum + (s.combatCount || 0), 0);
  const totalEconomy = data?.totalEconomyPlayers ?? stats.reduce((sum, s) => sum + (s.economyCount || 0), 0);

  const activeStats = useMemo(() => {
    if (viewMode === 'all') {
      return stats;
    }
    const isCombat = viewMode === 'combat';
    const totalCount = isCombat ? (totalCombat || 1) : (totalEconomy || 1);

    return stats
      .filter((s) => (isCombat ? (s.combatCount || 0) > 0 : (s.economyCount || 0) > 0))
      .map((s) => {
        const count = isCombat ? (s.combatCount || 0) : (s.economyCount || 0);
        const factories = isCombat
          ? (s.combatFactories ?? Math.round(s.avgFactories * count))
          : (s.economyFactories ?? Math.round(s.avgFactories * count));
        const autoLevel = isCombat
          ? (s.combatAutomatedLevel ?? Math.round(s.avgAutomatedLevel * count))
          : (s.economyAutomatedLevel ?? Math.round(s.avgAutomatedLevel * count));
        const wealth = isCombat
          ? (s.combatWealth ?? Math.round((s.avgWealth || 0) * count))
          : (s.economyWealth ?? Math.round((s.avgWealth || 0) * count));

        return {
          ...s,
          playerCount: count,
          percentage: Number(((count / totalCount) * 100).toFixed(1)),
          totalFactories: factories,
          avgFactories: count > 0 ? Number((factories / count).toFixed(2)) : 0,
          totalAutomatedLevel: autoLevel,
          avgAutomatedLevel: count > 0 ? Number((autoLevel / count).toFixed(1)) : 0,
          totalWealth: wealth,
          avgWealth: count > 0 ? Math.round(wealth / count) : 0,
        };
      });
  }, [stats, viewMode, totalCombat, totalEconomy]);

  const activeSummary = useMemo(() => {
    if (!data || activeStats.length === 0) {
      return {
        totalPlayers: 0,
        percent: 0,
        totalFactories: 0,
        totalAutomated: 0,
        totalWealth: 0,
        totalLevel: 0,
        overallAvgFactories: '-',
        overallAvgEngine: '-',
        overallAvgWealth: '-',
        overallAvgLevel: '-',
        peakPlayerLevel: null,
        modeLabel: viewMode === 'combat' ? 'Savaş Modu' : viewMode === 'economy' ? 'Ekonomi Modu' : 'Tüm Oyuncular',
      };
    }

    const currentPlayers = viewMode === 'all'
      ? totalPlayers
      : viewMode === 'combat'
        ? totalCombat
        : totalEconomy;

    const totalLevel = activeStats.reduce((sum, s) => sum + (s.level * s.playerCount), 0);
    const totalFactories = activeStats.reduce((sum, s) => sum + s.totalFactories, 0);
    const totalAutomated = activeStats.reduce((sum, s) => sum + s.totalAutomatedLevel, 0);
    const totalWealth = activeStats.reduce((sum, s) => sum + (s.totalWealth || 0), 0);

    const overallAvgFactories = currentPlayers > 0 ? (totalFactories / currentPlayers).toFixed(2) : '-';
    const overallAvgEngine = currentPlayers > 0 ? (totalAutomated / currentPlayers).toFixed(1) : '-';
    const overallAvgWealth = currentPlayers > 0 ? Math.round(totalWealth / currentPlayers).toLocaleString('tr-TR') : '-';
    const overallAvgLevel = currentPlayers > 0 ? (totalLevel / currentPlayers).toFixed(1) : '-';
    const percent = totalPlayers > 0 ? Math.round((currentPlayers / totalPlayers) * 100) : 0;

    const peakPlayerLevel = [...activeStats].sort((a, b) => b.playerCount - a.playerCount)[0] || null;

    return {
      totalPlayers: currentPlayers,
      percent,
      totalLevel,
      totalFactories,
      totalAutomated,
      totalWealth,
      overallAvgFactories,
      overallAvgEngine,
      overallAvgWealth,
      overallAvgLevel,
      peakPlayerLevel,
      modeLabel: viewMode === 'combat' ? 'Savaş Modu' : viewMode === 'economy' ? 'Ekonomi Modu' : 'Tüm Oyuncular',
    };
  }, [data, activeStats, viewMode, totalPlayers, totalCombat, totalEconomy]);

  return (
    <div id="country-stats-panel" className="space-y-6">
      {/* 1. Ülke Orduları Bilgi Banner'ı */}
      <div className="bg-gradient-to-r from-[#182329]/95 via-[#1B262C]/95 to-[#182329]/95 border border-emerald-500/30 rounded-xl p-5 shadow-xl shadow-black/30 backdrop-blur-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#3282B8]" />
                Ülke İstatistikleri (6 Askeri Ordu Dağılımı)
              </h2>

              {/* Gece / Gündüz mantığıyla çalışan Savaş vs. Ekonomi Modu Geçiş Butonu */}
              <div className="flex items-center gap-2">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewMode(viewMode === 'combat' ? 'economy' : 'combat')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setViewMode(viewMode === 'combat' ? 'economy' : 'combat');
                    }
                  }}
                  className={`relative inline-flex items-center p-1 rounded-full border transition-all duration-300 cursor-pointer select-none ${
                    viewMode === 'combat'
                      ? 'bg-[#1F1215] border-rose-500/50 shadow-md shadow-rose-950/40'
                      : viewMode === 'economy'
                        ? 'bg-[#101F18] border-emerald-500/50 shadow-md shadow-emerald-950/40'
                        : 'bg-[#141C21] border-[#3282B8]/40'
                  }`}
                  title={`Tıkla: ${viewMode === 'combat' ? 'Ekonomi Moduna Geç' : 'Savaş Moduna Geç'}`}
                >
                  {/* Savaş Modu Butonu */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setViewMode('combat'); }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold transition-all duration-300 cursor-pointer ${
                      viewMode === 'combat'
                        ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-md shadow-rose-900/50 border border-rose-400/40'
                        : 'text-[#BBE1FA]/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Swords className={`w-3.5 h-3.5 ${viewMode === 'combat' ? 'text-white' : 'text-rose-400'}`} />
                    <span>Savaş Modu</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      viewMode === 'combat' ? 'bg-black/30 text-white' : 'bg-[#141C21] text-rose-400'
                    }`}>
                      {isLoading ? '-' : totalCombat}
                    </span>
                  </button>

                  {/* Ekonomi Modu Butonu */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setViewMode('economy'); }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold transition-all duration-300 cursor-pointer ${
                      viewMode === 'economy'
                        ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-md shadow-emerald-900/50 border border-emerald-400/40'
                        : 'text-[#BBE1FA]/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <TrendingUp className={`w-3.5 h-3.5 ${viewMode === 'economy' ? 'text-white' : 'text-emerald-400'}`} />
                    <span>Ekonomi Modu</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      viewMode === 'economy' ? 'bg-black/30 text-white' : 'bg-[#141C21] text-emerald-400'
                    }`}>
                      {isLoading ? '-' : totalEconomy}
                    </span>
                  </button>
                </div>

                {/* Tümü Seçeneği */}
                <button
                  type="button"
                  onClick={() => setViewMode(viewMode === 'all' ? 'combat' : 'all')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-mono transition cursor-pointer border ${
                    viewMode === 'all'
                      ? 'bg-[#0F4C75] text-white border-[#3282B8] shadow-md font-bold'
                      : 'bg-[#141C21]/80 text-[#BBE1FA]/60 border-[#3282B8]/20 hover:text-white hover:border-[#3282B8]/50'
                  }`}
                  title="Tüm ordu askerlerini (Savaş + Ekonomi) birlikte göster"
                >
                  Tümü ({isLoading ? '-' : totalPlayers})
                </button>
              </div>
            </div>

            <p className="text-xs text-[#BBE1FA]/70 max-w-2xl leading-relaxed">
              Askeri birlikteki 6 ordunun tüm askerleri taranarak seçili mod doğrultusunda seviye başına düşen oyuncu sayısı, ortalama fabrika kapasitesi, motor gücü ve toplam birikmiş servet dinamik olarak gösterilir.
            </p>
          </div>

          {/* Quick Metrics Badges (Önceki 4 temiz kart formatı) */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            {/* 1. Toplam Asker */}
            <div className={`px-3.5 py-2 rounded-lg bg-[#141C21] border text-right font-mono min-w-[110px] transition-colors ${
              viewMode === 'combat' ? 'border-rose-500/35' : viewMode === 'economy' ? 'border-emerald-500/35' : 'border-[#3282B8]/25'
            }`}>
              <div className="text-[10px] uppercase text-[#BBE1FA]/60">
                {viewMode === 'combat' ? 'Savaş Askeri' : viewMode === 'economy' ? 'Ekonomi Askeri' : 'Toplam Asker'}
              </div>
              <div className={`text-base font-bold ${
                viewMode === 'combat' ? 'text-rose-400' : viewMode === 'economy' ? 'text-emerald-400' : 'text-white'
              }`}>
                {isLoading ? (
                  <span className="inline-block w-8 h-4 bg-[#182329] rounded animate-pulse" />
                ) : (
                  `${activeSummary.totalPlayers} Asker`
                )}
              </div>
              <div className="text-[10px] text-[#BBE1FA]/50">
                {viewMode === 'all' ? '6 Birlik' : `%${activeSummary.percent} Oran`}
              </div>
            </div>

            {/* 2. Toplam Seviye */}
            <div className="px-3.5 py-2 rounded-lg bg-[#141C21] border border-[#3282B8]/25 text-right font-mono min-w-[110px]">
              <div className="text-[10px] uppercase text-[#BBE1FA]/60">Toplam Seviye</div>
              <div className="text-base font-bold text-white">
                {isLoading ? (
                  <span className="inline-block w-14 h-4 bg-[#182329] rounded animate-pulse" />
                ) : (
                  `${activeSummary.totalLevel.toLocaleString('tr-TR')} Lv`
                )}
              </div>
              <div className="text-[10px] text-[#BBE1FA]/50">
                Ort. {activeSummary.overallAvgLevel} Lv
              </div>
            </div>

            {/* 3. Toplam Motor Gücü */}
            <div className="px-3.5 py-2 rounded-lg bg-[#141C21] border border-amber-500/30 text-right font-mono min-w-[110px]">
              <div className="text-[10px] uppercase text-amber-400/80">Toplam Motor</div>
              <div className="text-base font-bold text-amber-300">
                {isLoading ? (
                  <span className="inline-block w-14 h-4 bg-[#182329] rounded animate-pulse" />
                ) : (
                  `${activeSummary.totalAutomated.toLocaleString('tr-TR')} Lv`
                )}
              </div>
              <div className="text-[10px] text-[#BBE1FA]/50">
                Ort. {activeSummary.overallAvgEngine} Lv
              </div>
            </div>

            {/* 4. Toplam Servet */}
            <div className="px-3.5 py-2 rounded-lg bg-[#141C21] border border-[#A78BFA]/30 text-right font-mono min-w-[110px]">
              <div className="text-[10px] uppercase text-[#A78BFA]/80">Toplam Servet</div>
              <div className="text-base font-bold text-[#A78BFA]">
                {isLoading ? (
                  <span className="inline-block w-14 h-4 bg-[#182329] rounded animate-pulse" />
                ) : (
                  `${activeSummary.totalWealth.toLocaleString('tr-TR')} G`
                )}
              </div>
              <div className="text-[10px] text-[#BBE1FA]/50">
                Ort. {activeSummary.overallAvgWealth} G
              </div>
            </div>
          </div>
        </div>

        {/* Dahil Ordular */}
        <div className="mt-4 pt-3 border-t border-[#3282B8]/15 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] font-mono text-[#BBE1FA]/60 shrink-0 flex items-center gap-1 mr-1">
            <Shield className="w-3.5 h-3.5 text-[#3282B8]" />
            Dahil Ordular:
          </span>
          {armies.map((a) => (
            <div
              key={a.id}
              className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#141C21]/80 border border-[#3282B8]/20 shrink-0 text-xs text-white font-medium"
            >
              {a.avatarUrl ? (
                <img
                  src={a.avatarUrl}
                  alt={a.name}
                  className="w-4 h-4 rounded-full object-cover border border-[#3282B8]/30 shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-4 h-4 rounded-full bg-[#0F4C75]" />
              )}
              <span className="text-xs">{a.name}</span>
              <span className="text-[10px] text-[#BBE1FA]/60 font-mono">
                ({isLoading ? '-' : a.memberCount})
              </span>
            </div>
          ))}
        </div>

        {/* Dahil Orduların Altı - Sağ Alt Köşe: Verileri Yenile & PDF İndir Butonları */}
        <div className="mt-3 pt-2.5 border-t border-[#3282B8]/15 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isLoading || isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#141C21] hover:bg-[#0F4C75]/40 text-[#BBE1FA] border border-[#3282B8]/30 hover:border-[#3282B8] text-xs font-mono transition cursor-pointer active:scale-95 disabled:opacity-50"
            title="Güncel WarEra verilerini yeniden çek"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#3282B8] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Yenileniyor...' : 'Verileri Yenile'}</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isLoading || isExporting || stats.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#141C21] hover:bg-[#0F4C75]/40 text-[#BBE1FA] border border-[#3282B8]/30 hover:border-[#3282B8] text-xs font-mono transition cursor-pointer active:scale-95 disabled:opacity-50"
            title="Ülke istatistikleri ve seviye dağılım raporunu PDF olarak indir"
          >
            <FileDown className="w-3.5 h-3.5 text-[#3282B8]" />
            <span>{isExporting ? 'Hazırlanıyor...' : 'PDF İndir'}</span>
          </button>
        </div>
      </div>

      {/* 2. BÖLÜM 1: Seviye Başına Düşen Oyuncu Grafiği ve Tablosu */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Sol: Grafik */}
        <div className="lg:col-span-8 bg-[#182329]/95 border border-emerald-500/25 hover:border-emerald-500/40 rounded-xl p-5 shadow-xl shadow-black/30 backdrop-blur-sm flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between mb-4 border-b border-[#3282B8]/15 pb-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#3282B8] font-mono font-bold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                1. Grafik Analizi
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                Seviye Başına Düşen Oyuncu Dağılımı ({activeSummary.modeLabel})
              </h3>
              <p className="text-xs text-[#BBE1FA]/60 font-mono mt-0.5">
                {viewMode === 'combat'
                  ? 'Savaş modundaki askerlerin seviyelere göre yoğunluk eğrisi'
                  : viewMode === 'economy'
                    ? 'Ekonomi modundaki askerlerin seviyelere göre yoğunluk eğrisi'
                    : '6 ordudaki tüm askerlerin seviyelere göre yoğunluk eğrisi'}
              </p>
            </div>
            <div className="text-right font-mono text-xs">
              <span className="text-[#BBE1FA]/60">En Yoğun Seviye: </span>
              <span className="text-white font-bold">
                {isLoading || !activeSummary.peakPlayerLevel ? (
                  '-'
                ) : (
                  `Lv. ${activeSummary.peakPlayerLevel.level} (${activeSummary.peakPlayerLevel.playerCount} Asker)`
                )}
              </span>
            </div>
          </div>

          <div className="py-2">
            <InteractiveLineChart
              data={activeStats}
              valueKey="playerCount"
              color={viewMode === 'combat' ? '#F43F5E' : viewMode === 'economy' ? '#10B981' : '#3282B8'}
              gradientId={viewMode === 'combat' ? 'grad-combat' : viewMode === 'economy' ? 'grad-eco' : 'grad-players'}
              unit="Asker"
              isLoading={isLoading}
            />
          </div>

          <div className="pt-3 border-t border-[#3282B8]/15 flex items-center justify-between text-xs text-[#BBE1FA]/60 font-mono">
            <span>Yatay Eksen: Oyuncu Seviyesi (Level)</span>
            <span>Dikey Eksen: {activeSummary.modeLabel} Oyuncu Sayısı</span>
          </div>
        </div>

        {/* Sağ: Tablo */}
        <div className="lg:col-span-4 bg-[#182329]/95 border border-emerald-500/25 hover:border-emerald-500/40 rounded-xl p-4 shadow-xl shadow-black/30 backdrop-blur-sm flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between border-b border-[#3282B8]/15 pb-2 mb-3">
              <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                Seviye - Oyuncu Tablosu
              </span>
              <span className="text-[11px] text-[#BBE1FA]/60 font-mono">
                {isLoading ? 'Yükleniyor...' : `${activeStats.length} Seviye Grubu`}
              </span>
            </div>

            <div className="overflow-y-auto max-h-[260px] pr-1 divide-y divide-[#3282B8]/10 text-xs font-mono">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase text-[#BBE1FA]/70 border-b border-[#3282B8]/20 sticky top-0 bg-[#182329] z-10">
                    <th className="py-1.5 px-2">Seviye</th>
                    <th className="py-1.5 px-2 text-center">Oyuncu</th>
                    <th className="py-1.5 px-2 text-right">Oran (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3282B8]/10">
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={`sk-1-${i}`} className="animate-pulse">
                        <td className="py-2 px-2"><div className="w-12 h-3 bg-[#141C21] rounded" /></td>
                        <td className="py-2 px-2 text-center"><div className="w-8 h-3 bg-[#141C21] rounded mx-auto" /></td>
                        <td className="py-2 px-2 text-right"><div className="w-10 h-3 bg-[#141C21] rounded ml-auto" /></td>
                      </tr>
                    ))
                  ) : activeStats.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-[#BBE1FA]/40">
                        Kayıtlı veri bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    activeStats.map((s) => (
                      <tr key={s.level} className="hover:bg-[#0F4C75]/20 transition-colors">
                        <td className="py-1.5 px-2 font-bold text-white">
                          Lv. {s.level}
                        </td>
                        <td className={`py-1.5 px-2 text-center font-bold ${
                          viewMode === 'combat' ? 'text-rose-400' : viewMode === 'economy' ? 'text-emerald-400' : 'text-[#BBE1FA]'
                        }`}>
                          {s.playerCount}
                        </td>
                        <td className="py-1.5 px-2 text-right text-[#BBE1FA]/80">
                          %{s.percentage}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-3 border-t border-[#3282B8]/15 flex items-center justify-between text-xs font-mono text-[#BBE1FA]/80 mt-2">
            <span>Toplam {activeSummary.modeLabel} Askeri:</span>
            <span className={`font-bold ${
              viewMode === 'combat' ? 'text-rose-400' : viewMode === 'economy' ? 'text-emerald-400' : 'text-white'
            }`}>
              {isLoading ? '-' : `${activeSummary.totalPlayers} Asker`}
            </span>
          </div>
        </div>
      </div>

      {/* 3. BÖLÜM 2: Seviye Başına Düşen Ortalama Fabrika Grafiği ve Tablosu */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Sol: Grafik */}
        <div className="lg:col-span-8 bg-[#182329]/95 border border-emerald-500/25 hover:border-emerald-500/40 rounded-xl p-5 shadow-xl shadow-black/30 backdrop-blur-sm flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between mb-4 border-b border-[#3282B8]/15 pb-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-emerald-400 font-mono font-bold flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                2. Grafik Analizi
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                Seviye Başına Düşen Ortalama Fabrika Grafiği ({activeSummary.modeLabel})
              </h3>
              <p className="text-xs text-[#BBE1FA]/60 font-mono mt-0.5">
                {activeSummary.modeLabel} oyuncularının seviyelere göre ortalama aktif fabrika kapasitesi
              </p>
            </div>
            <div className="text-right font-mono text-xs">
              <span className="text-[#BBE1FA]/60">Genel Ortalama: </span>
              <span className="text-emerald-400 font-bold">
                {isLoading ? '-' : `${activeSummary.overallAvgFactories} Fabrika / Oyuncu`}
              </span>
            </div>
          </div>

          <div className="py-2">
            <InteractiveLineChart
              data={activeStats}
              valueKey="avgFactories"
              color="#10B981"
              gradientId="grad-factories"
              unit="Fabrika"
              isLoading={isLoading}
            />
          </div>

          <div className="pt-3 border-t border-[#3282B8]/15 flex items-center justify-between text-xs text-[#BBE1FA]/60 font-mono">
            <span>Yatay Eksen: Oyuncu Seviyesi</span>
            <span>Dikey Eksen: Ortalama Aktif Fabrika Sayısı</span>
          </div>
        </div>

        {/* Sağ: Tablo */}
        <div className="lg:col-span-4 bg-[#182329]/95 border border-emerald-500/25 hover:border-emerald-500/40 rounded-xl p-4 shadow-xl shadow-black/30 backdrop-blur-sm flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between border-b border-[#3282B8]/15 pb-2 mb-3">
              <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                Seviye - Ortalama Fabrika
              </span>
              <span className="text-[11px] text-[#BBE1FA]/60 font-mono">
                {isLoading ? 'Yükleniyor...' : `${activeSummary.totalFactories} Toplam Fabrika`}
              </span>
            </div>

            <div className="overflow-y-auto max-h-[260px] pr-1 divide-y divide-[#3282B8]/10 text-xs font-mono">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase text-[#BBE1FA]/70 border-b border-[#3282B8]/20 sticky top-0 bg-[#182329] z-10">
                    <th className="py-1.5 px-2">Seviye</th>
                    <th className="py-1.5 px-2 text-center">Ort. Fabrika</th>
                    <th className="py-1.5 px-2 text-right">Toplam</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3282B8]/10">
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={`sk-2-${i}`} className="animate-pulse">
                        <td className="py-2 px-2"><div className="w-12 h-3 bg-[#141C21] rounded" /></td>
                        <td className="py-2 px-2 text-center"><div className="w-8 h-3 bg-[#141C21] rounded mx-auto" /></td>
                        <td className="py-2 px-2 text-right"><div className="w-12 h-3 bg-[#141C21] rounded ml-auto" /></td>
                      </tr>
                    ))
                  ) : activeStats.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-[#BBE1FA]/40">
                        Kayıtlı veri bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    activeStats.map((s) => (
                      <tr key={s.level} className="hover:bg-[#0F4C75]/20 transition-colors">
                        <td className="py-1.5 px-2 font-bold text-white">
                          Lv. {s.level}
                        </td>
                        <td className="py-1.5 px-2 text-center font-bold text-emerald-400">
                          {s.avgFactories.toFixed(2)}
                        </td>
                        <td className="py-1.5 px-2 text-right text-[#BBE1FA]/80">
                          {s.totalFactories} ({s.playerCount} Asker)
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-3 border-t border-[#3282B8]/15 flex items-center justify-between text-xs font-mono text-[#BBE1FA]/80 mt-2">
            <span>Toplam {activeSummary.modeLabel} Fabrika:</span>
            <span className="text-emerald-400 font-bold">{isLoading ? '-' : activeSummary.totalFactories}</span>
          </div>
        </div>
      </div>

      {/* 4. BÖLÜM 3: Seviye Başına Düşen Otomatik Motor Gücü Grafiği ve Tablosu */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Sol: Grafik */}
        <div className="lg:col-span-8 bg-[#182329]/95 border border-emerald-500/25 hover:border-emerald-500/40 rounded-xl p-5 shadow-xl shadow-black/30 backdrop-blur-sm flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between mb-4 border-b border-[#3282B8]/15 pb-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-amber-400 font-mono font-bold flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                3. Grafik Analizi
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                Seviye Başına Düşen Otomatik Motor Gücü Grafiği ({activeSummary.modeLabel})
              </h3>
              <p className="text-xs text-[#BBE1FA]/60 font-mono mt-0.5">
                {activeSummary.modeLabel} oyuncularının fabrikalarındaki ortalama otomasyon motor seviyesi eğrisi
              </p>
            </div>
            <div className="text-right font-mono text-xs">
              <span className="text-[#BBE1FA]/60">Genel Ortalama: </span>
              <span className="text-amber-300 font-bold">
                {isLoading ? '-' : `${activeSummary.overallAvgEngine} Lv / Oyuncu`}
              </span>
            </div>
          </div>

          <div className="py-2">
            <InteractiveLineChart
              data={activeStats}
              valueKey="avgAutomatedLevel"
              color="#F59E0B"
              gradientId="grad-engine"
              unit="Lv"
              isLoading={isLoading}
            />
          </div>

          <div className="pt-3 border-t border-[#3282B8]/15 flex items-center justify-between text-xs text-[#BBE1FA]/60 font-mono">
            <span>Yatay Eksen: Oyuncu Seviyesi</span>
            <span>Dikey Eksen: Ortalama Motor Gücü (Lv)</span>
          </div>
        </div>

        {/* Sağ: Tablo */}
        <div className="lg:col-span-4 bg-[#182329]/95 border border-emerald-500/25 hover:border-emerald-500/40 rounded-xl p-4 shadow-xl shadow-black/30 backdrop-blur-sm flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between border-b border-[#3282B8]/15 pb-2 mb-3">
              <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                Seviye - Motor Gücü Tablosu
              </span>
              <span className="text-[11px] text-[#BBE1FA]/60 font-mono">
                {isLoading ? 'Yükleniyor...' : `${activeSummary.totalAutomated} Lv Toplam Güç`}
              </span>
            </div>

            <div className="overflow-y-auto max-h-[260px] pr-1 divide-y divide-[#3282B8]/10 text-xs font-mono">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase text-[#BBE1FA]/70 border-b border-[#3282B8]/20 sticky top-0 bg-[#182329] z-10">
                    <th className="py-1.5 px-2">Seviye</th>
                    <th className="py-1.5 px-2 text-center">Ort. Motor</th>
                    <th className="py-1.5 px-2 text-right">Toplam Güç</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3282B8]/10">
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={`sk-3-${i}`} className="animate-pulse">
                        <td className="py-2 px-2"><div className="w-12 h-3 bg-[#141C21] rounded" /></td>
                        <td className="py-2 px-2 text-center"><div className="w-8 h-3 bg-[#141C21] rounded mx-auto" /></td>
                        <td className="py-2 px-2 text-right"><div className="w-12 h-3 bg-[#141C21] rounded ml-auto" /></td>
                      </tr>
                    ))
                  ) : activeStats.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-[#BBE1FA]/40">
                        Kayıtlı veri bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    activeStats.map((s) => (
                      <tr key={s.level} className="hover:bg-[#0F4C75]/20 transition-colors">
                        <td className="py-1.5 px-2 font-bold text-white">
                          Lv. {s.level}
                        </td>
                        <td className="py-1.5 px-2 text-center font-bold text-amber-300">
                          {s.avgAutomatedLevel.toFixed(1)} Lv
                        </td>
                        <td className="py-1.5 px-2 text-right text-[#BBE1FA]/80">
                          {s.totalAutomatedLevel} Lv ({s.playerCount} Asker)
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-3 border-t border-[#3282B8]/15 flex items-center justify-between text-xs font-mono text-[#BBE1FA]/80 mt-2">
            <span>Toplam {activeSummary.modeLabel} Motor Gücü:</span>
            <span className="text-amber-300 font-bold">{isLoading ? '-' : `${activeSummary.totalAutomated} Lv`}</span>
          </div>
        </div>
      </div>

      {/* 5. BÖLÜM 4: Seviye Başına Ortalama Toplam Servet Dağılımı Grafiği ve Tablosu */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Sol: Grafik */}
        <div className="lg:col-span-8 bg-[#182329]/95 border border-emerald-500/25 hover:border-emerald-500/40 rounded-xl p-5 shadow-xl shadow-black/30 backdrop-blur-sm flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between mb-4 border-b border-[#3282B8]/15 pb-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#A78BFA] font-mono font-bold flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5" />
                4. Grafik Analizi
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                Seviye Başına Ortalama Toplam Servet Dağılımı Grafiği ({activeSummary.modeLabel})
              </h3>
              <p className="text-xs text-[#BBE1FA]/60 font-mono mt-0.5">
                {activeSummary.modeLabel} oyuncularının seviyelere göre ortalama birikmiş altın (Gold) servet eğrisi
              </p>
            </div>
            <div className="text-right font-mono text-xs">
              <span className="text-[#BBE1FA]/60">Genel Ortalama: </span>
              <span className="text-[#A78BFA] font-bold">
                {isLoading ? '-' : `${activeSummary.overallAvgWealth} G / Oyuncu`}
              </span>
            </div>
          </div>

          <div className="py-2">
            <InteractiveLineChart
              data={activeStats}
              valueKey="avgWealth"
              color="#8B5CF6"
              gradientId="grad-wealth"
              unit="G"
              isLoading={isLoading}
            />
          </div>

          <div className="pt-3 border-t border-[#3282B8]/15 flex items-center justify-between text-xs text-[#BBE1FA]/60 font-mono">
            <span>Yatay Eksen: Oyuncu Seviyesi</span>
            <span>Dikey Eksen: Ortalama Servet (Gold)</span>
          </div>
        </div>

        {/* Sağ: Tablo */}
        <div className="lg:col-span-4 bg-[#182329]/95 border border-emerald-500/25 hover:border-emerald-500/40 rounded-xl p-4 shadow-xl shadow-black/30 backdrop-blur-sm flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between border-b border-[#3282B8]/15 pb-2 mb-3">
              <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                Seviye - Servet Tablosu
              </span>
              <span className="text-[11px] text-[#A78BFA]/80 font-mono">
                {isLoading ? 'Yükleniyor...' : `${activeSummary.totalWealth.toLocaleString('tr-TR')} G Toplam`}
              </span>
            </div>

            <div className="overflow-y-auto max-h-[260px] pr-1 divide-y divide-[#3282B8]/10 text-xs font-mono">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase text-[#BBE1FA]/70 border-b border-[#3282B8]/20 sticky top-0 bg-[#182329] z-10">
                    <th className="py-1.5 px-2">Seviye</th>
                    <th className="py-1.5 px-2 text-center">Ort. Servet</th>
                    <th className="py-1.5 px-2 text-right">Toplam Servet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3282B8]/10">
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={`sk-4-${i}`} className="animate-pulse">
                        <td className="py-2 px-2"><div className="w-12 h-3 bg-[#141C21] rounded" /></td>
                        <td className="py-2 px-2 text-center"><div className="w-12 h-3 bg-[#141C21] rounded mx-auto" /></td>
                        <td className="py-2 px-2 text-right"><div className="w-14 h-3 bg-[#141C21] rounded ml-auto" /></td>
                      </tr>
                    ))
                  ) : activeStats.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-[#BBE1FA]/40">
                        Kayıtlı veri bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    activeStats.map((s) => (
                      <tr key={s.level} className="hover:bg-[#0F4C75]/20 transition-colors">
                        <td className="py-1.5 px-2 font-bold text-white">
                          Lv. {s.level}
                        </td>
                        <td className="py-1.5 px-2 text-center font-bold text-[#A78BFA]">
                          {Math.round(s.avgWealth || 0).toLocaleString('tr-TR')} G
                        </td>
                        <td className="py-1.5 px-2 text-right text-[#BBE1FA]/80">
                          {(s.totalWealth || 0).toLocaleString('tr-TR')} G ({s.playerCount} Asker)
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-3 border-t border-[#3282B8]/15 flex items-center justify-between text-xs font-mono text-[#BBE1FA]/80 mt-2">
            <span>Toplam {activeSummary.modeLabel} Serveti:</span>
            <span className="text-[#A78BFA] font-bold">{isLoading ? '-' : `${activeSummary.totalWealth.toLocaleString('tr-TR')} G`}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
