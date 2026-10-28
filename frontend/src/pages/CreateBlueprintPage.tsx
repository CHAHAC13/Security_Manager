import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BlueprintStepper } from '@/components/blueprint/BlueprintStepper';
import { BlueprintFooter } from '@/components/blueprint/BlueprintFooter';
import { BlueprintSetupForm } from '@/components/blueprint/BlueprintSetupForm';
import { BlueprintObjectsForm } from '@/components/blueprint/BlueprintObjectsForm';
import { BlueprintPermissionsForm, type PermissionsFormHandle } from '@/components/blueprint/BlueprintPermissionsForm';
import { BlueprintApproversForm } from '@/components/blueprint/BlueprintApproversForm';
import { Toast } from '@/components/ui/Toast';
import { permissionsService, PermissionsValidationError, type PermissionsService } from '@/services/permissionsService';
import { approverService as defaultApproverService, type ApproverService } from '@/services/approverService';
import { reconcilePermissions } from '@/lib/permissions';
import { reconcileApprovers } from '@/lib/approvers';
import { INITIAL_SETUP_DATA, INITIAL_OBJECTS_DATA, INITIAL_PERMISSIONS_DATA, INITIAL_APPROVERS_DATA } from '@/types/blueprint';
import type {
  BlueprintStep, BlueprintSetupData, BlueprintObjectsData, BlueprintPermissionsData, BlueprintApproversData,
} from '@/types/blueprint';

