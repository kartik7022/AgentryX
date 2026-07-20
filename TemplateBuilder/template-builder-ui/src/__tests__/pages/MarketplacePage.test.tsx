import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MarketplacePage from '../../pages/MarketplacePage';
import apiClient from '../../../__mocks__/client';
import { apiRequest } from '../../../__mocks__/client';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom') as any;
  return { ...actual, useNavigate: () => mockNavigate };
});
const mockPost = (apiClient as any).post as any;

const items = [
  { item_id: 'm1', type: 'template', source_id: 't1', name: 'Loan Template', description: 'Template', owner: 'dev_user', license: 'Community', rating: 4.5, downloads: 2, tags: ['banking'], is_public: true, created_at: '2026-04-01T00:00:00Z' },
];

describe('MarketplacePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    jest.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('should_render_marketplace_items', async () => {
    (apiRequest as any)
      .mockResolvedValueOnce(items)
      .mockResolvedValueOnce([]);
    render(<MemoryRouter><MarketplacePage /></MemoryRouter>);
    expect(await screen.findByText('Loan Template')).toBeInTheDocument();
  });

  it('should_import_item_and_show_success_message', async () => {
    const user = userEvent.setup();
    (apiRequest as any)
      .mockResolvedValueOnce(items)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ detail: 'ok' });
    render(<MemoryRouter><MarketplacePage /></MemoryRouter>);
    await screen.findByText('Loan Template');
    await user.click(screen.getByRole('button', { name: /Import/i }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', url: '/marketplace/m1/import' })));
    expect(screen.getByText(/Template imported as draft/i)).toBeInTheDocument();
  });

  it('should_publish_new_marketplace_item', async () => {
    const user = userEvent.setup();
    (apiRequest as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ template_id: 't1', name: 'Published Template', status: 'published' }])
      .mockResolvedValueOnce(items[0]);
    render(<MemoryRouter><MarketplacePage /></MemoryRouter>);
    await screen.findByText('Marketplace is empty');
    await user.click(screen.getByRole('button', { name: /Publish to Marketplace/i }));
    await user.selectOptions(screen.getAllByRole('combobox')[1], 't1');
    await user.type(screen.getByPlaceholderText(/Loan Closure Letter Template/i), 'Loan Template');
    await user.click(screen.getByRole('button', { name: /^↑ Publish$/i }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', url: '/marketplace/' })));
  });

  it('should_submit_rating', async () => {
    const user = userEvent.setup();
    (apiRequest as any).mockImplementation(({ url }: { url: string }) => {
      if (url === '/marketplace/') return Promise.resolve(items);
      if (url === '/templates') return Promise.resolve([]);
      return Promise.resolve([]);
    });
    mockPost.mockResolvedValue({ data: { rating: 5 } });
    render(<MemoryRouter><MarketplacePage /></MemoryRouter>);
    await screen.findByText('Loan Template');
    await user.click(screen.getByTitle('Rate 5 stars'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/marketplace/m1/rate', { rating: 5 }));
  });
});
