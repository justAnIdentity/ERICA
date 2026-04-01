/**
 * SD-JWT Generator
 * Creates signed and formatted SD-JWT credentials
 * Reference: https://datatracker.ietf.org/doc/draft-ietf-oauth-selective-disclosure-jwt/
 */

import crypto from "crypto";
import { KeyManager } from "./KeyManager.js";
import { CredentialTemplate, SDJWTCredentialPayload, DiagnosticEvent } from "./CredentialTemplate.js";
import { MatchedCredential } from "./CredentialMatcher.js";
import { PIDDataGenerator } from "./PIDDataGenerator.js";
import type { DecodedVPToken } from "./CredoSDJWTGenerator.js";

export interface GeneratedCredential {
  credentialId: string; // The ID from the DCQL request (e.g., "pid-sd-jwt")
  format: "dc+sd-jwt" | "mso_mdoc";
  vp: string; // The actual credential (SD-JWT format for dc+sd-jwt)
  diagnostics: DiagnosticEvent[];
  decoded?: DecodedVPToken; // NEW: Decoded structure for inspection
}

export class SDJWTGenerator {
  private keyManager: KeyManager;
  private credentialTemplate: CredentialTemplate;
  private diagnostics: DiagnosticEvent[] = [];

  constructor() {
    this.keyManager = KeyManager.getInstance();
    this.credentialTemplate = new CredentialTemplate();
  }

  /**
   * Generate an SD-JWT credential from matched credential data
   */
  generateSDJWT(matched: MatchedCredential): GeneratedCredential {
    this.diagnostics = [];

    this.addDiagnostic("SD-JWT generation started", {
      credentialId: matched.credential.id,
      format: matched.credential.format,
      requestedClaims: matched.requestedClaimPaths.length,
    });

    // Build credential payload
    const { payload } = this.credentialTemplate.buildSDJWTPayload(matched.credential);
    this.addDiagnostic("Credential payload built");

    // Filter payload to only requested claims
    const { filteredPayload, includedClaims, missingClaims } =
      this.credentialTemplate.filterPayloadByRequest(payload, matched.requestedClaimPaths);

    this.addDiagnostic("Claims filtered", {
      included: includedClaims.length,
      missing: missingClaims.length,
    });

    // Create SD-JWT
    const sdJwt = this.createSDJWT(filteredPayload);

    this.addDiagnostic("SD-JWT created and signed", {
      algorithm: "ES256",
      keyId: this.keyManager.getKeyId(),
    });

    return {
      credentialId: matched.credentialId,
      format: matched.credential.format,
      vp: sdJwt,
      diagnostics: [...this.diagnostics],
    };
  }

  /**
   * Create SD-JWT with selective disclosure
   * Format: BASE64URL(UTF8(JWTHeader)) || '.' || BASE64URL(UTF8(JWTClaims)) || '.' || BASE64URL(JWTSignature) || '~' || disclosure1 || '~' || disclosure2 || ...
   */
  private createSDJWT(payload: SDJWTCredentialPayload): string {
    // JWT Header
    const header = {
      alg: "ES256",
      typ: "sd-jwt",
      kid: this.keyManager.getKeyId(),
    };

    // Encode header and payload
    const encodedHeader = this.base64urlEncode(JSON.stringify(header));
    const encodedPayload = this.base64urlEncode(JSON.stringify(payload));

    // Create signing input
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    // Sign
    const signatureBuffer = this.keyManager.sign(Buffer.from(signingInput));
    const encodedSignature = this.base64urlEncode(signatureBuffer);

    // For now, create basic SD-JWT without disclosures
    // Full SD-JWT with disclosures would go here: signingInput + '.' + encodedSignature + '~' + disclosures
    const sdJwt = `${signingInput}.${encodedSignature}`;

    this.addDiagnostic("JWT signed successfully", {
      signatureLength: encodedSignature.length,
    });

    return sdJwt;
  }

  /**
   * Base64url encode (RFC 4648)
   */
  private base64urlEncode(input: string | Buffer): string {
    const buffer = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
    return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  /**
   * Decode base64url
   */
  private base64urlDecode(input: string): string {
    // Add padding if needed
    const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
    return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  }

  /**
   * Parse and decode an SD-JWT for inspection
   */
  parseSDJWT(sdJwt: string): {
    header: Record<string, any>;
    payload: Record<string, any>;
    signature: string;
    raw: {
      header: string;
      payload: string;
      signature: string;
    };
  } {
    const parts = sdJwt.split(".");

    if (parts.length < 3) {
      throw new Error("Invalid JWT format");
    }

    const header = JSON.parse(this.base64urlDecode(parts[0]));
    const payload = JSON.parse(this.base64urlDecode(parts[1]));
    const signature = parts[2];

    return {
      header,
      payload,
      signature,
      raw: {
        header: parts[0],
        payload: parts[1],
        signature: parts[2],
      },
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

export default SDJWTGenerator;
