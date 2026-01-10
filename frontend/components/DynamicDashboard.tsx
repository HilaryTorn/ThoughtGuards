import React, { useState, useEffect } from 'react';
import { Radio, Loader2, AlertTriangle, BarChart3 } from 'lucide-react';
import { DetectionCategory, DetectionEvent, Message } from '../types';
import { CATEGORY_STYLES, LEGACY_CATEGORY_MAP } from '../constants';
import StatsCard from './StatsCard';
import DetectionCard from './DetectionCard';
import Sidebar from './Sidebar';
import SystemMetrics from './SystemMetrics';

// Helper to normalize legacy category names to new HOW verbs
function normalizeCategory(category: string): DetectionCategory {
  // If it's already a valid new category, return it
  if (CATEGORY_STYLES[category as DetectionCategory]) {
    return category as DetectionCategory;
  }
  // Check legacy mapping
  if (LEGACY_CATEGORY_MAP[category]) {
    return LEGACY_CATEGORY_MAP[category];
  }
  // Default fallback
  return 'Fabricated';
}

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
}

interface DynamicDashboardProps {
  settings: any;
  onViewTrace?: (traceId: string) => void;
  onNavigate?: (view: 'landing' | 'dashboard' | 'traces' | 'audit' | 'settings') => void;
}

const DynamicDashboard: React.FC<DynamicDashboardProps> = ({ settings, onViewTrace, onNavigate }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentDetections, setRecentDetections] = useState<DetectionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter State
  const [activeCategories, setActiveCategories] = useState<DetectionCategory[]>(
    Object.keys(CATEGORY_STYLES) as DetectionCategory[]
  );

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
        const response = await fetch('/api/audit-reports?limit=10');
        if (!response.ok) return;

        const data = await response.json() as { traces?: any[] };
        const traces = data.traces || [];

        const detections: DetectionEvent[] = traces.map((t: any) => {
            const primaryDetection = t.detectedTypes?.find((d: any) => d.evidence?.length > 0) || t.detectedTypes?.[0];
            const evidence = primaryDetection?.evidence?.[0] || {};

            // conversation can be an object {conversation_id, turns} or an array
            const conversationTurns = Array.isArray(t.conversation)
              ? t.conversation
              : (t.conversation?.turns || []);

            const reasoningTurn = conversationTurns.find((msg: any) => msg.reasoning_content || msg.reasoning_trace);
            const fullCoT = reasoningTurn?.reasoning_content || reasoningTurn?.reasoning_trace || evidence.snippet || 'No reasoning trace available';

            const conversationHistory: Message[] = conversationTurns.map((msg: any) => ({
              role: msg.role === 'customer' ? 'user' : msg.role,
              content: msg.content,
              timestamp: msg.timestamp
            }));

            // Normalize legacy category names to new HOW verbs
            const rawCategory = t.primaryCategory || primaryDetection?.category || 'Overclaimed';
            const normalizedCategory = normalizeCategory(rawCategory);

            return {
              id: t.id || t.auditId,
              category: normalizedCategory,
              riskScore: Math.round((t.overallScore || t.riskScore / 100 || 0) * 100),
              timestamp: t.timestamp || (t.createdAt ? new Date(t.createdAt).toLocaleTimeString() : 'N/A'),
              snippet: evidence.snippet || primaryDetection?.type || t.skillId || 'Audit result',
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

    const interval = setInterval(() => {
      loadStats();
      loadRecentDetections();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleCategory = (cat: DetectionCategory) => {
    setActiveCategories(prev =>
      prev.includes(cat)
        ? prev.filter(c => c !== cat)
        : [...prev, cat]
    );
  };

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

  // Show helpful message when no audits have been run yet
  if (stats.totalAnalyzed === 0) {
    return (
      <div className="glass-panel p-8 rounded-xl border-slate-800 text-center">
        <div className="flex flex-col items-center gap-4">
          <BarChart3 className="w-12 h-12 text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-300">No Audit Results Yet</h3>
          <p className="text-slate-400 max-w-md">
            {stats.message || 'Run audits from the Queue tab to populate the dashboard with detection statistics.'}
          </p>
          <button
            onClick={() => onNavigate?.('audit')}
            className="mt-2 px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 rounded-lg hover:bg-cyan-500/30 transition-colors"
          >
            Go to Queue →
          </button>
        </div>
      </div>
    );
  }

  // Calculate category counts from stats, normalizing legacy category names
  const categoryCounts: Record<DetectionCategory, number> = Object.keys(CATEGORY_STYLES).reduce((acc, cat) => {
    acc[cat as DetectionCategory] = 0;
    return acc;
  }, {} as Record<DetectionCategory, number>);

  // Sum up detections from all categories (including legacy names mapped to new ones)
  Object.entries(stats.byCategory).forEach(([cat, data]) => {
    const normalizedCat = normalizeCategory(cat);
    categoryCounts[normalizedCat] = (categoryCounts[normalizedCat] || 0) + (data.detections || 0);
  });

  // Filter detections based on active categories and threshold
  const filteredDetections = recentDetections.filter(d =>
    activeCategories.includes(d.category) &&
    settings.categories[d.category] &&
    d.riskScore >= settings.riskThreshold
  );

  return (
    <>
      {/* System Metrics Bar */}
      <SystemMetrics
        counts={categoryCounts}
        totalAnalyzed={stats.totalAnalyzed}
        totalDetections={stats.totalDetections}
      />

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {(Object.keys(CATEGORY_STYLES) as DetectionCategory[]).map(cat => (
          <StatsCard key={cat} style={CATEGORY_STYLES[cat]} count={categoryCounts[cat]} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

        {/* Main Feed */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <Radio size={18} className="text-cyan-500" />
              Detection Feed
            </h2>
            <span className="text-xs text-slate-500">Showing {filteredDetections.length} events</span>
          </div>

          {filteredDetections.length > 0 ? (
            filteredDetections.map((event) => (
              <DetectionCard
                key={event.id}
                event={event}
                onViewTrace={onViewTrace || (() => {})}
              />
            ))
          ) : (
            <div className="text-center py-20 text-slate-500 bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
              No detections found for selected filters or thresholds.
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="lg:col-span-1">
          <Sidebar
            activeCategories={activeCategories}
            toggleCategory={toggleCategory}
            counts={categoryCounts}
          />
        </div>
      </div>
    </>
  );
};

export default DynamicDashboard;
