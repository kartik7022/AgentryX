// src/pages/plans/__tests__/EditPlanPage.test.tsx
// ORCH-029: frontend tests for the Visual Plan Designer (edit form).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import EditPlanPage from '../EditPlanPage';
import * as api from '../../../services/api';
import type { PlanResponse } from '../../../types';

vi.mock('../../../services/api');

const EXISTING_PLAN: PlanResponse = {
  plan_id: 'plan-1',
  name: 'customer_360',
  entity_type: 'customer',
  description: 'A test plan',
  is_active: true,
  version: 1,
  tenant_id: '',
  error_policy: 'best_effort',
  max_concurrency: 8,
  steps: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/plans/plan-1/edit']}>
      <Routes>
        <Route path="/plans/:id/edit" element={<EditPlanPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EditPlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listPlans).mockResolvedValue([EXISTING_PLAN]);
    vi.mocked(api.updatePlan).mockResolvedValue(EXISTING_PLAN);
  });

  it('loads the existing plan and renders its name', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByDisplayValue('customer_360')).toBeInTheDocument();
    });
  });

  it('shows an error state when the plan id does not match any plan', async () => {
    vi.mocked(api.listPlans).mockResolvedValue([]); // no plan with id 'plan-1'
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/plan not found/i)).toBeInTheDocument();
    });
  });

  it('lets the user add a step and cycle through all 13 kinds without crashing', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await waitFor(() => screen.getByDisplayValue('customer_360'));

    await user.click(screen.getByText('+ Add Step'));
    // the newly-added step card's collapsed header shows its auto step_key
    await user.click(screen.getByText('step_1'));

    // Note: the plan-level Entity Type <input list="entity-list"> also gets
    // an implicit ARIA role of "combobox" (it has a `list` attribute), so
    // getAllByRole('combobox') isn't safe here — query real <select>
    // elements directly. Once the one step card is open, the Kind <select>
    // is the first (and only) <select> on the page.
    const select = container.querySelectorAll('select')[0] as HTMLSelectElement;

    const ALL_KINDS = [
      'sql', 'rest', 'graphql', 'ai_transform',
      'intent_classify', 'policy_route', 'intent_validate', 'adapter_analyze',
      'prompt_run', 'document_generate', 'human_review', 'webhook', 'agent_task',
    ];
    for (const kind of ALL_KINDS) {
      await user.selectOptions(select, kind);
      expect(select.value).toBe(kind);
    }
  });

  it('submits the updated plan including a newly-added agent_task step', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await waitFor(() => screen.getByDisplayValue('customer_360'));

    await user.click(screen.getByText('+ Add Step'));
    await user.click(screen.getByText('step_1'));

    const select = container.querySelectorAll('select')[0] as HTMLSelectElement;
    await user.selectOptions(select, 'agent_task');

    const stepKeyInput = screen.getByPlaceholderText('e.g. crm_data');
    await user.clear(stepKeyInput);
    await user.type(stepKeyInput, 'run_agent');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(api.updatePlan).toHaveBeenCalledWith(
        'plan-1',
        expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({ step_key: 'run_agent', kind: 'agent_task' }),
          ]),
        })
      );
    });
  });

  it('blocks submit and shows a validation error on duplicate step keys', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByDisplayValue('customer_360'));

    await user.click(screen.getByText('+ Add Step'));
    await user.click(screen.getByText('+ Add Another Step'));

    // Only open the SECOND card. Its header text ("step_2") is still unique
    // at this point since nothing is expanded yet — opening it reveals a
    // "Depends On" checklist that lists the OTHER step's key ("step_1") as
    // an option, so leave the first card collapsed to avoid ambiguous
    // matches on that same text.
    await user.click(screen.getByText('step_2'));

    const stepKeyInput = screen.getByPlaceholderText('e.g. crm_data');
    await user.clear(stepKeyInput);
    await user.type(stepKeyInput, 'step_1');

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/duplicate step keys/i)).toBeInTheDocument();
    });
    expect(api.updatePlan).not.toHaveBeenCalled();
  });
});