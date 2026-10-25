import React, { useId, useMemo, useState } from "react";

export type HistoryPeriod = 7 | 14 | 30;
export interface HistoricalPoint {
  date: string;
  wealth?: number;
  dailyDamage?: number;
}

interface HistoricalTrendChartProps {
  title: string;
  points: HistoricalPoint[];
  field: "wealth" | "dailyDamage";
  color: string;
  currency?: boolean;
  period: HistoryPeriod;
  onPeriodChange: (period: HistoryPeriod) => void;
}

const PERIODS: HistoryPeriod[] = [7, 14, 30];
const WIDTH = 800;
const HEIGHT = 260;
const PLOT = { left: 80, right: 24, top: 38, bottom: 40 };
const formatNumber = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

function utcDateValue(date: string): number {
  return Date.parse(`${date}T12:00:00Z`);
}

function addDays(date: string, amount: number): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function todayInIstanbul(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function formatCompact(value: number, currency: boolean): string {
  const abs = Math.abs(value);
  const prefix = currency ? "$" : "";
  if (abs >= 1_000_000_000) return `${prefix}${(value / 1_000_000_000).toFixed(2).replace(/\.00$/, "")}B`;
  if (abs >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
  if (abs >= 1_000) return `${prefix}${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${prefix}${Math.round(value).toLocaleString("tr-TR")}`;
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", ...options }).format(new Date(`${date}T12:00:00Z`));
}

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(1).reduce((path, current, index) => {
    const previous = points[index];
    const controlOffset = (current.x - previous.x) / 3;
    return `${path} C ${previous.x + controlOffset} ${previous.y}, ${current.x - controlOffset} ${current.y}, ${current.x} ${current.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function wealthPeriodChange(points: HistoricalPoint[], period: HistoryPeriod): { percent: number; fromDate: string; toDate: string } | null {
  const wealth = points
    .filter((point): point is HistoricalPoint & { wealth: number } => typeof point.wealth === "number" && Number.isFinite(point.wealth))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = wealth.at(-1);
  if (!latest || latest.wealth === 0) return null;
  const target = utcDateValue(latest.date) - period * 86_400_000;
  const baseline = wealth.filter((point) => utcDateValue(point.date) <= target).at(-1);
  if (!baseline || baseline.wealth === 0) return null;
  return { percent: ((latest.wealth - baseline.wealth) / baseline.wealth) * 100, fromDate: baseline.date, toDate: latest.date };
}

export const HistoricalTrendChart: React.FC<HistoricalTrendChartProps> = ({ title, points, field, color, currency = false, period, onPeriodChange }) => {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const gradientId = `history-gradient-${useId().replace(/:/g, "")}`;
  const today = todayInIstanbul();
  const periodStart = addDays(today, -(period - 1));

  const chartData = useMemo(() => points
    .filter((point) => point.date >= periodStart && point.date <= today && typeof point[field] === "number" && Number.isFinite(point[field]))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point) => ({ ...point, value: point[field] as number })), [points, periodStart, today, field]);

  const values = chartData.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const spread = rawMax - rawMin;
  const padding = spread > 0 ? spread * 0.16 : Math.max(Math.abs(rawMax) * 0.025, 1);
  const min = values.length ? Math.max(0, rawMin - padding) : 0;
  const max = values.length ? rawMax + padding : 1;
  const range = max - min || 1;
  const startMs = utcDateValue(periodStart);
  const endMs = utcDateValue(today);
  const xRange = Math.max(86_400_000, endMs - startMs);
  const plotWidth = WIDTH - PLOT.left - PLOT.right;
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
  const plotted = chartData.map((point) => ({
    ...point,
    x: PLOT.left + Math.min(1, Math.max(0, (utcDateValue(point.date) - startMs) / xRange)) * plotWidth,
    y: PLOT.top + ((max - point.value) / range) * plotHeight,
  }));
  const line = smoothPath(plotted);
  const area = plotted.length > 1 ? `${line} L ${plotted.at(-1)!.x} ${HEIGHT - PLOT.bottom} L ${plotted[0].x} ${HEIGHT - PLOT.bottom} Z` : "";
  const active = plotted.find((point) => point.date === activeDate) || plotted.at(-1);
  const tickCount = period === 7 ? 3 : period === 14 ? 4 : 5;
  const axisDates = Array.from({ length: tickCount }, (_, index) => addDays(periodStart, Math.round(((period - 1) * index) / (tickCount - 1))));
  const yTicks = Array.from({ length: 4 }, (_, index) => max - (range * index) / 3);
  const percentages = currency ? PERIODS.map((value) => ({ period: value, result: wealthPeriodChange(points, value) })) : [];
  const fullDate = (date: string) => formatDate(date, { day: "2-digit", month: "long", year: "numeric" });
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (plotted.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const nearest = plotted.reduce((best, point) => Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best, plotted[0]);
    setActiveDate(nearest.date);
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px]">
      <div className="rounded-xl border border-[#3282B8]/20 bg-[#0c151d] p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
          <div><h5 className="text-sm font-semibold text-white">{title} · {period} Gün</h5><p className="mt-0.5 text-[10px] uppercase tracking-wider text-[#BBE1FA]/40">{currency ? "Servet ($)" : "Hasar (DMG)"} · {chartData.length} kayıt</p></div>
          <div role="group" aria-label={`${title} dönem seçimi`} className="inline-flex rounded-lg border border-[#3282B8]/20 bg-[#11191E] p-1">
            {PERIODS.map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => onPeriodChange(value)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${period === value ? "bg-[#123548] text-cyan-200" : "text-[#BBE1FA]/55 hover:bg-[#1B2B34] hover:text-white"}`}>{value} gün</button>)}
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="grid h-[260px] place-items-center rounded-lg border border-dashed border-[#3282B8]/15 text-sm text-[#BBE1FA]/50">Bu dönemde kayıtlı veri yok.</div>
        ) : (
          <div className="relative h-[260px] w-full">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-full w-full touch-pan-y overflow-visible" onPointerMove={onPointerMove} onPointerDown={onPointerMove} role="img" aria-label={`${title}, son ${period} gün; ${chartData.length} gerçek kayıt`}>
              <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".2"/><stop offset="100%" stopColor={color} stopOpacity=".01"/></linearGradient></defs>
              {yTicks.map((tick, index) => {
                const y = PLOT.top + index * (plotHeight / 3);
                return <g key={index}><line x1={PLOT.left} x2={WIDTH - PLOT.right} y1={y} y2={y} stroke="#8ab4ce" strokeOpacity=".1" strokeDasharray="4 7"/><text x={PLOT.left - 10} y={y + 4} textAnchor="end" fill="#BBE1FA" fillOpacity=".58" fontSize="12">{formatCompact(tick, currency)}</text></g>;
              })}
              {area && <path d={area} fill={`url(#${gradientId})`}/>}
              {plotted.length > 1 && <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/>}
              {plotted.map((point) => <circle key={point.date} cx={point.x} cy={point.y} r="11" fill="transparent" tabIndex={0} role="button" aria-label={`${fullDate(point.date)}: ${formatNumber.format(point.value)} ${currency ? "servet" : "hasar"}`} onFocus={() => setActiveDate(point.date)} onClick={() => setActiveDate(point.date)} onPointerEnter={() => setActiveDate(point.date)}/>)}
              {active && <g pointerEvents="none"><line x1={active.x} x2={active.x} y1={PLOT.top} y2={HEIGHT - PLOT.bottom} stroke={color} strokeOpacity=".28" strokeDasharray="3 5" vectorEffect="non-scaling-stroke"/><circle cx={active.x} cy={active.y} r="8" fill={color} fillOpacity=".12"/><circle cx={active.x} cy={active.y} r="3.5" fill={color} stroke="#0c151d" strokeWidth="2" vectorEffect="non-scaling-stroke"/></g>}
              {axisDates.map((date, index) => {
                const x = PLOT.left + (index / (axisDates.length - 1)) * plotWidth;
                return <text key={date} x={x} y={HEIGHT - 10} textAnchor={index === 0 ? "start" : index === axisDates.length - 1 ? "end" : "middle"} fill="#BBE1FA" fillOpacity=".52" fontSize="12">{formatDate(date, { day: "2-digit", month: "short" })}</text>;
              })}
            </svg>
            {active && <div className="pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-lg border bg-[#141c21] px-3 py-2 shadow-xl shadow-black/30" style={{ left: `${(active.x / WIDTH) * 100}%`, borderColor: `${color}66`, transform: active.x > WIDTH * 0.68 ? "translateX(-100%)" : active.x < WIDTH * 0.28 ? "translateX(0)" : "translateX(-50%)" }}><div className="text-[10px] text-[#BBE1FA]/55">{fullDate(active.date)}</div><div className="mt-0.5 font-mono text-base font-semibold" style={{ color }}>{formatCompact(active.value, currency)}<span className="ml-1 text-[10px] font-normal text-[#BBE1FA]/55">{currency ? "servet" : "hasar"}</span></div><div className="mt-0.5 text-[9px] text-[#BBE1FA]/40">Tam değer: {currency ? "$" : ""}{formatNumber.format(active.value)}</div></div>}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[#3282B8]/10 pt-2 text-[10px] text-[#BBE1FA]/45"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }}/>{currency ? "Günlük kayıtlı toplam servet" : "Günlük hasar"}<span className="ml-auto">Nokta seçerek tam değeri inceleyin</span></div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
        <StatCard label={`${period} günlük kayıt`} value={`${chartData.length} gün`} color={color}/>
        <StatCard label={`${period} günlük ortalama`} value={values.length ? formatCompact(values.reduce((sum, value) => sum + value, 0) / values.length, currency) : "—"} color={color}/>
        <div className="col-span-2 rounded-xl border border-[#3282B8]/20 bg-[#141C21] p-3 lg:col-span-1"><div className="text-[10px] uppercase tracking-wider text-[#BBE1FA]/45">{period} günlük en yüksek / en düşük</div><div className="mt-1 flex justify-between gap-2 font-mono text-xs text-[#BBE1FA]/80"><span>{values.length ? formatCompact(Math.max(...values), currency) : "—"}</span><span>{values.length ? formatCompact(Math.min(...values), currency) : "—"}</span></div></div>
        {currency && <div className="col-span-2 rounded-xl border border-amber-500/20 bg-[#141C21] p-3 lg:col-span-1"><div className="text-[10px] uppercase tracking-wider text-[#BBE1FA]/45">Servet değişimi</div><div className="mt-2 space-y-2">{percentages.map(({ period: days, result }) => <div key={days} className="flex items-center justify-between gap-2"><span className="text-xs text-[#BBE1FA]/60">{days} gün</span>{result ? <span className={`text-right font-mono text-xs font-semibold ${result.percent >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{result.percent > 0 ? "+" : ""}{result.percent.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}%<span className="mt-0.5 block text-[9px] font-normal text-[#BBE1FA]/40">{formatDate(result.fromDate, { day: "2-digit", month: "short" })} → {formatDate(result.toDate, { day: "2-digit", month: "short" })}</span></span> : <span className="text-xs text-[#BBE1FA]/40">Yeterli geçmiş kayıt yok</span>}</div>)}</div></div>}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className="rounded-xl border border-[#3282B8]/20 bg-[#141C21] p-3"><div className="text-[10px] uppercase tracking-wider text-[#BBE1FA]/45">{label}</div><div className="mt-1 font-mono text-lg" style={{ color }}>{value}</div></div>
);
