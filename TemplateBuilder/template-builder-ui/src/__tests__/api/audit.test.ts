// src/__tests__/api/audit.test.ts
import { getJobStatus } from '../../api/audit';
import { apiRequest } from '../../api/client';

jest.mock('../../api/client');

const mockRenderJob = {
  job_id: 'job-uuid-1',
  template_id: 'template-uuid-1',
  status: 'success',
  output_target: 'pdf',
  result_location: '/app/results/job-uuid-1.pdf',
  logs: null,
  created_at: '2026-04-26T10:00:00Z',
  updated_at: '2026-04-26T10:01:00Z',
};

describe('audit API', () => {

  beforeEach(() => jest.clearAllMocks());

  describe('getJobStatus', () => {
    test('fetches job status by ID', async () => {
      (apiRequest as jest.Mock).mockResolvedValue(mockRenderJob);
      const result = await getJobStatus('job-uuid-1');
      expect(result.job_id).toBe('job-uuid-1');
      expect(result.status).toBe('success');
    });

    test('calls correct endpoint', async () => {
      (apiRequest as jest.Mock).mockResolvedValue(mockRenderJob);
      await getJobStatus('job-uuid-1');
      expect(apiRequest).toHaveBeenCalledWith({ method: 'GET', url: '/documents/jobs/job-uuid-1' });
    });

    test('returns running status', async () => {
      (apiRequest as jest.Mock).mockResolvedValue({ ...mockRenderJob, status: 'running' });
      const result = await getJobStatus('job-uuid-1');
      expect(result.status).toBe('running');
    });

    test('returns error status with logs', async () => {
      (apiRequest as jest.Mock).mockResolvedValue({ ...mockRenderJob, status: 'error', logs: 'SQL failed' });
      const result = await getJobStatus('job-uuid-1');
      expect(result.status).toBe('error');
      expect(result.logs).toBe('SQL failed');
    });

    test('throws on invalid job ID', async () => {
      (apiRequest as jest.Mock).mockRejectedValue(new Error('Job not found'));
      await expect(getJobStatus('bad-id')).rejects.toThrow('Job not found');
    });
  });

});