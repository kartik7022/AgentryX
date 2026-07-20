import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SectionBlock from '../../../../components/editor/blocks/SectionBlock';

describe('SectionBlock', () => {
  it('should_call_select_and_change_handlers', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    const onChange = jest.fn();
    const { container } = render(<SectionBlock content="Section Title" onChange={onChange} isSelected={true} onSelect={onSelect} />);
    await user.click(container.firstChild as Element);
    await user.clear(screen.getByDisplayValue('Section Title'));
    await user.type(screen.getByPlaceholderText('Section Title'), 'New Title');
    expect(onSelect).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalled();
  });
});