/** Step subtitle descriptions shown in the page header. */
const STEP_DESCRIPTIONS: Record<BlueprintStep, string> = {
  1: 'Define the top-level metadata and business justification.',
  2: 'Select the Databricks objects to include in this blueprint.',
  3: 'Configure roles and permissions for the objects selected in the previous step.',
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
export function CreateBlueprintPage({ service = permissionsService, approverService = defaultApproverService }: {
  service?: PermissionsService;
  approverService?: ApproverService;
}) {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<BlueprintStep>(1);

  // Step 1 form state
  const [setupData, setSetupData] = useState<BlueprintSetupData>(INITIAL_SETUP_DATA);

  // Step 2 form state
  const [objectsData, setObjectsData] = useState<BlueprintObjectsData>(INITIAL_OBJECTS_DATA);

  // Step 3 form state
  const [permissionsData, setPermissionsData] = useState<BlueprintPermissionsData>(INITIAL_PERMISSIONS_DATA);
  const permissionsRef = useRef<PermissionsFormHandle>(null);
  const actionInProgress = useRef(false);
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftFeedback, setDraftFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const handlePermissionsChange = useCallback((value: BlueprintPermissionsData) => {
    setPermissionsData(value);
    setDraftFeedback(null);
  }, []);

  // Step 4 form state
  const [approversData, setApproversData] = useState<BlueprintApproversData>(INITIAL_APPROVERS_DATA);
  const [approversReady, setApproversReady] = useState(false);
  // TODO(API): replace with the blueprint id issued by the backend on first draft save.
  const [draftBlueprintId] = useState(() => `draft-${crypto.randomUUID()}`);
  const handleApproversChange = useCallback((value: BlueprintApproversData) => {
    setApproversData(value);
    setDraftFeedback(null);
  }, []);

  // TODO: add state for step 5 as it is implemented

  const handleNext = useCallback(async () => {
    if (actionInProgress.current) return;
    if (currentStep === 4 && !approversReady) return;
    if (currentStep === 3) {
      if (!permissionsReady) return;
      actionInProgress.current = true;
      setWorking(true);
      try {
        if (!await permissionsRef.current?.validate()) return;
      } finally {
        actionInProgress.current = false;
        setWorking(false);
      }
    }
    if (currentStep < 5) {
      setCurrentStep((prev) => (prev + 1) as BlueprintStep);
    } else {
      // Final submit — will call backend once available
      console.log('Blueprint submitted:', { setupData, objectsData, permissionsData, approversData });
    }
  }, [currentStep, setupData, objectsData, permissionsData, approversData, permissionsReady, approversReady]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as BlueprintStep);
    }
  }, [currentStep]);

  const handleCancel = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleSaveDraft = useCallback(async () => {
    if (actionInProgress.current) return;
    actionInProgress.current = true;
    setSaving(true);
    setDraftFeedback(null);
    try {
      let permissions = permissionsData;
      // Steps 3+ already reconciled scope on entry to Permissions; re-running it would rebuild role identities.
      if (currentStep < 3) {
        const selected = await service.getSelectedObjects(objectsData);
        const discovered = await service.getExistingRolesForObjects(selected, setupData.environment);
        permissions = reconcilePermissions(permissionsData, selected, discovered, setupData.environment);
        setPermissionsData(permissions);
      }
      const approvers = reconcileApprovers(approversData, permissions.roleAssignments.map((role) => role.id));
      if (approvers !== approversData) setApproversData(approvers);
      await service.savePermissionsDraft({ setup: setupData, objects: objectsData, permissions, approvers });
      // Approvers draft is always allowed (no validation); skip the call when nothing was assigned yet.
      const saveApprovers = currentStep === 4 || Object.keys(approvers.approvers).length > 0;
      if (saveApprovers) await approverService.saveApproversDraft(draftBlueprintId, approvers.approvers);
      setDraftFeedback({
        error: false,
        message: saveApprovers
          ? 'Draft saved through the permissions and approver services (mock only; not persisted after leaving this wizard).'
          : 'Draft saved through the permissions service (mock only; not persisted after leaving this wizard).',
      });
    } catch (cause) {
      if (cause instanceof PermissionsValidationError) permissionsRef.current?.setServerErrors(cause.errors);
      setDraftFeedback({ error: true, message: cause instanceof Error ? cause.message : 'Unable to save draft. Try again.' });
    } finally {
      actionInProgress.current = false;
      setSaving(false);
    }
  }, [setupData, objectsData, permissionsData, approversData, service, approverService, draftBlueprintId, currentStep]);
  const dismissDraftFeedback = useCallback(() => setDraftFeedback(null), []);

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
      <fieldset disabled={saving || working} className="min-w-0">
        {currentStep === 1 && (
          <BlueprintSetupForm data={setupData} onChange={(value) => { setSetupData(value); setDraftFeedback(null); }} />
        )}

        {currentStep === 2 && (
          <BlueprintObjectsForm data={objectsData} onChange={(value) => { setObjectsData(value); setDraftFeedback(null); }} />
        )}

        {currentStep === 3 && (
          <BlueprintPermissionsForm
            data={permissionsData}
            objectsData={objectsData}
            environment={setupData.environment}
            onChange={handlePermissionsChange}
            ref={permissionsRef}
            onBack={handleBack}
            onReadyChange={setPermissionsReady}
            service={service}
          />
        )}

        {currentStep === 4 && (
          <BlueprintApproversForm
            roles={permissionsData.roleAssignments}
            objectsData={objectsData}
            data={approversData}
            onChange={handleApproversChange}
            blueprintId={draftBlueprintId}
            onBack={handleBack}
            onReadyChange={setApproversReady}
            service={approverService}
            permissions={service}
          />
        )}

        {currentStep === 5 && (
          <Placeholder label="Review & Submit" />
        )}
      </fieldset>

      {draftFeedback?.error && <p role="alert" className="text-sm text-rose-700">{draftFeedback.message}</p>}
      {draftFeedback && !draftFeedback.error && <Toast message={draftFeedback.message} onDismiss={dismissDraftFeedback} />}

      {/* Stepper progress bar */}
      <BlueprintStepper currentStep={currentStep} />

      {/* Footer actions */}
      <BlueprintFooter
        currentStep={currentStep}
        onBack={handleBack}
        onNext={handleNext}
        onCancel={handleCancel}
        onSaveDraft={handleSaveDraft}
        busy={saving || working}
        saving={saving}
        nextDisabled={(currentStep === 3 && !permissionsReady) || (currentStep === 4 && !approversReady)}
        nextLabel={currentStep === 4 ? 'Next: Review & Submit' : undefined}
        saveDisabled={currentStep === 3 && !permissionsReady}
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
