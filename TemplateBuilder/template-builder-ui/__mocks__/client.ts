// src/__mocks__/client.ts
import { jest } from '@jest/globals';

export const apiRequest = jest.fn();
export default {
  request: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};
