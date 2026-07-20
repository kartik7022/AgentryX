import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DocumentsPage from '../../pages/DocumentsPage';
import apiClient from '../../../__mocks__/client';

const mockFetch = jest.fn();

const mockGet = (apiClient as any).get as any;

const jobs = [
  { job_id: 'job-1', template_id: 't1', template_name: 'Loan Letter', output_target: 'docx', status: 'success', runtime_params: { customer: 'John' }, created_at: '2026-04-26T10:00:00Z' },
];

describe('DocumentsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = mockFetch;
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: jest.fn(() => 'blob:url') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: jest.fn() });
    jest.spyOn(window, 'open').mockImplementation(() => null);
  });

  it('should_render_empty_state_and_navigate_to_templates', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ data: [] });
    render(
      <MemoryRouter initialEntries={['/documents']}>
        <Routes>
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/templates" element={<div>Templates Route</div>} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText('No documents generated yet');
    await user.click(screen.getByRole('button', { name: /Go to Templates/i }));
    expect(await screen.findByText('Templates Route')).toBeInTheDocument();
  });

  it('should_render_jobs_and_filter_by_name', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ data: jobs });
    render(<MemoryRouter><DocumentsPage /></MemoryRouter>);
    expect(await screen.findByText('Loan Letter')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Search by template name...'), 'policy');
    expect(screen.queryByText('Loan Letter')).not.toBeInTheDocument();
  });

  it('should_open_docx_info_modal_when_view_is_clicked', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ data: jobs });
    render(<MemoryRouter><DocumentsPage /></MemoryRouter>);
    await screen.findByText('Loan Letter');
    await user.click(screen.getByRole('button', { name: /Info/i }));
    expect(screen.getByText(/Word Document \(.docx\)/i)).toBeInTheDocument();
  });

  it('should_clear_history_after_confirmation', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ data: jobs });
    render(<MemoryRouter><DocumentsPage /></MemoryRouter>);
    await screen.findByText('Loan Letter');
    await user.click(screen.getByRole('button', { name: /Clear history/i }));
    expect(screen.queryByText('Loan Letter')).not.toBeInTheDocument();
  });
});
