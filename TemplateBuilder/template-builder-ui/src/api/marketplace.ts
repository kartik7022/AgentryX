// src/api/marketplace.ts

import { apiRequest } from './client';

export interface MarketplaceItem {
  item_id: string;
  type: 'template' | 'block' | 'placeholder';
  source_id: string;
  name: string;
  description?: string;
  owner: string;
  license: string;
  rating?: number;
  downloads: number;
  tags: string[];
  is_public: boolean;
  created_at: string;
}

export interface MarketplaceItemCreate {
  type: 'template' | 'block' | 'placeholder';
  source_id: string;
  name: string;
  description?: string;
  owner: string;
  license?: string;
  tags?: string[];
  is_public?: boolean;
}

// GET /v1/marketplace/
export async function listMarketplaceItems(params?: {
  item_type?: string;
  tag?: string;
  search?: string;
  public_only?: boolean;
}): Promise<MarketplaceItem[]> {
  try {
    return await apiRequest<MarketplaceItem[]>({
      method: 'GET',
      url: '/marketplace/',
      params,
    });
  } catch {
    return [];
  }
}

// POST /v1/marketplace/
export async function publishToMarketplace(
  body: MarketplaceItemCreate
): Promise<MarketplaceItem> {
  return apiRequest<MarketplaceItem>({
    method: 'POST',
    url: '/marketplace/',
    data: body,
  });
}

// POST /v1/marketplace/:id/import
export async function importMarketplaceItem(
  itemId: string
): Promise<{
  detail: string;
  type: MarketplaceItem['type'];
  new_id: string;
  name: string;
  already_exists?: boolean;
}> {
  return apiRequest({
    method: 'POST',
    url: `/marketplace/${itemId}/import`,
  });
}
