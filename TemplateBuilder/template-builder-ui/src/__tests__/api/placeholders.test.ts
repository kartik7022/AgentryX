// src/__tests__/api/placeholders.test.ts
import { listPlaceholders, createPlaceholder, getPlaceholderById, updatePlaceholder } from '../../api/placeholders';
import { apiRequest } from '../../api/client';

jest.mock('../../api/client');

const mockPlaceholder = {
  registry_id: 'ph-uuid-1',
  name: 'customer_name',
  generation_mode: 'manual_sql',
  sql_text: 'SELECT full_name FROM crm.customers WHERE customer_id = {{customer_id}}',
  sample_value: 'John Valid',
  value_type: 'string',
  cardinality: 'scalar',
  datasource_id: 1,
  is_active: true,
  created_at: '2026-04-01T00:00:00Z',
};

describe('placeholders API', () => {

  beforeEach(() => jest.clearAllMocks());

  // ── listPlaceholders ───────────────────────────────────────────────
  describe('listPlaceholders', () => {
    test('fetches all placeholders', async () => {
      (apiRequest as jest.Mock).mockResolvedValue([mockPlaceholder]);
      const result = await listPlaceholders();
      expect(result).toEqual([mockPlaceholder]);
      expect(apiRequest).toHaveBeenCalledWith({ method: 'GET', url: '/registry/placeholders', params: undefined });
    });

    test('returns empty array on error', async () => {
      (apiRequest as jest.Mock).mockRejectedValue(new Error('Server Error'));
      const result = await listPlaceholders();
      expect(result).toEqual([]);
    });

    test('passes filter params', async () => {
      (apiRequest as jest.Mock).mockResolvedValue([mockPlaceholder]);
      await listPlaceholders({ name: 'customer' });
      expect(apiRequest).toHaveBeenCalledWith({ method: 'GET', url: '/registry/placeholders', params: { name: 'customer' } });
    });
  });

  // ── createPlaceholder ──────────────────────────────────────────────
  describe('createPlaceholder', () => {
    test('creates placeholder with SQL', async () => {
      (apiRequest as jest.Mock).mockResolvedValue(mockPlaceholder);
      const result = await createPlaceholder({
        name: 'customer_name',
        generation_mode: 'manual_sql',
        sql_text: 'SELECT full_name FROM crm.customers WHERE customer_id = {{customer_id}}',
        sample_value: 'John Valid',
        value_type: 'string',
        cardinality: 'scalar',
      });
      expect(result.name).toBe('customer_name');
      expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({
        method: 'POST',
        url: '/registry/placeholders',
        data: expect.objectContaining({ name: 'customer_name', datasource_id: 1 }),
      }));
    });

    test('uses default value_type string if not provided', async () => {
      (apiRequest as jest.Mock).mockResolvedValue(mockPlaceholder);
      await createPlaceholder({ name: 'test', generation_mode: 'manual_sql', sql_text: 'SELECT 1', sample_value: '1' });
      expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ value_type: 'string', cardinality: 'scalar' }),
      }));
    });

    test('throws on API error', async () => {
      (apiRequest as jest.Mock).mockRejectedValue(new Error('Name already exists'));
      await expect(createPlaceholder({ name: 'duplicate', generation_mode: 'manual_sql', sql_text: 'SELECT 1', sample_value: '1' })).rejects.toThrow('Name already exists');
    });
  });

  // ── getPlaceholderById ─────────────────────────────────────────────
  describe('getPlaceholderById', () => {
    test('fetches placeholder by ID', async () => {
      (apiRequest as jest.Mock).mockResolvedValue(mockPlaceholder);
      const result = await getPlaceholderById('ph-uuid-1');
      expect(result).toEqual(mockPlaceholder);
      expect(apiRequest).toHaveBeenCalledWith({ method: 'GET', url: '/registry/placeholders/ph-uuid-1' });
    });

    test('throws on invalid ID', async () => {
      (apiRequest as jest.Mock).mockRejectedValue(new Error('Not found'));
      await expect(getPlaceholderById('bad-id')).rejects.toThrow('Not found');
    });
  });

  // ── updatePlaceholder ──────────────────────────────────────────────
  describe('updatePlaceholder', () => {
    test('updates placeholder correctly', async () => {
      (apiRequest as jest.Mock).mockResolvedValue({ ...mockPlaceholder, sample_value: 'Jane Open' });
      const result = await updatePlaceholder('ph-uuid-1', { sample_value: 'Jane Open' });
      expect(result.sample_value).toBe('Jane Open');
      expect(apiRequest).toHaveBeenCalledWith({ method: 'PUT', url: '/registry/placeholders/ph-uuid-1', data: { sample_value: 'Jane Open' } });
    });

    test('throws on update error', async () => {
      (apiRequest as jest.Mock).mockRejectedValue(new Error('Not found'));
      await expect(updatePlaceholder('bad-id', {})).rejects.toThrow('Not found');
    });
  });

});