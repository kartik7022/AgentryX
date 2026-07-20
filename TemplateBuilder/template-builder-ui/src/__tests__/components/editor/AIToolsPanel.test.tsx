import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AIToolsPanel from '../../../components/editor/AIToolsPanel';
import apiClient from '../../../../__mocks__/client';

const mockPost = (apiClient as any).post as any;

describe('AIToolsPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: jest.fn() },
    });
  });

  it('should_generate_content_and_apply_result_to_selected_block', async () => {
    const user = userEvent.setup();
    const onBlocksChange = jest.fn();
    mockPost.mockResolvedValue({ data: { result: 'Generated text', error: '' } });
    render(<AIToolsPanel blocks={[{ block_id: 'b1', type: 'text', content: 'Old text' } as any]} selectedBlockId="b1" onBlocksChange={onBlocksChange} onClose={jest.fn()} />);
    await user.type(screen.getByPlaceholderText(/loan closure letter/i), 'Create a letter');
    await user.click(screen.getByRole('button', { name: /Generate Content/i }));
    expect(await screen.findByText('Generated text')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Apply to block/i }));
    expect(onBlocksChange).toHaveBeenCalled();
  });

  it('should_show_config_error_when_ai_key_is_missing', async () => {
    const user = userEvent.setup();
    mockPost.mockRejectedValue(new Error('COHERE_API_KEY missing'));
    render(<AIToolsPanel blocks={[]} selectedBlockId={null} onBlocksChange={jest.fn()} onClose={jest.fn()} />);
    await user.type(screen.getByPlaceholderText(/loan closure letter/i), 'Create a letter');
    await user.click(screen.getByRole('button', { name: /Generate Content/i }));
    await waitFor(() => expect(screen.getByText(/AI not configured/i)).toBeInTheDocument());
  });
});
