/**
 * Runtime Module
 * Centralizes debugger instantiation and configuration
 *
 * All API endpoints, CLI tools, and tests should use createDebugger()
 * to ensure consistent wiring of the EudiVpDebugger and its dependencies.
 */

import { EudiVpDebugger } from "./index.js";
import { PresentationRequestURLParser } from "./validators/index.js";

/**
 * Create a configured EudiVpDebugger instance
 *
 * This is the single source of truth for how to instantiate the debugger.
 * Use this from:
 * - API endpoints (api/src/routes/debug.ts)
 * - CLI tools
 * - Integration tests
 *
 * @returns Configured EudiVpDebugger instance
 */
export function createDebugger(): EudiVpDebugger {
  return new EudiVpDebugger();
}

/**
 * Create a URL parser instance
 *
 * @returns Configured PresentationRequestURLParser instance
 */
export function createURLParser(): PresentationRequestURLParser {
  return new PresentationRequestURLParser();
}

/**
 * Runtime configuration (future extensibility)
 */
export interface RuntimeConfig {
  // Future: Add configuration options like:
  // - Custom validators
  // - Custom profile plugins
  // - Logging levels
  // - Cache settings
}
