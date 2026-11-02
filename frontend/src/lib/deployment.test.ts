import { describe, expect, it } from 'vitest';
import {
  createDeploymentData, deploymentScheduleLabel, localScheduleToUtc,
  setDeploymentDateTime, setDeploymentStrategy, validateDeployment,
} from './deployment';
import type { BlueprintDeploymentData, PermissionEnvironment } from '@/types/blueprint';

function scheduled(data: BlueprintDeploymentData, environment: PermissionEnvironment, value: string) {
  return setDeploymentDateTime(setDeploymentStrategy(data, environment, 'scheduled'), environment, value);
}

describe('deployment configuration', () => {
  it('creates three independent Immediate schedules, without dates or enabled notifications', () => {
    const data = createDeploymentData();
    expect(Object.keys(data.environments)).toEqual(['dev', 'stg', 'prd']);
    expect(data.environments.dev).not.toBe(data.environments.stg);
    expect(data.environments.dev).toEqual({ strategy: 'immediate', scheduledDateTime: '', scheduledAt: null });
    expect(data.notifyRequestor).toBe(false);
    expect(data.notifyApprovers).toBe(false);
    expect(data.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(validateDeployment(data)).toEqual({});
  });

  it.each(['dev', 'stg', 'prd'] as const)('requires a strategy and Scheduled date/time for %s', (environment) => {
    const data = createDeploymentData();
    expect(validateDeployment(setDeploymentStrategy(data, environment, ''))[environment]?.strategy).toBeTruthy();
    expect(validateDeployment(setDeploymentStrategy(data, environment, 'scheduled'))[environment]?.scheduledDateTime)
      .toBe('Select a deployment date and time.');
  });

  it('keeps scheduled wall-clock values alongside UTC instants and timezone in a serializable draft', () => {
    const original = createDeploymentData();
    const data = scheduled(original, 'prd', '2030-07-12T14:30');
    expect(data.environments.prd).toEqual({
      strategy: 'scheduled', scheduledDateTime: '2030-07-12T14:30',
      scheduledAt: new Date(2030, 6, 12, 14, 30).toISOString(),
    });
    expect(data.environments.dev).toBe(original.environments.dev);
    expect(original.environments.prd.strategy).toBe('immediate');
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    expect(validateDeployment(data)).toEqual({});
  });

  it('clears stale timestamps and local values when returning to Immediate', () => {
    const data = scheduled(createDeploymentData(), 'prd', '2030-07-12T14:30');
    const immediate = setDeploymentStrategy(data, 'prd', 'immediate');
    expect(immediate.environments.prd).toEqual({ strategy: 'immediate', scheduledDateTime: '', scheduledAt: null });
    expect(setDeploymentStrategy(immediate, 'prd', 'scheduled').environments.prd.scheduledDateTime).toBe('');
    expect(setDeploymentDateTime(immediate, 'prd', '2030-07-12T14:30').environments.prd).toEqual(immediate.environments.prd);
  });

  it.each(['garbage', '2030-02-30T10:00', '2030-13-01T10:00', '2030-01-01T25:00', '2030-07-12', '2030-07-12T14:30Z'])(
    'rejects malformed or rolled-over local schedule %s', (value) => {
      expect(localScheduleToUtc(value)).toBeNull();
      expect(validateDeployment(scheduled(createDeploymentData(), 'prd', value)).prd?.scheduledDateTime)
        .toBe('Enter a valid local date and time.');
    },
  );

  it('rejects mismatched UTC instants and stale Immediate dates', () => {
    const data = scheduled(createDeploymentData(), 'prd', '2030-07-12T14:30');
    data.environments.prd.scheduledAt = '2030-07-11T00:00:00.000Z';
    expect(validateDeployment(data).prd?.scheduledDateTime).toBeTruthy();
    const immediate = createDeploymentData();
    immediate.environments.dev.scheduledDateTime = '2030-07-12T14:30';
    expect(validateDeployment(immediate).dev?.strategy).toMatch(/Immediate deployment cannot/);
  });

  it('rejects Immediate Prd when either lower environment is Scheduled', () => {
    for (const environment of ['dev', 'stg'] as const) {
      const data = scheduled(createDeploymentData(), environment, '2030-07-12T14:30');
      expect(validateDeployment(data).prd?.strategy).toMatch(/Prd cannot deploy before/);
    }
  });

  it('checks Prd against both Dev and Stg without changing user dates, allowing equal times', () => {
    let data = scheduled(createDeploymentData(), 'dev', '2030-07-14T10:00');
    data = scheduled(data, 'stg', '2030-07-13T10:00');
    data = scheduled(data, 'prd', '2030-07-12T10:00');
    const snapshot = structuredClone(data);
    expect(validateDeployment(data).prd?.scheduledDateTime).toContain('Dev or Stg');
    expect(data).toEqual(snapshot);
    data = scheduled(data, 'prd', '2030-07-14T10:00');
    expect(validateDeployment(data)).toEqual({});
    data = scheduled(data, 'stg', '2030-07-15T10:00');
    expect(validateDeployment(data).prd?.scheduledDateTime).toContain('Stg');
  });

  it('permits independent Dev/Stg ordering and ignores their invalid schedules until corrected', () => {
    let data = scheduled(createDeploymentData(), 'dev', '2030-07-15T10:00');
    data = scheduled(data, 'stg', '2030-07-14T10:00');
    data = scheduled(data, 'prd', '2030-07-15T10:00');
    expect(validateDeployment(data)).toEqual({});
    data = setDeploymentDateTime(data, 'dev', '');
    expect(validateDeployment(data)).toEqual({ dev: { scheduledDateTime: 'Select a deployment date and time.' } });
  });

  it('summarizes the configured instant in its recorded timezone rather than a hard-coded date', () => {
    const data = scheduled(createDeploymentData(), 'prd', '2030-07-12T14:30');
    expect(deploymentScheduleLabel(data.environments.dev, data.timeZone)).toBe('Immediate');
    expect(deploymentScheduleLabel(data.environments.prd, 'UTC')).toBe(`Scheduled: ${new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
    }).format(new Date(data.environments.prd.scheduledAt!))} (UTC)`);
  });

  it.skipIf(Intl.DateTimeFormat().resolvedOptions().timeZone !== 'America/New_York')(
    'rejects DST-skipped times and records the browser-selected earlier occurrence of repeated times', () => {
      expect(localScheduleToUtc('2030-03-10T02:30')).toBeNull();
      expect(localScheduleToUtc('2030-11-03T01:30')).toBe('2030-11-03T05:30:00.000Z');
      expect(localScheduleToUtc('2030-07-12T14:30')).toBe('2030-07-12T18:30:00.000Z');
    },
  );
});
