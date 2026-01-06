import React, { useState } from 'react';
import { Eye, EyeOff, Code, ChevronDown, ChevronRight } from 'lucide-react';

interface ToolCall {
  tool: string;
  arguments: any;
  result: any;
  timestamp?: string;
}

interface ReasoningDisplayProps {
  reasoningContent?: string | null;
  toolCalls?: ToolCall[];
  turnNumber?: number;
}

const ReasoningDisplay: React.FC<ReasoningDisplayProps> = ({ 
  reasoningContent, 
  toolCalls = [],
  turnNumber 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<number>>(new Set());

  if (!reasoningContent && toolCalls.length === 0) {
    return null;
  }

  const toggleToolCall = (index: number) => {
    const newExpanded = new Set(expandedToolCalls);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedToolCalls(newExpanded);
  };

  const formatJSON = (obj: any): string => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  const highlightCode = (code: string, language: string = 'json'): string => {
    // Simple syntax highlighting for JSON
    if (language === 'json') {
      return code
        .replace(/"([^"]+)":/g, '<span class="text-cyan-400">"$1":</span>')
        .replace(/: "([^"]+)"/g, ': <span class="text-green-400">"$1"</span>')
        .replace(/: (\d+)/g, ': <span class="text-yellow-400">$1</span>')
        .replace(/: (true|false|null)/g, ': <span class="text-purple-400">$1</span>');
    }
    return code;
  };

  return (
    <div className="mt-3 border-t border-slate-700 pt-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 transition-colors mb-2"
      >
        {isExpanded ? (
          <>
            <ChevronDown size={14} />
            <EyeOff size={12} />
            Hide Reasoning {turnNumber && `(Turn ${turnNumber})`}
          </>
        ) : (
          <>
            <ChevronRight size={14} />
            <Eye size={12} />
            Show Reasoning {turnNumber && `(Turn ${turnNumber})`}
            {toolCalls.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-[10px]">
                {toolCalls.length} tool call{toolCalls.length !== 1 ? 's' : ''}
              </span>
            )}
          </>
        )}
      </button>

      {isExpanded && (
        <div className="space-y-3">
          {/* Reasoning Content */}
          {reasoningContent && (
            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
              <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                Chain of Thought
              </div>
              <div className="text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
                {reasoningContent
                  .replace(/<think>/gi, '')
                  .replace(/<\/redacted_reasoning>/gi, '')
                  .replace(/<think>/gi, '')
                  .replace(/<\/think>/gi, '')
                  .trim()}
              </div>
            </div>
          )}

          {/* Tool Calls */}
          {toolCalls.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                Tool Calls ({toolCalls.length})
              </div>
              {toolCalls.map((toolCall, index) => (
                <div
                  key={index}
                  className="bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden"
                >
                  <button
                    onClick={() => toggleToolCall(index)}
                    className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {expandedToolCalls.has(index) ? (
                        <ChevronDown size={14} className="text-slate-400" />
                      ) : (
                        <ChevronRight size={14} className="text-slate-400" />
                      )}
                      <Code size={14} className="text-cyan-400" />
                      <span className="text-sm font-medium text-slate-200">
                        {toolCall.tool}
                      </span>
                      {toolCall.timestamp && (
                        <span className="text-xs text-slate-500">
                          {new Date(toolCall.timestamp).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </button>

                  {expandedToolCalls.has(index) && (
                    <div className="border-t border-slate-700 p-3 space-y-3">
                      {/* Arguments */}
                      <div>
                        <div className="text-xs font-semibold text-slate-400 mb-1">
                          Arguments
                        </div>
                        <pre className="bg-slate-950 rounded p-2 text-xs font-mono text-slate-300 overflow-x-auto">
                          <code
                            dangerouslySetInnerHTML={{
                              __html: highlightCode(formatJSON(toolCall.arguments), 'json'),
                            }}
                          />
                        </pre>
                      </div>

                      {/* Result */}
                      <div>
                        <div className="text-xs font-semibold text-slate-400 mb-1">
                          Result
                        </div>
                        <pre className="bg-slate-950 rounded p-2 text-xs font-mono text-slate-300 overflow-x-auto max-h-64 overflow-y-auto">
                          <code
                            dangerouslySetInnerHTML={{
                              __html: highlightCode(formatJSON(toolCall.result), 'json'),
                            }}
                          />
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReasoningDisplay;

