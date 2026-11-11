import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BlueprintStepper } from '@/components/blueprint/BlueprintStepper';
import { BlueprintFooter } from '@/components/blueprint/BlueprintFooter';
import { BlueprintSetupForm } from '@/components/blueprint/BlueprintSetupForm';
import { BlueprintObjectsForm } from '@/components/blueprint/BlueprintObjectsForm';
import { BlueprintPermissionsForm, type PermissionsFormHandle } from '@/components/blueprint/BlueprintPermissionsForm';
import { BlueprintApproversForm } from '@/components/blueprint/BlueprintApproversForm';
import { BlueprintDeploymentForm, type DeploymentFormHandle } from '@/components/blueprint/BlueprintDeploymentForm';
import { BlueprintReview } from '@/components/blueprint/BlueprintReview';
import { Toast } from '@/components/ui/Toast';
import { permissionsService, PermissionsValidationError, type PermissionsService } from '@/services/permissionsService';
import { approverService as defaultApproverService, type ApproverService } from '@/services/approverService';
import { reconcilePermissions, rolesRequiringApproval } from '@/lib/permissions';
import { reconcileApprovers } from '@/lib/approvers';
import { createDeploymentData } from '@/lib/deployment';
import { getBlueprintReviewIssues } from '@/lib/blueprintReview';
import { BLUEPRINT_STEPS, INITIAL_SETUP_DATA, INITIAL_OBJECTS_DATA, INITIAL_PERMISSIONS_DATA, INITIAL_APPROVERS_DATA } from '@/types/blueprint';
import type {
  BlueprintStep, BlueprintSetupData, BlueprintObjectsData, BlueprintPermissionsData, BlueprintApproversData, BlueprintDeploymentData, BlueprintFormData,
} from '@/types/blueprint';

/** Step subtitle descriptions shown in the page header. */
const STEP_DESCRIPTIONS: Record<BlueprintStep, string> = {
  1: 'Define the top-level metadata and business justification.',
  2: 'Select the Databricks objects to include in this blueprint.',
  3: 'Configure roles and permissions for the objects selected in the previous step.',
  4: 'Assign technical and business approvers.',
  5: 'Set the deployment schedule for Dev, Stg and Prd environments.',
  6: 'Review the complete blueprint before submission.',
};

const STEP_LABELS: Record<BlueprintStep, string> = {
  1: 'Setup',
  2: 'Objects',
  3: 'Permissions',
  4: 'Approvers',
  5: 'Deployment',
  6: 'Review & Submit',
};

