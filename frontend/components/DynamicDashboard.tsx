import React, { useState, useEffect } from 'react';
import { Activity, TrendingUp, AlertTriangle, BarChart3, Loader2 } from 'lucide-react';
import { DetectionCategory, DetectionEvent, Message } from '../types';
import { CATEGORY_STYLES } from '../constants';
import SystemMetrics from './SystemMetrics';
import DetectionCard from './DetectionCard';

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
  onViewTrace?: (traceId: string) => void;
}

const DynamicDashboard: React.FC<DynamicDashboardProps> = ({ settings, onViewTrace }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentDetections, setRecentDetections] = useState<DetectionEvent[]>([]);
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

    const loadRecentDetections = async () => {
      try {
        // Fetch recent audit results (all results, not filtered by score)
        const response = await fetch('/api/audit-results?limit=10');
        if (!response.ok) return;

        const data = await response.json();
        const traces = data.traces || [];

        // Transform audit results to DetectionEvent format
        const detections: DetectionEvent[] = traces
          .filter((t: any) => t.detectedTypes && t.detectedTypes.length > 0)
          .map((t: any) => {
            // Find the primary detection type with evidence
            const primaryDetection = t.detectedTypes.find((d: any) => d.evidence?.length > 0) || t.detectedTypes[0];
            const evidence = primaryDetection?.evidence?.[0] || {};

            // Extract reasoning trace from conversation
            const reasoningTurn = t.conversation?.find((msg: any) => msg.reasoning_trace);
            const fullCoT = reasoningTurn?.reasoning_trace || evidence.snippet || 'No reasoning trace available';

            // Get conversation history as Message[]
            const conversationHistory: Message[] = (t.conversation || []).map((msg: any) => ({
              role: msg.role === 'customer' ? 'user' : msg.role,
              content: msg.content,
              timestamp: msg.timestamp
            }));

            return {
              id: t.id || t.auditId,
              category: (t.primaryCategory || primaryDetection?.category || 'Reward Hacking') as DetectionCategory,
              riskScore: Math.round((t.overallScore || 0) * 100),
              timestamp: t.timestamp || new Date(t.createdAt).toLocaleTimeString(),
              snippet: evidence.snippet || primaryDetection?.type || 'Detection found',
              fullCoT,
              conversationHistory,
              matchedPatterns: t.detectedTypes?.map((d: any) => d.type) || [],
              confidence: {
                model: t.overallScore || 0,
                heuristic: 0.8
              }
            };
          });

        setRecentDetections(detections);
      } catch (err) {
        console.error('Error loading recent detections:', err);
      }
    };

    loadStats();
    loadRecentDetections();

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      loadStats();
      loadRecentDetections();
    }, 30000);
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
      {/* System Metrics - Overview at the top */}
      <SystemMetrics stats={stats} />

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
            .filter(([cat, data]) => (data as any).count > 0 && cat in CATEGORY_STYLES)
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

      {/* Recent Detections */}
      {recentDetections.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-slate-100">Recent Detections</h2>
            <span className="text-xs text-slate-500">Showing {recentDetections.length} events</span>
          </div>
          {recentDetections.map((event) => (
            <DetectionCard
              key={event.id}
              event={event}
              onViewTrace={onViewTrace || (() => {})}
            />
          ))}
        </div>
      )}

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
    </div>
  );
};

export default DynamicDashboard;

