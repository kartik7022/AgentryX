import { jest } from '@jest/globals';

const mockRender = jest.fn();
const mockCreateRoot = jest.fn(() => ({
  render: mockRender,
}));

jest.unstable_mockModule('react-dom/client', () => ({
  __esModule: true,
  default: {
    createRoot: mockCreateRoot,
  },
  createRoot: mockCreateRoot,
}));

describe('main bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('should_mount_app_into_root_element', async () => {
    await import('../main.tsx');

    expect(mockCreateRoot).toHaveBeenCalledWith(document.getElementById('root'));
    expect(mockRender).toHaveBeenCalledTimes(1);
  });
});
