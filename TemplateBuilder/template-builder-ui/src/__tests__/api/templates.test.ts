// src/__tests__/api/templates.test.ts
import {
  listTemplates, getTemplate, createTemplate, updateTemplate,
  publishTemplate, deleteTemplate, bindPlaceholder, listTemplateVersions,
} from '../../api/templates';
import { apiRequest } from '../../api/client';

jest.mock('../../api/client');

const mockTemplate = {
  template_id: 'uuid-1',
  name: 'Monthly Statement',
  status: 'draft',
  output_target: 'pdf',
  industry: 'banking',
  description: 'Test template',
  tags: ['banking'],
  layout_json: { blocks: [] },
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
  created_by: 'dev_user',
};

describe('templates API', () => {

  beforeEach(() => jest.clearAllMocks());

  // ── listTemplates ──────────────────────────────────────────────────
  describe('listTemplates', () => {
    test('fetches all templates', async () => {
      (apiRequest as jest.Mock).mockResolvedValue([mockTemplate]);
      const result = await listTemplates();
      expect(result).toEqual([mockTemplate]);
      expect(apiRequest).toHaveBeenCalledWith({ method: 'GET', url: '/templates', params: undefined });
    });

    test('passes filter params correctly', async () => {
      (apiRequest as jest.Mock).mockResolvedValue([mockTemplate]);
      await listTemplates({ status_filter: 'published', output_target: 'pdf', industry: 'banking', search: 'statement' });
      expect(apiRequest).toHaveBeenCalledWith({
        method: 'GET', url: '/templates',
        params: { status_filter: 'published', output_target: 'pdf', industry: 'banking', search: 'statement' },
      });
    });

    test('returns empty array on error', async () => {
      (apiRequest as jest.Mock).mockRejectedValue(new Error('Server Error'));
      await expect(listTemplates()).rejects.toThrow('Server Error');
    });
  });

  // ── getTemplate ────────────────────────────────────────────────────
  describe('getTemplate', () => {
    test('fetches single template by ID', async () => {
      (apiRequest as jest.Mock).mockResolvedValue(mockTemplate);
      const result = await getTemplate('uuid-1');
      expect(result).toEqual(mockTemplate);
      expect(apiRequest).toHaveBeenCalledWith({ method: 'GET', url: '/templates/uuid-1' });
    });

    test('throws on invalid ID', async () => {
      (apiRequest as jest.Mock).mockRejectedValue(new Error('Not found'));
      await expect(getTemplate('invalid-id')).rejects.toThrow('Not found');
    });
  });

  // ── createTemplate ─────────────────────────────────────────────────
  describe('createTemplate', () => {
    test('creates template with correct data', async () => {
      (apiRequest as jest.Mock).mockResolvedValue(mockTemplate);
      const result = await createTemplate({ name: 'Monthly Statement', output_target: 'pdf', industry: 'banking' });
      expect(result).toEqual(mockTemplate);
      expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({
        method: 'POST',
        url: '/templates',
        data: expect.objectContaining({
          name: 'Monthly Statement',
          output_target: 'pdf',
          layout_json: { blocks: [] },
        }),
      }));
    });

    test('uses default empty tags if not provided', async () => {
      (apiRequest as jest.Mock).mockResolvedValue(mockTemplate);
      await createTemplate({ name: 'Test', output_target: 'html' });
      expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ tags: [] }),
      }));
    });

    test('throws on API error', async () => {
      (apiRequest as jest.Mock).mockRejectedValue(new Error('Name required'));
      await expect(createTemplate({ name: '', output_target: 'pdf' })).rejects.toThrow('Name required');
    });
  });

  // ── updateTemplate ─────────────────────────────────────────────────
  describe('updateTemplate', () => {
    test('updates template correctly', async () => {
      (apiRequest as jest.Mock).mockResolvedValue({ ...mockTemplate, name: 'Updated Name' });
      const result = await updateTemplate('uuid-1', { name: 'Updated Name', output_target: 'pdf' });
      expect(result.name).toBe('Updated Name');
      expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({
        method: 'PUT', url: '/templates/uuid-1',
      }));
    });
  });

  // ── publishTemplate ────────────────────────────────────────────────
  describe('publishTemplate', () => {
    test('publishes template', async () => {
      (apiRequest as jest.Mock).mockResolvedValue({ version: 1, change_summary: 'First publish' });
      const result = await publishTemplate('uuid-1', 'First publish');
      expect(result).toEqual({ version: 1, change_summary: 'First publish' });
      expect(apiRequest).toHaveBeenCalledWith({
        method: 'POST', url: '/templates/uuid-1/publish',
        data: { change_summary: 'First publish' },
      });
    });
  });

  // ── deleteTemplate ─────────────────────────────────────────────────
  describe('deleteTemplate', () => {
    test('deletes template by ID', async () => {
      (apiRequest as jest.Mock).mockResolvedValue(undefined);
      await deleteTemplate('uuid-1');
      expect(apiRequest).toHaveBeenCalledWith({ method: 'DELETE', url: '/templates/uuid-1' });
    });

    test('throws on delete error', async () => {
      (apiRequest as jest.Mock).mockRejectedValue(new Error('Not found'));
      await expect(deleteTemplate('bad-id')).rejects.toThrow('Not found');
    });
  });

  // ── bindPlaceholder ────────────────────────────────────────────────
  describe('bindPlaceholder', () => {
    test('binds placeholder to template', async () => {
      (apiRequest as jest.Mock).mockResolvedValue(undefined);
      await bindPlaceholder('template-uuid', 'placeholder-uuid', 'John Valid');
      expect(apiRequest).toHaveBeenCalledWith({
        method: 'POST', url: '/templates/template-uuid/placeholders',
        data: { registry_id: 'placeholder-uuid', override_sample_value: 'John Valid' },
      });
    });

    test('uses null if no sample value provided', async () => {
      (apiRequest as jest.Mock).mockResolvedValue(undefined);
      await bindPlaceholder('template-uuid', 'placeholder-uuid');
      expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ override_sample_value: null }),
      }));
    });
  });

  // ── listTemplateVersions ───────────────────────────────────────────
  describe('listTemplateVersions', () => {
    test('returns versions list', async () => {
      (apiRequest as jest.Mock).mockResolvedValue([{ version: 1 }, { version: 2 }]);
      const result = await listTemplateVersions('uuid-1');
      expect(result).toHaveLength(2);
    });

    test('returns empty array on 404', async () => {
      (apiRequest as jest.Mock).mockRejectedValue(new Error('Not found'));
      const result = await listTemplateVersions('uuid-1');
      expect(result).toEqual([]);
    });
  });

});