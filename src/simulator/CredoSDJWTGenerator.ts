/**
 * SD-JWT Generator (Phase 2 - With Real Cryptography)
 * Generates SD-JWT Verifiable Credentials for German PID with proper ES256 signatures
 *
 * Implements proper cryptographic signing using EC P-256 keys
 */

import crypto from "crypto";
import { SimulationMode } from "../types/index.js";
import { PIDClaims, generateFakePIDData, filterRequestedClaims, generateExpiredPIDData, generateNotYetValidPIDData, generateIncompletePIDData, addExtraClaims } from "./FakePIDData.js";
import { ISSUER_KEY, HOLDER_KEY, ISSUER_DID, HOLDER_DID, INVALID_SIGNATURE_KEY } from "./TestKeys.js";
import { SimulationModeHandler } from "./SimulationModeHandler.js";

export interface SDJWTGenerationOptions {
  mode: SimulationMode;
  requestedClaims: string[][]; // Array of JSON paths
  nonce: string;
  audience?: string;
  state?: string;
}

export interface DecodedJWT {
  header: Record<string, any>;
  payload: Record<string, any>;
  signature: string;
}

export interface DecodedVPToken {
  format: 'sd-jwt';
  jwt: DecodedJWT;
  disclosures: string[];
  kbJwt?: DecodedJWT;
  metadata: {
    algorithm: string;
    type: string;
    keyId?: string;
    issuer?: string;
    subject?: string;
    issuedAt?: number;
    expiresAt?: number;
    notBefore?: number;
    credentialType?: string;
    audience?: string;
  };
  holderBinding?: {
    nonce: string;
    audience: string;
    issuedAt: number;
    expiresAt: number;
  };
}

export interface SDJWTGenerationResult {
  sdJwtVc: string; // The complete SD-JWT~disclosures~KB-JWT string
  claims: Partial<PIDClaims>;
  mode: SimulationMode;
  decoded: DecodedVPToken; // NEW: Decoded structure for easy inspection
}

export class CredoSDJWTGenerator {
  /**
   * Phase 1: No agent initialization needed
   * We'll use basic crypto functions to generate JWTs
   * Phase 2 will integrate full Credo functionality
   */

  /**
   * Generate SD-JWT credential based on mode
   */
  async generate(options: SDJWTGenerationOptions): Promise<SDJWTGenerationResult> {

    // Get PID claims based on mode
    const { claims, modifiedForMode } = this.getClaimsForMode(options.mode, options.requestedClaims);

    // Build the SD-JWT and get decoded structure
    const { sdJwtVc, decoded } = await this.buildSDJWT(claims, options, modifiedForMode);

    return {
      sdJwtVc,
      claims,
      mode: options.mode,
      decoded,
    };
  }

  /**
   * Get PID claims appropriate for the simulation mode
   */
  private getClaimsForMode(mode: SimulationMode, requestedPaths: string[][]): { claims: Partial<PIDClaims>; modifiedForMode: boolean } {
    return SimulationModeHandler.getClaimsForMode(mode, requestedPaths);
  }

