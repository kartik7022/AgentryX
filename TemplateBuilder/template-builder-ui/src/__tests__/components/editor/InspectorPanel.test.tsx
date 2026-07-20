import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InspectorPanel from '../../../components/editor/InspectorPanel';

describe('InspectorPanel', () => {
  const block = { block_id: 'b1', type: 'text', content: 'Hello {{unknown_token}}', fontSize: 14, align: 'left' } as any;
  const placeholders = [{ registry_id: 'p1', name: 'customer_name' }] as any;

  it('should_show_no_selection_state', () => {
    render(<InspectorPanel blocks={[]} selectedBlockId={null} placeholders={[]} onBlockChange={jest.fn()} />);
    expect(screen.getByText(/Click a block on the canvas/i)).toBeInTheDocument();
  });

  it('should_show_unknown_tokens_and_allow_font_size_change', async () => {
    const user = userEvent.setup();
    const onBlockChange = jest.fn();
    render(<InspectorPanel blocks={[block]} selectedBlockId="b1" placeholders={placeholders} onBlockChange={onBlockChange} />);
    expect(screen.getByText('{{unknown_token}}')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+' }));
    expect(onBlockChange).toHaveBeenCalledWith('b1', { fontSize: 15 });
  });
});
