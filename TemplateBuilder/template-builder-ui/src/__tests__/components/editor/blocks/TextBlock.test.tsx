import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TextBlock from '../../../../components/editor/blocks/TextBlock';

describe('TextBlock', () => {
  it('should_call_on_select_and_on_change', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const onSelect = jest.fn();
    const { container } = render(<TextBlock content="Hello {{name}}" onChange={onChange} onSelect={onSelect} knownTokens={new Set(['name'])} />);
    const editable = container.querySelector('[contenteditable="true"]') as HTMLElement;
    await user.click(editable);
    editable.innerText = 'Updated';
    editable.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onSelect).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith('Updated');
  });
});
