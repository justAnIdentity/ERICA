/**
 * API Configuration Module
 *
 * Provides runtime configuration for API endpoints.
 * Supports multiple configuration sources (in priority order):
 * 1. Runtime injection: window.__API_BASE_URL__
 * 2. Build-time environment variable: VITE_API_BASE_URL
 * 3. Relative paths (development default)
 *
 * Usage:
 *   import { getApiConfig } from './utils/apiConfig';
 *   const config = getApiConfig();
 *   console.log(config.baseUrl); // http://localhost:3001 or ""
 */

export interface ApiConfig {
  baseUrl: string;
  isDevelopment: boolean;
}

/**
 * Get the current API configuration
 * Respects runtime injection via window.__API_BASE_URL__
 */
export function getApiConfig(): ApiConfig {
  let baseUrl = "";

  // Check for runtime injection (highest priority)
  if (typeof window !== "undefined" && (window as any).__API_BASE_URL__) {
    baseUrl = (window as any).__API_BASE_URL__;
  }
  // Check for build-time environment variable
  else if (import.meta.env.VITE_API_BASE_URL) {
    baseUrl = import.meta.env.VITE_API_BASE_URL;
  }

  const isDevelopment =
    import.meta.env.MODE === "development" || import.meta.env.DEV;

  return {
    baseUrl,
    isDevelopment,
  };
}

/**
 * Build a full endpoint URL
 */
export function getEndpointUrl(endpoint: string): string {
  const config = getApiConfig();
  if (!config.baseUrl) {
    // Relative path
    return endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  }
  // Absolute URL
  return `${config.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}
