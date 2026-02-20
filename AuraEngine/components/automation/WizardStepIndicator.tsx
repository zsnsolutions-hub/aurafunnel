import React from 'react';
import { CheckIcon } from '../Icons';
import { WIZARD_STEPS } from './constants';
import type { WizardStep, TriggerType } from './types';

interface WizardStepIndicatorProps {
  currentStep: WizardStep;
  onStepClick: (step: WizardStep) => void;
  wizardTrigger: TriggerType | null;
}

export const WizardStepIndicator: React.FC<WizardStepIndicatorProps> = ({
  currentStep,
  onStepClick,
  wizardTrigger,
}) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-8 py-5">
    <div className="flex items-center justify-between">
      {WIZARD_STEPS.map((ws, i) => (
        <React.Fragment key={ws.step}>
          <button
            onClick={() => {
              if (ws.step === 1 || (ws.step === 2 && wizardTrigger) || (ws.step <= currentStep)) {
                onStepClick(ws.step);
              }
            }}
            className={`flex items-center space-x-3 group ${ws.step <= currentStep ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black transition-all ${
              currentStep === ws.step
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                : currentStep > ws.step
                  ? 'bg-emerald-100 text-emerald-600'
                  : 'bg-slate-100 text-slate-400'
            }`}>
              {currentStep > ws.step ? <CheckIcon className="w-5 h-5" /> : ws.step}
            </div>
            <div className="text-left">
              <p className={`text-sm font-bold ${currentStep >= ws.step ? 'text-slate-800' : 'text-slate-400'}`}>
                {ws.label}
              </p>
              <p className="text-[10px] text-slate-400 font-medium">{ws.description}</p>
            </div>
          </button>
          {i < WIZARD_STEPS.length - 1 && (
            <div className={`flex-1 h-0.5 mx-4 rounded-full transition-all ${
              currentStep > ws.step ? 'bg-emerald-300' : 'bg-slate-100'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  </div>
);