  /**
   * Build the SD-JWT credential with proper ES256 signature and selective disclosures
   */
  private async buildSDJWT(
    claims: Partial<PIDClaims>,
    options: SDJWTGenerationOptions,
    modifiedForMode: boolean
  ): Promise<{ sdJwtVc: string; decoded: DecodedVPToken }> {
    // Get metadata based on simulation mode
    const metadata = SimulationModeHandler.getMetadataForMode(
      options.mode,
      ISSUER_DID,
      options.nonce,
      options.audience
    );

    const now = Math.floor(Date.now() / 1000);
    const issuedAt = metadata.issuedAt;
    const expiresAt = metadata.expiresAt;
    const notBefore = metadata.notBefore;

    // Build JWT header
    const header = {
      alg: "ES256",
      typ: "vc+sd-jwt",
      kid: ISSUER_KEY.publicKeyJwk.kid,
    };

    // Handle issuer based on simulation mode
    const issuer = SimulationModeHandler.getIssuerForMode(options.mode, ISSUER_DID);

    // Handle credential type based on simulation mode
    const vct = SimulationModeHandler.getCredentialTypeForMode(
      options.mode,
      "urn:eudi:pid:de:1"
    );

    // Separate structural claims from user claims
    // Include cnf (confirmation) claim with holder's public key per RFC 7800
    // This is a non-disclosed structural claim - the verifier needs it to verify KB-JWT
    const { d: _d, ...holderPublicKeyJwk } = HOLDER_KEY.publicKeyJwk as any;
    const structuralClaims = {
      iss: issuer,
      sub: HOLDER_DID,
      iat: issuedAt,
      exp: expiresAt,
      nbf: notBefore,
      vct: vct,
      cnf: { jwk: holderPublicKeyJwk },
      _sd_alg: "sha-256", // Hash algorithm for selective disclosure
    };

    if (options.audience) {
      (structuralClaims as any).aud = options.audience;
    }

    // Generate selective disclosures for user claims
    const { disclosures, disclosureHashes } = this.generateDisclosures(claims);

    // Build JWT payload with _sd array containing hashes
    const payload = {
      ...structuralClaims,
      _sd: disclosureHashes, // Array of disclosure hashes
    };

    // Encode header and payload
    const headerB64 = this.base64urlEncode(JSON.stringify(header));
    const payloadB64 = this.base64urlEncode(JSON.stringify(payload));

    // Create signing input
    const signingInput = `${headerB64}.${payloadB64}`;

    // Sign with issuer's private key
    let signature: string;

    // Handle signature manipulation modes
    if (SimulationModeHandler.shouldUseInvalidSignature(options.mode)) {
      // Sign with a different key to create an invalid signature that verifies with wrong key
      signature = this.signES256(signingInput, INVALID_SIGNATURE_KEY.privateKeyJwk);
    } else if (!SimulationModeHandler.shouldIncludeSignature(options.mode)) {
      // No signature
      signature = "";
    } else {
      // Create valid ES256 signature with the issuer's key
      signature = this.signES256(signingInput, ISSUER_KEY.privateKeyJwk);
    }

    // Build SD-JWT structure: JWT~disclosure1~disclosure2~...~KB-JWT
    const jwt = `${signingInput}.${signature}`;
    const disclosuresString = disclosures.join("~");

    // Build the presentation prefix (everything before KB-JWT) for sd_hash computation
    // Per SD-JWT spec, sd_hash = base64url(SHA-256(<issuer-JWT>~<disc1>~...~<discN>~))
    const presentationPrefix = `${jwt}~${disclosuresString}~`;

    const { kbJwtString, kbJwtDecoded, holderBinding } = this.buildKeyBindingJWT(
      options.nonce, options.audience || "", options.mode, presentationPrefix
    );

    const sdJwtVc = `${presentationPrefix}${kbJwtString}`;

    // Build decoded structure - showing actual JWT payload (without disclosed values)
    // Disclosed values are only in the disclosures, NOT in the JWT payload
    const decoded: DecodedVPToken = {
      format: 'sd-jwt',
      jwt: {
        header,
        payload: payload, // Actual JWT payload (only structural claims + _sd hashes)
        signature,
      },
      disclosures: disclosures,
      kbJwt: kbJwtDecoded,
      metadata: {
        algorithm: header.alg,
        type: header.typ,
        keyId: header.kid,
        issuer: payload.iss,
        subject: payload.sub,
        issuedAt: payload.iat,
        expiresAt: payload.exp,
        notBefore: payload.nbf,
        credentialType: payload.vct,
        audience: (payload as any).aud,
      },
      holderBinding,
    };

    return { sdJwtVc, decoded };
  }

  /**
   * Generate selective disclosures for user claims
   * Returns base64url-encoded disclosure strings and their SHA-256 hashes
   */
  private generateDisclosures(claims: Partial<PIDClaims>): {
    disclosures: string[];
    disclosureHashes: string[];
  } {
    const disclosures: string[] = [];
    const disclosureHashes: string[] = [];

    for (const [claimName, claimValue] of Object.entries(claims)) {
      // Skip null/undefined values
      if (claimValue === null || claimValue === undefined) {
        continue;
      }

      // Generate random salt (16 bytes = 128 bits)
      const salt = crypto.randomBytes(16).toString('base64url');

      // Create disclosure array: [salt, claim_name, claim_value]
      const disclosureArray = [salt, claimName, claimValue];

      // Base64url encode the disclosure
      const disclosureJson = JSON.stringify(disclosureArray);
      const disclosureEncoded = this.base64urlEncode(disclosureJson);

      // Calculate SHA-256 hash of the encoded disclosure
      const hash = crypto.createHash('sha256')
        .update(disclosureEncoded)
        .digest('base64url');

      disclosures.push(disclosureEncoded);
      disclosureHashes.push(hash);
    }

    return { disclosures, disclosureHashes };
  }

