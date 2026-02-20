import React, { useMemo } from 'react';
import type { GuideStep } from './guideSteps';

interface GuideTooltipProps {
  step: GuideStep | null;
  stepIndex: number;
  totalSteps: number;
  targetRect: DOMRect | null;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

type Placement = 'top' | 'bottom' | 'left' | 'right';

const TOOLTIP_WIDTH = 320;
const TOOLTIP_GAP = 16;

export const GuideTooltip: React.FC<GuideTooltipProps> = ({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  onNext,
  onPrev,
  onSkip,
}) => {
  const isLastStep = stepIndex === totalSteps - 1;
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  const { placement, style, arrowStyle } = useMemo(() => {
    if (!targetRect || isMobile) {
      // Center bottom on mobile or if no target
      return {
        placement: 'bottom' as Placement,
        style: {
          position: 'fixed' as const,
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          width: isMobile ? 'calc(100vw - 32px)' : TOOLTIP_WIDTH,
          maxWidth: TOOLTIP_WIDTH,
        },
        arrowStyle: null,
      };
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const padding = 8;

    // Determine best placement
    let placement: Placement = step?.placement || 'bottom';

    if (!step?.placement) {
      const spaceBelow = vh - (targetRect.bottom + padding);
      const spaceAbove = targetRect.top - padding;
      const spaceRight = vw - (targetRect.right + padding);
      const spaceLeft = targetRect.left - padding;

      if (spaceBelow >= 200) placement = 'bottom';
      else if (spaceAbove >= 200) placement = 'top';
      else if (spaceRight >= TOOLTIP_WIDTH + TOOLTIP_GAP) placement = 'right';
      else if (spaceLeft >= TOOLTIP_WIDTH + TOOLTIP_GAP) placement = 'left';
      else placement = 'bottom';
    }

    const centerX = targetRect.left + targetRect.width / 2;
    const centerY = targetRect.top + targetRect.height / 2;

    let tooltipLeft = 0;
    let tooltipTop = 0;
    const arrowStyle: React.CSSProperties = { position: 'absolute' };

    switch (placement) {
      case 'bottom':
        tooltipLeft = Math.max(16, Math.min(centerX - TOOLTIP_WIDTH / 2, vw - TOOLTIP_WIDTH - 16));
        tooltipTop = targetRect.bottom + padding + TOOLTIP_GAP;
        arrowStyle.top = -6;
        arrowStyle.left = Math.max(16, Math.min(centerX - tooltipLeft, TOOLTIP_WIDTH - 16));
        arrowStyle.transform = 'translateX(-50%) rotate(45deg)';
        break;
      case 'top':
        tooltipLeft = Math.max(16, Math.min(centerX - TOOLTIP_WIDTH / 2, vw - TOOLTIP_WIDTH - 16));
        tooltipTop = targetRect.top - padding - TOOLTIP_GAP;
        arrowStyle.bottom = -6;
        arrowStyle.left = Math.max(16, Math.min(centerX - tooltipLeft, TOOLTIP_WIDTH - 16));
        arrowStyle.transform = 'translateX(-50%) rotate(45deg)';
        break;
      case 'right':
        tooltipLeft = targetRect.right + padding + TOOLTIP_GAP;
        tooltipTop = Math.max(16, Math.min(centerY - 60, vh - 200));
        arrowStyle.left = -6;
        arrowStyle.top = 24;
        arrowStyle.transform = 'rotate(45deg)';
        break;
      case 'left':
        tooltipLeft = targetRect.left - padding - TOOLTIP_GAP - TOOLTIP_WIDTH;
        tooltipTop = Math.max(16, Math.min(centerY - 60, vh - 200));
        arrowStyle.right = -6;
        arrowStyle.top = 24;
        arrowStyle.transform = 'rotate(45deg)';
        break;
    }

    return {
      placement,
      style: {
        position: 'fixed' as const,
        left: tooltipLeft,
        top: placement === 'top' ? undefined : tooltipTop,
        bottom: placement === 'top' ? (vh - tooltipTop) : undefined,
        width: TOOLTIP_WIDTH,
      },
      arrowStyle,
    };
  }, [targetRect, step?.placement, isMobile]);

  if (!step) return null;

  return (
    <div
      className="z-[9999] animate-in fade-in slide-in-from-bottom-1 duration-150"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-5 relative">
        {/* Arrow */}
        {arrowStyle && !isMobile && (
          <div
            className="w-3 h-3 bg-white border-l border-t border-slate-100"
            style={{
              ...arrowStyle,
              ...(placement === 'bottom' ? { borderRight: 'none', borderBottom: 'none' } : {}),
              ...(placement === 'top' ? { borderLeft: 'none', borderTop: 'none', borderRight: '1px solid rgb(241,245,249)', borderBottom: '1px solid rgb(241,245,249)' } : {}),
              ...(placement === 'right' ? { borderRight: 'none', borderBottom: 'none' } : {}),
              ...(placement === 'left' ? { borderLeft: 'none', borderTop: 'none', borderRight: '1px solid rgb(241,245,249)', borderBottom: '1px solid rgb(241,245,249)' } : {}),
            }}
          />
        )}

        {/* Content */}
        <h3 className="text-base font-bold text-slate-900">{step.title}</h3>
        <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{step.description}</p>

        {/* Step indicator + Navigation */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
          <span className="text-xs text-slate-400">
            {stepIndex + 1} of {totalSteps}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onSkip}
              className="text-xs text-slate-400 underline hover:text-slate-600 transition-colors px-1"
            >
              Skip
            </button>

            {stepIndex > 0 && (
              <button
                onClick={onPrev}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Back
              </button>
            )}

            <button
              onClick={onNext}
              className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm"
            >
              {isLastStep ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
