import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LevelStatItem, CountryStatsResponse } from '../types';
import { 
  Users, 
  Building2, 
  Cpu, 
  Shield, 
  BarChart3,
  Calendar,
  Loader2
} from 'lucide-react';

const PRESET_ARMIES = [
  { id: '69c229c4449287ea1a26a5b3', name: 'Turkic Tribe', memberCount: 21, avatarUrl: 'https://media.warera.io/avatars/mu/mu-69c229c4449287ea1a26a5b3-1787680897144-8qglepbh.png' },
  { id: '689f69064e095b8b9f1b885a', name: 'ASHINA', memberCount: 13, avatarUrl: 'https://media.warera.io/avatars/mu/mu-689f69064e095b8b9f1b885a-1781036697919-z15zttgr.png' },
  { id: '68bc9bcb4870c8e343e42855', name: 'ASHINA Reserve', memberCount: 16, avatarUrl: 'https://media.warera.io/avatars/mu/mu-68bc9bcb4870c8e343e42855-1788975231586-trvgqowg.png' },
  { id: '690088ce4864a132a2d92d07', name: 'Legio Panthera', memberCount: 25, avatarUrl: 'https://media.warera.io/avatars/mu/mu-690088ce4864a132a2d92d07-1789328739738-1v6foes6.png' },
  { id: '6902269a560184d196a6fba8', name: 'BEASTs', memberCount: 25, avatarUrl: 'https://media.warera.io/avatars/mu/mu-6902269a560184d196a6fba8-1787571170299-iczr3flz.jpg' },
  { id: '6a0f1495478fe2a58d2868d6', name: 'Deliler', memberCount: 24, avatarUrl: 'https://media.warera.io/avatars/mu/mu-6a0f1495478fe2a58d2868d6-1779887796291-bfgxnrms.png' },
];

// In-memory session cache so once fetched, tab switching is 100% instant with zero flicker
let sessionCountryStatsCache: CountryStatsResponse | null = null;

interface ChartProps {
  data: LevelStatItem[];
  valueKey: 'playerCount' | 'avgFactories' | 'avgAutomatedLevel';
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

  // Chart Dimensions
  const svgWidth = 800;
  const svgHeight = 260;
  const padding = { top: 25, right: 30, bottom: 35, left: 45 };
  const innerWidth = svgWidth - padding.left - padding.right;
  const innerHeight = svgHeight - padding.top - padding.bottom;

  const hasData = !isLoading && data && data.length > 0;

  const values = hasData ? data.map((d) => Number(d[valueKey])) : [0, 10];
  const minVal = hasData ? Math.min(...values) : 0;
  const maxVal = hasData ? Math.max(...values) : 10;
  const yRange = maxVal - minVal || 1;
  const yMargin = yRange * 0.1;
  const domainMin = Math.max(0, minVal - yMargin);
  const domainMax = maxVal + yMargin;

