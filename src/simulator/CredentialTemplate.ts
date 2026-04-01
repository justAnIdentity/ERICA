/**
 * Credential Template
 * Defines SD-JWT PID credential structure per German EUDI Wallet spec
 * Maps between DCQL request claims and credential claims
 */

import { PIDCredentialClaims, PIDDataGenerator } from "./PIDDataGenerator.js";

export interface SDJWTCredentialPayload {
  // Issuer information
  iss: string; // Issuer URL
  iat: number; // Issued at (unix timestamp)
  exp: number; // Expiration (unix timestamp)

  // Subject information (the actual credential claims)
  given_name?: string;
  family_name?: string;
  birthdate?: string;
  address?: {
    street_address?: string;
    postal_code?: string;
    locality?: string;
    country?: string;
  };
  nationalities?: string[];
  gender?: string;
  birth_place?: string;
  birth_country?: string;
  age_over_18?: boolean;
  age_over_21?: boolean;

  // SD-JWT specific
  _sd?: string[]; // Array of hashes of selectively disclosable claims
  _sd_alg?: string; // Hash algorithm used (sha-256)
}

export interface DiagnosticEvent {
  timestamp: number;
  event: string;
  details?: Record<string, any>;
}

export class CredentialTemplate {
  private issuer = "https://wallet-simulator.local";
  private expirationSeconds = 365 * 24 * 60 * 60; // 1 year
  private diagnostics: DiagnosticEvent[] = [];

  /**
   * Build an SD-JWT credential payload from PID data
   */
  buildSDJWTPayload(pidCredential: ReturnType<typeof PIDDataGenerator.generatePIDCredential>): {
    payload: SDJWTCredentialPayload;
    diagnostics: DiagnosticEvent[];
  } {
    this.diagnostics = [];
    const now = Math.floor(Date.now() / 1000);
    const exp = now + this.expirationSeconds;

    this.addDiagnostic("Payload creation started", {
      issuer: this.issuer,
      issuedAt: new Date(now * 1000).toISOString(),
      expiresAt: new Date(exp * 1000).toISOString(),
    });

    // Convert PID claims to payload
    const payload: SDJWTCredentialPayload = {
      iss: this.issuer,
      iat: now,
      exp: exp,
      ...pidCredential.claims,
      _sd_alg: "sha-256",
    };

    this.addDiagnostic("SD-JWT payload created", {
      claimsCount: Object.keys(pidCredential.claims).length,
      selectivelyDisclosable: pidCredential.selectivelyDisclosableClaims?.length ?? 0,
    });

    return {
      payload,
      diagnostics: [...this.diagnostics],
    };
  }

  /**
   * Filter credential payload based on requested claims
   * Returns only the claims that were requested
   */
  filterPayloadByRequest(
    payload: SDJWTCredentialPayload,
    requestedClaimPaths: string[][]
  ): {
    filteredPayload: SDJWTCredentialPayload;
    includedClaims: string[];
    missingClaims: string[];
  } {
    const includedClaims: string[] = [];
    const missingClaims: string[] = [];
    const filtered: SDJWTCredentialPayload = {
      iss: payload.iss,
      iat: payload.iat,
      exp: payload.exp,
      _sd_alg: payload._sd_alg,
    };

    for (const pathArray of requestedClaimPaths) {
      const claimKey = pathArray.join(".");
      const value = this.getNestedValue(payload, pathArray);

      if (value !== undefined) {
        this.setNestedValue(filtered, pathArray, value);
        includedClaims.push(claimKey);
        this.addDiagnostic(`Claim included: ${claimKey}`, { value: typeof value });
      } else {
        missingClaims.push(claimKey);
        this.addDiagnostic(`Claim requested but not available: ${claimKey}`);
      }
    }

    return {
      filteredPayload: filtered,
      includedClaims,
      missingClaims,
    };
  }

  /**
   * Validate that all requested claims are available
   */
  validateClaimsAvailable(payload: SDJWTCredentialPayload, requestedClaimPaths: string[][]): {
    valid: boolean;
    missing: string[];
  } {
    const missing: string[] = [];

    for (const pathArray of requestedClaimPaths) {
      const value = this.getNestedValue(payload, pathArray);
      if (value === undefined) {
        missing.push(pathArray.join("."));
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Get the standard PID credential structure for SD-JWT
   */
  static getPIDCredentialStructure(): {
    requiredClaims: string[];
    optionalClaims: string[];
    selectivelyDisclosableClaims: string[];
  } {
    return {
      requiredClaims: ["given_name", "family_name", "birthdate"],
      optionalClaims: [
        "address.street_address",
        "address.postal_code",
        "address.locality",
        "address.country",
        "nationalities",
        "gender",
        "birth_place",
        "birth_country",
        "age_over_18",
        "age_over_21",
      ],
      selectivelyDisclosableClaims: [
        "given_name",
        "family_name",
        "birthdate",
        "address.street_address",
        "address.postal_code",
        "address.locality",
        "address.country",
        "nationalities",
        "gender",
        "birth_place",
        "birth_country",
        "age_over_18",
        "age_over_21",
      ],
    };
  }

  /**
   * Get value from nested object using path array
   */
  private getNestedValue(obj: any, path: string[]): any {
    let current = obj;
    for (const key of path) {
      current = current?.[key];
    }
    return current;
  }

  /**
   * Set value in nested object using path array
   */
  private setNestedValue(obj: any, path: string[], value: any): void {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    current[path[path.length - 1]] = value;
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

  /**
   * Clear diagnostics
   */
  clearDiagnostics(): void {
    this.diagnostics = [];
  }
}

export default CredentialTemplate;
