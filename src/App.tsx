/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Header } from './components/Header';
import { MetricsCards } from './components/MetricsCards';
import { PlayerTable } from './components/PlayerTable';
import { ArmyStatsTable } from './components/ArmyStatsTable';
import { CountryStatsPanel } from './components/CountryStatsPanel';
import { ApiKeySection } from './components/ApiKeySection';
import { WorkInProgressPanel } from './components/WorkInProgressPanel';
import { MilitaryOverviewSection } from './components/MilitaryOverviewSection';
import { MilitaryDetailsSection } from './components/MilitaryDetailsSection';
import { DailyDamageTelemetrySection } from './components/DailyDamageTelemetrySection';
import { ManagementWipSection, ManagementTab } from './components/ManagementWipSection';
import { ManagementArmyTrackingSection } from './components/ManagementArmyTrackingSection';
import { ManagementDonationTrackingSection } from './components/ManagementDonationTrackingSection';
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
  | 'mgmtDiplomacy';

export type AppMode = 'economy' | 'combat' | 'management';

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
};

export const TAB_TO_MODE: Record<ActiveTab, AppMode> = {
  donations: 'economy',
  armyStats: 'economy',
  countryStats: 'economy',
  combatArmyInfo: 'combat',
  combatDetails: 'combat',
  combatDamage: 'combat',
  mgmtArmies: 'management',
  mgmtDonations: 'management',
  mgmtUnit: 'management',
  mgmtOrders: 'management',
  mgmtTreasury: 'management',
  mgmtDiplomacy: 'management',
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
};

export function getRouteFromUrl(): { tab: ActiveTab; muId: string | null } {
  if (typeof window === 'undefined') return { tab: 'donations', muId: null };

  const path = window.location.pathname.toLowerCase().replace(/^\/+|\/+$/g, '');
  const segments = path.split('/').filter(Boolean);

  let tabSlug = segments[0] || '';
  let urlMuId: string | null = null;

  // 1. Direct hex MU ID in first segment: e.g. "/68e0f3b86351b310a982d79e"
  if (/^[a-f0-9]{24}$/.test(tabSlug)) {
    urlMuId = tabSlug;
    tabSlug = 'bagis-takibi';
  } else if (segments[1] && /^[a-f0-9]{24}$/.test(segments[1])) {
    // 2. MU ID in second segment: e.g. "/bagis-takibi/68e0f3b86351b310a982d79e"
    urlMuId = segments[1];
  }

  // 3. Search query params fallback: "?muId=..."
  const searchParams = new URLSearchParams(window.location.search);
  const queryMuId = searchParams.get('muId');
  if (!urlMuId && queryMuId && /^[a-f0-9]{24}$/.test(queryMuId.toLowerCase())) {
    urlMuId = queryMuId.toLowerCase();
  }

  // 4. Hash fallback: e.g. "#/bagis-takibi/68e0f3b86351b310a982d79e"
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
    tab = 'mgmtDonations';
  } else if (tabSlug === 'ittifak-diplomasi' || tabSlug === 'diplomasi' || tabSlug === 'diplomacy' || tabSlug === 'ittifak') {
    tab = 'mgmtDiplomacy';
  } else if (tabSlug === 'ordu-bilgisi' || tabSlug === 'ordubilgisi' || tabSlug === 'army-info') {
    tab = 'combatArmyInfo';
  } else if (tabSlug === 'detayli-bilgi' || tabSlug === 'detaylibilgi' || tabSlug === 'detailed-info' || tabSlug === 'detay') {
    tab = 'combatDetails';
  } else if (tabSlug === 'hasar' || tabSlug === 'damage' || tabSlug === 'hasar-takibi' || tabSlug === 'hasar-takip') {
    tab = 'combatDamage';
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
    const newPath = newTab === 'countryStats' ? `/${slug}${window.location.search}` : `/${slug}/${muId}${window.location.search}`;
    const expectedPathname = newTab === 'countryStats' ? `/${slug}` : `/${slug}/${muId}`;
    if (window.location.pathname !== expectedPathname) {
      window.history.pushState({ tab: newTab, muId }, '', newPath);
    }
    if (TAB_TITLES[newTab]) {
      document.title = TAB_TITLES[newTab];
    }
  }, [muId]);

  const currentMode: AppMode = TAB_TO_MODE[activeTab] || 'economy';

  const handleModeChange = useCallback((newMode: AppMode) => {
    if (newMode === 'combat') {
      handleTabChange('combatArmyInfo');
    } else if (newMode === 'management') {
      handleTabChange('mgmtArmies');
    } else {
      handleTabChange('donations');
    }
  }, [handleTabChange]);

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
    const targetExpectedPath = route.tab === 'countryStats' ? `/${currentSlug}` : `/${currentSlug}/${muId}`;
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
    const newPath = activeTab === 'countryStats' ? `/${slug}${window.location.search}` : `/${slug}/${newId}${window.location.search}`;
    const expectedPathname = activeTab === 'countryStats' ? `/${slug}` : `/${slug}/${newId}`;
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
    });

    return {
      activePlayers,
      totalActiveFactories,
      totalAllFactories,
      totalActiveEnginePower,
    };
  }, [players]);

  return (
    <div className="min-h-screen bg-[#141C21] text-white flex flex-col font-sans relative selection:bg-[#3282B8] selection:text-white">
      {/* Ambient background glow matching the color scheme */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#0F4C75]/20 via-transparent to-transparent pointer-events-none" />

      {/* Top Header - With Mode Switcher (Ekonomi vs Savaş) & Dynamic Tabs */}
      <Header 
        activeTab={activeTab} 
        onTabChange={handleTabChange} 
        currentMode={currentMode}
        onModeChange={handleModeChange}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 relative z-10">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-[#182329] border border-[#3282B8]/40 text-white flex items-center justify-between gap-3 text-sm shadow-xl">
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

        {/* Main Content Area */}
        {currentMode === 'management' ? (
          activeTab === 'mgmtDonations' ? (
            <ManagementDonationTrackingSection
              currentMuId={muId}
              onSelectArmy={handleMuIdChange}
            />
          ) : (
            <ManagementArmyTrackingSection
              onSelectArmy={handleMuIdChange}
              onNavigateTab={handleTabChange}
            />
          )
        ) : currentMode === 'combat' ? (
          activeTab === 'combatArmyInfo' ? (
            <MilitaryOverviewSection
              muId={muId}
              onMuIdChange={handleMuIdChange}
              onNavigateTab={handleTabChange}
            />
          ) : activeTab === 'combatDetails' ? (
            <MilitaryDetailsSection
              muId={muId}
              onMuIdChange={handleMuIdChange}
              onNavigateTab={handleTabChange}
            />
          ) : activeTab === 'combatDamage' ? (
            <DailyDamageTelemetrySection
              muId={muId}
              onMuIdChange={handleMuIdChange}
              onNavigateTab={handleTabChange}
            />
          ) : (
            <WorkInProgressPanel
              activeTab={activeTab}
              onSwitchToEconomy={() => handleModeChange('economy')}
            />
          )
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
              />
            ) : (
              <CountryStatsPanel />
            )}
          </>
        )}
      </main>

      {/* Footer with Canlı Senkron, Son Güncelleme Saati, and Credit */}
      <footer className="mt-auto border-t border-[#3282B8]/15 py-3.5 text-xs text-[#BBE1FA]/60 bg-[#141C21]/90 backdrop-blur-sm relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2.5">
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
                Muhtarr
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
