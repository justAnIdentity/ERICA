import React from "react";

interface Issue {
  severity: "error" | "warning";
  title: string;
  description: string;
  specReference?: {
    spec: string;
    url?: string;
    section?: string;
    quotation?: string;
  };
  howToFix?: string;
}

// Map spec names to their official URLs
const SPEC_URLS: Record<string, string> = {
  "OpenID4VP-HAIP": "https://openid.net/specs/openid-4-verifiable-presentations-1_0.html",
  "OpenID4VP-Core": "https://openid.net/specs/openid-4-verifiable-presentations-1_0.html",
  "OpenID4VP": "https://openid.net/specs/openid-4-verifiable-presentations-1_0.html",
  "EUDI-ARF": "https://github.com/eu-digital-identity-wallet/eudi-doc-architecture-and-reference-framework",
  "PID-Presentation-Guide": "https://bmi.usercontent.opencode.de/eudi-wallet/developer-guide/rp/PID_Presentation/",
  "SD-JWT-VC": "https://datatracker.ietf.org/doc/html/draft-ietf-oauth-sd-jwt-vc",
  "RFC7519": "https://datatracker.ietf.org/doc/html/rfc7519",
  "RFC7800": "https://datatracker.ietf.org/doc/html/rfc7800",
  "ISO-18013-5": "https://www.iso.org/standard/69084.html",
};

interface PlainEnglishSummaryProps {
  isCompliant: boolean;
  issues: Issue[];
  successMessage?: string;
}

export const PlainEnglishSummary: React.FC<PlainEnglishSummaryProps> = ({
  isCompliant,
  issues,
  successMessage,
}) => {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (isCompliant && issues.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start gap-3">
          <div className="status-badge status-badge--success">
            ✓
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {successMessage || "Your request is compliant!"}
            </h3>
            <p className="text-gray-700 text-sm">
              All validation checks passed. Your Presentation Request is fully
              compliant with the EUDI PID Presentation profile and will work
              with wallets that support the OID4VP HAIP.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          What You Need to Know
        </h3>
        {isCompliant && warnings.length > 0 && (
          <p className="text-gray-700 text-sm">
            Your request is valid and will work, but there are some
            recommendations below.
          </p>
        )}
        {!isCompliant && (
          <p className="text-gray-700 text-sm">
            Your request has{" "}
            <span className="font-semibold">
              {errors.length} error{errors.length !== 1 ? "s" : ""}
            </span>{" "}
            that should be reviewed.
          </p>
        )}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="space-y-4">
          <h4 className="section-header section-header--accent">
            Errors ({errors.length})
          </h4>
          {errors.map((issue, idx) => (
            <IssueCard key={`error-${idx}`} issue={issue} />
          ))}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-4">
          <h4 className="section-header section-header--accent">
            Recommendations ({warnings.length})
          </h4>
          {warnings.map((issue, idx) => (
            <IssueCard key={`warning-${idx}`} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );
};

const IssueCard: React.FC<{ issue: Issue }> = ({ issue }) => {
  const cardClass =
    issue.severity === "error" ? "issue-card--error" : "issue-card--warning";
  const iconText = issue.severity === "error" ? "✕" : "⚠";

  // Get spec URL from mapping or use provided URL
  const getSpecUrl = (specRef: Issue['specReference']): string | null => {
    if (!specRef) return null;
    if (specRef.url) return specRef.url;
    return SPEC_URLS[specRef.spec] || null;
  };

  const specUrl = issue.specReference ? getSpecUrl(issue.specReference) : null;

  return (
    <div className={`issue-card ${cardClass}`}>
      <div className="issue-card__icon">{iconText}</div>
      <div className="issue-card__content">
        <h5 className="issue-card__title">{issue.title}</h5>
        <p className="issue-card__description">{issue.description}</p>

        {/* How to Fix */}
        {issue.howToFix && (
          <div className="suggestion-box">
            <div className="suggestion-box__icon">💡</div>
            <div className="suggestion-box__content">
              <div className="suggestion-box__label">How to fix:</div>
              <p className="suggestion-box__text">{issue.howToFix}</p>
            </div>
          </div>
        )}

        {/* Spec Reference with Quotation */}
        {issue.specReference && (
          <div className="spec-reference">
            <span className="spec-reference__icon">📖</span>
            <div className="flex-1">
              {specUrl ? (
                <a
                  href={specUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="spec-reference__link"
                >
                  {issue.specReference.spec}
                  {issue.specReference.section &&
                    ` § ${issue.specReference.section}`}
                </a>
              ) : (
                <span className="spec-reference__text">
                  {issue.specReference.spec}
                  {issue.specReference.section &&
                    ` § ${issue.specReference.section}`}
                </span>
              )}
              {issue.specReference.quotation && (
                <p className="spec-reference__quotation">
                  "{issue.specReference.quotation}"
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
