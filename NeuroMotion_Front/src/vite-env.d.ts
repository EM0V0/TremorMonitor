/// <reference types="vite/client" />

/**
 * Declaration file for Vite environment variables
 * This enables TypeScript to recognize import.meta.env properties
 */
interface ImportMeta {
  readonly env: {
    readonly MODE: string;
    readonly BASE_URL: string;
    readonly PROD: boolean;
    readonly DEV: boolean;
    readonly SSR: boolean;
    readonly VITE_API_BASE_URL?: string;
    readonly VITE_DEBUG_MODE?: string;
    readonly VITE_USE_MOCK_AUTH?: string;
    readonly [key: string]: string | undefined;
  };
} 