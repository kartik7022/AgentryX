import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageBlock from '../../../../components/editor/blocks/ImageBlock';

class MockFileReader {
  result: string | null = 'data:image/png;base64,abc';
  onload: ((e: any) => void) | null = null;
  readAsDataURL() {
    this.onload?.({ target: { result: this.result } });
  }
}

describe('ImageBlock', () => {
  beforeEach(() => {
    (global as any).FileReader = MockFileReader;
    jest.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('should_update_url_input', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<ImageBlock src="" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Image URL/i }));
    await user.type(screen.getByPlaceholderText(/https:\/\/example.com\/image.jpg/i), 'https://img.test/x.png');
    expect(onChange).toHaveBeenCalled();
  });

  it('should_upload_image_file', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const { container } = render(<ImageBlock src="" onChange={onChange} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['img'], 'test.png', { type: 'image/png' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('data:image/png;base64,abc'));
  });
});
