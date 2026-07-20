import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlaceholderPalette, { DRAG_TOKEN_KEY } from '../../../components/editor/PlaceholderPalette';

describe('PlaceholderPalette', () => {
  const placeholders = [
    { registry_id: 'p1', name: 'customer_name', sample_value: 'John', category: 'customer', cardinality: 'scalar' },
    { registry_id: 'p2', name: 'loan_items', sample_value: '["A","B"]', category: 'loan', cardinality: 'list' },
  ] as any;

  it('should_insert_placeholder_on_click', async () => {
    const user = userEvent.setup();
    const onInsertToken = jest.fn();
    render(<PlaceholderPalette placeholders={placeholders} selectedBlockId="b1" onInsertToken={onInsertToken} blocks={[]} />);
    await user.click(screen.getByText('{{customer_name}}'));
    expect(onInsertToken).toHaveBeenCalledWith('customer_name');
  });

  it('should_switch_to_template_tab_and_show_empty_hint', async () => {
    const user = userEvent.setup();
    render(<PlaceholderPalette placeholders={placeholders} selectedBlockId="b1" onInsertToken={jest.fn()} blocks={[]} />);
    await user.click(screen.getByRole('button', { name: /Template/i }));
    expect(screen.getByText(/No placeholders used in this template yet/i)).toBeInTheDocument();
  });

  it('should_set_drag_token_data_on_drag_start', () => {
    render(<PlaceholderPalette placeholders={placeholders} selectedBlockId="b1" onInsertToken={jest.fn()} blocks={[]} />);
    const chip = screen.getByText('{{customer_name}}').closest('div')!;
    const setData = jest.fn();
    fireEvent.dragStart(chip, { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith(DRAG_TOKEN_KEY, 'customer_name');
  });
});
