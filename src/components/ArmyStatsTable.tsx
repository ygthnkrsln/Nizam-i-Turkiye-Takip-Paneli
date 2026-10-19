import React, { useEffect, useMemo, useState } from 'react';
import { PlayerStats, SortDirection, PlayerMode } from '../types';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, RefreshCw, Swords, TrendingUp, UserRound, X } from 'lucide-react';

interface ArmyStatsTableProps {
  players: PlayerStats[]; isLoading: boolean; onRefresh?: () => void; isRefreshing?: boolean; muName?: string; muId: string;
}
type SortField = 'username' | 'level' | 'playerMode' | 'wealth' | 'dailyDamage';
type HistoryPoint = { date: string; wealth?: number; dailyDamage?: number };

export function getPlayerModeInfo(player: PlayerStats) {
  const ecoSkills = ['entrepreneurship', 'energy', 'production', 'companies', 'management'];
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
  const values = points.map((p) => p[field]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (values.length < 2) return <div className="h-44 grid place-items-center text-sm text-[#BBE1FA]/50">Henüz yeterli geçmiş verisi yok.</div>;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const coords = points.map((p, i) => p[field] == null ? null : `${(i / Math.max(points.length - 1, 1)) * 100},${94 - ((p[field]! - min) / range) * 84}`).filter(Boolean).join(' ');
  return <div className="rounded-lg border border-[#3282B8]/20 bg-[#101920] p-3">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-44 w-full overflow-visible">
      {[20, 45, 70, 95].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#3282B8" strokeOpacity=".17" strokeDasharray="1 2" />)}
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
    <div className="mt-2 flex justify-between text-[10px] text-[#BBE1FA]/50"><span>{points[0]?.date}</span><span>{points.at(-1)?.date}</span></div>
    <div className="mt-2 text-xs text-[#BBE1FA]/70">En düşük {currency ? '$' : ''}{Math.min(...values).toLocaleString('tr-TR')} · En yüksek {currency ? '$' : ''}{Math.max(...values).toLocaleString('tr-TR')}</div>
  </div>;
}

function PlayerDetails({ player, muId }: { player: PlayerStats; muId: string }) {
  const [tab, setTab] = useState<'skills' | 'damage' | 'wealth' | 'rankings'>('skills');
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  useEffect(() => {
    const params = new URLSearchParams({ userId: player.userId, muId });
    fetch(`/api/daily-damage-snapshots?${params}`).then((r) => r.ok ? r.json() : null).then((data) => setHistory(data?.history || [])).catch(() => setHistory([]));
  }, [player.userId, muId]);
  const skills = Object.entries(player.skills || {}).filter(([, value]) => value && typeof value === 'object');
  const rankings = Object.entries(player.rankings || {}).filter(([, value]) => value && typeof value === 'object' && ('rank' in value || 'value' in value));
  const tabs = [['skills', 'Savaş & Beceriler'], ['damage', '30 Günlük Hasar'], ['wealth', '30 Günlük Servet'], ['rankings', 'Sıralamalar & Dereceler']] as const;
  return <section className="border-t border-[#3282B8]/20 bg-[#101920] p-4 sm:p-5">
    <div className="mb-4 flex flex-wrap gap-2">{tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-lg border px-3 py-2 text-xs transition-colors ${tab === key ? 'border-[#3282B8]/60 bg-[#0F4C75]/35 text-[#BBE1FA]' : 'border-[#3282B8]/15 text-[#BBE1FA]/60 hover:border-[#3282B8]/40'}`}>{label}</button>)}</div>
    {tab === 'skills' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[['Seviye', player.level], ['Askeri rütbe', player.militaryRank], ['Toplam hasar', player.totalDamages.toLocaleString('tr-TR')], ['Toplam servet', `$${player.wealth.toLocaleString('tr-TR')}`], ['Toplam XP', (player.totalXp || 0).toLocaleString('tr-TR')], ['Prestij', player.prestigeLevel ?? '—']].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-[#3282B8]/15 bg-[#141C21] p-3"><div className="text-[11px] text-[#BBE1FA]/50">{label}</div><div className="mt-1 font-mono text-sm font-semibold text-white">{value}</div></div>)}
      {skills.map(([name, skill]) => <div key={name} className="rounded-lg border border-[#3282B8]/15 bg-[#141C21] p-3"><div className="text-xs font-medium text-[#BBE1FA]">{name.replace(/([A-Z])/g, ' $1')}</div><div className="mt-1 font-mono text-sm text-white">Seviye {skill.level ?? skill.value ?? '—'}</div></div>)}
    </div>}
    {tab === 'damage' && <MiniChart points={history} field="dailyDamage" color="#06b6d4" />}
    {tab === 'wealth' && <MiniChart points={history} field="wealth" color="#f59e0b" currency />}
    {tab === 'rankings' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rankings.length ? rankings.map(([name, value]) => <div key={name} className="rounded-lg border border-[#3282B8]/15 bg-[#141C21] p-3"><div className="text-xs text-[#BBE1FA]/60">{name}</div><div className="mt-1 flex items-baseline justify-between font-mono text-sm text-white"><span>{Number(value.value || 0).toLocaleString('tr-TR')}</span><span className="text-xs text-cyan-300">#{value.rank || '—'}</span></div><div className="mt-1 text-[10px] text-[#BBE1FA]/40">{value.tier || ''}</div></div>) : <p className="text-sm text-[#BBE1FA]/50">Sıralama verisi bulunamadı.</p>}</div>}
  </section>;
}

export const ArmyStatsTable: React.FC<ArmyStatsTableProps> = ({ players, isLoading, onRefresh, isRefreshing = false, muName = 'Turkic Tribe', muId }) => {
  const [search, setSearch] = useState(''); const [sortField, setSortField] = useState<SortField>('wealth'); const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [modeFilter, setModeFilter] = useState<'all' | 'combat' | 'economy'>('all'); const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dailyDamageByUser, setDailyDamageByUser] = useState<Record<string, number>>({});
  useEffect(() => { fetch('/api/daily-damage-snapshots').then((r) => r.ok ? r.json() : null).then((data) => {
    const dates: string[] = data?.dates || []; const latest = dates.at(-1); const members = latest ? data?.snapshots?.[latest]?.armies?.[muId]?.members || {} : {};
    const values: Record<string, number> = {}; for (const [id, member] of Object.entries(members) as [string, any][]) if (typeof member.dailyDamage === 'number') values[id] = member.dailyDamage;
    setDailyDamageByUser(values);
  }).catch(() => setDailyDamageByUser({})); }, [muId]);
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
      </tr>{selected && <tr><td colSpan={5} className="p-0"><PlayerDetails player={player} muId={muId}/></td></tr>}</React.Fragment>;
    })}{!isLoading && !sorted.length && <tr><td colSpan={5} className="p-8 text-center text-[#BBE1FA]/50"><UserRound className="mx-auto mb-2 h-5 w-5"/>Uygun asker bulunamadı</td></tr>}</tbody></table></div>
    <div className="flex flex-wrap justify-between gap-2 border-t border-emerald-500/15 bg-[#141C21]/80 px-4 py-3 text-xs text-[#BBE1FA]/55"><span>{muName} · {sorted.length}/{players.length} asker · Toplam servet {currency(players.reduce((sum, p) => sum + (p.wealth || 0), 0))}</span><span>Oyuncu adına tıklayarak detayları görüntüleyin</span></div>
  </div>;
};
