/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Header } from './components/Header';
const MetricsCards = React.lazy(() => import('./components/MetricsCards').then((module) => ({ default: module.MetricsCards })));
const PlayerTable = React.lazy(() => import('./components/PlayerTable').then((module) => ({ default: module.PlayerTable })));
const ArmyStatsTable = React.lazy(() => import('./components/ArmyStatsTable').then((module) => ({ default: module.ArmyStatsTable })));
const CountryStatsPanel = React.lazy(() => import('./components/CountryStatsPanel').then((module) => ({ default: module.CountryStatsPanel })));
const ApiKeySection = React.lazy(() => import('./components/ApiKeySection').then((module) => ({ default: module.ApiKeySection })));
const WorkInProgressPanel = React.lazy(() => import('./components/WorkInProgressPanel').then((module) => ({ default: module.WorkInProgressPanel })));
const MilitaryOverviewSection = React.lazy(() => import('./components/MilitaryOverviewSection').then((module) => ({ default: module.MilitaryOverviewSection })));
const MilitaryDetailsSection = React.lazy(() => import('./components/MilitaryDetailsSection').then((module) => ({ default: module.MilitaryDetailsSection })));
const DailyDamageTelemetrySection = React.lazy(() => import('./components/DailyDamageTelemetrySection').then((module) => ({ default: module.DailyDamageTelemetrySection })));
const ManagementArmyTrackingSection = React.lazy(() => import('./components/ManagementArmyTrackingSection').then((module) => ({ default: module.ManagementArmyTrackingSection })));
const ManagementDonationTrackingSection = React.lazy(() => import('./components/ManagementDonationTrackingSection').then((module) => ({ default: module.ManagementDonationTrackingSection })));
const ManagementTreasurySection = React.lazy(() => import('./components/ManagementTreasurySection').then((module) => ({ default: module.ManagementTreasurySection })));
const ManagementDailyDashboardSection = React.lazy(() => import('./components/ManagementIntelligenceSections').then((module) => ({ default: module.ManagementDailyDashboardSection })));
const ManagementWarRoomSection = React.lazy(() => import('./components/ManagementIntelligenceSections').then((module) => ({ default: module.ManagementWarRoomSection })));
const ManagementCitizensSection = React.lazy(() => import('./components/ManagementIntelligenceSections').then((module) => ({ default: module.ManagementCitizensSection })));
const ManagementCountryTrackerSection = React.lazy(() => import('./components/ManagementIntelligenceSections').then((module) => ({ default: module.ManagementCountryTrackerSection })));
const ManagementTaxSimulationSection = React.lazy(() => import('./components/ManagementIntelligenceSections').then((module) => ({ default: module.ManagementTaxSimulationSection })));
const LevelCalculatorSection = React.lazy(() => import('./components/LevelCalculatorSection').then((module) => ({ default: module.LevelCalculatorSection })));
const PrestigeDamageOptimizerSection = React.lazy(() => import('./components/PrestigeDamageOptimizerSection').then((module) => ({ default: module.PrestigeDamageOptimizerSection })));
const MarketPricesSection = React.lazy(() => import('./components/MarketPricesSection').then((module) => ({ default: module.MarketPricesSection })));
import { MilitaryUnitData, PlayerStats, ApiResponse } from './types';
import { 
  fetchMilitaryUnitData, 
  getCachedMilitaryUnitData, 
  getCookie, 
  setCookie, 
  DEFAULT_MU_ID 
} from './services/wareraApi';
import { AlertCircle } from 'lucide-react';

export type ActiveTab = 
  | 'donations' 
  | 'armyStats' 
  | 'countryStats' 
  | 'combatArmyInfo' 
  | 'combatDetails' 
  | 'combatDamage'
  | 'mgmtArmies'
  | 'mgmtDonations'
  | 'mgmtUnit'
  | 'mgmtOrders'
  | 'mgmtTreasury'
  | 'mgmtDiplomacy'
  | 'mgmtDashboard'
  | 'mgmtWarRoom'
  | 'mgmtCitizens'
  | 'mgmtCountryTracker'
  | 'mgmtTax'
  | 'levelCalculator'
  | 'prestigeOptimizer'
  | 'marketPrices';


