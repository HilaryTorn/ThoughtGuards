import React, { useState } from 'react';
import { ChevronDown, ChevronRight, BrainCircuit, User, Bot } from 'lucide-react';
import { Message } from '../types';

interface ConversationTurnProps {
  userMessage: Message | null;
  assistantMessage: Message | null;
  turnNumber: number;
  isOffending: boolean;
  offendingColor?: string;
}

const ConversationTurn: React.FC<ConversationTurnProps> = ({
  userMessage,
  assistantMessage,
  turnNumber,
  isOffending,
  offendingColor = 'border-red-500',
}) => {
  // Show CoT collapsed by default
  const [showCoT, setShowCoT] = useState(false);
  const hasCoT = assistantMessage?.reasoning_trace;

  return (
    <div className={`
      rounded-lg border overflow-hidden
      ${isOffending
        ? `${offendingColor} ring-2 ring-offset-1 ring-offset-slate-950 ${offendingColor.replace('border-', 'ring-')}/50`
        : 'border-slate-800'}
    `}>
      {/* Turn Header */}
      <div className={`
        flex items-center gap-2 px-3 py-2 text-xs font-medium border-b border-slate-800
        ${isOffending ? 'bg-red-500/10' : 'bg-slate-900/50'}
      `}>
        <span className="text-slate-400 font-mono">Turn {turnNumber}</span>
        {hasCoT && (
          <span className="text-purple-400 flex items-center gap-1">
            <BrainCircuit size={10} />
            <span className="text-[10px]">has CoT</span>
          </span>
        )}
        {isOffending && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-red-400 bg-red-500/20 px-2 py-0.5 rounded">
            Flagged
          </span>
        )}
      </div>

      {/* User Message */}
      {userMessage && (
        <div className="border-b border-slate-800">
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
        <div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/50 text-xs text-slate-500">
            <Bot size={10} />
            <span className="uppercase tracking-wide font-medium">Assistant</span>
          </div>
          <div className="px-3 py-2 bg-slate-900/30">
            <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
              {assistantMessage.content}
            </p>
          </div>

          {/* CoT Toggle Button - Always visible if CoT exists */}
          {hasCoT && (
            <button
              onClick={() => setShowCoT(!showCoT)}
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

          {/* Expanded CoT Section */}
          {hasCoT && showCoT && (
            <div className="px-3 pb-3 pt-2 bg-purple-500/5 border-t border-purple-500/20">
              <div className="bg-slate-950 rounded p-3 font-mono text-xs text-slate-400 leading-relaxed whitespace-pre-wrap break-words max-h-[250px] overflow-y-auto border border-purple-500/20">
                {assistantMessage.reasoning_trace}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConversationTurn;
