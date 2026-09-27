import React from 'react';
import { Users, TrendingUp } from 'lucide-react';
import { formatNumber } from '../utils/formatters';

interface MetricsCardsProps {
  totalContributors: number;
  totalMembers: number;
  averageDonation: number;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({
  totalContributors,
  totalMembers,
  averageDonation,
}) => {
  const participationRate = totalMembers > 0 ? Math.round((totalContributors / totalMembers) * 100) : 0;

  return (
    <div id="metrics-summary-grid" className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
      {/* 1. Active Donors */}
      <div
        id="metric-active-donors"
        className="bg-white dark:bg-[#161c23] border border-slate-200 dark:border-[#27323e] rounded-xl p-4.5 transition-colors duration-200"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Bağış Yapan Askerler
          </span>
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#12161b] text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-slate-200 dark:border-[#27323e]">
            <Users className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            {totalContributors}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            / {totalMembers} asker ({participationRate}%)
          </span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-[#11151a] rounded-full h-1.5 mt-2.5 overflow-hidden">
          <div
            className="bg-cyan-600 dark:bg-cyan-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, participationRate)}%` }}
          />
        </div>
      </div>

      {/* 2. Average per Soldier */}
      <div
        id="metric-avg-donation"
        className="bg-white dark:bg-[#161c23] border border-slate-200 dark:border-[#27323e] rounded-xl p-4.5 transition-colors duration-200"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Asker Başı Ortalama Bağış
          </span>
          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#12161b] text-cyan-600 dark:text-cyan-400 flex items-center justify-center border border-slate-200 dark:border-[#27323e]">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            {formatNumber(averageDonation)}
          </div>
          <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">
            Gold
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Aktif askerlerin ülke ve ordu fonlarına yaptığı ortalama bağış miktarı
        </p>
      </div>
    </div>
  );
};
