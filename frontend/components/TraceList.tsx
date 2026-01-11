import React from 'react';
import { Trace } from '../types';
import { AlertCircle, CheckCircle, HelpCircle, ArrowRight, AlertTriangle, XCircle, Scale } from 'lucide-react';
import { CATEGORY_STYLES } from '../constants';

/**
 * Format timestamp to compact readable format
 */
function formatTimestamp(timestamp: string): string {
  if (!timestamp) return '—';
  // Handle relative timestamps like "Yesterday", "10:42 AM"
  if (timestamp.toLowerCase().includes('yesterday') || timestamp.includes('AM') || timestamp.includes('PM')) {
    return timestamp;
  }
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return timestamp;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return timestamp;
  }
}

interface TraceListProps {
  traces: Trace[];
  onSelectTrace: (trace: Trace) => void;
}

const TraceList: React.FC<TraceListProps> = ({ traces, onSelectTrace }) => {
  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-xl border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50 text-xs uppercase tracking-wider text-slate-500">
                <th className="p-3 font-semibold">Timestamp</th>
                <th className="p-3 font-semibold">Conversation ID</th>
                <th className="p-3 font-semibold">Msgs</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold text-center">Agreement</th>
                <th className="p-3 font-semibold text-right">Risk</th>
                <th className="p-3 font-semibold"></th>
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
                    case 'review':
                      if (style) {
                         return (
                            <div className="flex items-center gap-2">
                               <HelpCircle size={16} className="text-amber-500" />
                               <span className={`px-2 py-0.5 rounded text-xs font-bold border ${style.borderColor} ${style.bgColor} ${style.color}`}>
                                 {style.label}
                               </span>
                            </div>
                         );
                      }
                      return (
                        <div className="flex items-center gap-2 text-amber-500/80">
                           <HelpCircle size={16} />
                           <span className="text-xs font-medium">Review</span>
                        </div>
                      );
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
                      ${trace.status === 'flagged' || trace.status === 'confirmed' || trace.status === 'review' ? 'bg-red-500/5' : 'bg-transparent'}
                    `}
                  >
                    <td className="p-3 text-xs text-slate-400 whitespace-nowrap">
                      {formatTimestamp(trace.timestamp)}
                    </td>
                    <td className="p-3 text-xs font-mono text-slate-300">
                      {trace.id}
                    </td>
                    <td className="p-3 text-xs text-slate-400">
                      {trace.messageCount}
                    </td>
                    <td className="p-3">
                      {renderStatus()}
                    </td>
                    <td className="p-3 text-center">
                      {trace.crossValidation?._meta?.agreement_rate !== undefined ? (
                        <span className={`text-xs font-mono font-bold flex items-center justify-center gap-1 ${
                          trace.crossValidation._meta.agreement_rate >= 0.8 ? 'text-green-400' :
                          trace.crossValidation._meta.agreement_rate >= 0.5 ? 'text-yellow-400' : 'text-orange-400'
                        }`}>
                          <Scale size={12} />
                          {Math.round(trace.crossValidation._meta.agreement_rate * 100)}%
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${trace.riskScore > 70 ? 'bg-red-500' : trace.riskScore > 30 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${trace.riskScore}%` }}
                          />
                        </div>
                        <span className={`text-xs font-mono font-bold ${trace.riskScore > 70 ? 'text-red-400' : 'text-slate-400'}`}>
                          {trace.riskScore}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <ArrowRight size={16} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
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