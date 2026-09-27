/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { MetricsCards } from './components/MetricsCards';
import { PlayerTable } from './components/PlayerTable';
import { MilitaryUnitData, PlayerStats, ApiResponse } from './types';
import { fetchMilitaryUnitData } from './services/wareraApi';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

export default function App() {
  const [muId, setMuId] = useState('69c229c4449287ea1a26a5b3');
  const [muData, setMuData] = useState<MilitaryUnitData | null>(null);
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [aggregated, setAggregated] = useState<ApiResponse['aggregated']>({
    totalDonations: 0,
    totalContributors: 0,
    averageDonation: 0,
    topDonor: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [isLiveDonations, setIsLiveDonations] = useState(false);
  const [hasApiToken, setHasApiToken] = useState(false);
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

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  // Fetch MU Data
  const fetchData = useCallback(
    async (forceRefresh = false) => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchMilitaryUnitData(muId, forceRefresh);
        if (data && data.militaryUnit) {
          setMuData(data.militaryUnit);
          setPlayers(data.players || []);
          setAggregated(data.aggregated || {
            totalDonations: 0,
            totalContributors: 0,
            averageDonation: 0,
            topDonor: null,
          });
          setIsLiveDonations(Boolean(data.isLiveDonations));
          setHasApiToken(Boolean(data.hasApiToken));
          setLastUpdated(data.timestamp || Date.now());
        }
      } catch (err: any) {
        console.warn('Non-blocking data sync notice:', err);
        // Even if something unexpected throws, gracefully keep current or seed data
      } finally {
        setIsLoading(false);
      }
    },
    [muId]
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

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#11151a] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Header */}
      <Header
        muData={muData}
        currentMuId={muId}
        onMuIdChange={(newId) => setMuId(newId)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
        isLoading={isLoading}
        onRefresh={() => fetchData(true)}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh((prev) => !prev)}
        lastUpdated={lastUpdated}
        isLiveDonations={isLiveDonations}
        hasApiToken={hasApiToken}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-200 flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => fetchData(true)}
              className="px-3 py-1 rounded-lg bg-red-100 dark:bg-red-900/70 hover:bg-red-200 font-medium text-xs transition-colors shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Live Status Sub-bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-6 pb-2 border-b border-slate-200 dark:border-[#232b35] text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Ülke & Ordu Bağış Takip Paneli
            </span>
            <span>•</span>
            <span className="text-cyan-600 dark:text-cyan-400 font-medium">
              Askerlerin Yaptığı Son 7 Bağış
            </span>
            <span className="text-slate-400 dark:text-slate-500 text-[11px]">
              (Ülke Hazinesi ve Ordu Fonu Katkıları)
            </span>
          </div>

          <div className="flex items-center gap-3">
            {isLiveDonations ? (
              <span className="inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-500" />
                Live API Transactions Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <Info className="w-3.5 h-3.5 text-cyan-500" />
                Live Member Stats Synced
              </span>
            )}
            {lastUpdated && (
              <span>
                Updated {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        {/* Top Metrics Cards */}
        <MetricsCards
          totalContributors={aggregated.totalContributors}
          totalMembers={players.length}
          averageDonation={aggregated.averageDonation}
        />

        {/* Sortable Player Donations Table */}
        <PlayerTable
          players={players}
          isLoading={isLoading}
          muName={muData?.name || 'Turkic Tribe'}
          muAvatarUrl={muData?.avatarUrl}
        />
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 dark:border-[#232b35] py-4 text-center text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-[#14191f]">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-center">
          <span>
            Made by{' '}
            <a
              href="https://app.warera.io/user/68305110bbd6e3b4179f0110"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-cyan-600 dark:text-cyan-400 hover:underline hover:text-cyan-500 transition-colors"
            >
              Muhtarr
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
