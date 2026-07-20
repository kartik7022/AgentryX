import { jest } from '@jest/globals';
import { TextDecoder, TextEncoder } from 'util';
import '@testing-library/jest-dom';

(globalThis as typeof globalThis & { jest: typeof jest }).jest = jest;
(globalThis as typeof globalThis & { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
(globalThis as typeof globalThis & { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder;
