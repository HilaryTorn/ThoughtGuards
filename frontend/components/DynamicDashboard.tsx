import React, { useState, useEffect } from 'react';
import { Activity, TrendingUp, AlertTriangle, BarChart3, Loader2 } from 'lucide-react';
import { DetectionCategory } from '../types';
import { CATEGORY_STYLES } from '../constants';
import SystemMetrics from './SystemMetrics';

interface DashboardStats {
  totalAnalyzed: number;
  totalDetections: number;
  byCategory: Record<string, {
    count: number;
    detections: number;
    statistics: {
      mean: number;
      stddev: number;
      quantiles: { p5: number; p50: number; p95: number };
    };
  }>;
  timeSeries: Array<{ date: string; count: number; detections: number }>;
  modelPerformance: Record<string, {
    total: number;
    detections: number;
    meanScore: number;
    stddev: number;
  }>;
  riskScoreDistribution: Record<string, number>;
}

interface DynamicDashboardProps {
  settings: any;
}

const DynamicDashboard: React.FC<DynamicDashboardProps> = ({ settings }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/dashboard-stats');
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard stats');
        }
        const data = await response.json();
        setStats(data);
      } catch (err: any) {
        console.error('Error loading dashboard stats:', err);
        setError(err.message || 'Failed to load dashboard statistics');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
    // Refresh every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
        <span className="ml-3 text-slate-400">Loading dashboard statistics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel p-6 rounded-xl border-slate-800">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="w-5 h-5" />
          <span>Error loading dashboard: {error}</span>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="glass-panel p-6 rounded-xl border-slate-800">
        <p className="text-slate-400">No statistics available</p>
      </div>
    );
  }

  // Convert stats to format expected by existing components
  const categoryCounts: Record<DetectionCategory, number> = Object.keys(CATEGORY_STYLES).reduce((acc, cat) => {
    const categoryData = stats.byCategory[cat] || { count: 0, detections: 0 };
    acc[cat as DetectionCategory] = categoryData.detections;
    return acc;
  }, {} as Record<DetectionCategory, number>);

  // Filter categories to only include valid DetectionCategory values
  const validCategories = Object.entries(stats.byCategory)
    .filter(([cat]) => cat in CATEGORY_STYLES)
    .filter(([cat, data]) => data.detections > 0);

  const activeCategories = Object.keys(CATEGORY_STYLES).filter(
    cat => settings.categories && settings.categories[cat as DetectionCategory]
  ) as DetectionCategory[];

  const filteredDetections = validCategories
    .filter(([cat]) => activeCategories.includes(cat as DetectionCategory))
    .map(([cat, data]) => ({
      category: cat as DetectionCategory,
      detections: data.detections,
      count: data.count,
      meanScore: data.statistics.mean,
      stddev: data.statistics.stddev
    }))
    .filter(({ meanScore }) => Math.round(meanScore * 100) >= settings.riskThreshold)
    .sort((a, b) => b.meanScore - a.meanScore)
    .slice(0, 10); // Top 10

  return (
    <div className="space-y-8">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel p-6 rounded-xl border-l-4 border-cyan-500/50 flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Total Analyzed</p>
            <p className="text-2xl font-bold text-slate-100">{stats.totalAnalyzed}</p>
          </div>
          <div className="p-3 rounded-lg bg-cyan-500/10">
            <Activity className="w-6 h-6 text-cyan-400" />
          </div>
        </div>
        <div className="glass-panel p-6 rounded-xl border-l-4 border-red-500/50 flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Total Detections</p>
            <p className="text-2xl font-bold text-slate-100">{stats.totalDetections}</p>
          </div>
          <div className="p-3 rounded-lg bg-red-500/10">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
        </div>
        <div className="glass-panel p-6 rounded-xl border-l-4 border-amber-500/50 flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Detection Rate</p>
            <p className="text-2xl font-bold text-slate-100">
              {stats.totalAnalyzed > 0 ? `${Math.round((stats.totalDetections / stats.totalAnalyzed) * 100)}%` : '0%'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10">
            <BarChart3 className="w-6 h-6 text-amber-400" />
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div>
        <h2 className="text-2xl font-bold text-slate-100 mb-6">Detections by Category</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(stats.byCategory)
            .filter(([cat, data]) => data.detections > 0 && cat in CATEGORY_STYLES)
            .map(([cat, data]) => {
              const categoryStyle = CATEGORY_STYLES[cat as DetectionCategory];
              if (!categoryStyle) return null;
              
              return (
                <div
                  key={cat}
                  className="glass-panel p-4 rounded-xl border-slate-800"
                  style={{ borderColor: categoryStyle.borderColor.replace('border-', '').replace('/50', '') + '80' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-semibold ${categoryStyle.color}`}>{cat}</span>
                    <span className="text-sm text-slate-400">{data.detections} / {data.count}</span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-400">
                    <div>Mean: {(data.statistics.mean * 100).toFixed(1)}%</div>
                    <div>Std Dev: {(data.statistics.stddev * 100).toFixed(1)}%</div>
                    <div>P50: {(data.statistics.quantiles.p50 * 100).toFixed(1)}%</div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Category Summary Cards (replacing Detection Cards for now) */}
      {filteredDetections.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold text-slate-100 mb-6">Top Detected Categories</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDetections.map(({ category, detections, count, meanScore, stddev }) => {
              const categoryStyle = CATEGORY_STYLES[category];
              if (!categoryStyle) return null;
              
              return (
                <div
                  key={category}
                  className="glass-panel p-6 rounded-xl border-slate-800"
                  style={{ borderColor: categoryStyle.borderColor.replace('border-', '').replace('/50', '') + '80' }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className={`font-semibold ${categoryStyle.color}`}>{category}</span>
                    <span className="text-sm text-slate-400">{detections} / {count}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Mean Score</span>
                      <span className="text-lg font-bold text-slate-200">
                        {(meanScore * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Std Dev</span>
                      <span className="text-sm font-mono text-slate-400">
                        {(stddev * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* System Metrics */}
      <SystemMetrics stats={stats} />
    </div>
  );
};

export default DynamicDashboard;

