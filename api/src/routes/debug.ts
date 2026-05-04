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
  urlParsingChecks?: any[]; // Optional ValidationCheck[] from URL parsing
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
      urlParsingChecks = [],
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
      urlParsingChecks: urlParsingChecks.length,
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

    // Merge URL parsing checks into request validation checks
    if (urlParsingChecks && urlParsingChecks.length > 0) {
      session.requestValidation.checks = [
        ...urlParsingChecks,
        ...session.requestValidation.checks,
      ];

      // Update validation summary if it exists
      if (session.requestValidation.summary) {
        const urlPassedCount = urlParsingChecks.filter((c: any) => c.passed).length;
        const urlFailedCount = urlParsingChecks.length - urlPassedCount;
        const urlErrorCount = urlParsingChecks.filter((c: any) => !c.passed && c.severity === "ERROR").length;
        const urlWarningCount = urlParsingChecks.filter((c: any) => !c.passed && c.severity === "WARNING").length;

        session.requestValidation.summary.totalChecks += urlParsingChecks.length;
        session.requestValidation.summary.passedChecks += urlPassedCount;
        session.requestValidation.summary.failedChecks += urlFailedCount;
        session.requestValidation.summary.errorCount += urlErrorCount;
        session.requestValidation.summary.warningCount += urlWarningCount;
      }

      logger.debug("[Debug API] Merged URL parsing checks", {
        urlChecks: urlParsingChecks.length,
        totalChecks: session.requestValidation.checks.length,
      });
    }

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

/**
 * Trust List endpoint
 * GET /api/trust-list
 *
 * Returns the list of trusted Registrar certificates from the EUDI trust list
 */
router.get("/trust-list", async (req: Request, res: Response) => {
  try {
    const runtime = await loadRuntime();
    const coreModule: any = await import(indexPath);
    const { TrustListManager } = coreModule;

    const trustListManager = TrustListManager.getInstance();
    const trustedVerifiers = trustListManager.getTrustedVerifiers();

    return res.json({
      success: true,
      data: {
        count: trustedVerifiers.length,
        verifiers: trustedVerifiers.map(v => ({
          commonName: v.commonName,
          organization: v.organization,
          country: v.country,
          fingerprint: v.fingerprint,
          validFrom: v.validFrom,
          validTo: v.validTo,
          serviceType: v.serviceType,
        })),
      },
    });
  } catch (error) {
    logger.error("Trust list endpoint error", error instanceof Error ? error : new Error(String(error)));
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to retrieve trust list",
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * Trust Anchor endpoint
 * GET /api/trust-anchor
 *
 * Returns the root CA certificate for users to add to their verifiers
 */
router.get("/trust-anchor", async (req: Request, res: Response) => {
  try {
    // Load runtime
    const runtime = await loadRuntime();
    const coreModule: any = await import(indexPath);
    const { CertificateManager } = coreModule;

    const certManager = CertificateManager.getInstance();
    const trustAnchor = certManager.getTrustAnchor();

    // Determine response format based on Accept header or query param
    const format = req.query.format || 'pem';

    if (format === 'der') {
      res.setHeader('Content-Type', 'application/x-x509-ca-cert');
      res.setHeader('Content-Disposition', 'attachment; filename="eudi-vp-debugger-root-ca.crt"');
      return res.send(trustAnchor.der);
    } else {
      // Default to PEM
      res.setHeader('Content-Type', 'application/x-pem-file');
      res.setHeader('Content-Disposition', 'attachment; filename="eudi-vp-debugger-root-ca.pem"');
      return res.send(trustAnchor.pem);
    }
  } catch (error) {
    logger.error("Trust anchor endpoint error", error instanceof Error ? error : new Error(String(error)));
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to retrieve trust anchor",
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

/**
 * Issuer Trust Anchor endpoint
 * GET /api/issuer/trust-anchor
 *
 * Returns the PID issuer's public certificate for RPs to add to their test trust lists
 * ⚠️ WARNING: This is a TEST ONLY certificate - do not use in production
 */
router.get("/issuer/trust-anchor", async (req: Request, res: Response) => {
  try {
    const runtime = await loadRuntime();
    const coreModule: any = await import(indexPath);
    const { CertificateManager } = coreModule;

    const certManager = CertificateManager.getInstance();
    const trustAnchor = certManager.getTrustAnchor();

    // Get certificate details for display
    const chain = certManager.getCertificateChain();
    const cert = chain.rootCA.cert;

    // Extract subject details
    let commonName = "Unknown";
    let organization = "Unknown";
    let country = "Unknown";

    for (const rdn of cert.subject.typesAndValues) {
      if (rdn.type === "2.5.4.3") commonName = (rdn.value as any).valueBlock.value;
      if (rdn.type === "2.5.4.10") organization = (rdn.value as any).valueBlock.value;
      if (rdn.type === "2.5.4.6") country = (rdn.value as any).valueBlock.value;
    }

    return res.json({
      success: true,
      warning: "⚠️ TEST ONLY - DO NOT USE IN PRODUCTION",
      data: {
        certificate: {
          pem: trustAnchor.pem,
          der: trustAnchor.der.toString("base64"),
          format: "X.509",
        },
        details: {
          commonName,
          organization,
          country,
          validFrom: cert.notBefore.value.toISOString(),
          validTo: cert.notAfter.value.toISOString(),
          algorithm: "ES256 (P-256)",
        },
        usage: {
          purpose: "PID Issuer Certificate for EUDI VP Debugger Wallet Simulator",
          instructions: [
            "Download this certificate and add it to your RP's test trust list",
            "Configure your RP to trust this issuer (test environment only)",
            "Verify PIDs from the wallet simulator using this certificate",
            "⚠️ NEVER use this certificate in production environments",
          ],
        },
      },
    });
  } catch (error) {
    logger.error("Issuer trust anchor endpoint error", error instanceof Error ? error : new Error(String(error)));
    return res.status(500).json({
      success: false,
      error: {
        message: "Failed to retrieve issuer trust anchor",
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

export default router;
