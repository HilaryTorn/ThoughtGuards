import React, { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  content: string;
  title?: string;
  className?: string;
  iconSize?: number;
}

/**
 * Info icon with click tooltip for explaining taxonomy terms.
 */
const InfoTooltip: React.FC<InfoTooltipProps> = ({
  content,
  title,
  className = '',
  iconSize = 12,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setIsVisible(false);
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible]);

  return (
    <div ref={tooltipRef} className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        className="text-slate-500 hover:text-slate-400 transition-colors cursor-pointer"
        onClick={() => setIsVisible(!isVisible)}
        aria-label={title || 'More information'}
        aria-expanded={isVisible}
      >
        <Info size={iconSize} />
      </button>

      {isVisible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-xl max-w-xs min-w-[200px]">
            {title && (
              <p className="text-xs font-semibold text-slate-200 mb-1">{title}</p>
            )}
            <p className="text-xs text-slate-400 leading-relaxed">{content}</p>
          </div>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="border-4 border-transparent border-t-slate-700" />
          </div>
        </div>
      )}
    </div>
  );
};

export default InfoTooltip;
