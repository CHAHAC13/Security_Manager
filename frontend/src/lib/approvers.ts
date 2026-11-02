import { ALLOW_SAME_PERSON_BOTH_TYPES, MAX_APPROVERS_PER_TYPE, TECHNICAL_OWNERS } from '@/config/approverConfig';
import type {
  Approver, ApproverType, BlueprintApproversData, PermissionObject, ResourceStatus, RoleApprovers, RoleApproversMap,
} from '@/types/blueprint';

export const APPROVER_TYPES: ApproverType[] = ['technical', 'business'];

export const APPROVER_TYPE_LABELS: Record<ApproverType, string> = {
  technical: 'Technical/System Owner',
  business: 'Domain/Business Owner',
};

export interface ApproverRules {
  maxPerType: number;
  allowSamePersonBothTypes: boolean;
}

export const DEFAULT_APPROVER_RULES: ApproverRules = {
  maxPerType: MAX_APPROVERS_PER_TYPE,
  allowSamePersonBothTypes: ALLOW_SAME_PERSON_BOTH_TYPES,
};

/** Minimal role view used by the approvers step (derived from Permissions role assignments). */
export interface ApproverRole {
  id: string;
  roleName: string;
  status: ResourceStatus;
  /** Human-readable catalog/schema scope, when known. */
  scope?: string;
}

export interface RoleApproverValidation {
  complete: boolean;
  errors: Partial<Record<ApproverType, string>>;
  warnings: string[];
}

export type RoleFilter = 'all' | 'missing' | 'new' | 'existing';

export function emptyRoleApprovers(): RoleApprovers {
  return { technical: [], business: [] };
}

export function approversFor(data: BlueprintApproversData, roleId: string): RoleApprovers {
  return data.approvers[roleId] ?? emptyRoleApprovers();
}

