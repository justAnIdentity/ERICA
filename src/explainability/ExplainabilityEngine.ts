/**
 * Explainability Layer
 * Diagnostic event collection, reporting, and spec mapping
 */

import { logger } from '../utils/Logger.js';

import {
  DiagnosticEvent,
  DiagnosticReport,
  SpecReference,
  RPMistake,
  ValidationResult,
  Severity,
} from "../types/index.js";

export interface IExplainabilityEngine {
  recordEvent(event: DiagnosticEvent): void;
  generateReport(
    requestValidation?: ValidationResult,
    responseValidation?: ValidationResult
  ): DiagnosticReport;
  classifyIssue(issue: string): RPMistake | null;
  mapToSpecReference(errorCode: string): SpecReference | undefined;
}

export class DiagnosticEventCollector {
  private events: DiagnosticEvent[] = [];
  private sessionId: string;
  private startTime: Date;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.startTime = new Date();
  }

  recordEvent(event: DiagnosticEvent): void {
    this.events.push(event);
  }

  getEvents(): DiagnosticEvent[] {
    return this.events;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getStartTime(): Date {
    return this.startTime;
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export class SpecReferenceMapper {
  private specMap: Map<string, SpecReference> = new Map();

  constructor() {
    this.initializeSpecMap();
  }

  private initializeSpecMap(): void {
    /**
     * Spec Reference Mapper
     *
     * @phase MVP: Initialized with 5-10 key validations
     * @phase Phase 2: Comprehensive spec mapping for all validation checks
     *
     * This map should be expanded as validation checks are added.
     * For each validation issue code, add an entry with:
     * - spec: Which specification (e.g., "OpenID4VP-Core", "HAIP", "SD-JWT")
     * - section: Relevant section number if applicable
     * - url: Direct link to specification section
     * - quotation: Optional quoted text from spec for context
     *
     * Specs to reference:
     * - OpenID4VP: https://openid.net/specs/openid-4-verifiable-presentations-1_0.html
     * - OpenID4VP HAIP: https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html
     * - EUDI ARF: https://github.com/eu-digital-identity-wallet/architecture-and-reference-framework
     * - SD-JWT: https://datatracker.ietf.org/doc/draft-ietf-oauth-selective-disclosure-jwt/
     */
    this.specMap.set("DCQL_QUERY_MISSING", {
      spec: "OpenID4VP HAIP",
      section: "3.2",
      url: "https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html#section-3.2",
      quotation: "DCQL query is required in PID presentation requests (modern format)",
    });

    this.specMap.set("DCQL_CREDENTIALS_MISSING", {
      spec: "OpenID4VP HAIP",
      section: "3.2",
      url: "https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html#section-3.2",
      quotation: "DCQL credentials array must contain at least one credential definition",
    });

    this.specMap.set("RESPONSE_URI_NOT_HTTPS", {
      spec: "OpenID4VP-Core",
      section: "5",
      url: "https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#section-5",
      quotation: "response_uri must use HTTPS for security",
    });

    this.specMap.set("NONCE_MISSING", {
      spec: "OpenID4VP-Core",
      section: "6.1",
      url: "https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#section-6.1",
      quotation: "Nonce is required for replay protection",
    });

    this.specMap.set("INVALID_SIGNATURE", {
      spec: "OpenID4VP-Core",
      section: "5.2",
      url: "https://openid.net/specs/openid-4-verifiable-presentations-1_0.html#section-5.2",
      quotation: "VP Token signature must be verified against issuer key",
    });

    this.specMap.set("ISSUER_NOT_TRUSTED", {
      spec: "EUDI Wallet Architecture & Reference Framework",
      section: "3.1.2",
      url: "https://github.com/eu-digital-identity-wallet/architecture-and-reference-framework",
      quotation: "Credential issuer must be in the trust anchor list",
    });

    this.specMap.set("PRESENTATION_SUBMISSION_UNEXPECTED", {
      spec: "OpenID4VP HAIP",
      section: "3.3",
      url: "https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html#section-3.3",
      quotation: "DCQL responses must NOT include presentation_submission field",
    });

    this.specMap.set("DCQL_RESPONSE_HAS_PRESENTATION_SUBMISSION", {
      spec: "OpenID4VP HAIP",
      section: "3.3",
      url: "https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html#section-3.3",
      quotation: "DCQL query responses should not include presentation_submission (only for legacy format)",
    });

    // Add method to help maintainers extend this map
    logger.debug("[SpecReferenceMapper] Initialized", {
      referenceMappings: this.specMap.size,
      note: "See VALIDATION_CHECKLIST.md to add more spec references",
    });
  }

  getReference(errorCode: string): SpecReference | undefined {
    return this.specMap.get(errorCode);
  }

  addReference(errorCode: string, reference: SpecReference): void {
    this.specMap.set(errorCode, reference);
  }
}

export class RPMistakeClassifier {
  private mistakes: Map<string, RPMistake> = new Map();

  constructor() {
    this.initializeMistakes();
  }

  private initializeMistakes(): void {
    /**
     * Common RP Implementation Mistakes
     *
     * @phase MVP: 5-10 critical mistakes documented
     * @phase Phase 2: Comprehensive RP mistake catalog with detection patterns
     *
     * This classifier helps RPs understand where they might be going wrong.
     * Each mistake includes:
     * - Description of the error
     * - Signals that indicate this mistake (console logs, validation failures)
     * - What could go wrong (security consequence)
     * - How to fix it (remediation steps with spec references)
     *
     * See: MVP_ROADMAP.md for guidance on adding new mistakes.
     */

    this.mistakes.set("NOT_VERIFYING_SIGNATURE", {
      id: "rp-001",
      category: "CRYPTO",
      description: "Not verifying the VP Token signature",
      detectionSignals: ["Invalid signature passes validation", "No signature check performed"],
      consequence: "Accepts credentials from any signer, completely breaking security",
      severity: Severity.ERROR,
      remediationSteps: [
        {
          step: 1,
          action: "Verify VP Token is signed by the wallet holder",
          specReference: {
            spec: "OpenID4VP-Core",
            section: "5.2",
          },
        },
        {
          step: 2,
          action: "Verify the signing key matches the holder binding",
          specReference: {
            spec: "HAIP",
            section: "3.1",
          },
        },
      ],
    });

    this.mistakes.set("NOT_CHECKING_NONCE", {
      id: "rp-002",
      category: "VALIDATION",
      description: "Not validating the nonce in the response",
      detectionSignals: ["Same response accepted with different nonce values"],
      consequence: "Vulnerable to replay attacks - attacker can reuse old responses",
      severity: Severity.ERROR,
      remediationSteps: [
        {
          step: 1,
          action: "Store the nonce from the request",
          specReference: {
            spec: "OpenID4VP-Core",
            section: "6.1",
          },
        },
        {
          step: 2,
          action: "Verify response contains the same nonce",
        },
      ],
    });

    this.mistakes.set("WRONG_ISSUER_KEY", {
      id: "rp-003",
      category: "TRUST",
      description: "Using wrong issuer key for signature verification",
      detectionSignals: ["kid mismatch", "wrong key algorithm"],
      consequence: "Accepts credentials from unauthorized issuers",
      severity: Severity.ERROR,
      remediationSteps: [
        {
          step: 1,
          action: "Verify issuer key from trusted certificate",
        },
      ],
    });

    this.mistakes.set("IGNORING_CREDENTIAL_EXPIRY", {
      id: "rp-004",
      category: "VALIDATION",
      description: "Not checking if credentials are expired",
      detectionSignals: ["Expired credentials accepted"],
      consequence: "Accepts outdated, potentially revoked credentials",
      severity: Severity.ERROR,
      remediationSteps: [
        {
          step: 1,
          action: "Check exp claim is in the future",
        },
      ],
    });

    this.mistakes.set("NOT_VALIDATING_DCQL_STRUCTURE", {
      id: "rp-005",
      category: "VALIDATION",
      description: "Not validating DCQL query structure in presentation request",
      detectionSignals: ["Missing dcql_query", "Empty credentials array accepted"],
      consequence: "Unpredictable behavior with malformed requests",
      severity: Severity.ERROR,
      remediationSteps: [
        {
          step: 1,
          action: "Validate dcql_query is present",
          specReference: {
            spec: "OpenID4VP HAIP",
            section: "3.2",
          },
        },
        {
          step: 2,
          action: "Validate credentials array has at least one entry",
        },
      ],
    });
  }

  classifyIssue(issueId: string): RPMistake | null {
    return this.mistakes.get(issueId) || null;
  }

  getMistakes(): RPMistake[] {
    return Array.from(this.mistakes.values());
  }
}

export class ExplainabilityEngine implements IExplainabilityEngine {
  private eventCollector: DiagnosticEventCollector;
  private specMapper: SpecReferenceMapper;
  private mistakeClassifier: RPMistakeClassifier;

  constructor() {
    this.eventCollector = new DiagnosticEventCollector();
    this.specMapper = new SpecReferenceMapper();
    this.mistakeClassifier = new RPMistakeClassifier();
  }

  recordEvent(event: DiagnosticEvent): void {
    this.eventCollector.recordEvent(event);
  }

  generateReport(
    requestValidation?: ValidationResult,
    responseValidation?: ValidationResult
  ): DiagnosticReport {
    const events = this.eventCollector.getEvents();
    const endTime = new Date();

    const requestValid = requestValidation?.valid ?? true;
    const responseValid = responseValidation?.valid ?? true;

    const requestErrors = requestValidation?.errors.length ?? 0;
    const responseErrors = responseValidation?.errors.length ?? 0;
    const requestWarnings = requestValidation?.warnings?.length ?? 0;
    const responseWarnings = responseValidation?.warnings?.length ?? 0;

    return {
      sessionId: this.eventCollector.getSessionId(),
      startTime: this.eventCollector.getStartTime().toISOString(),
      endTime: endTime.toISOString(),
      events,
      summary: {
        requestValid,
        responseValid,
        criticalIssues: requestErrors + responseErrors,
        warnings: requestWarnings + responseWarnings,
      },
      recommendations: [],
    };
  }

  classifyIssue(issue: string): RPMistake | null {
    return this.mistakeClassifier.classifyIssue(issue);
  }

  mapToSpecReference(errorCode: string): SpecReference | undefined {
    return this.specMapper.getReference(errorCode);
  }
}
