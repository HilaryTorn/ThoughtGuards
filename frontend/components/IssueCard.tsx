import React, { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { HOWCode, WHYCode, TARGETCode } from '../types';
import TriadDisplay from './TriadDisplay';

export interface ConfidenceBreakdown {
  final_confidence: number;
  base_confidence: number;
  agreement_factor: number;
  evidence_factor: number;
  calibration_factor?: number;
  breakdown?: string;
}

export interface IssueCardProps {
  id: string;
  title: string;
  description?: string;
  severity: 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
  severityScore?: number;
  howCode: HOWCode;
  whyCode: WHYCode;
  targetCode: TARGETCode;
  sentence?: string;
  evidenceQuotes?: Array<{
    text: string;
    source: 'conversation' | 'reasoning_trace';
  }>;
  impactNote?: string;
  // Cross-validation match type info (optional)
  matchType?: 'exact' | 'partial' | 'single_judge';
  matchSimilarity?: number;
  detectedBy?: 'judge_1' | 'judge_2';
  judge1Name?: string;
  judge2Name?: string;
  // Confidence breakdown for cross-validation
  confidenceBreakdown?: ConfidenceBreakdown;
  judge1Confidence?: number;
  judge2Confidence?: number;
  // Axis disagreement for partial matches
  axisDisagreement?: Record<string, { j1: string; j2: string }>;
}

const severityStyles = {
  very_high: {
    dot: 'bg-red-500',
    badge: 'bg-red-500/15 text-red-400 border-red-500/30',
    label: 'Very High',
  },
  high: {
    dot: 'bg-red-500',
    badge: 'bg-red-500/15 text-red-400 border-red-500/30',
    label: 'High',
  },
  medium: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    label: 'Medium',
  },
  low: {
    dot: 'bg-blue-500',
    badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    label: 'Low',
  },
  very_low: {
    dot: 'bg-blue-500',
    badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    label: 'Very Low',
  },
};

/**
 * Individual issue card for the DetectedIssuesPanel.
 * Shows severity, triad classification, evidence quotes, and impact.
 */
/**
 * Returns the match type badge component
 */
const getMatchTypeBadge = (
  matchType?: 'exact' | 'partial' | 'single_judge',
  matchSimilarity?: number,
  detectedBy?: 'judge_1' | 'judge_2',
  judge1Name?: string,
  judge2Name?: string
) => {
  if (!matchType) return null;

  switch (matchType) {
    case 'exact':
      return (
        <span className="px-2 py-0.5 text-[10px] rounded bg-green-500/20 text-green-400 border border-green-500/50 font-medium">
          ✓ EXACT
        </span>
      );
    case 'partial':
      return (
        <span className="px-2 py-0.5 text-[10px] rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 font-medium">
          ~ {Math.round((matchSimilarity || 0) * 100)}% match
        </span>
      );
    case 'single_judge':
      const judgeName = detectedBy === 'judge_1' ? (judge1Name || 'Judge A') : (judge2Name || 'Judge B');
      const badgeClass = detectedBy === 'judge_1' ? 'bg-orange-500/20 text-orange-400 border-orange-500/50' : 'bg-purple-500/20 text-purple-400 border-purple-500/50';
      return (
        <span className={`px-2 py-0.5 text-[10px] rounded ${badgeClass} font-medium`}>
          ⚠ {judgeName} only
        </span>
      );
    default:
      return null;
  }
};

/**
 * Returns the border style based on match type
 */
const getMatchBorderStyle = (matchType?: 'exact' | 'partial' | 'single_judge') => {
  switch (matchType) {
    case 'exact':
      return 'border-l-2 border-l-green-500/50';
    case 'partial':
      return 'border-l-2 border-l-yellow-500/50';
    case 'single_judge':
      return 'border-l-2 border-l-orange-500/50 border-dashed';
    default:
      return '';
  }
};

