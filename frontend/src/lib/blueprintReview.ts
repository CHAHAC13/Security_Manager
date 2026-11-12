import { APPROVER_TYPE_LABELS, DEFAULT_APPROVER_RULES, validateRoleApprovers } from '@/lib/approvers';
import { DEPLOYMENT_ENVIRONMENTS, validateDeployment } from '@/lib/deployment';
import { rolesRequiringApproval } from '@/lib/permissions';
import type { BlueprintFormData, BlueprintStep, SchemaOption } from '@/types/blueprint';

export interface ReviewIssue {
  step: BlueprintStep;
  message: string;
}

export function getBlueprintReviewIssues(data: BlueprintFormData): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const { setup, objects, permissions, approvers, deployment } = data;

  if (!setup.name.trim()) issues.push({ step: 1, message: 'Blueprint name is required.' });
  if (!setup.version.trim()) issues.push({ step: 1, message: 'Blueprint version is required.' });
  if (!setup.description.trim()) issues.push({ step: 1, message: 'Blueprint description is required.' });
  if (!setup.businessJustification.trim()) issues.push({ step: 1, message: 'Business justification is required.' });

  const proposedCatalog = objects.proposedCatalogs.find((catalog) => catalog.id === objects.selectedCatalogId);
  if (!objects.selectedCatalogId || (!proposedCatalog && objects.selectedCatalog?.id !== objects.selectedCatalogId)) {
    issues.push({ step: 2, message: 'Select a catalog for the object scope.' });
  }
  const selectedSchemaIds = new Set(objects.selectedSchemaIds);
  const selectedSchemas = new Map<string, SchemaOption>();
  for (const schema of objects.selectedSchemas ?? []) {
    if (selectedSchemaIds.has(schema.id)) selectedSchemas.set(JSON.stringify([schema.catalogId, schema.id]), schema);
  }
  for (const schema of objects.proposedSchemas) {
    if (selectedSchemaIds.has(schema.id)) selectedSchemas.set(JSON.stringify([schema.catalogId, schema.id]), schema);
  }
  if (!selectedSchemaIds.size) issues.push({ step: 2, message: 'Select at least one schema for the object scope.' });
  if ([...selectedSchemaIds].some((id) => ![...selectedSchemas.values()].some((schema) => schema.id === id))) {
    issues.push({ step: 2, message: 'One or more selected schemas are missing details.' });
  }
  if (objects.selectedObjectIds.some((id) => !objects.selectedObjects.some((object) =>
    object.id === id && [...selectedSchemas.values()].some((schema) =>
      schema.id === object.schemaId && (!object.catalogId || object.catalogId === schema.catalogId))))) {
    issues.push({ step: 2, message: 'One or more selected objects are missing details or outside the selected schemas.' });
  }

  const roles = permissions.roleAssignments;
  if (!roles.length) issues.push({ step: 3, message: 'Create at least one role assignment.' });
  const seenRoleNames = new Set<string>();
  for (const role of roles) {
    const roleLabel = role.roleName.trim() || 'Untitled role';
    const normalizedName = role.roleName.trim().toLowerCase();
    if (!normalizedName) issues.push({ step: 3, message: `Role name is required for ${roleLabel}.` });
    else if (seenRoleNames.has(normalizedName)) issues.push({ step: 3, message: `Role name must be unique: ${roleLabel}.` });
    seenRoleNames.add(normalizedName);
    if (role.status === 'NEW' && !role.roleTypeCode.trim()) {
      issues.push({ step: 3, message: `Role type is required for ${roleLabel}.` });
    }
    if (role.status === 'NEW' && !role.objectPermissions.some((permission) => permission.permissions.length > 0)) {
      issues.push({ step: 3, message: `No privileges configured for ${roleLabel}.` });
    }
    if (role.requestManager.enabled && (!role.requestManager.formType.trim() || !role.requestManager.displayName.trim())) {
      issues.push({ step: 3, message: `Complete the Request Manager configuration for ${roleLabel}.` });
    }
  }

  for (const role of rolesRequiringApproval(roles)) {
    const entry = approvers.approvers[role.id] ?? { technical: [], business: [] };
    // The selected technical owners were validated against the directory in Step 4.
    const validation = validateRoleApprovers(entry, {
      ...DEFAULT_APPROVER_RULES,
      technicalOwners: entry.technical,
    });
    for (const type of ['technical', 'business'] as const) {
      if (validation.errors[type]) {
        issues.push({
          step: 4,
          message: `${APPROVER_TYPE_LABELS[type]} missing or invalid for role: ${role.roleName || 'Untitled role'}.`,
        });
      }
    }
  }

  const deploymentErrors = validateDeployment(deployment);
  for (const { key, label } of DEPLOYMENT_ENVIRONMENTS) {
    const error = deploymentErrors[key];
    if (error) {
      issues.push({
        step: 5,
        message: `${label}: ${error.strategy ?? error.scheduledDateTime ?? 'Deployment configuration is incomplete.'}`,
      });
    }
  }

  return issues;
}
