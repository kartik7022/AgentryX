import { render, screen } from '@testing-library/react';
import StatusBadge from '../../../components/shared/StatusBadge';

describe('StatusBadge', () => {
  it('should_render_draft_status_with_capitalized_text_style', () => {
    render(<StatusBadge status="draft" />);

    const badge = screen.getByText('draft');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({
      backgroundColor: 'rgb(254, 249, 195)',
      color: 'rgb(133, 77, 14)',
    });
  });

  it('should_render_published_status_with_published_styles', () => {
    render(<StatusBadge status="published" />);

    expect(screen.getByText('published')).toHaveStyle({
      backgroundColor: 'rgb(220, 252, 231)',
      color: 'rgb(22, 101, 52)',
    });
  });

  it('should_fallback_to_archived_styles_for_unknown_status', () => {
    render(<StatusBadge status="processing" />);

    expect(screen.getByText('processing')).toHaveStyle({
      backgroundColor: 'rgb(241, 245, 249)',
      color: 'rgb(71, 85, 105)',
    });
  });
});
