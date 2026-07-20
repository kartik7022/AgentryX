import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestsPanel from '../../../components/editor/TestsPanel';
import apiClient from '../../../../__mocks__/client';

const mockGet = (apiClient as any).get as any;
const mockPost = (apiClient as any).post as any;

describe('TestsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    jest.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('should_load_existing_tests_and_run_one', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({
      data: [{ test_id: 'test-1', template_id: 't1', name: 'Basic', description: '', runtime_params: {}, expected_strings: ['John'], created_by: 'dev_user', created_at: null }],
    });
    mockPost.mockResolvedValueOnce({
      data: { test_id: 'test-1', name: 'Basic', status: 'pass', message: 'Passed', checks_passed: 1, checks_total: 1, rendered_html: '<p>John</p>' },
    });

    render(<TestsPanel templateId="t1" onClose={jest.fn()} />);

    expect(await screen.findByText('Basic')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Run/i })[1]);

    expect(await screen.findByText('Passed')).toBeInTheDocument();
  });

  it('should_validate_and_create_new_test', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ data: [] });
    mockPost.mockResolvedValueOnce({
      data: { test_id: 'test-2', template_id: 't1', name: 'New Test', description: '', runtime_params: {}, expected_strings: ['John'], created_by: 'dev_user', created_at: null },
    });

    render(<TestsPanel templateId="t1" onClose={jest.fn()} />);

    await screen.findByText('No tests yet');
    await user.click(screen.getByRole('button', { name: /\+ New Test/i }));
    await user.click(screen.getByRole('button', { name: /Save Test/i }));

    expect(screen.getByText('Test name is required')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Loan letter/i), 'New Test');
    await user.type(screen.getByPlaceholderText(/LN12345/i), 'John');
    await user.click(screen.getByRole('button', { name: /Save Test/i }));

    await waitFor(() => expect(screen.getByText('New Test')).toBeInTheDocument());
  });
});