const IssueCard: React.FC<IssueCardProps> = ({
  id,
  title,
  description,
  severity,
  severityScore,
  howCode,
  whyCode,
  targetCode,
  sentence,
  evidenceQuotes,
  impactNote,
  matchType,
  matchSimilarity,
  detectedBy,
  judge1Name,
  judge2Name,
  confidenceBreakdown,
  judge1Confidence,
  judge2Confidence,
  axisDisagreement,
}) => {
  const styles = severityStyles[severity];
  const [isExpanded, setIsExpanded] = useState(false);
  const matchBorderStyle = getMatchBorderStyle(matchType);

  return (
    <div className={`border-b border-slate-800 last:border-b-0 ${matchBorderStyle}`}>
      {/* Collapsed Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between hover:bg-slate-800/30 transition-colors p-3"
      >
        <div className="flex items-center gap-2.5">
          {isExpanded ? (
            <ChevronDown size={14} className="text-slate-400" />
          ) : (
            <ChevronRight size={14} className="text-slate-400" />
          )}
          <span className={`w-2.5 h-2.5 rounded-full ${styles.dot}`} />
          <span className="font-mono text-sm font-semibold text-cyan-400">{id}</span>
          <span className="text-sm text-slate-500">— {title}</span>
          {getMatchTypeBadge(matchType, matchSimilarity, detectedBy, judge1Name, judge2Name)}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded uppercase tracking-wide border ${styles.badge}`}>
            {styles.label}{severityScore !== undefined ? ` (${severityScore})` : ''}
          </span>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-5 pb-5 pt-2 pl-11">
          {/* Triad Display */}
          <div className="mb-4">
            <TriadDisplay
              howCode={howCode}
              whyCode={whyCode}
              targetCode={targetCode}
              sentence={sentence}
            />
          </div>

          {/* Description */}
          {description && (
            <p className="text-sm text-slate-400 mb-4 leading-relaxed">
              {description}
            </p>
          )}

          {/* Evidence Section */}
          {evidenceQuotes && evidenceQuotes.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[11px] font-medium text-slate-600 uppercase tracking-wide mb-2.5">
                Evidence from {evidenceQuotes[0]?.source === 'reasoning_trace' ? 'Reasoning' : 'Conversation'}
              </h4>
              <div className="space-y-2">
                {evidenceQuotes.map((quote, idx) => (
                  <div
                    key={idx}
                    className="font-mono text-xs text-amber-400 bg-amber-500/10 px-3.5 py-2.5 rounded border-l-2 border-amber-500"
                  >
                    "{quote.text}"
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Impact Note */}
          {impactNote && (
            <div className="flex items-center gap-2 text-xs text-red-400 mt-3">
              <AlertCircle size={14} />
              <span>Impact: {impactNote}</span>
            </div>
          )}

          {/* Axis Disagreement (for partial matches) */}
          {matchType === 'partial' && axisDisagreement && Object.keys(axisDisagreement).length > 0 && (
            <div className="flex gap-2 text-xs mt-3 flex-wrap">
              <span className="text-slate-500">Axis disagreements:</span>
              {Object.entries(axisDisagreement).map(([axis, vals]) => (
                <span key={axis} className="text-yellow-400 font-mono">
                  {axis}: {vals.j1} ≠ {vals.j2}
                </span>
              ))}
            </div>
          )}

          {/* Cross-Validation Confidence Breakdown */}
          {(confidenceBreakdown || judge1Confidence !== undefined || judge2Confidence !== undefined) && (
            <div className="border-t border-slate-800 pt-3 mt-3">
              {/* Breakdown formula */}
              {confidenceBreakdown?.breakdown && (
                <div className="text-xs text-slate-500 font-mono mb-2">
                  {confidenceBreakdown.breakdown}
                </div>
              )}

              {/* Judge confidence grid */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">
                    {judge1Name || 'Judge A'}:
                  </span>
                  <span className="font-bold text-slate-200 ml-1">
                    {matchType === 'single_judge' && detectedBy === 'judge_2' ? (
                      <span className="italic text-slate-500">Not detected</span>
                    ) : (
                      `${(judge1Confidence ?? confidenceBreakdown?.base_confidence ?? 0).toFixed(2)} conf`
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">
                    {judge2Name || 'Judge B'}:
                  </span>
                  <span className="font-bold text-slate-200 ml-1">
                    {matchType === 'single_judge' && detectedBy === 'judge_1' ? (
                      <span className="italic text-slate-500">Not detected</span>
                    ) : (
                      `${(judge2Confidence ?? confidenceBreakdown?.base_confidence ?? 0).toFixed(2)} conf`
                    )}
                  </span>
                </div>
              </div>

              {/* Aggregated metrics */}
              {confidenceBreakdown && (
                <div className="mt-2 text-xs flex gap-4 flex-wrap">
                  <span>
                    <span className="text-slate-400">Agreement:</span>
                    <span className={`font-bold ml-1 ${
                      confidenceBreakdown.agreement_factor >= 1.0 ? 'text-green-400' : 'text-orange-400'
                    }`}>
                      {confidenceBreakdown.agreement_factor.toFixed(2)}x
                    </span>
                  </span>
                  <span>
                    <span className="text-slate-400">Evidence:</span>
                    <span className="font-bold text-slate-200 ml-1">
                      {confidenceBreakdown.evidence_factor.toFixed(2)}x
                    </span>
                  </span>
                  <span>
                    <span className="text-slate-400">Final:</span>
                    <span className="font-bold text-cyan-400 ml-1">
                      {confidenceBreakdown.final_confidence.toFixed(2)}
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IssueCard;