  /**
   * Build Key Binding JWT (KB-JWT) for holder binding
   */
  private buildKeyBindingJWT(nonce: string, audience: string, mode: SimulationMode, presentationPrefix: string): {
    kbJwtString: string;
    kbJwtDecoded?: DecodedJWT;
    holderBinding?: {
      nonce: string;
      audience: string;
      issuedAt: number;
      expiresAt: number;
    };
  } {
    // Handle MISSING_HOLDER_BINDING mode
    if (!SimulationModeHandler.shouldIncludeHolderBinding(mode)) {
      return { kbJwtString: "", kbJwtDecoded: undefined, holderBinding: undefined }; // No KB-JWT
    }

    const now = Math.floor(Date.now() / 1000);

    // KB-JWT header
    const header = {
      alg: "ES256",
      typ: "kb+jwt",
      kid: HOLDER_KEY.publicKeyJwk.kid,
    };

    // Get nonce and audience based on simulation mode
    const actualNonce = SimulationModeHandler.getNonceForMode(mode, nonce);
    const actualAudience = SimulationModeHandler.getAudienceForMode(mode, audience);

    // Compute sd_hash: base64url(SHA-256(presentationPrefix))
    const sdHash = crypto.createHash('sha256')
      .update(presentationPrefix, 'utf-8')
      .digest('base64url');

    // KB-JWT payload
    const payload = {
      nonce: actualNonce,
      aud: actualAudience,
      iat: now,
      exp: now + 300, // Valid for 5 minutes
      sd_hash: sdHash,
    };

    // Encode
    const headerB64 = this.base64urlEncode(JSON.stringify(header));
    const payloadB64 = this.base64urlEncode(JSON.stringify(payload));

    // Sign with holder's private key
    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = this.signES256(signingInput, HOLDER_KEY.privateKeyJwk);

    const kbJwtString = `${signingInput}.${signature}`;

    return {
      kbJwtString,
      kbJwtDecoded: {
        header,
        payload,
        signature,
      },
      holderBinding: {
        nonce: actualNonce,
        audience: actualAudience,
        issuedAt: payload.iat,
        expiresAt: payload.exp,
      },
    };
  }

  /**
   * Sign data using ES256 (ECDSA with P-256 and SHA-256)
   */
  private signES256(data: string, privateKeyJwk: any): string {
    // Convert JWK to PEM format for Node.js crypto
    const privateKey = crypto.createPrivateKey({
      key: {
        kty: privateKeyJwk.kty,
        crv: privateKeyJwk.crv,
        x: privateKeyJwk.x,
        y: privateKeyJwk.y,
        d: privateKeyJwk.d,
      },
      format: "jwk",
    });

    // Sign the data
    const signature = crypto.sign(
      "sha256",
      Buffer.from(data, "utf-8"),
      {
        key: privateKey,
        dsaEncoding: "ieee-p1363", // Raw signature format for JWT (R || S)
      }
    );

    // Return base64url-encoded signature
    return this.base64urlEncode(signature);
  }

  /**
   * Base64url encode
   */
  private base64urlEncode(input: string | Buffer): string {
    const buffer = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
    return buffer
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }

  /**
   * Cleanup resources (no-op in Phase 1)
   */
  async shutdown(): Promise<void> {
    // Phase 1: No resources to cleanup
    // Phase 2: Will shutdown Credo agent
  }
}

// Singleton instance
let generatorInstance: CredoSDJWTGenerator | null = null;

/**
 * Get the singleton SD-JWT generator instance
 */
export function getSDJWTGenerator(): CredoSDJWTGenerator {
  if (!generatorInstance) {
    generatorInstance = new CredoSDJWTGenerator();
  }
  return generatorInstance;
}

/**
 * Shutdown the generator (cleanup)
 */
export async function shutdownSDJWTGenerator(): Promise<void> {
  if (generatorInstance) {
    await generatorInstance.shutdown();
    generatorInstance = null;
  }
}
