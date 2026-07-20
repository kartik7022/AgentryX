import { render, screen } from '@testing-library/react';
import LoadingSpinner from '../../../components/shared/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('should_render_default_loading_message', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should_render_custom_loading_message', () => {
    render(<LoadingSpinner message="Loading templates..." />);
    expect(screen.getByText('Loading templates...')).toBeInTheDocument();
  });
});