function dedupe(list: Approver[], type?: ApproverType) {
  const seen = new Set<string>();
  return list.filter((item) => {
    const key = type === 'technical' ? item.email.toLowerCase() : item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameIds(a: Approver[], b: Approver[]) {
  return a.length === b.length && a.every((item, index) => item.id === b[index].id);
}

export function validateRoleApprovers(entry: RoleApprovers, rules: ApproverRules = DEFAULT_APPROVER_RULES): RoleApproverValidation {
  const errors: RoleApproverValidation['errors'] = {};
  const warnings: string[] = [];
  for (const type of APPROVER_TYPES) {
    if (entry[type].length < 1) errors[type] = `At least one ${APPROVER_TYPE_LABELS[type]} is required`;
    else if (entry[type].length > rules.maxPerType) errors[type] = `No more than ${rules.maxPerType} ${APPROVER_TYPE_LABELS[type]}s are allowed`;
  }
  if (!errors.technical && entry.technical.some((person) => !isTechnicalOwner(person))) {
    errors.technical = 'Select only Jisun Yoon or Sreeram Koneru as Technical/System Owner';
  }
  const overlap = entry.technical.filter((person) => entry.business.some((other) =>
    other.id === person.id || other.email.toLowerCase() === person.email.toLowerCase()));
  if (overlap.length) {
    const names = overlap.map((person) => person.displayName).join(', ');
    const message = `${names} ${overlap.length > 1 ? 'are' : 'is'} assigned as both ${APPROVER_TYPE_LABELS.technical} and ${APPROVER_TYPE_LABELS.business}`;
    if (rules.allowSamePersonBothTypes) warnings.push(message);
    else errors.business ??= message;
  }
  return { complete: Object.keys(errors).length === 0, errors, warnings };
}

export function validateApprovers(
  roles: Pick<ApproverRole, 'id'>[], data: BlueprintApproversData, rules: ApproverRules = DEFAULT_APPROVER_RULES,
): Record<string, RoleApproverValidation> {
  return Object.fromEntries(roles.map((role) => [role.id, validateRoleApprovers(approversFor(data, role.id), rules)]));
}

export function isRoleComplete(entry: RoleApprovers | undefined, rules: ApproverRules = DEFAULT_APPROVER_RULES) {
  return validateRoleApprovers(entry ?? emptyRoleApprovers(), rules).complete;
}

export function incompleteRoles<T extends Pick<ApproverRole, 'id'>>(
  roles: T[], data: BlueprintApproversData, rules: ApproverRules = DEFAULT_APPROVER_RULES,
): T[] {
  return roles.filter((role) => !isRoleComplete(data.approvers[role.id], rules));
}

/** Next is allowed only when there is at least one role and every role is complete. */
export function isApproversComplete(
  roles: Pick<ApproverRole, 'id'>[], data: BlueprintApproversData, rules: ApproverRules = DEFAULT_APPROVER_RULES,
) {
  return roles.length > 0 && incompleteRoles(roles, data, rules).length === 0;
}

export type AddApproverResult =
  | { added: true; entry: RoleApprovers }
  | { added: false; entry: RoleApprovers; reason: 'duplicate' | 'max' | 'invalid-technical-owner' };

function isTechnicalOwner(approver: Approver) {
  return TECHNICAL_OWNERS.some((owner) => owner.email.toLowerCase() === approver.email.toLowerCase());
}

export function addApprover(
  entry: RoleApprovers, type: ApproverType, approver: Approver, rules: ApproverRules = DEFAULT_APPROVER_RULES,
): AddApproverResult {
  if (type === 'technical' && !isTechnicalOwner(approver)) return { added: false, entry, reason: 'invalid-technical-owner' };
  if (entry[type].some((item) => item.id === approver.id
    || (type === 'technical' && item.email.toLowerCase() === approver.email.toLowerCase()))) return { added: false, entry, reason: 'duplicate' };
  if (entry[type].length >= rules.maxPerType) return { added: false, entry, reason: 'max' };
  return { added: true, entry: { ...entry, [type]: [...entry[type], approver] } };
}

export function removeApprover(entry: RoleApprovers, type: ApproverType, approverId: string): RoleApprovers {
  return { ...entry, [type]: entry[type].filter((item) => item.id !== approverId) };
}

export function setRoleApprovers(data: BlueprintApproversData, roleId: string, entry: RoleApprovers): BlueprintApproversData {
  return { ...data, approvers: { ...data.approvers, [roleId]: entry } };
}

export interface ApplyToAllOptions {
  technical: Approver[];
  business: Approver[];
  mode: 'add' | 'replace';
  /** Only fill approver types that are currently empty on a role. */
  onlyMissing: boolean;
}

function nextList(current: Approver[], incoming: Approver[], options: ApplyToAllOptions, rules: ApproverRules, type: ApproverType) {
  if (!incoming.length || (options.onlyMissing && current.length > 0)) return current;
  const merged = options.mode === 'replace' ? dedupe(incoming, type) : dedupe([...current, ...incoming], type);
  // Keep existing approvers even if they exceed the limit; only cap what is newly added.
  return merged.slice(0, Math.max(rules.maxPerType, options.mode === 'add' ? current.length : 0));
}

export function applyToAll(
  data: BlueprintApproversData, roleIds: string[], options: ApplyToAllOptions, rules: ApproverRules = DEFAULT_APPROVER_RULES,
): { data: BlueprintApproversData; updatedRoleIds: string[] } {
  if (options.technical.some((person) => !isTechnicalOwner(person))) {
    throw new Error('Select only Jisun Yoon or Sreeram Koneru as Technical/System Owner');
  }
  const approvers: RoleApproversMap = { ...data.approvers };
  const updatedRoleIds: string[] = [];
  for (const roleId of roleIds) {
    const current = approversFor(data, roleId);
    const next: RoleApprovers = {
      technical: nextList(current.technical, options.technical, options, rules, 'technical'),
      business: nextList(current.business, options.business, options, rules, 'business'),
    };
    if (!sameIds(current.technical, next.technical) || !sameIds(current.business, next.business)) {
      approvers[roleId] = next;
      updatedRoleIds.push(roleId);
    }
  }
  return { data: { ...data, approvers }, updatedRoleIds };
}

/** Roles that would lose at least one existing approver if the options were applied (used to confirm). */
export function rolesLosingApprovers(
  data: BlueprintApproversData, roleIds: string[], options: ApplyToAllOptions, rules: ApproverRules = DEFAULT_APPROVER_RULES,
): string[] {
  const { data: next } = applyToAll(data, roleIds, options, rules);
  return roleIds.filter((roleId) => {
    const before = approversFor(data, roleId);
    const after = approversFor(next, roleId);
    return APPROVER_TYPES.some((type) => before[type].some((person) => !after[type].some((item) => item.id === person.id)));
  });
}

/** Drops removed roles and obsolete technical owners. Returns the same object when unchanged. */
export function reconcileApprovers(data: BlueprintApproversData, roleIds: string[]): BlueprintApproversData {
  const keep = new Set(roleIds);
  const staleApprovers = Object.keys(data.approvers).some((id) => !keep.has(id));
  const stalePrefill = data.prefilledRoleIds.some((id) => !keep.has(id));
  const obsoleteTechnical = Object.values(data.approvers).some((entry) => entry.technical.some((person) => !isTechnicalOwner(person)));
  if (!staleApprovers && !stalePrefill && !obsoleteTechnical) return data;
  return {
    approvers: Object.fromEntries(Object.entries(data.approvers).filter(([id]) => keep.has(id)).map(([id, entry]) => [
      id, { ...entry, technical: entry.technical.filter(isTechnicalOwner) },
    ])),
    prefilledRoleIds: data.prefilledRoleIds.filter((id) => keep.has(id)),
  };
}

/** Merges fetched approvers, keeping valid user selections and excluding obsolete technical owners. */
export function mergePrefilledApprovers(
  data: BlueprintApproversData, fetched: RoleApproversMap, requestedRoleIds: string[],
): BlueprintApproversData {
  const approvers = { ...data.approvers };
  for (const roleId of requestedRoleIds) {
    const current = approversFor(data, roleId);
    const incoming = fetched[roleId];
    if (!incoming) continue;
    const technical = current.technical.filter(isTechnicalOwner);
    approvers[roleId] = {
      technical: technical.length ? technical : dedupe((incoming.technical ?? []).filter(isTechnicalOwner), 'technical'),
      business: current.business.length ? current.business : dedupe(incoming.business ?? []),
    };
  }
  return { approvers, prefilledRoleIds: [...new Set([...data.prefilledRoleIds, ...requestedRoleIds])] };
}

/** DOM id of a role's row in the approver table (used for click-to-scroll). */
export function approverRowId(roleId: string) {
  return `approver-row-${roleId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/** Builds a `catalog.schema[.object]` scope label by walking the selected object hierarchy. */
export function describeRoleScope(scopeObjectId: string, objects: PermissionObject[]): string | undefined {
  const names: string[] = [];
  const visited = new Set<string>();
  let current = objects.find((object) => object.objectId === scopeObjectId);
  while (current && !visited.has(current.objectId)) {
    visited.add(current.objectId);
    names.unshift(current.objectName);
    const parentId: string | null = current.parentId;
    current = parentId ? objects.find((object) => object.objectId === parentId) : undefined;
  }
  return names.length ? names.join('.') : undefined;
}

export function filterApproverRoles<T extends ApproverRole>(
  roles: T[], data: BlueprintApproversData, query: string, filter: RoleFilter, rules: ApproverRules = DEFAULT_APPROVER_RULES,
): T[] {
  const needle = query.trim().toLowerCase();
  return roles.filter((role) => {
    if (needle && !role.roleName.toLowerCase().includes(needle)) return false;
    if (filter === 'new') return role.status === 'NEW';
    if (filter === 'existing') return role.status === 'EXISTING';
    if (filter === 'missing') return !isRoleComplete(data.approvers[role.id], rules);
    return true;
  });
}
