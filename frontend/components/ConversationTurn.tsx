import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, BrainCircuit, User, Bot } from 'lucide-react';
import { Message } from '../types';

interface ConversationTurnProps {
  userMessage: Message | null;
  assistantMessage: Message | null;
  turnNumber: number;
  isOffending: boolean;
  offendingColor?: string;
  evidenceSnippets?: string[]; // Array of texts to highlight in CoT
  scrollIntoView?: boolean; // Auto-scroll to this turn on mount
}

// Helper to highlight multiple evidence texts in CoT
function highlightEvidence(text: string, snippets?: string[]): React.ReactNode {
  if (!snippets || snippets.length === 0 || !text) return text;

  // Clean up snippets and filter valid ones
  const cleanSnippets = snippets
    .map(s => s.replace(/^\.{3}|\.{3}$/g, '').trim())
    .filter(s => s && s.length >= 10);

  if (cleanSnippets.length === 0) return text;

  // Find all matches and their positions
  const matches: Array<{ start: number; end: number; text: string }> = [];
  const lowerText = text.toLowerCase();

  for (const snippet of cleanSnippets) {
    const lowerSnippet = snippet.toLowerCase();
    let searchStart = 0;
    let index;

    // Find all occurrences of this snippet
    while ((index = lowerText.indexOf(lowerSnippet, searchStart)) !== -1) {
      matches.push({
        start: index,
        end: index + snippet.length,
        text: text.slice(index, index + snippet.length)
      });
      searchStart = index + 1;
    }
  }

  if (matches.length === 0) return text;

  // Sort matches by position and remove overlaps
  matches.sort((a, b) => a.start - b.start);
  const nonOverlapping: typeof matches = [];
  for (const match of matches) {
    const last = nonOverlapping[nonOverlapping.length - 1];
    if (!last || match.start >= last.end) {
      nonOverlapping.push(match);
    }
  }

  // Build the highlighted result
  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  for (let i = 0; i < nonOverlapping.length; i++) {
    const match = nonOverlapping[i];
    if (match.start > lastEnd) {
      parts.push(text.slice(lastEnd, match.start));
    }
    parts.push(
      <mark key={i} className="bg-amber-500/30 text-amber-200 px-0.5 rounded">
        {match.text}
      </mark>
    );
    lastEnd = match.end;
  }

  if (lastEnd < text.length) {
    parts.push(text.slice(lastEnd));
  }

  return <>{parts}</>;
}

const ConversationTurn: React.FC<ConversationTurnProps> = ({
  userMessage,
  assistantMessage,
  turnNumber,
  isOffending,
  offendingColor = 'border-red-500',
  evidenceSnippets = [],
  scrollIntoView = false,
}) => {
  // Offending turns start expanded, others collapsed
  const [isExpanded, setIsExpanded] = useState(isOffending);
  // CoT shown by default for offending turn
  const [showCoT, setShowCoT] = useState(isOffending);
  const hasCoT = assistantMessage?.reasoning_trace;
  const turnRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to this turn on mount if requested
  useEffect(() => {
    if (scrollIntoView && turnRef.current) {
      turnRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [scrollIntoView]);

  return (
    <div
      ref={turnRef}
      className={`
        rounded-lg border overflow-hidden
        ${isOffending
          ? `${offendingColor} ring-2 ring-offset-1 ring-offset-slate-950 ${offendingColor.replace('border-', 'ring-')}/50`
          : 'border-slate-800'}
      `}
    >
      {/* Turn Header - Always visible, clickable to expand/collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors
          ${isOffending ? 'bg-red-500/10 hover:bg-red-500/15' : 'bg-slate-900/50 hover:bg-slate-800/50'}
        `}
      >
        {isExpanded ? <ChevronDown size={12} className="text-slate-500" /> : <ChevronRight size={12} className="text-slate-500" />}
        <span className="text-slate-400 font-mono">Turn {turnNumber}</span>
        {/* Preview of user message when collapsed */}
        {!isExpanded && userMessage && (
          <span className="text-slate-500 truncate flex-1 text-left ml-2">
            {userMessage.content.slice(0, 50)}{userMessage.content.length > 50 ? '...' : ''}
          </span>
        )}
        {isOffending && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-red-400 bg-red-500/20 px-2 py-0.5 rounded">
            Flagged
          </span>
        )}
      </button>

      {/* Expanded Content - Conversation messages */}
      {isExpanded && (
        <>
          {/* User Message */}
          {userMessage && (
            <div className="border-t border-slate-800">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/30 text-xs text-slate-500">
                <User size={10} />
                <span className="uppercase tracking-wide font-medium">User</span>
              </div>
              <div className="px-3 py-2 bg-slate-800/20">
                <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {userMessage.content}
                </p>
              </div>
            </div>
          )}

          {/* Assistant Message */}
          {assistantMessage && (
            <div className="border-t border-slate-800">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/50 text-xs text-slate-500">
                <Bot size={10} />
                <span className="uppercase tracking-wide font-medium">Assistant</span>
              </div>
              <div className="px-3 py-2 bg-slate-900/30">
                <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {assistantMessage.content}
                </p>
              </div>
            </div>
          )}

          {/* CoT Toggle Button - Only visible when expanded */}
          {hasCoT && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowCoT(!showCoT);
              }}
              className={`
                w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors border-t
                ${showCoT
                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                  : 'bg-slate-800/50 text-slate-400 hover:text-purple-300 hover:bg-purple-500/10 border-slate-800'}
              `}
            >
              <BrainCircuit size={12} className="text-purple-400" />
              <span>View Chain of Thought</span>
              {showCoT ? <ChevronDown size={12} className="ml-auto" /> : <ChevronRight size={12} className="ml-auto" />}
            </button>
          )}

          {/* Expanded CoT Section with highlighted evidence */}
          {hasCoT && showCoT && (
            <div className="px-3 pb-3 pt-2 bg-purple-500/5 border-t border-purple-500/20">
              <div className="bg-slate-950 rounded p-3 font-mono text-xs text-slate-400 leading-relaxed whitespace-pre-wrap break-words max-h-[250px] overflow-y-auto border border-purple-500/20">
                {highlightEvidence(assistantMessage?.reasoning_trace || '', evidenceSnippets)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ConversationTurn;
