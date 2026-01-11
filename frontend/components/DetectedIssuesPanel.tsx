import React, { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import IssueCard, { IssueCardProps } from './IssueCard';
import { HOWCode, WHYCode, TARGETCode } from '../types';
import { HOW_VERBS } from '../constants';

export interface ConfidenceBreakdown {
  final_confidence: number;
  base_confidence: number;
  agreement_factor: number;
  evidence_factor: number;
  calibration_factor?: number;
  breakdown?: string;
}

export interface TaxonomyPattern {
  triad: string;
  how_code: HOWCode;
  why_code: WHYCode;
  target_code: TARGETCode;
  sentence: string;
  short_desc: string;
  prominence: number;
  pattern_confidence: number;
  severity?: number;
  quotes?: Array<{
    speaker: string;
    message_index: number;
    text: string;
    source: 'conversation' | 'reasoning_trace';
  }>;
  evidence_notes?: string;
  how?: { code: HOWCode; verb: string; name: string };
  why?: { code: WHYCode; verb: string; name: string };
  target?: { code: TARGETCode; verb: string; name: string };
  // Cross-validation match type info (optional - from AggregatedPattern)
  _match_type?: 'exact' | 'partial' | 'single_judge';
  _similarity?: number;
  _detected_by?: 'judge_1' | 'judge_2';
  _confidence_breakdown?: ConfidenceBreakdown;
  _axis_disagreement?: Record<string, { j1: string; j2: string }>;
  _judge1_confidence?: number;
  _judge2_confidence?: number;
}

interface DetectedIssuesPanelProps {
  patterns: TaxonomyPattern[];
  className?: string;
  // Judge names for cross-validation display (optional)
  judge1Name?: string;
  judge2Name?: string;
}

/**
 * Maps pattern confidence/severity to a severity level
 */
function getSeverity(pattern: TaxonomyPattern): 'high' | 'medium' | 'low' {
  // Use severity if provided (0-5 scale), otherwise use prominence/confidence
  if (pattern.severity !== undefined) {
    if (pattern.severity >= 4) return 'high';
    if (pattern.severity >= 2) return 'medium';
    return 'low';
  }

  const score = Math.max(pattern.prominence || 0, pattern.pattern_confidence || 0);
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

/**
 * Generates a short issue ID from the pattern
 */
function generateIssueId(pattern: TaxonomyPattern, index: number): string {
  const howCode = pattern.how_code;
  // Map HOW codes to short prefixes
  const prefixMap: Record<string, string> = {
    H1: 'FB', // Fabricated
    H2: 'SB', // Sandbagged
    H3: 'CS', // Context-Switched
    H4: 'PR', // Pressured
    H5: 'HD', // Hid
    H6: 'OC', // Overclaimed
  };
  const prefix = prefixMap[howCode] || 'IS';
  return `${prefix}-${String(index + 1).padStart(2, '0')}`;
}

/**
 * Generates a title from the HOW verb
 */
function generateTitle(pattern: TaxonomyPattern): string {
  // Use HOW_VERBS constant first to ensure clean verbs without "action"
  const howVerb = HOW_VERBS[pattern.how_code]?.verb || pattern.how?.verb || pattern.how_code;
  return howVerb;
}

/**
 * Extracts impact note from evidence or generates one
 */
function getImpactNote(pattern: TaxonomyPattern): string | undefined {
  const targetVerb = pattern.target?.verb || pattern.target_code;
  const targetName = pattern.target?.name || '';

  // Generate impact based on target
  const impactMap: Record<string, string> = {
    T1: 'User may receive incorrect or misleading information',
    T2: 'Oversight cannot detect this behavior',
    T3: 'Policy constraints may be bypassed',
    T4: 'External systems or parties may be affected',
  };

  return impactMap[pattern.target_code] || pattern.evidence_notes;
}

/**
 * Panel displaying all detected issues with taxonomy classification.
 * Used in TraceDetail view for flagged conversations.
 */
const DetectedIssuesPanel: React.FC<DetectedIssuesPanelProps> = ({
  patterns,
  className = '',
  judge1Name,
  judge2Name,
}) => {
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);

  if (!patterns || patterns.length === 0) {
    return (
      <div className={`bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden ${className}`}>
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800 bg-slate-900/70">
          <AlertCircle size={16} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-400">Detected Issues</h3>
        </div>
        <div className="p-5 text-center text-sm text-slate-500">
          No issues detected in this conversation.
        </div>
      </div>
    );
  }

  // Sort patterns by severity (prominence/confidence)
  const sortedPatterns = [...patterns].sort((a, b) => {
    const scoreA = Math.max(a.prominence || 0, a.pattern_confidence || 0, (a.severity || 0) / 5);
    const scoreB = Math.max(b.prominence || 0, b.pattern_confidence || 0, (b.severity || 0) / 5);
    return scoreB - scoreA;
  });

  return (
    <div className={`bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden flex flex-col ${className}`}>
      {/* Panel Header - Clickable */}
      <button
        onClick={() => setIsPanelExpanded(!isPanelExpanded)}
        className="w-full flex items-center gap-2 px-5 py-4 border-b border-slate-800 bg-slate-900/70 hover:bg-slate-900 transition-colors"
      >
        {isPanelExpanded ? (
          <ChevronDown size={14} className="text-slate-400" />
        ) : (
          <ChevronRight size={14} className="text-slate-400" />
        )}
        <AlertCircle size={16} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-amber-500">Detected Issues ({patterns.length})</h3>

        {!isPanelExpanded && (
          <div className="ml-2 text-xs text-slate-400 font-mono truncate flex-1 text-left">
            {sortedPatterns.slice(0, 4).map((p, i) => generateIssueId(p, i)).join(', ')}
            {patterns.length > 4 && ` +${patterns.length - 4} more`}
          </div>
        )}
      </button>

      {/* Issue Cards - Scrollable */}
      {isPanelExpanded && (
        <div className="overflow-y-auto">
          {sortedPatterns.map((pattern, index) => (
            <IssueCard
              key={pattern.triad + index}
              id={generateIssueId(pattern, index)}
              title={generateTitle(pattern)}
              description={pattern.short_desc}
              severity={getSeverity(pattern)}
              howCode={pattern.how_code}
              whyCode={pattern.why_code}
              targetCode={pattern.target_code}
              sentence={pattern.sentence}
              evidenceQuotes={pattern.quotes?.map(q => ({
                text: q.text,
                source: q.source,
              }))}
              impactNote={getImpactNote(pattern)}
              matchType={pattern._match_type}
              matchSimilarity={pattern._similarity}
              detectedBy={pattern._detected_by}
              judge1Name={judge1Name}
              judge2Name={judge2Name}
              confidenceBreakdown={pattern._confidence_breakdown}
              judge1Confidence={pattern._judge1_confidence}
              judge2Confidence={pattern._judge2_confidence}
              axisDisagreement={pattern._axis_disagreement}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default DetectedIssuesPanel;
