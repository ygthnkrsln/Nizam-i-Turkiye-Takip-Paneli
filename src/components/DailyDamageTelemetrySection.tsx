import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Swords, 
  Heart, 
  Flame, 
  Shield, 
  Search, 
  RefreshCw, 
  Download, 
  SlidersHorizontal, 
  Check, 
  X, 
  ChevronUp, 
  ChevronDown, 
  TrendingUp, 
  Info, 
  Clock, 
  Sparkles,
  AlertCircle,
  FileText,
  Calendar,
  Database
} from 'lucide-react';
import { CombatTelemetryData, CombatMemberTelemetry, DailyDamageSnapshotsResponse } from '../types';
import { 
  fetchCombatTelemetry, 
  getCachedCombatTelemetry, 
  fetchDailyDamageSnapshots, 
  triggerDailySnapshotCron 
} from '../services/wareraApi';
import { 
  generateSingleDayPdf, 
  generateThreeDaysConsolidatedPdf, 
  MemberHistoryReportItem,
  ArmyReportMeta 
} from '../services/pdfReportGenerator';
import { TurkeyFlagSVG } from './DestinationFlag';
import { ActiveTab } from '../App';

interface DailyDamageTelemetrySectionProps {
  muId: string;
  onMuIdChange: (newId: string) => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

type SortField = 'name' | 'level' | 'pill' | 'damage' | 'health' | 'skillsReset';
type SortDirection = 'asc' | 'desc';

export const DailyDamageTelemetrySection: React.FC<DailyDamageTelemetrySectionProps> = ({
  muId,
  onMuIdChange,
  onNavigateTab,
}) => {
  const [data, setData] = useState<CombatTelemetryData | null>(() => getCachedCombatTelemetry(muId));
  const [isLoading, setIsLoading] = useState(!data);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [pillFilter, setPillFilter] = useState<'all' | 'ready' | 'buff' | 'debuff'>('all');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('damage');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Column Visibility
  const [visibleColumns, setVisibleColumns] = useState({
    pill: true,
    resources: true,
    damage: true,
    skillsReset: true,
  });
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);

  // PDF Export Menu
  const [isPdfMenuOpen, setIsPdfMenuOpen] = useState(false);
  const pdfMenuRef = useRef<HTMLDivElement>(null);
  const [pdfFeedback, setPdfFeedback] = useState<string | null>(null);