/**
 * Create Blueprint wizard page.
 * Orchestrates Setup → Objects → Permissions → Approvers → Deployment → Review & Submit.
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
  const [checkingObjects, setCheckingObjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingSubmission, setConfirmingSubmission] = useState(false);
  const [draftFeedback, setDraftFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const handlePermissionsChange = useCallback((value: BlueprintPermissionsData) => {
    setPermissionsData(value);
    setDraftFeedback(null);
  }, []);

  // Step 4 form state
  const [approversData, setApproversData] = useState<BlueprintApproversData>(INITIAL_APPROVERS_DATA);
  const approversNeedClearing = useRef(false);
  const [approversReady, setApproversReady] = useState(false);
  // TODO(API): replace with the blueprint id issued by the backend on first draft save.
  const [draftBlueprintId] = useState(() => `draft-${crypto.randomUUID()}`);
  const handleApproversChange = useCallback((value: BlueprintApproversData) => {
    setApproversData(value);
    setDraftFeedback(null);
  }, []);

  const handleObjectsChange = useCallback((value: BlueprintObjectsData) => {
    const catalogChanged = objectsData.selectedCatalogId !== value.selectedCatalogId;
    const removedCatalogs = objectsData.proposedCatalogs.filter((catalog) => !value.proposedCatalogs.some((item) => item.id === catalog.id));
    const removedSchemas = objectsData.proposedSchemas.filter((schema) => !value.proposedSchemas.some((item) => item.id === schema.id));
    const removedObjects = objectsData.proposedObjects.filter((object) => !value.proposedObjects.some((item) => item.id === object.id));
    const removedIds = new Set([
      ...removedCatalogs.map((catalog) => JSON.stringify(['catalog', catalog.id])),
      ...removedSchemas.map((schema) => JSON.stringify(['schema', schema.catalogId, schema.id])),
      ...removedObjects.map((object) => JSON.stringify(['object', object.catalogId, object.schemaId, object.id])),
    ]);
    if (catalogChanged && objectsData.selectedCatalogId) {
      setPermissionsData(INITIAL_PERMISSIONS_DATA);
      if (Object.keys(approversData.approvers).length) approversNeedClearing.current = true;
      setApproversData(reconcileApprovers(approversData, []));
    } else if (removedIds.size) {
      const roles = permissionsData.roleAssignments.filter((role) => !removedIds.has(role.scopeObjectId));
      setPermissionsData({
        ...permissionsData,
        roleAssignments: roles,
        initializedCatalogIds: permissionsData.initializedCatalogIds?.filter((id) => !removedIds.has(id)),
      });
      const approvers = reconcileApprovers(approversData, rolesRequiringApproval(roles).map((role) => role.id));
      if (Object.keys(approvers.approvers).length < Object.keys(approversData.approvers).length) approversNeedClearing.current = true;
      setApproversData(approvers);
    }
    setObjectsData(value);
    setDraftFeedback(null);
  }, [objectsData, permissionsData, approversData]);
  const confirmCatalogChange = useCallback(() => !objectsData.selectedCatalogId
    || (!permissionsData.roleAssignments.length && !Object.keys(approversData.approvers).length)
    || window.confirm('Changing the catalog will remove its role assignments, permissions, and approvers from this blueprint. Continue?'),
  [objectsData.selectedCatalogId, permissionsData.roleAssignments.length, approversData.approvers]);

  const [deploymentData, setDeploymentData] = useState<BlueprintDeploymentData>(createDeploymentData);
  const deploymentRef = useRef<DeploymentFormHandle>(null);
  const handleDeploymentChange = useCallback((value: BlueprintDeploymentData) => {
    setDeploymentData(value);
    setDraftFeedback(null);
  }, []);

  const handleNext = useCallback(async () => {
    if (actionInProgress.current) return;
    if (currentStep === 4 && !approversReady) return;
    if (currentStep === 5 && !deploymentRef.current?.validate()) return;
    if (currentStep === 6) {
      if (getBlueprintReviewIssues({
        setup: setupData, objects: objectsData, permissions: permissionsData,
        approvers: approversData, deployment: deploymentData,
      }).length) return;
      setConfirmingSubmission(true);
      return;
    }
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
    if (currentStep < BLUEPRINT_STEPS.length) setCurrentStep((prev) => (prev + 1) as BlueprintStep);
  }, [currentStep, setupData, objectsData, permissionsData, approversData, deploymentData, permissionsReady, approversReady]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as BlueprintStep);
    }
  }, [currentStep]);

  const handleCancel = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleSubmitForApproval = useCallback(async () => {
    if (actionInProgress.current || currentStep !== 6) return;
    const blueprint: BlueprintFormData = {
      setup: setupData, objects: objectsData, permissions: permissionsData,
      approvers: approversData, deployment: deploymentData,
    };
    if (getBlueprintReviewIssues(blueprint).length) return;
    actionInProgress.current = true;
    setWorking(true);
    setConfirmingSubmission(false);
    setDraftFeedback(null);
    try {
      // Mock boundary for the future submission API; no approval service is available yet.
      await Promise.resolve(blueprint);
      navigate('/', {
        state: {
          submissionNotice: 'Blueprint submitted successfully.',
          blueprintStatus: 'Pending Approval',
        },
      });
    } catch (cause) {
      setConfirmingSubmission(false);
      setDraftFeedback({ error: true, message: cause instanceof Error ? cause.message : 'Unable to submit blueprint. Try again.' });
    } finally {
      actionInProgress.current = false;
      setWorking(false);
    }
  }, [currentStep, setupData, objectsData, permissionsData, approversData, deploymentData, navigate]);

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
      const approvers = reconcileApprovers(approversData, rolesRequiringApproval(permissions.roleAssignments).map((role) => role.id));
      if (approvers !== approversData) setApproversData(approvers);
      await service.savePermissionsDraft({ setup: setupData, objects: objectsData, permissions, approvers, deployment: deploymentData });
      // Also clear previously assigned owners when all permission changes have been reverted.
      const saveApprovers = currentStep >= 4 || Object.keys(approvers.approvers).length > 0
        || Object.keys(approversData.approvers).length > 0 || approversNeedClearing.current;
      if (saveApprovers) {
        await approverService.saveApproversDraft(draftBlueprintId, approvers.approvers);
        approversNeedClearing.current = false;
      }
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
  }, [setupData, objectsData, permissionsData, approversData, deploymentData, service, approverService, draftBlueprintId, currentStep]);
  const dismissDraftFeedback = useCallback(() => setDraftFeedback(null), []);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            {currentStep === 5 ? 'Deployment Strategy' : currentStep === 6 ? 'Review & Submit Blueprint' : 'Create Security Blueprint'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {currentStep === 6
              ? `Step 6 of ${BLUEPRINT_STEPS.length} — Review. Review all blueprint configuration details before submitting for approval.`
              : `Step ${currentStep} of ${BLUEPRINT_STEPS.length}${currentStep === 5 ? ': ' : ' — '}${STEP_LABELS[currentStep]}. ${STEP_DESCRIPTIONS[currentStep]}`}
          </p>
        </div>
      </div>

      {/* Step content */}
      <fieldset disabled={saving || working} className="min-w-0">
        {currentStep === 1 && (
          <BlueprintSetupForm data={setupData} onChange={(value) => { setSetupData(value); setDraftFeedback(null); }} />
        )}

        {currentStep === 2 && (
          <BlueprintObjectsForm data={objectsData} onChange={handleObjectsChange} onCheckingChange={setCheckingObjects}
            onBeforeCatalogChange={confirmCatalogChange} />
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
          <BlueprintDeploymentForm ref={deploymentRef} data={deploymentData} onChange={handleDeploymentChange} />
        )}

        {currentStep === 6 && (
          <BlueprintReview
            data={{ setup: setupData, objects: objectsData, permissions: permissionsData, approvers: approversData, deployment: deploymentData }}
            confirmingSubmission={confirmingSubmission}
            submitting={working}
            onEdit={setCurrentStep}
            onCancelSubmit={() => setConfirmingSubmission(false)}
            onSubmit={handleSubmitForApproval}
          />
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
        busy={saving || working || checkingObjects}
        saving={saving}
        nextDisabled={(currentStep === 3 && !permissionsReady) || (currentStep === 4 && !approversReady)
          || (currentStep === 6 && getBlueprintReviewIssues({
            setup: setupData, objects: objectsData, permissions: permissionsData,
            approvers: approversData, deployment: deploymentData,
          }).length > 0)}
        nextLabel={currentStep === 4 ? 'Next: Deployment' : currentStep === 6 ? 'Submit for Approval' : undefined}
        saveDisabled={currentStep === 3 && !permissionsReady}
      />
    </div>
  );
}
