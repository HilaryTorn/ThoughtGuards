import React from 'react';
import { Trace } from '../types';
import { AlertCircle, CheckCircle, HelpCircle, ArrowRight, AlertTriangle, XCircle, FileText } from 'lucide-react';
import { CATEGORY_STYLES } from '../constants';

interface TraceListProps {
  traces: Trace[];
  onSelectTrace: (trace: Trace) => void;
  onViewReport?: (trace: Trace) => void;
}

const TraceList: React.FC<TraceListProps> = ({ traces, onSelectTrace, onViewReport }) => {
  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-xl border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50 text-xs uppercase tracking-wider text-slate-500">
                <th className="p-4 font-semibold">Timestamp</th>
                <th className="p-4 font-semibold">Conversation ID</th>
                <th className="p-4 font-semibold">Messages</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold text-right">Risk Score</th>
                <th className="p-4 font-semibold">Statistics</th>
                <th className="p-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {traces.map((trace) => {
                const style = trace.detectionEvent 
                  ? CATEGORY_STYLES[trace.detectionEvent.category] 
                  : null;

                const renderStatus = () => {
                  switch (trace.status) {
                    case 'confirmed':
                      return (
                        <div className="flex items-center gap-2 text-amber-500">
                           <AlertTriangle size={16} />
                           <span className="text-xs font-bold uppercase tracking-wide">Confirmed Manipulation</span>
                        </div>
                      );
                    case 'reviewed':
                      return (
                        <div className="flex items-center gap-2 text-emerald-400">
                           <CheckCircle size={16} />
                           <span className="text-xs font-bold uppercase tracking-wide">Reviewed</span>
                        </div>
                      );
                    case 'false_positive':
                      return (
                        <div className="flex items-center gap-2 text-slate-400">
                           <XCircle size={16} />
                           <span className="text-xs font-bold uppercase tracking-wide">False Positive</span>
                        </div>
                      );
                    case 'clean':
                      return (
                        <div className="flex items-center gap-2 text-emerald-500/80">
                           <CheckCircle size={16} />
                           <span className="text-xs font-medium">Clean</span>
                        </div>
                      );
                    case 'flagged':
                      if (style) {
                         return (
                            <div className="flex items-center gap-2">
                               <AlertCircle size={16} className="text-red-500" />
                               <span className={`px-2 py-0.5 rounded text-xs font-bold border ${style.borderColor} ${style.bgColor} ${style.color}`}>
                                 {style.label}
                               </span>
                            </div>
                         );
                      }
                      return null;
                    default:
                      return (
                        <div className="flex items-center gap-2 text-amber-500/80">
                           <HelpCircle size={16} />
                           <span className="text-xs font-medium">Review</span>
                        </div>
                      );
                  }
                };

                return (
                  <tr 
                    key={trace.id} 
                    onClick={() => onSelectTrace(trace)}
                    className={`
                      cursor-pointer transition-colors hover:bg-slate-800/50 group
                      ${trace.status === 'flagged' || trace.status === 'confirmed' ? 'bg-red-500/5' : 'bg-transparent'}
                    `}
                  >
                    <td className="p-4 text-sm text-slate-400 font-mono whitespace-nowrap">
                      {trace.timestamp}
                    </td>
                    <td className="p-4 text-sm font-mono text-slate-300">
                      {trace.id}
                    </td>
                    <td className="p-4 text-sm text-slate-400">
                      {trace.messageCount}
                    </td>
                    <td className="p-4">
                      {renderStatus()}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${trace.riskScore > 70 ? 'bg-red-500' : trace.riskScore > 30 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                            style={{ width: `${trace.riskScore}%` }}
                          />
                        </div>
                        <span className={`text-sm font-mono font-bold ${trace.riskScore > 70 ? 'text-red-400' : 'text-slate-400'}`}>
                          {trace.riskScore}%
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      {(() => {
                        const statistics = (trace as any).statistics;
                        const runCount = (trace as any).runCount || 1;
                        const isMultiRun = runCount > 1;
                        
                        if (!isMultiRun || !statistics) {
                          return <span className="text-xs text-slate-500">Single run</span>;
                        }
                        
                        const variance = statistics.stddev || 0;
                        const varianceLevel = variance < 0.05 ? 'low' : variance < 0.15 ? 'medium' : 'high';
                        const varianceColor = varianceLevel === 'low' ? 'text-green-400' : varianceLevel === 'medium' ? 'text-amber-400' : 'text-red-400';
                        
                        return (
                          <div className="text-xs space-y-1">
                            <div className="font-mono text-slate-300">
                              {(statistics.mean * 100).toFixed(1)}% ± {(statistics.stddev * 100).toFixed(1)}%
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${varianceColor} bg-slate-800`}>
                                {varianceLevel} variance
                              </span>
                              <span className="text-slate-500">{runCount} runs</span>
                            </div>
                            {statistics.confidenceInterval && (
                              <div className="text-[10px] text-slate-500 font-mono">
                                CI: [{(statistics.confidenceInterval.lower * 100).toFixed(1)}%, {(statistics.confidenceInterval.upper * 100).toFixed(1)}%]
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        {trace.auditId && onViewReport && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onViewReport(trace);
                            }}
                            className="px-3 py-1.5 text-xs bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-600/50 rounded-lg transition-colors flex items-center gap-1.5"
                            title="View full audit report"
                          >
                            <FileText size={14} />
                            Report
                          </button>
                        )}
                        <ArrowRight size={16} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TraceList;