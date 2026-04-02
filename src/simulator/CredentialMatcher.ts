/**
 * Credential Matching & Filtering
 * Handles parsing DCQL queries and matching them to available credentials
 */

import { PIDDataGenerator, PIDCredentialData } from "./PIDDataGenerator.js";
import { PIDTemplateLoader } from "./PIDTemplateLoader.js";
import { DiagnosticEvent } from "./CredentialTemplate.js";
import { SimulationMode } from "../types/index.js";

export interface DCQLCredential {
  id: string;
  format: string;
  claims?: Array<{ path: string[] }>;
  meta?: {
    vctValues?: string[];
    doctypeValue?: string;
  };
}

export interface MatchedCredential {
  credentialId: string; // The ID from the DCQL request (e.g., "pid-sd-jwt")
  credential: PIDCredentialData;
  requestedClaimPaths: string[][];
  diagnostics: DiagnosticEvent[];
}

export class CredentialMatcher {
  private diagnostics: DiagnosticEvent[] = [];

  /**
   * Match DCQL credentials to available PID credentials
   * @param dcqlCredentials - List of requested credentials from DCQL
   * @param simulationMode - Wallet behavior mode to determine which PID template to use
   * @param pidTemplate - Explicit PID template override (if provided, this takes precedence over mode-based selection)
   */
  matchCredentials(dcqlCredentials: DCQLCredential[], simulationMode: SimulationMode = SimulationMode.VALID, pidTemplate?: string): MatchedCredential[] {
    this.diagnostics = [];
    const matched: MatchedCredential[] = [];

    // Determine which PID template to use: explicit override takes precedence, else use mode-based selection
    const templateType = pidTemplate ? (pidTemplate as any) : PIDTemplateLoader.getTemplateForMode(simulationMode);
    this.addDiagnostic(`Using PID template: ${templateType}`, { simulationMode, explicitTemplate: !!pidTemplate });

    for (const dcqlCred of dcqlCredentials) {
      this.addDiagnostic(`Attempting to match DCQL credential: ${dcqlCred.id}`);

      // Check format support
      if (!this.isSupportedFormat(dcqlCred.format)) {
        this.addDiagnostic(`Unsupported format: ${dcqlCred.format}`, {
          supported: ["dc+sd-jwt", "mso_mdoc"],
        });
        continue;
      }

      // Load PID credential from template (not generated randomly each time)
      let pidCredential = PIDTemplateLoader.loadTemplate(templateType);
      
      // Convert to requested format if needed
      if (dcqlCred.format !== pidCredential.format) {
        // For now, use the same PID but mark it as the requested format
        // In future, this could convert to mso_mdoc or other formats
        pidCredential = {
          ...pidCredential,
          format: dcqlCred.format as "dc+sd-jwt" | "mso_mdoc",
          id: dcqlCred.id,
        };
      }

      // Extract requested claim paths from DCQL
      const requestedClaimPaths = dcqlCred.claims?.map((c) => c.path) ?? [];

      this.addDiagnostic(`Matched credential: ${dcqlCred.id}`, {
        format: dcqlCred.format,
        requestedClaimsCount: requestedClaimPaths.length,
      });

      // Validate all requested claims are available
      const validation = this.validateRequestedClaims(pidCredential, requestedClaimPaths);
      if (!validation.valid) {
        this.addDiagnostic(`Some requested claims not available in credential`, {
          missing: validation.missing,
        });
      }

      matched.push({
        credentialId: dcqlCred.id, // Preserve the credential ID from the request
        credential: pidCredential,
        requestedClaimPaths,
        diagnostics: [...this.diagnostics],
      });
    }

    return matched;
  }

  /**
   * Check if a credential format is supported
   */
  private isSupportedFormat(format: string): boolean {
    return format === "dc+sd-jwt" || format === "mso_mdoc";
  }

  /**
   * Validate that all requested claims exist in the credential
   */
  private validateRequestedClaims(
    credential: PIDCredentialData,
    requestedClaimPaths: string[][]
  ): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const path of requestedClaimPaths) {
      if (!PIDDataGenerator.hasClaimPath(credential, path)) {
        missing.push(path.join("."));
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Add diagnostic event
   */
  private addDiagnostic(event: string, details?: Record<string, any>): void {
    this.diagnostics.push({
      timestamp: Date.now(),
      event,
      details,
    });
  }

  /**
   * Get all diagnostics
   */
  getDiagnostics(): DiagnosticEvent[] {
    return [...this.diagnostics];
  }
}

export default CredentialMatcher;
