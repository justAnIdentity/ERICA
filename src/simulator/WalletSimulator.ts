/**
 * Wallet Simulator Engine
 * Generates compliant or intentionally flawed Presentation Responses
 * Integrates wallet simulator steps 1-7
 */

import * as jose from "jose";
import { HOLDER_KEY } from "./TestKeys.js";
import {
  AuthorizationRequest,
  PresentationResponse,
  SimulationMode,
  CredentialTemplate,
} from "../types/index.js";
import WalletSimulatorOrchestrator, {
  OrchestrationResult,
} from "./WalletSimulatorOrchestrator.js";
import { DCQLCredential } from "./CredentialMatcher.js";

export interface WalletSimulatorOptions {
  mode: SimulationMode;
  credentialSource: "TEMPLATE" | "CUSTOM";
  customCredentials?: Record<string, unknown>;
  postResponseToUri?: boolean; // If true, POST response to response_uri
  preferredFormat?: "dc+sd-jwt" | "mso_mdoc"; // Format preference when multiple options available (default: dc+sd-jwt)
  pidTemplate?: string; // PID template to use (default: "normal", options: "normal", "special-characters", "incomplete-birthdate")
  // useCache?: boolean; // FUTURE: Enable PID caching (default: false for security)
}

export interface IWalletSimulator {
  simulate(
    request: AuthorizationRequest,
    options: WalletSimulatorOptions
  ): Promise<PresentationResponse>;
}

export interface WalletSimulatorResult {
  response: PresentationResponse;
  orchestrationResult: OrchestrationResult;
  postResult?: {
    success: boolean;
    error?: string;
    statusCode?: number;
  };
}

export class WalletSimulator implements IWalletSimulator {
  /**
   * Simulate wallet response (Step 9: Full integration)
   */
  async simulate(
    request: AuthorizationRequest,
    options: WalletSimulatorOptions
  ): Promise<PresentationResponse> {
    // Extract DCQL credentials from request
    const dcqlCredentials = this.extractDCQLCredentials(request, options.preferredFormat || "dc+sd-jwt");

    // Extract nonce and audience from request
    const nonce = (request as any).nonce;
    const audience = (request as any).aud || (request as any).clientId || request.clientId;

    // Use orchestrator to run full simulation pipeline (steps 1-7)
    const result = await WalletSimulatorOrchestrator.simulate(
      dcqlCredentials,
      request.state,
      options.mode,
      nonce,
      audience,
      options.pidTemplate || "normal"
    );

    if (!result.success) {
      // If simulation fails, return error response
      const response: PresentationResponse = {
        vp_token: { "error": ["error-token"] },
        state: request.state,
      };
      return response;
    }

    // Return DCQL response (modern OpenID4VP format)
    const response: PresentationResponse = {
      vp_token: result.vp_token,
      state: result.response.state,
      decodedVPTokens: result.decodedVPTokens,
    };

    // POST response back if requested
    if (options.postResponseToUri) {
      const responseUri = (request as any).response_uri || (request as any).responseUri;
      if (responseUri) {
        const postResult = await this.postResponse(responseUri, response, request);
        // Attach post result to response for frontend visibility
        (response as any).postResult = postResult;
      }
    }

    return response;
  }

