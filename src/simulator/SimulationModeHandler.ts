/**
 * Simulation Mode Handler
 * Extracts simulation mode logic for reuse across different credential formats (SD-JWT, mDoc, etc.)
 * Provides methods to modify claims and metadata based on the selected simulation mode
 */

import { SimulationMode } from "../types/index.js";
import {
  PIDClaims,
  generateFakePIDData,
  generateExpiredPIDData,
  generateNotYetValidPIDData,
  filterRequestedClaims,
  addExtraClaims,
} from "./FakePIDData.js";

export interface CredentialMetadata {
  issuedAt: number;
  expiresAt: number;
  notBefore: number;
  issuer: string;
  nonce: string;
  audience: string;
}

export interface SimulationModeResult<T> {
  data: T;
  metadata: CredentialMetadata;
  modifiedForMode: boolean;
}

/**
 * Handler for simulation modes
 * Provides reusable methods for applying simulation logic to any credential format
 */
export class SimulationModeHandler {
  /**
   * Get claims appropriate for the simulation mode
   * Returns modified claims and a flag indicating if they were modified for the mode
   */
  static getClaimsForMode(
    mode: SimulationMode,
    requestedPaths: string[][]
  ): { claims: Partial<PIDClaims>; modifiedForMode: boolean } {
    let allClaims: Partial<PIDClaims>;
    let modifiedForMode = false;

    switch (mode) {
      case SimulationMode.EXPIRED:
        allClaims = generateExpiredPIDData();
        modifiedForMode = true;
        break;

      case SimulationMode.NOT_YET_VALID:
        allClaims = generateNotYetValidPIDData();
        modifiedForMode = true;
        break;

      case SimulationMode.MISSING_CLAIMS:
        // Return all claims but omit the last requested one
        allClaims = generateFakePIDData();
        // Omit the last requested attribute
        if (requestedPaths.length > 0) {
          const claimsWithMissing = filterRequestedClaims(
            allClaims,
            requestedPaths.slice(0, -1)
          );
          return { claims: claimsWithMissing, modifiedForMode: true };
        }
        return { claims: allClaims, modifiedForMode: true };

      case SimulationMode.OVER_DISCLOSURE:
        // Generate normal data first, then add extra claims
        allClaims = generateFakePIDData();
        const filteredClaims = filterRequestedClaims(allClaims, requestedPaths);
        const withExtra = addExtraClaims(filteredClaims);
        return { claims: withExtra, modifiedForMode: true };

      case SimulationMode.MODIFIED_CLAIMS:
        allClaims = generateFakePIDData();
        allClaims.given_name = "MODIFIED_NAME"; // Tamper with data
        modifiedForMode = true;
        break;

      case SimulationMode.VALID:
      default:
        allClaims = generateFakePIDData();
        break;
    }

    // Filter to only requested claims
    const claims = filterRequestedClaims(allClaims, requestedPaths);

    return { claims, modifiedForMode };
  }

  /**
   * Calculate credential metadata based on simulation mode
   * Applies timestamp modifications for EXPIRED and NOT_YET_VALID modes
   */
  static getMetadataForMode(
    mode: SimulationMode,
    issuer: string,
    nonce: string,
    audience: string = ""
  ): CredentialMetadata {
    const now = Math.floor(Date.now() / 1000);
    let expiresAt = now + 10 * 365 * 24 * 60 * 60; // 10 years from now
    let notBefore = now;

    // Adjust timestamps based on mode
    if (mode === SimulationMode.EXPIRED) {
      expiresAt = now - 24 * 60 * 60; // Expired yesterday
    } else if (mode === SimulationMode.NOT_YET_VALID) {
      notBefore = now + 24 * 60 * 60; // Valid tomorrow
    }

    return {
      issuedAt: now,
      expiresAt,
      notBefore,
      issuer,
      nonce,
      audience,
    };
  }

  /**
   * Get issuer based on simulation mode
   * Returns modified issuer for WRONG_ISSUER mode
   */
  static getIssuerForMode(mode: SimulationMode, defaultIssuer: string): string {
    return mode === SimulationMode.WRONG_ISSUER
      ? "did:example:wrong-issuer"
      : defaultIssuer;
  }

