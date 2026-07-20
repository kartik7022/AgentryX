// src/__tests__/api/documents.test.ts
import {
  generateDocument, getJobStatus,
  saveJobLocally, listLocalJobs, clearLocalJobs,
} from '../../api/documents';
import { apiRequest } from '../../api/client';

jest.mock('../../api/client');

const mockJobStatus = {
  job_id: 'job-uuid-1',
  status: 'success',
  output_target: 'pdf',
  result_location: '/app/results/job-uuid-1.pdf',
  logs: null,
  created_at: '2026-04-26T10:00:00Z',
  updated_at: '2026-04-26T10:01:00Z',
};

describe('documents API', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  // ── generateDocument ───────────────────────────────────────────────
  describe('generateDocument', () => {
    test('generates document and returns job_id', async () => {
      (apiRequest as jest.Mock).mockResolvedValue({ status: 'success', job_id: 'job-uuid-1' });
      const result = await generateDocument({
        template_id: 'template-uuid-1',
        output_target: 'pdf',
        locale: 'en',
        runtime_params: { customer_id: '1' },
      });
      expect(result.job_id).toBe('job-uuid-1');
      expect(result.status).toBe('success');
    });

    test('calls correct endpoint with all params', async () => {
      (apiRequest as jest.Mock).mockResolvedValue({ status: 'success', job_id: 'job-uuid-1' });
      await generateDocument({
        template_id: 'template-uuid-1',
        output_target: 'pdf',
        locale: 'en',
        runtime_params: { customer_id: '2', month: 'March 2026' },
      });
      expect(apiRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/documents/generate',
        data: {
          template_id: 'template-uuid-1',
          output_target: 'pdf',
          locale: 'en',
          runtime_params: { customer_id: '2', month: 'March 2026' },
        },
      });
    });

    test('works without runtime_params', async () => {
      (apiRequest as jest.Mock).mockResolvedValue({ status: 'success', job_id: 'job-uuid-2' });
      const result = await generateDocument({ template_id: 'uuid-1', output_target: 'html' });
      expect(result.job_id).toBe('job-uuid-2');
    });

    test('throws on API error', async () => {
      (apiRequest as jest.Mock).mockRejectedValue(new Error('Template not found'));
      await expect(generateDocument({ template_id: 'bad-id', output_target: 'pdf' })).rejects.toThrow('Template not found');
    });

    test('generates for all output formats', async () => {
      for (const format of ['pdf', 'docx', 'html', 'xlsx', 'md']) {
        (apiRequest as jest.Mock).mockResolvedValue({ status: 'success', job_id: `job-${format}` });
        const result = await generateDocument({ template_id: 'uuid-1', output_target: format });
        expect(result.job_id).toBe(`job-${format}`);
      }
    });
  });

  // ── getJobStatus ───────────────────────────────────────────────────
  describe('getJobStatus', () => {
    test('returns job status', async () => {
      (apiRequest as jest.Mock).mockResolvedValue(mockJobStatus);
      const result = await getJobStatus('job-uuid-1');
      expect(result.job_id).toBe('job-uuid-1');
      expect(result.status).toBe('success');
      expect(result.output_target).toBe('pdf');
    });

    test('calls correct endpoint', async () => {
      (apiRequest as jest.Mock).mockResolvedValue(mockJobStatus);
      await getJobStatus('job-uuid-1');
      expect(apiRequest).toHaveBeenCalledWith({ method: 'GET', url: '/documents/jobs/job-uuid-1' });
    });

    test('returns running status', async () => {
      (apiRequest as jest.Mock).mockResolvedValue({ ...mockJobStatus, status: 'running' });
      const result = await getJobStatus('job-uuid-1');
      expect(result.status).toBe('running');
    });

    test('returns error status with logs', async () => {
      (apiRequest as jest.Mock).mockResolvedValue({ ...mockJobStatus, status: 'error', logs: 'Template not found' });
      const result = await getJobStatus('job-uuid-1');
      expect(result.status).toBe('error');
      expect(result.logs).toBe('Template not found');
    });
  });

  // ── saveJobLocally ─────────────────────────────────────────────────
  describe('saveJobLocally', () => {
    test('saves job to localStorage', () => {
      saveJobLocally({
        job_id: 'job-1', template_id: 'uuid-1', template_name: 'Monthly Statement',
        output_target: 'pdf', status: 'success', runtime_params: { customer_id: '1' },
        created_at: '2026-04-26T10:00:00Z',
      });
      const jobs = listLocalJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].job_id).toBe('job-1');
    });

    test('saves multiple jobs newest first', () => {
      saveJobLocally({ job_id: 'job-1', template_id: 'uuid-1', template_name: 'T1', output_target: 'pdf', status: 'success', runtime_params: {}, created_at: '2026-04-26T10:00:00Z' });
      saveJobLocally({ job_id: 'job-2', template_id: 'uuid-1', template_name: 'T1', output_target: 'pdf', status: 'success', runtime_params: {}, created_at: '2026-04-26T11:00:00Z' });
      const jobs = listLocalJobs();
      expect(jobs[0].job_id).toBe('job-2');
      expect(jobs[1].job_id).toBe('job-1');
    });

    test('saves runtime_params correctly', () => {
      saveJobLocally({
        job_id: 'job-1', template_id: 'uuid-1', template_name: 'T1',
        output_target: 'pdf', status: 'success',
        runtime_params: { customer_id: '2', month: 'March 2026' },
        created_at: '2026-04-26T10:00:00Z',
      });
      const jobs = listLocalJobs();
      expect(jobs[0].runtime_params).toEqual({ customer_id: '2', month: 'March 2026' });
    });
  });

  // ── listLocalJobs ──────────────────────────────────────────────────
  describe('listLocalJobs', () => {
    test('returns empty array when no jobs', () => {
      expect(listLocalJobs()).toEqual([]);
    });

    test('returns saved jobs', () => {
      saveJobLocally({ job_id: 'job-1', template_id: 'uuid-1', template_name: 'T1', output_target: 'pdf', status: 'success', runtime_params: {}, created_at: '2026-04-26T10:00:00Z' });
      expect(listLocalJobs()).toHaveLength(1);
    });
  });

  // ── clearLocalJobs ─────────────────────────────────────────────────
  describe('clearLocalJobs', () => {
    test('clears all jobs from localStorage', () => {
      saveJobLocally({ job_id: 'job-1', template_id: 'uuid-1', template_name: 'T1', output_target: 'pdf', status: 'success', runtime_params: {}, created_at: '2026-04-26T10:00:00Z' });
      clearLocalJobs();
      expect(listLocalJobs()).toEqual([]);
    });
  });

});