  /**
   * Extract DCQL credentials from request
   *
   * Uses DCQL Query format per OpenID4VP specification.
   * When DCQL includes credential_sets, this method respects the set logic
   * to determine which credentials to return. If no credential_sets are specified,
   * all credentials are returned.
   *
   * See: OpenID4VP §5.1 (DCQL)
   */
  private extractDCQLCredentials(
    request: AuthorizationRequest,
    preferredFormat: "dc+sd-jwt" | "mso_mdoc"
  ): DCQLCredential[] {
    const dcqlQuery = (request as any).dcql_query;
    if (dcqlQuery?.credentials) {
      console.log(
        "[WalletSimulator] Found DCQL Query with",
        dcqlQuery.credentials.length,
        "credentials defined"
      );

      // Parse all available credentials
      const allCredentials: DCQLCredential[] = dcqlQuery.credentials.map((cred: any) => ({
        id: cred.id,
        format: cred.format,
        claims: cred.claims || [],
        meta: cred.meta,
      }));

      // If credential_sets is present, use it to select which credentials to return
      if (dcqlQuery.credential_sets && dcqlQuery.credential_sets.length > 0) {
        const selectedCredentials = this.selectCredentialsFromSets(
          allCredentials,
          dcqlQuery.credential_sets,
          preferredFormat
        );
        console.log(
          "[WalletSimulator] credential_sets selection:",
          selectedCredentials.length,
          "credential(s) selected"
        );
        return selectedCredentials;
      }

      // No credential_sets - return all credentials (legacy behavior)
      console.log("[WalletSimulator] No credential_sets, returning all credentials");
      return allCredentials;
    }

    console.warn("[WalletSimulator] No dcql_query found in request");
    return [];
  }

  /**
   * Select credentials based on credential_sets
   * credential_sets defines which combinations of credentials are acceptable
   * Each set has "options" - arrays of credential IDs that satisfy the requirement
   * The wallet picks ONE option from each set
   */
  private selectCredentialsFromSets(
    allCredentials: DCQLCredential[],
    credentialSets: any[],
    preferredFormat: "dc+sd-jwt" | "mso_mdoc"
  ): DCQLCredential[] {
    const selected: DCQLCredential[] = [];
    const credentialMap = new Map(allCredentials.map(c => [c.id, c]));

    for (const set of credentialSets) {
      if (!set.options || set.options.length === 0) {
        console.warn("[WalletSimulator] credential_set has no options, skipping");
        continue;
      }

      // Each option is an array of credential IDs
      // Pick the option that matches our preferred format
      let chosenOption: string[] | null = null;

      // First, try to find an option with the preferred format
      for (const option of set.options) {
        if (!Array.isArray(option) || option.length === 0) continue;

        // Check if this option contains a credential with our preferred format
        const optionCredentials = option
          .map((id: string) => credentialMap.get(id))
          .filter((c): c is DCQLCredential => c !== undefined);

        if (optionCredentials.some(c => c.format === preferredFormat)) {
          chosenOption = option;
          console.log(
            `[WalletSimulator] Selected option with preferred format (${preferredFormat}):`,
            option
          );
          break;
        }
      }

      // If no preferred format found, pick the first option
      if (!chosenOption) {
        chosenOption = set.options[0];
        console.log(
          "[WalletSimulator] No preferred format match, using first option:",
          chosenOption
        );
      }

      // Add all credentials from the chosen option
      if (chosenOption) {
        for (const credId of chosenOption) {
          const credential = credentialMap.get(credId);
          if (credential) {
            selected.push(credential);
          } else {
            console.warn(
              `[WalletSimulator] Credential ID "${credId}" not found in credentials array`
            );
          }
        }
      }
    }

    return selected;
  }


  /**
   * Build Response JWT payload for direct_post.jwt response mode
   * Returns the claims object that will be encrypted
   */
  private buildResponsePayload(response: PresentationResponse, request: AuthorizationRequest): any {
    const now = Math.floor(Date.now() / 1000);

    // Access vp_token
    const vpToken = response.vp_token;

    // Extract client_id from request - this is the verifier's identifier (e.g., x509_hash:...)
    const clientId = (request as any).client_id || request.clientId;

    // Build payload with the response data
    // Per HAIP spec: aud must be the verifier's client_id, nonce must match request nonce
    // vp_token can be: string, string[], or object with format keys (per OpenID4VP spec)
    const payload: any = {
      iss: "https://self-issued.me/v2", // Self-issued by wallet
      aud: clientId, // Must match verifier's client_id per spec step 3.4
      nonce: request.nonce, // Must match request nonce per spec step 3.2
      iat: now,
      exp: now + 600, // 10 minutes expiry
      vp_token: vpToken, // The actual VP token(s) - object format with format keys
      state: response.state,
    };

    return payload;
  }

