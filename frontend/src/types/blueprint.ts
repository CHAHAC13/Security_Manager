/** Step identifiers for the 5-step blueprint wizard. */
export type BlueprintStep = 1 | 2 | 3 | 4 | 5;

export interface BlueprintStepMeta {
  step: BlueprintStep;
  label: string;
}

export const BLUEPRINT_STEPS: BlueprintStepMeta[] = [
  { step: 1, label: 'Setup' },
  { step: 2, label: 'Objects' },
  { step: 3, label: 'Permissions' },
  { step: 4, label: 'Approvers' },
  { step: 5, label: 'Review' },
];

/** Form data for Step 1: Blueprint Setup. */
export interface BlueprintSetupData {
  name: string;
  version: string;
  description: string;
  businessJustification: string;
}

/**
 * Top-level blueprint form data across all steps.
 * Extend this as new steps are implemented.
 */
export interface BlueprintFormData {
  setup: BlueprintSetupData;
  // objects: BlueprintObjectsData;
  // permissions: BlueprintPermissionsData;
  // approvers: BlueprintApproversData;
}

export const INITIAL_SETUP_DATA: BlueprintSetupData = {
  name: '',
  version: 'v1.0',
  description: '',
  businessJustification: '',
};
