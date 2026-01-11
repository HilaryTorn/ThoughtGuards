import React from 'react';
import { ArrowLeft, CheckCircle, AlertTriangle, XCircle, MessageSquare, AlertCircle, Scale, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Trace, Message, DetectionCategory, HOWCode, WHYCode, TARGETCode, CrossValidationMeta } from '../types';
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

/**
 * Agreement Panel - Shows inter-judge agreement when cross-validation data is available
 */
const AgreementPanel: React.FC<{
  meta: CrossValidationMeta;
  conversationId: string;
  onViewComparison: () => void;
}> = ({ meta, conversationId, onViewComparison }) => {
  const agreementRate = meta.agreement_rate || 0;
  const disagreementCount = (meta.unmatched_j1 || 0) + (meta.unmatched_j2 || 0);

  // Color based on agreement rate
  const getAgreementColor = () => {
    if (agreementRate > 0.85) return 'green';
    if (agreementRate >= 0.5) return 'orange';
    return 'red';
  };
  const color = getAgreementColor();

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
        <Scale size={14} className="text-cyan-500" />
        Inter-Judge Agreement Analysis
      </h3>

      {/* Progress bar */}
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full bg-gradient-to-r from-${color}-500 to-${color}-400`}
          style={{ width: `${agreementRate * 100}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex gap-6 text-xs flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-slate-400">{meta.exact_matches || 0} consensus</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="text-slate-400">{meta.partial_matches || 0} partial</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-500" />
          <span className="text-slate-400">{disagreementCount} single-judge</span>
        </span>
      </div>

      {/* Link to comparison view */}
      <button
        onClick={onViewComparison}
        className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-cyan-400 text-xs hover:bg-slate-700 transition-colors"
      >
        <Scale size={14} />
        View Full Comparison
        <ArrowRight size={14} />
      </button>
    </div>
  );
};

interface TraceDetailProps {
  trace: Trace | null;
  onBack: () => void;
  onAction: (id: string, action: 'confirm' | 'review' | 'false_positive') => void;
}

