import type { ForgeApi } from './index';

declare global {
  interface Window {
    forge: ForgeApi;
  }
}

export {};
