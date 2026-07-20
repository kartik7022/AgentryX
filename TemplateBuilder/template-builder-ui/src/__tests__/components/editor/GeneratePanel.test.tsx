import { jest } from '@jest/globals';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GeneratePanel from '../../../components/editor/GeneratePanel';
import { apiRequest } from '../../../../__mocks__/client';

describe('GeneratePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should_generate_document_and_store_successful_job', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    (apiRequest as any)
      .mockResolvedValueOnce({ job_id: 'job-1' })
      .mockResolvedValueOnce({ job_id: 'job-1', status: 'success', output_target: 'pdf', created_at: '2026-04-26T10:00:00Z' });
    render(<GeneratePanel templateId="t1" templateName="Loan Template" outputTarget="pdf" onClose={jest.fn()} />);
    await user.click(screen.getByRole('button', { name: /Generate PDF/i }));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await waitFor(() => expect(localStorage.getItem('tb_generated_jobs')).toContain('job-1'));
    expect(screen.getByText(/Generated Successfully/i)).toBeInTheDocument();
  });
});
