/**
 * Presentation Request Validator
 * Validates PID presentations per German EUDI Wallet implementer guide
 * Reference: https://bmi.usercontent.opencode.de/eudi-wallet/developer-guide/PID_Presentation/
 *
 * Implements layered validation:
 * 1. Syntax - Check required fields and structure
 * 2. Semantics - Validate DCQL queries and credential definitions
 * 3. Profile - PID Presentation specific requirements
 */

import {
  AuthorizationRequest,
  ValidationResult,
  ValidationIssue,
  ValidationCheck,
  ValidationSummary,
  Severity,
  ValidationErrorCategory,
  Profile,
  SpecReference,
} from "../types/index.js";
import { normalizeClaimName } from "../utils/ClaimNameMapper.js";
import { ValidationProfileRegistry } from "../profiles/ValidationProfileRegistry.js";
import { IValidationProfile } from "../profiles/IValidationProfile.js";

// PID-specific types for this request validator
interface DCQLQuery {
  credentials: DCQLCredential[];
  credentialSets?: DCQLCredentialSet[];
}

interface DCQLCredential {
  id: string;
  format: string;
  claims?: DCQLClaim[];
  meta?: {
    vctValues?: string[];
    doctypeValue?: string;
  };
}

interface DCQLClaim {
  path: string[];
  optional?: boolean;
}

interface DCQLCredentialSet {
  options: string[][];
}

interface ExtendedAuthorizationRequest extends AuthorizationRequest {
  dcqlQuery?: DCQLQuery;
  responseUri?: string;
  responseMode?: string;
  clientMetadata?: {
    jwks?: { keys: any[] };
    jwksUri?: string;
    vpFormatsSupported?: Record<string, any>;
    authorizationEncryptedResponseAlg?: string;
    authorizationEncryptedResponseEnc?: string;
    logoUri?: string;
    clientName?: string;
  };
  verifierInfo?: any;
  // JWT fields (when request is JWT-secured)
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
  nbf?: number;
  jti?: string;
  // Additional OpenID4VP fields
  clientIdScheme?: string;
  walletIssuer?: string;
}

export interface IRequestValidator {
  validate(
    request: AuthorizationRequest,
    validationProfile: Profile
  ): Promise<ValidationResult>;
}

export interface IPresentationRequestValidator extends IRequestValidator {
  validate(
    request: AuthorizationRequest,
    validationProfile: Profile
  ): Promise<ValidationResult>;
}

export class PresentationRequestValidator implements IPresentationRequestValidator {
  // Known PID claims for SD-JWT format
  // Note: SD-JWT uses "birthdate" (not "birth_date" which is the mDoc convention)
  private static readonly KNOWN_PID_SDJWT_CLAIMS = new Set([
    "given_name", "family_name", "birthdate", "age_over_18", "age_over_21",
    "age_over_12", "age_over_14", "age_over_16", "age_over_65",
    "age_in_years", "age_birth_year", "family_name_birth", "given_name_birth",
    "birth_place", "birth_country", "birth_state", "birth_city",
    "resident_address", "resident_country", "resident_state", "resident_city",
    "resident_postal_code", "resident_street", "resident_house_number",
    "gender", "nationality", "nationalities", "issuance_date", "expiry_date", "issuing_authority",
    "document_number", "issuing_country", "issuing_jurisdiction", "address"
  ]);

  // Known PID claims for mDoc format (ISO 18013-5 namespace)
  private static readonly KNOWN_PID_MDOC_CLAIMS = new Set([
    "family_name", "given_name", "birth_date", "issue_date", "expiry_date",
    "issuing_country", "issuing_authority", "document_number", "portrait",
    "driving_privileges", "un_distinguishing_sign", "administrative_number",
    "sex", "height", "weight", "eye_colour", "hair_colour", "birth_place",
    "resident_address", "portrait_capture_date", "age_in_years", "age_birth_year",
    "age_over_18", "age_over_21", "issuing_jurisdiction", "nationality",
    "resident_city", "resident_state", "resident_postal_code", "resident_country"
  ]);

  // Prohibited fields that must not appear in HAIP requests
  private static readonly PROHIBITED_FIELDS = new Map<string, string>([
    ["scope", "OpenID4VP does not use scope parameter; use dcql_query"],
    ["claims", "Use dcql_query for claim requests, not top-level claims parameter"],
    ["registration", "Use client_metadata instead of registration parameter"],
    ["request_uri_method", "Not supported in HAIP profile"],
    ["id_token", "response_type must be vp_token only, not id_token"],
    ["code", "response_type must be vp_token only, not code"],
  ]);

  // Maximum limits to prevent DoS
  private static readonly MAX_CREDENTIALS = 20;
  private static readonly MAX_CLAIMS_PER_CREDENTIAL = 50;
  private static readonly MAX_CREDENTIAL_SETS = 20;
  private static readonly MAX_JWKS_KEYS = 10;
  private static readonly MAX_REQUEST_AGE_SECONDS = 3600; // 1 hour
  private static readonly MAX_EXPIRY_DURATION_SECONDS = 600; // 10 minutes
  private static readonly CLOCK_SKEW_SECONDS = 300; // 5 minutes

