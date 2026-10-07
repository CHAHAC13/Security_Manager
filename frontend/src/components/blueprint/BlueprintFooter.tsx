import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { BLUEPRINT_STEPS } from '@/types/blueprint';
import type { BlueprintStep } from '@/types/blueprint';

interface BlueprintFooterProps {
  currentStep: BlueprintStep;
  onBack: () => void;
  onNext: () => void;
  onCancel: () => void;
  onSaveDraft: () => void;
}

/**
 * Persistent footer navigation shared across all 5 blueprint wizard steps.
 * Renders Back (disabled on step 1), Cancel, Save Draft, and Next/Submit buttons.
 */
export function BlueprintFooter({
  currentStep,
  onBack,
  onNext,
  onCancel,
  onSaveDraft,
}: BlueprintFooterProps) {
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === BLUEPRINT_STEPS.length;

  return (
    <div className="flex items-center justify-between pt-4 border-t border-slate-200">
      <div>
        <Button
          variant="secondary"
          icon={<ArrowLeft className="w-3.5 h-3.5" />}
          disabled={isFirstStep}
          onClick={onBack}
          className={isFirstStep ? 'opacity-50 cursor-not-allowed' : ''}
        >
          Back
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={onSaveDraft}>
          Save Draft
        </Button>
        <Button variant="primary" onClick={onNext}>
          <span>{isLastStep ? 'Submit' : 'Next'}</span>
          {!isLastStep && <ArrowRight className="w-3.5 h-3.5 ml-1.5" />}
        </Button>
      </div>
    </div>
  );
}
