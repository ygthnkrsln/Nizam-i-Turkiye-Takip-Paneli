import React, { useEffect, useMemo, useState } from 'react';
import { PlayerStats, SortDirection, PlayerMode } from '../types';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, RefreshCw, Swords, TrendingUp, UserRound, X } from 'lucide-react';
import { calculateDailyDamageFromSnapshot, findBaselineForCurrentCycle } from '../lib/dailyDamage';

interface ArmyStatsTableProps {
  players: PlayerStats[]; isLoading: boolean; onRefresh?: () => void; isRefreshing?: boolean; muName?: string; muId: string;
}
type SortField = 'username' | 'level' | 'playerMode' | 'wealth' | 'dailyDamage';
type HistoryPoint = { date: string; wealth?: number; dailyDamage?: number };

export function getPlayerModeInfo(player: PlayerStats) {
  const ecoSkills = ['entrepreneurship', 'energy', 'stamina', 'production', 'companies', 'management'];
  let ecoSP = player.ecoSkillPoints || 0;
  if (!player.ecoSkillPoints && player.skills) for (const key of ecoSkills) {
    const level = Number(player.skills[key]?.level || 0); ecoSP += (level * (level + 1)) / 2;
  }
  const totalSP = player.totalSkillPoints || Math.max(ecoSP * 2, 1);
  const ratio = Math.round((ecoSP / totalSP) * 100);
  const isEco = player.playerMode ? player.playerMode === 'economy' : ecoSP > totalSP / 2;
  return { isEco, ecoSP, totalSP, ratio, mode: (isEco ? 'economy' : 'combat') as PlayerMode };
}

