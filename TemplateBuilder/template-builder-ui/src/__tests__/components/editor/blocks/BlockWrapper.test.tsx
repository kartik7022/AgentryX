import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BlockWrapper from '../../../../components/editor/blocks/BlockWrapper';

describe('BlockWrapper', () => {
  it('should_show_actions_for_selected_block', async () => {
    const user = userEvent.setup();
    const onDelete = jest.fn();
    render(
      <BlockWrapper blockId="block-1" type="text" isSelected={true} isFirst={false} isLast={false} onSelect={jest.fn()} onDelete={onDelete} onMoveUp={jest.fn()} onMoveDown={jest.fn()}>
        <div>Child</div>
      </BlockWrapper>
    );
    await user.click(screen.getByTitle('Delete block'));
    expect(onDelete).toHaveBeenCalled();
  });
});