export const TAB_TO_SLUG: Record<ActiveTab, string> = {
  donations: 'bagis-takibi',
  armyStats: 'ordu-istatistikleri',
  countryStats: 'ulke-istatistikleri',
  combatArmyInfo: 'ordu-bilgisi',
  combatDetails: 'detayli-bilgi',
  combatDamage: 'hasar',
  mgmtArmies: 'ordu-takibi',
  mgmtDonations: 'yonetim-bagis',
  mgmtUnit: 'birlik-yonetimi',
  mgmtOrders: 'gorev-ve-emirler',
  mgmtTreasury: 'kasa-lojistik',
  mgmtDiplomacy: 'ittifak-diplomasi',
  mgmtDashboard: 'yonetim-ozeti',
  mgmtWarRoom: 'savas-merkezi',
  mgmtCitizens: 'vatandaslar-ve-hukumet',
  mgmtCountryTracker: 'ulke-takibi',
  mgmtTax: 'vergi-simulatoru',
  levelCalculator: 'seviye-hesaplayici',
  prestigeOptimizer: 'prestij-hasar-optimizasyonu',
  marketPrices: 'market-fiyatlari',
};

const TAB_TITLES: Record<ActiveTab, string> = {
  donations: 'Nizam-ı Türkiye - Bağış Takip Paneli',
  armyStats: 'Nizam-ı Türkiye - Ordu İstatistikleri',
  countryStats: 'Nizam-ı Türkiye - Ülke İstatistikleri',
  combatArmyInfo: 'Nizam-ı Türkiye - Ordu Bilgisi (Savaş Modu)',
  combatDetails: 'Nizam-ı Türkiye - Detaylı Bilgi (Savaş Modu)',
  combatDamage: 'Nizam-ı Türkiye - Hasar Telemetrisi (Savaş Modu)',
  mgmtArmies: 'Nizam-ı Türkiye - Ordu Takibi (Yönetim Modu)',
  mgmtDonations: 'Nizam-ı Türkiye - Bağış Takibi (Yönetim Modu)',
  mgmtUnit: 'Nizam-ı Türkiye - Birlik Yönetimi (Yönetim Modu)',
  mgmtOrders: 'Nizam-ı Türkiye - Görev & Emirler (Yönetim Modu)',
  mgmtTreasury: 'Nizam-ı Türkiye - Kasa & Lojistik (Yönetim Modu)',
  mgmtDiplomacy: 'Nizam-ı Türkiye - İttifak & Diplomasi (Yönetim Modu)',
  mgmtDashboard: 'Nizam-ı Türkiye - Günlük Yönetim Özeti',
  mgmtWarRoom: 'Nizam-ı Türkiye - Ülke Savaş Merkezi',
  mgmtCitizens: 'Nizam-ı Türkiye - Vatandaşlar & Hükümet',
  mgmtCountryTracker: 'Nizam-ı Türkiye - Ülke Takibi & Karşılaştırma',
  mgmtTax: 'Nizam-ı Türkiye - Vergi Simülatörü & Gelir Tahmini',
  levelCalculator: 'Nizam-ı Türkiye - Seviye Hesaplayıcı',
  prestigeOptimizer: 'Nizam-ı Türkiye - Prestij - Hasar Optimizasyonu',
  marketPrices: 'Nizam-ı Türkiye - Market Fiyatları',
};

