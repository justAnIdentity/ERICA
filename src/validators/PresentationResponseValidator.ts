/**
 * Presentation Response Validator (RP-side)
 * Validates cryptography, trust, and semantic correctness of wallet responses
 *
 * Reference: https://bmi.usercontent.opencode.de/eudi-wallet/developer-guide/rp/PID_Presentation/
 *
 * Implements layered validation:
 * 1. Structure - Check required fields and format
 * 2. VP Token - Validate JWT structure and signatures
 * 3. Credentials - Verify claims and disclosures
 * 4. Holder Binding - Validate KB-JWT (nonce, audience)
 * 5. Trust - Verify issuer trust (placeholder for future)
 */

import {
  PresentationResponse,
  AuthorizationRequest,
  ValidationResult,
  ValidationIssue,
  ValidationCheck,
  ValidationSummary,
  Severity,
  ValidationErrorCategory,
  DecodedVPToken,
  SpecReference,
  JsonWebKey,
  JWTPayload,
  DCQLCredential
} from "../types/index.js";
import crypto from "crypto";
import { ISSUER_KEY, HOLDER_KEY } from "../simulator/TestKeys.js";
import { normalizeClaimName, claimNamesMatch } from "../utils/ClaimNameMapper.js";
import { logger } from "../utils/Logger.js";


export interface IPresentationResponseValidator {
  validate(
    response: PresentationResponse,
    request: AuthorizationRequest
  ): Promise<ValidationResult>;
}

export class PresentationResponseValidator implements IPresentationResponseValidator {
  async validate(
    response: PresentationResponse,
    request: AuthorizationRequest
  ): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    const checks: ValidationCheck[] = [];

    // 1. Structure validation
    this.validateStructure(response, checks, issues);

    // Early exit if critical structure errors
    const hasCriticalErrors = issues.some((e) => e.severity === Severity.ERROR);
    if (hasCriticalErrors) {
      return {
        valid: false,
        errors: issues.filter((e) => e.severity === Severity.ERROR),
        warnings: issues.filter((e) => e.severity === Severity.WARNING),
        checks: checks,
        summary: this.generateSummary(checks, issues),
      };
    }

    // 2. VP Token validation
    this.validateVPTokens(response, checks, issues);

    // 3. Holder binding validation (KB-JWT)
    this.validateHolderBinding(response, request, checks, issues);

    // 4. Signature validation
    this.validateSignatures(response, checks, issues);

    // 5. Claims validation
    this.validateClaims(response, request, checks, issues);

    // 6. Timing validation
    this.validateTiming(response, checks, issues);

