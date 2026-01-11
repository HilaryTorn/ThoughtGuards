import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Scale, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp, MessageSquare, Eye } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { CrossValidationResult, CrossValidationMeta, AggregatedPattern, HOWCode, WHYCode, TARGETCode, JudgeResult } from '../types';
import { HOW_VERBS, WHY_VERBS, TARGET_VERBS } from '../constants';

/**
 * Spell out triad codes (e.g., "T1|H4|W1" -> "User | Pressured | Gamed")
 */
function spellOutTriad(triadCode: string): string {
  if (!triadCode) return '';
  const parts = triadCode.split('|');
  const target = parts.find(p => p.startsWith('T'));
  const how = parts.find(p => p.startsWith('H'));
  const why = parts.find(p => p.startsWith('W'));

  const targetVerb = TARGET_VERBS[target as TARGETCode]?.verb || target || '?';
  const howVerb = HOW_VERBS[how as HOWCode]?.verb || how || '?';
  const whyVerb = WHY_VERBS[why as WHYCode]?.verb || why || '?';

  return `${targetVerb} | ${howVerb} | ${whyVerb}`;
}

/**
 * Color mapping for HOW categories (detection types)
 */
const CATEGORY_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  Fabricated: { border: 'border-red-500', bg: 'bg-red-500/10', text: 'text-red-400' },
  Sandbagged: { border: 'border-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400' },
  'Context-Switched': { border: 'border-slate-500', bg: 'bg-slate-500/10', text: 'text-slate-400' },
  Pressured: { border: 'border-pink-500', bg: 'bg-pink-500/10', text: 'text-pink-400' },
  Hid: { border: 'border-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  Overclaimed: { border: 'border-orange-500', bg: 'bg-orange-500/10', text: 'text-orange-400' },
};

/**
 * Agreement type color mapping
 */
const AGREEMENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  full: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/50' },
  strong: { bg: 'bg-green-400/20', text: 'text-green-300', border: 'border-green-400/50' },
  partial: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/50' },
  weak: { bg: 'bg-orange-400/20', text: 'text-orange-300', border: 'border-orange-400/50' },
  none: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/50' },
  both_clean: { bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/50' },
};

/**
 * Get short model name for display
 */
function getShortModelName(model: string): string {
  if (!model) return 'Unknown';
  // Extract just the model name without version details
  if (model.includes('claude-sonnet')) return 'Claude Sonnet';
  if (model.includes('claude-haiku')) return 'Claude Haiku';
  if (model.includes('claude-opus')) return 'Claude Opus';
  if (model.includes('gemini')) return 'Gemini';
  if (model.includes('gpt-4')) return 'GPT-4';
  return model.split('-').slice(0, 2).join(' ');
}

/**
 * Pattern card component for displaying individual detections
 */
