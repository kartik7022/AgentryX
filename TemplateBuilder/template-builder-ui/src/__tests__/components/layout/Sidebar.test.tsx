import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../../../components/layout/Sidebar';

function renderSidebar(props?: { open?: boolean; onClose?: () => void; route?: string }) {
  const { open = false, onClose, route = '/templates' } = props ?? {};

  return render(
    <MemoryRouter initialEntries={[route]}>
      <Sidebar open={open} onClose={onClose} />
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should_render_all_navigation_links', () => {
    renderSidebar({ open: true });

    expect(screen.getByRole('link', { name: /Templates/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Placeholder Registry/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Documents/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Marketplace/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Audit Log/i })).toBeInTheDocument();
  });

  it('should_store_default_user_in_local_storage_on_render', () => {
    renderSidebar();

    expect(localStorage.getItem('tb_user_id')).toBe('dev_user');
  });

  it('should_call_onClose_when_close_button_is_clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    renderSidebar({ open: true, onClose });

    await user.click(screen.getByRole('button', { name: 'Close navigation' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should_call_onClose_when_navigation_link_is_clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    renderSidebar({ open: true, onClose });

    await user.click(screen.getByRole('link', { name: /Templates/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should_mark_current_route_as_active', () => {
    renderSidebar({ route: '/documents' });

    expect(screen.getByRole('link', { name: /Documents/i })).toHaveClass('is-active');
  });
});
