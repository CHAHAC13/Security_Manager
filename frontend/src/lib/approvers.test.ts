import { describe, expect, it } from 'vitest';
import {
  addApprover, applyToAll, describeRoleScope, filterApproverRoles, incompleteRoles, isApproversComplete,
  isRoleComplete, mergePrefilledApprovers, reconcileApprovers, rolesLosingApprovers, validateRoleApprovers,
  type ApplyToAllOptions, type ApproverRole, type ApproverRules,
} from './approvers';
import { objects } from '@/test/permissionFixtures';
import type { Approver, BlueprintApproversData } from '@/types/blueprint';

const person = (id: string): Approver => ({ id, displayName: `User ${id}`, email: `${id}@example.com` });
const a = person('a');
const b = person('b');
const c = person('c');
const rules: ApproverRules = { maxPerType: 2, allowSamePersonBothTypes: true };
const roles: ApproverRole[] = [
  { id: 'r1', roleName: 'dbx-dev-gpd-user-odx', status: 'EXISTING' },
  { id: 'r2', roleName: 'dbx-dev-gpd-user-odx-cdm', status: 'EXISTING' },
  { id: 'r3', roleName: 'dbx-prd-gpd-user-veevaquality', status: 'NEW' },
];
const data = (approvers: BlueprintApproversData['approvers'] = {}): BlueprintApproversData => ({ approvers, prefilledRoleIds: [] });
const options = (overrides: Partial<ApplyToAllOptions>): ApplyToAllOptions => ({
  technical: [], business: [], mode: 'add', onlyMissing: false, ...overrides,
});

describe('approver validation', () => {
  it('requires at least one technical and one business approver', () => {
    expect(validateRoleApprovers({ technical: [], business: [] }, rules)).toEqual({
      complete: false, warnings: [],
      errors: {
        technical: 'At least one Technical/System Owner is required',
        business: 'At least one Domain/Business Owner is required',
      },
    });
    expect(isRoleComplete({ technical: [a], business: [] }, rules)).toBe(false);
    expect(isRoleComplete({ technical: [], business: [b] }, rules)).toBe(false);
    expect(isRoleComplete({ technical: [a], business: [b] }, rules)).toBe(true);
    expect(isRoleComplete(undefined, rules)).toBe(false);
  });

  it('flags more approvers than the configured maximum', () => {
    const result = validateRoleApprovers({ technical: [a, b, c], business: [a] }, rules);
    expect(result.complete).toBe(false);
    expect(result.errors.technical).toBe('No more than 2 Technical/System Owners are allowed');
  });

  it('warns (but stays complete) when the same person is in both columns, or errors when disallowed', () => {
    const allowed = validateRoleApprovers({ technical: [a], business: [a] }, rules);
    expect(allowed.complete).toBe(true);
    expect(allowed.warnings).toEqual(['User a is assigned as both Technical/System Owner and Domain/Business Owner']);
    const blocked = validateRoleApprovers({ technical: [a], business: [a] }, { ...rules, allowSamePersonBothTypes: false });
    expect(blocked.complete).toBe(false);
    expect(blocked.errors.business).toMatch(/assigned as both/);
  });

  it('is complete only when every role is complete and there is at least one role', () => {
    const value = data({ r1: { technical: [a], business: [b] }, r2: { technical: [a], business: [b] } });
    expect(incompleteRoles(roles, value, rules).map((role) => role.id)).toEqual(['r3']);
    expect(isApproversComplete(roles, value, rules)).toBe(false);
    expect(isApproversComplete(roles.slice(0, 2), value, rules)).toBe(true);
    expect(isApproversComplete([], value, rules)).toBe(false);
  });

  it('prevents duplicates and enforces the maximum when adding', () => {
    const entry = { technical: [a], business: [] };
    expect(addApprover(entry, 'technical', a, rules)).toEqual({ added: false, entry, reason: 'duplicate' });
    const full = { technical: [a, b], business: [] };
    expect(addApprover(full, 'technical', c, rules)).toEqual({ added: false, entry: full, reason: 'max' });
    expect(addApprover(entry, 'business', a, rules)).toEqual({ added: true, entry: { technical: [a], business: [a] } });
  });
});

