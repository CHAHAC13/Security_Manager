import { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BlueprintDeploymentForm, type DeploymentFormHandle } from './BlueprintDeploymentForm';
import { DeploymentSummary } from './DeploymentSummary';
import { createDeploymentData, setDeploymentStrategy } from '@/lib/deployment';
import type { BlueprintDeploymentData } from '@/types/blueprint';

function setup(initial = createDeploymentData()) {
  let latest = initial;
  function Harness() {
    const [data, setData] = useState(initial);
    const [review, setReview] = useState(false);
    const form = useRef<DeploymentFormHandle>(null);
    return <>
      {review ? <DeploymentSummary data={data} /> : <BlueprintDeploymentForm ref={form} data={data}
        onChange={(value) => { latest = value; setData(value); }} />}
      <button onClick={() => { if (form.current?.validate()) setReview(true); }}>Next</button>
    </>;
  }
  render(<Harness />);
  return { latest: () => latest };
}

describe('Deployment form', () => {
  it('shows exactly Dev, Stg and Prd with independent two-option selectors and disabled Immediate dates', async () => {
    setup();
    expect(screen.getAllByRole('rowheader').map((row) => row.textContent)).toEqual(['Dev', 'Stg', 'Prd']);
    for (const label of ['Dev', 'Stg', 'Prd']) {
      const strategy = screen.getByRole<HTMLSelectElement>('combobox', { name: `${label} Deployment Strategy` });
      expect(strategy.value).toBe('immediate');
      expect(within(strategy).getAllByRole('option').map((option) => option.textContent)).toEqual(['Immediate', 'Scheduled']);
      expect(screen.getByLabelText<HTMLInputElement>(`${label} Date / Time`).disabled).toBe(true);
    }
    await userEvent.selectOptions(screen.getByLabelText('Stg Deployment Strategy'), 'scheduled');
    expect(screen.getByLabelText<HTMLInputElement>('Stg Date / Time').disabled).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>('Stg Date / Time').required).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Dev Date / Time').disabled).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Prd Date / Time').disabled).toBe(true);
  });

  it('shows field-level errors and focuses the first invalid field without proceeding', async () => {
    setup(setDeploymentStrategy(createDeploymentData(), 'stg', 'scheduled'));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Select a deployment date and time.')).toBeTruthy();
    const date = screen.getByLabelText<HTMLInputElement>('Stg Date / Time');
    expect(date.getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(date));
    expect(screen.queryByRole('region', { name: 'Deployment' })).toBeNull();
  });

  it('clears stale dates, validates Prd order and retains independent notification settings', async () => {
    const { latest } = setup();
    await userEvent.selectOptions(screen.getByLabelText('Dev Deployment Strategy'), 'scheduled');
    fireEvent.change(screen.getByLabelText('Dev Date / Time'), { target: { value: '2030-07-12T12:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/Prd cannot deploy before Dev/)).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Prd Deployment Strategy'), 'scheduled');
    fireEvent.change(screen.getByLabelText('Prd Date / Time'), { target: { value: '2030-07-12T11:00' } });
    expect(screen.getByLabelText('Prd Date / Time').getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(screen.getByLabelText('Prd Date / Time'), { target: { value: '2030-07-12T12:00' } });
    expect(screen.queryByText(/Prd cannot deploy before/)).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('Dev Deployment Strategy'), 'immediate');
    expect(latest().environments.dev).toEqual({ strategy: 'immediate', scheduledDateTime: '', scheduledAt: null });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Notify Requestor on Deployment Success/Failure' }));
    expect(latest().notifyRequestor).toBe(true);
    expect(latest().notifyApprovers).toBe(false);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Notify Approvers on Deployment Success/Failure' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Notify Requestor on Deployment Success/Failure' }));
    expect(latest().notifyRequestor).toBe(false);
    expect(latest().notifyApprovers).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const summary = screen.getByRole('region', { name: 'Deployment' });
    expect(within(summary).getAllByText('Immediate')).toHaveLength(2);
    expect(within(summary).getByText(/Scheduled:/).textContent).toContain(latest().timeZone);
    expect(within(summary).getByText(/Requestor: Off; Approvers: On/)).toBeTruthy();
  });

  it('requires all missing strategies and lets the user correct them without resetting other fields', async () => {
    const initial: BlueprintDeploymentData = createDeploymentData();
    for (const key of ['dev', 'stg', 'prd'] as const) initial.environments[key].strategy = '';
    setup(initial);
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByText('Select a deployment strategy.')).toHaveLength(3);
    for (const label of ['Dev', 'Stg', 'Prd']) {
      await userEvent.selectOptions(screen.getByLabelText(`${label} Deployment Strategy`), 'immediate');
    }
    expect(screen.queryByText('Select a deployment strategy.')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('region', { name: 'Deployment' })).toBeTruthy();
  });
});
