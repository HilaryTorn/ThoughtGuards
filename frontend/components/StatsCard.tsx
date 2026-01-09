import React from 'react';
import { CategoryStyle, HOWCode } from '../types';
import { HOW_VERBS } from '../constants';
import InfoTooltip from './InfoTooltip';

interface StatsCardProps {
  style: CategoryStyle;
  count: number;
}

// Map category labels to HOW codes for tooltip descriptions
const categoryToHowCode: Record<string, HOWCode> = {
  'Fabricated': 'H1',
  'Sandbagged': 'H2',
  'Context-Switched': 'H3',
  'Pressured': 'H4',
  'Hid': 'H5',
  'Overclaimed': 'H6',
};

const StatsCard: React.FC<StatsCardProps> = ({ style, count }) => {
  const howCode = categoryToHowCode[style.label];
  const howInfo = howCode ? HOW_VERBS[howCode] : null;

  return (
    <div className={`glass-panel p-4 rounded-xl border-l-4 ${style.borderColor} transition-transform hover:scale-105 duration-200`}>
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{style.label}</p>
        {howInfo && (
          <InfoTooltip
            title={`${howCode}: ${howInfo.name}`}
            content={howInfo.description}
            iconSize={12}
          />
        )}
      </div>
      <p className="text-2xl font-bold text-slate-100">{count}</p>
    </div>
  );
};

export default StatsCard;