describe('apply to all', () => {
  const initial = data({ r1: { technical: [a], business: [] }, r2: { technical: [b], business: [c] } });
  const ids = roles.map((role) => role.id);

  it('adds to existing approvers without duplicates', () => {
    const { data: next, updatedRoleIds } = applyToAll(initial, ids, options({ technical: [a], business: [b] }), rules);
    expect(next.approvers.r1).toEqual({ technical: [a], business: [b] });
    expect(next.approvers.r2).toEqual({ technical: [b, a], business: [c, b] });
    expect(next.approvers.r3).toEqual({ technical: [a], business: [b] });
    expect(updatedRoleIds).toEqual(['r1', 'r2', 'r3']);
  });

  it('replaces existing approvers only for the selected types', () => {
    const { data: next } = applyToAll(initial, ids, options({ technical: [c], mode: 'replace' }), rules);
    expect(next.approvers.r1).toEqual({ technical: [c], business: [] });
    expect(next.approvers.r2).toEqual({ technical: [c], business: [c] });
    expect(next.approvers.r3).toEqual({ technical: [c], business: [] });
  });

  it('only fills empty columns when "only roles missing approvers" is set', () => {
    const { data: next, updatedRoleIds } = applyToAll(initial, ids, options({ technical: [c], business: [a], onlyMissing: true, mode: 'replace' }), rules);
    expect(next.approvers.r1).toEqual({ technical: [a], business: [a] });
    expect(next.approvers.r2).toEqual({ technical: [b], business: [c] });
    expect(next.approvers.r3).toEqual({ technical: [c], business: [a] });
    expect(updatedRoleIds).toEqual(['r1', 'r3']);
  });

  it('caps additions at the maximum per type while keeping existing approvers', () => {
    const value = data({ r1: { technical: [a, b], business: [] } });
    const { data: next, updatedRoleIds } = applyToAll(value, ['r1'], options({ technical: [c] }), rules);
    expect(next.approvers.r1.technical).toEqual([a, b]);
    expect(updatedRoleIds).toEqual([]);
  });

  it('reports only roles that would lose approvers so the UI can confirm', () => {
    expect(rolesLosingApprovers(initial, ids, options({ technical: [c], mode: 'replace' }), rules)).toEqual(['r1', 'r2']);
    expect(rolesLosingApprovers(initial, ids, options({ technical: [c] }), rules)).toEqual([]);
    expect(rolesLosingApprovers(initial, ids, options({ technical: [c], mode: 'replace', onlyMissing: true }), rules)).toEqual([]);
  });

  it('does not mutate the input state', () => {
    const snapshot = structuredClone(initial);
    applyToAll(initial, ids, options({ technical: [c], mode: 'replace' }), rules);
    expect(initial).toEqual(snapshot);
  });
});

describe('approver state helpers', () => {
  it('drops approvers for roles removed in Permissions and keeps identity when unchanged', () => {
    const value: BlueprintApproversData = { approvers: { r1: { technical: [a], business: [] }, gone: { technical: [b], business: [] } }, prefilledRoleIds: ['gone'] };
    expect(reconcileApprovers(value, ['r1'])).toEqual({ approvers: { r1: { technical: [a], business: [] } }, prefilledRoleIds: [] });
    const clean = data({ r1: { technical: [a], business: [] } });
    expect(reconcileApprovers(clean, ['r1', 'r2'])).toBe(clean);
  });

  it('prefills fetched approvers without overwriting user entries and remembers fetched roles', () => {
    const value = data({ r1: { technical: [c], business: [] } });
    const next = mergePrefilledApprovers(value, { r1: { technical: [a], business: [b] }, r2: { technical: [a], business: [b] } }, ['r1', 'r2']);
    expect(next.approvers).toEqual({ r1: { technical: [c], business: [b] }, r2: { technical: [a], business: [b] } });
    expect(next.prefilledRoleIds).toEqual(['r1', 'r2']);
  });

  it('filters roles by name, status and missing approvers', () => {
    const value = data({ r1: { technical: [a], business: [b] } });
    expect(filterApproverRoles(roles, value, 'CDM', 'all', rules).map((role) => role.id)).toEqual(['r2']);
    expect(filterApproverRoles(roles, value, '', 'missing', rules).map((role) => role.id)).toEqual(['r2', 'r3']);
    expect(filterApproverRoles(roles, value, '', 'new', rules).map((role) => role.id)).toEqual(['r3']);
    expect(filterApproverRoles(roles, value, '', 'existing', rules).map((role) => role.id)).toEqual(['r1', 'r2']);
  });

  it('describes role scope from the object hierarchy', () => {
    expect(describeRoleScope('s1', objects)).toBe('odx.cdm');
    expect(describeRoleScope('t1', objects)).toBe('odx.cdm.study');
    expect(describeRoleScope('missing', objects)).toBeUndefined();
  });
});
