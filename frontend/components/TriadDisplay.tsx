import React from 'react';
import { HOWCode, WHYCode, TARGETCode } from '../types';
import { HOW_VERBS, WHY_VERBS, TARGET_VERBS } from '../constants';
import InfoTooltip from './InfoTooltip';

interface TriadDisplayProps {
  howCode: HOWCode;
  whyCode: WHYCode;
  targetCode: TARGETCode;
  sentence?: string;
  compact?: boolean;
}

/**
 * Displays the WHY/HOW/TARGET triad as styled tags with arrows.
 * Reusable across TraceDetail, IssueCard, and other views.
 */
const TriadDisplay: React.FC<TriadDisplayProps> = ({
  howCode,
  whyCode,
  targetCode,
  sentence,
  compact = false,
}) => {
  const howInfo = HOW_VERBS[howCode];
  const whyInfo = WHY_VERBS[whyCode];
  const targetInfo = TARGET_VERBS[targetCode];

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/30">
          {howCode}
        </span>
        <span className="text-slate-600">|</span>
        <span className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          {whyCode}
        </span>
        <span className="text-slate-600">|</span>
        <span className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
          {targetCode}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Triad Tags Row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* HOW Tag */}
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded font-mono bg-purple-500/15 text-purple-400 border border-purple-500/30">
          <span className="text-[10px] opacity-70 uppercase tracking-wide">HOW</span>
          {howInfo?.verb || howCode}
          <InfoTooltip
            title={`${howCode}: ${howInfo?.verb || 'Unknown'}`}
            content={howInfo?.description || 'Detection mechanism'}
            iconSize={10}
          />
        </span>

        <span className="text-slate-600 text-sm">→</span>

        {/* WHY Tag */}
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <span className="text-[10px] opacity-70 uppercase tracking-wide">WHY</span>
          {whyInfo?.verb || whyCode}
          <InfoTooltip
            title={`${whyCode}: ${whyInfo?.verb || 'Unknown'}`}
            content={whyInfo?.description || 'Motivation behind the behavior'}
            iconSize={10}
          />
        </span>

        <span className="text-slate-600 text-sm">→</span>

        {/* TARGET Tag */}
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded font-mono bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
          <span className="text-[10px] opacity-70 uppercase tracking-wide">TARGET</span>
          {targetInfo?.verb || targetCode}
          <InfoTooltip
            title={`${targetCode}: ${targetInfo?.verb || 'Unknown'}`}
            content={targetInfo?.description || 'Affected party or system'}
            iconSize={10}
          />
        </span>
      </div>

      {/* Sentence Summary */}
      {sentence && (
        <div className="text-xs text-slate-500 italic px-3 py-2.5 bg-slate-800/50 rounded border-l-2 border-slate-700">
          <span dangerouslySetInnerHTML={{
            __html: sentence
              .replace(howInfo?.verb || '', `<strong class="text-slate-300 not-italic">${howInfo?.verb || ''}</strong>`)
              .replace(whyInfo?.verb?.toLowerCase() || '', `<strong class="text-slate-300 not-italic">${whyInfo?.verb?.toLowerCase() || ''}</strong>`)
              .replace(targetInfo?.verb?.toLowerCase() || '', `<strong class="text-slate-300 not-italic">${targetInfo?.verb?.toLowerCase() || ''}</strong>`)
          }} />
        </div>
      )}
    </div>
  );
};

export default TriadDisplay;
