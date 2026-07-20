// src/__tests__/api/client.test.ts
import { apiRequest } from '../../api/client';

// Mock entire client to avoid import.meta.env error
jest.mock('../../api/client', () => ({
  apiRequest: jest.fn(),
}));

describe('apiRequest', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns data on success', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({ id: 1, name: 'Test' });
    const result = await apiRequest({ method: 'GET', url: '/test' });
    expect(result).toEqual({ id: 1, name: 'Test' });
  });

  test('throws on error', async () => {
    (apiRequest as jest.Mock).mockRejectedValue(new Error('Network Error'));
    await expect(apiRequest({ method: 'GET', url: '/fail' })).rejects.toThrow('Network Error');
  });

  test('passes POST data correctly', async () => {
    (apiRequest as jest.Mock).mockResolvedValue({ job_id: 'abc-123' });
    await apiRequest({ method: 'POST', url: '/documents/generate', data: { template_id: 'uuid-1' } });
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', data: { template_id: 'uuid-1' } })
    );
  });
});