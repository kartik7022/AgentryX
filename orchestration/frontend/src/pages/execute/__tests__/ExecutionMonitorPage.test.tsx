// src/pages/execute/__tests__/ExecutionMonitorPage.test.tsx
// ORCH-030: frontend tests for the Execution Monitor.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import ExecutionMonitorPage from '../ExecutionMonitorPage';
import * as api from '../../../services/api';
import type { OrchestrationRunResponse, ExecutionStep } from '../../../types';

vi.mock('../../../services/api');

const NAV_STATE = {
  plan_name: 'loan_noc_email_processing',
  entity_type: 'email',
  tenant_id: 'demo',
  params: { subject: 'Request for loan closure NOC' },
  steps: ['classify_email_intent', 'route_policy'],
};

function renderWithState(state: unknown = NAV_STATE) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/execute/monitor', state }]}
    >
      <Routes>
        <Route path="/execute/monitor" element={<ExecutionMonitorPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ExecutionMonitorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs the plan on mount and shows "Completed" with real step statuses', async () => {
    const runResponse: OrchestrationRunResponse = {
      execution_id: 'exec-1',
      status: 'success',
      plan_name: 'loan_noc_email_processing',
      entity_type: 'email',
      results: {
        classify_email_intent: { routing_decision: 'AUTO_PROCESS' },
        route_policy: { routing_decision: 'AUTO_PROCESS' },
      },
      errors: {},
      duration_ms: 120,
    };
    const stepRows: ExecutionStep[] = [
      {
        execution_step_id: 'es-1', execution_id: 'exec-1', plan_step_id: null,
        step_key: 'classify_email_intent', kind: 'intent_classify', status: 'success',
        request_json: {}, response_json: { routing_decision: 'AUTO_PROCESS' },
        error_json: {}, evidence_json: {}, retry_count: 0,
        started_at: '2026-01-01T00:00:00Z', completed_at: '2026-01-01T00:00:01Z', duration_ms: 900,
      },
      {
        execution_step_id: 'es-2', execution_id: 'exec-1', plan_step_id: null,
        step_key: 'route_policy', kind: 'policy_route', status: 'success',
        request_json: {}, response_json: { routing_decision: 'AUTO_PROCESS' },
        error_json: {}, evidence_json: {}, retry_count: 0,
        started_at: '2026-01-01T00:00:01Z', completed_at: '2026-01-01T00:00:02Z', duration_ms: 700,
      },
    ];

    vi.mocked(api.runPlan).mockResolvedValue(runResponse);
    vi.mocked(api.listExecutionSteps).mockResolvedValue(stepRows);

    renderWithState();

    await waitFor(() => {
      expect(api.runPlan).toHaveBeenCalledWith({
        plan_name: NAV_STATE.plan_name,
        entity_type: NAV_STATE.entity_type,
        tenant_id: NAV_STATE.tenant_id,
        params: NAV_STATE.params,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('✓ Completed')).toBeInTheDocument();
    });

    expect(screen.getByText('loan_noc_email_processing')).toBeInTheDocument();
    expect(screen.getAllByText(/exec-1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('classify_email_intent').length).toBeGreaterThan(0);
    expect(screen.getAllByText('route_policy').length).toBeGreaterThan(0);
  });

  it('shows a "Failed" state and surfaces the error message when runPlan rejects', async () => {
    vi.mocked(api.runPlan).mockRejectedValue(new Error('Plan not found or inactive'));
    vi.mocked(api.listExecutionSteps).mockResolvedValue([]);

    renderWithState();

    await waitFor(() => {
      expect(screen.getByText('✕ Failed')).toBeInTheDocument();
    });
    expect(screen.getByText(/plan not found or inactive/i)).toBeInTheDocument();
  });

  it('redirects to /execute when there is no navigation state (e.g. direct URL visit)', async () => {
    render(
      <MemoryRouter initialEntries={['/execute/monitor']}>
        <Routes>
          <Route path="/execute/monitor" element={<ExecutionMonitorPage />} />
          <Route path="/execute" element={<div>Execute Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Execute Page')).toBeInTheDocument();
    });
    expect(api.runPlan).not.toHaveBeenCalled();
  });
});