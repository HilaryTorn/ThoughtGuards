import React, { useState } from 'react';
import { ArrowLeft, CheckCircle, AlertTriangle, XCircle, MessageSquare, BrainCircuit, Target, VenetianMask, Gift, Bomb, CloudFog, Tent, LucideIcon, Check, Minus, ChevronDown, ChevronRight } from 'lucide-react';
import { Trace, Message, DetectionCategory } from '../types';
import { CATEGORY_STYLES, PATTERNS_BY_CATEGORY } from '../constants';

interface TraceDetailProps {
  trace: Trace | null;
  onBack: () => void;
  onAction: (id: string, action: 'confirm' | 'review' | 'false_positive') => void;
}

const Icons: Record<string, LucideIcon> = {
  Target,
  VenetianMask,
  Gift,
  Bomb,
  CloudFog,
  Tent
};

const TraceDetail: React.FC<TraceDetailProps> = ({ trace, onBack, onAction }) => {
  const [showOtherCategories, setShowOtherCategories] = useState(false);

  if (!trace) return null;

  const event = trace.detectionEvent;
  const isFlagged = trace.status === 'flagged' || trace.status === 'confirmed' || trace.status === 'reviewed' || trace.status === 'false_positive';
  const catStyle = event && event.category in CATEGORY_STYLES ? CATEGORY_STYLES[event.category] : null;

  // Mock conversation padding for cleaner look if history is short
  const displayConversation: Message[] = trace.conversation.length < 5 
    ? [
        { role: 'user', content: "Hello", timestamp: "Start" },
        { role: 'assistant', content: "Hi there!", timestamp: "Start" },
        ...trace.conversation
      ]
    : trace.conversation;

  const renderStatusBadge = () => {
    if (trace.status === 'confirmed') {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border border-amber-500/50 bg-amber-500/20 text-amber-200 font-bold uppercase tracking-wide">
          <AlertTriangle size={12} /> Confirmed Manipulation
        </span>
      );
    }
    if (trace.status === 'reviewed') {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border border-emerald-500/50 bg-emerald-500/20 text-emerald-200 font-bold uppercase tracking-wide">
          <CheckCircle size={12} /> Reviewed
        </span>
      );
    }
    if (trace.status === 'false_positive') {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border border-slate-500/50 bg-slate-500/20 text-slate-300 font-bold uppercase tracking-wide">
          <XCircle size={12} /> False Positive
        </span>
      );
    }
    // Default Flagged State (show Category)
    if (catStyle) {
      return (
        <span className={`px-2 py-0.5 rounded text-xs border ${catStyle.borderColor} ${catStyle.bgColor} ${catStyle.color}`}>
          {catStyle.label}
        </span>
      );
    }
    // Clean
    return (
      <span className="px-2 py-0.5 rounded text-xs border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
        Clean Trace
      </span>
    );
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Detail Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-3">
              Trace #{trace.id}
              {renderStatusBadge()}
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-mono">Timestamp: {trace.timestamp} • Risk Score: {trace.riskScore}</p>
          </div>
        </div>
        
        {/* Actions Toolbar */}
        <div className="flex gap-3">
          {isFlagged && (
            <>
              {/* False Positive Button */}
              <button 
                onClick={() => onAction(trace.id, 'false_positive')}
                disabled={trace.status === 'false_positive'}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors border
                  ${trace.status === 'false_positive' 
                    ? 'bg-slate-800/50 text-slate-500 border-slate-800 cursor-not-allowed' 
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}
                `}
              >
                 <XCircle size={14} /> 
                 {trace.status === 'false_positive' ? 'False Positive ✓' : 'False Positive'}
              </button>

              {/* Confirm Manipulation Button */}
              <button 
                onClick={() => onAction(trace.id, 'confirm')}
                disabled={trace.status === 'confirmed'}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors border shadow-[0_0_15px_rgba(245,158,11,0.05)]
                  ${trace.status === 'confirmed'
                    ? 'bg-amber-900/20 text-amber-500/50 border-amber-900/20 cursor-not-allowed'
                    : 'bg-amber-900/30 hover:bg-amber-900/50 text-amber-300 border-amber-800'}
                `}
              >
                 <AlertTriangle size={14} /> 
                 {trace.status === 'confirmed' ? 'Confirmed ✓' : 'Confirm Manipulation'}
              </button>
            </>
          )}

          {/* Review Button */}
          <button 
            onClick={() => onAction(trace.id, 'review')}
            disabled={trace.status === 'reviewed'}
            className={`
              flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors border
              ${trace.status === 'reviewed'
                ? 'bg-emerald-900/20 text-emerald-500/50 border-emerald-900/20 cursor-not-allowed'
                : 'bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-300 border-cyan-800'}
            `}
          >
             <CheckCircle size={14} /> 
             {trace.status === 'reviewed' ? 'Reviewed ✓' : 'Mark Reviewed'}
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
        
        {/* LEFT: Conversation Thread */}
        <div className={`
          flex flex-col glass-panel rounded-xl border-slate-800 overflow-hidden h-full
          ${isFlagged && event ? 'col-span-5' : 'col-span-8 col-start-3'} 
        `}>
          <div className="p-4 border-b border-slate-800 bg-slate-900/50">
            <h3 className="font-semibold text-slate-300 flex items-center gap-2">
              <MessageSquare size={16} className="text-cyan-500" />
              Full Conversation Thread
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/30">
             {displayConversation.map((msg, idx) => {
               // Highlight the last interaction as the trigger if flagged
               const isTrigger = isFlagged && idx >= displayConversation.length - 2; 
               return (
                 <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                   <div className={`
                      max-w-[85%] px-4 py-3 rounded-2xl text-sm relative group
                      ${msg.role === 'user' 
                        ? 'bg-slate-800 text-slate-200 rounded-tr-sm' 
                        : 'bg-gradient-to-br from-slate-900 to-slate-900 border border-slate-800 text-slate-300 rounded-tl-sm'
                      }
                      ${isTrigger && msg.role === 'assistant' && catStyle ? `ring-1 ring-offset-2 ring-offset-slate-950 ${catStyle.borderColor.replace('border-', 'ring-')}` : ''}
                   `}>
                     <p>{msg.content}</p>
                     <span className="text-[10px] text-slate-500 mt-1 block opacity-0 group-hover:opacity-100 transition-opacity">
                       {msg.timestamp || '10:05 AM'}
                     </span>
                   </div>
                   <span className="text-[10px] text-slate-600 mt-1 px-1 uppercase tracking-wide font-bold">
                     {msg.role}
                   </span>
                 </div>
               );
             })}
          </div>
        </div>

        {/* RIGHT: Analysis Panel (Only if flagged and has event) */}
        {isFlagged && event && catStyle && (
          <div className="col-span-7 flex flex-col gap-6 overflow-y-auto pr-2 pb-6">
             
             {/* Internal Reasoning */}
             <div className="glass-panel rounded-xl border-slate-800 p-5 relative">
                <div className={`absolute top-0 left-0 w-1 h-full rounded-l-xl ${catStyle.bgColor.replace('bg-', 'bg-gradient-to-b from-')}`}></div>
                <h3 className="font-semibold text-slate-300 mb-4 flex items-center gap-2">
                  <BrainCircuit size={18} className={catStyle.color.replace('text-', 'text-')} />
                  Internal Reasoning Trace (Full)
                </h3>
                <div className="bg-slate-950 rounded-lg p-4 font-mono text-sm text-slate-300 leading-relaxed whitespace-pre-wrap break-words border border-slate-800/50 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {event.fullCoT}
                </div>
             </div>

             {/* Logic Breakdown */}
             <div className="glass-panel p-5 rounded-xl border-slate-800">
               <h3 className="font-semibold text-slate-300 mb-4 text-xs uppercase tracking-wider">Detection Logic</h3>
               
               <div className="space-y-6">
                 {/* Main Detected Category Breakdown */}
                 <div>
                   <div className="flex items-center gap-3 mb-4">
                      {catStyle && (
                        <>
                          <div className={`p-2 rounded ${catStyle.bgColor}`}>
                            {Icons[catStyle.icon] && React.createElement(Icons[catStyle.icon], { size: 18, className: catStyle.color })}
                          </div>
                          <h4 className={`text-sm font-bold uppercase tracking-wide ${catStyle.color}`}>
                            {event.category}
                          </h4>
                        </>
                      )}
                      {!catStyle && (
                        <h4 className="text-sm font-bold uppercase tracking-wide text-slate-400">
                          {event.category}
                        </h4>
                      )}
                   </div>

                   <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800 space-y-3">
                     {PATTERNS_BY_CATEGORY[event.category].map(pattern => {
                        const isMatched = event.matchedPatterns.includes(pattern);
                        return (
                          <div key={pattern} className="flex items-center justify-between">
                             <div className="flex items-center gap-3">
                                <div className={`flex items-center justify-center w-5 h-5 rounded-full ${isMatched ? 'bg-green-500/20 text-green-400' : 'bg-slate-800 text-slate-600'}`}>
                                  {isMatched ? <Check size={12} strokeWidth={3} /> : <Minus size={12} />}
                                </div>
                                <span className={`text-sm ${isMatched ? 'text-slate-200 font-medium' : 'text-slate-500'}`}>
                                  {pattern}
                                </span>
                             </div>
                             {isMatched && (
                               <span className="text-xs font-mono text-green-400">detected</span>
                             )}
                             {!isMatched && (
                               <span className="text-xs font-mono text-slate-600 italic">not detected</span>
                             )}
                          </div>
                        );
                     })}
                   </div>
                 </div>

                 {/* Other categories (Collapsed/Simple view) */}
                 <div>
                   <button 
                     onClick={() => setShowOtherCategories(!showOtherCategories)}
                     className="flex items-center gap-2 w-full text-left group hover:bg-slate-800/30 p-2 rounded transition-colors -ml-2"
                   >
                      {showOtherCategories ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide group-hover:text-slate-400 transition-colors">Other Categories Monitored</h4>
                   </button>
                   
                   {showOtherCategories && (
                     <div className="grid grid-cols-2 gap-3 mt-3 animate-in slide-in-from-top-1 duration-200">
                       {Object.keys(CATEGORY_STYLES).filter(c => c !== event.category).map(cat => {
                         const catStyleDef = CATEGORY_STYLES[cat as DetectionCategory];
                         if (!catStyleDef) return null;
                         const Icon = Icons[catStyleDef.icon];
                         if (!Icon) return null;
                         return (
                           <div key={cat} className="flex items-center gap-3 p-2 rounded-lg border border-slate-800 opacity-60">
                              <Icon size={16} className="text-slate-600" />
                              <span className="text-sm text-slate-500">{cat}</span>
                           </div>
                         );
                       })}
                     </div>
                   )}
                 </div>
               </div>
             </div>

             {/* Statistical Breakdown (if multi-run) */}
             {(() => {
               const statistics = (trace as any).statistics;
               const runCount = (trace as any).runCount || 1;
               const isMultiRun = runCount > 1;
               
               if (!isMultiRun || !statistics) {
                 return null;
               }
               
               return (
                 <div className="glass-panel p-5 rounded-xl border-slate-800">
                   <h3 className="font-semibold text-slate-300 mb-4 text-xs uppercase tracking-wider flex items-center gap-2">
                     <BrainCircuit size={18} className="text-cyan-500" />
                     Statistical Analysis ({runCount} runs)
                   </h3>
                   <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-4">
                       <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800">
                         <p className="text-xs text-slate-500 mb-1">Mean Score</p>
                         <p className="text-2xl font-bold text-slate-200">
                           {(statistics.mean * 100).toFixed(1)}%
                         </p>
                         <p className="text-xs text-slate-500 mt-1">
                           Std Dev: {(statistics.stddev * 100).toFixed(1)}%
                         </p>
                       </div>
                       <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800">
                         <p className="text-xs text-slate-500 mb-1">Confidence Interval</p>
                         {statistics.confidenceInterval ? (
                           <>
                             <p className="text-lg font-bold text-slate-200">
                               {(statistics.confidenceInterval.level * 100).toFixed(0)}% CI
                             </p>
                             <p className="text-xs text-slate-400 mt-1 font-mono">
                               [{(statistics.confidenceInterval.lower * 100).toFixed(1)}%, {(statistics.confidenceInterval.upper * 100).toFixed(1)}%]
                             </p>
                           </>
                         ) : (
                           <p className="text-sm text-slate-400">N/A</p>
                         )}
                       </div>
                     </div>
                     
                     {statistics.quantiles && (
                       <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800">
                         <p className="text-xs text-slate-500 mb-3">Quantile Distribution</p>
                         <div className="grid grid-cols-3 gap-3 text-center">
                           <div>
                             <p className="text-xs text-slate-500 mb-1">5th Percentile</p>
                             <p className="text-lg font-bold text-slate-300">
                               {(statistics.quantiles.p5 * 100).toFixed(1)}%
                             </p>
                           </div>
                           <div>
                             <p className="text-xs text-slate-500 mb-1">50th (Median)</p>
                             <p className="text-lg font-bold text-cyan-400">
                               {(statistics.quantiles.p50 * 100).toFixed(1)}%
                             </p>
                           </div>
                           <div>
                             <p className="text-xs text-slate-500 mb-1">95th Percentile</p>
                             <p className="text-lg font-bold text-slate-300">
                               {(statistics.quantiles.p95 * 100).toFixed(1)}%
                             </p>
                           </div>
                         </div>
                       </div>
                     )}
                   </div>
                 </div>
               );
             })()}

          </div>
        )}
      </div>
    </div>
  );
};

export default TraceDetail;