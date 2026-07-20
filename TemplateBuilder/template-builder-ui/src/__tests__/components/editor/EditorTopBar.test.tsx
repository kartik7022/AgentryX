import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import EditorTopBar from '../../../components/editor/EditorTopBar';

describe('EditorTopBar', () => {
  const baseProps = {
    template: { template_id: 't1', name: 'Loan Template', status: 'draft', output_target: 'pdf' } as any,
    isSaving: false,
    isDirty: true,
    onSave: jest.fn(),
    onPublish: jest.fn(),
    onMakeDraft: jest.fn(),
    onNameChange: jest.fn(),
    onTargetChange: jest.fn(),
    onGenerate: jest.fn(),
    onViewVersions: jest.fn(),
    onViewTests: jest.fn(),
    onAITools: jest.fn(),
  };

  it('should_call_save_and_generate_actions', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><EditorTopBar {...baseProps} /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await user.click(screen.getByRole('button', { name: /Generate/i }));
    expect(baseProps.onSave).toHaveBeenCalled();
    expect(baseProps.onGenerate).toHaveBeenCalled();
  });

  it('should_show_edit_template_for_published_template', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><EditorTopBar {...baseProps} template={{ ...baseProps.template, status: 'published' }} /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /Edit Template/i }));
    expect(baseProps.onMakeDraft).toHaveBeenCalled();
  });
});
