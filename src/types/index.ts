/**
 * Core type definitions for EUDI VP Debugger
 * Aligned with OpenID4VP-Core and EUDI Wallet ARF
 */

// ============================================================================
// Validation Results
// ============================================================================

export enum ValidationErrorCategory {
  SYNTAX_ERROR = "SYNTAX_ERROR",
  SEMANTIC_ERROR = "SEMANTIC_ERROR",
  PROFILE_VIOLATION = "PROFILE_VIOLATION",
  UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT",
  STRUCTURE_VIOLATION = "STRUCTURE_VIOLATION",
  CRYPTO_FAILURE = "CRYPTO_FAILURE",
  CLAIM_MISMATCH = "CLAIM_MISMATCH",
  TRUST_FAILURE = "TRUST_FAILURE",
  STATUS_REVOKED = "STATUS_REVOKED",
  TIMING_ISSUE = "TIMING_ISSUE",
}

export enum Severity {
  ERROR = "ERROR",
  WARNING = "WARNING",
}

export interface SpecReference {
  spec: string; // e.g., "OpenID4VP-Core", "EUDI-ARF"
  section?: string;
  url?: string;
  quotation?: string;
}

export interface ValidationIssue {
  category: ValidationErrorCategory;
  field?: string;
  issue: string;
  severity: Severity;
  specReference?: SpecReference;
  suggestedFix?: string;
}

export interface ValidationCheck {
  checkId: string; // Unique identifier for the check (e.g., "syntax.client_id.presence", "semantic.dcql.credentials.format")
  checkName: string; // Human-readable check name (e.g., "Client ID Presence", "Credential Format Validation")
  passed: boolean;
  category: string; // e.g., "Syntax", "Semantics", "Profile"
  subcategory?: string; // e.g., "Required Fields", "Format Validation", "DCQL Structure"
  field?: string; // Which field (if applicable)
  expectedValue?: string; // What was expected (for comparison)
  actualValue?: string; // What was found (for comparison)
  details?: string; // Additional context
  severity: Severity; // ERROR or WARNING
  issue?: string; // Only for failures: the problem found
  suggestedFix?: string; // Only for failures: how to fix it
  specReference?: SpecReference; // Spec reference for this check
}

export interface ValidationSummary {
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  errorCount: number;
  warningCount: number;
  compliancePercentage: number;
  checksByCategory: {
    category: string;
    total: number;
    passed: number;
    failed: number;
  }[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings?: ValidationIssue[];
  checks: ValidationCheck[]; // All checks performed (passed and failed) - now required
  summary?: ValidationSummary; // Summary of validation results
}

// ============================================================================
// DCQL (Distributed Claim Query Language)
// ============================================================================

export interface DCQLClaim {
  path: string[];
  optional?: boolean;
}

export interface DCQLCredentialMeta {
  vctValues?: string[];
  doctypeValue?: string;
  [key: string]: unknown;
}

export interface DCQLCredential {
  id: string;
  format: string;
  claims?: DCQLClaim[];
  meta?: DCQLCredentialMeta;
}

export interface DCQLQuery {
  credentials: DCQLCredential[];
}

export interface AuthorizationRequest {
  clientId?: string; // client identifier
  client_id?: string; // alternative format
  aud?: string; // audience claim
  responseType?: string; // "vp_token" | "vp_token id_token"
  response_type?: string;
  responseMode?: string;
  response_mode?: string;
  state?: string;
  redirectUri?: string;
  redirect_uri?: string;
  nonce?: string;
  dcqlQuery?: DCQLQuery; // DCQL-style query
  dcql_query?: DCQLQuery; // snake_case variant
  [key: string]: unknown; // Allow additional properties for flexibility
}

// ============================================================================
// Verifiable Credentials
// ============================================================================

export enum CredentialFormat {
  JWT_VC = "jwt_vc",
  JWT_VC_JSON = "jwt_vc_json",
  SD_JWT_VC = "vc+sd-jwt",
  MSO_MDOC = "mso_mdoc",
}

export interface CredentialClaims {
  iss: string; // issuer
  sub: string; // subject
  iat: number; // issued at
  exp: number; // expiration
  [key: string]: unknown;
}

export interface VerifiableCredential {
  "@context"?: string[];
  type: string[];
  issuer: string | { id: string; [key: string]: unknown };
  issuanceDate?: string;
  expirationDate?: string;
  credentialSubject: Record<string, unknown>;
  proof?: Proof;
  [key: string]: unknown;
}

// ============================================================================
// Cryptography & Proofs
// ============================================================================

export interface JsonWebKey {
  kty: string; // "EC", "RSA", "Oct"
  use?: string; // "sig", "enc"
  key_ops?: string[];
  alg?: string;
  kid?: string; // Key ID
  crv?: string; // Curve (for EC)
  x?: string; // X coordinate (for EC)
  y?: string; // Y coordinate (for EC)
  d?: string; // Private key
  n?: string; // Modulus (for RSA)
  e?: string; // Exponent (for RSA)
  [key: string]: unknown; // Allow additional JWK properties
}

export interface JWTPayload {
  [key: string]: unknown;
}

export interface Proof {
  type: string;
  created?: string;
  verificationMethod?: string;
  signatureValue?: string;
  jws?: string;
  [key: string]: unknown;
}

// ============================================================================
// Presentation Response
// ============================================================================

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

export interface PresentationResponse {
  vp_token?: Record<string, string[]>; // Format -> array of tokens, e.g., {"vc+sd-jwt": ["token1"]}
  vpToken?: string | string[]; // Legacy support
  idToken?: string; // Optional, if response_type includes id_token
  state?: string;
  decodedVPTokens?: DecodedVPToken[]; // Decoded VP tokens for inspection
}

// ============================================================================
// Profiles
// ============================================================================

export enum Profile {
  PID_PRESENTATION = "pid-presentation",
  BASE_OPENID4VP = "base",
  CUSTOM = "custom",
}

// ============================================================================
// Credential Templates & Simulation
// ============================================================================

/**
 * Simulation modes for generating presentation responses
 * These allow testing various edge cases and failure scenarios
 */
export enum SimulationMode {
  // Valid/Compliant Responses
  VALID = "VALID", // Fully compliant, valid presentation

