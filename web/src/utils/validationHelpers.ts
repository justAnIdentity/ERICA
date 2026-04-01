import { ComplianceLevel } from "../components/ComplianceStatus";

interface ValidationError {
  field?: string;
  issue: string;
  severity: "ERROR" | "WARNING";
  specReference?: string;
}

interface ValidationSummary {
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  compliancePercentage: number;
  errorCount: number;
  warningCount: number;
}

interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  summary?: ValidationSummary;
}

export interface PlainEnglishIssue {
  severity: "error" | "warning";
  title: string;
  description: string;
  specReference?: {
    name: string;
    url: string;
    section?: string;
  };
  howToFix?: string;
}

/**
 * Convert validation errors to plain English issues with educational content
 */
export function convertToPlainEnglishIssues(
  errors: ValidationError[] | undefined
): PlainEnglishIssue[] {
  if (!errors || !Array.isArray(errors)) {
    return [];
  }

  return errors.map((error) => {
    const issue: PlainEnglishIssue = {
      severity: error.severity === "ERROR" ? "error" : "warning",
      title: error.field || "Validation Issue",
      description: error.issue || "Unknown validation issue",
    };

    // Add spec reference if available
    if (error.specReference) {
      issue.specReference = parseSpecReference(error.specReference);
    }

    // Add contextual "how to fix" based on error patterns
    issue.howToFix = generateHowToFix(error);

    return issue;
  });
}

/**
 * Parse spec reference string into structured format
 */
function parseSpecReference(ref: any): {
  name: string;
  url: string;
  section?: string;
} {
  // Convert to string if it's not already
  const refString = typeof ref === 'string' ? ref : String(ref || '');

  // Handle common spec reference formats
  if (refString.includes("OpenID4VP")) {
    return {
      name: "OpenID4VP",
      url: "https://openid.net/specs/openid-4-verifiable-presentations-1_0.html",
      section: extractSection(refString),
    };
  }
  if (refString.includes("HAIP")) {
    return {
      name: "EUDI HAIP",
      url: "https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html",
      section: extractSection(refString),
    };
  }
  if (refString.includes("SD-JWT")) {
    return {
      name: "SD-JWT",
      url: "https://datatracker.ietf.org/doc/draft-ietf-oauth-selective-disclosure-jwt/",
      section: extractSection(refString),
    };
  }

  return {
    name: refString,
    url: "#",
  };
}

function extractSection(ref: string): string | undefined {
  const match = ref.match(/§([\d.]+)/);
  return match ? match[1] : undefined;
}

/**
 * Generate contextual "how to fix" guidance based on error content
 */
function generateHowToFix(error: ValidationError): string {
  const issue = error.issue.toLowerCase();
  const field = error.field?.toLowerCase() || "";

  // HTTPS requirements
  if (issue.includes("https") && issue.includes("response_uri")) {
    return "Change your response_uri to use HTTPS instead of HTTP. This is required for security in production.";
  }

  // Nonce issues
  if (field.includes("nonce") || issue.includes("nonce")) {
    if (issue.includes("missing") || issue.includes("required")) {
      return 'Add a "nonce" field to your authorization request with a random string (e.g., UUID). This prevents replay attacks.';
    }
    if (issue.includes("mismatch")) {
      return "Ensure the nonce in the response matches exactly the nonce you sent in the request.";
    }
  }

  // DCQL format
  if (issue.includes("dcql")) {
    return 'Use the modern DCQL format for credential requests by adding a "dcql_query" object with a "credentials" array. See the EUDI HAIP specification for examples.';
  }

  // Signature issues
  if (issue.includes("signature") && error.severity === "ERROR") {
    return "Verify that your JWT signature validation is working correctly. Check that you're using the correct public key and algorithm (ES256 for PID).";
  }

  // Missing fields
  if (issue.includes("missing") && issue.includes("required")) {
    return `Add the required "${error.field || "field"}" to your request object. This field is mandatory for compliance.`;
  }

  // Generic fallback
  return "Review the validation error above and check the specification reference for detailed requirements.";
}

/**
 * Determine overall compliance level based on REQUEST validation only
 * Response validation is shown separately as educational content
 */
export function getComplianceLevel(
  requestValidation: ValidationResult | undefined,
  responseValidation: ValidationResult | undefined
): {
  level: ComplianceLevel;
  score: number;
  message: string;
  details?: string;
} {
  // Handle missing validation results
  if (!requestValidation) {
    return {
      level: "error",
      score: 0,
      message: "Incomplete validation results",
      details: "Unable to calculate compliance score due to missing request validation data.",
    };
  }

  const requestSummary = requestValidation.summary;

  // Calculate score based on REQUEST only
  const totalChecks = requestSummary?.totalChecks || 0;
  const passedChecks = requestSummary?.passedChecks || 0;

  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

  const requestErrors = requestSummary?.errorCount || 0;
  const requestWarnings = requestSummary?.warningCount || 0;

  // Determine level and message based on REQUEST validation
  if (requestErrors > 0) {
    return {
      level: "error",
      score,
      message: "Not profile-aligned",
      details: `${requestErrors} error${requestErrors !== 1 ? "s" : ""} in your request must be fixed.`,
    };
  }

  if (requestWarnings > 0) {
    return {
      level: "warning",
      score,
      message: "Profile-aligned with recommendations",
      details: `Your request is valid, but there ${requestWarnings === 1 ? "is" : "are"} ${requestWarnings} optional improvement${requestWarnings !== 1 ? "s" : ""}.`,
    };
  }

  return {
    level: "compliant",
    score,
    message: "Fully profile-aligned",
    details: "Your request meets all requirements of the EUDI PID Presentation profile.",
  };
}
