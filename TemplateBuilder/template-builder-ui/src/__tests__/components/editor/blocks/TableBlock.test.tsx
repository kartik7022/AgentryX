import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TableBlock from '../../../../components/editor/blocks/TableBlock';

describe('TableBlock', () => {
  it('should_add_column_and_row', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<TableBlock columns={[{ header: 'Col1', binding: '{{name}}' }]} rows={[['']]} repeat="" onChange={onChange} isSelected={true} />);
    await user.click(screen.getByRole('button', { name: /\+ Col/i }));
    await user.click(screen.getByRole('button', { name: /\+ Add Row/i }));
    expect(onChange).toHaveBeenCalled();
  });

  it('should_handle_binding_drop', () => {
    const onChange = jest.fn();
    render(<TableBlock columns={[{ header: 'Col1', binding: '{{name}}' }]} rows={[['']]} repeat="" onChange={onChange} isSelected={true} />);
    const input = screen.getByDisplayValue('{{name}}');
    fireEvent.drop(input, { dataTransfer: { getData: () => 'customer_name' } });
    expect(onChange).toHaveBeenCalled();
  });
});
