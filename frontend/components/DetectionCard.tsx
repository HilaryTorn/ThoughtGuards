import React, { useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare, ExternalLink, AlertCircle, TrendingDown, Glasses, Megaphone, Lock, Zap, LucideIcon } from 'lucide-react';
import { DetectionEvent, DetectionCategory, WHYCode, HOWCode, TARGETCode } from '../types';
import { CATEGORY_STYLES, WHY_VERBS, HOW_VERBS, TARGET_VERBS, LEGACY_CATEGORY_MAP } from '../constants';

// Helper to normalize legacy category names to new HOW verbs
function normalizeCategory(category: string): DetectionCategory {
  if (CATEGORY_STYLES[category as DetectionCategory]) {
    return category as DetectionCategory;
  }
  if (LEGACY_CATEGORY_MAP[category]) {
    return LEGACY_CATEGORY_MAP[category];
  }
  return 'Fabricated';
}

const Icons: Record<string, LucideIcon> = {
  AlertCircle,
  TrendingDown,
  Glasses,
  Megaphone,
  Lock,
  Zap
};

interface DetectionCardProps {
  event: DetectionEvent;
  onViewTrace: (eventId: string) => void;
}

const DetectionCard: React.FC<DetectionCardProps> = ({ event, onViewTrace }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  // Normalize legacy category names to new HOW verbs
  const normalizedCategory = normalizeCategory(event.category);
  const style = CATEGORY_STYLES[normalizedCategory];

  // Safety check (should always have style now with normalization)
  if (!style) {
    console.warn(`Unknown category: ${event.category}`);
    return null;
  }

  const Icon = Icons[style.icon];

  return (
    <div className={`glass-panel rounded-xl mb-4 overflow-hidden transition-all duration-300 ${isExpanded ? 'border-slate-600 shadow-lg shadow-black/40' : 'border-slate-800'}`}>
      {/* Header / Collapsed View */}
      <div 
        className="p-4 cursor-pointer hover:bg-slate-800/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Category Badge */}
            <span className={`px-2 py-1 rounded text-xs font-bold border ${style.borderColor} ${style.bgColor} ${style.color} whitespace-nowrap`}>
              {style.label}
            </span>
            
            {/* Snippet Preview */}
            <p className="text-slate-300 font-mono text-sm truncate flex-1 opacity-80">
              <span className="text-slate-500 mr-2">Thinking:</span>
              {event.snippet}
            </p>
          </div>

          <div className="flex items-center gap-4 w-full sm:w-auto justify-end">
            {/* Severity Score */}
            {(() => {
              const severity = event.severity ?? 0;
              const getSeverityColor = (sev: number) => {
                if (sev >= 5) return 'text-red-400 bg-red-500/20 border-red-500/50';
                if (sev >= 4) return 'text-orange-400 bg-orange-500/20 border-orange-500/50';
                if (sev >= 3) return 'text-amber-400 bg-amber-500/20 border-amber-500/50';
                if (sev >= 2) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
                if (sev >= 1) return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/50';
                return 'text-slate-500 bg-slate-500/20 border-slate-500/50';
              };
              return (
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Severity</div>
                  </div>
                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold border ${getSeverityColor(severity)}`}>
                    {severity > 0 ? severity : '—'}
                  </span>
                </div>
              );
            })()}

            <div className="text-slate-500 text-xs font-mono">{event.timestamp}</div>
            
            <button className="text-slate-400 hover:text-white transition-colors">
              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-slate-800 bg-slate-900/30 p-6 space-y-6 animate-in slide-in-from-top-2 duration-300">

          {/* Grid Layout for details */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left Col: Conversation History */}
            <div className="lg:col-span-2">
              <h4 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3 flex items-center gap-2">
                <MessageSquare size={14} /> Conversation
              </h4>
              <div className="bg-slate-950/30 rounded-lg border border-slate-800 p-4 space-y-3 max-h-80 overflow-y-auto">
                {event.conversationHistory.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-slate-700 text-slate-200 rounded-tr-none'
                        : 'bg-cyan-950/30 text-cyan-100 border border-cyan-900/50 rounded-tl-none'
                    }`}>
                      <div className="text-[10px] opacity-50 mb-1 uppercase tracking-wider font-bold">
                        {msg.role}
                      </div>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Col: Detected Issues */}
            <div className="space-y-4">
              <div className="glass-panel p-4 rounded-lg border border-slate-700/50">
                 <h4 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3 flex items-center gap-2">
                   <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                   Detected Issues ({event.matchedPatterns.length})
                 </h4>

                 <div className="space-y-3">
                   {/* Show top patterns (up to 4) */}
                   {event.matchedPatterns.filter(p => p && p !== 'none').slice(0, 4).map((pattern, idx) => {
                     const match = pattern.match(/^(T[1-4])\|(H[1-6])\|(W[1-4])$/);
                     if (match) {
                       const [, targetCode, howCode, whyCode] = match as [string, TARGETCode, HOWCode, WHYCode];
                       const howInfo = HOW_VERBS[howCode];
                       const whyInfo = WHY_VERBS[whyCode];
                       const targetInfo = TARGET_VERBS[targetCode];
                       const patternStyle = howInfo ? CATEGORY_STYLES[howInfo.category] : style;

                       return (
                         <div key={idx} className={`p-3 rounded-lg border ${patternStyle.borderColor} ${patternStyle.bgColor}`}>
                           <div className="flex items-center justify-between mb-1">
                             <span className={`text-sm font-semibold ${patternStyle.color}`}>
                               {howInfo?.verb || howCode}
                             </span>
                             <span className="text-xs text-slate-500 font-mono">{pattern}</span>
                           </div>
                           <p className="text-xs text-slate-400">
                             {targetInfo?.verb || targetCode} &bull; {whyInfo?.verb || whyCode}
                           </p>
                         </div>
                       );
                     }
                     // Fallback for non-standard patterns
                     return (
                       <div key={idx} className={`p-3 rounded-lg border ${style.borderColor} ${style.bgColor}`}>
                         <span className={`text-sm font-medium ${style.color}`}>{pattern}</span>
                       </div>
                     );
                   })}

                   {/* Show count if more than 4 */}
                   {event.matchedPatterns.length > 4 && (
                     <p className="text-xs text-slate-500 text-center pt-2">
                       +{event.matchedPatterns.length - 4} more issues
                     </p>
                   )}

                   {/* Fallback if no patterns */}
                   {event.matchedPatterns.length === 0 && (
                     <div className="flex items-center gap-2">
                       <div className={`p-1 rounded ${style.bgColor}`}>
                         {Icon && <Icon size={14} className={style.color} />}
                       </div>
                       <span className={`text-sm font-medium ${style.color}`}>{style.label}</span>
                     </div>
                   )}
                 </div>
              </div>
            </div>

          </div>

          {/* Full-width Action Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewTrace(event.id);
            }}
            className="flex items-center justify-center gap-2 w-full py-3 bg-slate-800 hover:bg-cyan-900/50 hover:text-cyan-400 border border-slate-700 rounded-lg transition-all duration-200 text-slate-300 font-medium group"
          >
            <ExternalLink size={16} />
            View Full Details
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default DetectionCard;