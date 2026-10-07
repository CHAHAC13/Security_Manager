import { Fragment } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BLUEPRINT_STEPS } from '@/types/blueprint';
import type { BlueprintStep } from '@/types/blueprint';

interface BlueprintStepperProps {
  currentStep: BlueprintStep;
  onStepClick?: (step: BlueprintStep) => void;
}

/**
 * Horizontal stepper bar shared across all 5 blueprint wizard steps.
 * Highlights the active step, marks completed steps with a check icon,
 * and dims future steps.
 */
export function BlueprintStepper({ currentStep, onStepClick }: BlueprintStepperProps) {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between overflow-x-auto pb-1 gap-2">
        {BLUEPRINT_STEPS.map((s, idx) => {
          const isActive = s.step === currentStep;
          const isCompleted = s.step < currentStep;

          return (
            <Fragment key={s.step}>
              {/* Step pill */}
              <button
                type="button"
                onClick={() => onStepClick?.(s.step)}
                disabled={!onStepClick}
                className={cn(
                  'flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg shrink-0 transition-all',
                  isActive && 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/20',
                  isCompleted && 'text-emerald-700 cursor-pointer',
                  !isActive && !isCompleted && 'text-slate-400 opacity-75',
                  !onStepClick && 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold leading-none',
                    isActive && 'bg-white text-slate-900 shadow-sm',
                    isCompleted && 'bg-emerald-100 text-emerald-700 border border-emerald-200',
                    !isActive && !isCompleted && 'bg-slate-100 border border-slate-200 text-slate-400',
                  )}
                >
                  {isCompleted ? <Check className="w-3 h-3" /> : s.step}
                </span>
                <span
                  className={cn(
                    'text-sm',
                    isActive ? 'font-semibold' : 'font-medium',
                  )}
                >
                  {s.label}
                </span>
              </button>

              {/* Connector line between steps */}
              {idx < BLUEPRINT_STEPS.length - 1 && (
                <div
                  className={cn(
                    'h-px flex-1 min-w-[20px]',
                    s.step < currentStep ? 'bg-emerald-300' : 'bg-slate-200',
                  )}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
