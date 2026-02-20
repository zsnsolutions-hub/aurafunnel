import { useContext } from 'react';
import { GuideContext } from './GuideProvider';
import type { GuideStep } from './guideSteps';

export interface UseGuideReturn {
  startTour: (tourId: string) => void;
  stopTour: () => void;
  resetAllGuides: () => void;
  isActive: boolean;
  currentStep: GuideStep | null;
  currentStepIndex: number;
  totalSteps: number;
}

export function useGuide(): UseGuideReturn {
  const ctx = useContext(GuideContext);
  if (!ctx) {
    return {
      startTour: () => {},
      stopTour: () => {},
      resetAllGuides: () => {},
      isActive: false,
      currentStep: null,
      currentStepIndex: 0,
      totalSteps: 0,
    };
  }
  return {
    startTour: ctx.startTour,
    stopTour: ctx.stopTour,
    resetAllGuides: ctx.resetAllGuides,
    isActive: ctx.isActive,
    currentStep: ctx.currentStep,
    currentStepIndex: ctx.currentStepIndex,
    totalSteps: ctx.totalSteps,
  };
}