  // Credential Validity Issues
  EXPIRED = "EXPIRED", // Credential with exp in the past
  NOT_YET_VALID = "NOT_YET_VALID", // Credential with nbf in the future

  // Signature Issues
  INVALID_SIGNATURE = "INVALID_SIGNATURE", // Tampered signature
  MISSING_SIGNATURE = "MISSING_SIGNATURE", // No signature present

  // Claim Issues
  MISSING_CLAIMS = "MISSING_CLAIMS", // Required claims missing
  OVER_DISCLOSURE = "OVER_DISCLOSURE", // More claims than requested
  MODIFIED_CLAIMS = "MODIFIED_CLAIMS", // Claim values altered

  // Binding Issues
  WRONG_NONCE = "WRONG_NONCE", // Nonce doesn't match request
  MISSING_HOLDER_BINDING = "MISSING_HOLDER_BINDING", // No KB-JWT
  WRONG_AUDIENCE = "WRONG_AUDIENCE", // aud claim mismatch

  // Format Issues
  FORMAT_MISMATCH = "FORMAT_MISMATCH", // Wrong format (e.g., mDoc when SD-JWT requested)
  MALFORMED_SD_JWT = "MALFORMED_SD_JWT", // Invalid SD-JWT structure

  // Issuer Issues
  WRONG_ISSUER = "WRONG_ISSUER", // Unexpected issuer
  WRONG_CREDENTIAL_TYPE = "WRONG_CREDENTIAL_TYPE", // Wrong vct value

  // PID Edge Cases (different PID templates with special characteristics)
  SPECIAL_CHARACTERS_PID = "SPECIAL_CHARACTERS_PID", // Names with ß, ü, ö, ñ, etc.
  INCOMPLETE_BIRTHDATE_PID = "INCOMPLETE_BIRTHDATE_PID", // Birthdate like "1994-00-00"

  // Legacy modes (for backward compatibility - can be removed later)
  COMPLIANT = "VALID", // Alias for VALID
  PARTIAL_DISCLOSURE = "MISSING_CLAIMS", // Alias
  CLAIM_MODIFICATION = "MODIFIED_CLAIMS", // Alias
  MISSING_FIELDS = "MISSING_CLAIMS", // Alias
  EXPIRED_VC = "EXPIRED", // Alias
  ISSUER_SPOOFING = "WRONG_ISSUER", // Alias
  CLAIMS_REDACTION = "MISSING_CLAIMS", // Alias
}

export interface CredentialTemplate {
  id: string;
  format: CredentialFormat;
  issuer: {
    id: string;
    name: string;
  };
  claims: CredentialClaims;
  disclosableFields?: string[]; // For SD-JWT
  keyBinding?: {
    required: boolean;
    algorithms?: string[];
  };
}

// ============================================================================
// Diagnostics & Explainability
// ============================================================================

export interface DiagnosticEvent {
  timestamp: string; // ISO8601
  component: "request-validator" | "wallet-simulator" | "response-validator";
  eventType: "validation_start" | "validation_check" | "validation_result" | "error_injected";
  checkName: string;
  checkCategory: string;
  result: "pass" | "fail" | "warning" | "skipped";
  details?: {
    actual?: unknown;
    expected?: unknown;
    tolerances?: Record<string, unknown>;
  };
  specReference?: SpecReference;
  suggestedFix?: string;
}

export interface DiagnosticReport {
  sessionId: string;
  startTime: string; // ISO8601
  endTime: string; // ISO8601
  events: DiagnosticEvent[];
  summary: {
    requestValid: boolean;
    responseValid: boolean;
    criticalIssues: number;
    warnings: number;
  };
  recommendations: Recommendation[];
}

export interface Recommendation {
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  forRole: "WALLET_DEVELOPER" | "RP_DEVELOPER" | "ISSUER";
  action: string;
  specReference?: SpecReference;
}

export interface RPMistake {
  id: string;
  category: "CRYPTO" | "TRUST" | "VALIDATION" | "PRIVACY";
  description: string;
  detectionSignals: string[];
  consequence: string;
  severity: Severity;
  remediationSteps: RemediationStep[];
}

export interface RemediationStep {
  step: number;
  action: string;
  codeExample?: string;
  specReference?: SpecReference;
}
