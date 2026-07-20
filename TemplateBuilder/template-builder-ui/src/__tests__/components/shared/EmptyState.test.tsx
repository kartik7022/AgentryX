import { render, screen } from '@testing-library/react';
import EmptyState from '../../../components/shared/EmptyState';

describe('EmptyState', () => {
  it('should_render_title_and_optional_description', () => {
    render(
      <EmptyState
        title="No templates yet"
        description="Create your first template to get started."
      />
    );

    expect(screen.getByRole('heading', { name: 'No templates yet' })).toBeInTheDocument();
    expect(
      screen.getByText('Create your first template to get started.')
    ).toBeInTheDocument();
  });

  it('should_not_render_description_when_not_provided', () => {
    render(<EmptyState title="No templates yet" />);

    expect(screen.getByRole('heading', { name: 'No templates yet' })).toBeInTheDocument();
    expect(
      screen.queryByText('Create your first template to get started.')
    ).not.toBeInTheDocument();
  });

  it('should_render_custom_action_when_provided', () => {
    render(
      <EmptyState
        title="No templates yet"
        action={<button type="button">Create template</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'Create template' })).toBeInTheDocument();
  });
});
