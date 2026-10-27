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
  busy?: boolean;
  saving?: boolean;
  nextDisabled?: boolean;
  saveDisabled?: boolean;
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
  busy = false,
  saving = false,
  nextDisabled = false,
  saveDisabled = false,
}: BlueprintFooterProps) {
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === BLUEPRINT_STEPS.length;

  return (
    <div className="flex items-center justify-between pt-4 border-t border-slate-200">
      <div>
        <Button
          variant="secondary"
          icon={<ArrowLeft className="w-3.5 h-3.5" />}
          disabled={isFirstStep || busy}
          onClick={onBack}
          className={isFirstStep ? 'opacity-50 cursor-not-allowed' : ''}
        >
          Back
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={onSaveDraft} disabled={busy || saveDisabled}>
          {saving ? 'Saving...' : 'Save Draft'}
        </Button>
        <Button variant="primary" onClick={onNext} disabled={busy || nextDisabled}>
          <span>{isLastStep ? 'Submit' : 'Next'}</span>
          {!isLastStep && <ArrowRight className="w-3.5 h-3.5 ml-1.5" />}
        </Button>
      </div>
    </div>
  );
}
