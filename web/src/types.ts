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
  COMPLIANT = "COMPLIANT",
  PARTIAL_DISCLOSURE = "PARTIAL_DISCLOSURE",
  CLAIM_MODIFICATION = "CLAIM_MODIFICATION",
  MISSING_FIELDS = "MISSING_FIELDS",
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  EXPIRED_VC = "EXPIRED_VC",
  FORMAT_MISMATCH = "FORMAT_MISMATCH",
  ISSUER_SPOOFING = "ISSUER_SPOOFING",
  CLAIMS_REDACTION = "CLAIMS_REDACTION",
}
