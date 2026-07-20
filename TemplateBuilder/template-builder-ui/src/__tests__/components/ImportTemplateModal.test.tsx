import { jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ImportTemplateModal from '../../components/ImportTemplateModal';
import apiClient from '../../api/client';

const mockNavigate = jest.fn();
const mockedPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

jest.mock('../../api/client');

function renderModal() {
  const onClose = jest.fn();
  const onImported = jest.fn();

  const view = render(
    <MemoryRouter>
      <ImportTemplateModal onClose={onClose} onImported={onImported} />
    </MemoryRouter>
  );

  return { ...view, onClose, onImported };
}

describe('ImportTemplateModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should_show_validation_error_when_file_import_is_submitted_without_name', async () => {
    const user = userEvent.setup();

    renderModal();

    await user.click(screen.getByRole('button', { name: /Import Template/i }));

    expect(screen.getByText('Template name is required.')).toBeInTheDocument();
  });

  it('should_auto_fill_template_name_when_file_is_selected_and_name_is_empty', async () => {
    const user = userEvent.setup();

    const { container } = renderModal();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'loan_offer_letter.pdf', { type: 'application/pdf' });

    await user.upload(input, file);

    expect(screen.getByDisplayValue('Loan Offer Letter')).toBeInTheDocument();
    expect(screen.getByText('loan_offer_letter.pdf')).toBeInTheDocument();
  });

  it('should_show_error_when_selected_file_exceeds_max_size', async () => {
    const user = userEvent.setup();

    const { container } = renderModal();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['large-file'], 'oversized.pdf', { type: 'application/pdf' });

    Object.defineProperty(file, 'size', { value: 21 * 1024 * 1024 });

    await user.upload(input, file);

    expect(screen.getByText('File too large. Max 20MB.')).toBeInTheDocument();
  });

  it('should_require_url_when_url_tab_is_selected', async () => {
    const user = userEvent.setup();

    renderModal();

    await user.click(screen.getByRole('button', { name: /Import from URL/i }));
    await user.type(screen.getByPlaceholderText('e.g. Loan Offer Letter'), 'Drive Import');
    await user.click(screen.getByRole('button', { name: /Import Template/i }));

    expect(screen.getByText('Please enter a URL.')).toBeInTheDocument();
  });

  it('should_import_file_and_navigate_to_template_when_request_succeeds', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockedPost.mockResolvedValue({
      data: { template_id: 'template-123', block_count: 4 },
    });

    const { container, onClose, onImported } = renderModal();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'offer.pdf', { type: 'application/pdf' });

    await user.upload(input, file);
    await user.click(screen.getByRole('button', { name: /^↑ Import Template$/i }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledTimes(1);
    });

    expect(mockedPost).toHaveBeenCalledWith(
      '/templates/import/file',
      expect.any(FormData),
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      }
    );

    await act(async () => {
      jest.advanceTimersByTime(900);
    });

    expect(onImported).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should_show_server_validation_message_when_file_import_fails', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValue({
      response: { data: { detail: 'Unsupported document layout' } },
    });

    const { container } = renderModal();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'offer.pdf', { type: 'application/pdf' });

    await user.upload(input, file);
    await user.click(screen.getByRole('button', { name: /^↑ Import Template$/i }));

    expect(await screen.findByText('Unsupported document layout')).toBeInTheDocument();
  });

  it('should_map_timeout_status_to_friendly_message_when_url_import_times_out', async () => {
    const user = userEvent.setup();
    mockedPost.mockRejectedValue({
      response: { status: 408, data: {} },
    });

    renderModal();

    await user.click(screen.getByRole('button', { name: /Import from URL/i }));
    await user.type(screen.getByPlaceholderText('e.g. Loan Offer Letter'), 'Public Page');
    await user.type(
      screen.getByPlaceholderText(/https:\/\/drive\.google\.com\/file\/d\/\.\.\./i),
      'https://example.com/template'
    );
    await user.click(screen.getByRole('button', { name: /^↑ Import Template$/i }));

    expect(
      await screen.findByText('Request timed out. Try a smaller file or URL.')
    ).toBeInTheDocument();
  });
});
