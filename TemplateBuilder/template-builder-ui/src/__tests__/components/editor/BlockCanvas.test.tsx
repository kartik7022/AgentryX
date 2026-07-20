import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BlockCanvas from '../../../components/editor/BlockCanvas';
import apiClient from '../../../../__mocks__/client';

jest.mock('uuid', () => ({ v4: () => 'uuid-123' }));
jest.mock('@dnd-kit/core', () => ({
  __esModule: true,
  DndContext: ({ children }: any) => <div>{children}</div>,
  closestCenter: jest.fn(),
  KeyboardSensor: jest.fn(),
  PointerSensor: jest.fn(),
  useSensor: jest.fn(),
  useSensors: jest.fn(() => []),
}));
jest.mock('@dnd-kit/sortable', () => ({
  __esModule: true,
  SortableContext: ({ children }: any) => <div>{children}</div>,
  sortableKeyboardCoordinates: jest.fn(),
  verticalListSortingStrategy: jest.fn(),
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: jest.fn(), transform: null, transition: null, isDragging: false }),
  arrayMove: (arr: any[], from: number, to: number) => {
    const copy = [...arr];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  },
}));
jest.mock('@dnd-kit/utilities', () => ({ __esModule: true, CSS: { Transform: { toString: () => '' } } }));

const mockGet = (apiClient as any).get as any;
const mockPost = (apiClient as any).post as any;

describe('BlockCanvas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should_add_new_text_block_from_toolbar', async () => {
    const user = userEvent.setup();
    const onBlocksChange = jest.fn();
    render(<BlockCanvas selectedBlockId={null} onSelectBlock={jest.fn()} blocks={[]} onBlocksChange={onBlocksChange} />);
    await user.click(screen.getAllByRole('button', { name: /\+ Text/i })[0]);
    expect(onBlocksChange).toHaveBeenCalled();
  });

  it('should_open_library_and_add_saved_block', async () => {
    const user = userEvent.setup();
    const onBlocksChange = jest.fn();
    mockGet.mockResolvedValue({ data: [{ block_id: 'lib-1', name: 'Saved Header', type: 'text', block_json: { block_id: 'x', type: 'text', content: 'Saved' }, tags: [], created_at: '2026-04-01T00:00:00Z' }] });
    render(<BlockCanvas selectedBlockId={null} onSelectBlock={jest.fn()} blocks={[]} onBlocksChange={onBlocksChange} />);
    await user.click(screen.getByTitle('Browse saved blocks'));
    expect(await screen.findByText('Saved Header')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /\+ Use/i }));
    expect(onBlocksChange).toHaveBeenCalled();
  });

  it('should_save_block_to_library', async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValue({ data: {} });
    render(<BlockCanvas selectedBlockId="b1" onSelectBlock={jest.fn()} blocks={[{ block_id: 'b1', type: 'text', content: 'Hello' } as any]} onBlocksChange={jest.fn()} />);
    await user.click(screen.getByTitle('Save to Library'));
    await user.type(screen.getByPlaceholderText(/Loan Offer Header/i), 'Saved Block');
    await user.click(screen.getByRole('button', { name: /Save to Library/i }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/blocks/', expect.objectContaining({ name: 'Saved Block' })));
  });
});