  /**
   * Create encrypted JWE for the response
   * Encrypts the payload directly with verifier's public key
   * The decrypted result will be a JSON object with claims at top level
   */
  private async createEncryptedJWE(
    payload: any,
    request: AuthorizationRequest
  ): Promise<string> {
    try {
      // Extract verifier's public key from client_metadata
      const clientMetadata = (request as any).client_metadata;
      if (!clientMetadata?.jwks?.keys || clientMetadata.jwks.keys.length === 0) {
        throw new Error("No encryption key in client_metadata");
      }

      // Find the ECDH-ES key
      const encryptionKey = clientMetadata.jwks.keys.find(
        (key: any) => key.alg === "ECDH-ES" || key.use === "enc"
      );

      if (!encryptionKey) {
        throw new Error("No ECDH-ES key found");
      }

      // Get supported encryption algorithm (default to A128GCM)
      const encAlg = clientMetadata.encrypted_response_enc_values_supported?.[0] || "A128GCM";

      console.log(`[WalletSimulator] Creating encrypted JWE with ECDH-ES + ${encAlg}`);

      // Import verifier's public key
      const publicKey = await jose.importJWK(encryptionKey, "ECDH-ES");

      // Encrypt the payload directly as JSON
      // When decrypted, this will yield the claims object directly (top-level JSON object)
      const jwe = await new jose.CompactEncrypt(
        new TextEncoder().encode(JSON.stringify(payload))
      )
        .setProtectedHeader({
          alg: "ECDH-ES",
          enc: encAlg,
          kid: encryptionKey.kid,
        })
        .encrypt(publicKey);

      console.log(`[WalletSimulator] Response encrypted successfully`);
      return jwe;
    } catch (error) {
      console.error("[WalletSimulator] Encryption failed:", error);
      throw error;
    }
  }

  /**
   * POST response to response_uri
   * For direct_post.jwt response mode, wrap the response in a JWT and encrypt it
   */
  private async postResponse(
    responseUri: string,
    response: PresentationResponse,
    request: AuthorizationRequest
  ): Promise<{ success: boolean; error?: string; statusCode?: number }> {
    try {
      console.log(`[WalletSimulator] Posting response to: ${responseUri}`);

      // Access vp_token using snake_case (as returned by PresentationResponseAssembler)
      const vpToken = (response as any).vp_token || response.vpToken;

      if (!vpToken) {
        console.error("[WalletSimulator] No vp_token to post");
        return {
          success: false,
          error: "No vp_token available to post",
        };
      }

      // Build Response Object payload
      const payload = this.buildResponsePayload(response, request);

      console.log(`[WalletSimulator] Payload vp_token type: ${typeof payload.vp_token}`);
      console.log(`[WalletSimulator] Payload vp_token structure:`, JSON.stringify(payload.vp_token, null, 2).substring(0, 300));

      // Encrypt the response (payload as top-level JSON object)
      const encryptedResponse = await this.createEncryptedJWE(payload, request);

      // For direct_post.jwt, send as form-encoded with "response" parameter containing the encrypted JWT
      const formData = new URLSearchParams();
      formData.append("response", encryptedResponse);

      console.log(`[WalletSimulator] Posting Response JWT: ${encryptedResponse}`);
      console.log(`[WalletSimulator] VP Token count: ${Array.isArray(vpToken) ? vpToken.length : 1}`);

      const fetchResponse = await fetch(responseUri, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      const responseText = await fetchResponse.text();
      console.log(`[WalletSimulator] Response status: ${fetchResponse.status}`);
      console.log(`[WalletSimulator] Response body: ${responseText.substring(0, 200)}`);

      if (!fetchResponse.ok) {
        return {
          success: false,
          error: `HTTP ${fetchResponse.status}: ${fetchResponse.statusText}${responseText ? ` - ${responseText}` : ""}`,
          statusCode: fetchResponse.status,
        };
      }

      return {
        success: true,
        statusCode: fetchResponse.status,
      };
    } catch (error) {
      console.error(`[WalletSimulator] POST error:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
