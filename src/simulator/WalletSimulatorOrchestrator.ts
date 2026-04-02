/**
 * Wallet Simulator Orchestrator
 * Coordinates all simulation steps and provides unified API
 * Step 9: Integration with EudiVpDebugger
 */

import KeyManager from "./KeyManager.js";
import CredentialTemplate from "./CredentialTemplate.js";
import CredentialMatcher, { DCQLCredential } from "./CredentialMatcher.js";
import { CredoSDJWTGenerator } from "./CredoSDJWTGenerator.js";
import PresentationResponseAssembler from "./PresentationResponseAssembler.js";
import WalletSimulatorDiagnostics, {
  SimulationDiagnostics,
} from "./WalletSimulatorDiagnostics.js";
import { SimulationMode, PresentationResponse } from "../types/index.js";
import { logger } from "../utils/Logger.js";

import type { DecodedVPToken } from "./CredoSDJWTGenerator.js";

export interface OrchestrationResult {
  success: boolean;
  response: PresentationResponse;
  diagnostics: SimulationDiagnostics;
  vp_token?: Record<string, string[]>;
  decodedVPTokens?: DecodedVPToken[];
}

export class WalletSimulatorOrchestrator {
  /**
   * Execute full wallet simulator pipeline
   * Orchestrates all steps 1-7 into a unified flow
   */
  static async simulate(
    dcqlCredentials: DCQLCredential[],
    state?: string,
    mode: SimulationMode = SimulationMode.VALID,
    nonce?: string,
    audience?: string,
    pidTemplate: string = "normal"
  ): Promise<OrchestrationResult> {
    const diagnosticsAggregator = new WalletSimulatorDiagnostics();

    try {
      // Step 1: KeyManager initialization
      // Note: PID caching is disabled for MVP because KB-JWT must be regenerated with fresh nonce/audience
      // for each request to ensure proper replay protection and audience validation per spec.
      const keyManager = KeyManager.getInstance();

      // Step 3: Generate PID credentials matching DCQL
      const matcher = new CredentialMatcher();
      const matchedCredentials = matcher.matchCredentials(dcqlCredentials, mode, pidTemplate);
      diagnosticsAggregator.registerComponent(
        "CredentialMatcher",
        "Credential Matching",
        matcher.getDiagnostics()
      );

      if (matchedCredentials.length === 0) {
        const errorMsg = "No credentials matched DCQL requirements";
        logger.error("[WalletSimulatorOrchestrator] " + errorMsg, {
          dcqlCredentials,
          diagnostics: matcher.getDiagnostics(),
        });
        throw new Error(errorMsg);
      }

      // Step 4: Try to use cached PIDs first, generate new ones if needed
      const generatedCredentials = [];
      const credoGenerator = new CredoSDJWTGenerator();

      for (const matched of matchedCredentials) {
        // Note: PID caching is disabled because KB-JWT must be regenerated with fresh nonce/audience
        // for each request to ensure proper replay protection and audience validation

        // Generate new PID with request-specific nonce and audience
        logger.info(`Generating new PID for format: ${matched.credential.format}`, {
          action: 'PID_GENERATION',
        });
        const requestedPaths = matched.requestedClaimPaths;

        // Generate SD-JWT with mode and request-specific values
        const result = await credoGenerator.generate({
          mode,
          requestedClaims: requestedPaths,
          nonce: nonce || state || "default-nonce",
          audience: audience || "https://self-issued.me/v2",
        });

        // Convert to GeneratedCredential format
        generatedCredentials.push({
          credentialId: matched.credentialId, // Preserve the credential ID from the request
          format: matched.credential.format as "dc+sd-jwt" | "mso_mdoc",
          vp: result.sdJwtVc,
          decoded: result.decoded, // Include decoded structure
          diagnostics: [{
            timestamp: Date.now(),
            event: "SD-JWT generated with request-specific nonce/audience",
            details: {
              mode,
              claimsCount: Object.keys(result.claims).length,
              nonce: nonce || state || "default-nonce",
              audience: audience || "https://self-issued.me/v2"
            }
          }],
        });
      }

      diagnosticsAggregator.registerComponent(
        "CredoSDJWTGenerator",
        "JWT Generation",
        [{
          timestamp: Date.now(),
          event: "Mode-based SD-JWT generation (PIDs generated fresh for each request)",
          details: { 
            mode, 
            credentialCount: generatedCredentials.length,
            note: "PID caching disabled for security: KB-JWT must use fresh nonce/audience per spec"
          }
        }]
      );

      // Step 3: Template building (from SDJWTGenerator internally)
      const credTemplate = new CredentialTemplate();
      diagnosticsAggregator.registerComponent(
        "CredentialTemplate",
        "Payload Building",
        credTemplate.getDiagnostics()
      );

      // Step 6: Assemble presentation response
      const assembler = new PresentationResponseAssembler();
      const assembled = assembler.assembleResponse(
        generatedCredentials,
        state
      );
      diagnosticsAggregator.registerComponent(
        "PresentationResponseAssembler",
        "Response Assembly",
        assembler.getDiagnostics()
      );

      // Step 7: Aggregate diagnostics
      const aggregatedDiagnostics = diagnosticsAggregator.aggregate();

      return {
        success: true,
        response: assembled.response,
        diagnostics: aggregatedDiagnostics,
        vp_token: assembled.response.vp_token,
        decodedVPTokens: assembled.decodedVPTokens,
      };
    } catch (error) {
      const aggregatedDiagnostics = diagnosticsAggregator.aggregate();
      throw {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        diagnostics: aggregatedDiagnostics,
      };
    }
  }

  // NOTE: formatResult() removed - was unused debugging helper
}

export default WalletSimulatorOrchestrator;