const TraceDetail: React.FC<TraceDetailProps> = ({ trace, onBack, onAction }) => {
  const navigate = useNavigate();
  const [conversationWithTools, setConversationWithTools] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [crossValidationMeta, setCrossValidationMeta] = React.useState<CrossValidationMeta | null>(null);

  if (!trace) return null;

  const event = trace.detectionEvent;
  // Show analysis panel for flagged, review, confirmed, reviewed, false_positive statuses OR when patterns exist
  const hasPatterns = (trace.patterns?.length ?? 0) > 0;
  const isFlagged = trace.status === 'flagged' || trace.status === 'confirmed' || trace.status === 'reviewed' || trace.status === 'false_positive' || trace.status === 'review' || hasPatterns;
  // Normalize legacy category names to new HOW verbs
  const normalizedCategory = event ? normalizeCategory(event.category) : null;
  const catStyle = normalizedCategory ? CATEGORY_STYLES[normalizedCategory] : null;

  // Fetch full conversation with tool_calls if we have a conversation_id
  React.useEffect(() => {
    const fetchConversationWithTools = async () => {
      if (!trace.conversationId || conversationWithTools) return;

      setLoading(true);
      try {
        const response = await fetch(`/api/conversations/${trace.conversationId}`);
        if (response.ok) {
          const data = await response.json();
          setConversationWithTools(data);
        }
      } catch (error) {
        console.error('Failed to fetch conversation with tools:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConversationWithTools();
  }, [trace.conversationId, conversationWithTools]);

  // Fetch cross-validation data if available
  React.useEffect(() => {
    const fetchCrossValidation = async () => {
      if (!trace.conversationId) return;

      try {
        const response = await fetch(`/api/judge-comparison/${trace.conversationId}`);
        if (response.ok) {
          const data = await response.json() as { success?: boolean; result?: { _meta?: CrossValidationMeta } };
          if (data.success && data.result) {
            // Extract _meta from the result
            setCrossValidationMeta(data.result._meta || null);
          }
        }
      } catch (error) {
        // Cross-validation data not available, that's okay
        console.debug('No cross-validation data available:', error);
      }
    };

    fetchCrossValidation();
  }, [trace.conversationId]);

  // Use actual conversation without mock padding
  // Priority 1: Use fresh data from API if available
  // Priority 2: Fall back to trace.conversation
  const displayConversation: Message[] = React.useMemo(() => {
    if (conversationWithTools?.turns) {
      // Convert turns to Message format
      return conversationWithTools.turns.flatMap((turn: any) => {
        const messages: Message[] = [];
        if (turn.role === 'customer' || turn.role === 'user') {
          messages.push({
            role: 'user',
            content: turn.content,
            reasoning_trace: turn.reasoning_content || undefined,
            tool_calls: turn.tool_calls || undefined
          });
        } else if (turn.role === 'assistant') {
          messages.push({
            role: 'assistant',
            content: turn.content,
            reasoning_trace: turn.reasoning_content || undefined,
            tool_calls: turn.tool_calls || undefined
          });
        }
        return messages;
      });
    }
    // Fallback: transform trace.conversation to ensure reasoning_trace field exists
    return (trace.conversation || []).map((msg: any) => ({
      role: msg.role === 'customer' ? 'user' : msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      reasoning_trace: msg.reasoning_trace || msg.reasoning_content || undefined,
      tool_calls: msg.tool_calls || undefined,
    }));
  }, [conversationWithTools, trace.conversation]);

  // Collect all tool calls from conversation - prioritize fresh API data
  const allToolCalls = React.useMemo(() => {
    // Priority 1: Use fresh data from API if available
    if (conversationWithTools?.turns) {
      return conversationWithTools.turns.flatMap((turn: any) => turn.tool_calls || []);
    }

    // Priority 2: Use displayConversation (which now has tool_calls field in Message type)
    return displayConversation.flatMap((msg) => msg.tool_calls || []);
  }, [conversationWithTools, displayConversation]);

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
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-3">
              Trace {shortTraceId}
              {/* Agreement Badge (only if multiple judges used) */}
              {crossValidationMeta && (crossValidationMeta.judges_used?.length ?? 0) >= 2 && (
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded ${
                    crossValidationMeta.agreement_rate > 0.85
                      ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                      : crossValidationMeta.agreement_rate >= 0.5
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50'
                      : 'bg-red-500/20 text-red-400 border border-red-500/50'
                  }`}
                  title={`${crossValidationMeta.agreement_type || 'unknown'} agreement between judges`}
                >
                  <Scale size={12} className="inline mr-1" />
                  {Math.round(crossValidationMeta.agreement_rate * 100)}% agreement
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 font-mono">{trace.timestamp} • Severity: {
              trace.maxSeverity ?? trace.patterns?.reduce((max: number, p: any) => Math.max(max, p.severity ?? 0), 0) ??
              Math.ceil((trace.detected_types?.reduce((max: number, d: any) => Math.max(max, d.score ?? 0), 0) ?? 0) * 5)
            }/5</p>
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
          ${(isFlagged || hasPatterns) ? 'col-span-5' : 'col-span-8 col-start-3'}
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

        {/* RIGHT: Analysis Panel (Show if flagged, has patterns, or has event) */}
        {(isFlagged || hasPatterns) && (
          <div className="col-span-7 flex flex-col gap-4 overflow-y-auto pb-6">

             {/* Inter-Judge Agreement Panel (if cross-validation data available) */}
             {crossValidationMeta && trace.conversationId && (
               <AgreementPanel
                 meta={crossValidationMeta}
                 conversationId={trace.conversationId}
                 onViewComparison={() => navigate(`/comparison/${trace.conversationId}`)}
               />
             )}

             {/* Detected Issues Panel */}
             {trace.patterns && trace.patterns.length > 0 ? (
               <DetectedIssuesPanel
                 patterns={trace.patterns}
                 judge1Name={crossValidationMeta?.judge_1_model}
                 judge2Name={crossValidationMeta?.judge_2_model}
               />
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
                   {(() => {
                     // Calculate max severity from patterns or detected_types
                     const maxSeverity = trace.patterns?.reduce((max: number, p: any) => Math.max(max, p.severity ?? 0), 0) ??
                       Math.ceil((trace.detected_types?.reduce((max: number, d: any) => Math.max(max, d.score ?? 0), 0) ?? 0) * 5);

                     // Severity color mapping
                     const getSeverityStyle = (sev: number) => {
                       if (sev >= 5) return { dot: 'bg-red-500', badge: 'bg-red-500/15 text-red-400 border-red-500/30', label: 'Critical' };
                       if (sev >= 4) return { dot: 'bg-orange-500', badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30', label: 'High' };
                       if (sev >= 3) return { dot: 'bg-amber-500', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30', label: 'Medium' };
                       if (sev >= 2) return { dot: 'bg-yellow-500', badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', label: 'Low' };
                       return { dot: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', label: 'Minimal' };
                     };
                     const style = getSeverityStyle(maxSeverity);

                     return (
                       <div className="flex items-start justify-between mb-3">
                         <div className="flex items-center gap-2.5">
                           <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                           <span className="font-mono text-sm font-semibold text-cyan-400">
                             {normalizedCategory?.substring(0, 2).toUpperCase() || 'DT'}-01
                           </span>
                           <span className="text-sm text-slate-500">— {catStyle?.label} action</span>
                         </div>
                         <span className={`text-[11px] font-semibold px-2.5 py-1 rounded uppercase tracking-wide border ${style.badge}`}>
                           {style.label} ({maxSeverity}/5)
                         </span>
                       </div>
                     );
                   })()}

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