  const points = hasData
    ? data.map((d, i) => {
        const x = padding.left + (i / (data.length - 1 || 1)) * innerWidth;
        const yVal = Number(d[valueKey]);
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

  // 4 Y-axis ticks
  const yTicks = [0, 0.33, 0.66, 1].map((ratio) => {
    const val = domainMin + (domainMax - domainMin) * ratio;
    const y = padding.top + innerHeight - ratio * innerHeight;
    return {
      val: hasData ? (val < 10 ? val.toFixed(1) : Math.round(val)) : '-',
      y,
    };
  });

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!hasData || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const relativeX = (mouseX / rect.width) * svgWidth;

    let closestIdx = 0;
    let minDist = Infinity;
    points.forEach((p, idx) => {
      const dist = Math.abs(p.x - relativeX);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });
    setHoverIndex(closestIdx);
  };

  const activePoint = hasData && hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div ref={containerRef} className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto overflow-visible cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal Grid lines */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              y1={tick.y}
              x2={svgWidth - padding.right}
              y2={tick.y}
              stroke="#3282B8"
              strokeOpacity="0.12"
              strokeDasharray="4 4"
            />
            <text
              x={padding.left - 8}
              y={tick.y + 3.5}
              fill="#BBE1FA"
              opacity="0.6"
              fontSize="10"
              fontFamily="monospace"
              textAnchor="end"
            >
              {tick.val}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {hasData &&
          points.map((p, i) => {
            if (i % 4 !== 0 && i !== points.length - 1 && i !== 0) return null;
            return (
              <g key={i}>
                <line
                  x1={p.x}
                  y1={padding.top + innerHeight}
                  x2={p.x}
                  y2={padding.top + innerHeight + 5}
                  stroke="#3282B8"
                  strokeOpacity="0.3"
                />
                <text
                  x={p.x}
                  y={padding.top + innerHeight + 18}
                  fill="#BBE1FA"
                  opacity="0.7"
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  Lv.{p.data.level}
                </text>
              </g>
            );
          })}

        {/* When Loading / Empty: show clean subtle placeholder */}
        {!hasData && (
          <g>
            <text
              x={svgWidth / 2}
              y={svgHeight / 2}
              fill="#BBE1FA"
              opacity="0.4"
              fontSize="12"
              fontFamily="monospace"
              textAnchor="middle"
            >
              Veriler yükleniyor...
            </text>
          </g>
        )}

        {/* Area fill */}
        {hasData && <path d={areaPath} fill={`url(#${gradientId})`} />}

        {/* Line */}
        {hasData && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Interactive Hover Indicators */}
        {activePoint && (
          <g>
            <line
              x1={activePoint.x}
              y1={padding.top}
              x2={activePoint.x}
              y2={padding.top + innerHeight}
              stroke={color}
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity="0.7"
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="6.5"
              fill={color}
              opacity="0.3"
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="3.5"
              fill="#FFFFFF"
              stroke={color}
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {/* Floating Tooltip HTML Overlay */}
      {activePoint && (
        <div
          className="absolute z-20 pointer-events-none transform -translate-x-1/2 bg-[#182329] border border-[#3282B8]/40 shadow-xl rounded-lg px-2.5 py-1.5 text-xs font-mono"
          style={{
            left: `${(activePoint.x / svgWidth) * 100}%`,
            top: `${Math.max(10, (activePoint.y / svgHeight) * 100 - 32)}%`,
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-white font-bold">Seviye {activePoint.data.level}:</span>
            <span className="text-white font-extrabold" style={{ color }}>
              {Number(activePoint.data[valueKey]).toFixed(valueKey === 'playerCount' ? 0 : 2)} {unit}
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
  const [data, setData] = useState<CountryStatsResponse | null>(sessionCountryStatsCache);
  const [isLoading, setIsLoading] = useState<boolean>(!sessionCountryStatsCache);

  useEffect(() => {
    let isMounted = true;

    // If already loaded in memory, don't refetch or flash
    if (sessionCountryStatsCache) {
      setData(sessionCountryStatsCache);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetch('/api/country-stats')
      .then((res) => {
        if (!res.ok) throw new Error('API request failed');
        return res.json();
      })
      .then((json) => {
        if (isMounted && json && json.success) {
          sessionCountryStatsCache = json;
          setData(json);
        }
      })
      .catch((err) => {
        console.error('Error fetching country stats:', err);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = data?.levelStats || [];
  const armies = data?.armies || PRESET_ARMIES;
  const totalPlayers = data?.totalPlayers || 0;

  // Summary Metrics
  const summary = useMemo(() => {
    if (!data || stats.length === 0) {
      return {
        totalFactories: 0,
        totalAutomated: 0,
        overallAvgFactories: '-',
        overallAvgEngine: '-',
        peakPlayerLevel: null,
        minLevel: '-',
        maxLevel: '-',
      };
    }

    const totalFactories = stats.reduce((sum, s) => sum + s.totalFactories, 0);
    const totalAutomated = stats.reduce((sum, s) => sum + s.totalAutomatedLevel, 0);
    const overallAvgFactories = totalPlayers > 0 ? (totalFactories / totalPlayers).toFixed(2) : '-';
    const overallAvgEngine = totalPlayers > 0 ? (totalAutomated / totalPlayers).toFixed(1) : '-';

    const peakPlayerLevel = [...stats].sort((a, b) => b.playerCount - a.playerCount)[0];
    const maxLevel = Math.max(...stats.map((s) => s.level));
    const minLevel = Math.min(...stats.map((s) => s.level));

    return {
      totalFactories,
      totalAutomated,
      overallAvgFactories,
      overallAvgEngine,
      peakPlayerLevel,
      minLevel,
      maxLevel,
    };
  }, [data, stats, totalPlayers]);

  return (
    <div id="country-stats-panel" className="space-y-6">
      {/* 1. Ülke Orduları Bilgi Banner'ı */}
      <div className="bg-gradient-to-r from-[#182329]/95 via-[#1B262C]/95 to-[#182329]/95 border border-[#3282B8]/30 rounded-xl p-5 shadow-xl shadow-black/30 backdrop-blur-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#0F4C75]/60 text-[#BBE1FA] border border-[#3282B8]/40 uppercase tracking-widest">
                Katsayı & Seviye Analizi
              </span>
              <span className="text-xs font-mono text-[#BBE1FA]/60 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#3282B8]" />
                Haftalık Güncelleme
              </span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#3282B8]" />
              Ülke İstatistikleri (6 Askeri Ordu Dağılımı)
            </h2>
            <p className="text-xs text-[#BBE1FA]/70 max-w-3xl leading-relaxed">
              Askeri birlikteki 6 ordunun (Turkic Tribe, ASHINA, ASHINA Reserve, Legio Panthera, BEASTs, Deliler) tüm askerleri taranarak seviye başına düşen oyuncu sayısı, ortalama fabrika kapasitesi ve otomatik motor gücü hesaplanır.
            </p>
          </div>

          {/* Quick Metrics Badges */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <div className="px-3.5 py-2 rounded-lg bg-[#141C21] border border-[#3282B8]/25 text-right font-mono min-w-[110px]">
              <div className="text-[10px] uppercase text-[#BBE1FA]/60">Toplam Oyuncu</div>
              <div className="text-base font-bold text-white">
                {isLoading ? (
                  <span className="inline-block w-8 h-4 bg-[#182329] rounded animate-pulse" />
                ) : (
                  totalPlayers
                )}
              </div>
            </div>
            <div className="px-3.5 py-2 rounded-lg bg-[#141C21] border border-[#3282B8]/25 text-right font-mono min-w-[130px]">
              <div className="text-[10px] uppercase text-[#BBE1FA]/60">Seviye Aralığı</div>
              <div className="text-base font-bold text-white">
                {isLoading ? (
                  <span className="inline-block w-14 h-4 bg-[#182329] rounded animate-pulse" />
                ) : (
                  `Lv. ${summary.minLevel} - ${summary.maxLevel}`
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 6 Ordu Rozetleri */}
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
      </div>

      {/* 2. BÖLÜM 1: Seviye Başına Düşen Oyuncu Grafiği ve Tablosu */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Sol: Grafik */}
        <div className="lg:col-span-8 bg-[#182329]/95 border border-[#3282B8]/25 rounded-xl p-5 shadow-xl shadow-black/30 backdrop-blur-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4 border-b border-[#3282B8]/15 pb-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#3282B8] font-mono font-bold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                1. Grafik Analizi
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                Seviye Başına Düşen Oyuncu Dağılımı
              </h3>
              <p className="text-xs text-[#BBE1FA]/60 font-mono mt-0.5">
                6 ordudaki oyuncuların seviyelere göre yoğunluk eğrisi
              </p>
            </div>
            <div className="text-right font-mono text-xs">
              <span className="text-[#BBE1FA]/60">En Yoğun Seviye: </span>
              <span className="text-white font-bold">
                {isLoading || !summary.peakPlayerLevel ? (
                  '-'
                ) : (
                  `Lv. ${summary.peakPlayerLevel.level} (${summary.peakPlayerLevel.playerCount} Asker)`
                )}
              </span>
            </div>
          </div>

          <div className="py-2">
            <InteractiveLineChart
              data={stats}
              valueKey="playerCount"
              color="#3282B8"
              gradientId="grad-players"
              unit="Asker"
              isLoading={isLoading}
            />
          </div>

          <div className="pt-3 border-t border-[#3282B8]/15 flex items-center justify-between text-xs text-[#BBE1FA]/60 font-mono">
            <span>Yatay Eksen: Oyuncu Seviyesi (Level)</span>
            <span>Dikey Eksen: Toplam Oyuncu Sayısı</span>
          </div>
        </div>

        {/* Sağ: Tablo */}
        <div className="lg:col-span-4 bg-[#182329]/95 border border-[#3282B8]/25 rounded-xl p-4 shadow-xl shadow-black/30 backdrop-blur-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#3282B8]/15 pb-2 mb-3">
              <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                Seviye - Oyuncu Tablosu
              </span>
              <span className="text-[11px] text-[#BBE1FA]/60 font-mono">
                {isLoading ? 'Yükleniyor...' : `${stats.length} Seviye Grubu`}
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
                  ) : stats.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-[#BBE1FA]/40">
                        Kayıtlı veri bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    stats.map((s) => (
                      <tr key={s.level} className="hover:bg-[#0F4C75]/20 transition-colors">
                        <td className="py-1.5 px-2 font-bold text-white">
                          Lv. {s.level}
                        </td>
                        <td className="py-1.5 px-2 text-center font-bold text-[#3282B8]">
                          {s.playerCount}
                        </td>
                        <td className="py-1.5 px-2 text-right text-[#BBE1FA]/80">
                          %{s.percentage || ((s.playerCount / (totalPlayers || 1)) * 100).toFixed(1)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-3 border-t border-[#3282B8]/15 flex items-center justify-between text-xs font-mono text-[#BBE1FA]/80 mt-2">
            <span>Toplam Asker:</span>
            <span className="text-white font-bold">{isLoading ? '-' : totalPlayers}</span>
          </div>
        </div>
      </div>

      {/* 3. BÖLÜM 2: Seviye Başına Düşen Ortalama Fabrika Grafiği ve Tablosu */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Sol: Grafik */}
        <div className="lg:col-span-8 bg-[#182329]/95 border border-[#3282B8]/25 rounded-xl p-5 shadow-xl shadow-black/30 backdrop-blur-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4 border-b border-[#3282B8]/15 pb-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-emerald-400 font-mono font-bold flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                2. Grafik Analizi
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                Seviye Başına Düşen Ortalama Fabrika Grafiği
              </h3>
              <p className="text-xs text-[#BBE1FA]/60 font-mono mt-0.5">
                Seviye yükseldikçe beceri limitine bağlı aktif fabrika artış eğrisi
              </p>
            </div>
            <div className="text-right font-mono text-xs">
              <span className="text-[#BBE1FA]/60">Genel Ortalama: </span>
              <span className="text-emerald-400 font-bold">
                {isLoading ? '-' : `${summary.overallAvgFactories} Fabrika / Oyuncu`}
              </span>
            </div>
          </div>

          <div className="py-2">
            <InteractiveLineChart
              data={stats}
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
        <div className="lg:col-span-4 bg-[#182329]/95 border border-[#3282B8]/25 rounded-xl p-4 shadow-xl shadow-black/30 backdrop-blur-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#3282B8]/15 pb-2 mb-3">
              <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                Seviye - Ortalama Fabrika
              </span>
              <span className="text-[11px] text-[#BBE1FA]/60 font-mono">
                {isLoading ? 'Yükleniyor...' : `${summary.totalFactories} Toplam Fabrika`}
              </span>
            </div>

            <div className="overflow-y-auto max-h-[260px] pr-1 divide-y divide-[#3282B8]/10 text-xs font-mono">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] uppercase text-[#BBE1FA]/70 border-b border-[#3282B8]/20 sticky top-0 bg-[#182329] z-10">
                    <th className="py-1.5 px-2">Seviye</th>
                    <th className="py-1.5 px-2 text-center">Ort. Fabrika</th>
                    <th className="py-1.5 px-2 text-right">Toplam F.</th>
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
                  ) : stats.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-[#BBE1FA]/40">
                        Kayıtlı veri bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    stats.map((s) => (
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
            <span>Toplam Aktif Fabrika:</span>
            <span className="text-emerald-400 font-bold">{isLoading ? '-' : summary.totalFactories}</span>
          </div>
        </div>
      </div>

      {/* 4. BÖLÜM 3: Seviye Başına Düşen Otomatik Motor Gücü Grafiği ve Tablosu */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Sol: Grafik */}
        <div className="lg:col-span-8 bg-[#182329]/95 border border-[#3282B8]/25 rounded-xl p-5 shadow-xl shadow-black/30 backdrop-blur-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4 border-b border-[#3282B8]/15 pb-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-amber-400 font-mono font-bold flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                3. Grafik Analizi
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                Seviye Başına Düşen Otomatik Motor Gücü Grafiği
              </h3>
              <p className="text-xs text-[#BBE1FA]/60 font-mono mt-0.5">
                Seviye yükseldikçe fabrikaların ortalama otomasyon motor seviyesi eğrisi
              </p>
            </div>
            <div className="text-right font-mono text-xs">
              <span className="text-[#BBE1FA]/60">Genel Ortalama: </span>
              <span className="text-amber-300 font-bold">
                {isLoading ? '-' : `${summary.overallAvgEngine} Lv / Oyuncu`}
              </span>
            </div>
          </div>

          <div className="py-2">
            <InteractiveLineChart
              data={stats}
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
        <div className="lg:col-span-4 bg-[#182329]/95 border border-[#3282B8]/25 rounded-xl p-4 shadow-xl shadow-black/30 backdrop-blur-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#3282B8]/15 pb-2 mb-3">
              <span className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                Seviye - Motor Gücü Tablosu
              </span>
              <span className="text-[11px] text-[#BBE1FA]/60 font-mono">
                {isLoading ? 'Yükleniyor...' : `${summary.totalAutomated} Lv Toplam Güç`}
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
                  ) : stats.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-[#BBE1FA]/40">
                        Kayıtlı veri bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    stats.map((s) => (
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
            <span>Toplam Ülke Motor Gücü:</span>
            <span className="text-amber-300 font-bold">{isLoading ? '-' : `${summary.totalAutomated} Lv`}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
