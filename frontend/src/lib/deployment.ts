import type {
  BlueprintDeploymentData, DeploymentErrors, DeploymentStrategy, EnvironmentDeployment, PermissionEnvironment,
} from '@/types/blueprint';

export const DEPLOYMENT_ENVIRONMENTS: { key: PermissionEnvironment; label: string }[] = [
  { key: 'dev', label: 'Dev' },
  { key: 'stg', label: 'Stg' },
  { key: 'prd', label: 'Prd' },
];

export function createDeploymentData(): BlueprintDeploymentData {
  const environment = (): EnvironmentDeployment => ({ strategy: 'immediate', scheduledDateTime: '', scheduledAt: null });
  return {
    environments: { dev: environment(), stg: environment(), prd: environment() },
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    notifyRequestor: false,
    notifyApprovers: false,
  };
}

/** Rejects invalid calendar values and local times skipped by daylight-saving transitions. */
export function localScheduleToUtc(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getFullYear() !== year || date.getMonth() + 1 !== month
    || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) return null;
  return date.toISOString();
}

export function setDeploymentStrategy(
  data: BlueprintDeploymentData, environment: PermissionEnvironment, strategy: DeploymentStrategy,
): BlueprintDeploymentData {
  const current = data.environments[environment];
  return {
    ...data,
    environments: {
      ...data.environments,
      [environment]: strategy === 'scheduled' ? { ...current, strategy }
        : { strategy, scheduledDateTime: '', scheduledAt: null },
    },
  };
}

export function setDeploymentDateTime(
  data: BlueprintDeploymentData, environment: PermissionEnvironment, value: string,
): BlueprintDeploymentData {
  const current = data.environments[environment];
  return {
    ...data,
    environments: {
      ...data.environments,
      [environment]: current.strategy === 'scheduled'
        ? { ...current, scheduledDateTime: value, scheduledAt: localScheduleToUtc(value) }
        : { ...current, scheduledDateTime: '', scheduledAt: null },
    },
  };
}

export function validateDeployment(data: BlueprintDeploymentData): DeploymentErrors {
  const errors: DeploymentErrors = {};
  for (const { key } of DEPLOYMENT_ENVIRONMENTS) {
    const config = data.environments[key];
    if (config.strategy !== 'immediate' && config.strategy !== 'scheduled') {
      errors[key] = { strategy: 'Select a deployment strategy.' };
    } else if (config.strategy === 'scheduled') {
      if (!config.scheduledDateTime) errors[key] = { scheduledDateTime: 'Select a deployment date and time.' };
      else if (!config.scheduledAt || config.scheduledAt !== localScheduleToUtc(config.scheduledDateTime)) {
        errors[key] = { scheduledDateTime: 'Enter a valid local date and time.' };
      }
    } else if (config.scheduledDateTime || config.scheduledAt !== null) {
      errors[key] = { strategy: 'Immediate deployment cannot have a scheduled date/time. Select Immediate again to clear it.' };
    }
  }
  const production = data.environments.prd;
  if (!errors.prd) {
    const later = DEPLOYMENT_ENVIRONMENTS.filter(({ key }) => {
      if (key === 'prd' || errors[key]) return false;
      const lower = data.environments[key];
      return lower.strategy === 'scheduled' && (production.strategy === 'immediate'
        || (production.scheduledAt !== null && lower.scheduledAt !== null
          && Date.parse(production.scheduledAt) < Date.parse(lower.scheduledAt)));
    });
    if (later.length) {
      const field = production.strategy === 'scheduled' ? 'scheduledDateTime' : 'strategy';
      errors.prd = { [field]: `Prd cannot deploy before ${later.map(({ label }) => label).join(' or ')}. Schedule Prd at or after both Dev and Stg, or change their strategies.` };
    }
  }
  return errors;
}

export function deploymentScheduleLabel(config: EnvironmentDeployment, timeZone: string): string {
  if (config.strategy === 'immediate') return 'Immediate';
  if (config.strategy !== 'scheduled' || !config.scheduledAt) return 'Not configured';
  const date = new Date(config.scheduledAt);
  if (!Number.isFinite(date.getTime())) return 'Invalid schedule';
  return `Scheduled: ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short', timeZone,
  }).format(date)} (${timeZone})`;
}
