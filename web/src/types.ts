/**
 * Type exports for web frontend - local definitions
 */

export interface AuthorizationRequest {
  clientId: string;
  responseType: string;
  redirectUri: string;
  state: string;
  dcqlQuery?: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: any[];
  warnings?: any[];
  checks?: any[];
  summary?: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    errorCount: number;
    warningCount: number;
    compliancePercentage: number;
    checksByCategory: Array<{
      category: string;
      total: number;
      passed: number;
      failed: number;
    }>;
  };
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

export interface PresentationResponse {
  vp_token?: Record<string, string[]>;
  vpToken?: string | string[] | Record<string, string | string[]>;
  idToken?: string;
  state?: string;
  decodedVPTokens?: DecodedVPToken[];
}

export interface DebuggerSession {
  requestValidation: ValidationResult;
  simulatedResponse: PresentationResponse;
  responseValidation: ValidationResult;
  diagnostics: any;
}

export enum Profile {
  PID_PRESENTATION = "pid-presentation",
  BASE_OPENID4VP = "base",
  CUSTOM = "custom",
}

export enum SimulationMode {
  // Valid/Compliant Responses
  VALID = "VALID",

  // Credential Validity Issues
  EXPIRED = "EXPIRED",
  NOT_YET_VALID = "NOT_YET_VALID",

  // Signature Issues
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  MISSING_SIGNATURE = "MISSING_SIGNATURE",

  // Claim Issues
  MISSING_CLAIMS = "MISSING_CLAIMS",
  OVER_DISCLOSURE = "OVER_DISCLOSURE",
  MODIFIED_CLAIMS = "MODIFIED_CLAIMS",

  // Binding Issues
  WRONG_NONCE = "WRONG_NONCE",
  MISSING_HOLDER_BINDING = "MISSING_HOLDER_BINDING",
  WRONG_AUDIENCE = "WRONG_AUDIENCE",

  // Format Issues
  FORMAT_MISMATCH = "FORMAT_MISMATCH",
  MALFORMED_SD_JWT = "MALFORMED_SD_JWT",

  // Issuer Issues
  WRONG_ISSUER = "WRONG_ISSUER",
  WRONG_CREDENTIAL_TYPE = "WRONG_CREDENTIAL_TYPE",

  // PID Edge Cases
  SPECIAL_CHARACTERS_PID = "SPECIAL_CHARACTERS_PID",
  INCOMPLETE_BIRTHDATE_PID = "INCOMPLETE_BIRTHDATE_PID",
}

export enum PIDTemplate {
  NORMAL = "normal",
  SPECIAL_CHARACTERS = "special-characters",
  INCOMPLETE_BIRTHDATE = "incomplete-birthdate",
}
