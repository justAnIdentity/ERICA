/**
 * Debug endpoint
 * POST /api/debug
 * 
 * Runs the full EUDI VP Debugger pipeline
 */

import { Router, Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/Logger.js";

/**
 * API request/response types
 *
 * Note: AuthorizationRequest is imported from core to ensure symmetry
 * between /api/parse-url and /api/debug endpoints.
 */

// Re-use core types instead of duplicating
// AuthorizationRequest will be imported at runtime from core module

interface DebugRequest {
  request: any; // AuthorizationRequest from core (typed at runtime)
  validationProfile?: string;
  simulationMode?: string;
  pidTemplate?: string; // PID template selection (normal, special-characters, incomplete-birthdate)
  postResponseToUri?: boolean;
  preferredFormat?: "dc+sd-jwt" | "mso_mdoc"; // Format preference for credential_sets selection
}

interface DebugResponse {
  success: boolean;
  data?: any; // DebuggerSession from core
  error?: {
    message: string;
    details?: string;
  };
}

interface ParseURLRequest {
  url: string;
}

interface ParseURLResponse {
  success: boolean;
  data?: any; // URLParseResult from core
  error?: {
    message: string;
    details?: string;
  };
}

const router = Router();

// Get absolute path to core dist directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// From api/src/routes/debug.ts, need to go up 3 levels to reach root
const coreDistPath = path.resolve(__dirname, "../../../dist");
const runtimePath = path.resolve(coreDistPath, "runtime.js");
const indexPath = path.resolve(coreDistPath, "index.js");

/**
 * Load the core runtime module
 * Centralizes debugger instantiation via src/runtime.ts
 */
async function loadRuntime() {
  try {
    return await import(runtimePath);
  } catch (error) {
    logger.error(`Failed to load runtime from: ${runtimePath}`, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * Parse URL endpoint
 * POST /api/parse-url
 *
 * Parses OpenID4VP authorization URLs and extracts AuthorizationRequest.
 * The returned AuthorizationRequest can be passed directly to /api/debug.
 */
router.post("/parse-url", async (req: Request<{}, ParseURLResponse, ParseURLRequest>, res: Response<ParseURLResponse>) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          message: "Missing or invalid 'url' field in request body",
        },
      });
    }

    // Use centralized runtime
    const runtime = await loadRuntime();
    const parser = runtime.createURLParser();

    const result = await parser.parseURL(url);

    logger.debug("[Parse URL API] Request parsed", {
      type: result.urlType,
      success: result.success,
      hasRequest: !!result.request,
    });

    return res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    logger.error("Parse URL endpoint error", error instanceof Error ? error : new Error(String(error)));
    return res.status(500).json({
      success: false,
      error: {
        message: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * Debug endpoint
 * POST /api/debug
 *
 * Accepts an AuthorizationRequest (from manual input or /api/parse-url output)
 * and runs the full validation + simulation + diagnostics pipeline.
 */
router.post("/debug", async (req: Request<{}, DebugResponse, DebugRequest>, res: Response<DebugResponse>) => {
  try {
    const {
      request: authRequest,
      validationProfile = "pid-presentation",
      simulationMode = "VALID",
      pidTemplate = "normal",
      postResponseToUri = false,
      preferredFormat = "dc+sd-jwt",
    } = req.body;

    // Validate input
    if (!authRequest) {
      return res.status(400).json({
        success: false,
        error: {
          message: "Missing 'request' field in request body",
        },
      });
    }

    logger.debug("[Debug API] Request received", {
      hasDcql: !!(authRequest as any).dcql_query,
      dcqlCredentialsCount: (authRequest as any).dcql_query?.credentials?.length || 0,
      postResponseToUri,
      validationProfile,
      simulationMode,
      pidTemplate,
    });

    // Load runtime and core types
    const runtime = await loadRuntime();
    const coreModule: any = await import(indexPath);
    const { Profile, SimulationMode } = coreModule;

    // Use centralized debugger instantiation
    const vpDebugger = runtime.createDebugger();

    // Normalize profile and simulation mode from string inputs
    const profileEnum =
      Object.values(Profile).includes(validationProfile) ? validationProfile : Profile.PID_PRESENTATION;
    const simulationModeEnum =
      Object.values(SimulationMode).includes(simulationMode) ? simulationMode : SimulationMode.VALID;

    const session = await vpDebugger.debug(
      authRequest,
      profileEnum,
      simulationModeEnum,
      postResponseToUri,
      preferredFormat,
      pidTemplate
    );

    return res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    logger.error("Debug endpoint error", error instanceof Error ? error : new Error(String(error)));
    return res.status(500).json({
      success: false,
      error: {
        message: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

export default router;
