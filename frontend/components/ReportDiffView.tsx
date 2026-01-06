import React, { useState } from 'react';
import { X, ArrowRight, TrendingUp, TrendingDown, Minus, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { AuditReport } from '../types';
import { compareMultipleReports, ComparisonSummary, generateDiffSummary } from '../lib/reportComparator';

interface ReportDiffViewProps {
  reports: AuditReport[];
  onClose: () => void;
}

const ReportDiffView: React.FC<ReportDiffViewProps> = ({ reports, onClose }) => {
  const [selectedReports, setSelectedReports] = useState<Set<string>>(
    new Set(reports.slice(0, Math.min(2, reports.length)).map(r => r.report_id))
  );

  const selectedReportsList = reports.filter(r => selectedReports.has(r.report_id));
  const comparison: ComparisonSummary | null = selectedReportsList.length >= 2
    ? compareMultipleReports(selectedReportsList)
    : null;

  const getScoreColor = (score: number) => {
    if (score > 0.7) return 'text-red-400';
    if (score > 0.4) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getDiffColor = (diff: number) => {
    if (Math.abs(diff) < 0.05) return 'text-slate-400';
    if (diff > 0) return 'text-red-400';
    return 'text-green-400';
  };

  const formatParameterValue = (value: any): string => {
    if (value === undefined || value === null) return 'N/A';
    if (typeof value === 'number') return value.toFixed(3);
    if (Array.isArray(value)) return `[${value.join(', ')}]`;
    return String(value);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-100">Report Comparison</h2>
            <p className="text-sm text-slate-400 mt-1">
              Comparing {selectedReports.size} report{selectedReports.size !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Report Selection */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/50">
          <p className="text-sm text-slate-400 mb-2">Select reports to compare:</p>
          <div className="flex flex-wrap gap-2">
            {reports.map(report => (
              <button
                key={report.report_id}
                onClick={() => {
                  const newSelected = new Set(selectedReports);
                  if (newSelected.has(report.report_id)) {
                    if (newSelected.size > 1) {
                      newSelected.delete(report.report_id);
                    }
                  } else {
                    newSelected.add(report.report_id);
                  }
                  setSelectedReports(newSelected);
                }}
                className={`px-3 py-1 rounded-lg text-sm border transition-colors ${
                  selectedReports.has(report.report_id)
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {report.report_id.substring(0, 12)}... ({report.model_name})
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {selectedReports.size < 2 ? (
            <div className="text-center py-12 text-slate-400">
              <AlertCircle size={48} className="mx-auto mb-4 text-slate-600" />
              <p>Select at least 2 reports to compare</p>
            </div>
          ) : comparison ? (
            <>
              {/* Summary */}
              <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Comparison Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Score Range</p>
                    <p className={`text-lg font-mono ${getDiffColor(comparison.scoreDifference.absolute)}`}>
                      {(comparison.scoreDifference.absolute * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Statistically Significant</p>
                    <p className={`text-sm flex items-center gap-1 ${
                      comparison.scoreDifference.isSignificant ? 'text-red-400' : 'text-green-400'
                    }`}>
                      {comparison.scoreDifference.isSignificant ? (
                        <AlertCircle size={16} />
                      ) : (
                        <CheckCircle size={16} />
                      )}
                      {comparison.scoreDifference.isSignificant ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Added Types</p>
                    <p className="text-sm text-slate-200">
                      {comparison.detectedTypesDifference.added.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Removed Types</p>
                    <p className="text-sm text-slate-200">
                      {comparison.detectedTypesDifference.removed.length}
                    </p>
                  </div>
                </div>
              </div>

              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reports.filter(r => selectedReports.has(r.report_id)).map((report, idx) => (
                  <div key={report.report_id} className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="font-semibold text-slate-200">Report {idx + 1}</h4>
                        <p className="text-xs text-slate-400 font-mono mt-1">
                          {report.report_id.substring(0, 16)}...
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Score</p>
                        <p className={`text-lg font-mono ${getScoreColor(report.overall_score)}`}>
                          {(report.overall_score * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    {/* Model & Skill */}
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Model:</span>
                        <span className="text-slate-200">{report.model_name}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Skill:</span>
                        <span className="text-slate-200">{report.skill_id}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Version:</span>
                        <span className="text-slate-200 font-mono">{report.skill_version}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Date:</span>
                        <span className="text-slate-200 text-xs">
                          {new Date(report.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Parameters */}
                    <div className="border-t border-slate-700 pt-4">
                      <h5 className="text-sm font-semibold text-slate-300 mb-2">LLM Parameters</h5>
                      <div className="space-y-1 text-xs">
                        {report.llm_parameters.temperature !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Temperature:</span>
                            <span className="text-slate-200 font-mono">
                              {report.llm_parameters.temperature}
                            </span>
                          </div>
                        )}
                        {report.llm_parameters.top_p !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Top P:</span>
                            <span className="text-slate-200 font-mono">
                              {report.llm_parameters.top_p}
                            </span>
                          </div>
                        )}
                        {report.llm_parameters.seed !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Seed:</span>
                            <span className="text-slate-200 font-mono">
                              {report.llm_parameters.seed}
                            </span>
                          </div>
                        )}
                        {report.llm_parameters.max_tokens !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Max Tokens:</span>
                            <span className="text-slate-200 font-mono">
                              {report.llm_parameters.max_tokens}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Detected Types */}
                    {report.detected_types && report.detected_types.length > 0 && (
                      <div className="border-t border-slate-700 pt-4 mt-4">
                        <h5 className="text-sm font-semibold text-slate-300 mb-2">Detected Types</h5>
                        <div className="flex flex-wrap gap-2">
                          {report.detected_types.slice(0, 5).map((dt: any, dtIdx: number) => (
                            <span
                              key={dtIdx}
                              className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-xs"
                            >
                              {dt.type}: {(dt.score * 100).toFixed(0)}%
                            </span>
                          ))}
                          {report.detected_types.length > 5 && (
                            <span className="px-2 py-1 bg-slate-800 text-slate-500 rounded text-xs">
                              +{report.detected_types.length - 5} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Cache Status */}
                    <div className="border-t border-slate-700 pt-4 mt-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Cache:</span>
                        <span className={report.cache_hit ? 'text-green-400' : 'text-slate-500'}>
                          {report.cache_hit ? 'Hit' : 'Miss'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Parameter Differences */}
              {comparison.parameterDifferences && comparison.parameterDifferences.size > 0 && (
                <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-slate-200 mb-4">Parameter Differences</h3>
                  <div className="space-y-2">
                    {Array.from(comparison.parameterDifferences.entries()).map(([param, diff]: [string, any], idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-slate-900/50 rounded">
                        <span className="text-sm text-slate-300 capitalize">{param}:</span>
                        <div className="flex items-center gap-2">
                          {diff.values && diff.values.length > 0 && (
                            <>
                              <span className="text-xs text-slate-400 font-mono">
                                {formatParameterValue(diff.values[0])}
                              </span>
                              {diff.values.length > 1 && (
                                <>
                                  <ArrowRight size={14} className="text-slate-500" />
                                  <span className="text-xs text-slate-400 font-mono">
                                    {formatParameterValue(diff.values[diff.values.length - 1])}
                                  </span>
                                  {diff.values.length > 2 && (
                                    <span className="text-xs text-slate-500">
                                      (+{diff.values.length - 2} more)
                                    </span>
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detected Types Comparison */}
              <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Detected Types Comparison</h3>
                <div className="space-y-4">
                  {/* Added Types */}
                  {comparison.detectedTypesDifference.added.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-green-300 mb-2">Added Types</h4>
                      <div className="flex flex-wrap gap-2">
                        {comparison.detectedTypesDifference.added.map((type: string, idx: number) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-green-500/20 text-green-400 border border-green-500/50 rounded text-xs"
                          >
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Removed Types */}
                  {comparison.detectedTypesDifference.removed.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-red-300 mb-2">Removed Types</h4>
                      <div className="flex flex-wrap gap-2">
                        {comparison.detectedTypesDifference.removed.map((type: string, idx: number) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-red-500/20 text-red-400 border border-red-500/50 rounded text-xs"
                          >
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Diff Summary */}
              <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-slate-200 mb-4">Detailed Differences</h3>
                <div className="space-y-2 text-sm text-slate-300 whitespace-pre-wrap font-mono">
                  {generateDiffSummary(comparison)}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportDiffView;

