import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuditLogPage from '../../pages/AuditLogPage';
import { apiRequest } from '../../api/client';

jest.mock('../../api/client');
const mockApiRequest = apiRequest as any;

const events = [
  { event_id: 'e1', entity_type: 'template', entity_id: 'template-1', action: 'create', actor: 'dev_user', summary: 'Created template', details_json: { name: 'Loan' }, created_at: '2026-04-26T10:00:00Z' },
  { event_id: 'e2', entity_type: 'marketplace', entity_id: 'market-1', action: 'error', actor: 'dev_user', summary: 'Failed import', details_json: {}, created_at: '2026-04-26T11:00:00Z' },
];

describe('AuditLogPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should_render_audit_events_after_loading', async () => {
    mockApiRequest.mockResolvedValue(events);
    render(<AuditLogPage />);
    expect(await screen.findByText('Created template')).toBeInTheDocument();
    expect(screen.getByText('Failed import')).toBeInTheDocument();
  });

  it('should_show_error_state_when_request_fails', async () => {
    mockApiRequest.mockRejectedValue(new Error('boom'));
    render(<AuditLogPage />);
    expect(await screen.findByText('Could not load audit events')).toBeInTheDocument();
  });

  it('should_filter_events_by_search_text', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue(events);
    render(<AuditLogPage />);
    await screen.findByText('Created template');
    await user.type(screen.getByPlaceholderText(/Search events/i), 'failed');
    expect(screen.queryByText('Created template')).not.toBeInTheDocument();
    expect(screen.getByText('Failed import')).toBeInTheDocument();
  });

  it('should_expand_event_details_when_row_has_details', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue(events);
    render(<AuditLogPage />);
    await screen.findByText('Created template');
    await user.click(screen.getByText('Created template'));
    await waitFor(() => expect(screen.getByText('Event Details')).toBeInTheDocument());
  });
});