function MiniChart({ points, field, color, currency = false }: { points: HistoryPoint[]; field: 'wealth' | 'dailyDamage'; color: string; currency?: boolean }) {
  const chartData = points.filter((point) => typeof point[field] === 'number' && Number.isFinite(point[field]));
  const values = chartData.map((point) => point[field]);
  const validValues = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  if (!validValues.length) return <div className="grid h-64 place-items-center rounded-xl border border-[#3282B8]/15 bg-[#0c151d] text-sm text-[#BBE1FA]/50">Bu grafik için henüz kayıt bulunmuyor.</div>;

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const range = max - min || Math.max(max * 0.08, 1);
  const chartPoints = chartData.map((point, index) => {
    const value = point[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return { index, value, date: point.date, x: 8 + (index / Math.max(chartData.length - 1, 1)) * 84, y: 88 - ((value - min) / range) * 70 };
  });
  const plotted = chartPoints.filter((point): point is NonNullable<typeof point> => point !== null);
  const linePath = plotted.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const first = plotted[0];
  const last = plotted[plotted.length - 1];
  const areaPath = plotted.length > 1 ? `${linePath} L ${last.x} 92 L ${first.x} 92 Z` : '';
  const active = chartPoints[hoveredIndex ?? last.index] || last;
  const compact = (value: number) => {
    const abs = Math.abs(value);
    const trim = (n: number) => n.toFixed(2).replace(/\.?0+$/, '');
    return abs >= 1_000_000 ? `${trim(value / 1_000_000)}m` : abs >= 1_000 ? `${trim(value / 1_000)}k` : Math.round(value).toLocaleString('tr-TR');
  };
  const fullDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const index = Math.round(ratio * (chartData.length - 1));
    let nearest = index;
    for (let distance = 0; distance < points.length; distance++) {
      const candidates = [index - distance, index + distance].filter((candidate) => candidate >= 0 && candidate < chartData.length);
      const found = candidates.find((candidate) => typeof values[candidate] === 'number');
      if (found !== undefined) { nearest = found; break; }
    }
    setHoveredIndex(nearest);
  };
  const axisIndexes = Array.from(new Set([0, Math.round((chartData.length - 1) / 2), chartData.length - 1]));
  const yTicks = Array.from({ length: 4 }, (_, index) => max - ((max - min) * index) / 3);

  return <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px]">
    <div className="relative overflow-hidden rounded-xl border border-[#3282B8]/20 bg-[#0c151d] p-3 sm:p-4">
      <div className="pointer-events-none absolute inset-x-4 top-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-[#BBE1FA]/35"><span>{currency ? 'Servet ($)' : 'Hasar (DMG)'}</span><span>{plotted.length} günlük kayıt</span></div>
      <div className="relative mt-5 h-56 sm:h-64">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full touch-pan-y overflow-visible" onPointerMove={onPointerMove} onPointerDown={onPointerMove} onPointerLeave={() => setHoveredIndex(null)} role="img" aria-label={currency ? 'Son 30 günlük servet grafiği' : 'Son 30 günlük hasar grafiği'}>
          <defs><linearGradient id={`chart-fill-${field}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".25"/><stop offset="100%" stopColor={color} stopOpacity=".015"/></linearGradient></defs>
          {yTicks.map((tick, index) => { const y = 18 + index * 22; return <g key={index}><line x1="8" x2="94" y1={y} y2={y} stroke="#3282B8" strokeOpacity=".17" strokeDasharray="1 2"/><text x="6" y={y + 1.5} textAnchor="end" fill="#BBE1FA" fillOpacity=".4" fontSize="3">{compact(tick)}</text></g>; })}
          {areaPath && <path d={areaPath} fill={`url(#chart-fill-${field})`}/>}
          {plotted.length > 1 && <path d={linePath} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/>}
          {active && <g><line x1={active.x} x2={active.x} y1="14" y2="92" stroke={color} strokeOpacity=".38" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"/><circle cx={active.x} cy={active.y} r="4" fill={color} fillOpacity=".15"/><circle cx={active.x} cy={active.y} r="2" fill={color} stroke="#0c151d" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/></g>}
          {axisIndexes.map((index) => { const point = chartPoints[index]; if (!point) return null; return <text key={index} x={point.x} y="98" textAnchor={index === 0 ? 'start' : index === chartData.length - 1 ? 'end' : 'middle'} fill="#BBE1FA" fillOpacity=".45" fontSize="3">{new Date(`${point.date}T12:00:00`).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</text>; })}
        </svg>
        {active && <div className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border px-3 py-2 shadow-xl shadow-black/30" style={{ left: `${active.x}%`, borderColor: `${color}66`, background: '#141c21', transform: active.x > 72 ? 'translateX(-100%)' : active.x < 20 ? 'translateX(0)' : 'translateX(-50%)' }}><div className="text-[10px] text-[#BBE1FA]/55">{fullDate(active.date)}</div><div className="mt-0.5 font-mono text-base font-semibold" style={{color}}>{currency ? '$' : ''}{compact(active.value)}<span className="ml-1 text-[10px] font-normal text-[#BBE1FA]/55">{currency ? 'servet' : 'hasar'}</span></div><div className="mt-0.5 text-[9px] text-[#BBE1FA]/40">Tam değer: {currency ? '$' : ''}{active.value.toLocaleString('tr-TR')}</div></div>}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-[#BBE1FA]/40"><span className="h-1.5 w-1.5 rounded-full" style={{backgroundColor:color}}/>{currency ? 'Günlük kayıtlı toplam servet' : 'Günlük hasar'}<span className="ml-auto">Noktaya gelerek değeri inceleyin</span></div>
    </div>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-1"><div className="rounded-xl border border-[#3282B8]/20 bg-[#141C21] p-3"><div className="text-[10px] uppercase tracking-wider text-[#BBE1FA]/45">Kayıt sayısı</div><div className="mt-1 font-mono text-xl text-white">{validValues.length}<span className="ml-1 text-xs font-normal text-[#BBE1FA]/45">gün</span></div></div><div className="rounded-xl border border-[#3282B8]/20 bg-[#141C21] p-3"><div className="text-[10px] uppercase tracking-wider text-[#BBE1FA]/45">Dönem ortalaması</div><div className="mt-1 font-mono text-lg" style={{color}}>{currency ? '$' : ''}{compact(validValues.reduce((sum, value) => sum + value, 0) / validValues.length)}</div></div><div className="col-span-2 rounded-xl border border-[#3282B8]/20 bg-[#141C21] p-3 lg:col-span-1"><div className="text-[10px] uppercase tracking-wider text-[#BBE1FA]/45">En yüksek / en düşük</div><div className="mt-1 flex justify-between font-mono text-xs text-[#BBE1FA]/80"><span>{currency ? '$' : ''}{compact(Math.max(...validValues))}</span><span>{currency ? '$' : ''}{compact(Math.min(...validValues))}</span></div></div></div>
  </div>;
}

function PlayerDetails({ player, muId, currentDailyDamage }: { player: PlayerStats; muId: string; currentDailyDamage?: number }) {
  const [tab, setTab] = useState<'skills' | 'damage' | 'wealth' | 'rankings'>('skills');
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  useEffect(() => {
    const params = new URLSearchParams({ userId: player.userId, muId });
    fetch(`/api/daily-damage-snapshots?${params}`).then((r) => r.ok ? r.json() : null).then((data) => {
      const points: HistoryPoint[] = data?.history || [];
      if (typeof currentDailyDamage === 'number') {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
        const last = points.at(-1);
        if (last?.date === today) points[points.length - 1] = { ...last, dailyDamage: currentDailyDamage };
        else points.push({ date: today, dailyDamage: currentDailyDamage, wealth: player.wealth });
      }
      setHistory(points);
    }).catch(() => setHistory(typeof currentDailyDamage === 'number' ? [{ date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date()), dailyDamage: currentDailyDamage, wealth: player.wealth }] : []));
  }, [player.userId, muId, currentDailyDamage, player.wealth]);

  const skills = Object.entries(player.skills || {}).filter(([, value]) => value && typeof value === 'object');
  const rankings = Object.entries(player.rankings || {}).filter(([, value]) => value && typeof value === 'object' && ('rank' in value || 'value' in value));
  const skillLabels: Record<string, string> = { attack:'Saldırı', armor:'Zırh', dodge:'Kaçınma', precision:'İsabet', critChance:'Kritik Şans', critDamage:'Kritik Hasar', health:'Can Kapasitesi', hunger:'Açlık / Tokluk', energy:'Enerji', stamina:'Stamina', entrepreneurship:'Girişimcilik', production:'Üretim', companies:'Şirketler', management:'Yönetim' };
  const rankingLabels: Record<string, string> = { weeklyUserDamages:'Haftalık Hasar', userDamages:'Toplam Hasar', userWealth:'Servet', userLevel:'Oyuncu Seviyesi', userBounty:'Alınan Ödül', userCasesOpened:'Açılan Sandıklar', userMilestoneTiers:'Aşama Ödülleri', userMissionsClaimed:'Tamamlanan Görevler', userReferrals:'Davet Edilen Oyuncular', userSubscribers:'Aboneler', userTerrain:'Sahip Olunan Arazi', userPremiumMonths:'Premium Süresi', userPremiumGifts:'Premium Hediyeleri', userPurchasedItems:'Satın Alınan Eşyalar', userOwnedCostumes:'Kostümler', userOpenedCases:'Açılan Sandıklar', userDonations:'Bağışlar', userExperience:'Deneyim Puanı' };
  const labelWords: Record<string, string> = { user:'Oyuncu', weekly:'Haftalık', daily:'Günlük', total:'Toplam', all:'Toplam', time:'Dönem', damages:'Hasar', damage:'Hasar', wealth:'Servet', level:'Seviye', bounty:'Ödül', cases:'Sandık', opened:'Açılan', open:'Açılan', milestone:'Aşama', milestones:'Aşamalar', tiers:'Ödülleri', missions:'Görevler', claimed:'Tamamlanan', referrals:'Davetler', subscribers:'Aboneler', terrain:'Arazi', premium:'Premium', months:'Süresi', gifts:'Hediyeleri', purchased:'Satın Alınan', items:'Eşyalar', owned:'Sahip Olunan', costumes:'Kostümler', donations:'Bağışlar', experience:'Deneyim', xp:'XP', points:'Puanı', rank:'Sıralama', followers:'Takipçiler', subscribersCount:'Aboneler' };
  const humanizeApiName = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').split(/\s+/).map((part) => labelWords[part.toLowerCase()] || part.charAt(0).toLocaleUpperCase('tr-TR') + part.slice(1)).join(' ');
  const displayRankingLabel = (key: string) => rankingLabels[key] || humanizeApiName(key);
  const displaySkillLabel = (key: string) => skillLabels[key] || humanizeApiName(key);
  const tierStyles: Record<string, string> = { master:'border-purple-500/40 bg-purple-950/50 text-purple-300', diamond:'border-blue-500/40 bg-blue-950/50 text-blue-300', platinum:'border-emerald-500/40 bg-emerald-950/50 text-emerald-300', gold:'border-amber-500/40 bg-amber-950/50 text-amber-300', silver:'border-slate-400/40 bg-slate-800/70 text-slate-300', bronze:'border-orange-700/40 bg-orange-950/50 text-orange-300' };
  const tabs = [['skills', 'Savaş ve Beceriler'], ['damage', 'Hasar Geçmişi · 30 gün'], ['wealth', 'Servet Geçmişi · 30 gün'], ['rankings', 'Sıralamalar ve Ödüller']] as const;
  const economySkillKeys = ['entrepreneurship','energy','stamina','production','companies','management'];
  const combatSkills = skills.filter(([name]) => !economySkillKeys.includes(name.toLowerCase()));
  const economySkills = skills.filter(([name]) => economySkillKeys.includes(name.toLowerCase()));
  return <section className="border-t border-[#3282B8]/20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#0F4C75]/10 via-[#101920] to-[#101920] p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#3282B8]/25 bg-[#141C21]/90 p-4">
      <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl border border-[#3282B8]/35 bg-[#0F4C75]/25">{player.avatarUrl ? <img src={player.avatarUrl} alt="" className="h-full w-full object-cover"/> : <UserRound className="h-6 w-6 text-[#BBE1FA]/70"/>}</div><div><div className="text-lg font-semibold text-white">{player.username}</div><div className="mt-0.5 font-mono text-[10px] text-[#BBE1FA]/45">{player.userId}</div></div></div>
      <div className="flex flex-wrap gap-2">{[['Seviye', `Lv. ${player.level}`], ['Askeri Rütbe', player.militaryRank ? `#${player.militaryRank}` : '—'], ['Toplam Hasar', `${player.totalDamages.toLocaleString('tr-TR')} DMG`], ['Servet', `$${player.wealth.toLocaleString('tr-TR')}`]].map(([label,value]) => <div key={label} className="min-w-24 rounded-lg border border-[#3282B8]/15 bg-[#0c151d] px-3 py-2"><div className="text-[9px] uppercase tracking-wider text-[#BBE1FA]/40">{label}</div><div className="mt-1 font-mono text-xs font-semibold text-white">{value}</div></div>)}</div>
    </div>
    <div className="mb-4 flex gap-2 overflow-x-auto border-b border-[#3282B8]/15 pb-3">{tabs.map(([key,label]) => <button key={key} onClick={() => setTab(key)} className={`shrink-0 rounded-lg border px-3 py-2 text-xs transition-colors ${tab === key ? 'border-[#3282B8]/60 bg-[#0F4C75]/35 text-[#BBE1FA]' : 'border-transparent text-[#BBE1FA]/55 hover:border-[#3282B8]/25 hover:text-[#BBE1FA]'}`}>{label}</button>)}</div>
    {tab === 'skills' && <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[['Toplam XP', (player.totalXp || 0).toLocaleString('tr-TR')], ['Prestij Seviyesi', player.prestigeLevel ?? '—'], ['Savaş Rütbesi', player.militaryRank ? `#${player.militaryRank}` : '—']].map(([label,value]) => <div key={label} className="rounded-xl border border-[#3282B8]/15 bg-[#141C21]/80 p-3"><div className="text-[10px] uppercase tracking-wider text-[#BBE1FA]/45">{label}</div><div className="mt-1 font-mono text-lg font-semibold text-white">{value}</div></div>)}</div>
      {[['Savaş Becerileri',combatSkills,'text-cyan-200','border-cyan-500/20 bg-cyan-950/20 text-cyan-200'],['Ekonomi Becerileri',economySkills,'text-emerald-200','border-emerald-500/20 bg-emerald-950/20 text-emerald-200']].map(([title,list,headingColor,badge]) => <div key={title as string}><h4 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${headingColor}`}>{title as string}</h4><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(list as typeof skills).length ? (list as typeof skills).map(([name,skill]) => <div key={name} className="flex items-center justify-between rounded-xl border border-[#3282B8]/15 bg-[#141C21]/80 p-3"><span className="text-sm text-[#BBE1FA]/80">{displaySkillLabel(name)}</span><span className={`rounded-md border px-2 py-1 font-mono text-xs ${badge}`}>Lv. {skill.level ?? skill.value ?? '—'}</span></div>) : <div className="text-xs text-[#BBE1FA]/40">Kayıtlı beceri bulunamadı.</div>}</div></div>)}
    </div>}
    {tab === 'damage' && <div><h4 className="text-sm font-semibold text-cyan-100">Günlük Hasar · 30 Gün</h4><p className="mb-3 mt-1 text-xs text-[#BBE1FA]/45">02.55 snapshot’ları arasındaki hasar farkı ve mevcut günün canlı hasarı</p><MiniChart points={history} field="dailyDamage" color="#06b6d4" /></div>}
    {tab === 'wealth' && <div><h4 className="text-sm font-semibold text-amber-100">Servet Geçmişi · 30 Gün</h4><p className="mb-3 mt-1 text-xs text-[#BBE1FA]/45">Cron kayıtlarından alınan son 30 günlük oyuncu serveti</p><MiniChart points={history} field="wealth" color="#f59e0b" currency /></div>}
    {tab === 'rankings' && <div><h4 className="mb-3 text-sm font-semibold text-violet-100">Resmî Sıralamalar ve Dereceler</h4><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rankings.length ? rankings.map(([name,value]) => { const tier = String(value.tier || '').toLowerCase(); const tierColor = tierStyles[tier] || 'border-[#3282B8]/25 bg-[#0c151d] text-[#BBE1FA]/70'; return <div key={name} className="rounded-xl border border-violet-500/15 bg-[#141C21]/80 p-4"><div className="flex items-start justify-between gap-2"><div className="text-xs text-[#BBE1FA]/70">{displayRankingLabel(name)}</div>{tier && <span className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold capitalize ${tierColor}`}>{tier}</span>}</div><div className="mt-2 flex items-baseline justify-between font-mono text-lg font-semibold text-white"><span>{Number(value.value || 0).toLocaleString('tr-TR')}</span><span className="text-xs text-violet-200">#{value.rank || '—'}</span></div></div>; }) : <p className="text-sm text-[#BBE1FA]/50">Sıralama veya ödül verisi bulunamadı.</p>}</div></div>}
  </section>;
}

export const ArmyStatsTable: React.FC<ArmyStatsTableProps> = ({ players, isLoading, onRefresh, isRefreshing = false, muName = 'Turkic Tribe', muId }) => {
  const [search, setSearch] = useState(''); const [sortField, setSortField] = useState<SortField>('wealth'); const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [modeFilter, setModeFilter] = useState<'all' | 'combat' | 'economy'>('all'); const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dailyDamageByUser, setDailyDamageByUser] = useState<Record<string, number>>({});
  useEffect(() => { fetch('/api/daily-damage-snapshots').then((r) => r.ok ? r.json() : null).then((data) => {
    const baseline = findBaselineForCurrentCycle(data?.snapshots || {}, muId);
    const members = baseline.baselineMembers || {};
    const values: Record<string, number> = {};
    for (const player of players) {
      const weekly = Number(player.weeklyDamages || 0);
      const baselineWeekly = members[player.userId]?.weeklyDamage;
      if (baselineWeekly !== undefined) values[player.userId] = calculateDailyDamageFromSnapshot(weekly, baselineWeekly);
    }
    setDailyDamageByUser(values);
  }).catch(() => setDailyDamageByUser({})); }, [muId, players]);
  const sorted = useMemo(() => players.filter((p) => (modeFilter === 'all' || getPlayerModeInfo(p).mode === modeFilter) && (!search || `${p.username} ${p.userId}`.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => {
    const av = sortField === 'username' ? a.username.toLowerCase() : sortField === 'level' ? a.level : sortField === 'playerMode' ? getPlayerModeInfo(a).ratio : sortField === 'dailyDamage' ? dailyDamageByUser[a.userId] || 0 : a.wealth;
    const bv = sortField === 'username' ? b.username.toLowerCase() : sortField === 'level' ? b.level : sortField === 'playerMode' ? getPlayerModeInfo(b).ratio : sortField === 'dailyDamage' ? dailyDamageByUser[b.userId] || 0 : b.wealth;
    const result = typeof av === 'string' ? av.localeCompare(bv as string) : av - (bv as number); return sortDirection === 'asc' ? result : -result;
  }), [players, modeFilter, search, sortField, sortDirection, dailyDamageByUser]);
  const setSort = (field: SortField) => { setSortDirection(sortField === field && sortDirection === 'desc' ? 'asc' : 'desc'); setSortField(field); };
  const currency = (value: number) => `$${(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
  const heading = (field: SortField, label: string) => <th className="cursor-pointer px-4 py-3 hover:text-white" onClick={() => setSort(field)}>{label} {sortField === field ? sortDirection === 'asc' ? <ArrowUp className="inline h-3 w-3"/> : <ArrowDown className="inline h-3 w-3"/> : <ArrowUpDown className="inline h-3 w-3 opacity-40"/>}</th>;
  const modeCounts = players.reduce((counts, player) => { getPlayerModeInfo(player).isEco ? counts.economy++ : counts.combat++; return counts; }, { economy: 0, combat: 0 });
  return <div id="army-stats-table-container" className="overflow-hidden rounded-xl border border-emerald-500/25 bg-[#182329]/95 shadow-xl shadow-black/30">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-500/20 bg-[#141C21]/70 p-4">
      <div className="flex flex-wrap items-center gap-3"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-emerald-400"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Asker veya oyuncu ara" className="w-64 rounded-lg border border-emerald-500/25 bg-[#141C21] py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-emerald-400"/></div>
      {(['all', 'combat', 'economy'] as const).map((mode) => <button key={mode} onClick={() => setModeFilter(mode)} className={`rounded-md border px-2.5 py-1.5 text-xs ${modeFilter === mode ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200' : 'border-transparent text-[#BBE1FA]/60'}`}>{mode === 'all' ? `Tümü (${players.length})` : mode === 'combat' ? `Savaş (${modeCounts.combat})` : `Ekonomi (${modeCounts.economy})`}</button>)}</div>
      {onRefresh && <button onClick={onRefresh} disabled={isLoading || isRefreshing} className="flex items-center gap-2 rounded-lg border border-emerald-500/25 px-3 py-2 text-xs text-[#BBE1FA] disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}/> Yenile</button>}
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#141C21]/90 text-[11px] uppercase tracking-wider text-[#BBE1FA]/70"><tr>{heading('username', 'Asker / Oyuncu')}{heading('level', 'Seviye')}{heading('playerMode', 'Mod / Odak')}{heading('wealth', 'Bireysel Servet')}{heading('dailyDamage', 'Günlük Hasar')}</tr></thead>
    <tbody className="divide-y divide-[#3282B8]/10">{isLoading && !players.length ? <tr><td colSpan={5} className="p-8 text-center text-[#BBE1FA]/60">Yükleniyor…</td></tr> : sorted.map((player) => {
      const inactive = !player.lastActive || Date.now() - new Date(player.lastActive).getTime() > 3 * 86400000; const mode = getPlayerModeInfo(player); const selected = selectedId === player.userId;
      return <React.Fragment key={player.userId}><tr className={`cursor-pointer transition-colors hover:bg-[#0F4C75]/20 ${inactive ? 'text-[#BBE1FA]/50' : 'text-white'} ${selected ? 'bg-[#0F4C75]/20' : 'bg-[#182329]/30'}`} onClick={() => setSelectedId(selected ? null : player.userId)}>
        <td className="px-4 py-3"><div className="flex items-center gap-3"><img src={player.avatarUrl || ''} alt="" className="h-8 w-8 rounded-full border border-[#3282B8]/30 bg-[#141C21] object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }}/><div><div className="font-semibold">{player.username} {inactive && <span className="ml-1 text-[10px] text-[#BBE1FA]/40">Pasif</span>}</div><div className="font-mono text-[10px] opacity-50">{player.userId}</div></div></div></td>
        <td className="px-4 py-3 font-mono">Lv. {player.level}</td><td className="px-4 py-3"><span className={mode.isEco ? 'text-emerald-300' : 'text-rose-300'}>{mode.isEco ? <TrendingUp className="mr-1 inline h-3 w-3"/> : <Swords className="mr-1 inline h-3 w-3"/>}{mode.isEco ? 'Ekonomi' : 'Savaş'}</span></td>
        <td className="px-4 py-3 font-mono text-amber-200">{currency(player.wealth)}</td><td className="px-4 py-3 font-mono text-cyan-200">{dailyDamageByUser[player.userId] == null ? '—' : `${dailyDamageByUser[player.userId].toLocaleString('tr-TR')} DMG`}</td>
      </tr>{selected && <tr><td colSpan={5} className="p-0"><PlayerDetails player={player} muId={muId} currentDailyDamage={dailyDamageByUser[player.userId]}/></td></tr>}</React.Fragment>;
    })}{!isLoading && !sorted.length && <tr><td colSpan={5} className="p-8 text-center text-[#BBE1FA]/50"><UserRound className="mx-auto mb-2 h-5 w-5"/>Uygun asker bulunamadı</td></tr>}</tbody></table></div>
    <div className="flex flex-wrap justify-between gap-2 border-t border-emerald-500/15 bg-[#141C21]/80 px-4 py-3 text-xs text-[#BBE1FA]/55"><span>{muName} · {sorted.length}/{players.length} asker · Toplam servet {currency(players.reduce((sum, p) => sum + (p.wealth || 0), 0))}</span><span>Oyuncu adına tıklayarak detayları görüntüleyin</span></div>
  </div>;
};
