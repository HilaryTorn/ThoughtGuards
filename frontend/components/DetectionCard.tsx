import React, { useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare, ExternalLink, BrainCircuit, Target, VenetianMask, Gift, Bomb, CloudFog, Tent, LucideIcon, Check, Minus } from 'lucide-react';
import { DetectionEvent } from '../types';
import { CATEGORY_STYLES, PATTERNS_BY_CATEGORY } from '../constants';

const Icons: Record<string, LucideIcon> = {
  Target,
  VenetianMask,
  Gift,
  Bomb,
  CloudFog,
  Tent
};

interface DetectionCardProps {
  event: DetectionEvent;
  onViewTrace: (eventId: string) => void;
}

const DetectionCard: React.FC<DetectionCardProps> = ({ event, onViewTrace }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const style = CATEGORY_STYLES[event.category];
  
  // If category doesn't exist in CATEGORY_STYLES, return null or use default
  if (!style) {
    console.warn(`Unknown category: ${event.category}`);
    return null;
  }
  
  const Icon = Icons[style.icon];

  // Helper to highlight specific snippets in full text
  const renderFullCoT = (text: string, snippet: string) => {
      const cleanSnippet = snippet.replace(/^\.\.\.|\.\.\.$/g, '');
      const parts = text.split(cleanSnippet);
      
      if (parts.length > 1) {
          return (
              <span>
                  {parts[0]}
                  <span className={`${style.color} bg-white/5 px-1 rounded border border-white/10`}>
                      {cleanSnippet}
                  </span>
                  {parts[1]}
              </span>
          );
      }
      return text;
  };

  // Get available patterns for this category
  const allPatterns = PATTERNS_BY_CATEGORY[event.category];
  // Sort patterns: matched first, then others
  const sortedPatterns = [...allPatterns].sort((a, b) => {
    const aMatched = event.matchedPatterns.includes(a);
    const bMatched = event.matchedPatterns.includes(b);
    if (aMatched && !bMatched) return -1;
    if (!aMatched && bMatched) return 1;
    return 0;
  });

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
            {/* Risk Score */}
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className={`text-sm font-bold ${event.riskScore > 80 ? 'text-red-400' : 'text-amber-400'}`}>
                  {event.riskScore}%
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Risk</div>
              </div>
              <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${event.riskScore > 80 ? 'bg-red-500' : 'bg-amber-500'}`} 
                  style={{ width: `${event.riskScore}%` }}
                />
              </div>
            </div>

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
            
            {/* Left Col: Conversation History & CoT */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Conversation History */}
              <div>
                <h4 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3 flex items-center gap-2">
                  <MessageSquare size={14} /> Context Window
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

              {/* Chain of Thought */}
              <div>
                <h4 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-2">
                  <BrainCircuit size={14} /> Internal Reasoning Trace
                </h4>
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words max-h-96 overflow-y-auto custom-scrollbar">
                  {renderFullCoT(event.fullCoT, event.snippet)}
                </div>
              </div>

              {/* Action Button */}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onViewTrace(event.id);
                }}
                className="flex items-center justify-center gap-2 w-full py-3 bg-slate-800 hover:bg-cyan-900/50 hover:text-cyan-400 border border-slate-700 rounded-lg transition-all duration-200 text-slate-300 font-medium group"
              >
                <ExternalLink size={16} />
                View Full Trace & Analysis
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </button>

            </div>

            {/* Right Col: Analysis */}
            <div className="space-y-4">
              <div className="glass-panel p-4 rounded-lg border border-slate-700/50">
                 <h4 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3 flex items-center gap-2">
                   <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                   Detection Logic: {style.label.toUpperCase()}
                 </h4>
                 
                 <div className="space-y-3">
                   {/* Patterns List */}
                   {sortedPatterns.map((pattern, idx) => {
                     const isMatched = event.matchedPatterns.includes(pattern);
                     // Only show first 3 items in the card view to keep it compact, unless matched
                     if (!isMatched && idx > 2) return null;

                     return (
                        <div key={pattern} className="flex items-start gap-3">
                          <div className={`mt-0.5 ${isMatched ? 'text-green-400' : 'text-slate-600'}`}>
                            {isMatched ? <Check size={16} strokeWidth={3} /> : <Minus size={16} />}
                          </div>
                          <div>
                             <p className={`text-sm ${isMatched ? 'text-slate-200 font-medium' : 'text-slate-500'}`}>
                               {pattern}
                             </p>
                          </div>
                        </div>
                     );
                   })}
                 </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default DetectionCard;