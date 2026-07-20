import { jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppLayout from '../../../components/layout/AppLayout';

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/templates']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/templates" element={<div>Outlet Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('AppLayout', () => {
  it('should_render_outlet_content_and_sidebar', () => {
    const { container } = renderLayout();
    expect(screen.getByText('Outlet Content')).toBeInTheDocument();
    expect(container.querySelector('.app-sidebar')).toBeInTheDocument();
  });

  it('should_open_sidebar_when_menu_button_is_clicked', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(container.querySelector('.app-sidebar.is-open')).toBeInTheDocument();
  });

  it('should_close_sidebar_on_large_screen_resize', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    fireEvent(window, new Event('resize'));
    expect(container.querySelector('.app-sidebar.is-open')).not.toBeInTheDocument();
  });
});