    return {
      valid: issues.every((e) => e.severity !== Severity.ERROR),
      errors: issues.filter((e) => e.severity === Severity.ERROR),
      warnings: issues.filter((e) => e.severity === Severity.WARNING),
      checks: checks,
      summary: this.generateSummary(checks, issues),
    };
  }

  /**
   * Helper: Add a detailed validation check
   */
  private addCheck(
    checks: ValidationCheck[],
    checkId: string,
    checkName: string,
    passed: boolean,
    category: string,
    severity: Severity,
    options: {
      subcategory?: string;
      field?: string;
      expectedValue?: string;
      actualValue?: string;
      details?: string;
      issue?: string;
      suggestedFix?: string;
      specReference?: SpecReference;
    }
  ): void {
    checks.push({
      checkId,
      checkName,
      passed,
      category,
      severity,
      ...options,
    });
  }

  /**
   * 1. Structure Validation
   */
  private validateStructure(
    response: PresentationResponse,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    const category = "Structure";
    const subcategory = "Required Fields";
    const specRef: SpecReference = {
      spec: "OpenID4VP-HAIP",
      section: "6.1",
      url: "https://openid.net/specs/openid-4-verifiable-presentations-1_0.html",
    };

    // Check 1: vp_token presence
    const hasVPToken = !!response.vp_token;
    this.addCheck(
      checks,
      "structure.vp_token.presence",
      "VP Token Presence",
      hasVPToken,
      category,
      Severity.ERROR,
      {
        subcategory,
        field: "vp_token",
        expectedValue: "Non-empty string or array",
        actualValue: hasVPToken ? "present" : "undefined",
        issue: hasVPToken ? undefined : "Missing required field: vp_token",
        suggestedFix: hasVPToken ? undefined : "Ensure wallet sends vp_token in response",
        specReference: specRef,
      }
    );

    if (!hasVPToken) {
      issues.push({
        category: ValidationErrorCategory.STRUCTURE_VIOLATION,
        field: "vp_token",
        issue: "Missing required field",
        severity: Severity.ERROR,
        specReference: specRef,
        suggestedFix: "Ensure wallet sends vp_token in response",
      });
    }

    // Check 2: vp_token format (object with credential IDs as keys)
    if (hasVPToken && response.vp_token) {
      const isObject = typeof response.vp_token === 'object' && response.vp_token !== null && !Array.isArray(response.vp_token);
      const isValidFormat = isObject && Object.keys(response.vp_token as object).length > 0;

      this.addCheck(
        checks,
        "structure.vp_token.format",
        "VP Token Format",
        isValidFormat,
        category,
        Severity.ERROR,
        {
          subcategory,
          field: "vp_token",
          expectedValue: "Object with credential IDs as keys (e.g., { \"pid-sd-jwt\": [\"eyJ...\"], \"pid-mso-mdoc\": [...] })",
          actualValue: isObject ? `object with ${Object.keys(response.vp_token as object).length} key(s)` : typeof response.vp_token,
          issue: isValidFormat ? undefined : "vp_token must be an object with credential IDs as keys, values as string arrays",
          suggestedFix: isValidFormat ? undefined : "Format vp_token as { \"credential-id\": [\"token1\", ...] }",
          specReference: specRef,
        }
      );

      if (!isValidFormat) {
        issues.push({
          category: ValidationErrorCategory.STRUCTURE_VIOLATION,
          field: "vp_token",
          issue: "vp_token must be an object with credential IDs as keys, values as string arrays",
          severity: Severity.ERROR,
          specReference: specRef,
        });
      }
    }

    // Check 3: state field (if present in request, should be in response)
    // Note: We'd need the request to validate this properly
    // For now, just check if state exists when it should
  }

  /**
   * 2. VP Token Validation
   */
  private validateVPTokens(
    response: PresentationResponse,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    const category = "VP Token";
    const decodedTokens = response.decodedVPTokens || [];

    // Check 1: VP tokens decoded successfully
    // Convert vpToken to array to count tokens
    let vpTokenArray: string[] = [];
    if (!response.vp_token) {
      // No vp_token at all (this should have been caught by structure validation)
      vpTokenArray = [];
    } else if (typeof response.vp_token === 'string') {
      vpTokenArray = [response.vp_token];
    } else if (Array.isArray(response.vp_token)) {
      vpTokenArray = response.vp_token.filter(t => t && typeof t === 'string');
    } else if (typeof response.vp_token === 'object' && response.vp_token !== null) {
      // Object format: { "pid-sd-jwt": ["token1"], "pid-mso-mdoc": ["token2"] }
      // Extract all token arrays and flatten them
      vpTokenArray = Object.values(response.vp_token)
        .filter(val => Array.isArray(val)) // Ensure value is an array
        .flat()
        .filter(t => t && typeof t === 'string') as string[];
    }
    const expectedCount = vpTokenArray.length;
    const actualCount = decodedTokens.length;
    const allDecoded = actualCount === expectedCount;

    this.addCheck(
      checks,
      "vp_token.decoding",
      "VP Token Decoding",
      allDecoded,
      category,
      Severity.ERROR,
      {
        subcategory: "JWT Structure",
        expectedValue: `${expectedCount} decoded token(s)`,
        actualValue: `${actualCount} decoded token(s)`,
        issue: allDecoded ? undefined : "Some VP tokens could not be decoded",
        suggestedFix: allDecoded ? undefined : "Ensure tokens are valid JWT format",
      }
    );

    if (!allDecoded) {
      issues.push({
        category: ValidationErrorCategory.STRUCTURE_VIOLATION,
        field: "vp_token",
        issue: `Expected ${expectedCount} decoded tokens but got ${actualCount}`,
        severity: Severity.ERROR,
        suggestedFix: "Ensure tokens are valid JWT format",
      });
    }

    // Validate each decoded token
    decodedTokens.forEach((token, idx) => {
      this.validateDecodedToken(token, idx, checks, issues);
    });
  }

  /**
   * Validate individual decoded VP token
   */
  private validateDecodedToken(
    token: DecodedVPToken,
    index: number,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    const category = "VP Token";
    const prefix = `vp_token[${index}]`;

    // Check: JWT header algorithm
    const algorithm = token.metadata.algorithm;
    const supportedAlgs = ['ES256', 'ES384', 'ES512', 'EdDSA'];
    const validAlg = supportedAlgs.includes(algorithm);

    this.addCheck(
      checks,
      `${prefix}.algorithm`,
      `Token ${index + 1}: Algorithm`,
      validAlg,
      category,
      Severity.WARNING,
      {
        subcategory: "Cryptography",
        field: `${prefix}.algorithm`,
        expectedValue: supportedAlgs.join(', '),
        actualValue: algorithm,
        issue: validAlg ? undefined : `Unsupported algorithm: ${algorithm}`,
        suggestedFix: validAlg ? undefined : `Use one of: ${supportedAlgs.join(', ')}`,
      }
    );

    if (!validAlg) {
      issues.push({
        category: ValidationErrorCategory.CRYPTO_FAILURE,
        field: `${prefix}.algorithm`,
        issue: `Unsupported algorithm: ${algorithm}`,
        severity: Severity.WARNING,
        suggestedFix: `Use one of: ${supportedAlgs.join(', ')}`,
      });
    }

    // Check: Issuer presence
    const hasIssuer = !!token.metadata.issuer;
    this.addCheck(
      checks,
      `${prefix}.issuer`,
      `Token ${index + 1}: Issuer`,
      hasIssuer,
      category,
      Severity.ERROR,
      {
        subcategory: "JWT Claims",
        field: `${prefix}.iss`,
        expectedValue: "Non-empty string",
        actualValue: hasIssuer ? "present" : "missing",
        issue: hasIssuer ? undefined : "Missing issuer claim",
        suggestedFix: hasIssuer ? undefined : "Credential must include iss claim",
      }
    );

    if (!hasIssuer) {
      issues.push({
        category: ValidationErrorCategory.STRUCTURE_VIOLATION,
        field: `${prefix}.iss`,
        issue: "Missing issuer claim",
        severity: Severity.ERROR,
      });
    }

    // Check: Credential type
    const hasCredentialType = !!token.metadata.credentialType;
    this.addCheck(
      checks,
      `${prefix}.credential_type`,
      `Token ${index + 1}: Credential Type`,
      hasCredentialType,
      category,
      Severity.WARNING,
      {
        subcategory: "JWT Claims",
        field: `${prefix}.vct`,
        expectedValue: "Credential type specified",
        actualValue: hasCredentialType ? token.metadata.credentialType : "missing",
        details: hasCredentialType ? `Type: ${token.metadata.credentialType}` : "No credential type found",
      }
    );

    // Check: Disclosures (for SD-JWT)
    if (token.format === 'sd-jwt') {
      const hasDisclosures = token.disclosures && token.disclosures.length > 0;
      this.addCheck(
        checks,
        `${prefix}.disclosures`,
        `Token ${index + 1}: Selective Disclosures`,
        hasDisclosures,
        category,
        Severity.WARNING,
        {
          subcategory: "SD-JWT",
          field: `${prefix}.disclosures`,
          expectedValue: "At least one disclosure",
          actualValue: hasDisclosures ? `${token.disclosures.length} disclosure(s)` : "none",
          details: hasDisclosures ? `Found ${token.disclosures.length} disclosed claims` : "No selective disclosures",
        }
      );
    }
  }

  /**
   * 3. Holder Binding Validation (KB-JWT)
   */
  private validateHolderBinding(
    response: PresentationResponse,
    request: AuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    const category = "Holder Binding";
    const decodedTokens = response.decodedVPTokens || [];

    decodedTokens.forEach((token, idx) => {
      const prefix = `vp_token[${idx}]`;
      const holderBinding = token.holderBinding;

      // Check 1: KB-JWT presence
      const hasKBJWT = !!holderBinding;
      this.addCheck(
        checks,
        `${prefix}.kb_jwt.presence`,
        `Token ${idx + 1}: KB-JWT Presence`,
        hasKBJWT,
        category,
        Severity.ERROR,
        {
          subcategory: "Key Binding",
          field: `${prefix}.kb-jwt`,
          expectedValue: "Key Binding JWT present",
          actualValue: hasKBJWT ? "present" : "missing",
          issue: hasKBJWT ? undefined : "Missing holder binding (KB-JWT)",
          suggestedFix: hasKBJWT ? undefined : "SD-JWT VC must include key binding JWT",
        }
      );

      if (!hasKBJWT) {
        issues.push({
          category: ValidationErrorCategory.CRYPTO_FAILURE,
          field: `${prefix}.kb-jwt`,
          issue: "Missing holder binding (KB-JWT)",
          severity: Severity.ERROR,
          suggestedFix: "SD-JWT VC must include key binding JWT",
        });
        return;
      }

      // Check 2: Nonce matches request
      const requestNonce = request.nonce;
      const nonceMatches = !requestNonce || holderBinding!.nonce === requestNonce;
      this.addCheck(
        checks,
        `${prefix}.kb_jwt.nonce`,
        `Token ${idx + 1}: Nonce Match`,
        nonceMatches,
        category,
        Severity.ERROR,
        {
          subcategory: "Replay Protection",
          field: `${prefix}.kb-jwt.nonce`,
          expectedValue: requestNonce || "any",
          actualValue: holderBinding!.nonce,
          issue: nonceMatches ? undefined : "Nonce mismatch",
          suggestedFix: nonceMatches ? undefined : "KB-JWT nonce must match authorization request nonce",
        }
      );

      if (!nonceMatches) {
        issues.push({
          category: ValidationErrorCategory.CRYPTO_FAILURE,
          field: `${prefix}.kb-jwt.nonce`,
          issue: `Nonce mismatch: expected ${requestNonce}, got ${holderBinding!.nonce}`,
          severity: Severity.ERROR,
          suggestedFix: "KB-JWT nonce must match authorization request nonce",
        });
      }

      // Check 3: Audience matches request
      const requestAudience = request.aud || request.clientId;
      const audienceMatches = !requestAudience || holderBinding!.audience === requestAudience;
      this.addCheck(
        checks,
        `${prefix}.kb_jwt.audience`,
        `Token ${idx + 1}: Audience Match`,
        audienceMatches,
        category,
        Severity.ERROR,
        {
          subcategory: "Replay Protection",
          field: `${prefix}.kb-jwt.aud`,
          expectedValue: requestAudience || "any",
          actualValue: holderBinding!.audience,
          issue: audienceMatches ? undefined : "Audience mismatch",
          suggestedFix: audienceMatches ? undefined : "KB-JWT audience must match authorization request",
        }
      );

      if (!audienceMatches) {
        issues.push({
          category: ValidationErrorCategory.CRYPTO_FAILURE,
          field: `${prefix}.kb-jwt.aud`,
          issue: `Audience mismatch: expected ${requestAudience}, got ${holderBinding!.audience}`,
          severity: Severity.ERROR,
          suggestedFix: "KB-JWT audience must match authorization request",
        });
      }
    });
  }

  /**
   * 4. Signature Validation
   */
  private validateSignatures(
    response: PresentationResponse,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    const category = "Cryptographic Verification";

    // Convert vpToken to array of tokens
    let vpTokenArray: string[] = [];
    if (!response.vp_token) {
      vpTokenArray = [];
    } else if (typeof response.vp_token === 'string') {
      vpTokenArray = [response.vp_token];
    } else if (Array.isArray(response.vp_token)) {
      vpTokenArray = response.vp_token.filter(t => t && typeof t === 'string');
    } else if (typeof response.vp_token === 'object' && response.vp_token !== null) {
      // Object format: { "pid-sd-jwt": ["token1"], "pid-mso-mdoc": ["token2"] }
      vpTokenArray = Object.values(response.vp_token)
        .filter(val => Array.isArray(val))
        .flat()
        .filter(t => t && typeof t === 'string') as string[];
    }

    vpTokenArray.forEach((token, idx) => {
      if (!token || typeof token !== 'string') return;

      const prefix = `vp_token[${idx}]`;

      // Parse the SD-JWT structure: JWT~disclosures~KB-JWT
      const parts = token.split('~');
      if (parts.length < 1) {
        this.addCheck(
          checks,
          `${prefix}.structure`,
          `Token ${idx + 1}: Valid Structure`,
          false,
          category,
          Severity.ERROR,
          {
            subcategory: "JWT Structure",
            field: prefix,
            issue: "Invalid SD-JWT structure",
            suggestedFix: "Token should be in format: JWT~disclosures~KB-JWT",
          }
        );
        return;
      }

      const jwtPart = parts[0]; // The main credential JWT
      const disclosureParts = parts.slice(1, -1).filter(p => p); // All parts between JWT and KB-JWT
      const kbJwtPart = parts[parts.length - 1]; // The KB-JWT (last part)

      // Verify disclosures first (before signature check, to validate structure)
      this.verifyDisclosures(jwtPart, disclosureParts, idx, checks, issues, prefix, category);

      // Verify main JWT signature (issued by issuer)
      const mainJwtValid = this.verifyJWTSignature(jwtPart, ISSUER_KEY.publicKeyJwk);

      this.addCheck(
        checks,
        `${prefix}.main_jwt_signature`,
        `Token ${idx + 1}: Main JWT Signature`,
        mainJwtValid,
        category,
        Severity.ERROR,
        {
          subcategory: "Issuer Signature",
          field: `${prefix}.signature`,
          expectedValue: "Valid ECDSA signature from issuer",
          actualValue: mainJwtValid ? "Valid signature" : "Invalid signature",
          issue: mainJwtValid ? undefined : "JWT signature verification failed",
          suggestedFix: mainJwtValid ? undefined : "Ensure JWT is signed with correct issuer key",
          specReference: {
            spec: "SD-JWT-VC",
            section: "5.2",
            url: "https://datatracker.ietf.org/doc/html/draft-ietf-oauth-sd-jwt-vc",
          }
        }
      );

      if (!mainJwtValid) {
        issues.push({
          category: ValidationErrorCategory.CRYPTO_FAILURE,
          field: `${prefix}.signature`,
          issue: "JWT signature verification failed",
          severity: Severity.ERROR,
          suggestedFix: "Ensure JWT is signed with correct issuer key",
        });
      }

      // Verify KB-JWT signature (if present)
      if (kbJwtPart) {
        const kbJwtValid = this.verifyJWTSignature(kbJwtPart, HOLDER_KEY.publicKeyJwk);

        this.addCheck(
          checks,
          `${prefix}.kb_jwt_signature`,
          `Token ${idx + 1}: KB-JWT Signature`,
          kbJwtValid,
          category,
          Severity.ERROR,
          {
            subcategory: "Holder Signature",
            field: `${prefix}.kb-jwt.signature`,
            expectedValue: "Valid ECDSA signature from holder",
            actualValue: kbJwtValid ? "Valid signature" : "Invalid signature",
            issue: kbJwtValid ? undefined : "KB-JWT signature verification failed",
            suggestedFix: kbJwtValid ? undefined : "Ensure KB-JWT is signed with correct holder key",
            specReference: {
              spec: "SD-JWT-VC",
              section: "5.3",
              url: "https://datatracker.ietf.org/doc/html/draft-ietf-oauth-sd-jwt-vc",
            }
          }
        );

        if (!kbJwtValid) {
          issues.push({
            category: ValidationErrorCategory.CRYPTO_FAILURE,
            field: `${prefix}.kb-jwt.signature`,
            issue: "KB-JWT signature verification failed",
            severity: Severity.ERROR,
            suggestedFix: "Ensure KB-JWT is signed with correct holder key",
          });
        }
      }
    });
  }

  /**
   * Verify JWT signature using ECDSA P-256
   */
  private verifyJWTSignature(jwt: string, publicKeyJwk: JsonWebKey): boolean {
    try {
      const parts = jwt.split('.');
      if (parts.length !== 3) {
        return false;
      }

      const [header, payload, signature] = parts;

      // Create signing input (header.payload)
      const signingInput = `${header}.${payload}`;

      // Decode signature from base64url (IEEE P1363 format: raw r||s)
      const signatureBuffer = this.base64urlDecode(signature);

      // Convert JWK to crypto key format
      const publicKey = crypto.createPublicKey({
        key: {
          kty: publicKeyJwk.kty,
          crv: publicKeyJwk.crv,
          x: publicKeyJwk.x,
          y: publicKeyJwk.y,
        },
        format: 'jwk'
      });

      // JWT uses IEEE P1363 format (raw r||s), but Node crypto expects DER
      // Convert IEEE P1363 (64 bytes for P-256) to DER format
      const derSignature = this.ieeeP1363ToDer(signatureBuffer);

      // Verify signature using ECDSA with SHA-256
      const verify = crypto.createVerify('SHA256');
      verify.update(signingInput);
      verify.end();

      return verify.verify(publicKey, derSignature);
    } catch (error) {
      logger.error('[ResponseValidator] Signature verification error', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  /**
   * Convert IEEE P1363 signature format to DER format
   * IEEE P1363 for P-256: r (32 bytes) || s (32 bytes)
   * DER format: 0x30 [len] 0x02 [r-len] [r] 0x02 [s-len] [s]
   */
  private ieeeP1363ToDer(signature: Buffer): Buffer {
    if (signature.length !== 64) {
      throw new Error('Invalid P-256 signature length');
    }

    const r = signature.subarray(0, 32);
    const s = signature.subarray(32, 64);

    // Remove leading zeros but keep one if the value is negative (high bit set)
    const rTrimmed = this.trimLeadingZeros(r);
    const sTrimmed = this.trimLeadingZeros(s);

    // Build DER structure
    const rDer = Buffer.concat([Buffer.from([0x02, rTrimmed.length]), rTrimmed]);
    const sDer = Buffer.concat([Buffer.from([0x02, sTrimmed.length]), sTrimmed]);
    const sequence = Buffer.concat([rDer, sDer]);

    return Buffer.concat([Buffer.from([0x30, sequence.length]), sequence]);
  }

  /**
   * Trim leading zeros from buffer, but keep one if high bit is set
   */
  private trimLeadingZeros(buffer: Buffer): Buffer {
    let i = 0;
    while (i < buffer.length - 1 && buffer[i] === 0) {
      i++;
    }
    const trimmed = buffer.subarray(i);
    // If high bit is set, prepend a zero to indicate positive number
    if (trimmed[0] & 0x80) {
      return Buffer.concat([Buffer.from([0x00]), trimmed]);
    }
    return trimmed;
  }

  /**
   * Decode base64url string to Buffer
   */
  private base64urlDecode(input: string): Buffer {
    // Add padding if needed
    const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
    // Replace URL-safe characters
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64');
  }

  /**
   * Verify SD-JWT selective disclosures
   * Validates that disclosure hashes match the _sd array in the JWT payload
   */
  private verifyDisclosures(
    jwtPart: string,
    disclosureParts: string[],
    tokenIdx: number,
    checks: ValidationCheck[],
    issues: ValidationIssue[],
    prefix: string,
    category: string
  ): void {
    // Parse JWT to get payload
    const jwtParts = jwtPart.split('.');
    if (jwtParts.length !== 3) {
      return; // Invalid JWT, will be caught by signature validation
    }

    let payload: JWTPayload;
    try {
      const payloadJson = this.base64urlDecode(jwtParts[1]).toString('utf-8');
      payload = JSON.parse(payloadJson);
    } catch (error) {
      return; // Invalid payload, will be caught elsewhere
    }

    // Check if this is an SD-JWT (has _sd array)
    if (!payload._sd || !Array.isArray(payload._sd)) {
      // Not an SD-JWT or no selective disclosures
      const hasDisclosures = disclosureParts.length > 0;
      this.addCheck(
        checks,
        `${prefix}.disclosures.structure`,
        `Token ${tokenIdx + 1}: Selective Disclosures`,
        !hasDisclosures, // Pass if no disclosures (plain JWT)
        category,
        Severity.WARNING,
        {
          subcategory: "SD-JWT",
          field: `${prefix}._sd`,
          expectedValue: "_sd array in payload for SD-JWT",
          actualValue: hasDisclosures ? "Disclosures present but no _sd array" : "No _sd array (plain JWT)",
          details: hasDisclosures
            ? "Token has disclosure parts but JWT payload missing _sd array"
            : "This appears to be a plain JWT, not an SD-JWT with selective disclosure",
        }
      );
      return;
    }

    // Verify we have disclosures
    const hasDisclosures = disclosureParts.length > 0;
    this.addCheck(
      checks,
      `${prefix}.disclosures.presence`,
      `Token ${tokenIdx + 1}: Disclosures Present`,
      hasDisclosures,
      category,
      Severity.WARNING,
      {
        subcategory: "SD-JWT",
        field: `${prefix}.disclosures`,
        expectedValue: "At least one disclosure",
        actualValue: `${disclosureParts.length} disclosure(s)`,
        issue: hasDisclosures ? undefined : "SD-JWT has _sd array but no disclosures provided",
        suggestedFix: hasDisclosures ? undefined : "Include disclosure strings between tildes in SD-JWT format",
      }
    );

    if (!hasDisclosures) {
      issues.push({
        category: ValidationErrorCategory.STRUCTURE_VIOLATION,
        field: `${prefix}.disclosures`,
        issue: "SD-JWT has _sd array but no disclosures provided",
        severity: Severity.WARNING,
        suggestedFix: "Include disclosure strings between tildes in SD-JWT format",
      });
      return;
    }

    // Verify each disclosure hash matches an entry in _sd array
    const sdHashes = new Set(payload._sd);
    const hashAlgorithm = payload._sd_alg || 'sha-256';

    let validDisclosures = 0;
    let invalidDisclosures = 0;

    for (let i = 0; i < disclosureParts.length; i++) {
      const disclosure = disclosureParts[i];

      // Calculate hash of disclosure
      let hash: string;
      try {
        hash = crypto.createHash('sha256')
          .update(disclosure)
          .digest('base64url');
      } catch (error) {
        invalidDisclosures++;
        continue;
      }

      // Check if hash is in _sd array
      if (sdHashes.has(hash)) {
        validDisclosures++;
      } else {
        invalidDisclosures++;
      }
    }

    const allDisclosuresValid = invalidDisclosures === 0 && validDisclosures === disclosureParts.length;

    this.addCheck(
      checks,
      `${prefix}.disclosures.verification`,
      `Token ${tokenIdx + 1}: Disclosure Hash Verification`,
      allDisclosuresValid,
      category,
      allDisclosuresValid ? Severity.WARNING : Severity.ERROR,
      {
        subcategory: "SD-JWT",
        field: `${prefix}.disclosures`,
        expectedValue: "All disclosure hashes match _sd array",
        actualValue: `${validDisclosures}/${disclosureParts.length} valid`,
        issue: allDisclosuresValid ? undefined : `${invalidDisclosures} disclosure(s) have invalid hashes`,
        details: `Hash algorithm: ${hashAlgorithm}, _sd array contains ${sdHashes.size} hash(es)`,
        suggestedFix: allDisclosuresValid ? undefined : "Ensure disclosure hashes match entries in JWT payload _sd array",
      }
    );

    if (!allDisclosuresValid) {
      issues.push({
        category: ValidationErrorCategory.CRYPTO_FAILURE,
        field: `${prefix}.disclosures`,
        issue: `${invalidDisclosures} disclosure(s) have hashes that don't match _sd array`,
        severity: Severity.ERROR,
        suggestedFix: "Ensure disclosure hashes match entries in JWT payload _sd array",
      });
    }
  }

  /**
   * 5. Claims Validation
   */
  private validateClaims(
    response: PresentationResponse,
    request: AuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    const category = "Claims";
    const decodedTokens = response.decodedVPTokens || [];

    // Extract requested claims from DCQL query
    const dcqlQuery = request.dcqlQuery || request.dcql_query;
    if (!dcqlQuery || !dcqlQuery.credentials) {
      // No claims to validate against
      return;
    }

    // Check: At least one credential returned
    const hasCredentials = decodedTokens.length > 0;
    this.addCheck(
      checks,
      "claims.credentials.presence",
      "Credentials Returned",
      hasCredentials,
      category,
      Severity.ERROR,
      {
        subcategory: "Response Completeness",
        expectedValue: "At least one credential",
        actualValue: `${decodedTokens.length} credential(s)`,
        issue: hasCredentials ? undefined : "No credentials in response",
        suggestedFix: hasCredentials ? undefined : "Response must contain at least one credential",
      }
    );

    if (!hasCredentials) {
      issues.push({
        category: ValidationErrorCategory.CLAIM_MISMATCH,
        field: "vp_token",
        issue: "No credentials in response",
        severity: Severity.ERROR,
        suggestedFix: "Response must contain at least one credential",
      });
      return;
    }

    // Validate each token
    decodedTokens.forEach((token, idx) => {
      const hasPayload = !!token.jwt.payload;
      this.addCheck(
        checks,
        `claims.token[${idx}].payload`,
        `Token ${idx + 1}: Payload Present`,
        hasPayload,
        category,
        Severity.ERROR,
        {
          subcategory: "Credential Content",
          field: `vp_token[${idx}].payload`,
          expectedValue: "JWT payload with claims",
          actualValue: hasPayload ? "present" : "missing",
          issue: hasPayload ? undefined : "Missing JWT payload",
        }
      );

      if (!hasPayload) {
        issues.push({
          category: ValidationErrorCategory.STRUCTURE_VIOLATION,
          field: `vp_token[${idx}].payload`,
          issue: "Missing JWT payload",
          severity: Severity.ERROR,
        });
        return;
      }

      // Find matching credential definition in request
      const matchingCredential = dcqlQuery.credentials.find((cred: DCQLCredential) => {
        // Match by format
        return cred.format === token.format || cred.format === "dc+sd-jwt";
      });

      if (!matchingCredential || !matchingCredential.claims) {
        // No specific claims requested
        return;
      }

      // Extract disclosed claims from token
      const disclosedClaims = new Set<string>();

      // Parse disclosures to get claim names
      if (token.disclosures && Array.isArray(token.disclosures)) {
        for (const disclosure of token.disclosures) {
          try {
            const decoded = JSON.parse(this.base64urlDecode(disclosure).toString('utf-8'));
            if (Array.isArray(decoded) && decoded.length >= 2) {
              disclosedClaims.add(decoded[1]); // claim name is at index 1
            }
          } catch (e) {
            // Skip invalid disclosures
          }
        }
      }

      // Also check JWT payload for non-disclosed claims
      const payload = token.jwt.payload;
      for (const key of Object.keys(payload)) {
        if (!key.startsWith('_') && key !== 'iss' && key !== 'sub' && key !== 'iat' &&
            key !== 'exp' && key !== 'nbf' && key !== 'vct' && key !== 'aud') {
          disclosedClaims.add(key);
        }
      }

      // Extract requested claim names
      const requestedClaims = new Set<string>();
      for (const claim of matchingCredential.claims) {
        if (claim.path && Array.isArray(claim.path) && claim.path.length > 0) {
          requestedClaims.add(claim.path[0]); // Get top-level claim name
        }
      }

      // Check: All requested claims present (MISSING_CLAIMS detection)
      // Use normalized claim names to handle format differences (e.g., birthdate vs birth_date)
      const normalizedDisclosed = new Set(Array.from(disclosedClaims).map(normalizeClaimName));
      const missingClaims: string[] = [];
      for (const requestedClaim of requestedClaims) {
        if (!disclosedClaims.has(requestedClaim) && !normalizedDisclosed.has(normalizeClaimName(requestedClaim))) {
          missingClaims.push(requestedClaim);
        }
      }

      const allClaimsPresent = missingClaims.length === 0;
      this.addCheck(
        checks,
        `vp_token[${idx}].claims.completeness`,
        `Token ${idx + 1}: All Requested Claims Present`,
        allClaimsPresent,
        category,
        Severity.ERROR,
        {
          subcategory: "Claim Completeness",
          field: `vp_token[${idx}]`,
          expectedValue: `Claims: ${Array.from(requestedClaims).join(', ')}`,
          actualValue: `Disclosed: ${Array.from(disclosedClaims).join(', ')}`,
          issue: allClaimsPresent ? undefined : `Missing claims: ${missingClaims.join(', ')}`,
          suggestedFix: allClaimsPresent ? undefined : `Include all requested claims in disclosure`,
        }
      );

      if (!allClaimsPresent) {
        issues.push({
          category: ValidationErrorCategory.CLAIM_MISMATCH,
          field: `vp_token[${idx}]`,
          issue: `Missing requested claims: ${missingClaims.join(', ')}`,
          severity: Severity.ERROR,
          suggestedFix: `Include all requested claims in disclosure`,
        });
      }

      // Check: No over-disclosure (OVER_DISCLOSURE detection)
      // Structural JWT/SD-JWT claims that are part of the credential format itself,
      // not user-disclosed data — these should never trigger over-disclosure warnings
      const STRUCTURAL_CLAIMS = new Set([
        "cnf", "iss", "iat", "exp", "nbf", "vct", "jti",
        "_sd", "_sd_alg", "status", "type", "@context"
      ]);

      const normalizedRequested = new Set(Array.from(requestedClaims).map(normalizeClaimName));
      const extraClaims: string[] = [];
      for (const disclosedClaim of disclosedClaims) {
        if (!requestedClaims.has(disclosedClaim) &&
            !normalizedRequested.has(normalizeClaimName(disclosedClaim)) &&
            !STRUCTURAL_CLAIMS.has(disclosedClaim)) {
          extraClaims.push(disclosedClaim);
        }
      }

      const noOverDisclosure = extraClaims.length === 0;
      this.addCheck(
        checks,
        `vp_token[${idx}].claims.minimal_disclosure`,
        `Token ${idx + 1}: Minimal Disclosure (No Extra Claims)`,
        noOverDisclosure,
        category,
        Severity.WARNING,
        {
          subcategory: "Privacy",
          field: `vp_token[${idx}]`,
          expectedValue: `Only requested claims`,
          actualValue: noOverDisclosure ? `Minimal disclosure` : `${extraClaims.length} extra claim(s)`,
          issue: noOverDisclosure ? undefined : `Over-disclosed claims: ${extraClaims.join(', ')}`,
          suggestedFix: noOverDisclosure ? undefined : `Only disclose requested claims for privacy`,
        }
      );

      if (!noOverDisclosure) {
        issues.push({
          category: ValidationErrorCategory.CLAIM_MISMATCH,
          field: `vp_token[${idx}]`,
          issue: `Over-disclosure: ${extraClaims.join(', ')} not requested`,
          severity: Severity.WARNING,
          suggestedFix: `Only disclose requested claims for privacy`,
        });
      }

      // Check: Credential type matches (WRONG_CREDENTIAL_TYPE detection)
      const vct = payload.vct;
      const expectedVct = matchingCredential.meta?.vctValues?.[0];

      if (expectedVct) {
        const vctMatches = vct === expectedVct;
        this.addCheck(
          checks,
          `vp_token[${idx}].credential_type`,
          `Token ${idx + 1}: Credential Type Matches`,
          vctMatches,
          category,
          Severity.ERROR,
          {
            subcategory: "Credential Validation",
            field: `vp_token[${idx}].vct`,
            expectedValue: expectedVct,
            actualValue: vct || "missing",
            issue: vctMatches ? undefined : `Wrong credential type`,
            suggestedFix: vctMatches ? undefined : `Provide credential with correct vct value`,
          }
        );

        if (!vctMatches) {
          issues.push({
            category: ValidationErrorCategory.CLAIM_MISMATCH,
            field: `vp_token[${idx}].vct`,
            issue: `Wrong credential type. Expected: ${expectedVct}, Got: ${vct}`,
            severity: Severity.ERROR,
            suggestedFix: `Provide credential with correct vct value`,
          });
        }
      }
    });
  }

  /**
   * 5. Timing Validation
   */
  private validateTiming(
    response: PresentationResponse,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    const category = "Timing";
    const decodedTokens = response.decodedVPTokens || [];
    const now = Math.floor(Date.now() / 1000);

    decodedTokens.forEach((token, idx) => {
      const prefix = `vp_token[${idx}]`;

      // Check 1: Not expired
      if (token.metadata.expiresAt) {
        const notExpired = now < token.metadata.expiresAt;
        const expiryDate = new Date(token.metadata.expiresAt * 1000).toISOString();

        this.addCheck(
          checks,
          `${prefix}.expiration`,
          `Token ${idx + 1}: Not Expired`,
          notExpired,
          category,
          Severity.ERROR,
          {
            subcategory: "Validity Period",
            field: `${prefix}.exp`,
            expectedValue: `Future date (after ${new Date(now * 1000).toISOString()})`,
            actualValue: expiryDate,
            issue: notExpired ? undefined : "Credential has expired",
            suggestedFix: notExpired ? undefined : "Credential must be valid and not expired",
          }
        );

        if (!notExpired) {
          issues.push({
            category: ValidationErrorCategory.TIMING_ISSUE,
            field: `${prefix}.exp`,
            issue: `Credential expired at ${expiryDate}`,
            severity: Severity.ERROR,
            suggestedFix: "Credential must be valid and not expired",
          });
        }
      }

      // Check 2: Already valid (nbf check)
      if (token.metadata.notBefore) {
        const alreadyValid = now >= token.metadata.notBefore;
        const notBeforeDate = new Date(token.metadata.notBefore * 1000).toISOString();

        this.addCheck(
          checks,
          `${prefix}.not_before`,
          `Token ${idx + 1}: Already Valid`,
          alreadyValid,
          category,
          Severity.ERROR,
          {
            subcategory: "Validity Period",
            field: `${prefix}.nbf`,
            expectedValue: `Past date (before ${new Date(now * 1000).toISOString()})`,
            actualValue: notBeforeDate,
            issue: alreadyValid ? undefined : "Credential not yet valid",
            suggestedFix: alreadyValid ? undefined : "Credential not yet valid (nbf in future)",
          }
        );

        if (!alreadyValid) {
          issues.push({
            category: ValidationErrorCategory.TIMING_ISSUE,
            field: `${prefix}.nbf`,
            issue: `Credential not valid until ${notBeforeDate}`,
            severity: Severity.ERROR,
            suggestedFix: "Credential not yet valid (nbf in future)",
          });
        }
      }

      // Check 3: Issued at reasonable time
      if (token.metadata.issuedAt) {
        const issuedAt = token.metadata.issuedAt;
        const reasonableIssueTime = issuedAt <= now && issuedAt > (now - 365 * 24 * 60 * 60); // Within last year
        const issuedDate = new Date(issuedAt * 1000).toISOString();

        this.addCheck(
          checks,
          `${prefix}.issued_at`,
          `Token ${idx + 1}: Reasonable Issue Time`,
          reasonableIssueTime,
          category,
          Severity.WARNING,
          {
            subcategory: "Validity Period",
            field: `${prefix}.iat`,
            expectedValue: "Within reasonable timeframe",
            actualValue: issuedDate,
            issue: reasonableIssueTime ? undefined : "Credential issued at suspicious time",
            details: reasonableIssueTime ? `Issued: ${issuedDate}` : `Issue time seems unusual: ${issuedDate}`,
          }
        );

        if (!reasonableIssueTime) {
          issues.push({
            category: ValidationErrorCategory.TIMING_ISSUE,
            field: `${prefix}.iat`,
            issue: `Credential issued at suspicious time: ${issuedDate}`,
            severity: Severity.WARNING,
          });
        }
      }
    });
  }

  /**
   * Generate validation summary
   */
  private generateSummary(checks: ValidationCheck[], issues: ValidationIssue[]): ValidationSummary {
    const totalChecks = checks.length;
    const passedChecks = checks.filter((c) => c.passed).length;
    const failedChecks = totalChecks - passedChecks;
    const errorCount = issues.filter((i) => i.severity === Severity.ERROR).length;
    const warningCount = issues.filter((i) => i.severity === Severity.WARNING).length;

    // Group checks by category
    const categoryCounts = new Map<string, { total: number; passed: number; failed: number }>();
    checks.forEach((check) => {
      const existing = categoryCounts.get(check.category) || { total: 0, passed: 0, failed: 0 };
      existing.total++;
      if (check.passed) existing.passed++;
      else existing.failed++;
      categoryCounts.set(check.category, existing);
    });

    return {
      totalChecks,
      passedChecks,
      failedChecks,
      errorCount,
      warningCount,
      compliancePercentage: totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0,
      checksByCategory: Array.from(categoryCounts.entries()).map(([category, counts]) => ({
        category,
        ...counts,
      })),
    };
  }
}
