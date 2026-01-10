import React from 'react';
import { ArrowLeft, CheckCircle, AlertTriangle, XCircle, MessageSquare, AlertCircle } from 'lucide-react';
import { Trace, Message, DetectionCategory, HOWCode, WHYCode, TARGETCode } from '../types';
import { CATEGORY_STYLES, LEGACY_CATEGORY_MAP, HOW_VERBS, WHY_VERBS, TARGET_VERBS } from '../constants';
import DetectedIssuesPanel from './DetectedIssuesPanel';
import ConversationTurn from './ConversationTurn';
import InfoTooltip from './InfoTooltip';
import ToolCallEvidence from './ToolCallEvidence';

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

interface TraceDetailProps {
  trace: Trace | null;
  onBack: () => void;
  onAction: (id: string, action: 'confirm' | 'review' | 'false_positive') => void;
}

const TraceDetail: React.FC<TraceDetailProps> = ({ trace, onBack, onAction }) => {
  if (!trace) return null;

  const event = trace.detectionEvent;
  // Show analysis panel for flagged, review, confirmed, reviewed, and false_positive statuses
  const isFlagged = trace.status === 'flagged' || trace.status === 'confirmed' || trace.status === 'reviewed' || trace.status === 'false_positive' || trace.status === 'review';
  // Normalize legacy category names to new HOW verbs
  const normalizedCategory = event ? normalizeCategory(event.category) : null;
  const catStyle = normalizedCategory ? CATEGORY_STYLES[normalizedCategory] : null;

  // Use actual conversation without mock padding
  const displayConversation: Message[] = trace.conversation;

  // Collect all tool calls from conversation
  const allToolCalls = displayConversation.flatMap((msg: any) => msg.tool_calls || []);

  // Shorten trace ID for display (show last 8 chars if it's a long ID)
  const shortTraceId = trace.id.length > 12 ? `...${trace.id.slice(-8)}` : trace.id;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Detail Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-100">
              Trace {shortTraceId}
            </h2>
            <p className="text-xs text-slate-500 font-mono">{trace.timestamp} • Risk: {trace.riskScore}%</p>
          </div>
        </div>

        {/* Actions Toolbar */}
        <div className="flex gap-2">
          {isFlagged && (
            <>
              <button
                onClick={() => onAction(trace.id, 'false_positive')}
                disabled={trace.status === 'false_positive'}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors border whitespace-nowrap
                  ${trace.status === 'false_positive'
                    ? 'bg-slate-800/50 text-slate-500 border-slate-800 cursor-not-allowed'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}
                `}
              >
                 <XCircle size={12} />
                 False Positive
              </button>

              <button
                onClick={() => onAction(trace.id, 'confirm')}
                disabled={trace.status === 'confirmed'}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors border whitespace-nowrap
                  ${trace.status === 'confirmed'
                    ? 'bg-amber-900/20 text-amber-500/50 border-amber-900/20 cursor-not-allowed'
                    : 'bg-amber-900/30 hover:bg-amber-900/50 text-amber-300 border-amber-800'}
                `}
              >
                 <AlertTriangle size={12} />
                 Confirm
              </button>
            </>
          )}

          <button
            onClick={() => onAction(trace.id, 'review')}
            disabled={trace.status === 'reviewed'}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors border whitespace-nowrap
              ${trace.status === 'reviewed'
                ? 'bg-emerald-900/20 text-emerald-500/50 border-emerald-900/20 cursor-not-allowed'
                : 'bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-300 border-cyan-800'}
            `}
          >
             <CheckCircle size={12} />
             {trace.status === 'reviewed' ? 'Reviewed' : 'Review'}
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">

        {/* LEFT: Conversation Thread */}
        <div className={`
          flex flex-col glass-panel rounded-xl border-slate-800 overflow-hidden h-full
          ${isFlagged && event ? 'col-span-5' : 'col-span-8 col-start-3'}
        `}>
          <div className="p-3 border-b border-slate-800 bg-slate-900/50">
            <h3 className="font-semibold text-slate-300 flex items-center gap-2 text-sm">
              <MessageSquare size={14} className="text-cyan-500" />
              Conversation
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-950/30">
             {(() => {
               // Group messages into turns (user + assistant pairs)
               const turns: Array<{ user: Message | null; assistant: Message | null; turnNumber: number }> = [];
               let currentTurn: { user: Message | null; assistant: Message | null } = { user: null, assistant: null };
               let turnNumber = 0;

               displayConversation.forEach((msg, idx) => {
                 if (msg.role === 'user') {
                   // If we have a pending turn, push it
                   if (currentTurn.user || currentTurn.assistant) {
                     turnNumber++;
                     turns.push({ ...currentTurn, turnNumber });
                   }
                   currentTurn = { user: msg, assistant: null };
                 } else if (msg.role === 'assistant') {
                   currentTurn.assistant = msg;
                   turnNumber++;
                   turns.push({ ...currentTurn, turnNumber });
                   currentTurn = { user: null, assistant: null };
                 }
               });

               // Push any remaining turn
               if (currentTurn.user || currentTurn.assistant) {
                 turnNumber++;
                 turns.push({ ...currentTurn, turnNumber });
               }

               // Check if we have patterns with valid message indices
               const hasValidPatternQuotes = trace.patterns?.some(p =>
                 p.quotes?.some(q => typeof q.message_index === 'number')
               );

               return turns.map((turn, idx) => {
                 // Determine if this turn is offending
                 const turnMsgIndices: number[] = [];
                 displayConversation.forEach((msg, msgIdx) => {
                   if (msg === turn.user || msg === turn.assistant) {
                     turnMsgIndices.push(msgIdx);
                   }
                 });

                 // Flag turns that have issues:
                 // 1. If patterns have quotes with message_index, flag turns that match
                 // 2. If no valid pattern quotes, fallback to last turn only
                 const matchesPattern = trace.patterns?.some(p =>
                   p.quotes?.some(q => turnMsgIndices.includes(q.message_index))
                 );

                 const isLastTurnFallback = !hasValidPatternQuotes && idx === turns.length - 1;

                 const isOffending = isFlagged && (matchesPattern || isLastTurnFallback);

                 // Collect ALL evidence snippets for highlighting in CoT
                 const evidenceSnippets: string[] = [];
                 if (isOffending) {
                   // Add event snippet if available
                   if (event?.snippet) {
                     evidenceSnippets.push(event.snippet);
                   }
                   // Add all quotes from all patterns
                   trace.patterns?.forEach(p => {
                     p.quotes?.forEach(q => {
                       if (q.text && !evidenceSnippets.includes(q.text)) {
                         evidenceSnippets.push(q.text);
                       }
                     });
                   });
                 }

                 return (
                   <ConversationTurn
                     key={idx}
                     userMessage={turn.user}
                     assistantMessage={turn.assistant}
                     turnNumber={turn.turnNumber}
                     isOffending={isOffending}
                     offendingColor={catStyle?.borderColor || 'border-red-500'}
                     evidenceSnippets={evidenceSnippets}
                     scrollIntoView={isOffending}
                   />
                 );
               });
             })()}
          </div>
        </div>

        {/* RIGHT: Analysis Panel (Only if flagged and has event) */}
        {isFlagged && event && catStyle && (
          <div className="col-span-7 flex flex-col gap-4 overflow-y-auto pr-2 pb-6">

             {/* Detected Issues Panel */}
             {trace.patterns && trace.patterns.length > 0 ? (
               <DetectedIssuesPanel patterns={trace.patterns} />
             ) : (
               /* Fallback: Generate mockup-style issue card from detection event */
               <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
                 {/* Panel Header */}
                 <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800 bg-slate-900/70">
                   <AlertCircle size={16} className="text-amber-500" />
                   <h3 className="text-sm font-semibold text-amber-500">Detected Issues</h3>
                   <span className="ml-auto text-xs text-slate-500 font-mono">1 issue</span>
                 </div>

                 {/* Issue Card */}
                 <div className="p-5">
                   {/* Header Row */}
                   <div className="flex items-start justify-between mb-3">
                     <div className="flex items-center gap-2.5">
                       <span className={`w-2.5 h-2.5 rounded-full ${trace.riskScore >= 70 ? 'bg-red-500' : trace.riskScore >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                       <span className="font-mono text-sm font-semibold text-cyan-400">
                         {normalizedCategory?.substring(0, 2).toUpperCase() || 'DT'}-01
                       </span>
                       <span className="text-sm text-slate-500">— {catStyle?.label} action</span>
                     </div>
                     <span className={`text-[11px] font-semibold px-2.5 py-1 rounded uppercase tracking-wide border ${
                       trace.riskScore >= 70
                         ? 'bg-red-500/15 text-red-400 border-red-500/30'
                         : trace.riskScore >= 40
                           ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                           : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                     }`}>
                       {trace.riskScore >= 70 ? 'High' : trace.riskScore >= 40 ? 'Medium' : 'Low'}
                     </span>
                   </div>

                   {/* Triad Display - derive from category if possible */}
                   {(() => {
                     // Try to get HOW code from category
                     const howEntry = Object.entries(HOW_VERBS).find(([_, v]) => v.category === normalizedCategory);
                     const howCode = (howEntry?.[0] || 'H1') as HOWCode;
                     const howInfo = HOW_VERBS[howCode];

                     // Default WHY and TARGET based on context
                     const whyCode: WHYCode = 'W1'; // Gamed
                     const targetCode: TARGETCode = 'T1'; // User
                     const whyInfo = WHY_VERBS[whyCode];
                     const targetInfo = TARGET_VERBS[targetCode];

                     return (
                       <div className="mb-4">
                         {/* Triad Tags */}
                         <div className="flex items-center gap-1.5 flex-wrap mb-3">
                           <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded font-mono bg-purple-500/15 text-purple-400 border border-purple-500/30">
                             <span className="text-[10px] opacity-70 uppercase tracking-wide">HOW</span>
                             {howInfo?.verb || normalizedCategory}
                             <InfoTooltip
                               title={`${howCode}: ${howInfo?.verb || 'Unknown'}`}
                               content={howInfo?.description || 'Detection mechanism'}
                               iconSize={10}
                             />
                           </span>
                           <span className="text-slate-600 text-sm">→</span>
                           <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                             <span className="text-[10px] opacity-70 uppercase tracking-wide">WHY</span>
                             {whyInfo?.verb}
                             <InfoTooltip
                               title={`${whyCode}: ${whyInfo?.verb}`}
                               content={whyInfo?.description || 'Motivation'}
                               iconSize={10}
                             />
                           </span>
                           <span className="text-slate-600 text-sm">→</span>
                           <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded font-mono bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                             <span className="text-[10px] opacity-70 uppercase tracking-wide">TARGET</span>
                             {targetInfo?.verb}
                             <InfoTooltip
                               title={`${targetCode}: ${targetInfo?.verb}`}
                               content={targetInfo?.description || 'Affected party'}
                               iconSize={10}
                             />
                           </span>
                         </div>

                         {/* Sentence Summary */}
                         <div className="text-xs text-slate-500 italic px-3 py-2.5 bg-slate-800/50 rounded border-l-2 border-slate-700">
                           Agent <strong className="text-slate-300 not-italic">{howInfo?.verb?.toLowerCase() || 'manipulated'}</strong> in order to <strong className="text-slate-300 not-italic">{whyInfo?.verb?.toLowerCase()}</strong>, affecting <strong className="text-slate-300 not-italic">{targetInfo?.verb?.toLowerCase()}</strong>
                         </div>
                       </div>
                     );
                   })()}

                   {/* Evidence Section */}
                   {event.snippet && (
                     <div className="mb-4">
                       <h4 className="text-[11px] font-medium text-slate-600 uppercase tracking-wide mb-2.5">
                         Evidence from Reasoning
                       </h4>
                       <div className="font-mono text-xs text-amber-400 bg-amber-500/10 px-3.5 py-2.5 rounded border-l-2 border-amber-500">
                         "{event.snippet}"
                       </div>
                     </div>
                   )}

                   {/* Impact Note */}
                   <div className="flex items-center gap-2 text-xs text-red-400 mt-3">
                     <AlertCircle size={14} />
                     <span>Impact: User may receive incorrect or misleading information</span>
                   </div>
                 </div>
               </div>
             )}

             {/* Tool Call Evidence Panel */}
             {allToolCalls.length > 0 && (
               <ToolCallEvidence
                 toolCalls={allToolCalls}
                 reasoningContent={event?.fullCoT}
                 messageContent={displayConversation.filter(m => m.role === 'assistant').map(m => m.content).join(' ')}
               />
             )}

          </div>
        )}
      </div>
    </div>
  );
};

export default TraceDetail;
