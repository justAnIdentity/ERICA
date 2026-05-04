/**
 * Runtime Module
 * Centralizes debugger instantiation and configuration
 *
 * All API endpoints, CLI tools, and tests should use createDebugger()
 * to ensure consistent wiring of the EudiVpDebugger and its dependencies.
 */

import { EudiVpDebugger } from "./index.js";
import { PresentationRequestURLParser } from "./validators/index.js";
import { CertificateManager } from "./security/CertificateManager.js";
import { TrustListManager } from "./security/TrustListManager.js";

/**
 * Initialize runtime (call once on application startup)
 * Sets up certificate infrastructure and trust list for wallet simulator
 */
export async function initializeRuntime(): Promise<void> {
  const certManager = CertificateManager.getInstance();
  await certManager.initialize();
  console.log("[Runtime] Certificate infrastructure initialized");

  const trustListManager = TrustListManager.getInstance();
  await trustListManager.initialize();
  console.log("[Runtime] Trust list initialized");
}

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
