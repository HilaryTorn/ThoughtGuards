import React, { useState, useEffect } from 'react';
import { Scale, AlertTriangle, CheckCircle } from 'lucide-react';
import { HOW_VERBS } from '../constants';
import { HOWCode } from '../types';

interface JudgeComparisonStatsData {
  totalComparisons: number;
  totalPatterns: number;
  totalExactMatches: number;
  totalPartialMatches: number;
  totalSingleJudge: number;
  avgAgreement: number;
  meanKappa: number;
  disagreementsByType: Record<string, number>;
}

/**
 * Dashboard panel showing judge comparison statistics.
 * Fetches from /api/judge-comparison/stats and displays aggregate metrics.
 */
const JudgeComparisonStats: React.FC = () => {
  const [stats, setStats] = useState<JudgeComparisonStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/judge-comparison/stats');
        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }
        const data = await response.json();
        if (data.success) {
          setStats(data.stats);
        } else {
          setError(data.error || 'Unknown error');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="glass-panel p-6 rounded-xl border border-slate-800 animate-pulse">
        <div className="h-4 bg-slate-700 rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-4 gap-4">
          <div className="h-16 bg-slate-700 rounded"></div>
          <div className="h-16 bg-slate-700 rounded"></div>
          <div className="h-16 bg-slate-700 rounded"></div>
          <div className="h-16 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="glass-panel p-6 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 text-slate-500">
          <Scale size={16} />
          <span className="text-sm">No judge comparison data available</span>
        </div>
      </div>
    );
  }

  // Convert HOW codes to readable names for display
  const disagreementsByTypeSorted = Object.entries(stats.disagreementsByType)
    .map(([code, count]) => ({
      code,
      name: HOW_VERBS[code as HOWCode]?.verb || code,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="glass-panel p-6 rounded-xl border border-slate-800">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Scale size={16} className="text-cyan-500" />
        <h3 className="text-sm font-semibold text-slate-300">Judge Comparison</h3>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {/* Conversations Compared */}
        <div className="bg-slate-800/50 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Conversations</p>
          <p className="text-xl font-bold text-slate-100">{stats.totalComparisons}</p>
        </div>

        {/* Exact Matches */}
        <div className="bg-slate-800/50 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Exact Matches</p>
          <p className="text-xl font-bold text-green-400">
            {stats.totalExactMatches}
            <span className="text-xs text-slate-500 ml-1">
              ({stats.totalPatterns > 0 ? Math.round((stats.totalExactMatches / stats.totalPatterns) * 100) : 0}%)
            </span>
          </p>
        </div>

        {/* Partial Matches */}
        <div className="bg-slate-800/50 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Partial</p>
          <p className="text-xl font-bold text-yellow-400">
            {stats.totalPartialMatches}
            <span className="text-xs text-slate-500 ml-1">
              ({stats.totalPatterns > 0 ? Math.round((stats.totalPartialMatches / stats.totalPatterns) * 100) : 0}%)
            </span>
          </p>
        </div>

        {/* Single-Judge Only */}
        <div className="bg-slate-800/50 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Single-Judge</p>
          <p className="text-xl font-bold text-orange-400">
            {stats.totalSingleJudge}
            <span className="text-xs text-slate-500 ml-1">
              ({stats.totalPatterns > 0 ? Math.round((stats.totalSingleJudge / stats.totalPatterns) * 100) : 0}%)
            </span>
          </p>
        </div>

        {/* Cohen's Kappa */}
        <div className="bg-slate-800/50 rounded-lg p-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Cohen's κ</p>
          <p className="text-xl font-bold text-slate-100">
            {stats.meanKappa ? stats.meanKappa.toFixed(2) : 'N/A'}
          </p>
          <p className="text-[9px] text-slate-500">Inter-rater reliability</p>
        </div>
      </div>

      {/* Agreement Summary Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-slate-400">Pattern Agreement Rate</span>
          <span className={`font-bold ${
            stats.avgAgreement >= 0.8 ? 'text-green-400' :
            stats.avgAgreement >= 0.5 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {Math.round(stats.avgAgreement * 100)}%
          </span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex">
          <div
            className="bg-green-500 transition-all"
            style={{ width: `${stats.totalPatterns > 0 ? (stats.totalExactMatches / stats.totalPatterns) * 100 : 0}%` }}
          />
          <div
            className="bg-yellow-500 transition-all"
            style={{ width: `${stats.totalPatterns > 0 ? (stats.totalPartialMatches / stats.totalPatterns) * 100 : 0}%` }}
          />
          <div
            className="bg-orange-500 transition-all"
            style={{ width: `${stats.totalPatterns > 0 ? (stats.totalSingleJudge / stats.totalPatterns) * 100 : 0}%` }}
          />
        </div>
        <div className="flex gap-4 text-[10px] mt-1">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Exact</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" />Partial</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" />Single</span>
        </div>
      </div>

      {/* Disagreements by Type */}
      {disagreementsByTypeSorted.length > 0 && (
        <div className="border-t border-slate-700 pt-4">
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Single-Judge Detections by Type</p>
          <div className="flex flex-wrap gap-2">
            {disagreementsByTypeSorted.map(({ code, name, count }) => (
              <div
                key={code}
                className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 rounded text-xs"
              >
                <AlertTriangle size={12} className="text-orange-400" />
                <span className="text-slate-300">{name}</span>
                <span className="text-slate-500">({count})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state for disagreements */}
      {disagreementsByTypeSorted.length === 0 && stats.totalComparisons > 0 && (
        <div className="border-t border-slate-700 pt-4 flex items-center gap-2 text-sm text-green-400">
          <CheckCircle size={14} />
          <span>All judges in agreement</span>
        </div>
      )}
    </div>
  );
};

export default JudgeComparisonStats;
