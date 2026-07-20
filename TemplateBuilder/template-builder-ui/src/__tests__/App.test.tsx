import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { apiRequest } from '../../__mocks__/client';

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should_redirect_root_route_to_templates_page', async () => {
    (apiRequest as any).mockResolvedValueOnce([]);
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(await screen.findByText(/Build, manage and publish document templates/i)).toBeInTheDocument();
  });

  it('should_render_marketplace_route', async () => {
    (apiRequest as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    window.history.pushState({}, '', '/marketplace');

    render(<App />);

    expect(await screen.findByText(/Marketplace is empty/i)).toBeInTheDocument();
  });
});
