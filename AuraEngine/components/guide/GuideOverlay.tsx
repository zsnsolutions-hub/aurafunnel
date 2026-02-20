import React from 'react';

interface GuideOverlayProps {
  targetRect: DOMRect | null;
  onBackdropClick: () => void;
}

export const GuideOverlay: React.FC<GuideOverlayProps> = ({ targetRect, onBackdropClick }) => {
  const padding = 8;

  return (
    <div
      className="fixed inset-0 z-[9998] transition-opacity duration-200"
      onClick={onBackdropClick}
      style={{ pointerEvents: 'auto' }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        style={{ backdropFilter: 'blur(1px)' }}
      >
        <defs>
          <mask id="guide-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - padding}
                y={targetRect.top - padding}
                width={targetRect.width + padding * 2}
                height={targetRect.height + padding * 2}
                rx="12"
                ry="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.5)"
          mask="url(#guide-spotlight-mask)"
        />
        {/* Highlight border around target */}
        {targetRect && (
          <rect
            x={targetRect.left - padding}
            y={targetRect.top - padding}
            width={targetRect.width + padding * 2}
            height={targetRect.height + padding * 2}
            rx="12"
            ry="12"
            fill="none"
            stroke="rgba(99,102,241,0.5)"
            strokeWidth="2"
          />
        )}
      </svg>
      {/* Transparent click-through area over the target element */}
      {targetRect && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: targetRect.left - padding,
            top: targetRect.top - padding,
            width: targetRect.width + padding * 2,
            height: targetRect.height + padding * 2,
            borderRadius: 12,
            pointerEvents: 'auto',
            cursor: 'default',
          }}
        />
      )}
    </div>
  );
};