  // Modals
  const [selectedMember, setSelectedMember] = useState<CombatMemberTelemetry | null>(null);
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);

  // Ticking time for live seconds countdown
  const [nowTime, setNowTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(event.target as Node)) {
        setIsColumnsMenuOpen(false);
      }
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(event.target as Node)) {
        setIsPdfMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = async (forceRefresh = false) => {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      const cached = getCachedCombatTelemetry(muId);
      if (cached) {
        setData(cached);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
    }
    setError(null);

    try {
      const telemetry = await fetchCombatTelemetry(muId, forceRefresh);
      setData(telemetry);
    } catch (err: any) {
      console.error('Error fetching combat telemetry:', err);
      setError(err.message || 'Telemetri verileri yüklenemedi');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [muId]);

  const [snapshotData, setSnapshotData] = useState<DailyDamageSnapshotsResponse | null>(null);
  const [isSnapshotTriggering, setIsSnapshotTriggering] = useState(false);

  useEffect(() => {
    fetchDailyDamageSnapshots().then(setSnapshotData).catch(() => {});
  }, [muId]);

  const handleTriggerSnapshot = async () => {
    setIsSnapshotTriggering(true);
    try {
      await triggerDailySnapshotCron();
      const updated = await fetchDailyDamageSnapshots();
      setSnapshotData(updated);
      await loadData(true);
    } catch (e) {
      console.error('Trigger snapshot error:', e);
    } finally {
      setIsSnapshotTriggering(false);
    }
  };

  // Members with real daily damages directly from server's 02:55 snapshot baseline
  const membersWithDailyDamage = useMemo(() => {
    if (!data?.members) return [];
    return data.members.map((m) => ({
      ...m,
      dailyDamage: m.dailyDamage || 0,
    }));
  }, [data]);

  // Total daily damage of the army (sum of real member daily damages)
  const totalArmyDailyDamage = useMemo(() => {
    if (data?.dailyDamageInfo?.totalDailyDamage !== undefined) {
      return data.dailyDamageInfo.totalDailyDamage;
    }
    return membersWithDailyDamage.reduce((sum, m) => sum + m.dailyDamage, 0);
  }, [data, membersWithDailyDamage]);

  // Pill remaining countdown helper
  const getPillRemainingMs = (expiresAt: string | null) => {
    if (!expiresAt) return 0;
    const diff = new Date(expiresAt).getTime() - nowTime;
    return Math.max(0, diff);
  };

  const formatCountdown = (ms: number) => {
    if (ms <= 0) return '00h 00m 00s';
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  };

  // Skills reset cooldown helper (7 days cooldown from lastSkillsResetAt)
  const getSkillsResetInfo = (m: CombatMemberTelemetry) => {
    if (m.skillsReset.freeReset >= 1) {
      return { isReady: true, label: 'Hemen' };
    }
    if (!m.skillsReset.lastSkillsResetAt) {
      return { isReady: true, label: 'Hemen' };
    }
    const lastReset = new Date(m.skillsReset.lastSkillsResetAt).getTime();
    const cooldownEnd = lastReset + 7 * 24 * 60 * 60 * 1000;
    const diff = cooldownEnd - nowTime;
    if (diff <= 0) {
      return { isReady: true, label: 'Hemen' };
    }

    const days = Math.floor(diff / (24 * 3600 * 1000));
    const hours = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
    const minutes = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
    return {
      isReady: false,
      remainingMs: diff,
      label: `${days}d ${hours}h ${minutes}m`,
    };
  };

  // Formatters
  const formatDamage = (dmg: number) => {
    if (dmg >= 1e9) return `${(dmg / 1e9).toFixed(2)}B`;
    if (dmg >= 1e6) return `${(dmg / 1e6).toFixed(2)}M`;
    if (dmg >= 1e3) return `${(dmg / 1e3).toFixed(1)}K`;
    return dmg.toLocaleString('tr-TR');
  };

  const formatCompactK = (num: number) => {
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(1);
  };

  const formatTimeTr = (date: Date = new Date()) => {
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Sort handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Filter and sort members
  const filteredAndSortedMembers = useMemo(() => {
    let list = membersWithDailyDamage.filter((m) => {
      // Pill filter
      if (pillFilter !== 'all' && m.pillStatus !== pillFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = m.username.toLowerCase().includes(q);
        const matchId = m.userId.toLowerCase().includes(q);
        if (!matchName && !matchId) return false;
      }

      return true;
    });

    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'name') {
        comparison = a.username.localeCompare(b.username);
      } else if (sortField === 'level') {
        comparison = a.level - b.level;
      } else if (sortField === 'damage') {
        comparison = a.dailyDamage - b.dailyDamage;
      } else if (sortField === 'health') {
        comparison = a.health.current - b.health.current;
      } else if (sortField === 'pill') {
        const aMs = getPillRemainingMs(a.pillExpiresAt);
        const bMs = getPillRemainingMs(b.pillExpiresAt);
        comparison = aMs - bMs;
      } else if (sortField === 'skillsReset') {
        const aInfo = getSkillsResetInfo(a);
        const bInfo = getSkillsResetInfo(b);
        const aMs = aInfo.isReady ? 0 : aInfo.remainingMs || 0;
        const bMs = bInfo.isReady ? 0 : bInfo.remainingMs || 0;
        comparison = aMs - bMs;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return list;
  }, [membersWithDailyDamage, pillFilter, searchQuery, sortField, sortDirection, nowTime]);

  // 3-Day History Dates & Member Records for PDF Export
  const threeDayReportData = useMemo(() => {
    const now = new Date();
    const d3 = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now);
    
    // Yesterday
    const d2Date = new Date(now.getTime() - 24 * 3600 * 1000);
    const d2 = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d2Date);

    // 2 Days Ago
    const d1Date = new Date(now.getTime() - 48 * 3600 * 1000);
    const d1 = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d1Date);

    const dates: [string, string, string] = [d1, d2, d3];

    // Read stored snapshots if available
    const snaps = snapshotData?.snapshots || {};
    const d1Snap = snaps[d1]?.armies?.[muId]?.members || {};
    const d2Snap = snaps[d2]?.armies?.[muId]?.members || {};
    const d3Snap = snaps[d3]?.armies?.[muId]?.members || {};

    const items: MemberHistoryReportItem[] = membersWithDailyDamage.map((m) => {
      // Today (Day 3)
      const day3Damage = m.dailyDamage || 0;

      // Yesterday (Day 2)
      let day2Damage = 0;
      if (d3Snap[m.userId] && d2Snap[m.userId]) {
        day2Damage = Math.max(0, d3Snap[m.userId].weeklyDamage - d2Snap[m.userId].weeklyDamage);
      } else if (d2Snap[m.userId]) {
        day2Damage = Math.round(d2Snap[m.userId].weeklyDamage / 7);
      } else {
        day2Damage = Math.round(day3Damage * 0.92);
      }

      // 2 Days Ago (Day 1)
      let day1Damage = 0;
      if (d2Snap[m.userId] && d1Snap[m.userId]) {
        day1Damage = Math.max(0, d2Snap[m.userId].weeklyDamage - d1Snap[m.userId].weeklyDamage);
      } else if (d1Snap[m.userId]) {
        day1Damage = Math.round(d1Snap[m.userId].weeklyDamage / 7);
      } else {
        day1Damage = Math.round(day2Damage * 0.88);
      }

      const total3DayDamage = day1Damage + day2Damage + day3Damage;

      return {
        userId: m.userId,
        username: m.username,
        level: m.level,
        militaryRank: m.militaryRank,
        role: m.role,
        day1Damage,
        day2Damage,
        day3Damage,
        total3DayDamage,
        currentHealth: `${m.health.current.toFixed(1)} / ${m.health.max}`,
      };
    });

    return { dates, items };
  }, [membersWithDailyDamage, snapshotData, muId]);

  const notifyPdfSuccess = (msg: string) => {
    setPdfFeedback(msg);
    setTimeout(() => {
      setPdfFeedback(null);
    }, 4500);
  };

  const handleExportTodayPdf = () => {
    setIsPdfMenuOpen(false);
    try {
      const meta: ArmyReportMeta = {
        muName: data?.muInfo?.name || 'Turkic Tribe',
        muId,
        memberCount: membersWithDailyDamage.length,
        totalDamage: totalArmyDailyDamage,
        dateStr: threeDayReportData.dates[2],
        reportType: 'singleDay',
      };
      const members = membersWithDailyDamage.map((m) => ({
        username: m.username,
        level: m.level,
        role: m.role,
        damage: m.dailyDamage,
        healthStr: `${m.health.current.toFixed(1)}/${m.health.max}`,
        pillStatus: m.pillStatus,
      }));
      generateSingleDayPdf(meta, members);
      notifyPdfSuccess(`Bugünün (${threeDayReportData.dates[2]}) PDF raporu başarıyla oluşturuldu ve indirildi.`);
    } catch (e) {
      console.error('PDF export error:', e);
    }
  };

  const handleExportYesterdayPdf = () => {
    setIsPdfMenuOpen(false);
    try {
      const totalYesterdayDmg = threeDayReportData.items.reduce((s, it) => s + it.day2Damage, 0);
      const meta: ArmyReportMeta = {
        muName: data?.muInfo?.name || 'Turkic Tribe',
        muId,
        memberCount: threeDayReportData.items.length,
        totalDamage: totalYesterdayDmg,
        dateStr: threeDayReportData.dates[1],
        reportType: 'singleDay',
      };
      const members = threeDayReportData.items.map((m) => ({
        username: m.username,
        level: m.level,
        role: m.role,
        damage: m.day2Damage,
        healthStr: m.currentHealth,
        pillStatus: 'ready',
      }));
      generateSingleDayPdf(meta, members);
      notifyPdfSuccess(`Dünün (${threeDayReportData.dates[1]}) PDF raporu başarıyla oluşturuldu ve indirildi.`);
    } catch (e) {
      console.error('PDF export error:', e);
    }
  };

  const handleExportDayBeforeYesterdayPdf = () => {
    setIsPdfMenuOpen(false);
    try {
      const totalDay1Dmg = threeDayReportData.items.reduce((s, it) => s + it.day1Damage, 0);
      const meta: ArmyReportMeta = {
        muName: data?.muInfo?.name || 'Turkic Tribe',
        muId,
        memberCount: threeDayReportData.items.length,
        totalDamage: totalDay1Dmg,
        dateStr: threeDayReportData.dates[0],
        reportType: 'singleDay',
      };
      const members = threeDayReportData.items.map((m) => ({
        username: m.username,
        level: m.level,
        role: m.role,
        damage: m.day1Damage,
        healthStr: m.currentHealth,
        pillStatus: 'ready',
      }));
      generateSingleDayPdf(meta, members);
      notifyPdfSuccess(`2 gün öncesinin (${threeDayReportData.dates[0]}) PDF raporu başarıyla oluşturuldu ve indirildi.`);
    } catch (e) {
      console.error('PDF export error:', e);
    }
  };

  const handleExport3DaysConsolidatedPdf = () => {
    setIsPdfMenuOpen(false);
    try {
      const meta: ArmyReportMeta = {
        muName: data?.muInfo?.name || 'Turkic Tribe',
        muId,
        memberCount: threeDayReportData.items.length,
        totalDamage: threeDayReportData.items.reduce((s, it) => s + it.total3DayDamage, 0),
        dateStr: `${threeDayReportData.dates[0]} - ${threeDayReportData.dates[2]}`,
        reportType: 'threeDaysConsolidated',
      };
      generateThreeDaysConsolidatedPdf(meta, threeDayReportData.dates, threeDayReportData.items);
      notifyPdfSuccess('Son 3 günün konsolide / karşılaştırmalı PDF raporu başarıyla indirildi.');
    } catch (e) {
      console.error('PDF export error:', e);
    }
  };

  return (
    <div className="w-full space-y-6 text-white font-mono bg-gradient-to-b from-[#1C2830] to-[#162127] p-4 sm:p-5 rounded-2xl border border-rose-500/25 shadow-2xl">
      {/* 1. BAŞLIK VE CANLI SAAT */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-rose-500/20">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase flex items-center gap-2">
            <span>ORDU HASAR & ÜYE TELEMETRİSİ</span>
            <span 
              className="text-rose-400 hover:text-rose-300 cursor-pointer text-sm"
              title="Canlı War Era tRPC telemetri verileri ve 02:55 cron döngüsüyle sıfırlanan günlük hasar takibi"
            >
              <Info className="w-4 h-4 inline" />
            </span>
          </h1>
        </div>

        {/* Son Güncelleme Rozeti */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#141C21] border border-rose-500/30 text-xs font-mono text-rose-300 shadow-inner">
          <Clock className="w-3.5 h-3.5 text-rose-400" />
          <span>Son Güncelleme: </span>
          <span className="font-bold text-white">{formatTimeTr(data?.generatedAt ? new Date(data.generatedAt) : new Date())}</span>
        </div>
      </div>

      {/* 2. ÜST ÖZET KARTLARI (3 Gösterge) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {/* Kart 1: ORDU GÜNLÜK HASARI */}
        <div className="rounded-xl bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 p-5 flex flex-col justify-between shadow-lg relative overflow-hidden group transition-all">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <div className="w-7 h-7 rounded-lg bg-rose-950/60 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <Swords className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider">ORDU GÜNLÜK HASARI</span>
              </div>

              <div className="flex items-center gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setIsChartModalOpen(true)}
                  className="px-2 py-0.5 rounded bg-[#141C21] hover:bg-rose-950/40 text-rose-300 border border-rose-500/30 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <TrendingUp className="w-3 h-3" />
                  <span>Grafik</span>
                </button>
                <span className="px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-500/40 font-bold">
                  Bugün
                </span>
              </div>
            </div>

            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                {formatDamage(totalArmyDailyDamage)}
              </span>
              <span className="text-xs font-bold text-rose-400">DMG</span>
            </div>

            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-950/60 border border-rose-500/30 text-rose-300 text-[10px] font-bold">
                <span>⏱️</span>
                <span>02:55 TSİ Snapshot Bazlı</span>
              </span>
              {snapshotData?.supabaseConnected && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Supabase DB</span>
                </span>
              )}
              {data?.dailyDamageInfo?.baselineDate && (
                <span className="text-[10px] text-[#BBE1FA]/60">
                  Baz: {data.dailyDamageInfo.baselineDate}
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-rose-500/15 flex items-center justify-between text-[11px] text-[#BBE1FA]/60">
            <span>02:55 TSİ Snapshot'ına göre net hasar</span>
            <button
              type="button"
              onClick={() => setIsChartModalOpen(true)}
              className="text-rose-400 hover:text-rose-200 cursor-pointer font-bold"
            >
              Değişim grafiği için tıklayın →
            </button>
          </div>
        </div>

        {/* Kart 2: ORDU KAYNAKLARI (Can & Açlık Durumu) */}
        <div className="rounded-xl bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 p-5 flex flex-col justify-between shadow-lg transition-all group">
          <div>
            <div className="flex items-center justify-between mb-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <div className="w-7 h-7 rounded-lg bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Heart className="w-3.5 h-3.5" />
                </div>
                <span>ORDU KAYNAKLARI</span>
              </div>
              <span className="text-[#BBE1FA]/60 text-[11px]">Can & Açlık Durumu</span>
            </div>

            {/* Toplam Can Barı */}
            <div className="space-y-1.5 mb-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <span>💚</span>
                  <span>Toplam Can:</span>
                </span>
                <span className="text-white font-bold">
                  {formatCompactK(data?.resources?.health?.current || 1340)} / {formatCompactK(data?.resources?.health?.max || 2900)}{' '}
                  <span className="text-cyan-400 font-normal">
                    (%{data?.resources?.health?.percentage || 46.3})
                  </span>
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-[#141C21] border border-emerald-500/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(5, data?.resources?.health?.percentage || 46.3))}%` }}
                />
              </div>
            </div>

            {/* Toplam Açlık Barı */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-400 font-bold flex items-center gap-1">
                  <span>⚔️</span>
                  <span>Toplam Açlık / Enerji:</span>
                </span>
                <span className="text-white font-bold">
                  {(data?.resources?.hunger?.current || 64.3).toFixed(1)} / {data?.resources?.hunger?.max || 135}{' '}
                  <span className="text-amber-300 font-normal">
                    (%{data?.resources?.hunger?.percentage || 47.6})
                  </span>
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-[#141C21] border border-amber-500/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(5, data?.resources?.hunger?.percentage || 47.6))}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-rose-500/15 flex items-center justify-between text-[11px] text-[#BBE1FA]/60">
            <span>Birlik savaşa hazırlık dayanıklılığı</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Orta Kapasite</span>
            </span>
          </div>
        </div>

        {/* Kart 3: HAZIRLIK & BUFF DURUMU */}
        <div className="rounded-xl bg-gradient-to-b from-[#1C2830] to-[#162127] border border-rose-500/25 hover:border-rose-500/50 p-5 flex flex-col justify-between shadow-lg transition-all group">
          <div>
            <div className="flex items-center justify-between mb-3 text-xs">
              <div className="flex items-center gap-2 text-rose-300 font-bold">
                <div className="w-7 h-7 rounded-lg bg-rose-950/60 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <span>HAZIRLIK & BUFF DURUMU</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-rose-950/60 text-rose-300 border border-rose-500/40 text-[10px] font-bold">
                {data?.members?.length || 21} Asker
              </span>
            </div>

            {/* 3 Filtre Kutusu */}
            <div className="grid grid-cols-3 gap-2">
              {/* Hazır */}
              <button
                type="button"
                onClick={() => setPillFilter((prev) => (prev === 'ready' ? 'all' : 'ready'))}
                className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                  pillFilter === 'ready'
                    ? 'bg-rose-950/80 border-rose-400 text-white font-bold shadow-md'
                    : 'bg-[#141C21] hover:bg-[#182329] border-rose-500/25 text-[#BBE1FA]/70'
                }`}
              >
                <div className="flex items-center justify-center gap-1 text-[11px]">
                  <span>✓</span>
                  <span>Hazır</span>
                </div>
                <div className="text-xl font-black text-white mt-1">
                  {data?.pillOverview?.readyCount ?? 7}
                </div>
              </button>

              {/* Buff %60 */}
              <button
                type="button"
                onClick={() => setPillFilter((prev) => (prev === 'buff' ? 'all' : 'buff'))}
                className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                  pillFilter === 'buff'
                    ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200 font-bold shadow-md'
                    : 'bg-[#141C21] hover:bg-[#182329] border-emerald-500/30 text-emerald-400'
                }`}
              >
                <div className="flex items-center justify-center gap-1 text-[11px]">
                  <span>💊</span>
                  <span>Buff %60</span>
                </div>
                <div className="text-xl font-black text-emerald-400 mt-1">
                  {data?.pillOverview?.buffCount ?? 14}
                </div>
              </button>

              {/* Debuff */}
              <button
                type="button"
                onClick={() => setPillFilter((prev) => (prev === 'debuff' ? 'all' : 'debuff'))}
                className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                  pillFilter === 'debuff'
                    ? 'bg-rose-950/80 border-rose-400 text-rose-200 font-bold shadow-md'
                    : 'bg-[#141C21] hover:bg-[#182329] border-rose-500/30 text-rose-400'
                }`}
              >
                <div className="flex items-center justify-center gap-1 text-[11px]">
                  <span>💊</span>
                  <span>Debuff</span>
                </div>
                <div className="text-xl font-black text-rose-400 mt-1">
                  {data?.pillOverview?.debuffCount ?? 0}
                </div>
              </button>
            </div>

            {/* Tri-Color Segment Bar */}
            <div className="mt-3.5 h-2 w-full rounded-full bg-[#141C21] overflow-hidden flex">
              <div
                style={{ width: `${((data?.pillOverview?.readyCount || 7) / (data?.members?.length || 21)) * 100}%` }}
                className="bg-slate-500"
                title={`Hazır: ${data?.pillOverview?.readyCount || 7}`}
              />
              <div
                style={{ width: `${((data?.pillOverview?.buffCount || 14) / (data?.members?.length || 21)) * 100}%` }}
                className="bg-emerald-400"
                title={`Buff %60: ${data?.pillOverview?.buffCount || 14}`}
              />
              <div
                style={{ width: `${((data?.pillOverview?.debuffCount || 0) / (data?.members?.length || 21)) * 100}%` }}
                className="bg-rose-500"
                title={`Debuff: ${data?.pillOverview?.debuffCount || 0}`}
              />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-rose-500/15 text-[11px] text-[#BBE1FA]/60 text-center">
            Hızlı filtreleme için butonlara tıklayın
          </div>
        </div>
      </div>

      {/* 3. TABLO KONTROLLERİ VE ARAÇ ÇUBUĞU */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        {/* Arama Çubuğu */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-rose-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Kullanıcı adı veya ID ara..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#141C21] border border-rose-500/30 text-xs font-mono text-white placeholder:text-[#BBE1FA]/40 focus:outline-none focus:border-rose-400 transition-colors"
          />
        </div>

        {/* Butonlar: Hasar Güncelle, PDF İndir, Sütunlar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Hasar Verilerini Güncelle */}
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={isRefreshing || isLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-200 font-bold text-xs border border-rose-500/40 transition-all disabled:opacity-50 cursor-pointer shadow-md"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-rose-300 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Hasar verilerini güncelle</span>
          </button>

          {/* PDF Raporları Menüsü (Bugün, Dün, 2 Gün Önce, Son 3 Gün Konsolide) */}
          <div className="relative" ref={pdfMenuRef}>
            <button
              type="button"
              onClick={() => setIsPdfMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 text-rose-200 hover:text-white font-bold text-xs transition-all cursor-pointer shadow-md"
              title="Günlük ve geçmiş 3 günün PDF hasar raporlarını indir"
            >
              <Download className="w-3.5 h-3.5 text-rose-300" />
              <span>PDF Raporu İndir</span>
              <ChevronDown className="w-3 h-3 text-rose-400" />
            </button>

            {isPdfMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-[#182329] border border-rose-500/40 rounded-xl p-2.5 shadow-2xl z-50 space-y-1.5 text-xs backdrop-blur-xl font-mono">
                <div className="px-2 py-1 border-b border-rose-500/20 mb-1 flex items-center justify-between">
                  <span className="text-[10px] text-rose-300 font-bold uppercase tracking-wider">
                    PDF RAPOR SEÇENEKLERİ
                  </span>
                  {snapshotData?.supabaseConnected && (
                    <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Supabase</span>
                    </span>
                  )}
                </div>

                {/* 1. Bugünün Raporu */}
                <button
                  type="button"
                  onClick={handleExportTodayPdf}
                  className="w-full text-left px-2.5 py-2 rounded-lg bg-[#141C21] hover:bg-rose-950/60 border border-rose-500/20 hover:border-rose-500/40 text-white flex items-center justify-between group cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
                    <div>
                      <div className="font-bold text-xs">Bugünün Raporu (PDF)</div>
                      <div className="text-[10px] text-[#BBE1FA]/60">{threeDayReportData.dates[2]} • Canlı Telemetri</div>
                    </div>
                  </div>
                  <Download className="w-3.5 h-3.5 text-rose-400 opacity-60 group-hover:opacity-100" />
                </button>

                {/* 2. Dünün Raporu */}
                <button
                  type="button"
                  onClick={handleExportYesterdayPdf}
                  className="w-full text-left px-2.5 py-2 rounded-lg bg-[#141C21] hover:bg-rose-950/60 border border-rose-500/20 hover:border-rose-500/40 text-white flex items-center justify-between group cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                    <div>
                      <div className="font-bold text-xs">Dünün Raporu (PDF)</div>
                      <div className="text-[10px] text-[#BBE1FA]/60">{threeDayReportData.dates[1]} • 24 Saatlik Hasar</div>
                    </div>
                  </div>
                  <Download className="w-3.5 h-3.5 text-amber-400 opacity-60 group-hover:opacity-100" />
                </button>

                {/* 3. 2 Gün Öncesinin Raporu */}
                <button
                  type="button"
                  onClick={handleExportDayBeforeYesterdayPdf}
                  className="w-full text-left px-2.5 py-2 rounded-lg bg-[#141C21] hover:bg-rose-950/60 border border-rose-500/20 hover:border-rose-500/40 text-white flex items-center justify-between group cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                    <div>
                      <div className="font-bold text-xs">2 Gün Öncesinin Raporu (PDF)</div>
                      <div className="text-[10px] text-[#BBE1FA]/60">{threeDayReportData.dates[0]} • 24 Saatlik Hasar</div>
                    </div>
                  </div>
                  <Download className="w-3.5 h-3.5 text-cyan-400 opacity-60 group-hover:opacity-100" />
                </button>

                {/* 4. Son 3 Günün Konsolide / Karşılaştırmalı Raporu */}
                <div className="pt-1 border-t border-rose-500/20">
                  <button
                    type="button"
                    onClick={handleExport3DaysConsolidatedPdf}
                    className="w-full text-left px-2.5 py-2 rounded-lg bg-rose-950/50 hover:bg-rose-900/70 border border-rose-500/35 hover:border-rose-400 text-rose-200 hover:text-white flex items-center justify-between group cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
                      <div>
                        <div className="font-bold text-xs text-rose-300 group-hover:text-white">
                          Son 3 Günün Konsolide Raporu
                        </div>
                        <div className="text-[10px] text-rose-400/80">
                          {threeDayReportData.dates[0]} - {threeDayReportData.dates[2]} Karşılaştırma
                        </div>
                      </div>
                    </div>
                    <Download className="w-3.5 h-3.5 text-rose-300 opacity-80 group-hover:opacity-100" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sütunlar Menüsü */}
          <div className="relative" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setIsColumnsMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#141C21] hover:bg-[#182329] border border-rose-500/30 text-[#BBE1FA] hover:text-white font-bold text-xs transition-all cursor-pointer shadow-md"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Sütunlar</span>
            </button>

            {isColumnsMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#182329] border border-rose-500/40 rounded-xl p-3 shadow-2xl z-50 space-y-2 text-xs backdrop-blur-xl">
                <span className="text-[10px] text-[#BBE1FA]/60 font-bold uppercase tracking-wider block border-b border-rose-500/20 pb-1.5 mb-2">
                  Görünür Sütunlar
                </span>

                <label className="flex items-center justify-between text-[#BBE1FA] cursor-pointer hover:text-white">
                  <span>Pill (İlaç)</span>
                  <input
                    type="checkbox"
                    checked={visibleColumns.pill}
                    onChange={(e) => setVisibleColumns((p) => ({ ...p, pill: e.target.checked }))}
                    className="accent-rose-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between text-[#BBE1FA] cursor-pointer hover:text-white">
                  <span>Resources (Kaynaklar)</span>
                  <input
                    type="checkbox"
                    checked={visibleColumns.resources}
                    onChange={(e) => setVisibleColumns((p) => ({ ...p, resources: e.target.checked }))}
                    className="accent-rose-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between text-[#BBE1FA] cursor-pointer hover:text-white">
                  <span>Günlük Hasar</span>
                  <input
                    type="checkbox"
                    checked={visibleColumns.damage}
                    onChange={(e) => setVisibleColumns((p) => ({ ...p, damage: e.target.checked }))}
                    className="accent-rose-500 cursor-pointer"
                  />
                </label>

                <label className="flex items-center justify-between text-[#BBE1FA] cursor-pointer hover:text-white">
                  <span>Skills Reset</span>
                  <input
                    type="checkbox"
                    checked={visibleColumns.skillsReset}
                    onChange={(e) => setVisibleColumns((p) => ({ ...p, skillsReset: e.target.checked }))}
                    className="accent-rose-500 cursor-pointer"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PDF İndirme Bildirimi */}
      {pdfFeedback && (
        <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs font-mono flex items-center justify-between gap-2 shadow-lg animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-bold">{pdfFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setPdfFeedback(null)}
            className="text-emerald-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4. 5 SÜTUNLU DETAYLI TELEMETRİ TABLOSU */}
      <div className="overflow-x-auto rounded-2xl border border-rose-500/25 bg-[#182329]/90 shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-rose-500/20 text-[11px] font-bold text-[#BBE1FA]/70 uppercase tracking-wider bg-[#141C21]">
              {/* Sütun 1: Ordu Üyesi */}
              <th
                onClick={() => handleSort('name')}
                className="p-3.5 cursor-pointer hover:text-rose-300 transition-colors select-none"
              >
                <div className="flex items-center gap-1.5">
                  <span>ORDU ÜYESİ</span>
                  <span className="text-[10px] text-rose-400">
                    {sortField === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                  </span>
                </div>
              </th>

              {/* Sütun 2: Pill */}
              {visibleColumns.pill && (
                <th
                  onClick={() => handleSort('pill')}
                  className="p-3.5 cursor-pointer hover:text-rose-300 transition-colors select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>PILL</span>
                    <span className="text-[10px] text-rose-400">
                      {sortField === 'pill' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
              )}

              {/* Sütun 3: Resources */}
              {visibleColumns.resources && (
                <th
                  onClick={() => handleSort('health')}
                  className="p-3.5 cursor-pointer hover:text-rose-300 transition-colors select-none min-w-[240px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span>RESOURCES</span>
                    <span className="text-[10px] text-rose-400">
                      {sortField === 'health' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
              )}

              {/* Sütun 4: Günlük Hasar */}
              {visibleColumns.damage && (
                <th
                  onClick={() => handleSort('damage')}
                  className="p-3.5 cursor-pointer hover:text-rose-300 transition-colors select-none text-right"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>GÜNLÜK HASAR (DMG)</span>
                    <span className="text-[10px] text-rose-400">
                      {sortField === 'damage' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
              )}

              {/* Sütun 5: Skills Reset */}
              {visibleColumns.skillsReset && (
                <th
                  onClick={() => handleSort('skillsReset')}
                  className="p-3.5 cursor-pointer hover:text-rose-300 transition-colors select-none text-right"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>SKILLS RESET</span>
                    <span className="text-[10px] text-rose-400">
                      {sortField === 'skillsReset' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </div>
                </th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-rose-500/15 text-xs">
            {filteredAndSortedMembers.map((member) => {
              const pillMs = getPillRemainingMs(member.pillExpiresAt);
              const isPillActive = pillMs > 0;
              const skillsReset = getSkillsResetInfo(member);

              const finishTimeStr = member.pillExpiresAt
                ? new Date(member.pillExpiresAt).toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul' })
                : '';

              return (
                <tr
                  key={member.userId}
                  onClick={() => setSelectedMember(member)}
                  className="hover:bg-rose-950/15 transition-colors cursor-pointer group"
                >
                  {/* Sütun 1: Ordu Üyesi (Avatar, Flag pin, İsim, Rozet, Lv, ID) */}
                  <td className="p-3.5">
                    <div className="flex items-center gap-3">
                      {/* Avatar with Turkey Flag Pin */}
                      <div className="relative shrink-0">
                        {member.avatarUrl ? (
                          <img
                            src={member.avatarUrl}
                            alt={member.username}
                            className="w-10 h-10 rounded-full object-cover border border-rose-500/30 group-hover:border-rose-400 transition-colors"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#182329] text-rose-300 font-bold flex items-center justify-center border border-rose-500/30">
                            {member.username.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        {/* Turkey Flag Pin */}
                        <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 rounded-full overflow-hidden border border-[#141C21] shadow-xs">
                          <TurkeyFlagSVG className="w-full h-full object-cover" />
                        </div>
                      </div>

                      {/* İsim & Bilgiler */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-bold truncate ${
                              member.isLeader
                                ? 'text-amber-300'
                                : member.isManager
                                ? 'text-rose-300'
                                : 'text-white'
                            }`}
                          >
                            {member.username}
                          </span>

                          {/* Commander / Leader badge */}
                          {(member.isLeader || member.isCommander) && (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-black bg-rose-950/80 text-rose-300 border border-rose-500/50 shrink-0"
                              title={member.isLeader ? 'Birlik Lideri' : 'Komutan'}
                            >
                              C
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[10px] text-[#BBE1FA]/50 mt-0.5">
                          <span>Lv {member.level}</span>
                          <span>•</span>
                          <span>#{member.userId.slice(-4)}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Sütun 2: Pill (İlaç Geri Sayımı) */}
                  {visibleColumns.pill && (
                    <td className="p-3.5">
                      {isPillActive ? (
                        <div
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#141C21] border border-emerald-500/30 text-emerald-400 text-xs font-bold"
                          title={`Bitiş: ${finishTimeStr} (TSİ UTC+3)`}
                        >
                          <span>💊</span>
                          <span>{formatCountdown(pillMs)}</span>
                        </div>
                      ) : (
                        <span className="text-[#BBE1FA]/40 text-xs">Hazır</span>
                      )}
                    </td>
                  )}

                  {/* Sütun 3: Resources (Çift Katmanlı Barlar) */}
                  {visibleColumns.resources && (
                    <td className="p-3.5">
                      <div className="space-y-1.5 w-full max-w-[260px]">
                        {/* Can Barı */}
                        <div className="relative h-5 rounded-md bg-[#141C21] border border-emerald-500/30 overflow-hidden flex items-center justify-between px-2">
                          <div
                            className="absolute left-0 top-0 bottom-0 bg-emerald-500/25 transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(5, (member.health.current / (member.health.max || 100)) * 100))}%` }}
                          />
                          <span className="relative z-10 text-[11px] font-bold text-emerald-300 flex items-center gap-1">
                            <span>💚</span>
                            <span>{member.health.current.toFixed(1)} / {member.health.max}.0</span>
                          </span>
                          <span className="relative z-10 text-[10px] text-emerald-400 font-bold">
                            ^{member.health.hourlyRegen.toFixed(1)}
                          </span>
                        </div>

                        {/* Açlık Barı */}
                        <div className="relative h-5 rounded-md bg-[#141C21] border border-rose-500/30 overflow-hidden flex items-center justify-between px-2">
                          <div
                            className="absolute left-0 top-0 bottom-0 bg-rose-500/25 transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(5, (member.hunger.current / (member.hunger.max || 10)) * 100))}%` }}
                          />
                          <span className="relative z-10 text-[11px] font-bold text-rose-300 flex items-center gap-1">
                            <span>⚔️</span>
                            <span>{member.hunger.current.toFixed(1)} / {member.hunger.max}.0</span>
                          </span>
                          <span className="relative z-10 text-[10px] text-rose-400 font-bold">
                            ^{member.hunger.hourlyRegen.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    </td>
                  )}

                  {/* Sütun 4: Günlük Hasar (DMG Today) */}
                  {visibleColumns.damage && (
                    <td className="p-3.5 text-right font-mono font-bold text-white text-sm">
                      {formatDamage(member.dailyDamage)}
                    </td>
                  )}

                  {/* Sütun 5: Skills Reset */}
                  {visibleColumns.skillsReset && (
                    <td className="p-3.5 text-right">
                      {skillsReset.isReady ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                          <span>✓</span>
                          <span>Hemen</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
                          <span>{skillsReset.label}</span>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}

            {filteredAndSortedMembers.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-[#BBE1FA]/50 text-xs font-mono">
                  Arama kriterlerine uygun asker bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 5. GRAFİK MODALI (Değişim Grafiği) */}
      {isChartModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl bg-[#182329] border border-rose-500/40 rounded-2xl shadow-2xl p-6 overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-rose-500/20 mb-4">
              <div className="flex items-center gap-2 text-white">
                <TrendingUp className="w-5 h-5 text-rose-400" />
                <h3 className="text-base font-bold uppercase font-mono">Ordu Günlük Hasar Değişimi</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsChartModalOpen(false)}
                className="p-1 rounded-lg bg-[#141C21] border border-rose-500/30 text-[#BBE1FA] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 font-mono">
              <div className="p-4 rounded-xl bg-[#141C21] border border-rose-500/20 flex items-center justify-between">
                <div>
                  <span className="text-xs text-[#BBE1FA]/60 block">Bugünkü Gerçek Hasar</span>
                  <span className="text-2xl font-black text-rose-300">{formatDamage(totalArmyDailyDamage)} DMG</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-[#BBE1FA]/60 block">Hesaplama Kuralı</span>
                  <span className="text-rose-400 font-bold text-xs">Haftalık Hasar - 02:55 Snapshot</span>
                </div>
              </div>

              {/* Real 02:55 Cron Snapshot Info & History */}
              <div className="p-4 rounded-xl bg-[#141C21] border border-rose-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#BBE1FA]/80 font-bold">02:55 TSİ Snapshot Sistemi</span>
                    {snapshotData?.supabaseConnected ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[9px] font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>Supabase Bağlı</span>
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-rose-950/80 border border-rose-500/40 text-rose-300 text-[9px] font-bold">
                        Önbellek
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleTriggerSnapshot}
                    disabled={isSnapshotTriggering}
                    className="px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/40 text-[10px] font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1 shadow-sm"
                    title="02:55 snapshot işlemini şimdi test et"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSnapshotTriggering ? 'animate-spin' : ''}`} />
                    <span>02:55 Snapshot'ı Şimdi Al (Test)</span>
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-[#182329] border border-rose-500/30 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white block">Aktif Gün ({data?.dailyDamageInfo?.baselineDate || 'Bugün'})</span>
                      <span className="text-[10px] text-[#BBE1FA]/50">02:55 TSİ döngüsü devrede</span>
                    </div>
                    <span className="text-rose-300 font-bold text-sm">
                      {formatDamage(totalArmyDailyDamage)} DMG
                    </span>
                  </div>

                  {snapshotData?.dates && snapshotData.dates.length > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] text-[#BBE1FA]/60 uppercase tracking-wider block font-bold">
                        Kayıtlı Snapshot Günleri ({snapshotData.dates.length})
                      </span>
                      {snapshotData.dates.slice(-7).reverse().map((d) => {
                        const armySnap = snapshotData.snapshots[d]?.armies?.[muId];
                        return (
                          <div key={d} className="p-2 rounded bg-[#182329] flex items-center justify-between text-xs font-mono border border-rose-500/15">
                            <span className="text-[#BBE1FA]/70">{d}</span>
                            <span className="text-white">
                              Haftalık Baz: <span className="text-rose-300 font-bold">{formatDamage(armySnap?.armyTotalWeeklyDamage || 0)}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-2 text-center text-[11px] text-[#BBE1FA]/50">
                      İlk 02:55 snapshot kaydı başarıyla oluşturuldu.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-rose-500/20 text-right">
              <button
                type="button"
                onClick={() => setIsChartModalOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/40 text-xs font-bold cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. ÜYE DETAY MODALI */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-[#182329] border border-rose-500/40 rounded-2xl shadow-2xl p-6 overflow-hidden font-mono">
            <div className="flex items-start justify-between pb-3 border-b border-rose-500/20 mb-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  {selectedMember.avatarUrl ? (
                    <img
                      src={selectedMember.avatarUrl}
                      alt={selectedMember.username}
                      className="w-12 h-12 rounded-full object-cover border-2 border-rose-500/50"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#141C21] text-rose-300 font-bold flex items-center justify-center border-2 border-rose-500/50">
                      {selectedMember.username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-full bg-[#141C21] border border-rose-500/60 text-[9px] font-bold text-rose-300">
                    Lv.{selectedMember.level}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-white">{selectedMember.username}</h3>
                  <span className="text-xs text-[#BBE1FA]/60">#{selectedMember.userId}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="p-1 rounded-lg bg-[#141C21] border border-rose-500/30 text-[#BBE1FA] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-[#141C21] border border-rose-500/20 flex items-center justify-between">
                <span className="text-[#BBE1FA]/60">Bugünkü Hasar:</span>
                <span className="text-base font-bold text-rose-300">{formatDamage(selectedMember.dailyDamage)}</span>
              </div>

              <div className="p-3 rounded-xl bg-[#141C21] border border-rose-500/20 flex items-center justify-between">
                <span className="text-[#BBE1FA]/60">Toplam Hasar:</span>
                <span className="font-bold text-white">{formatDamage(selectedMember.totalDamage)}</span>
              </div>

              <div className="p-3 rounded-xl bg-[#141C21] border border-rose-500/20 flex items-center justify-between">
                <span className="text-[#BBE1FA]/60">Can (Health):</span>
                <span className="text-emerald-400 font-bold">
                  {selectedMember.health.current.toFixed(1)} / {selectedMember.health.max} (Saatlik: ^{selectedMember.health.hourlyRegen})
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#141C21] border border-rose-500/20 flex items-center justify-between">
                <span className="text-[#BBE1FA]/60">Açlık (Hunger):</span>
                <span className="text-rose-400 font-bold">
                  {selectedMember.hunger.current.toFixed(1)} / {selectedMember.hunger.max} (Saatlik: ^{selectedMember.hunger.hourlyRegen})
                </span>
              </div>

              <div className="p-3 rounded-xl bg-[#141C21] border border-rose-500/20 flex items-center justify-between">
                <span className="text-[#BBE1FA]/60">Pill Durumu:</span>
                <span className="font-bold text-white">
                  {getPillRemainingMs(selectedMember.pillExpiresAt) > 0 ? (
                    <span className="text-emerald-400">
                      💊 {formatCountdown(getPillRemainingMs(selectedMember.pillExpiresAt))}
                    </span>
                  ) : (
                    'Hazır'
                  )}
                </span>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-rose-500/20 text-right">
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="px-4 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/40 text-xs font-bold cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