  /**
   * Get credential type (vct) based on simulation mode
   * Returns modified vct for WRONG_CREDENTIAL_TYPE mode
   */
  static getCredentialTypeForMode(
    mode: SimulationMode,
    defaultVct: string
  ): string {
    return mode === SimulationMode.WRONG_CREDENTIAL_TYPE
      ? "urn:eudi:wrong:type"
      : defaultVct;
  }

  /**
   * Get nonce based on simulation mode
   * Returns modified nonce for WRONG_NONCE mode
   */
  static getNonceForMode(mode: SimulationMode, nonce: string): string {
    return mode === SimulationMode.WRONG_NONCE ? "wrong-nonce-12345" : nonce;
  }

  /**
   * Get audience based on simulation mode
   * Returns modified audience for WRONG_AUDIENCE mode
   */
  static getAudienceForMode(mode: SimulationMode, audience: string): string {
    return mode === SimulationMode.WRONG_AUDIENCE ? "wrong-audience" : audience;
  }

  /**
   * Check if signature should be included
   * Returns false for MISSING_SIGNATURE mode
   */
  static shouldIncludeSignature(mode: SimulationMode): boolean {
    return mode !== SimulationMode.MISSING_SIGNATURE;
  }

  /**
   * Check if signature should be invalid
   * Returns true for INVALID_SIGNATURE mode
   */
  static shouldUseInvalidSignature(mode: SimulationMode): boolean {
    return mode === SimulationMode.INVALID_SIGNATURE;
  }

  /**
   * Check if holder binding should be included
   * Returns false for MISSING_HOLDER_BINDING mode
   */
  static shouldIncludeHolderBinding(mode: SimulationMode): boolean {
    return mode !== SimulationMode.MISSING_HOLDER_BINDING;
  }

  /**
   * Check if the mode represents a valid credential
   * Used to determine if credential should pass validation
   */
  static isValidMode(mode: SimulationMode): boolean {
    return mode === SimulationMode.VALID;
  }

  /**
   * Get all simulation modes that modify credential structure
   * Useful for determining which tests need special handling
   */
  static getStructuralModifyingModes(): SimulationMode[] {
    return [
      SimulationMode.MISSING_HOLDER_BINDING,
      SimulationMode.MISSING_SIGNATURE,
      SimulationMode.INVALID_SIGNATURE,
    ];
  }

  /**
   * Get all simulation modes that modify claim content
   * Useful for determining which tests verify claim validation
   */
  static getClaimModifyingModes(): SimulationMode[] {
    return [
      SimulationMode.EXPIRED,
      SimulationMode.NOT_YET_VALID,
      SimulationMode.MISSING_CLAIMS,
      SimulationMode.OVER_DISCLOSURE,
      SimulationMode.MODIFIED_CLAIMS,
    ];
  }

  /**
   * Get description of what a simulation mode does
   * Useful for logging and documentation
   */
  static getModeDescription(mode: SimulationMode): string {
    switch (mode) {
      case SimulationMode.VALID:
        return "Valid credential with all requested claims";
      case SimulationMode.EXPIRED:
        return "Expired credential (exp claim in past)";
      case SimulationMode.NOT_YET_VALID:
        return "Not-yet-valid credential (nbf claim in future)";
      case SimulationMode.MISSING_CLAIMS:
        return "Credential missing the last requested claim";
      case SimulationMode.OVER_DISCLOSURE:
        return "Credential with extra claims not requested";
      case SimulationMode.MODIFIED_CLAIMS:
        return "Credential with tampered claim values";
      case SimulationMode.MISSING_SIGNATURE:
        return "Credential without signature (invalid structure)";
      case SimulationMode.INVALID_SIGNATURE:
        return "Credential with invalid signature (signed with wrong key)";
      case SimulationMode.MISSING_HOLDER_BINDING:
        return "Credential without holder binding (KB-JWT)";
      case SimulationMode.WRONG_ISSUER:
        return "Credential with wrong issuer DID";
      case SimulationMode.WRONG_CREDENTIAL_TYPE:
        return "Credential with wrong credential type (vct)";
      case SimulationMode.WRONG_NONCE:
        return "Holder binding with wrong nonce";
      case SimulationMode.WRONG_AUDIENCE:
        return "Holder binding with wrong audience";
      default:
        return "Unknown simulation mode";
    }
  }
}
