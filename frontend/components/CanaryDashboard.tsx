import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, TrendingDown, Clock, Activity } from 'lucide-react';
import { ModelCanary, ModelDriftEvent } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';

interface CanaryDashboardProps {
  onClose?: () => void;
}

const CanaryDashboard: React.FC<CanaryDashboardProps> = ({
  onClose
}) => {
  const [canaries, setCanaries] = useState<ModelCanary[]>([]);
  const [driftEvents, setDriftEvents] = useState<ModelDriftEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCanary, setSelectedCanary] = useState<string | null>(null);

  useEffect(() => {
    loadCanaries();
    loadDriftEvents();
    // Poll for updates every 30 seconds
    const interval = setInterval(() => {
      loadCanaries();
      loadDriftEvents();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadCanaries = async () => {
    try {
      const response = await fetch('/api/model-canaries');
      if (response.ok) {
        const data = await response.json();
        setCanaries(data.canaries || []);
      }
    } catch (error) {
      console.error('Error loading canaries:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDriftEvents = async () => {
    try {
      const response = await fetch('/api/model-drift-events?limit=50');
      if (response.ok) {
        const data = await response.json();
        setDriftEvents(data.events || []);
      }
    } catch (error) {
      console.error('Error loading drift events:', error);
    }
  };

  const activeAlerts = driftEvents.filter(e => 
    e.alert_level === 'critical' || e.alert_level === 'warning'
  );

  const recentDrift = driftEvents.slice(0, 10);

  // Generate timeline data for selected canary
  const timelineData = selectedCanary
    ? driftEvents
        .filter(e => e.canary_id === selectedCanary)
        .map(e => ({
          date: new Date(e.detected_at).toLocaleDateString(),
          score: e.baseline_score - e.current_score, // Drift magnitude
          pValue: e.statistical_test?.p_value || 0
        }))
    : [];

  return (
    <div className={`${onClose ? 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4' : ''}`}>
      <div className={`bg-slate-900 rounded-xl border border-slate-700 ${onClose ? 'w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col' : 'w-full'}`}>
        {onClose && (
          <div className="flex items-center justify-between p-6 border-b border-slate-800">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Model Drift Monitoring</h2>
              <p className="text-sm text-slate-400 mt-1">Canary prompt monitoring dashboard</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              ×
            </button>
          </div>
        )}

        <div className={`${onClose ? 'flex-1 overflow-y-auto p-6' : 'p-6'} space-y-6`}>
          {/* Alert Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity size={20} className="text-cyan-500" />
                <p className="text-xs text-slate-500">Active Canaries</p>
              </div>
              <p className="text-2xl font-bold text-slate-200">{canaries.length}</p>
            </div>
            <div className="bg-slate-950/50 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={20} className="text-red-500" />
                <p className="text-xs text-slate-500">Critical Alerts</p>
              </div>
              <p className="text-2xl font-bold text-red-400">
                {activeAlerts.filter(a => a.alert_level === 'critical').length}
              </p>
            </div>
            <div className="bg-slate-950/50 border border-amber-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={20} className="text-amber-500" />
                <p className="text-xs text-slate-500">Warnings</p>
              </div>
              <p className="text-2xl font-bold text-amber-400">
                {activeAlerts.filter(a => a.alert_level === 'warning').length}
              </p>
            </div>
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={20} className="text-green-500" />
                <p className="text-xs text-slate-500">Stable</p>
              </div>
              <p className="text-2xl font-bold text-green-400">
                {canaries.length - activeAlerts.length}
              </p>
            </div>
          </div>

          {/* Recent Drift Events */}
          {recentDrift.length > 0 && (
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4">Recent Drift Events</h3>
              <div className="space-y-2">
                {recentDrift.map((event, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-lg border ${
                      event.alert_level === 'critical' ? 'bg-red-500/10 border-red-500/30' :
                      event.alert_level === 'warning' ? 'bg-amber-500/10 border-amber-500/30' :
                      'bg-slate-900/50 border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {event.alert_level === 'critical' && (
                            <AlertTriangle size={16} className="text-red-400" />
                          )}
                          {event.alert_level === 'warning' && (
                            <AlertTriangle size={16} className="text-amber-400" />
                          )}
                          <span className="font-semibold text-slate-200">
                            {event.canary_id}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            event.alert_level === 'critical' ? 'bg-red-500/20 text-red-400' :
                            event.alert_level === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>
                            {event.alert_level}
                          </span>
                        </div>
                        <p className="text-sm text-slate-400">
                          {event.drift_type} • {event.statistical_test?.test_name || 'Unknown test'}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(event.detected_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-400 mb-1">Score Change</p>
                        <p className={`text-lg font-mono font-bold ${
                          event.baseline_score - event.current_score > 0.05 ? 'text-red-400' :
                          event.baseline_score - event.current_score > 0.02 ? 'text-amber-400' :
                          'text-green-400'
                        }`}>
                          {((event.baseline_score - event.current_score) * 100).toFixed(2)}%
                        </p>
                        {event.statistical_test?.p_value !== undefined && (
                          <p className="text-xs text-slate-500 mt-1">
                            p = {event.statistical_test.p_value.toFixed(4)}
                          </p>
                        )}
                      </div>
                    </div>
                    {event.impact_assessment && (
                      <div className="mt-3 pt-3 border-t border-slate-700">
                        <p className="text-xs text-slate-400 mb-1">Impact Assessment</p>
                        <p className="text-sm text-slate-300">
                          {event.impact_assessment.affected_reports_count || 0} reports affected
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Canary Status */}
          <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-slate-200 mb-4">Canary Status</h3>
            {canaries.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p>No canaries configured</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {canaries.map((canary) => {
                  const canaryEvents = driftEvents.filter(e => e.canary_id === canary.canary_id);
                  const latestEvent = canaryEvents[0];
                  const isDrifting = latestEvent && (
                    latestEvent.alert_level === 'critical' || latestEvent.alert_level === 'warning'
                  );

                  return (
                    <div
                      key={canary.canary_id}
                      onClick={() => setSelectedCanary(
                        selectedCanary === canary.canary_id ? null : canary.canary_id
                      )}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                        isDrifting
                          ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
                          : 'bg-slate-900/50 border-slate-700 hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-slate-200">
                          {canary.canary_id}
                        </span>
                        {isDrifting ? (
                          <AlertTriangle size={16} className="text-red-400" />
                        ) : (
                          <CheckCircle size={16} className="text-green-400" />
                        )}
                      </div>
                      <div className="text-sm text-slate-400 space-y-1">
                        <div className="flex justify-between">
                          <span>Baseline Score:</span>
                          <span className="text-slate-200 font-mono">
                            {(canary.baseline_score * 100).toFixed(1)}%
                          </span>
                        </div>
                        {latestEvent && (
                          <div className="flex justify-between">
                            <span>Current Score:</span>
                            <span className="text-slate-200 font-mono">
                              {(latestEvent.current_score * 100).toFixed(1)}%
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span>Monitoring Since:</span>
                          <span className="text-slate-200 text-xs">
                            {new Date(canary.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timeline Visualization */}
          {selectedCanary && timelineData.length > 0 && (
            <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-4">Drift Timeline</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fill: '#94a3b8' }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                      labelStyle={{ color: '#cbd5e1' }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#ef4444' }}
                      name="Drift Magnitude"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {loading && (
            <div className="text-center py-8 text-slate-400">
              Loading canary data...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CanaryDashboard;

