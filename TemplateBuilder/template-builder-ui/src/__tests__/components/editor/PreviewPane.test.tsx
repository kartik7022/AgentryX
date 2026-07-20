import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PreviewPane from '../../../components/editor/PreviewPane';
import apiClient from '../../../../__mocks__/client';

const mockPost = (apiClient as any).post as any;
const mockGet = (apiClient as any).get as any;

describe('PreviewPane', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const fetchMock = jest.fn() as any;
    fetchMock.mockResolvedValue({ blob: async () => new Blob(['pdf']) });
    (global as any).fetch = fetchMock;
    Object.defineProperty(import.meta, 'env', { value: { VITE_API_BASE: 'http://localhost:10001/v1' }, configurable: true });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: jest.fn(() => 'blob:url') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: jest.fn() });
  });

  it('should_render_html_preview_using_backend_response', async () => {
    mockPost.mockResolvedValue({ data: { html: '<p>Rendered HTML</p>' } });
    render(<PreviewPane blocks={[]} placeholders={[]} device="Desktop" format="HTML" templateId="t1" />);
    expect(await screen.findByTitle('Template Preview')).toBeInTheDocument();
  });

  it('should_show_docx_message_for_docx_format', () => {
    render(<PreviewPane blocks={[]} placeholders={[]} device="Desktop" format="DOCX" templateId="t1" />);
    expect(screen.getByText(/DOCX Preview not available/i)).toBeInTheDocument();
  });
});
