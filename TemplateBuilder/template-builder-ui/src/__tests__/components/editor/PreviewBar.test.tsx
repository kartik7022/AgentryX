import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PreviewBar from '../../../components/editor/PreviewBar';

describe('PreviewBar', () => {
  it('should_change_format_device_and_refresh', async () => {
    const user = userEvent.setup();
    const onRefresh = jest.fn();
    const onFormatChange = jest.fn();
    const onDeviceChange = jest.fn();
    render(<PreviewBar onRefresh={onRefresh} isRefreshing={false} format="HTML" onFormatChange={onFormatChange} device="Desktop" onDeviceChange={onDeviceChange} />);
    await user.click(screen.getByRole('button', { name: 'PDF' }));
    await user.click(screen.getByRole('button', { name: 'Mobile' }));
    await user.click(screen.getByRole('button', { name: /Refresh Preview/i }));
    expect(onFormatChange).toHaveBeenCalledWith('PDF');
    expect(onDeviceChange).toHaveBeenCalledWith('Mobile');
    expect(onRefresh).toHaveBeenCalled();
  });
});
