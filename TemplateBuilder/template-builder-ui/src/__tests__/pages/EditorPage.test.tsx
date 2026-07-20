import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EditorPage from '../../pages/EditorPage';
import { apiRequest } from '../../../__mocks__/client';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/templates/t1']}>
      <Routes>
        <Route path="/templates/:id" element={<EditorPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EditorPage', () => {
  function mockEditorRequests() {
    (apiRequest as any).mockImplementation(({ url, method }: { url: string; method: string }) => {
      if (method === 'GET' && url === '/templates/t1') {
        return Promise.resolve({
          template_id: 't1',
          name: 'Loan Template',
          output_target: 'pdf',
          status: 'draft',
          layout_json: { blocks: [{ block_id: 'b1', type: 'text', content: 'Hello ' }] },
        });
      }
      if (method === 'GET' && url === '/registry/placeholders') {
        return Promise.resolve([{ registry_id: 'p1', name: 'customer_name', sample_value: 'John' }]);
      }
      if (method === 'PUT' && url === '/templates/t1') {
        return Promise.resolve({
          template_id: 't1',
          name: 'Loan Template',
          output_target: 'pdf',
          status: 'draft',
          layout_json: { blocks: [{ block_id: 'b1', type: 'text', content: 'Hello edited' }] },
        });
      }
      if (method === 'POST' && url === '/templates/t1/publish') {
        return Promise.resolve({});
      }
      if (method === 'POST' && url === '/templates/t1/placeholders') {
        return Promise.resolve(undefined);
      }
      return Promise.resolve([]);
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'prompt').mockReturnValue('Summary');
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('should_render_loaded_editor_content', async () => {
    mockEditorRequests();
    renderPage();
    expect(await screen.findByText('Hello')).toBeInTheDocument();
    expect(screen.getByText(/Placeholders/i)).toBeInTheDocument();
  });

  it('should_save_template_changes', async () => {
    const user = userEvent.setup();
    mockEditorRequests();
    renderPage();
    const editor = await screen.findByText('Hello');
    await user.click(editor);
    editor.textContent = 'Hello edited';
    fireEvent.input(editor);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Save draft/i })).toBeEnabled()
    );
    await user.click(screen.getByRole('button', { name: /Save draft/i }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'PUT', url: '/templates/t1' })));
  });

  it('should_publish_template', async () => {
    const user = userEvent.setup();
    mockEditorRequests();
    renderPage();
    await screen.findByText('Hello');
    await user.click(screen.getByRole('button', { name: /Publish/i }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', url: '/templates/t1/publish' })));
  });

  it('should_insert_placeholder_token_into_selected_text_block', async () => {
    const user = userEvent.setup();
    mockEditorRequests();
    renderPage();
    const editor = await screen.findByText('Hello');
    await user.click(editor);
    await user.click(screen.getByText(/\{\{customer_name\}\}/i));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', url: '/templates/t1/placeholders' })));
  });
});
