// src/__tests__/api/marketplace.test.ts
import { listMarketplaceItems, publishToMarketplace, importMarketplaceItem } from '../../api/marketplace';
import { apiRequest } from '../../api/client';

jest.mock('../../api/client');

const mockItem = {
  item_id: 'market-uuid-1',
  type: 'template' as const,
  source_id: 'template-uuid-1',
  name: 'Monthly Statement',
  description: 'Bank statement template',
  owner: 'dev_user',
  license: 'Community',
  rating: 4.5,
  downloads: 10,
  tags: ['banking'],
  is_public: true,
  created_at: '2026-04-01T00:00:00Z',
};

describe('marketplace API', () => {

  beforeEach(() => jest.clearAllMocks());

  // ── listMarketplaceItems ───────────────────────────────────────────
  describe('listMarketplaceItems', () => {
    test('fetches all marketplace items', async () => {
      (apiRequest as jest.Mock).mockResolvedValue([mockItem]);
      const result = await listMarketplaceItems();
      expect(result).toEqual([mockItem]);
      expect(apiRequest).toHaveBeenCalledWith({ method: 'GET', url: '/marketplace/', params: undefined });
    });

    test('passes filter params', async () => {
      (apiRequest as jest.Mock).mockResolvedValue([mockItem]);
      await listMarketplaceItems({ item_type: 'template', search: 'statement' });
      expect(apiRequest).toHaveBeenCalledWith({
        method: 'GET', url: '/marketplace/',
        params: { item_type: 'template', search: 'statement' },
      });
    });

    test('returns empty array on error', async () => {
      (apiRequest as jest.Mock).mockRejectedValue(new Error('Server Error'));
      const result = await listMarketplaceItems();
      expect(result).toEqual([]);
    });

    test('filters by tag', async () => {
      (apiRequest as jest.Mock).mockResolvedValue([mockItem]);
      await listMarketplaceItems({ tag: 'banking' });
      expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({
        params: expect.objectContaining({ tag: 'banking' }),
      }));
    });
  });

  // ── publishToMarketplace ───────────────────────────────────────────
  describe('publishToMarketplace', () => {
    test('publishes template to marketplace', async () => {
      (apiRequest as jest.Mock).mockResolvedValue(mockItem);
      const result = await publishToMarketplace({
        type: 'template', source_id: 'template-uuid-1',
        name: 'Monthly Statement', owner: 'dev_user',
      });
      expect(result).toEqual(mockItem);
      expect(apiRequest).toHaveBeenCalledWith({
        method: 'POST', url: '/marketplace/',
        data: { type: 'template', source_id: 'template-uuid-1', name: 'Monthly Statement', owner: 'dev_user' },
      });
    });

    test('throws if already published', async () => {
      (apiRequest as jest.Mock).mockRejectedValue(new Error('Already published'));
      await expect(publishToMarketplace({ type: 'template', source_id: 'uuid-1', name: 'Test', owner: 'dev_user' })).rejects.toThrow('Already published');
    });

    test('publishes block to marketplace', async () => {
      (apiRequest as jest.Mock).mockResolvedValue({ ...mockItem, type: 'block' });
      const result = await publishToMarketplace({ type: 'block', source_id: 'block-uuid-1', name: 'Header Block', owner: 'dev_user' });
      expect(result.type).toBe('block');
    });
  });

  // ── importMarketplaceItem ──────────────────────────────────────────
  describe('importMarketplaceItem', () => {
    test('imports template from marketplace', async () => {
      (apiRequest as jest.Mock).mockResolvedValue({ detail: 'Template imported successfully', type: 'template', new_id: 'new-uuid', name: 'Monthly Statement (from Marketplace)' });
      const result = await importMarketplaceItem('market-uuid-1');
      expect(result.detail).toBe('Template imported successfully');
      expect(result.new_id).toBe('new-uuid');
      expect(apiRequest).toHaveBeenCalledWith({ method: 'POST', url: '/marketplace/market-uuid-1/import' });
    });

    test('returns already_exists if placeholder exists', async () => {
      (apiRequest as jest.Mock).mockResolvedValue({ detail: 'Already in registry', type: 'placeholder', new_id: 'ph-uuid-1', name: 'customer_name', already_exists: true });
      const result = await importMarketplaceItem('market-uuid-2');
      expect(result.already_exists).toBe(true);
    });

    test('throws on import error', async () => {
      (apiRequest as jest.Mock).mockRejectedValue(new Error('Item not found'));
      await expect(importMarketplaceItem('bad-id')).rejects.toThrow('Item not found');
    });
  });

});