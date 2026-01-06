import React, { useState, useEffect } from 'react';
import { X, GripVertical, ArrowRight, Plus, Trash2, Download } from 'lucide-react';
import { AuditReport } from '../types';
import { compareMultipleReports, ComparisonSummary } from '../lib/reportComparator';

interface ReportComparisonViewProps {
  conversationId?: string;
  initialReports?: AuditReport[];
  onClose?: () => void;
}

const ReportComparisonView: React.FC<ReportComparisonViewProps> = ({
  conversationId,
  initialReports = [],
  onClose
}) => {
  const [availableReports, setAvailableReports] = useState<AuditReport[]>([]);
  const [selectedReports, setSelectedReports] = useState<AuditReport[]>(initialReports);
  const [comparison, setComparison] = useState<ComparisonSummary | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAvailableReports();
  }, [conversationId]);

  useEffect(() => {
    if (selectedReports.length >= 2) {
      try {
        const comp = compareMultipleReports(selectedReports);
        setComparison(comp);
      } catch (error) {
        console.error('Error comparing reports:', error);
        setComparison(null);
      }
    } else {
      setComparison(null);
    }
  }, [selectedReports]);

  const loadAvailableReports = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (conversationId) {
        params.append('conversation_id', conversationId);
      }
      params.append('limit', '100');
      
      const response = await fetch(`/api/audit-reports?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setAvailableReports(data.reports || []);
      }
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddReport = (report: AuditReport) => {
    if (!selectedReports.find(r => r.report_id === report.report_id)) {
      setSelectedReports([...selectedReports, report]);
    }
  };

  const handleRemoveReport = (reportId: string) => {
    setSelectedReports(selectedReports.filter(r => r.report_id !== reportId));
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;

    const newReports = [...selectedReports];
    const draggedItem = newReports[draggedIndex];
    newReports.splice(draggedIndex, 1);
    newReports.splice(index, 0, draggedItem);
    setSelectedReports(newReports);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleExport = () => {
    if (!comparison) return;
    
    const exportData = {
      comparison: {
        scoreDifference: comparison.scoreDifference,
        parameterDifferences: Object.fromEntries(comparison.parameterDifferences),
        detectedTypesDifference: comparison.detectedTypesDifference
      },
      reports: selectedReports.map(r => ({
        report_id: r.report_id,
        overall_score: r.overall_score,
        model_name: r.model_name,
        skill_id: r.skill_id,
        llm_parameters: r.llm_parameters
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-comparison-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getScoreColor = (score: number) => {
    if (score > 0.7) return 'text-red-400';
    if (score > 0.4) return 'text-yellow-400';
    return 'text-green-400';
  };

  return (
    <div className={`${onClose ? 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4' : ''}`}>
      <div className={`bg-slate-900 rounded-xl border border-slate-700 ${onClose ? 'w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col' : 'w-full'}`}>
        {onClose && (
          <div className="flex items-center justify-between p-6 border-b border-slate-800">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Report Comparison</h2>
              <p className="text-sm text-slate-400 mt-1">
                Drag and drop reports to reorder • Select at least 2 reports to compare
              </p>
            </div>
            <div className="flex items-center gap-2">
              {comparison && (
                <button
                  onClick={handleExport}
                  className="px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/50 rounded-lg text-sm flex items-center gap-2"
                >
                  <Download size={16} />
                  Export
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
        )}

        <div className={`${onClose ? 'flex-1 overflow-y-auto p-6' : 'p-6'} space-y-6`}>
          {/* Selected Reports (Draggable) */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-200">Selected Reports</h3>
            {selectedReports.length === 0 ? (
              <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
                <p>No reports selected. Add reports from the list below to compare.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedReports.map((report, index) => (
                  <div
                    key={report.report_id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`bg-slate-950/50 border border-slate-700 rounded-lg p-4 flex items-center gap-4 cursor-move transition-all ${
                      draggedIndex === index ? 'opacity-50' : 'hover:border-cyan-500/50'
                    }`}
                  >
                    <GripVertical size={20} className="text-slate-500 flex-shrink-0" />
                    <div className="flex-1 grid grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Report ID</p>
                        <code className="text-sm text-slate-300 font-mono">
                          {report.report_id.substring(0, 16)}...
                        </code>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Model</p>
                        <p className="text-sm text-slate-200">{report.model_name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Skill</p>
                        <p className="text-sm text-slate-200">{report.skill_id}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Score</p>
                        <p className={`text-lg font-mono font-bold ${getScoreColor(report.overall_score)}`}>
                          {(report.overall_score * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveReport(report.report_id)}
                      className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comparison Results */}
          {comparison && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-200">Comparison Results</h3>
              
              {/* Summary */}
              <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
                <h4 className="text-md font-semibold text-slate-200 mb-4">Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Score Range</p>
                    <p className="text-lg font-mono text-slate-200">
                      {(comparison.scoreDifference.absolute * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Statistically Significant</p>
                    <p className={`text-sm ${comparison.scoreDifference.isSignificant ? 'text-red-400' : 'text-green-400'}`}>
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

              {/* Parameter Differences */}
              {comparison.parameterDifferences.size > 0 && (
                <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
                  <h4 className="text-md font-semibold text-slate-200 mb-4">Parameter Differences</h4>
                  <div className="space-y-2">
                    {Array.from(comparison.parameterDifferences.entries()).map(([param, diff]: [string, any]) => (
                      <div key={param} className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-slate-300 capitalize">{param}</span>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            {diff.values && diff.values.length > 0 && (
                              <>
                                <span className="font-mono">{String(diff.values[0])}</span>
                                {diff.values.length > 1 && (
                                  <>
                                    <ArrowRight size={12} />
                                    <span className="font-mono">{String(diff.values[diff.values.length - 1])}</span>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detected Types Differences */}
              {(comparison.detectedTypesDifference.added.length > 0 || 
                comparison.detectedTypesDifference.removed.length > 0) && (
                <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-6">
                  <h4 className="text-md font-semibold text-slate-200 mb-4">Detected Types Differences</h4>
                  <div className="space-y-3">
                    {comparison.detectedTypesDifference.added.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-green-400 mb-2">Added Types</p>
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
                    {comparison.detectedTypesDifference.removed.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-red-400 mb-2">Removed Types</p>
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
              )}
            </div>
          )}

          {/* Available Reports to Add */}
          {selectedReports.length < availableReports.length && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-200">Available Reports</h3>
              <div className="bg-slate-950/50 border border-slate-700 rounded-lg p-4">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {availableReports
                    .filter(r => !selectedReports.find(sr => sr.report_id === r.report_id))
                    .map((report) => (
                      <div
                        key={report.report_id}
                        className="bg-slate-900/50 border border-slate-700 rounded-lg p-3 flex items-center justify-between hover:border-cyan-500/50 transition-colors"
                      >
                        <div className="flex-1 grid grid-cols-4 gap-4">
                          <div>
                            <code className="text-xs text-slate-400 font-mono">
                              {report.report_id.substring(0, 16)}...
                            </code>
                          </div>
                          <div>
                            <p className="text-xs text-slate-300">{report.model_name}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-300">{report.skill_id}</p>
                          </div>
                          <div>
                            <p className={`text-sm font-mono font-bold ${getScoreColor(report.overall_score)}`}>
                              {(report.overall_score * 100).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleAddReport(report)}
                          className="p-2 hover:bg-cyan-500/20 text-cyan-400 rounded-lg transition-colors"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="text-center py-8 text-slate-400">
              Loading reports...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportComparisonView;

