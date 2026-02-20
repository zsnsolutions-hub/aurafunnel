import React, { createContext, useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { guideTours, type GuideStep } from './guideSteps';
import { GuideOverlay } from './GuideOverlay';
import { GuideTooltip } from './GuideTooltip';
import ReactDOM from 'react-dom';

const COMPLETED_KEY = 'aurafunnel_guide_completed';
const SEEN_KEY = 'aurafunnel_guide_seen';

interface GuideContextValue {
  startTour: (tourId: string) => void;
  stopTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  resetAllGuides: () => void;
  isActive: boolean;
  currentStep: GuideStep | null;
  currentStepIndex: number;
  totalSteps: number;
}

export const GuideContext = createContext<GuideContextValue | null>(null);

export const GuideProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTourId, setCurrentTourId] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const pollingRef = useRef<number | null>(null);
  const autoStartedRef = useRef(false);

  const currentTour = currentTourId ? guideTours.find(t => t.id === currentTourId) : null;
  const currentStep = currentTour ? currentTour.steps[currentStepIndex] ?? null : null;
  const totalSteps = currentTour ? currentTour.steps.length : 0;
  const isActive = !!currentTour && visible;

  const getCompletedTours = (): string[] => {
    try {
      return JSON.parse(localStorage.getItem(COMPLETED_KEY) || '[]');
    } catch { return []; }
  };

  const markTourCompleted = (tourId: string) => {
    const completed = getCompletedTours();
    if (!completed.includes(tourId)) {
      completed.push(tourId);
      localStorage.setItem(COMPLETED_KEY, JSON.stringify(completed));
    }
  };

  const clearPolling = useCallback(() => {
    if (pollingRef.current !== null) {
      cancelAnimationFrame(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const acquireTarget = useCallback((step: GuideStep): HTMLElement | null => {
    return document.querySelector(step.target) as HTMLElement | null;
  }, []);

  const updateRect = useCallback(() => {
    if (!currentStep) return;
    const el = acquireTarget(currentStep);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentStep, acquireTarget]);

  // Poll for target element after route change or step change
  const pollForElement = useCallback((step: GuideStep) => {
    clearPolling();
    const start = Date.now();
    const poll = () => {
      const el = acquireTarget(step);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
        setVisible(true);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Re-read rect after scroll settles
        setTimeout(() => {
          const freshRect = el.getBoundingClientRect();
          setTargetRect(freshRect);
        }, 400);
        return;
      }
      if (Date.now() - start < 3000) {
        pollingRef.current = requestAnimationFrame(poll);
      } else {
        // Element not found — skip to next step
        setTargetRect(null);
        setVisible(true);
      }
    };
    pollingRef.current = requestAnimationFrame(poll);
  }, [acquireTarget, clearPolling]);

  // Navigate to step and acquire element
  const goToStep = useCallback((tour: typeof currentTour, stepIdx: number) => {
    if (!tour) return;
    const step = tour.steps[stepIdx];
    if (!step) return;

    setCurrentStepIndex(stepIdx);
    setVisible(false);

    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
      // pollForElement will be triggered by the effect below
    } else {
      pollForElement(step);
    }
  }, [location.pathname, navigate, pollForElement]);

  // When location changes while tour is active, re-poll for current step
  useEffect(() => {
    if (currentTour && currentStep && currentStep.route) {
      if (location.pathname === currentStep.route) {
        pollForElement(currentStep);
      }
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize/scroll handler
  useEffect(() => {
    if (!isActive) return;
    let debounceTimer: ReturnType<typeof setTimeout>;
    const handler = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updateRect, 50);
    };
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      clearTimeout(debounceTimer);
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [isActive, updateRect]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        stopTour();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevStep();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, currentStepIndex, currentTourId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startTour = useCallback((tourId: string) => {
    const tour = guideTours.find(t => t.id === tourId);
    if (!tour || tour.steps.length === 0) return;
    setCurrentTourId(tourId);
    goToStep(tour, 0);
  }, [goToStep]);

  const stopTour = useCallback(() => {
    clearPolling();
    if (currentTourId) {
      markTourCompleted(currentTourId);
    }
    setCurrentTourId(null);
    setCurrentStepIndex(0);
    setTargetRect(null);
    setVisible(false);
  }, [currentTourId, clearPolling]);

  const nextStep = useCallback(() => {
    if (!currentTour) return;
    if (currentStepIndex < currentTour.steps.length - 1) {
      goToStep(currentTour, currentStepIndex + 1);
    } else {
      stopTour();
    }
  }, [currentTour, currentStepIndex, goToStep, stopTour]);

  const prevStep = useCallback(() => {
    if (!currentTour || currentStepIndex <= 0) return;
    goToStep(currentTour, currentStepIndex - 1);
  }, [currentTour, currentStepIndex, goToStep]);

  const skipTour = useCallback(() => {
    stopTour();
  }, [stopTour]);

  const resetAllGuides = useCallback(() => {
    localStorage.removeItem(COMPLETED_KEY);
    localStorage.removeItem(SEEN_KEY);
    setCurrentTourId(null);
    setCurrentStepIndex(0);
    setTargetRect(null);
    setVisible(false);
  }, []);

  // Auto-start dashboard tour for first-time users
  const startTourRef = useRef(startTour);
  startTourRef.current = startTour;

  useEffect(() => {
    if (autoStartedRef.current) return;
    if (location.pathname !== '/portal') return;
    const seen = localStorage.getItem(SEEN_KEY);
    if (!seen) {
      autoStartedRef.current = true;
      localStorage.setItem(SEEN_KEY, 'true');
      // Delay to let the dashboard render fully
      const timer = setTimeout(() => startTourRef.current('dashboard'), 1500);
      return () => clearTimeout(timer);
    }
  }, [location.pathname]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearPolling();
  }, [clearPolling]);

  const ctxValue: GuideContextValue = {
    startTour,
    stopTour,
    nextStep,
    prevStep,
    skipTour,
    resetAllGuides,
    isActive,
    currentStep,
    currentStepIndex,
    totalSteps,
  };

  return (
    <GuideContext.Provider value={ctxValue}>
      {children}
      {isActive && visible && ReactDOM.createPortal(
        <>
          <GuideOverlay targetRect={targetRect} onBackdropClick={skipTour} />
          <GuideTooltip
            step={currentStep}
            stepIndex={currentStepIndex}
            totalSteps={totalSteps}
            targetRect={targetRect}
            onNext={nextStep}
            onPrev={prevStep}
            onSkip={skipTour}
          />
        </>,
        document.body
      )}
    </GuideContext.Provider>
  );
};

// ─── GuideMenuButton ─────────────────────────────────────────
// Self-contained button + dropdown for the topbar
export const GuideMenuButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 hover:border-indigo-200 transition-all duration-150 ease-out"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
        <span>Guide Me</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-[9990] animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Interactive Tours</p>
          </div>
          {guideTours.map(tour => (
            <GuideMenuTourItem key={tour.id} tour={tour} onSelect={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
};

const GuideMenuTourItem: React.FC<{ tour: typeof guideTours[0]; onSelect: () => void }> = ({ tour, onSelect }) => {
  const ctx = React.useContext(GuideContext);
  const completed = (() => {
    try { return JSON.parse(localStorage.getItem(COMPLETED_KEY) || '[]') as string[]; }
    catch { return []; }
  })();
  const isDone = completed.includes(tour.id);

  return (
    <button
      onClick={() => {
        ctx?.startTour(tour.id);
        onSelect();
      }}
      className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
    >
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${isDone ? 'bg-emerald-400' : 'bg-slate-300'}`} />
        <span className="text-sm font-medium text-slate-700">{tour.label}</span>
      </div>
      <span className="text-[10px] text-slate-400">{tour.steps.length} steps</span>
    </button>
  );
};
