import { jest } from '@jest/globals';
import { apiRequest } from '../../../__mocks__/client';
import { listDatasources } from '../../api/datasources';

describe('listDatasources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should_return_datasources_when_request_succeeds', async () => {
    const datasources = [
      { datasource_id: 'ds-1', name: 'CRM', type: 'postgres', is_active: true },
      { datasource_id: 'ds-2', name: 'Warehouse', type: 'snowflake', is_active: false },
    ];
    (apiRequest as any).mockResolvedValueOnce(datasources);

    const result = await listDatasources();

    expect(apiRequest).toHaveBeenCalledWith({
      method: 'GET',
      url: '/datasources/',
    });
    expect(result).toEqual(datasources);
  });

  it('should_return_empty_array_when_request_fails', async () => {
    (apiRequest as any).mockRejectedValueOnce(new Error('Datasource service unavailable'));

    const result = await listDatasources();

    expect(result).toEqual([]);
  });

  it('should_return_empty_array_when_request_rejects_with_non_error_value', async () => {
    (apiRequest as any).mockRejectedValueOnce('timeout');

    const result = await listDatasources();

    expect(result).toEqual([]);
  });
});
