import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TemplatesPage from '../../pages/TemplatesPage';
import { apiRequest } from '../../../__mocks__/client';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom') as any;
  return { ...actual, useNavigate: () => mockNavigate };
});

const templates = [
  { template_id: 't1', name: 'Loan Letter', status: 'draft', output_target: 'pdf', industry: 'banking', description: 'Desc', tags: ['loan'], layout_json: { blocks: [] }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: 'dev_user' },
  { template_id: 't2', name: 'Policy Letter', status: 'published', output_target: 'docx', industry: 'insurance', description: '', tags: [], layout_json: { blocks: [] }, created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z', created_by: 'dev_user' },
];

function renderPage() {
  return render(<MemoryRouter><TemplatesPage /></MemoryRouter>);
}

describe('TemplatesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should_render_templates_after_loading', async () => {
    (apiRequest as any).mockResolvedValueOnce(templates);
    renderPage();
    expect(await screen.findByText('Loan Letter')).toBeInTheDocument();
    expect(screen.getByText('Policy Letter')).toBeInTheDocument();
  });

  it('should_show_empty_state_when_no_templates_exist', async () => {
    (apiRequest as any).mockResolvedValueOnce([]);
    renderPage();
    expect(await screen.findByText('No templates found')).toBeInTheDocument();
  });

  it('should_open_create_modal_and_create_template', async () => {
    const user = userEvent.setup();
    (apiRequest as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ template_id: 'created-id' });
    renderPage();
    await screen.findByText('No templates found');
    await user.click(screen.getAllByRole('button', { name: /\+ New Template/i })[0]);
    await user.type(screen.getByPlaceholderText('e.g. Loan Closure Letter'), 'New Template');
    await user.click(screen.getByRole('button', { name: /\+ Create Template/i }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', url: '/templates' })));
    expect(screen.queryByRole('heading', { name: /New Template/i })).not.toBeInTheDocument();
  });

  it('should_delete_template_after_confirmation', async () => {
    const user = userEvent.setup();
    (apiRequest as any)
      .mockResolvedValueOnce(templates)
      .mockResolvedValueOnce(undefined);
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByText('Loan Letter');
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'DELETE', url: '/templates/t1' })));
    expect(screen.queryByText('Loan Letter')).not.toBeInTheDocument();
  });

  it('should_open_import_modal', async () => {
    const user = userEvent.setup();
    (apiRequest as any).mockResolvedValueOnce(templates);
    renderPage();
    await screen.findByText('Loan Letter');
    await user.click(screen.getByRole('button', { name: /Import/i }));
    expect(screen.getByRole('heading', { name: /Import Template/i })).toBeInTheDocument();
  });
});