const PatternCard: React.FC<{
  pattern: AggregatedPattern;
  judge1Model: string;
  judge2Model: string;
  judge1Patterns?: any[];
  judge2Patterns?: any[];
  expanded: boolean;
  onToggle: () => void;
  conversationTurns?: any[];
  judge1FlaggedIndices?: Set<number>;
  judge2FlaggedIndices?: Set<number>;
}> = ({ pattern, judge1Model, judge2Model, judge1Patterns, judge2Patterns, expanded, onToggle, conversationTurns, judge1FlaggedIndices, judge2FlaggedIndices }) => {
  // Find matching patterns from each judge for this pattern
  const findMatchingPattern = (patterns: any[] | undefined, triadId: string) => {
    if (!patterns) return null;
    return patterns.find(p => p.triad_pattern_id === triadId);
  };

  const j1Pattern = findMatchingPattern(judge1Patterns, pattern.triad_pattern_id);
  const j2Pattern = findMatchingPattern(judge2Patterns, pattern.triad_pattern_id || pattern._matched_with);

  const howVerb = HOW_VERBS[pattern.labels.HOW as HOWCode]?.verb || pattern.labels.HOW;
  const colors = CATEGORY_COLORS[howVerb] || CATEGORY_COLORS.Fabricated;

  // Border style based on match type
  const getBorderStyle = () => {
    switch (pattern._match_type) {
      case 'exact':
        return 'border-green-500/50 bg-green-500/5';
      case 'partial':
        return 'border-yellow-500/50 bg-yellow-500/5';
      case 'single_judge':
        return 'border-dashed border-orange-500/50 bg-slate-900/50';
      default:
        return 'border-slate-700';
    }
  };

  // Match type badge
  const getMatchBadge = () => {
    switch (pattern._match_type) {
      case 'exact':
        return (
          <span className="px-2 py-0.5 text-xs rounded bg-green-500/20 text-green-400 border border-green-500/50">
            EXACT MATCH
          </span>
        );
      case 'partial':
        return (
          <span className="px-2 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/50">
            {Math.round((pattern._similarity || 0) * 100)}% MATCH
          </span>
        );
      case 'single_judge':
        const judgeModel = pattern._detected_by === 'judge_1' ? judge1Model : judge2Model;
        const badgeColor = pattern._detected_by === 'judge_1' ? 'orange' : 'purple';
        return (
          <span className={`px-2 py-0.5 text-xs rounded bg-${badgeColor}-500/20 text-${badgeColor}-400 border border-${badgeColor}-500/50`}>
            {getShortModelName(judgeModel)} ONLY
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`border rounded-lg ${getBorderStyle()} transition-all`}>
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-800/30"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${colors.bg.replace('/10', '')}`} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-200">
                {HOW_VERBS[pattern.labels?.HOW as HOWCode]?.verb || pattern.labels?.HOW || 'Unknown'}
              </span>
              <span className="text-xs text-slate-500">
                {spellOutTriad(pattern.triad_pattern_id)}
              </span>
              {getMatchBadge()}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{pattern.short_desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-bold ${
            pattern.confidence >= 0.7 ? 'text-green-400' :
            pattern.confidence >= 0.4 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {Math.round(pattern.confidence * 100)}%
          </span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-800/50">
          {/* Axis disagreement for partial matches */}
          {pattern._match_type === 'partial' && pattern._axis_disagreement && (
            <div className="flex gap-2 text-xs mt-3 mb-2">
              {Object.entries(pattern._axis_disagreement).map(([axis, vals]) => (
                <span key={axis} className="text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded">
                  {axis}: {(vals as any).j1} &ne; {(vals as any).j2}
                </span>
              ))}
            </div>
          )}

          {/* Side-by-side Judge Comparison with Evidence */}
          <div className="border-t border-slate-800 pt-3 mt-3">
            <div className="grid grid-cols-2 gap-4">
              {/* Judge A Column */}
              <div className="bg-slate-800/30 rounded-lg p-3 border-l-2 border-orange-500/50">
                <h4 className="text-xs font-medium text-orange-400 mb-2 flex items-center gap-1.5">
                  {getShortModelName(judge1Model)}
                </h4>
                {pattern._match_type === 'single_judge' && pattern._detected_by === 'judge_2' ? (
                  <p className="text-xs text-slate-500 italic">Not detected</p>
                ) : (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Confidence:</span>
                      <span className="font-bold text-slate-200">{(j1Pattern?.confidence || pattern._confidence_breakdown?.base_confidence || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Severity:</span>
                      <span className="font-bold text-slate-200">{j1Pattern?.severity ?? 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Triad:</span>
                      <span className="text-slate-300 ml-1">{spellOutTriad(j1Pattern?.triad_pattern_id || pattern.triad_pattern_id)}</span>
                    </div>
                    {/* Judge 1 Evidence */}
                    {j1Pattern?.quotes && j1Pattern.quotes.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-700/50">
                        <span className="text-slate-500 uppercase text-[10px]">Evidence</span>
                        {j1Pattern.quotes.slice(0, 2).map((quote: any, idx: number) => (
                          <div key={idx} className="font-mono text-[11px] text-orange-300 bg-orange-500/10 px-2 py-1.5 rounded mt-1 border-l border-orange-500">
                            "{quote.text?.substring(0, 80)}{quote.text?.length > 80 ? '...' : ''}"
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Judge B Column */}
              <div className="bg-slate-800/30 rounded-lg p-3 border-l-2 border-purple-500/50">
                <h4 className="text-xs font-medium text-purple-400 mb-2 flex items-center gap-1.5">
                  {getShortModelName(judge2Model)}
                </h4>
                {pattern._match_type === 'single_judge' && pattern._detected_by === 'judge_1' ? (
                  <p className="text-xs text-slate-500 italic">Not detected</p>
                ) : (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Confidence:</span>
                      <span className="font-bold text-slate-200">{(j2Pattern?.confidence || pattern._confidence_breakdown?.base_confidence || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Severity:</span>
                      <span className="font-bold text-slate-200">{j2Pattern?.severity ?? 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Triad:</span>
                      <span className="text-slate-300 ml-1">{spellOutTriad(j2Pattern?.triad_pattern_id || pattern._matched_with || pattern.triad_pattern_id)}</span>
                    </div>
                    {/* Judge 2 Evidence */}
                    {j2Pattern?.quotes && j2Pattern.quotes.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-700/50">
                        <span className="text-slate-500 uppercase text-[10px]">Evidence</span>
                        {j2Pattern.quotes.slice(0, 2).map((quote: any, idx: number) => (
                          <div key={idx} className="font-mono text-[11px] text-purple-300 bg-purple-500/10 px-2 py-1.5 rounded mt-1 border-l border-purple-500">
                            "{quote.text?.substring(0, 80)}{quote.text?.length > 80 ? '...' : ''}"
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Aggregated metrics row */}
            {pattern._confidence_breakdown && (
              <div className="mt-3 pt-3 border-t border-slate-700/50">
                <div className="text-xs text-slate-500 font-mono mb-2">
                  {pattern._confidence_breakdown.breakdown}
                </div>
                <div className="flex justify-center gap-6 text-xs">
                  <span>
                    <span className="text-slate-400">Agreement:</span>
                    <span className={`font-bold ml-1 ${
                      pattern._confidence_breakdown.agreement_factor >= 1.0 ? 'text-green-400' : 'text-orange-400'
                    }`}>
                      {pattern._confidence_breakdown.agreement_factor}x
                    </span>
                  </span>
                  <span>
                    <span className="text-slate-400">Evidence:</span>
                    <span className="font-bold text-slate-200 ml-1">
                      {pattern._confidence_breakdown.evidence_factor}x
                    </span>
                  </span>
                  <span>
                    <span className="text-slate-400">Final:</span>
                    <span className="font-bold text-cyan-400 ml-1">
                      {pattern._confidence_breakdown.final_confidence}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* Relevant Conversation Turns - Side by Side */}
            {conversationTurns && conversationTurns.length > 0 && (judge1FlaggedIndices?.size || judge2FlaggedIndices?.size) && (
              <div className="mt-3 pt-3 border-t border-slate-700/50">
                <h4 className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
                  <MessageSquare size={12} />
                  Flagged Conversation Turns
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {/* Judge 1 Flagged */}
                  <div>
                    <p className="text-[10px] text-orange-400 mb-1">{getShortModelName(judge1Model)}</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {conversationTurns.map((turn: any, idx: number) => {
                        if (!judge1FlaggedIndices?.has(idx)) return null;
                        return (
                          <div key={idx} className="text-[10px] p-1.5 rounded bg-orange-500/10 border-l border-orange-500">
                            <span className="text-orange-300 font-medium">{turn.role === 'assistant' ? 'Bot' : 'User'} #{idx}:</span>
                            <span className="text-slate-300 ml-1">{turn.content?.substring(0, 60)}{turn.content?.length > 60 ? '...' : ''}</span>
                          </div>
                        );
                      })}
                      {!Array.from(judge1FlaggedIndices || []).some(i => i < conversationTurns.length) && (
                        <p className="text-[10px] text-slate-500 italic">None flagged</p>
                      )}
                    </div>
                  </div>
                  {/* Judge 2 Flagged */}
                  <div>
                    <p className="text-[10px] text-purple-400 mb-1">{getShortModelName(judge2Model)}</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {conversationTurns.map((turn: any, idx: number) => {
                        if (!judge2FlaggedIndices?.has(idx)) return null;
                        return (
                          <div key={idx} className="text-[10px] p-1.5 rounded bg-purple-500/10 border-l border-purple-500">
                            <span className="text-purple-300 font-medium">{turn.role === 'assistant' ? 'Bot' : 'User'} #{idx}:</span>
                            <span className="text-slate-300 ml-1">{turn.content?.substring(0, 60)}{turn.content?.length > 60 ? '...' : ''}</span>
                          </div>
                        );
                      })}
                      {!Array.from(judge2FlaggedIndices || []).some(i => i < conversationTurns.length) && (
                        <p className="text-[10px] text-slate-500 italic">None flagged</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Agreement stats panel
 */
const AgreementStatsPanel: React.FC<{ meta: CrossValidationMeta }> = ({ meta }) => {
  const agreementColor = AGREEMENT_COLORS[meta.agreement_type] || AGREEMENT_COLORS.partial;
  const disagreementCount = meta.unmatched_j1 + meta.unmatched_j2;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-300">Inter-Judge Agreement Analysis</h3>
        <span className={`px-2.5 py-1 text-xs font-bold rounded uppercase ${agreementColor.bg} ${agreementColor.text} border ${agreementColor.border}`}>
          {meta.agreement_type}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full transition-all ${
            meta.agreement_rate > 0.85 ? 'bg-gradient-to-r from-green-500 to-green-400' :
            meta.agreement_rate >= 0.5 ? 'bg-gradient-to-r from-orange-500 to-orange-400' :
            'bg-gradient-to-r from-red-500 to-red-400'
          }`}
          style={{ width: `${meta.agreement_rate * 100}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex gap-6 text-xs flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-slate-400">{meta.exact_matches} exact matches</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="text-slate-400">{meta.partial_matches} partial matches</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-500" />
          <span className="text-slate-400">{disagreementCount} single-judge only</span>
        </span>
      </div>

      {/* Judges info */}
      <div className="mt-4 pt-3 border-t border-slate-800 flex gap-4 text-xs">
        <div>
          <span className="text-slate-500">Judge A:</span>
          <span className="text-slate-300 ml-1 font-medium">{getShortModelName(meta.judge_1_model)}</span>
          <span className="text-slate-500 ml-1">({meta.judge_1_tokens} tokens)</span>
        </div>
        <div>
          <span className="text-slate-500">Judge B:</span>
          <span className="text-slate-300 ml-1 font-medium">{getShortModelName(meta.judge_2_model)}</span>
          <span className="text-slate-500 ml-1">({meta.judge_2_tokens} tokens)</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Conversation Preview with Judge Highlights
 */
const ConversationPreview: React.FC<{
  conversationId: string;
  judge1Result?: JudgeResult;
  judge2Result?: JudgeResult;
  judge1Model: string;
  judge2Model: string;
  onViewFull: () => void;
}> = ({ conversationId, judge1Result, judge2Result, judge1Model, judge2Model, onViewFull }) => {
  const [conversation, setConversation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchConversation = async () => {
      try {
        const response = await fetch(`/api/conversations/${conversationId}`);
        if (response.ok) {
          const data = await response.json();
          setConversation(data);
        }
      } catch (error) {
        console.error('Failed to fetch conversation:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchConversation();
  }, [conversationId]);

  // Get flagged message indices from each judge
  const getJudgeFlaggedIndices = (judgeResult?: JudgeResult): Set<number> => {
    const indices = new Set<number>();
    if (!judgeResult?.patterns) return indices;
    for (const pattern of judgeResult.patterns) {
      if (pattern.quotes) {
        for (const quote of pattern.quotes) {
          if (typeof quote.message_index === 'number') {
            indices.add(quote.message_index);
          }
        }
      }
    }
    return indices;
  };

  const judge1Flagged = getJudgeFlaggedIndices(judge1Result);
  const judge2Flagged = getJudgeFlaggedIndices(judge2Result);

  if (loading) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-slate-700 rounded w-1/4 mb-3"></div>
        <div className="h-20 bg-slate-700 rounded"></div>
      </div>
    );
  }

  if (!conversation?.turns) {
    return null;
  }

  const turns = conversation.turns.slice(0, expanded ? undefined : 6);

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <MessageSquare size={14} className="text-cyan-500" />
          Conversation Preview
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 text-xs mr-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-slate-400">{getShortModelName(judge1Model)}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <span className="text-slate-400">{getShortModelName(judge2Model)}</span>
            </span>
          </div>
          <button
            onClick={onViewFull}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-cyan-400 text-xs hover:bg-slate-700"
          >
            <Eye size={12} />
            View Full Trace
          </button>
        </div>
      </div>

      {/* Side-by-side Judge Flagged Turns */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Judge 1 Flagged Turns */}
          <div>
            <h4 className="text-xs font-medium text-orange-400 mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              {getShortModelName(judge1Model)} Flagged ({judge1Flagged.size})
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
              {turns.filter((_: any, i: number) => judge1Flagged.has(i)).length === 0 ? (
                <p className="text-xs text-slate-500 italic">No turns flagged</p>
              ) : (
                turns.map((turn: any, idx: number) => {
                  if (!judge1Flagged.has(idx)) return null;
                  const isBothFlagged = judge2Flagged.has(idx);
                  return (
                    <div key={idx} className={`border rounded-lg p-2 ${isBothFlagged ? 'border-green-500/50 bg-green-500/5' : 'border-orange-500/50 bg-orange-500/5'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          turn.role === 'assistant' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-600/50 text-slate-400'
                        }`}>
                          {turn.role === 'assistant' ? 'Bot' : 'User'} #{idx}
                        </span>
                        {isBothFlagged && <span className="text-[10px] text-green-400">Both</span>}
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2">{turn.content}</p>
                      {turn.reasoning_content && (
                        <p className="text-[10px] text-slate-500 mt-1 line-clamp-1 italic">
                          CoT: {turn.reasoning_content.substring(0, 60)}...
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Judge 2 Flagged Turns */}
          <div>
            <h4 className="text-xs font-medium text-purple-400 mb-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              {getShortModelName(judge2Model)} Flagged ({judge2Flagged.size})
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
              {turns.filter((_: any, i: number) => judge2Flagged.has(i)).length === 0 ? (
                <p className="text-xs text-slate-500 italic">No turns flagged</p>
              ) : (
                turns.map((turn: any, idx: number) => {
                  if (!judge2Flagged.has(idx)) return null;
                  const isBothFlagged = judge1Flagged.has(idx);
                  return (
                    <div key={idx} className={`border rounded-lg p-2 ${isBothFlagged ? 'border-green-500/50 bg-green-500/5' : 'border-purple-500/50 bg-purple-500/5'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          turn.role === 'assistant' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-600/50 text-slate-400'
                        }`}>
                          {turn.role === 'assistant' ? 'Bot' : 'User'} #{idx}
                        </span>
                        {isBothFlagged && <span className="text-[10px] text-green-400">Both</span>}
                      </div>
                      <p className="text-xs text-slate-300 line-clamp-2">{turn.content}</p>
                      {turn.reasoning_content && (
                        <p className="text-[10px] text-slate-500 mt-1 line-clamp-1 italic">
                          CoT: {turn.reasoning_content.substring(0, 60)}...
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Main Judge Comparison View
 */
interface JudgeComparisonViewProps {
  conversationId?: string;
}

const JudgeComparisonView: React.FC<JudgeComparisonViewProps> = ({ conversationId: propConversationId }) => {
  const { conversationId: paramConversationId } = useParams<{ conversationId: string }>();
  const conversationId = propConversationId || paramConversationId;
  const navigate = useNavigate();

  const [result, setResult] = useState<CrossValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPatterns, setExpandedPatterns] = useState<Set<number>>(new Set());
  const [collapseAll, setCollapseAll] = useState(false);
  const [conversationTurns, setConversationTurns] = useState<any[]>([]);

  // Get flagged indices from judge results
  const getJudgeFlaggedIndices = (judgeResult?: any): Set<number> => {
    const indices = new Set<number>();
    if (!judgeResult?.patterns) return indices;
    for (const pattern of judgeResult.patterns) {
      if (pattern.quotes) {
        for (const quote of pattern.quotes) {
          if (typeof quote.message_index === 'number') {
            indices.add(quote.message_index);
          }
        }
      }
    }
    return indices;
  };

  // Fetch conversation data
  useEffect(() => {
    const fetchConversation = async () => {
      if (!conversationId) return;
      try {
        const response = await fetch(`/api/conversations/${conversationId}`);
        if (response.ok) {
          const data = await response.json();
          setConversationTurns(data?.turns || []);
        }
      } catch (err) {
        console.error('Failed to fetch conversation:', err);
      }
    };
    fetchConversation();
  }, [conversationId]);

  // Fetch comparison data
  useEffect(() => {
    const fetchComparison = async () => {
      if (!conversationId) return;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/judge-comparison/${conversationId}`);
        if (!response.ok) {
          const data = await response.json() as { error?: string };
          throw new Error(data.error || 'Failed to fetch comparison data');
        }
        const data = await response.json() as { success?: boolean; result?: CrossValidationResult };
        if (data.success && data.result) {
          // Handle database format - need to parse/reconstruct
          setResult(data.result);
        } else {
          throw new Error('No comparison data found');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchComparison();
  }, [conversationId]);

  const togglePattern = (idx: number) => {
    setExpandedPatterns(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const toggleCollapseAll = () => {
    if (collapseAll) {
      // Expand all
      const patterns = result?.manipulation_evaluations?.[0]?.patterns || [];
      setExpandedPatterns(new Set(patterns.map((_, i) => i)));
    } else {
      // Collapse all
      setExpandedPatterns(new Set());
    }
    setCollapseAll(!collapseAll);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <AlertTriangle size={48} className="text-red-500 mb-4" />
        <p className="text-lg font-medium text-slate-200 mb-2">Error Loading Comparison</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 flex items-center gap-2 px-4 py-2 bg-slate-800 rounded text-cyan-400 hover:bg-slate-700"
        >
          <ArrowLeft size={16} />
          Go Back
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <Scale size={48} className="text-slate-600 mb-4" />
        <p className="text-lg font-medium text-slate-200 mb-2">No Comparison Data</p>
        <p className="text-sm">No cross-validation results found for this conversation.</p>
      </div>
    );
  }

  const patterns = result?.manipulation_evaluations?.[0]?.patterns || [];
  const meta = result._meta;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Scale size={20} className="text-cyan-500" />
              Judge Comparison
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              {conversationId} &bull; {Math.round(meta.agreement_rate * 100)}% agreement
            </p>
          </div>
        </div>

        <button
          onClick={toggleCollapseAll}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-300 text-xs hover:bg-slate-700"
        >
          {collapseAll ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          {collapseAll ? 'Expand All' : 'Collapse All'}
        </button>
      </div>

      {/* Agreement Stats */}
      <AgreementStatsPanel meta={meta} />

      {/* Patterns List */}
      <div className="mt-6">
        <h3 className="text-sm font-medium text-slate-300 mb-3">
          Detected Patterns ({patterns.length})
        </h3>

        {patterns.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <CheckCircle size={32} className="mx-auto mb-2 text-green-500" />
            <p>No manipulation patterns detected by either judge.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {patterns.map((pattern, idx) => (
              <PatternCard
                key={idx}
                pattern={pattern}
                judge1Model={meta.judge_1_model}
                judge2Model={meta.judge_2_model}
                judge1Patterns={result?._judge_1_result?.patterns}
                judge2Patterns={result?._judge_2_result?.patterns}
                expanded={expandedPatterns.has(idx)}
                onToggle={() => togglePattern(idx)}
                conversationTurns={conversationTurns}
                judge1FlaggedIndices={getJudgeFlaggedIndices(result?._judge_1_result)}
                judge2FlaggedIndices={getJudgeFlaggedIndices(result?._judge_2_result)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Conversation Preview */}
      {conversationId && (
        <div className="mt-6">
          <ConversationPreview
            conversationId={conversationId}
            judge1Result={result?._judge_1_result}
            judge2Result={result?._judge_2_result}
            judge1Model={meta.judge_1_model}
            judge2Model={meta.judge_2_model}
            onViewFull={() => navigate(`/traces/${conversationId}`)}
          />
        </div>
      )}
    </div>
  );
};

export default JudgeComparisonView;
