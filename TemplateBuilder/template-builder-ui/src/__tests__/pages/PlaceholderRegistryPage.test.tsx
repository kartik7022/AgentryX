import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlaceholderRegistryPage from '../../pages/PlaceholderRegistryPage';
import { apiRequest } from '../../../__mocks__/client';

describe('PlaceholderRegistryPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should_load_placeholders_and_datasources', async () => {
    (apiRequest as any)
      .mockResolvedValueOnce([{ registry_id: 'p1', name: 'customer_name', generation_mode: 'manual_sql', sample_value: 'John', datasource_id: 1 }])
      .mockResolvedValueOnce([{ datasource_id: 1, name: 'CRM', datasource_type: 'postgres', description: 'CRM DB' }]);
    render(<PlaceholderRegistryPage />);
    expect(await screen.findByText('{{customer_name}}')).toBeInTheDocument();
    expect(screen.getAllByText('CRM')).toHaveLength(2);
  });

  it('should_validate_before_creating_placeholder', async () => {
    const user = userEvent.setup();
    (apiRequest as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    render(<PlaceholderRegistryPage />);
    await screen.findByText('No placeholders yet');
    await user.click(screen.getAllByRole('button', { name: /\+ New Placeholder/i })[0]);
    await user.click(screen.getByRole('button', { name: 'Create Placeholder' }));
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('should_create_placeholder_successfully', async () => {
    const user = userEvent.setup();
    (apiRequest as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ datasource_id: 1, name: 'CRM', datasource_type: 'postgres', description: 'CRM DB' }])
      .mockResolvedValueOnce({ registry_id: 'p2', name: 'customer_name', generation_mode: 'manual_sql', sample_value: 'John', datasource_id: 1 });
    render(<PlaceholderRegistryPage />);
    await screen.findByText('No placeholders yet');
    await user.click(screen.getAllByRole('button', { name: /\+ New Placeholder/i })[0]);
    await user.type(screen.getByPlaceholderText('e.g. customer_name'), 'customer_name');
    await user.type(screen.getByPlaceholderText(/SELECT full_name/i), 'SELECT 1');
    await user.type(screen.getByPlaceholderText(/Click ▶ Run SQL/i), 'John');
    await user.click(screen.getByRole('button', { name: 'Create Placeholder' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', url: '/registry/placeholders' })));
    expect(screen.getByText('{{customer_name}}')).toBeInTheDocument();
  });

  it('should_fetch_sql_sample_value', async () => {
    const user = userEvent.setup();
    (apiRequest as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ datasource_id: 1, name: 'CRM', datasource_type: 'postgres', description: 'CRM DB' }])
      .mockResolvedValueOnce({ value: 'Jane Doe' });
    render(<PlaceholderRegistryPage />);
    await screen.findByText('No placeholders yet');
    await user.click(screen.getAllByRole('button', { name: /\+ New Placeholder/i })[0]);
    await user.type(screen.getByPlaceholderText(/SELECT full_name/i), 'SELECT {{customer_id}}');
    await user.click(screen.getByRole('button', { name: '▶ Run SQL' }));
    await waitFor(() => expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument());
  });
});
