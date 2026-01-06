import React, { useState } from 'react';
import { X, BarChart3, TrendingUp, TrendingDown, Info, Download, RefreshCw } from 'lucide-react';
import { AggregateReport, ParameterEffectAnalysis } from '../types';
import { exportAggregateAsLaTeX, exportReportsAsCSV } from '../lib/exportFormats';

interface AggregateReportViewProps {
  aggregate: AggregateReport;
  sourceReports?: any[]; // AuditReport[]
  onClose: () => void;
  onRecompute?: () => void;
}

const AggregateReportView: React.FC<AggregateReportViewProps> = ({
  aggregate,
  sourceReports,
  onClose,
  onRecompute
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'distribution' | 'parameters' | 'types'>('summary');

  const handleExportLaTeX = () => {
    const latex = exportAggregateAsLaTeX(aggregate);
    const blob = new Blob([latex], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aggregate-${aggregate.aggregate_id}.tex`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (!sourceReports || sourceReports.length === 0) return;
    const csv = exportReportsAsCSV(sourceReports);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aggregate-${aggregate.aggregate_id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Aggregate Report</h2>
            <p className="text-sm text-slate-400 mt-1">
              {aggregate.aggregate_id} • {aggregate.source_count} source report{aggregate.source_count !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onRecompute && (
              <button
                onClick={onRecompute}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm flex items-center gap-2 transition-colors"
              >
                <RefreshCw size={16} />
                Recompute
              </button>
            )}
            <button
              onClick={handleExportLaTeX}
              className="px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg text-sm flex items-center gap-2 transition-colors"
            >
              <Download size={16} />
              Export LaTeX
            </button>
            {sourceReports && sourceReports.length > 0 && (
              <button
                onClick={handleExportCSV}
                className="px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg text-sm flex items-center gap-2 transition-colors"
              >
                <Download size={16} />
                Export CSV
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          {(['summary', 'distribution', 'parameters', 'types'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium transition-colors capitalize ${
                activeTab === tab
                  ? 'text-cyan-400 border-b-2 border-cyan-500'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'summary' && (
            <div className="space-y-6">
              {/* Aggregated Score */}
              {aggregate.aggregated_score !== undefined && (
                <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-slate-200 mb-4">Aggregated Score</h3>
                  <div className="text-4xl font-mono font-bold text-cyan-400">
                    {(aggregate.aggregated_score * 100).toFixed(2)}%
                  </div>
                  <p className="text-sm text-slate-400 mt-2">
                    Based on {aggregate.source_count} report{aggregate.source_count !== 1 ? 's' : ''} using {aggregate.aggregation_config.method} method
                  </p>
                </div>
              )}

              {/* Distribution Summary */}
              {aggregate.score_distribution && (
                <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                    <BarChart3 size={20} className="text-purple-500" />
                    Score Distribution
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Mean</p>
                      <p className="text-lg font-mono text-slate-200">
                        {(aggregate.score_distribution.mean * 100).toFixed(2)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Std Dev</p>
                      <p className="text-lg font-mono text-slate-200">
                        {(aggregate.score_distribution.stddev * 100).toFixed(2)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Median (P50)</p>
                      <p className="text-lg font-mono text-slate-200">
                        {(aggregate.score_distribution.p50 * 100).toFixed(2)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">IQR (P25-P75)</p>
                      <p className="text-lg font-mono text-slate-200 text-sm">
                        {(aggregate.score_distribution.p25 * 100).toFixed(1)}% - {(aggregate.score_distribution.p75 * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">5th Percentile</p>
                      <p className="text-lg font-mono text-slate-200">
                        {(aggregate.score_distribution.p5 * 100).toFixed(2)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">95th Percentile</p>
                      <p className="text-lg font-mono text-slate-200">
                        {(aggregate.score_distribution.p95 * 100).toFixed(2)}%
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-slate-500 mb-1">95% Confidence Interval</p>
                      <p className="text-lg font-mono text-slate-200">
                        [{(aggregate.score_distribution.ci_lower * 100).toFixed(2)}%, {(aggregate.score_distribution.ci_upper * 100).toFixed(2)}%]
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Aggregation Config */}
              <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Aggregation Configuration</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Method:</span>
                    <span className="text-slate-200 font-mono">{aggregate.aggregation_config.method}</span>
                  </div>
                  {aggregate.aggregation_config.group_by && aggregate.aggregation_config.group_by.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Group By:</span>
                      <span className="text-slate-200">{aggregate.aggregation_config.group_by.join(', ')}</span>
                    </div>
                  )}
                  {aggregate.computation_duration_ms !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Computation Time:</span>
                      <span className="text-slate-200">{aggregate.computation_duration_ms}ms</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Created:</span>
                    <span className="text-slate-200 text-xs">
                      {new Date(aggregate.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'distribution' && aggregate.score_distribution && (
            <div className="space-y-6">
              {/* Distribution Visualization Placeholder */}
              <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Distribution Visualization</h3>
                <div className="h-64 flex items-center justify-center text-slate-500 border-2 border-dashed border-slate-700 rounded-lg">
                  <div className="text-center">
                    <BarChart3 size={48} className="mx-auto mb-2 opacity-50" />
                    <p>Distribution chart would be rendered here</p>
                    <p className="text-xs mt-2">(Requires charting library integration)</p>
                  </div>
                </div>
              </div>

              {/* Quantile Details */}
              <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Quantile Breakdown</h3>
                <div className="space-y-3">
                  {[
                    { label: '5th Percentile', value: aggregate.score_distribution.p5 },
                    { label: '25th Percentile (Q1)', value: aggregate.score_distribution.p25 },
                    { label: '50th Percentile (Median)', value: aggregate.score_distribution.p50 },
                    { label: '75th Percentile (Q3)', value: aggregate.score_distribution.p75 },
                    { label: '95th Percentile', value: aggregate.score_distribution.p95 }
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between p-3 bg-slate-900/50 rounded">
                      <span className="text-sm text-slate-300">{label}</span>
                      <span className="text-lg font-mono text-slate-200">
                        {(value * 100).toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'parameters' && aggregate.parameter_effects && (
            <div className="space-y-6">
              <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                  <TrendingUp size={20} className="text-amber-500" />
                  Parameter Effects
                </h3>
                <div className="space-y-4">
                  {Object.entries(aggregate.parameter_effects).map(([param, effect]: [string, any]) => {
                    if (!effect || typeof effect !== 'object') return null;
                    return (
                      <div key={param} className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-slate-200 capitalize">{param}</h4>
                          <div className="flex items-center gap-2">
                            {effect.correlation > 0 ? (
                              <TrendingUp size={16} className="text-green-400" />
                            ) : effect.correlation < 0 ? (
                              <TrendingDown size={16} className="text-red-400" />
                            ) : (
                              <Info size={16} className="text-slate-400" />
                            )}
                            <span className={`text-sm font-mono ${
                              Math.abs(effect.correlation) > 0.3 ? 'text-cyan-400' : 'text-slate-400'
                            }`}>
                              r = {effect.correlation.toFixed(3)}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Effect Size</p>
                            <p className="text-slate-200 font-mono">{effect.effect_size.toFixed(3)}</p>
                          </div>
                          {effect.p_value !== undefined && (
                            <div>
                              <p className="text-xs text-slate-500 mb-1">P-value</p>
                              <p className={`font-mono ${
                                effect.p_value < 0.05 ? 'text-red-400' : 'text-slate-400'
                              }`}>
                                {effect.p_value.toFixed(4)}
                              </p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Samples</p>
                            <p className="text-slate-200 font-mono">{effect.samples}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Parameter Interactions */}
              {aggregate.parameter_effects.interactions && aggregate.parameter_effects.interactions.length > 0 && (
                <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-slate-200 mb-4">Parameter Interactions</h3>
                  <div className="space-y-3">
                    {aggregate.parameter_effects.interactions.map((interaction: any, idx: number) => (
                      <div key={idx} className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-300">
                            {interaction.parameters.join(' × ')}
                          </span>
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-slate-400">
                              Strength: <span className="font-mono text-slate-200">{interaction.interaction_strength.toFixed(3)}</span>
                            </span>
                            {interaction.p_value !== undefined && (
                              <span className={`text-sm font-mono ${
                                interaction.p_value < 0.05 ? 'text-red-400' : 'text-slate-400'
                              }`}>
                                p = {interaction.p_value.toFixed(4)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'types' && aggregate.detected_types_aggregated && (
            <div className="space-y-6">
              <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Aggregated Detected Types</h3>
                <div className="space-y-3">
                  {aggregate.detected_types_aggregated.map((dt: any, idx: number) => (
                    <div key={idx} className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200 capitalize">
                          {typeof dt === 'string' ? dt : dt.type || 'unknown'}
                        </span>
                        <span className="text-lg font-mono text-cyan-400">
                          {typeof dt === 'object' && dt.score !== undefined
                            ? (dt.score * 100).toFixed(1) + '%'
                            : 'N/A'}
                        </span>
                      </div>
                      {typeof dt === 'object' && dt.frequency !== undefined && (
                        <p className="text-xs text-slate-500 mt-2">
                          Detected in {dt.frequency} of {aggregate.source_count} reports
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {aggregate.notes && (
            <div className="mt-6 bg-slate-950/50 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-slate-200 mb-2">Notes</h3>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{aggregate.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AggregateReportView;

