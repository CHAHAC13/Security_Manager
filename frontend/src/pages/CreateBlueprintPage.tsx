import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BlueprintStepper } from '@/components/blueprint/BlueprintStepper';
import { BlueprintFooter } from '@/components/blueprint/BlueprintFooter';
import { BlueprintSetupForm } from '@/components/blueprint/BlueprintSetupForm';
import { INITIAL_SETUP_DATA } from '@/types/blueprint';
import type { BlueprintStep, BlueprintSetupData } from '@/types/blueprint';

/** Step subtitle descriptions shown in the page header. */
const STEP_DESCRIPTIONS: Record<BlueprintStep, string> = {
  1: 'Define the top-level metadata and business justification.',
  2: 'Select the Databricks objects to include in this blueprint.',
  3: 'Configure role-based permissions for each object.',
  4: 'Assign technical and business approvers.',
  5: 'Review the complete blueprint before submission.',
};

const STEP_LABELS: Record<BlueprintStep, string> = {
  1: 'Setup',
  2: 'Objects',
  3: 'Permissions',
  4: 'Approvers',
  5: 'Review',
};

/**
 * Create Blueprint wizard page.
 * Orchestrates the 5-step flow: Setup → Objects → Permissions → Approvers → Review.
 * The stepper and footer are shared across all steps; only the center content swaps.
 */
export function CreateBlueprintPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<BlueprintStep>(1);

  // Step 1 form state
  const [setupData, setSetupData] = useState<BlueprintSetupData>(INITIAL_SETUP_DATA);

  // TODO: add state for steps 2–5 as they are implemented

  const handleNext = useCallback(() => {
    if (currentStep < 5) {
      setCurrentStep((prev) => (prev + 1) as BlueprintStep);
    } else {
      // Final submit — will call backend once available
      console.log('Blueprint submitted:', { setupData });
    }
  }, [currentStep, setupData]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as BlueprintStep);
    }
  }, [currentStep]);

  const handleCancel = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleSaveDraft = useCallback(() => {
    // TODO: persist draft to backend
    console.log('Draft saved:', { setupData });
  }, [setupData]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Create Security Blueprint
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Step {currentStep} of 5 &mdash; {STEP_LABELS[currentStep]}.{' '}
            {STEP_DESCRIPTIONS[currentStep]}
          </p>
        </div>
      </div>

      {/* Step content */}
      <div>
        {currentStep === 1 && (
          <BlueprintSetupForm data={setupData} onChange={setSetupData} />
        )}

        {currentStep === 2 && (
          <Placeholder label="Object Wizard" />
        )}

        {currentStep === 3 && (
          <Placeholder label="Permissions" />
        )}

        {currentStep === 4 && (
          <Placeholder label="Approvers" />
        )}

        {currentStep === 5 && (
          <Placeholder label="Review & Submit" />
        )}
      </div>

      {/* Stepper progress bar */}
      <BlueprintStepper currentStep={currentStep} />

      {/* Footer actions */}
      <BlueprintFooter
        currentStep={currentStep}
        onBack={handleBack}
        onNext={handleNext}
        onCancel={handleCancel}
        onSaveDraft={handleSaveDraft}
      />
    </div>
  );
}

/** Temporary placeholder for steps that are not yet implemented. */
function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-48 bg-white rounded-xl border border-dashed border-slate-300">
      <p className="text-sm text-slate-400">{label} — coming soon</p>
    </div>
  );
}
