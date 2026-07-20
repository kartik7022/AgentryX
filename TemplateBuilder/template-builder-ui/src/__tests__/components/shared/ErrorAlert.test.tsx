import { jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorAlert from '../../../components/shared/ErrorAlert';

describe('ErrorAlert', () => {
  it('should_render_error_message', () => {
    render(<ErrorAlert message="Failed to load templates" />);

    expect(screen.getByText('Failed to load templates')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('should_render_retry_button_when_retry_handler_is_provided', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();

    render(<ErrorAlert message="Failed to load templates" onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
