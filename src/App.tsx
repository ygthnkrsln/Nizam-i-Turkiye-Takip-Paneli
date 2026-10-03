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
  | 'combatDamage';

export type AppMode = 'economy' | 'combat';

export const TAB_TO_SLUG: Record<ActiveTab, string> = {
  donations: 'bagis-takip',
  armyStats: 'ordu-istatistikleri',
  countryStats: 'ulke-istatistikleri',
  combatArmyInfo: 'ordu-bilgisi',
  combatDetails: 'detayli-bilgi',
  combatDamage: 'hasar',
};

export const TAB_TO_MODE: Record<ActiveTab, AppMode> = {
  donations: 'economy',
  armyStats: 'economy',
  countryStats: 'economy',
  combatArmyInfo: 'combat',
  combatDetails: 'combat',
  combatDamage: 'combat',
};

const TAB_TITLES: Record<ActiveTab, string> = {
  donations: 'War Era - Bağış Takip Paneli',
  armyStats: 'War Era - Ordu İstatistikleri',
  countryStats: 'War Era - Ülke İstatistikleri',
  combatArmyInfo: 'War Era - Ordu Bilgisi (Savaş Modu)',
  combatDetails: 'War Era - Detaylı Bilgi (Savaş Modu)',
  combatDamage: 'War Era - Hasar (Savaş Modu)',
};

export function getTabFromUrl(): ActiveTab {
  if (typeof window === 'undefined') return 'donations';
  
  // Normalize pathname: e.g. "/ordu-istatistikleri" -> "ordu-istatistikleri"
  const path = window.location.pathname.toLowerCase().replace(/^\/+|\/+$/g, '');
  const hash = window.location.hash.toLowerCase().replace(/^#\/?/, '');
  const segment = path || hash;

  // Savaş Modu (Combat) rotaları
  if (segment === 'ordu-bilgisi' || segment === 'ordubilgisi' || segment === 'army-info') {
    return 'combatArmyInfo';
  }
  if (segment === 'detayli-bilgi' || segment === 'detaylibilgi' || segment === 'detailed-info' || segment === 'detay') {
    return 'combatDetails';
  }
  if (segment === 'hasar' || segment === 'damage') {
    return 'combatDamage';
  }

  // Ekonomi Modu (Economy) rotaları
  if (
    segment === 'ordu-istatistikleri' ||
    segment === 'ordu' ||
    segment === 'army-stats' ||
    segment === 'armystats' ||
    segment === 'army'
  ) {
    return 'armyStats';
  }
  if (
    segment === 'ulke-istatistikleri' ||
    segment === 'ulke' ||
    segment === 'country-stats' ||
    segment === 'countrystats' ||
    segment === 'country'
  ) {
    return 'countryStats';
  }
  if (
    segment === 'bagis-takip' ||
    segment === 'bagis' ||
    segment === 'donations' ||
    segment === 'donation'
  ) {
    return 'donations';
  }
  return 'donations';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => getTabFromUrl());
  const [muId, setMuId] = useState(() => {
    return getCookie('warera_last_mu') || DEFAULT_MU_ID;
  });

  // Read initial cached state instantly on mount (0ms instant hydration - zero flicker/reset on refresh)
  const [muData, setMuData] = useState<MilitaryUnitData | null>(() => {
    const cached = getCachedMilitaryUnitData(getCookie('warera_last_mu') || DEFAULT_MU_ID);
    return cached?.militaryUnit || null;
  });

  const [players, setPlayers] = useState<PlayerStats[]>(() => {
    const cached = getCachedMilitaryUnitData(getCookie('warera_last_mu') || DEFAULT_MU_ID);
    return cached?.players || [];
  });

  const [aggregated, setAggregated] = useState<ApiResponse['aggregated']>(() => {
    const cached = getCachedMilitaryUnitData(getCookie('warera_last_mu') || DEFAULT_MU_ID);
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
    const cached = getCachedMilitaryUnitData(getCookie('warera_last_mu') || DEFAULT_MU_ID);
    return !cached || !cached.players || cached.players.length === 0;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(() => {
    const cached = getCachedMilitaryUnitData(getCookie('warera_last_mu') || DEFAULT_MU_ID);
    return cached?.timestamp || null;
  });
  const [isLiveDonations, setIsLiveDonations] = useState(() => {
    const cached = getCachedMilitaryUnitData(getCookie('warera_last_mu') || DEFAULT_MU_ID);
    return Boolean(cached?.isLiveDonations);
  });
  const [hasApiToken, setHasApiToken] = useState(() => {
    const cached = getCachedMilitaryUnitData(getCookie('warera_last_mu') || DEFAULT_MU_ID);
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

  // Switch tab and synchronize browser URL without page reload
  const handleTabChange = useCallback((newTab: ActiveTab) => {
    setActiveTab(newTab);
    const slug = TAB_TO_SLUG[newTab];
    const newPath = `/${slug}${window.location.search}`;
    if (window.location.pathname !== `/${slug}`) {
      window.history.pushState({ tab: newTab }, '', newPath);
    }
    if (TAB_TITLES[newTab]) {
      document.title = TAB_TITLES[newTab];
    }
  }, []);

  const currentMode: AppMode = TAB_TO_MODE[activeTab] || 'economy';

  const handleModeChange = useCallback((newMode: AppMode) => {
    if (newMode === 'combat') {
      handleTabChange('combatArmyInfo');
    } else {
      handleTabChange('donations');
    }
  }, [handleTabChange]);

  // Listen for browser Back/Forward (popstate) navigation & sync URL
  useEffect(() => {
    const onPopState = () => {
      const tab = getTabFromUrl();
      setActiveTab(tab);
      if (TAB_TITLES[tab]) {
        document.title = TAB_TITLES[tab];
      }
    };

    window.addEventListener('popstate', onPopState);

    // Initial page title sync
    const currentTab = getTabFromUrl();
    if (TAB_TITLES[currentTab]) {
      document.title = TAB_TITLES[currentTab];
    }

    // If loaded on root "/", gracefully update URL to "/bagis-takip" so the panel name is visible
    const currentPath = window.location.pathname.replace(/^\/+|\/+$/g, '');
    const currentSlug = TAB_TO_SLUG[currentTab];
    if (currentPath === '') {
      window.history.replaceState({ tab: currentTab }, '', `/${currentSlug}${window.location.search}`);
    }

    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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

  // Switch MU and instantly swap to cached state if available
  const handleMuIdChange = (newId: string) => {
    setMuId(newId);
    setCookie('warera_last_mu', newId);
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
  };

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
        {currentMode === 'combat' ? (
          activeTab === 'combatArmyInfo' ? (
            <MilitaryOverviewSection
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