export function getRouteFromUrl(): { tab: ActiveTab; muId: string | null } {
  if (typeof window === 'undefined') return { tab: 'donations', muId: null };

  const path = window.location.pathname.toLowerCase().replace(/^\/+|\/+$/g, '');
  const segments = path.split('/').filter(Boolean);

  let tabSlug = segments[0] || '';
  let urlMuId: string | null = null;

  // 1. Direct hex MU ID in first segment.
  if (/^[a-f0-9]{24}$/.test(tabSlug)) {
    urlMuId = tabSlug;
    tabSlug = 'bagis-takibi';
  } else if (segments[1] && /^[a-f0-9]{24}$/.test(segments[1])) {
    // 2. MU ID in second segment.
    urlMuId = segments[1];
  }

  // 3. Search query params fallback: "?muId=..."
  const searchParams = new URLSearchParams(window.location.search);
  const queryMuId = searchParams.get('muId');
  if (!urlMuId && queryMuId && /^[a-f0-9]{24}$/.test(queryMuId.toLowerCase())) {
    urlMuId = queryMuId.toLowerCase();
  }

  // 4. Hash fallback.
  const hash = window.location.hash.toLowerCase().replace(/^#\/?/, '');
  const hashSegments = hash.split('/').filter(Boolean);
  if (!tabSlug && hashSegments[0]) {
    tabSlug = hashSegments[0];
    if (hashSegments[1] && /^[a-f0-9]{24}$/.test(hashSegments[1])) {
      urlMuId = hashSegments[1];
    }
  }

  // Map slug to ActiveTab
  let tab: ActiveTab = 'donations';

  if (tabSlug === 'ordu-takibi' || tabSlug === 'ordu-takip' || tabSlug === 'yonetim-ordu-takibi') {
    tab = 'mgmtArmies';
  } else if (tabSlug === 'yonetim-bagis' || tabSlug === 'bagis-hedef' || tabSlug === 'bagis-takibi-yonetim' || tabSlug === 'yonetim-bagis-takibi') {
    tab = 'mgmtDonations';
  } else if (tabSlug === 'birlik-yonetimi' || tabSlug === 'birlik' || tabSlug === 'unit-management' || tabSlug === 'yonetim') {
    tab = 'mgmtArmies';
  } else if (tabSlug === 'gorev-ve-emirler' || tabSlug === 'emirler' || tabSlug === 'orders' || tabSlug === 'gorev') {
    tab = 'mgmtOrders';
  } else if (tabSlug === 'kasa-lojistik' || tabSlug === 'kasa' || tabSlug === 'treasury' || tabSlug === 'lojistik') {
    tab = 'mgmtTreasury';
  } else if (tabSlug === 'ittifak-diplomasi' || tabSlug === 'diplomasi' || tabSlug === 'diplomacy' || tabSlug === 'ittifak') {
    tab = 'mgmtDiplomacy';
  } else if (tabSlug === 'yonetim-ozeti' || tabSlug === 'gunluk-yonetim-ozeti' || tabSlug === 'daily-management') {
    tab = 'mgmtDashboard';
  } else if (tabSlug === 'savas-merkezi' || tabSlug === 'ulke-savas-merkezi' || tabSlug === 'war-room') {
    tab = 'mgmtWarRoom';
  } else if (tabSlug === 'vatandaslar-ve-hukumet' || tabSlug === 'vatandaslar' || tabSlug === 'citizens') {
    tab = 'mgmtCitizens';
  } else if (tabSlug === 'ulke-takibi' || tabSlug === 'ulke-karsilastirma' || tabSlug === 'country-tracker') {
    tab = 'mgmtCountryTracker';
  } else if (tabSlug === 'vergi-simulatoru' || tabSlug === 'gelir-tahmini' || tabSlug === 'tax-simulator') {
    tab = 'mgmtTax';
  } else if (tabSlug === 'ordu-bilgisi' || tabSlug === 'ordubilgisi' || tabSlug === 'army-info') {
    tab = 'combatArmyInfo';
  } else if (tabSlug === 'detayli-bilgi' || tabSlug === 'detaylibilgi' || tabSlug === 'detailed-info' || tabSlug === 'detay') {
    tab = 'combatDetails';
  } else if (tabSlug === 'hasar' || tabSlug === 'damage' || tabSlug === 'hasar-takibi' || tabSlug === 'hasar-takip') {
    tab = 'combatDamage';
  } else if (
    tabSlug === 'seviye-hesaplayici' ||
    tabSlug === 'level-calculator' ||
    tabSlug === 'seviye-hesaplama'
  ) {
    tab = 'levelCalculator';
  } else if (tabSlug === 'prestij-hasar-optimizasyonu' || tabSlug === 'prestige-damage-optimizer') {
    tab = 'prestigeOptimizer';
  } else if (tabSlug === 'market-fiyatlari' || tabSlug === 'market-prices') {
    tab = 'marketPrices';
  } else if (
    tabSlug === 'ordu-istatistikleri' ||
    tabSlug === 'ordu' ||
    tabSlug === 'army-stats' ||
    tabSlug === 'armystats' ||
    tabSlug === 'army'
  ) {
    tab = 'armyStats';
  } else if (
    tabSlug === 'ulke-istatistikleri' ||
    tabSlug === 'ulke' ||
    tabSlug === 'country-stats' ||
    tabSlug === 'countrystats' ||
    tabSlug === 'country'
  ) {
    tab = 'countryStats';
  } else if (
    tabSlug === 'bagis-takibi' ||
    tabSlug === 'bagis-takip' ||
    tabSlug === 'bagis' ||
    tabSlug === 'donations' ||
    tabSlug === 'donation'
  ) {
    tab = 'donations';
  }

  return { tab, muId: urlMuId };
}

export function getTabFromUrl(): ActiveTab {
  return getRouteFromUrl().tab;
}

export default function App() {
  const initialRoute = useMemo(() => getRouteFromUrl(), []);
  const initialTargetMu = initialRoute.muId || getCookie('warera_last_mu') || DEFAULT_MU_ID;

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => initialRoute.tab);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 768,
  );
  const [muId, setMuId] = useState<string>(() => initialTargetMu);

  // Read initial cached state instantly on mount (0ms instant hydration - zero flicker/reset on refresh)
  const [muData, setMuData] = useState<MilitaryUnitData | null>(() => {
    const cached = getCachedMilitaryUnitData(initialTargetMu);
    return cached?.militaryUnit || null;
  });

  const [players, setPlayers] = useState<PlayerStats[]>(() => {
    const cached = getCachedMilitaryUnitData(initialTargetMu);
    return cached?.players || [];
  });

  const [aggregated, setAggregated] = useState<ApiResponse['aggregated']>(() => {
    const cached = getCachedMilitaryUnitData(initialTargetMu);
    return (
      cached?.aggregated || {
        totalDonations: 0,
        totalContributors: 0,
        averageDonation: 0,
        topDonor: null,
      }
    );
  });

  // Only show skeleton if we have literally 0 cached players
  const [isLoading, setIsLoading] = useState(() => {
    const cached = getCachedMilitaryUnitData(initialTargetMu);
    return !cached || !cached.players || cached.players.length === 0;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(() => {
    const cached = getCachedMilitaryUnitData(initialTargetMu);
    return cached?.timestamp || null;
  });
  const [isLiveDonations, setIsLiveDonations] = useState(() => {
    const cached = getCachedMilitaryUnitData(initialTargetMu);
    return Boolean(cached?.isLiveDonations);
  });
  const [hasApiToken, setHasApiToken] = useState(() => {
    const cached = getCachedMilitaryUnitData(initialTargetMu);
    return Boolean(cached?.hasApiToken);
  });
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Dark mode initialized from localStorage or prefers-color-scheme
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('warera_theme');
      if (savedTheme) {
        return savedTheme === 'dark';
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Switch tab and synchronize browser URL with MU ID without page reload
  const handleTabChange = useCallback((newTab: ActiveTab) => {
    setActiveTab(newTab);
    const slug = TAB_TO_SLUG[newTab];
    const hasMuPath = !(['countryStats', 'levelCalculator', 'prestigeOptimizer', 'marketPrices', 'mgmtDashboard', 'mgmtWarRoom', 'mgmtCitizens', 'mgmtCountryTracker', 'mgmtTax'] as ActiveTab[]).includes(newTab);
    const newPath = hasMuPath ? `/${slug}/${muId}${window.location.search}` : `/${slug}${window.location.search}`;
    const expectedPathname = hasMuPath ? `/${slug}/${muId}` : `/${slug}`;
    if (window.location.pathname !== expectedPathname) {
      window.history.pushState({ tab: newTab, muId }, '', newPath);
    }
    if (TAB_TITLES[newTab]) {
      document.title = TAB_TITLES[newTab];
    }
  }, [muId]);

  // Listen for browser Back/Forward (popstate) navigation & sync URL with MU ID
  useEffect(() => {
    const onPopState = () => {
      const route = getRouteFromUrl();
      setActiveTab(route.tab);
      if (route.muId && route.muId !== muId) {
        setMuId(route.muId);
        setCookie('warera_last_mu', route.muId, 365);
      }
      if (TAB_TITLES[route.tab]) {
        document.title = TAB_TITLES[route.tab];
      }
    };

    window.addEventListener('popstate', onPopState);

    // Initial page title sync
    const route = getRouteFromUrl();
    if (TAB_TITLES[route.tab]) {
      document.title = TAB_TITLES[route.tab];
    }

    // If loaded on root "/" or on slug without MU ID, gracefully update URL to include the MU ID
    const currentPath = window.location.pathname.replace(/^\/+|\/+$/g, '');
    const currentSlug = TAB_TO_SLUG[route.tab];
    const noMuTabs: ActiveTab[] = ['countryStats', 'levelCalculator', 'prestigeOptimizer', 'marketPrices', 'mgmtDashboard', 'mgmtWarRoom', 'mgmtCitizens', 'mgmtCountryTracker', 'mgmtTax'];
    const targetExpectedPath = noMuTabs.includes(route.tab) ? `/${currentSlug}` : `/${currentSlug}/${muId}`;
    if (currentPath === '' || currentPath === currentSlug) {
      window.history.replaceState({ tab: route.tab, muId }, '', `${targetExpectedPath}${window.location.search}`);
    }

    return () => window.removeEventListener('popstate', onPopState);
  }, [muId]);

  // Sync dark mode class on html tag
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('warera_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('warera_theme', 'light');
    }
  }, [isDarkMode]);

  // Switch MU and instantly swap to cached state if available + sync URL
  const handleMuIdChange = useCallback((newId: string) => {
    setMuId(newId);
    setCookie('warera_last_mu', newId, 365);

    // Update browser URL path with the new MU ID
    const slug = TAB_TO_SLUG[activeTab];
    const noMuTabs: ActiveTab[] = ['countryStats', 'levelCalculator', 'prestigeOptimizer', 'marketPrices', 'mgmtDashboard', 'mgmtWarRoom', 'mgmtCitizens', 'mgmtCountryTracker', 'mgmtTax'];
    const newPath = noMuTabs.includes(activeTab) ? `/${slug}${window.location.search}` : `/${slug}/${newId}${window.location.search}`;
    const expectedPathname = noMuTabs.includes(activeTab) ? `/${slug}` : `/${slug}/${newId}`;
    if (window.location.pathname !== expectedPathname) {
      window.history.pushState({ tab: activeTab, muId: newId }, '', newPath);
    }

    const cached = getCachedMilitaryUnitData(newId);
    if (cached && cached.players?.length > 0) {
      setMuData(cached.militaryUnit);
      setPlayers(cached.players);
      setAggregated(cached.aggregated);
      setIsLiveDonations(Boolean(cached.isLiveDonations));
      setHasApiToken(Boolean(cached.hasApiToken));
      setLastUpdated(cached.timestamp || Date.now());
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
  }, [activeTab]);

  // Fetch MU Data with smooth background revalidation
  const fetchData = useCallback(
    async (forceRefresh = false) => {
      // If players are already loaded, do a smooth background refresh without blanking the table
      if (forceRefresh || players.length === 0) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);
      try {
        const data = await fetchMilitaryUnitData(muId, forceRefresh);
        if (data && data.militaryUnit) {
          setMuData(data.militaryUnit);
          setPlayers(data.players || []);
          setAggregated(
            data.aggregated || {
              totalDonations: 0,
              totalContributors: 0,
              averageDonation: 0,
              topDonor: null,
            }
          );
          setIsLiveDonations(Boolean(data.isLiveDonations));
          setHasApiToken(Boolean(data.hasApiToken));
          setLastUpdated(data.timestamp || Date.now());
        }
      } catch (err: any) {
        console.warn('Non-blocking data sync notice:', err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [muId, players.length]
  );

  // Initial load
  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  // Real-time polling interval (every 30 seconds when autoRefresh is on)
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(() => {
        fetchData(false);
      }, 30000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, fetchData]);

  // Active army & factory summary metrics for top cards
  const armyMetrics = useMemo(() => {
    let activePlayers = 0;
    let totalActiveFactories = 0;
    let totalAllFactories = 0;
    let totalActiveEnginePower = 0;
    let totalWealth = 0;

    players.forEach((p) => {
      const isAct = p.isActive ?? Boolean(
        p.lastActive && Date.now() - new Date(p.lastActive).getTime() <= 3 * 24 * 3600 * 1000
      );
      if (isAct) activePlayers++;

      const activeFCount = p.factoryCount ?? p.activeFactoryCount ?? (p.factories?.length || 0);
      const allFCount = p.totalOwnedFactories ?? (p.factories?.length || activeFCount);

      totalActiveFactories += activeFCount;
      totalAllFactories += allFCount;
      totalActiveEnginePower += p.totalAutomatedLevel || 0;
      totalWealth += p.wealth || 0;
    });

    return {
      activePlayers,
      totalActiveFactories,
      totalAllFactories,
      totalActiveEnginePower,
      totalWealth,
    };
  }, [players]);

  return (
    <div className="min-h-screen bg-[#141C21] text-white flex font-sans relative selection:bg-[#3282B8] selection:text-white">
      {/* Ambient background glow matching the color scheme */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#0F4C75]/20 via-transparent to-transparent pointer-events-none" />

      <Header
        activeTab={activeTab}
        onTabChange={handleTabChange}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((open) => !open)}
      />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
      {/* Main Container */}
      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto px-3 pt-16 pb-5 sm:px-6 sm:pb-6 lg:px-8 relative z-10 md:pt-6">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-3 sm:p-4 rounded-xl bg-[#182329] border border-[#3282B8]/40 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm shadow-xl">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-[#3282B8] shrink-0" />
              <span className="text-white font-medium">{error}</span>
            </div>
            <button
              onClick={() => fetchData(true)}
              className="px-3 py-1 rounded-lg bg-[#0F4C75] hover:bg-[#3282B8] text-white font-semibold text-xs transition-colors shrink-0 cursor-pointer border border-[#3282B8]/40"
            >
              Yeniden Dene
            </button>
          </div>
        )}

        <React.Suspense fallback={<div className="rounded-xl border border-[#3282B8]/20 bg-[#182329] p-6 text-sm text-[#BBE1FA]/70">Panel yükleniyor...</div>}>
        {/* Main Content Area */}
        {activeTab === 'levelCalculator' ? (
          <LevelCalculatorSection />
        ) : activeTab === 'prestigeOptimizer' ? (
          <PrestigeDamageOptimizerSection />
        ) : activeTab === 'marketPrices' ? (
          <MarketPricesSection />
        ) : activeTab === 'mgmtArmies' ? (
          <ManagementArmyTrackingSection onSelectArmy={handleMuIdChange} onNavigateTab={handleTabChange} />
        ) : activeTab === 'mgmtDonations' ? (
          <ManagementDonationTrackingSection currentMuId={muId} onSelectArmy={handleMuIdChange} />
        ) : activeTab === 'mgmtTreasury' ? (
          <ManagementTreasurySection />
        ) : activeTab === 'mgmtDashboard' ? (
          <ManagementDailyDashboardSection />
        ) : activeTab === 'mgmtWarRoom' ? (
          <ManagementWarRoomSection />
        ) : activeTab === 'mgmtCitizens' ? (
          <ManagementCitizensSection />
        ) : activeTab === 'mgmtCountryTracker' ? (
          <ManagementCountryTrackerSection />
        ) : activeTab === 'mgmtTax' ? (
          <ManagementTaxSimulationSection />
        ) : activeTab === 'combatArmyInfo' ? (
          <MilitaryOverviewSection muId={muId} onMuIdChange={handleMuIdChange} onNavigateTab={handleTabChange} />
        ) : activeTab === 'combatDetails' ? (
          <MilitaryDetailsSection muId={muId} onMuIdChange={handleMuIdChange} onNavigateTab={handleTabChange} />
        ) : activeTab === 'combatDamage' ? (
          <DailyDamageTelemetrySection muId={muId} onMuIdChange={handleMuIdChange} onNavigateTab={handleTabChange} />
        ) : activeTab === 'mgmtUnit' || activeTab === 'mgmtOrders' || activeTab === 'mgmtDiplomacy' ? (
          <WorkInProgressPanel activeTab={activeTab} onSwitchToEconomy={() => handleTabChange('donations')} />
        ) : (
          <>
            {/* Top 4-Column Equal Cards (Army Selector, Active Soldiers, Active Factories, Active Engine Power) - shown in army/donation tabs */}
            {activeTab !== 'countryStats' && (
              <MetricsCards
                totalMembers={players.length}
                activePlayers={armyMetrics.activePlayers}
                totalActiveFactories={armyMetrics.totalActiveFactories}
                totalAllFactories={armyMetrics.totalAllFactories}
                totalActiveEnginePower={armyMetrics.totalActiveEnginePower}
                totalWealth={armyMetrics.totalWealth}
                showWealthMetrics={activeTab === 'armyStats'}
                muData={muData}
                currentMuId={muId}
                onMuIdChange={handleMuIdChange}
              />
            )}

            {/* Tab 1: Bağış Takip Paneli | Tab 2: Ordu İstatistikleri | Tab 3: Ülke İstatistikleri */}
            {activeTab === 'donations' ? (
              <div>
                {/* WarEra API Key Giriş Bölümü */}
                <ApiKeySection onKeyChange={() => fetchData(true)} />

                <PlayerTable
                  players={players}
                  isLoading={isLoading}
                  isRefreshing={isRefreshing}
                  onRefresh={() => fetchData(true)}
                  muName={muData?.name || 'Turkic Tribe'}
                  muAvatarUrl={muData?.avatarUrl}
                />
              </div>
            ) : activeTab === 'armyStats' ? (
              <ArmyStatsTable
                players={players}
                isLoading={isLoading}
                isRefreshing={isRefreshing}
                onRefresh={() => fetchData(true)}
                muName={muData?.name || 'Turkic Tribe'}
                muId={muId}
              />
            ) : (
              <CountryStatsPanel />
            )}
          </>
        )}
        </React.Suspense>
      </main>

      {/* Footer with Canlı Senkron, Son Güncelleme Saati, and Credit */}
      <footer className="mt-auto border-t border-[#3282B8]/15 py-3.5 text-xs text-[#BBE1FA]/60 bg-[#141C21]/90 backdrop-blur-sm relative z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-center sm:text-left">
          {/* Left: Canlı Senkron & Son Güncelleme Saati */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              id="footer-autorefresh-toggle"
              type="button"
              onClick={() => setAutoRefresh((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs text-[#BBE1FA]/80 hover:text-white transition-colors cursor-pointer"
              title={autoRefresh ? 'Otomatik senkronizasyonu durdur' : 'Otomatik senkronizasyonu başlat'}
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-[#3282B8] animate-pulse shadow-[0_0_8px_rgba(50,130,184,0.8)]' : 'bg-[#182329] border border-[#3282B8]/40'}`} />
              <span className="font-medium font-mono">{autoRefresh ? 'Canlı Senkron' : 'Senkron Durdu'}</span>
            </button>

            {lastUpdated && (
              <>
                <span className="text-[#3282B8]/40">•</span>
                <span className="text-[#BBE1FA]/60 font-mono">
                  Son Güncelleme: {new Date(lastUpdated).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </>
            )}
          </div>

          {/* Right: Author / Credit */}
          <div>
            <span className="text-[#BBE1FA]/60">
              Made by{' '}
              <a
                href="https://app.warera.io/user/68305110bbd6e3b4179f0110"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-white hover:text-[#BBE1FA] transition-colors"
                >
                h4N
              </a>
            </span>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
