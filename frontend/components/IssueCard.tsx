import React from 'react';
import { AlertCircle } from 'lucide-react';
import { HOWCode, WHYCode, TARGETCode } from '../types';
import TriadDisplay from './TriadDisplay';

export interface IssueCardProps {
  id: string;
  title: string;
  description?: string;
  severity: 'high' | 'medium' | 'low';
  howCode: HOWCode;
  whyCode: WHYCode;
  targetCode: TARGETCode;
  sentence?: string;
  evidenceQuotes?: Array<{
    text: string;
    source: 'conversation' | 'reasoning_trace';
  }>;
  impactNote?: string;
}

const severityStyles = {
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
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    label: 'Low',
  },
};

/**
 * Individual issue card for the DetectedIssuesPanel.
 * Shows severity, triad classification, evidence quotes, and impact.
 */
const IssueCard: React.FC<IssueCardProps> = ({
  id,
  title,
  description,
  severity,
  howCode,
  whyCode,
  targetCode,
  sentence,
  evidenceQuotes,
  impactNote,
}) => {
  const styles = severityStyles[severity];

  return (
    <div className="p-5 border-b border-slate-800 last:border-b-0">
      {/* Header Row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full ${styles.dot}`} />
          <span className="font-mono text-sm font-semibold text-cyan-400">{id}</span>
          <span className="text-sm text-slate-500">— {title}</span>
        </div>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded uppercase tracking-wide border ${styles.badge}`}>
          {styles.label}
        </span>
      </div>

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
    </div>
  );
};

export default IssueCard;
