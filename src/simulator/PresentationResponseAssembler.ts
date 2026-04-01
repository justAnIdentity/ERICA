/**
 * Presentation Response Assembler
 * Assembles the final Presentation Response for DCQL queries
 * References: OpenID4VP and PID Presentation Guide
 */

import { DiagnosticEvent } from "./CredentialTemplate.js";
import { GeneratedCredential } from "./SDJWTGenerator.js";
import type { DecodedVPToken } from "./CredoSDJWTGenerator.js";

export interface PresentationResponse {
  vp_token: Record<string, string[]>;
  state?: string;
}

export interface AssembledResponse {
  response: PresentationResponse;
  diagnostics: DiagnosticEvent[];
  decodedVPTokens?: DecodedVPToken[]; // NEW: Decoded VP tokens for inspection
}

export class PresentationResponseAssembler {
  private diagnostics: DiagnosticEvent[] = [];

  /**
   * Assemble presentation response from generated credentials
   */
  assembleResponse(
    generatedCredentials: GeneratedCredential[],
    state?: string
  ): AssembledResponse {
    this.diagnostics = [];

    this.addDiagnostic("Presentation response assembly started", {
      credentialCount: generatedCredentials.length,
    });

    // Assemble VPs and collect decoded tokens
    const vpTokensByCredentialId: Record<string, string[]> = {};
    const decodedVPTokens: DecodedVPToken[] = [];

    for (let i = 0; i < generatedCredentials.length; i++) {
      const credential = generatedCredentials[i];

      // Group by credential ID (from DCQL request) for object-based vp_token structure
      // Per OpenID4VP spec: vp_token object uses credential IDs as keys with array values
      if (!vpTokensByCredentialId[credential.credentialId]) {
        vpTokensByCredentialId[credential.credentialId] = [];
      }
      vpTokensByCredentialId[credential.credentialId].push(credential.vp);

      // Collect decoded token if available
      if (credential.decoded) {
        decodedVPTokens.push(credential.decoded);
      }

      this.addDiagnostic(`Credential ${i + 1} added to response`, {
        credentialId: credential.credentialId,
        format: credential.format,
      });
    }

    // Build vp_token object with credential IDs as keys and array values
    // Per OpenID4VP spec for direct_post.jwt: vp_token is an object with credential IDs as keys
    // Values are arrays per the spec example: {"example_jwt_vc": ["eY...QMA"]}
    const vpTokenObject: Record<string, string[]> = vpTokensByCredentialId;

    // For DCQL/PID presentations: simple response without presentation_submission
    const response: PresentationResponse = {
      vp_token: vpTokenObject,
      state: state,
    };

    this.addDiagnostic("DCQL response assembled", {
      vpTokenFormats: Object.keys(vpTokenObject),
      hasState: !!state,
    });

    return {
      response,
      diagnostics: [...this.diagnostics],
      decodedVPTokens: decodedVPTokens.length > 0 ? decodedVPTokens : undefined,
    };
  }

  /**
   * Validate presentation response structure
   */
  validateResponse(response: PresentationResponse): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!response.vp_token) {
      errors.push("Missing vp_token in response");
    }

    if (errors.length > 0) {
      this.addDiagnostic("Response validation failed", { errors });
    } else {
      this.addDiagnostic("Response validation passed");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get response as JSON string
   */
  serializeResponse(response: PresentationResponse): string {
    return JSON.stringify(response, null, 2);
  }

  /**
   * Parse response from JSON
   */
  deserializeResponse(jsonString: string): PresentationResponse {
    try {
      return JSON.parse(jsonString);
    } catch (err) {
      throw new Error(`Failed to parse presentation response: ${err}`);
    }
  }

  /**
   * Create a detailed response structure for inspection
   */
  createDetailedResponseForInspection(response: PresentationResponse): {
    structure: PresentationResponse;
    vpCount: number;
  } {
    const vpArray = Array.isArray(response.vp_token) ? response.vp_token : [response.vp_token];

    return {
      structure: response,
      vpCount: vpArray.length,
    };
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2, 9);
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

export default PresentationResponseAssembler;