  async validate(
    request: AuthorizationRequest,
    validationProfile: Profile = Profile.PID_PRESENTATION
  ): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];
    const checks: ValidationCheck[] = [];

    // Normalize request to handle both snake_case and camelCase
    const normalizedRequest = this.normalizeRequest(request);
    const extRequest = normalizedRequest as ExtendedAuthorizationRequest;

    // Get the profile plugin for this validation
    const profile = ValidationProfileRegistry.getProfile(validationProfile);

    // Syntax validation - foundational
    this.validateSyntaxDetailed(extRequest, checks, issues);

    // Early exit if critical syntax errors - but still collect checks
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

    // Semantic validation - structure and query consistency
    this.validateSemanticsDetailed(extRequest, checks, issues);

    // Profile-specific validation - delegate to profile plugin
    profile.validateSyntax(extRequest, checks, issues);
    profile.validateSemantics(extRequest, checks, issues);

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
  private addDetailedCheck(
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
    } = {}
  ): void {
    checks.push({
      checkId,
      checkName,
      passed,
      category,
      subcategory: options.subcategory,
      field: options.field,
      expectedValue: options.expectedValue,
      actualValue: options.actualValue,
      details: options.details,
      severity,
      issue: passed ? undefined : options.issue,
      suggestedFix: passed ? undefined : options.suggestedFix,
      specReference: passed ? undefined : options.specReference,
    });
  }

  /**
   * Generate validation summary with statistics
   */
  private generateSummary(checks: ValidationCheck[], issues: ValidationIssue[]): ValidationSummary {
    const totalChecks = checks.length;
    const passedChecks = checks.filter(c => c.passed).length;
    const failedChecks = checks.filter(c => !c.passed).length;
    const errorCount = issues.filter(i => i.severity === Severity.ERROR).length;
    const warningCount = issues.filter(i => i.severity === Severity.WARNING).length;
    const compliancePercentage = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

    // Group checks by category
    const categoriesMap = new Map<string, { total: number; passed: number; failed: number }>();
    for (const check of checks) {
      if (!categoriesMap.has(check.category)) {
        categoriesMap.set(check.category, { total: 0, passed: 0, failed: 0 });
      }
      const cat = categoriesMap.get(check.category)!;
      cat.total++;
      if (check.passed) {
        cat.passed++;
      } else {
        cat.failed++;
      }
    }

    const checksByCategory = Array.from(categoriesMap.entries()).map(([category, stats]) => ({
      category,
      ...stats,
    }));

    return {
      totalChecks,
      passedChecks,
      failedChecks,
      errorCount,
      warningCount,
      compliancePercentage,
      checksByCategory,
    };
  }

  private normalizeRequest(request: any): any {
    /**
     * Recursively normalize request object to handle both snake_case and camelCase properties.
     * This ensures the request works whether it comes from JSON (snake_case) or
     * from typed objects (camelCase).
     */
    if (request === null || request === undefined) {
      return request;
    }

    // If it's an array, normalize each element
    if (Array.isArray(request)) {
      return request.map((item) => this.normalizeRequest(item));
    }

    // If it's not an object, return as-is
    if (typeof request !== "object") {
      return request;
    }

    // Map of snake_case to camelCase keys at any level
    const keyMap: Record<string, string> = {
      // Top level
      client_id: "clientId",
      client_id_scheme: "clientIdScheme",
      response_type: "responseType",
      response_mode: "responseMode",
      response_uri: "responseUri",
      redirect_uri: "redirectUri",
      dcql_query: "dcqlQuery",
      client_metadata: "clientMetadata",
      client_metadata_uri: "clientMetadataUri",
      verifier_info: "verifierInfo",
      wallet_issuer: "walletIssuer",
      // DCQL level
      credential_sets: "credentialSets",
      vct_values: "vctValues",
      doctype_value: "doctypeValue",
      // Presentation definition level
      input_descriptors: "inputDescriptors",
      submission_requirements: "submissionRequirements",
      // Input descriptor level
      credential_definition: "credentialDefinition",
      credential_subject: "credentialSubject",
      proof_type: "proofType",
      limit_disclosure: "limitDisclosure",
      status_active: "statusActive",
      intent_to_retain: "intentToRetain",
      // Submission requirement level
      from_nested: "fromNested",
      // VP formats
      vp_formats_supported: "vpFormatsSupported",
      kb_jwt_alg_values: "kbJwtAlgValues",
      sd_jwt_alg_values: "sdJwtAlgValues",
      encrypted_response_enc_values_supported: "encryptedResponseEncValuesSupported",
      // Client metadata
      jwks_uri: "jwksUri",
      authorization_encrypted_response_alg: "authorizationEncryptedResponseAlg",
      authorization_encrypted_response_enc: "authorizationEncryptedResponseEnc",
      logo_uri: "logoUri",
      client_name: "clientName",
    };

    const normalized: any = {};

    // Recursively process all properties
    for (const [key, value] of Object.entries(request)) {
      // Convert key if it's in the map, otherwise keep original
      const camelKey = keyMap[key] || key;

      // Recursively normalize the value
      if (value !== null && typeof value === "object") {
        normalized[camelKey] = this.normalizeRequest(value);
      } else {
        normalized[camelKey] = value;
      }
    }

    return normalized;
  }

  /**
   * Comprehensive Syntax Validation with every single check reported
   */
  private validateSyntaxDetailed(
    request: ExtendedAuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    const category = "Syntax";
    const subcategory = "Required Fields";
    const specRef: SpecReference = {
      spec: "PID-Presentation-Guide",
      section: "3.3",
      url: "https://bmi.usercontent.opencode.de/eudi-wallet/developer-guide/PID_Presentation/#33-request-construction-checklist",
    };

    // Check 1: client_id presence
    if (!request.clientId) {
      this.addDetailedCheck(checks, "syntax.client_id.presence", "Client ID Presence", false, category, Severity.ERROR, {
        subcategory,
        field: "client_id",
        expectedValue: "Non-empty string",
        actualValue: "undefined",
        issue: "Missing required field: client_id",
        suggestedFix: "Add client_id field with x509_hash: scheme identifier",
        specReference: specRef,
      });
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "client_id",
        issue: "Missing required field",
        severity: Severity.ERROR,
        specReference: specRef,
        suggestedFix: "Add client_id field with x509_hash: scheme identifier",
      });
    } else {
      this.addDetailedCheck(checks, "syntax.client_id.presence", "Client ID Presence", true, category, Severity.ERROR, {
        subcategory,
        field: "client_id",
        expectedValue: "Non-empty string",
        actualValue: request.clientId,
        details: "client_id field is present",
      });
    }

    // Check 2: client_id scheme validation (x509_hash)
    if (request.clientId) {
      if (!request.clientId.startsWith("x509_hash:")) {
        this.addDetailedCheck(checks, "syntax.client_id.scheme", "Client ID Scheme Format", false, category, Severity.WARNING, {
          subcategory: "Format Validation",
          field: "client_id",
          expectedValue: "x509_hash:<hash>",
          actualValue: request.clientId,
          issue: `Client ID should use x509_hash: scheme for HAIP compliance`,
          suggestedFix: "Change client_id format to x509_hash:<hash>",
          specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
        });
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: "client_id",
          issue: `Client ID should use x509_hash: scheme for HAIP compliance, got: ${request.clientId}`,
          severity: Severity.WARNING,
          specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
          suggestedFix: "Change client_id format to x509_hash:<hash>",
        });
      } else {
        this.addDetailedCheck(checks, "syntax.client_id.scheme", "Client ID Scheme Format", true, category, Severity.WARNING, {
          subcategory: "Format Validation",
          field: "client_id",
          expectedValue: "x509_hash:<hash>",
          actualValue: request.clientId,
          details: "client_id uses x509_hash: scheme",
        });
      }
    } else {
      // Skip scheme check if client_id is missing
      this.addDetailedCheck(checks, "syntax.client_id.scheme", "Client ID Scheme Format", false, category, Severity.WARNING, {
        subcategory: "Format Validation",
        field: "client_id",
        expectedValue: "x509_hash:<hash>",
        actualValue: "undefined",
        issue: "Cannot validate scheme: client_id is missing",
      });
    }

    // Check 3: response_type presence
    if (!request.responseType) {
      this.addDetailedCheck(checks, "syntax.response_type.presence", "Response Type Presence", false, category, Severity.ERROR, {
        subcategory,
        field: "response_type",
        expectedValue: "vp_token",
        actualValue: "undefined",
        issue: "Missing required field: response_type",
        suggestedFix: 'Set response_type to "vp_token"',
      });
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "response_type",
        issue: "Missing required field",
        severity: Severity.ERROR,
      });
    } else {
      this.addDetailedCheck(checks, "syntax.response_type.presence", "Response Type Presence", true, category, Severity.ERROR, {
        subcategory,
        field: "response_type",
        expectedValue: "vp_token",
        actualValue: request.responseType,
        details: "response_type field is present",
      });
    }

    // Check 4: response_type validity
    if (request.responseType) {
      if (!this.isValidResponseType(request.responseType)) {
        this.addDetailedCheck(checks, "syntax.response_type.validity", "Response Type Validity", false, category, Severity.ERROR, {
          subcategory: "Format Validation",
          field: "response_type",
          expectedValue: "vp_token",
          actualValue: request.responseType,
          issue: `Invalid response_type: must be "vp_token" or include "vp_token"`,
          suggestedFix: 'Set response_type to "vp_token"',
        });
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: "response_type",
          issue: `Invalid response_type: "${request.responseType}". Must be "vp_token" or include "vp_token"`,
          severity: Severity.ERROR,
          suggestedFix: 'Set response_type to "vp_token"',
        });
      } else {
        this.addDetailedCheck(checks, "syntax.response_type.validity", "Response Type Validity", true, category, Severity.ERROR, {
          subcategory: "Format Validation",
          field: "response_type",
          expectedValue: "vp_token",
          actualValue: request.responseType,
          details: "response_type contains valid value",
        });
      }
    } else {
      this.addDetailedCheck(checks, "syntax.response_type.validity", "Response Type Validity", false, category, Severity.ERROR, {
        subcategory: "Format Validation",
        field: "response_type",
        expectedValue: "vp_token",
        actualValue: "undefined",
        issue: "Cannot validate: response_type is missing",
      });
    }

    // Check 5: response_uri presence
    if (!request.responseUri && !request.redirectUri) {
      this.addDetailedCheck(checks, "syntax.response_uri.presence", "Response URI Presence", false, category, Severity.ERROR, {
        subcategory,
        field: "response_uri",
        expectedValue: "HTTPS URL",
        actualValue: "undefined",
        issue: "Missing response_uri (required for direct_post.jwt response mode)",
        suggestedFix: "Add response_uri field with valid HTTPS URL",
        specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
      });
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "response_uri",
        issue: "Missing response_uri (required for direct_post.jwt response mode)",
        severity: Severity.ERROR,
        specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
        suggestedFix: "Add response_uri field with valid HTTPS URL",
      });
    } else {
      this.addDetailedCheck(checks, "syntax.response_uri.presence", "Response URI Presence", true, category, Severity.ERROR, {
        subcategory,
        field: "response_uri",
        expectedValue: "HTTPS URL",
        actualValue: request.responseUri || request.redirectUri,
        details: "response_uri field is present",
      });
    }

    // Check 6: response_uri HTTPS validation
    const responseUriValue = request.responseUri || request.redirectUri;
    if (responseUriValue) {
      if (!responseUriValue.startsWith("https://")) {
        this.addDetailedCheck(checks, "syntax.response_uri.https", "Response URI HTTPS Enforcement", false, category, Severity.ERROR, {
          subcategory: "Security Validation",
          field: "response_uri",
          expectedValue: "https://...",
          actualValue: responseUriValue,
          issue: "response_uri must use HTTPS protocol",
          suggestedFix: "Use HTTPS URL for response_uri",
        });
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: "response_uri",
          issue: `response_uri must be HTTPS, got: ${responseUriValue}`,
          severity: Severity.ERROR,
          suggestedFix: "Use HTTPS URL for response_uri",
        });
      } else {
        this.addDetailedCheck(checks, "syntax.response_uri.https", "Response URI HTTPS Enforcement", true, category, Severity.ERROR, {
          subcategory: "Security Validation",
          field: "response_uri",
          expectedValue: "https://...",
          actualValue: responseUriValue,
          details: "response_uri uses HTTPS protocol",
        });

        // Deep URL validation
        this.validateHTTPSURL(responseUriValue, "response_uri", checks, issues, category);
      }
    } else {
      this.addDetailedCheck(checks, "syntax.response_uri.https", "Response URI HTTPS Enforcement", false, category, Severity.ERROR, {
        subcategory: "Security Validation",
        field: "response_uri",
        expectedValue: "https://...",
        actualValue: "undefined",
        issue: "Cannot validate HTTPS: response_uri is missing",
      });
    }

    // Temporal validation
    this.validateTemporalClaims(request, checks, issues, category);

    // Check 7: response_mode presence
    if (!request.responseMode) {
      this.addDetailedCheck(checks, "syntax.response_mode.presence", "Response Mode Presence", false, category, Severity.WARNING, {
        subcategory,
        field: "response_mode",
        expectedValue: "direct_post.jwt",
        actualValue: "undefined",
        issue: 'Missing response_mode. Should be "direct_post.jwt" for HAIP',
        suggestedFix: 'Set response_mode to "direct_post.jwt"',
        specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
      });
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "response_mode",
        issue: 'Missing response_mode. Should be "direct_post.jwt" for HAIP',
        severity: Severity.WARNING,
        specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
        suggestedFix: 'Set response_mode to "direct_post.jwt"',
      });
    } else {
      this.addDetailedCheck(checks, "syntax.response_mode.presence", "Response Mode Presence", true, category, Severity.WARNING, {
        subcategory,
        field: "response_mode",
        expectedValue: "direct_post.jwt",
        actualValue: request.responseMode,
        details: "response_mode field is present",
      });
    }

    // Check 8: response_mode validity (HAIP requirement)
    if (request.responseMode) {
      if (request.responseMode !== "direct_post.jwt") {
        this.addDetailedCheck(checks, "syntax.response_mode.haip", "Response Mode HAIP Compliance", false, category, Severity.ERROR, {
          subcategory: "Format Validation",
          field: "response_mode",
          expectedValue: "direct_post.jwt",
          actualValue: request.responseMode,
          issue: `Invalid response_mode for HAIP: must be "direct_post.jwt"`,
          suggestedFix: 'Set response_mode to "direct_post.jwt"',
        });
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: "response_mode",
          issue: `Invalid response_mode: "${request.responseMode}". Must be "direct_post.jwt" for HAIP`,
          severity: Severity.ERROR,
          suggestedFix: 'Set response_mode to "direct_post.jwt"',
        });
      } else {
        this.addDetailedCheck(checks, "syntax.response_mode.haip", "Response Mode HAIP Compliance", true, category, Severity.ERROR, {
          subcategory: "Format Validation",
          field: "response_mode",
          expectedValue: "direct_post.jwt",
          actualValue: request.responseMode,
          details: "response_mode is HAIP compliant",
        });
      }
    } else {
      this.addDetailedCheck(checks, "syntax.response_mode.haip", "Response Mode HAIP Compliance", false, category, Severity.ERROR, {
        subcategory: "Format Validation",
        field: "response_mode",
        expectedValue: "direct_post.jwt",
        actualValue: "undefined",
        issue: "Cannot validate HAIP compliance: response_mode is missing",
      });
    }

    // Check 9: nonce presence (recommended for key binding, but state can substitute)
    if (!request.nonce && !request.state) {
      this.addDetailedCheck(checks, "syntax.nonce.presence", "Nonce Presence", false, category, Severity.ERROR, {
        subcategory: "Security Validation",
        field: "nonce",
        expectedValue: "Cryptographically random string or state",
        actualValue: "undefined",
        issue: "Missing nonce (recommended for key binding)",
        suggestedFix: "Generate a cryptographically random UUID and include as nonce",
        specReference: { spec: "PID-Presentation-Guide", section: "2.4" },
      });
    } else if (request.nonce) {
      this.addDetailedCheck(checks, "syntax.nonce.presence", "Nonce Presence", true, category, Severity.ERROR, {
        subcategory: "Security Validation",
        field: "nonce",
        expectedValue: "Cryptographically random string",
        actualValue: `<${request.nonce.length} chars>`,
        details: "nonce field is present",
      });
    } else {
      // State present but no nonce
      this.addDetailedCheck(checks, "syntax.nonce.presence", "Nonce Presence", true, category, Severity.WARNING, {
        subcategory: "Security Validation",
        field: "nonce",
        expectedValue: "Optional when state present",
        actualValue: "undefined (state present)",
        details: "nonce not present but state is available for session binding",
      });
    }

    // Check 10: nonce length validation
    if (request.nonce) {
      if (request.nonce.length < 16) {
        this.addDetailedCheck(checks, "syntax.nonce.length", "Nonce Cryptographic Strength", false, category, Severity.WARNING, {
          subcategory: "Security Validation",
          field: "nonce",
          expectedValue: "≥16 characters",
          actualValue: `${request.nonce.length} characters`,
          issue: "Nonce appears too short to be cryptographically secure",
          suggestedFix: "Use a UUID or 32+ character random string for nonce",
        });
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: "nonce",
          issue: "Nonce appears too short to be cryptographically secure",
          severity: Severity.WARNING,
          suggestedFix: "Use a UUID or 32+ character random string for nonce",
        });
      } else {
        this.addDetailedCheck(checks, "syntax.nonce.length", "Nonce Cryptographic Strength", true, category, Severity.WARNING, {
          subcategory: "Security Validation",
          field: "nonce",
          expectedValue: "≥16 characters",
          actualValue: `${request.nonce.length} characters`,
          details: "nonce has sufficient length",
        });
      }
    } else {
      this.addDetailedCheck(checks, "syntax.nonce.length", "Nonce Cryptographic Strength", false, category, Severity.WARNING, {
        subcategory: "Security Validation",
        field: "nonce",
        expectedValue: "≥16 characters",
        actualValue: "undefined",
        issue: "Cannot validate length: nonce is missing",
      });
    }

    // Check 11: dcql_query presence
    if (!request.dcqlQuery) {
      this.addDetailedCheck(checks, "syntax.query.presence", "Credential Query Presence", false, category, Severity.ERROR, {
        subcategory,
        field: "dcql_query",
        expectedValue: "dcql_query",
        actualValue: "undefined",
        issue: "Missing dcql_query",
        suggestedFix: "Add dcql_query with credentials array and credential_sets",
        specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
      });
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "dcql_query",
        issue: "Missing dcql_query",
        severity: Severity.ERROR,
        specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
        suggestedFix: "Add dcql_query with credentials array and credential_sets",
      });
    } else {
      this.addDetailedCheck(checks, "syntax.query.presence", "Credential Query Presence", true, category, Severity.ERROR, {
        subcategory,
        field: "dcql_query",
        expectedValue: "dcql_query",
        actualValue: "dcql_query present",
        details: "Credential query structure is present",
      });
    }

    // Check 12: state presence (OPTIONAL when nonce is present for key binding)
    // Per OpenID4VP spec: state is optional when using key binding (via nonce)
    if (!request.state && !request.nonce) {
      this.addDetailedCheck(checks, "syntax.state.presence", "State or Nonce Presence", false, category, Severity.ERROR, {
        subcategory: "Security Validation",
        field: "state",
        expectedValue: "state or nonce must be present",
        actualValue: "both undefined",
        issue: "At least one of state or nonce must be present for session binding",
        suggestedFix: "Add nonce for key binding or state for CSRF protection",
        specReference: { spec: "OpenID4VP", section: "6.1", quotation: "Either state or nonce MUST be present" },
      });
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "state",
        issue: "At least one of state or nonce must be present for session binding",
        severity: Severity.ERROR,
        specReference: { spec: "OpenID4VP", section: "6.1" },
        suggestedFix: "Add nonce for key binding or state for CSRF protection",
      });
    } else if (!request.state && request.nonce) {
      // State is optional when nonce is present - this is valid for key binding
      this.addDetailedCheck(checks, "syntax.state.presence", "State Parameter Presence", true, category, Severity.WARNING, {
        subcategory: "Security Validation",
        field: "state",
        expectedValue: "Optional when nonce present",
        actualValue: "undefined (nonce present)",
        details: "state is optional when nonce is used for key binding",
      });
    } else {
      this.addDetailedCheck(checks, "syntax.state.presence", "State Parameter Presence", true, category, Severity.WARNING, {
        subcategory: "Security Validation",
        field: "state",
        expectedValue: "Unique state string",
        actualValue: request.state,
        details: "state parameter is present for CSRF protection",
      });
    }

    // Check 13: client_metadata presence
    if (!request.clientMetadata) {
      this.addDetailedCheck(checks, "syntax.client_metadata.presence", "Client Metadata Presence", false, category, Severity.ERROR, {
        subcategory,
        field: "client_metadata",
        expectedValue: "client_metadata object",
        actualValue: "undefined",
        issue: "Missing client_metadata",
        suggestedFix: "Add client_metadata with jwks containing encryption keys",
        specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
      });
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "client_metadata.jwks",
        issue: "Missing encryption keys in client_metadata",
        severity: Severity.ERROR,
        specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
        suggestedFix: "Add JWKS with EC P-256 key for ECDH-ES encryption",
      });
    } else {
      this.addDetailedCheck(checks, "syntax.client_metadata.presence", "Client Metadata Presence", true, category, Severity.ERROR, {
        subcategory,
        field: "client_metadata",
        expectedValue: "client_metadata object",
        actualValue: "Present",
        details: "client_metadata field is present",
      });
    }

    // Check 14: client_metadata.jwks presence
    if (request.clientMetadata) {
      if (!request.clientMetadata.jwks) {
        this.addDetailedCheck(checks, "syntax.client_metadata.jwks", "JWKS Encryption Keys Presence", false, category, Severity.ERROR, {
          subcategory: "Security Validation",
          field: "client_metadata.jwks",
          expectedValue: "JWKS with encryption keys",
          actualValue: "undefined",
          issue: "Missing encryption keys in client_metadata",
          suggestedFix: "Add JWKS with EC P-256 key for ECDH-ES encryption",
          specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
        });
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: "client_metadata.jwks",
          issue: "Missing encryption keys in client_metadata",
          severity: Severity.ERROR,
          specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
          suggestedFix: "Add JWKS with EC P-256 key for ECDH-ES encryption",
        });
      } else {
        this.addDetailedCheck(checks, "syntax.client_metadata.jwks", "JWKS Encryption Keys Presence", true, category, Severity.ERROR, {
          subcategory: "Security Validation",
          field: "client_metadata.jwks",
          expectedValue: "JWKS with encryption keys",
          actualValue: `JWKS with ${request.clientMetadata.jwks.keys?.length || 0} keys`,
          details: "Encryption keys are present in JWKS",
        });
      }
    } else {
      this.addDetailedCheck(checks, "syntax.client_metadata.jwks", "JWKS Encryption Keys Presence", false, category, Severity.ERROR, {
        subcategory: "Security Validation",
        field: "client_metadata.jwks",
        expectedValue: "JWKS with encryption keys",
        actualValue: "undefined",
        issue: "Cannot validate JWKS: client_metadata is missing",
      });
    }

    // JWT-secured request validation (HAIP requirement)
    this.validateJWTParameters(request, checks, issues, category);

    // Prohibited fields validation
    this.validateProhibitedFields(request, checks, issues, category);
  }

  /**
   * Semantic validation with detailed checks (DCQLQuery structure, credential definitions, etc.)
   */
  private validateSemanticsDetailed(
    request: ExtendedAuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    const category = "Semantics";
    const dcqlQuery = request.dcqlQuery as any;

    // Check 1: DCQL Query presence
    if (!dcqlQuery) {
      // Already checked in syntax, skip
      return;
    }

    // Check 2: DCQL credentials array presence
    if (dcqlQuery) {
      if (!dcqlQuery.credentials || dcqlQuery.credentials.length === 0) {
        this.addDetailedCheck(
          checks,
          "semantic.dcql.credentials.presence",
          "Credentials Array Presence",
          false,
          category,
          Severity.ERROR,
          {
            subcategory: "DCQL Structure",
            field: "dcql_query.credentials",
            expectedValue: "Non-empty array",
            actualValue: "undefined or empty",
            issue: "At least one credential must be specified",
            suggestedFix: "Add at least one credential (e.g., pid-sd-jwt or pid-mso-mdoc)",
            specReference: { spec: "PID-Presentation-Guide", section: "3.3" },
          }
        );
        issues.push({
          category: ValidationErrorCategory.SEMANTIC_ERROR,
          field: "dcql_query.credentials",
          issue: "At least one credential must be specified",
          severity: Severity.ERROR,
          specReference: { spec: "PID-Presentation-Guide", section: "3.3" },
          suggestedFix: "Add at least one credential (e.g., pid-sd-jwt or pid-mso-mdoc)",
        });
      } else {
        this.addDetailedCheck(
          checks,
          "semantic.dcql.credentials.presence",
          "Credentials Array Presence",
          true,
          category,
          Severity.ERROR,
          {
            subcategory: "DCQL Structure",
            field: "dcql_query.credentials",
            expectedValue: "Non-empty array",
            actualValue: `Array with ${dcqlQuery.credentials.length} credential(s)`,
            details: `DCQL query contains ${dcqlQuery.credentials.length} credential definition(s)`,
          }
        );

        // Boundary check: Maximum credentials
        if (dcqlQuery.credentials.length > PresentationRequestValidator.MAX_CREDENTIALS) {
          this.addDetailedCheck(
            checks,
            "semantic.dcql.credentials.max_count",
            "Credentials Maximum Count",
            false,
            category,
            Severity.WARNING,
            {
              subcategory: "DCQL Structure",
              field: "dcql_query.credentials",
              expectedValue: `<= ${PresentationRequestValidator.MAX_CREDENTIALS}`,
              actualValue: `${dcqlQuery.credentials.length}`,
              issue: `Too many credentials requested (${dcqlQuery.credentials.length}), maximum recommended is ${PresentationRequestValidator.MAX_CREDENTIALS}`,
              suggestedFix: "Reduce number of credentials or split into multiple requests",
            }
          );
          issues.push({
            category: ValidationErrorCategory.SEMANTIC_ERROR,
            field: "dcql_query.credentials",
            issue: `Too many credentials (${dcqlQuery.credentials.length}), may cause performance issues`,
            severity: Severity.WARNING,
            suggestedFix: "Reduce number of credentials",
          });
        }

        // Check credential ID uniqueness
        const credentialIds = new Set();
        const duplicateIds: string[] = [];
        dcqlQuery.credentials.forEach((cred: any) => {
          if (cred.id) {
            if (credentialIds.has(cred.id)) {
              duplicateIds.push(cred.id);
            }
            credentialIds.add(cred.id);
          }
        });

        if (duplicateIds.length > 0) {
          this.addDetailedCheck(
            checks,
            "semantic.dcql.credentials.unique_ids",
            "Credential ID Uniqueness",
            false,
            category,
            Severity.ERROR,
            {
              subcategory: "DCQL Structure",
              field: "dcql_query.credentials",
              expectedValue: "All unique IDs",
              actualValue: `Duplicate IDs: ${duplicateIds.join(", ")}`,
              issue: `Duplicate credential IDs found: ${duplicateIds.join(", ")}`,
              suggestedFix: "Ensure each credential has a unique ID",
            }
          );
          issues.push({
            category: ValidationErrorCategory.SEMANTIC_ERROR,
            field: "dcql_query.credentials",
            issue: `Duplicate credential IDs: ${duplicateIds.join(", ")}`,
            severity: Severity.ERROR,
            suggestedFix: "Ensure each credential has a unique ID",
          });
        } else {
          this.addDetailedCheck(
            checks,
            "semantic.dcql.credentials.unique_ids",
            "Credential ID Uniqueness",
            true,
            category,
            Severity.ERROR,
            {
              subcategory: "DCQL Structure",
              field: "dcql_query.credentials",
              expectedValue: "All unique IDs",
              actualValue: "All unique",
              details: "All credential IDs are unique",
            }
          );
        }

        // Check 3-N: Validate each credential
        dcqlQuery.credentials.forEach((cred: any, idx: number) => {
          this.validateCredentialDetailed(cred, idx, checks, issues);
        });
      }

      // Check: credential_sets presence (OPTIONAL in DCQL but recommended)
      if (!dcqlQuery.credentialSets || dcqlQuery.credentialSets.length === 0) {
        this.addDetailedCheck(
          checks,
          "semantic.dcql.credential_sets.presence",
          "Credential Sets Presence",
          true,
          category,
          Severity.WARNING,
          {
            subcategory: "DCQL Structure",
            field: "dcql_query.credential_sets",
            expectedValue: "Non-empty array (optional but recommended)",
            actualValue: "undefined or empty",
            details: "credential_sets is optional in DCQL. When absent, all credentials are considered required.",
            suggestedFix: "Consider adding credential_sets to provide credential selection options",
            specReference: { spec: "DCQL", section: "Credential Sets", quotation: "credential_sets is optional" },
          }
        );
      } else {
        this.addDetailedCheck(
          checks,
          "semantic.dcql.credential_sets.presence",
          "Credential Sets Presence",
          true,
          category,
          Severity.ERROR,
          {
            subcategory: "DCQL Structure",
            field: "dcql_query.credential_sets",
            expectedValue: "Non-empty array",
            actualValue: `Array with ${dcqlQuery.credentialSets.length} set(s)`,
            details: `Credential sets define ${dcqlQuery.credentialSets.length} option set(s)`,
          }
        );

        // Validate credential set references
        const credentialIds = new Set(dcqlQuery.credentials.map((c: any) => c.id));
        let allReferencesValid = true;

        dcqlQuery.credentialSets.forEach((set: any, setIdx: number) => {
          // Skip sets that don't have options (they may have other fields like purpose, required, etc.)
          if (!set.options || !Array.isArray(set.options)) {
            return;
          }

          set.options.forEach((option: any, optIdx: number) => {
            // Handle both string IDs and arrays of IDs
            const optionArray = Array.isArray(option) ? option : [option];

            optionArray.forEach((credId: string) => {
              if (!credentialIds.has(credId)) {
                allReferencesValid = false;
                this.addDetailedCheck(
                  checks,
                  `semantic.dcql.credential_sets.reference.${setIdx}.${optIdx}`,
                  `Credential Reference Validity (Set ${setIdx}, Option ${optIdx})`,
                  false,
                  category,
                  Severity.ERROR,
                  {
                    subcategory: "DCQL Structure",
                    field: `dcql_query.credential_sets[${setIdx}].options[${optIdx}]`,
                    expectedValue: `One of: ${Array.from(credentialIds).join(", ")}`,
                    actualValue: credId,
                    issue: `Reference to undefined credential ID: "${credId}"`,
                    suggestedFix: `Use a valid credential ID: ${Array.from(credentialIds).join(" or ")}`,
                  }
                );
                issues.push({
                  category: ValidationErrorCategory.SEMANTIC_ERROR,
                  field: `dcql_query.credential_sets[${setIdx}].options[${optIdx}]`,
                  issue: `Reference to undefined credential ID: "${credId}"`,
                  severity: Severity.ERROR,
                  suggestedFix: `Use a valid credential ID: ${Array.from(credentialIds).join(" or ")}`,
                });
              }
            });
          });
        });

        if (allReferencesValid) {
          this.addDetailedCheck(
            checks,
            "semantic.dcql.credential_sets.references",
            "Credential Set References Validity",
            true,
            category,
            Severity.ERROR,
            {
              subcategory: "DCQL Structure",
              field: "dcql_query.credential_sets",
              expectedValue: "All references valid",
              actualValue: "All credential IDs found",
              details: "All credential set references point to valid credential definitions",
            }
          );
        }

        // Check for unreachable credentials (defined but never referenced)
        const referencedIds = new Set<string>();
        dcqlQuery.credentialSets.forEach((set: any) => {
          if (set.options && Array.isArray(set.options)) {
            set.options.forEach((option: any) => {
              const optionArray = Array.isArray(option) ? option : [option];
              optionArray.forEach((credId: string) => referencedIds.add(credId));
            });
          }
        });

        const unreachableIds: string[] = [];
        Array.from(credentialIds).forEach((id: any) => {
          if (!referencedIds.has(id)) {
            unreachableIds.push(id);
          }
        });

        if (unreachableIds.length > 0) {
          this.addDetailedCheck(
            checks,
            "semantic.dcql.credential_sets.unreachable",
            "No Unreachable Credentials",
            false,
            category,
            Severity.WARNING,
            {
              subcategory: "DCQL Structure",
              field: "dcql_query.credential_sets",
              expectedValue: "All credentials referenced",
              actualValue: `Unreachable: ${unreachableIds.join(", ")}`,
              issue: `Credentials defined but never referenced in credential_sets: ${unreachableIds.join(", ")}`,
              suggestedFix: "Either remove unreferenced credentials or add them to credential_sets",
            }
          );
          issues.push({
            category: ValidationErrorCategory.SEMANTIC_ERROR,
            field: "dcql_query.credential_sets",
            issue: `Unreachable credentials: ${unreachableIds.join(", ")}`,
            severity: Severity.WARNING,
            suggestedFix: "Reference all defined credentials in credential_sets or remove them",
          });
        } else {
          this.addDetailedCheck(
            checks,
            "semantic.dcql.credential_sets.unreachable",
            "No Unreachable Credentials",
            true,
            category,
            Severity.WARNING,
            {
              subcategory: "DCQL Structure",
              field: "dcql_query.credential_sets",
              expectedValue: "All credentials referenced",
              actualValue: "All reachable",
              details: "All defined credentials are referenced in credential_sets",
            }
          );
        }

        // Boundary check: Maximum credential_sets
        if (dcqlQuery.credentialSets.length > PresentationRequestValidator.MAX_CREDENTIAL_SETS) {
          this.addDetailedCheck(
            checks,
            "semantic.dcql.credential_sets.max_count",
            "Credential Sets Maximum Count",
            false,
            category,
            Severity.WARNING,
            {
              subcategory: "DCQL Structure",
              field: "dcql_query.credential_sets",
              expectedValue: `<= ${PresentationRequestValidator.MAX_CREDENTIAL_SETS}`,
              actualValue: `${dcqlQuery.credentialSets.length}`,
              issue: `Too many credential sets (${dcqlQuery.credentialSets.length})`,
              suggestedFix: "Reduce number of credential sets",
            }
          );
          issues.push({
            category: ValidationErrorCategory.SEMANTIC_ERROR,
            field: "dcql_query.credential_sets",
            issue: `Too many credential sets (${dcqlQuery.credentialSets.length})`,
            severity: Severity.WARNING,
            suggestedFix: "Reduce complexity",
          });
        }
      }
    }
  }

  /**
   * Validate individual credential with detailed checks
   */
  private validateCredentialDetailed(
    credential: any,
    index: number,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    const category = "Semantics";
    const fieldPrefix = `dcql_query.credentials[${index}]`;

    // Check: Credential ID presence
    if (!credential.id) {
      this.addDetailedCheck(
        checks,
        `semantic.credential.${index}.id`,
        `Credential ${index} ID Presence`,
        false,
        category,
        Severity.ERROR,
        {
          subcategory: "Credential Definition",
          field: `${fieldPrefix}.id`,
          expectedValue: "Non-empty string",
          actualValue: "undefined",
          issue: "Credential must have an id",
        }
      );
      issues.push({
        category: ValidationErrorCategory.SEMANTIC_ERROR,
        field: `${fieldPrefix}.id`,
        issue: "Credential must have an id",
        severity: Severity.ERROR,
      });
    } else {
      this.addDetailedCheck(
        checks,
        `semantic.credential.${index}.id`,
        `Credential ${index} ID Presence`,
        true,
        category,
        Severity.ERROR,
        {
          subcategory: "Credential Definition",
          field: `${fieldPrefix}.id`,
          expectedValue: "Non-empty string",
          actualValue: credential.id,
          details: `Credential has valid ID: ${credential.id}`,
        }
      );
    }

    // Check: Credential format
    if (!credential.format) {
      this.addDetailedCheck(
        checks,
        `semantic.credential.${index}.format.presence`,
        `Credential ${index} Format Presence`,
        false,
        category,
        Severity.ERROR,
        {
          subcategory: "Credential Definition",
          field: `${fieldPrefix}.format`,
          expectedValue: "dc+sd-jwt or mso_mdoc",
          actualValue: "undefined",
          issue: "Credential must specify format",
        }
      );
      issues.push({
        category: ValidationErrorCategory.SEMANTIC_ERROR,
        field: `${fieldPrefix}.format`,
        issue: "Credential must specify format",
        severity: Severity.ERROR,
      });
    } else if (!this.isValidPIDFormat(credential.format)) {
      this.addDetailedCheck(
        checks,
        `semantic.credential.${index}.format.validity`,
        `Credential ${index} Format Validity`,
        false,
        category,
        Severity.ERROR,
        {
          subcategory: "Credential Definition",
          field: `${fieldPrefix}.format`,
          expectedValue: "dc+sd-jwt or mso_mdoc",
          actualValue: credential.format,
          issue: `Invalid credential format: "${credential.format}". For PID, use "dc+sd-jwt" or "mso_mdoc"`,
          suggestedFix: 'Use "dc+sd-jwt" for JWT-based PID or "mso_mdoc" for document format',
          specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
        }
      );
      issues.push({
        category: ValidationErrorCategory.UNSUPPORTED_FORMAT,
        field: `${fieldPrefix}.format`,
        issue: `Invalid credential format: "${credential.format}". For PID, use "dc+sd-jwt" or "mso_mdoc"`,
        severity: Severity.ERROR,
        specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
        suggestedFix: 'Use "dc+sd-jwt" for JWT-based PID or "mso_mdoc" for document format',
      });
    } else {
      this.addDetailedCheck(
        checks,
        `semantic.credential.${index}.format.validity`,
        `Credential ${index} Format Validity`,
        true,
        category,
        Severity.ERROR,
        {
          subcategory: "Credential Definition",
          field: `${fieldPrefix}.format`,
          expectedValue: "dc+sd-jwt or mso_mdoc",
          actualValue: credential.format,
          details: `Credential uses valid PID format: ${credential.format}`,
        }
      );
    }

    // Format-specific checks
    if (credential.format === "dc+sd-jwt") {
      // Check claims
      if (!credential.claims || credential.claims.length === 0) {
        this.addDetailedCheck(
          checks,
          `semantic.credential.${index}.claims.presence`,
          `Credential ${index} Claims Presence (SD-JWT)`,
          false,
          category,
          Severity.ERROR,
          {
            subcategory: "Credential Definition",
            field: `${fieldPrefix}.claims`,
            expectedValue: "Non-empty array",
            actualValue: "undefined or empty",
            issue: 'Claims must be specified for "dc+sd-jwt" format',
            suggestedFix: 'Specify at least one claim (e.g., {path: ["given_name"]})',
            specReference: { spec: "PID-Presentation-Guide", section: "3.3" },
          }
        );
        issues.push({
          category: ValidationErrorCategory.SEMANTIC_ERROR,
          field: `${fieldPrefix}.claims`,
          issue: 'Claims must be specified for "dc+sd-jwt" format',
          severity: Severity.ERROR,
          specReference: { spec: "PID-Presentation-Guide", section: "3.3" },
          suggestedFix: 'Specify at least one claim (e.g., {path: ["given_name"]})',
        });
      } else {
        this.addDetailedCheck(
          checks,
          `semantic.credential.${index}.claims.presence`,
          `Credential ${index} Claims Presence (SD-JWT)`,
          true,
          category,
          Severity.ERROR,
          {
            subcategory: "Credential Definition",
            field: `${fieldPrefix}.claims`,
            expectedValue: "Non-empty array",
            actualValue: `Array with ${credential.claims.length} claim(s)`,
            details: `Credential specifies ${credential.claims.length} claim(s) for selective disclosure`,
          }
        );

        // Boundary check: Maximum claims
        if (credential.claims.length > PresentationRequestValidator.MAX_CLAIMS_PER_CREDENTIAL) {
          this.addDetailedCheck(
            checks,
            `semantic.credential.${index}.claims.max_count`,
            `Credential ${index} Claims Maximum Count`,
            false,
            category,
            Severity.WARNING,
            {
              subcategory: "Credential Definition",
              field: `${fieldPrefix}.claims`,
              expectedValue: `<= ${PresentationRequestValidator.MAX_CLAIMS_PER_CREDENTIAL}`,
              actualValue: `${credential.claims.length}`,
              issue: `Too many claims requested (${credential.claims.length})`,
              suggestedFix: "Reduce number of claims or consider if all are necessary",
            }
          );
          issues.push({
            category: ValidationErrorCategory.SEMANTIC_ERROR,
            field: `${fieldPrefix}.claims`,
            issue: `Too many claims (${credential.claims.length})`,
            severity: Severity.WARNING,
            suggestedFix: "Reduce number of claims",
          });
        }

        // Validate each claim path and check against known PID claims
        const unknownClaims: string[] = [];
        credential.claims.forEach((claim: any, claimIdx: number) => {
          // Check path exists and is non-empty
          if (!claim.path || !Array.isArray(claim.path) || claim.path.length === 0) {
            this.addDetailedCheck(
              checks,
              `semantic.credential.${index}.claims.${claimIdx}.path`,
              `Credential ${index} Claim ${claimIdx} Path`,
              false,
              category,
              Severity.ERROR,
              {
                subcategory: "Claim Definition",
                field: `${fieldPrefix}.claims[${claimIdx}].path`,
                expectedValue: "Non-empty array",
                actualValue: "undefined or empty",
                issue: "Claim path must be a non-empty array",
                suggestedFix: 'Provide claim path as array, e.g., ["given_name"]',
              }
            );
            issues.push({
              category: ValidationErrorCategory.SEMANTIC_ERROR,
              field: `${fieldPrefix}.claims[${claimIdx}].path`,
              issue: "Claim path must be a non-empty array",
              severity: Severity.ERROR,
              suggestedFix: 'Provide claim path as array, e.g., ["given_name"]',
            });
          } else {
            // Check if path contains empty segments
            const hasEmptySegment = claim.path.some((segment: string) => !segment || segment.trim() === "");
            if (hasEmptySegment) {
              this.addDetailedCheck(
                checks,
                `semantic.credential.${index}.claims.${claimIdx}.path_segments`,
                `Credential ${index} Claim ${claimIdx} Path Segments`,
                false,
                category,
                Severity.ERROR,
                {
                  subcategory: "Claim Definition",
                  field: `${fieldPrefix}.claims[${claimIdx}].path`,
                  expectedValue: "All segments non-empty",
                  actualValue: JSON.stringify(claim.path),
                  issue: "Claim path contains empty segments",
                  suggestedFix: "Remove empty segments from path",
                }
              );
              issues.push({
                category: ValidationErrorCategory.SEMANTIC_ERROR,
                field: `${fieldPrefix}.claims[${claimIdx}].path`,
                issue: "Claim path contains empty segments",
                severity: Severity.ERROR,
                suggestedFix: "Remove empty segments",
              });
            }

            // Check against known PID claims (for top-level claims)
            // Normalize claim name to handle format differences (e.g., birth_date → birthdate)
            if (claim.path.length === 1) {
              const claimName = claim.path[0];
              const normalized = normalizeClaimName(claimName);
              if (!PresentationRequestValidator.KNOWN_PID_SDJWT_CLAIMS.has(claimName) &&
                  !PresentationRequestValidator.KNOWN_PID_SDJWT_CLAIMS.has(normalized)) {
                unknownClaims.push(claimName);
              }
            }
          }
        });

        // Warn about unknown claims
        if (unknownClaims.length > 0) {
          this.addDetailedCheck(
            checks,
            `semantic.credential.${index}.claims.known`,
            `Credential ${index} Known Claims`,
            false,
            category,
            Severity.WARNING,
            {
              subcategory: "Credential Definition",
              field: `${fieldPrefix}.claims`,
              expectedValue: "Known PID claims",
              actualValue: `Unknown: ${unknownClaims.join(", ")}`,
              issue: `Unknown or custom claims requested: ${unknownClaims.join(", ")}`,
              suggestedFix: "Verify these are valid PID claims or document if custom",
            }
          );
          issues.push({
            category: ValidationErrorCategory.SEMANTIC_ERROR,
            field: `${fieldPrefix}.claims`,
            issue: `Unknown claims: ${unknownClaims.join(", ")}`,
            severity: Severity.WARNING,
            suggestedFix: "Verify these are standard PID claims",
          });
        }
      }

      // Check vct_values
      if (!credential.meta?.vctValues || credential.meta.vctValues.length === 0) {
        this.addDetailedCheck(
          checks,
          `semantic.credential.${index}.vct_values`,
          `Credential ${index} VCT Values`,
          false,
          category,
          Severity.ERROR,
          {
            subcategory: "Credential Definition",
            field: `${fieldPrefix}.meta.vct_values`,
            expectedValue: '["urn:eudi:pid:de:1"]',
            actualValue: "undefined or empty",
            issue: "Credential type (vct_values) must be specified",
            suggestedFix: 'Add meta.vct_values with ["urn:eudi:pid:de:1"]',
            specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
          }
        );
        issues.push({
          category: ValidationErrorCategory.SEMANTIC_ERROR,
          field: `${fieldPrefix}.meta.vct_values`,
          issue: "Credential type (vct_values) must be specified",
          severity: Severity.ERROR,
          specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
          suggestedFix: 'Add meta.vct_values with ["urn:eudi:pid:de:1"]',
        });
      } else if (!credential.meta.vctValues.includes("urn:eudi:pid:de:1")) {
        this.addDetailedCheck(
          checks,
          `semantic.credential.${index}.vct_values`,
          `Credential ${index} VCT Values`,
          false,
          category,
          Severity.ERROR,
          {
            subcategory: "Credential Definition",
            field: `${fieldPrefix}.meta.vct_values`,
            expectedValue: '"urn:eudi:pid:de:1"',
            actualValue: credential.meta.vctValues.join(", "),
            issue: `Invalid credential type. Expected "urn:eudi:pid:de:1"`,
          }
        );
        issues.push({
          category: ValidationErrorCategory.SEMANTIC_ERROR,
          field: `${fieldPrefix}.meta.vct_values`,
          issue: `Invalid credential type. Expected "urn:eudi:pid:de:1", got: ${credential.meta.vctValues.join(", ")}`,
          severity: Severity.ERROR,
        });
      } else {
        this.addDetailedCheck(
          checks,
          `semantic.credential.${index}.vct_values`,
          `Credential ${index} VCT Values`,
          true,
          category,
          Severity.ERROR,
          {
            subcategory: "Credential Definition",
            field: `${fieldPrefix}.meta.vct_values`,
            expectedValue: '"urn:eudi:pid:de:1"',
            actualValue: credential.meta.vctValues.join(", "),
            details: "Credential type correctly specifies German PID",
          }
        );
      }
    }

    // mDoc format checks
    if (credential.format === "mso_mdoc") {
      if (!credential.meta?.doctypeValue) {
        this.addDetailedCheck(
          checks,
          `semantic.credential.${index}.doctype_value`,
          `Credential ${index} Doctype Value`,
          false,
          category,
          Severity.ERROR,
          {
            subcategory: "Credential Definition",
            field: `${fieldPrefix}.meta.doctype_value`,
            expectedValue: '"eu.europa.ec.eudi.pid.1"',
            actualValue: "undefined",
            issue: "Document type must be specified for mso_mdoc",
            suggestedFix: 'Add meta.doctype_value: "eu.europa.ec.eudi.pid.1"',
            specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
          }
        );
        issues.push({
          category: ValidationErrorCategory.SEMANTIC_ERROR,
          field: `${fieldPrefix}.meta.doctype_value`,
          issue: "Document type must be specified for mso_mdoc",
          severity: Severity.ERROR,
          specReference: { spec: "PID-Presentation-Guide", section: "3.2" },
          suggestedFix: 'Add meta.doctype_value: "eu.europa.ec.eudi.pid.1"',
        });
      } else if (credential.meta.doctypeValue !== "eu.europa.ec.eudi.pid.1") {
        this.addDetailedCheck(
          checks,
          `semantic.credential.${index}.doctype_value`,
          `Credential ${index} Doctype Value`,
          false,
          category,
          Severity.ERROR,
          {
            subcategory: "Credential Definition",
            field: `${fieldPrefix}.meta.doctype_value`,
            expectedValue: '"eu.europa.ec.eudi.pid.1"',
            actualValue: credential.meta.doctypeValue,
            issue: `Invalid document type. Expected "eu.europa.ec.eudi.pid.1"`,
          }
        );
        issues.push({
          category: ValidationErrorCategory.SEMANTIC_ERROR,
          field: `${fieldPrefix}.meta.doctype_value`,
          issue: `Invalid document type. Expected "eu.europa.ec.eudi.pid.1", got: ${credential.meta.doctypeValue}`,
          severity: Severity.ERROR,
        });
      } else {
        this.addDetailedCheck(
          checks,
          `semantic.credential.${index}.doctype_value`,
          `Credential ${index} Doctype Value`,
          true,
          category,
          Severity.ERROR,
          {
            subcategory: "Credential Definition",
            field: `${fieldPrefix}.meta.doctype_value`,
            expectedValue: '"eu.europa.ec.eudi.pid.1"',
            actualValue: credential.meta.doctypeValue,
            details: "Document type correctly specifies PID mDoc format",
          }
        );
      }
    }
  }

  private validateSyntax(request: ExtendedAuthorizationRequest): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Layer 1: Transport and basic field validation

    // Required: client_id
    if (!request.clientId) {
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "client_id",
        issue: "Missing required field",
        severity: Severity.ERROR,
        specReference: {
          spec: "PID-Presentation-Guide",
          section: "3.3",
          url: "https://bmi.usercontent.opencode.de/eudi-wallet/developer-guide/PID_Presentation/#33-request-construction-checklist",
        },
        suggestedFix: "Add client_id field with x509_hash: scheme identifier",
      });
    } else {
      // client_id should use x509_hash scheme for HAIP
      if (!request.clientId.startsWith("x509_hash:")) {
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: "client_id",
          issue: `Client ID should use x509_hash: scheme for HAIP compliance, got: ${request.clientId}`,
          severity: Severity.WARNING,
          specReference: {
            spec: "PID-Presentation-Guide",
            section: "3.2",
            quotation: "client_id uses x509_hash: scheme per HAIP",
          },
          suggestedFix: "Change client_id format to x509_hash:<hash>",
        });
      }
    }

    // Required: response_type must be "vp_token"
    if (!request.responseType) {
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "response_type",
        issue: "Missing required field",
        severity: Severity.ERROR,
      });
    } else if (!this.isValidResponseType(request.responseType)) {
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "response_type",
        issue: `Invalid response_type: "${request.responseType}". Must be "vp_token" or include "vp_token"`,
        severity: Severity.ERROR,
        suggestedFix: 'Set response_type to "vp_token"',
      });
    }

    // Required for HAIP: response_uri (not redirect_uri)
    if (!request.responseUri && !request.redirectUri) {
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "response_uri",
        issue: "Missing response_uri (required for direct_post.jwt response mode)",
        severity: Severity.ERROR,
        specReference: {
          spec: "PID-Presentation-Guide",
          section: "3.2",
          quotation: "response_uri: HTTPS endpoint where wallet posts the vp_token",
        },
        suggestedFix: "Add response_uri field with valid HTTPS URL",
      });
    } else if (request.responseUri) {
      if (!request.responseUri.startsWith("https://")) {
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: "response_uri",
          issue: `response_uri must be HTTPS, got: ${request.responseUri}`,
          severity: Severity.ERROR,
          suggestedFix: "Use HTTPS URL for response_uri",
        });
      }
    }

    // Required for HAIP: response_mode = "direct_post.jwt"
    if (!request.responseMode) {
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "response_mode",
        issue: 'Missing response_mode. Should be "direct_post.jwt" for HAIP',
        severity: Severity.WARNING,
        specReference: {
          spec: "PID-Presentation-Guide",
          section: "3.2",
          quotation: "response_mode: direct_post.jwt is mandatory for HAIP high-assurance flows",
        },
        suggestedFix: 'Set response_mode to "direct_post.jwt"',
      });
    } else if (request.responseMode !== "direct_post.jwt") {
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "response_mode",
        issue: `Invalid response_mode: "${request.responseMode}". Must be "direct_post.jwt" for HAIP`,
        severity: Severity.ERROR,
        suggestedFix: 'Set response_mode to "direct_post.jwt"',
      });
    }

    // Required for session binding: nonce
    if (!request.nonce) {
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "nonce",
        issue: "Missing required nonce for session binding",
        severity: Severity.ERROR,
        specReference: {
          spec: "PID-Presentation-Guide",
          section: "2.4",
          quotation: "Session and Transaction Binding - nonce prevents replay attacks",
        },
        suggestedFix: "Generate a cryptographically random UUID and include as nonce",
      });
    } else {
      // Validate nonce looks reasonable (not empty, reasonable length)
      if (request.nonce.length < 16) {
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: "nonce",
          issue: "Nonce appears too short to be cryptographically secure",
          severity: Severity.WARNING,
          suggestedFix: "Use a UUID or 32+ character random string for nonce",
        });
      }
    }

    // Required: DCQL query
    if (!request.dcqlQuery) {
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "dcql_query",
        issue: "Missing dcql_query",
        severity: Severity.ERROR,
        specReference: {
          spec: "PID-Presentation-Guide",
          section: "3.2",
          quotation: "dcql_query: Defines which credentials and attributes are requested",
        },
        suggestedFix: "Add dcql_query with credentials array and credential_sets",
      });
    }

    // Required: state (CSRF protection)
    if (!request.state) {
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "state",
        issue: "Missing state parameter (recommended for CSRF protection)",
        severity: Severity.WARNING,
        specReference: {
          spec: "PID-Presentation-Guide",
          section: "3.3",
          quotation: "state: Present (recommended for CSRF protection)",
        },
        suggestedFix: "Add a unique state value to track this request",
      });
    }

    // Required: client_metadata with encryption keys
    if (!request.clientMetadata || !request.clientMetadata.jwks) {
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "client_metadata.jwks",
        issue: "Missing encryption keys in client_metadata",
        severity: Severity.ERROR,
        specReference: {
          spec: "PID-Presentation-Guide",
          section: "3.2",
          quotation: "client_metadata.jwks: Contains valid encryption key",
        },
        suggestedFix: "Add JWKS with EC P-256 key for ECDH-ES encryption",
      });
    }

    return issues;
  }

  private validateSemantics(request: ExtendedAuthorizationRequest): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Layer 2-6: DCQL Query and Credential Structure Validation

    const dcqlQuery = request.dcqlQuery as DCQLQuery | undefined;

    if (dcqlQuery) {
      // Validate credentials array
      if (!dcqlQuery.credentials || dcqlQuery.credentials.length === 0) {
        issues.push({
          category: ValidationErrorCategory.SEMANTIC_ERROR,
          field: "dcql_query.credentials",
          issue: "At least one credential must be specified",
          severity: Severity.ERROR,
          specReference: {
            spec: "PID-Presentation-Guide",
            section: "3.3",
            quotation: "dcql_query.credentials: At least one credential specified",
          },
          suggestedFix:
            "Add at least one credential (e.g., pid-sd-jwt or pid-mso-mdoc)",
        });
      } else {
        // Validate each credential
        dcqlQuery.credentials.forEach((cred, idx) => {
          const credentialIssues = this.validateDCQLCredential(cred, idx);
          issues.push(...credentialIssues);
        });
      }

      // Validate credential_sets
      if (!dcqlQuery.credentialSets || dcqlQuery.credentialSets.length === 0) {
        issues.push({
          category: ValidationErrorCategory.SEMANTIC_ERROR,
          field: "dcql_query.credential_sets",
          issue: "credential_sets must define at least one valid option set",
          severity: Severity.ERROR,
          specReference: {
            spec: "PID-Presentation-Guide",
            section: "3.2",
            quotation: "credential_sets: Create optionality for responses",
          },
          suggestedFix:
            "Add credential_sets with options referring to credential IDs (e.g., [['pid-sd-jwt'], ['pid-mso-mdoc']])",
        });
      } else {
        // Validate credential_sets reference valid credential IDs
        const credentialIds = new Set(dcqlQuery.credentials.map((c) => c.id));
        dcqlQuery.credentialSets.forEach((set, setIdx) => {
          set.options.forEach((option, optIdx) => {
            option.forEach((credId) => {
              if (!credentialIds.has(credId)) {
                issues.push({
                  category: ValidationErrorCategory.SEMANTIC_ERROR,
                  field: `dcql_query.credential_sets[${setIdx}].options[${optIdx}]`,
                  issue: `Reference to undefined credential ID: "${credId}"`,
                  severity: Severity.ERROR,
                  suggestedFix: `Use a valid credential ID: ${Array.from(credentialIds).join(" or ")}`,
                });
              }
            });
          });
        });
      }
    }

    return issues;
  }

  private validateDCQLCredential(
    credential: DCQLCredential,
    index: number
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const fieldPrefix = `dcql_query.credentials[${index}]`;

    // Check credential ID
    if (!credential.id) {
      issues.push({
        category: ValidationErrorCategory.SEMANTIC_ERROR,
        field: `${fieldPrefix}.id`,
        issue: "Credential must have an id",
        severity: Severity.ERROR,
      });
    }

    // Check format
    if (!credential.format) {
      issues.push({
        category: ValidationErrorCategory.SEMANTIC_ERROR,
        field: `${fieldPrefix}.format`,
        issue: "Credential must specify format",
        severity: Severity.ERROR,
      });
    } else if (!this.isValidPIDFormat(credential.format)) {
      issues.push({
        category: ValidationErrorCategory.UNSUPPORTED_FORMAT,
        field: `${fieldPrefix}.format`,
        issue: `Invalid credential format: "${credential.format}". For PID, use "dc+sd-jwt" or "mso_mdoc"`,
        severity: Severity.ERROR,
        specReference: {
          spec: "PID-Presentation-Guide",
          section: "3.2",
          quotation: "Credential format: dc+sd-jwt for SD-JWT VC format",
        },
        suggestedFix: 'Use "dc+sd-jwt" for JWT-based PID or "mso_mdoc" for document format',
      });
    }

    // Check claims for sd-jwt format
    if (credential.format === "dc+sd-jwt") {
      if (!credential.claims || credential.claims.length === 0) {
        issues.push({
          category: ValidationErrorCategory.SEMANTIC_ERROR,
          field: `${fieldPrefix}.claims`,
          issue: 'Claims must be specified for "dc+sd-jwt" format',
          severity: Severity.ERROR,
          specReference: {
            spec: "PID-Presentation-Guide",
            section: "3.3",
            quotation: "dcql_query.credentials[].claims: At least one claim per credential",
          },
          suggestedFix:
            'Specify at least one claim (e.g., {path: ["given_name"]})',
        });
      } else {
        // Validate claim paths
        credential.claims.forEach((claim, claimIdx) => {
          if (!claim.path || claim.path.length === 0) {
            issues.push({
              category: ValidationErrorCategory.SEMANTIC_ERROR,
              field: `${fieldPrefix}.claims[${claimIdx}].path`,
              issue: "Claim path must be non-empty",
              severity: Severity.ERROR,
            });
          }
        });
      }

      // Check meta for vct_values
      if (!credential.meta?.vctValues || credential.meta.vctValues.length === 0) {
        issues.push({
          category: ValidationErrorCategory.SEMANTIC_ERROR,
          field: `${fieldPrefix}.meta.vct_values`,
          issue: "Credential type (vct_values) must be specified",
          severity: Severity.ERROR,
          specReference: {
            spec: "PID-Presentation-Guide",
            section: "3.2",
            quotation: "meta.vct_values: Identifies German PID VC (urn:eudi:pid:de:1)",
          },
          suggestedFix: 'Add meta.vct_values with ["urn:eudi:pid:de:1"]',
        });
      } else if (!credential.meta.vctValues.includes("urn:eudi:pid:de:1")) {
        issues.push({
          category: ValidationErrorCategory.SEMANTIC_ERROR,
          field: `${fieldPrefix}.meta.vct_values`,
          issue: `Invalid credential type. Expected "urn:eudi:pid:de:1", got: ${credential.meta.vctValues.join(", ")}`,
          severity: Severity.ERROR,
        });
      }
    }

    // Check meta for mso_mdoc format
    if (credential.format === "mso_mdoc") {
      if (!credential.meta?.doctypeValue) {
        issues.push({
          category: ValidationErrorCategory.SEMANTIC_ERROR,
          field: `${fieldPrefix}.meta.doctype_value`,
          issue: "Document type must be specified for mso_mdoc",
          severity: Severity.ERROR,
          specReference: {
            spec: "PID-Presentation-Guide",
            section: "3.2",
            quotation: "meta.doctype_value: Identifies the PID mDoc document type",
          },
          suggestedFix: 'Add meta.doctype_value: "eu.europa.ec.eudi.pid.1"',
        });
      } else if (credential.meta.doctypeValue !== "eu.europa.ec.eudi.pid.1") {
        issues.push({
          category: ValidationErrorCategory.SEMANTIC_ERROR,
          field: `${fieldPrefix}.meta.doctype_value`,
          issue: `Invalid document type. Expected "eu.europa.ec.eudi.pid.1", got: ${credential.meta.doctypeValue}`,
          severity: Severity.ERROR,
        });
      }
    }

    return issues;
  }

  private validatePidPresentationProfile(
    request: ExtendedAuthorizationRequest
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // PID Presentation specific requirements

    // 1. Must use direct_post.jwt response mode
    if (request.responseMode !== "direct_post.jwt") {
      issues.push({
        category: ValidationErrorCategory.PROFILE_VIOLATION,
        field: "response_mode",
        issue: 'EUDI ARF requires response_mode to be "direct_post.jwt"',
        severity: Severity.ERROR,
        specReference: {
          spec: "EUDI-ARF",
          quotation: "High-assurance profiles must use direct_post.jwt",
        },
      });
    }

    // 2. Must use x509_hash scheme for client_id
    if (request.clientId && !request.clientId.startsWith("x509_hash:")) {
      issues.push({
        category: ValidationErrorCategory.PROFILE_VIOLATION,
        field: "client_id",
        issue: "EUDI ARF requires client_id to use x509_hash: scheme",
        severity: Severity.ERROR,
      });
    }

    // 3. Must include verifier_info with certificate (WARNING only - EUDI wallet doesn't check yet)
    if (!request.verifierInfo) {
      issues.push({
        category: ValidationErrorCategory.PROFILE_VIOLATION,
        field: "verifier_info",
        issue: "EUDI ARF requires verifier_info with certificate (currently optional as EUDI wallet doesn't enforce)",
        severity: Severity.WARNING,
        specReference: {
          spec: "EUDI-ARF",
          quotation: "verifier_info: Contains valid registration certificate",
        },
      });
    }

    // 4. VP formats supported should include both sd-jwt and mso_mdoc
    const vpFormats = request.clientMetadata?.vpFormatsSupported;
    if (vpFormats) {
      const hasSdJwt = vpFormats["dc+sd-jwt"] !== undefined;
      const hasMdoc = vpFormats["mso_mdoc"] !== undefined;

      if (!hasSdJwt) {
        issues.push({
          category: ValidationErrorCategory.PROFILE_VIOLATION,
          field: "client_metadata.vp_formats_supported",
          issue: 'EUDI ARF should support "dc+sd-jwt" format',
          severity: Severity.WARNING,
        });
      }

      if (!hasMdoc) {
        issues.push({
          category: ValidationErrorCategory.PROFILE_VIOLATION,
          field: "client_metadata.vp_formats_supported",
          issue: 'EUDI ARF should support "mso_mdoc" format',
          severity: Severity.WARNING,
        });
      }
    }

    // 5. aud claim should be fixed value for self-issued
    if (request.dcqlQuery && !(request as any).aud) {
      issues.push({
        category: ValidationErrorCategory.PROFILE_VIOLATION,
        field: "aud",
        issue: "EUDI ARF requires aud claim to bind response to request",
        severity: Severity.WARNING,
        specReference: {
          spec: "PID-Presentation-Guide",
          section: "2.4",
          quotation: "aud: Fixed value for HAIP aligned responses",
        },
        suggestedFix: 'Add aud field with value "https://self-issued.me/v2"',
      });
    }

    return issues;
  }

  private isValidResponseType(responseType: string): boolean {
    // response_type must include "vp_token"
    return responseType.includes("vp_token");
  }

  private isValidPIDFormat(format: string): boolean {
    // Valid PID formats
    const validFormats = ["dc+sd-jwt", "vc+sd-jwt", "mso_mdoc"];
    return validFormats.includes(format);
  }

  /**
   * Validate JWT-secured request parameters (HAIP requirement)
   */
  private validateJWTParameters(
    request: ExtendedAuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[],
    category: string
  ): void {
    const subcategory = "JWT Parameters";

    // Check aud (audience) - REQUIRED for HAIP
    if (!request.aud) {
      this.addDetailedCheck(checks, "syntax.jwt.aud.presence", "Audience (aud) Presence", false, category, Severity.ERROR, {
        subcategory,
        field: "aud",
        expectedValue: "https://self-issued.me/v2",
        actualValue: "undefined",
        issue: "Missing required aud claim for HAIP compliance",
        suggestedFix: 'Add aud field with value "https://self-issued.me/v2"',
        specReference: { spec: "OpenID4VP", section: "6", quotation: "aud: REQUIRED. Must be https://self-issued.me/v2" },
      });
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: "aud",
        issue: "Missing required aud claim for HAIP compliance",
        severity: Severity.ERROR,
        specReference: { spec: "OpenID4VP", section: "6" },
        suggestedFix: 'Add aud field with value "https://self-issued.me/v2"',
      });
    } else {
      const expectedAud = "https://self-issued.me/v2";
      if (request.aud !== expectedAud) {
        this.addDetailedCheck(checks, "syntax.jwt.aud.value", "Audience (aud) Value", false, category, Severity.ERROR, {
          subcategory,
          field: "aud",
          expectedValue: expectedAud,
          actualValue: request.aud,
          issue: `Invalid aud value. Must be "${expectedAud}"`,
          suggestedFix: `Change aud to "${expectedAud}"`,
          specReference: { spec: "OpenID4VP", section: "6" },
        });
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: "aud",
          issue: `Invalid aud value: "${request.aud}". Must be "${expectedAud}"`,
          severity: Severity.ERROR,
          specReference: { spec: "OpenID4VP", section: "6" },
          suggestedFix: `Change aud to "${expectedAud}"`,
        });
      } else {
        this.addDetailedCheck(checks, "syntax.jwt.aud.value", "Audience (aud) Value", true, category, Severity.ERROR, {
          subcategory,
          field: "aud",
          expectedValue: expectedAud,
          actualValue: request.aud,
          details: "Audience claim is correctly set for self-issued responses",
        });
      }
    }

    // Check iss (issuer) - REQUIRED in JWT-secured requests
    if (request.iss !== undefined) {
      this.addDetailedCheck(checks, "syntax.jwt.iss.presence", "Issuer (iss) Presence", true, category, Severity.WARNING, {
        subcategory,
        field: "iss",
        expectedValue: "Verifier identifier",
        actualValue: request.iss,
        details: "Issuer claim is present (recommended for JWT-secured requests)",
      });

      // Validate iss matches client_id
      if (request.clientId && request.iss !== request.clientId) {
        this.addDetailedCheck(checks, "syntax.jwt.iss.matches_client_id", "Issuer Matches Client ID", false, category, Severity.WARNING, {
          subcategory,
          field: "iss",
          expectedValue: request.clientId,
          actualValue: request.iss,
          issue: "iss should match client_id for consistency",
          suggestedFix: "Set iss to match client_id",
        });
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: "iss",
          issue: `iss ("${request.iss}") should match client_id ("${request.clientId}")`,
          severity: Severity.WARNING,
          suggestedFix: "Set iss to match client_id",
        });
      } else if (request.clientId) {
        this.addDetailedCheck(checks, "syntax.jwt.iss.matches_client_id", "Issuer Matches Client ID", true, category, Severity.WARNING, {
          subcategory,
          field: "iss",
          expectedValue: request.clientId,
          actualValue: request.iss,
          details: "Issuer matches client_id",
        });
      }
    } else {
      this.addDetailedCheck(checks, "syntax.jwt.iss.presence", "Issuer (iss) Presence", true, category, Severity.WARNING, {
        subcategory,
        field: "iss",
        expectedValue: "Optional",
        actualValue: "undefined",
        details: "Issuer claim is optional but recommended for JWT-secured requests",
      });
    }

    // Temporal claims validation will be added in separate method
  }

  /**
   * Validate prohibited fields that must not be present in HAIP requests
   */
  private validateProhibitedFields(
    request: ExtendedAuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[],
    category: string
  ): void {
    const subcategory = "Prohibited Fields";

    Array.from(PresentationRequestValidator.PROHIBITED_FIELDS.entries()).forEach(([field, reason]) => {
      const fieldValue = (request as any)[field];
      if (fieldValue !== undefined) {
        this.addDetailedCheck(
          checks,
          `syntax.prohibited.${field}`,
          `Prohibited Field: ${field}`,
          false,
          category,
          Severity.ERROR,
          {
            subcategory,
            field,
            expectedValue: "Must not be present",
            actualValue: String(fieldValue),
            issue: `Prohibited field "${field}" is present in request`,
            suggestedFix: reason,
            specReference: { spec: "OpenID4VP", section: "6", quotation: `${field} must not be used` },
          }
        );
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field,
          issue: `Prohibited field "${field}" is present. ${reason}`,
          severity: Severity.ERROR,
          specReference: { spec: "OpenID4VP", section: "6" },
          suggestedFix: `Remove ${field}. ${reason}`,
        });
      }
    });

    // If no prohibited fields found, add a passing check
    const prohibitedFieldsFound = Array.from(PresentationRequestValidator.PROHIBITED_FIELDS.keys())
      .some(field => (request as any)[field] !== undefined);

    if (!prohibitedFieldsFound) {
      this.addDetailedCheck(
        checks,
        "syntax.prohibited.none",
        "No Prohibited Fields",
        true,
        category,
        Severity.ERROR,
        {
          subcategory,
          field: "request",
          expectedValue: "No prohibited fields",
          actualValue: "Clean",
          details: "Request contains no prohibited fields",
        }
      );
    }
  }

  /**
   * Validate HTTPS URL structure and security
   */
  private validateHTTPSURL(
    url: string,
    fieldName: string,
    checks: ValidationCheck[],
    issues: ValidationIssue[],
    category: string
  ): void {
    const subcategory = "URL Validation";
    const checkIdPrefix = `syntax.url.${fieldName}`;

    // Basic HTTPS check already done, now deep validation
    try {
      const parsed = new URL(url);

      // Check for localhost/private IPs (security risk in production)
      const hostname = parsed.hostname.toLowerCase();
      const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" ||
        hostname.startsWith("192.168.") || hostname.startsWith("10.") ||
        hostname.startsWith("172.16.") || hostname.startsWith("172.17.") ||
        hostname.startsWith("172.18.") || hostname.startsWith("172.19.") ||
        hostname.startsWith("172.20.") || hostname.startsWith("172.21.") ||
        hostname.startsWith("172.22.") || hostname.startsWith("172.23.") ||
        hostname.startsWith("172.24.") || hostname.startsWith("172.25.") ||
        hostname.startsWith("172.26.") || hostname.startsWith("172.27.") ||
        hostname.startsWith("172.28.") || hostname.startsWith("172.29.") ||
        hostname.startsWith("172.30.") || hostname.startsWith("172.31.");

      if (isLocalhost) {
        this.addDetailedCheck(
          checks,
          `${checkIdPrefix}.localhost`,
          `${fieldName} Not Localhost/Private IP`,
          false,
          category,
          Severity.WARNING,
          {
            subcategory,
            field: fieldName,
            expectedValue: "Public domain",
            actualValue: hostname,
            issue: `${fieldName} points to localhost or private IP (${hostname})`,
            suggestedFix: "Use a public domain for production",
          }
        );
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: fieldName,
          issue: `${fieldName} uses localhost/private IP: ${hostname}`,
          severity: Severity.WARNING,
          suggestedFix: "Use public domain in production",
        });
      }

      // Check for URL fragments (not allowed in response_uri)
      if (fieldName === "response_uri" && parsed.hash) {
        this.addDetailedCheck(
          checks,
          `${checkIdPrefix}.no_fragment`,
          `${fieldName} No Fragment`,
          false,
          category,
          Severity.ERROR,
          {
            subcategory,
            field: fieldName,
            expectedValue: "No URL fragment",
            actualValue: `Contains fragment: ${parsed.hash}`,
            issue: "response_uri must not contain URL fragment (#)",
            suggestedFix: "Remove fragment from URL",
          }
        );
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: fieldName,
          issue: "response_uri must not contain URL fragment",
          severity: Severity.ERROR,
          suggestedFix: "Remove fragment",
        });
      }

      // URL length check (prevent excessively long URLs)
      if (url.length > 2000) {
        this.addDetailedCheck(
          checks,
          `${checkIdPrefix}.length`,
          `${fieldName} Length`,
          false,
          category,
          Severity.WARNING,
          {
            subcategory,
            field: fieldName,
            expectedValue: "<= 2000 characters",
            actualValue: `${url.length} characters`,
            issue: `URL is very long (${url.length} characters)`,
            suggestedFix: "Shorten URL if possible",
          }
        );
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: fieldName,
          issue: `URL too long: ${url.length} characters`,
          severity: Severity.WARNING,
          suggestedFix: "Shorten URL",
        });
      }
    } catch (e) {
      this.addDetailedCheck(
        checks,
        `${checkIdPrefix}.parseable`,
        `${fieldName} Parseable`,
        false,
        category,
        Severity.ERROR,
        {
          subcategory,
          field: fieldName,
          expectedValue: "Valid URL",
          actualValue: url,
          issue: `Invalid URL structure: ${(e as Error).message}`,
          suggestedFix: "Provide a well-formed URL",
        }
      );
      issues.push({
        category: ValidationErrorCategory.SYNTAX_ERROR,
        field: fieldName,
        issue: `Invalid URL: ${(e as Error).message}`,
        severity: Severity.ERROR,
        suggestedFix: "Fix URL structure",
      });
    }
  }

  /**
   * Validate temporal claims (iat, exp, nbf) with clock skew tolerance
   */
  private validateTemporalClaims(
    request: ExtendedAuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[],
    category: string
  ): void {
    const subcategory = "Temporal Validation";
    const now = Math.floor(Date.now() / 1000); // Current time in seconds

    // iat (issued at) validation
    if (request.iat !== undefined) {
      // Check iat is not in the future (with clock skew tolerance)
      if (request.iat > now + PresentationRequestValidator.CLOCK_SKEW_SECONDS) {
        this.addDetailedCheck(
          checks,
          "syntax.jwt.iat.future",
          "IAT Not in Future",
          false,
          category,
          Severity.ERROR,
          {
            subcategory,
            field: "iat",
            expectedValue: `<= ${now + PresentationRequestValidator.CLOCK_SKEW_SECONDS}`,
            actualValue: `${request.iat}`,
            issue: "iat (issued at) is in the future",
            suggestedFix: "Set iat to current server time",
          }
        );
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: "iat",
          issue: "iat is in the future",
          severity: Severity.ERROR,
          suggestedFix: "Correct server clock or iat value",
        });
      }

      // Check iat is not too old
      const age = now - request.iat;
      if (age > PresentationRequestValidator.MAX_REQUEST_AGE_SECONDS) {
        this.addDetailedCheck(
          checks,
          "syntax.jwt.iat.age",
          "IAT Not Too Old",
          false,
          category,
          Severity.WARNING,
          {
            subcategory,
            field: "iat",
            expectedValue: `>= ${now - PresentationRequestValidator.MAX_REQUEST_AGE_SECONDS}`,
            actualValue: `${request.iat} (${Math.floor(age / 60)} minutes old)`,
            issue: `Request is very old (${Math.floor(age / 60)} minutes)`,
            suggestedFix: "Generate a fresh request",
          }
        );
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: "iat",
          issue: `Request too old: ${Math.floor(age / 60)} minutes`,
          severity: Severity.WARNING,
          suggestedFix: "Generate fresh request",
        });
      }
    }

    // exp (expiration) validation
    if (request.exp !== undefined) {
      // Check exp is in the future
      if (request.exp < now - PresentationRequestValidator.CLOCK_SKEW_SECONDS) {
        this.addDetailedCheck(
          checks,
          "syntax.jwt.exp.expired",
          "Request Not Expired",
          false,
          category,
          Severity.ERROR,
          {
            subcategory,
            field: "exp",
            expectedValue: `> ${now - PresentationRequestValidator.CLOCK_SKEW_SECONDS}`,
            actualValue: `${request.exp}`,
            issue: "Request has expired",
            suggestedFix: "Generate a new request with future expiration",
          }
        );
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: "exp",
          issue: "Request expired",
          severity: Severity.ERROR,
          suggestedFix: "Generate new request",
        });
      }

      // Check exp duration is reasonable (if iat present)
      if (request.iat !== undefined) {
        const duration = request.exp - request.iat;
        if (duration > PresentationRequestValidator.MAX_EXPIRY_DURATION_SECONDS) {
          this.addDetailedCheck(
            checks,
            "syntax.jwt.exp.duration",
            "Expiration Duration Reasonable",
            false,
            category,
            Severity.WARNING,
            {
              subcategory,
              field: "exp",
              expectedValue: `<= ${PresentationRequestValidator.MAX_EXPIRY_DURATION_SECONDS} seconds`,
              actualValue: `${duration} seconds (${Math.floor(duration / 60)} minutes)`,
              issue: `Expiration window too long (${Math.floor(duration / 60)} minutes)`,
              suggestedFix: "Use shorter expiration window (5-10 minutes)",
            }
          );
          issues.push({
            category: ValidationErrorCategory.SYNTAX_ERROR,
            field: "exp",
            issue: `Expiration window too long: ${Math.floor(duration / 60)} minutes`,
            severity: Severity.WARNING,
            suggestedFix: "Use 5-10 minute window",
          });
        }
      }
    }

    // nbf (not before) validation
    if (request.nbf !== undefined) {
      if (request.nbf > now + PresentationRequestValidator.CLOCK_SKEW_SECONDS) {
        this.addDetailedCheck(
          checks,
          "syntax.jwt.nbf.valid",
          "Not Before Valid",
          false,
          category,
          Severity.ERROR,
          {
            subcategory,
            field: "nbf",
            expectedValue: `<= ${now + PresentationRequestValidator.CLOCK_SKEW_SECONDS}`,
            actualValue: `${request.nbf}`,
            issue: "Request not yet valid (nbf in future)",
            suggestedFix: "Wait or adjust nbf",
          }
        );
        issues.push({
          category: ValidationErrorCategory.SYNTAX_ERROR,
          field: "nbf",
          issue: "Request not yet valid",
          severity: Severity.ERROR,
          suggestedFix: "Adjust nbf time",
        });
      }
    }
  }

  /**
   * Validate that no unexpected fields are present in HAIP request
   */
  private validateUnexpectedFields(
    request: ExtendedAuthorizationRequest,
    checks: ValidationCheck[],
    issues: ValidationIssue[]
  ): void {
    const category = "Profile";
    const subcategory = "Unexpected Fields";

    // Define allowed fields for HAIP PID Presentation
    const allowedFields = new Set([
      // Core OpenID4VP fields
      "clientId",
      "client_id",
      "responseType",
      "response_type",
      "responseUri",
      "response_uri",
      "redirectUri",
      "redirect_uri",
      "responseMode",
      "response_mode",
      "nonce",
      "state",

      // Query/Definition fields
      "dcqlQuery",
      "dcql_query",

      // Metadata fields
      "clientMetadata",
      "client_metadata",
      "clientMetadataUri",
      "client_metadata_uri",
      "verifierInfo",
      "verifier_info",

      // JWT standard fields (when request is a JWT)
      "iss",
      "aud",
      "exp",
      "iat",
      "nbf",
      "jti",

      // OpenID scope
      "scope",
    ]);

    // Get all actual fields in the request
    const actualFields = Object.keys(request);
    const unexpectedFields: string[] = [];

    for (const field of actualFields) {
      if (!allowedFields.has(field)) {
        unexpectedFields.push(field);
      }
    }

    if (unexpectedFields.length > 0) {
      this.addDetailedCheck(
        checks,
        "profile.unexpected_fields",
        "Unexpected Fields Present",
        false,
        category,
        Severity.WARNING,
        {
          subcategory,
          field: "request",
          expectedValue: "Only HAIP-defined fields",
          actualValue: unexpectedFields.join(", "),
          issue: `Request contains unexpected fields: ${unexpectedFields.join(", ")}`,
          suggestedFix: "Remove non-standard fields or verify they are required by your specific profile",
          specReference: {
            spec: "PID-Presentation-Guide",
            section: "3.2",
            url: "https://bmi.usercontent.opencode.de/eudi-wallet/developer-guide/PID_Presentation/#32-required-fields",
          },
        }
      );
      issues.push({
        category: ValidationErrorCategory.PROFILE_VIOLATION,
        field: "request",
        issue: `Request contains unexpected fields not defined in HAIP: ${unexpectedFields.join(", ")}`,
        severity: Severity.WARNING,
        specReference: {
          spec: "PID-Presentation-Guide",
          section: "3.2",
        },
        suggestedFix: "Remove non-standard fields or verify they are required by your specific profile",
      });
    } else {
      this.addDetailedCheck(
        checks,
        "profile.unexpected_fields",
        "No Unexpected Fields",
        true,
        category,
        Severity.WARNING,
        {
          subcategory,
          field: "request",
          expectedValue: "Only HAIP-defined fields",
          actualValue: "All fields are standard",
          details: "Request contains only fields defined in HAIP specification",
        }
      );
    }
  }
}
