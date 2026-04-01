import axios, { AxiosInstance } from "axios";

/**
 * Get the API base URL from environment configuration.
 * In development, falls back to relative path.
 * In production, should be configured via environment variable or injected at runtime.
 */
export function getApiBaseUrl(): string {
  // Try to get from window object (injected at runtime)
  if (typeof window !== "undefined" && (window as any).__API_BASE_URL__) {
    return (window as any).__API_BASE_URL__;
  }

  // Try to get from import.meta.env (Vite environment variable)
  if (import.meta.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // Default to relative path for backward compatibility
  return "";
}

/**
 * Create and configure axios instance with appropriate base URL
 */
export function createApiClient(): AxiosInstance {
  const baseURL = getApiBaseUrl();

  const client = axios.create({
    baseURL: baseURL || undefined, // undefined means relative URLs
    headers: {
      "Content-Type": "application/json",
    },
  });

  return client;
}

// Export singleton instance
export const apiClient = createApiClient();
