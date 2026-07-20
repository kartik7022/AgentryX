import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VersionHistoryPanel from '../../../components/editor/VersionHistoryPanel';
import { apiRequest } from '../../../../__mocks__/client';

const versions = [
  {
    version_id: 'v1',
    version_number: 1,
    created_at: '2026-04-01T00:00:00Z',
    change_summary: 'Initial',
    layout_json: { blocks: [{ block_id: 'b1', type: 'text', content: 'Hello' }] },
    output_target: 'pdf',
  },
  {
    version_id: 'v2',
    version_number: 2,
    created_at: '2026-04-02T00:00:00Z',
    change_summary: 'Added token',
    layout_json: { blocks: [{ block_id: 'b1', type: 'text', content: 'Hello {{name}}' }] },
    output_target: 'pdf',
  },
] as any;

describe('VersionHistoryPanel', () => {
  function getRestoreButtons() {
    return screen.getAllByRole('button').filter((button) =>
      /↩|â†©|Ã¢â€ Â©/.test(button.textContent ?? '')
    );
  }

  function getCompareButtons() {
    return screen.getAllByRole('button').filter((button) =>
      /↔|â†”|Ã¢â€ â€|Base/.test(button.textContent ?? '')
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('should_load_versions_and_restore_selected_version', async () => {
    const user = userEvent.setup();
    const onRestore = jest.fn();
    (apiRequest as any).mockResolvedValueOnce(versions);

    render(<VersionHistoryPanel templateId="t1" onClose={jest.fn()} onRestore={onRestore} />);

    await waitFor(() => expect(getRestoreButtons()).toHaveLength(2));
    await user.click(getRestoreButtons()[0]);

    expect(onRestore).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ block_id: 'b1', content: 'Hello' }),
      ])
    );
  });

  it('should_compare_versions_and_show_diff', async () => {
    const user = userEvent.setup();
    (apiRequest as any).mockResolvedValueOnce(versions);

    render(<VersionHistoryPanel templateId="t1" onClose={jest.fn()} />);

    await user.click(await screen.findByRole('button', { name: /Compare Versions/i }));
    await waitFor(() => expect(getCompareButtons()).toHaveLength(2));
    await user.click(getCompareButtons()[0]);
    await screen.findByText(/selected as base/i);
    await user.click(getCompareButtons()[1]);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Exit Compare/i })).toBeInTheDocument();
      expect(screen.getByText(/\{\{name\}\} added/i)).toBeInTheDocument();
      expect(screen.getByText(/After:\s+Hello \{\{name\}\}/i)).toBeInTheDocument();
    });
  });
});
