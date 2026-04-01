import React from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Shield,
  Lock,
  Key,
  FileText,
  AlertTriangle,
  ExternalLink,
  Code,
  Search,
} from "lucide-react";

interface ValidationCheck {
  checkId: string;
  checkName: string;
  passed: boolean;
  category: string;
  subcategory?: string;
  field?: string;
  expectedValue?: string;
  actualValue?: string;
  details?: string;
  severity: "ERROR" | "WARNING";
  issue?: string;
  suggestedFix?: string;
  specReference?: {
    spec: string;
    section?: string;
    url?: string;
  };
}

interface ValidationCheckCardProps {
  check: ValidationCheck;
  index: number;
}

const getCheckIcon = (checkId: string, passed: boolean) => {
  // Security-related checks
  if (checkId.includes("security") || checkId.includes("nonce") || checkId.includes("https")) {
    return <Shield className={`w-5 h-5 ${passed ? "text-green-600" : "text-red-600"}`} />;
  }
  // Authentication/encryption checks
  if (checkId.includes("client_id") || checkId.includes("jwks") || checkId.includes("encryption")) {
    return <Key className={`w-5 h-5 ${passed ? "text-green-600" : "text-red-600"}`} />;
  }
  // Format/syntax checks
  if (checkId.includes("format") || checkId.includes("validity") || checkId.includes("scheme")) {
    return <Code className={`w-5 h-5 ${passed ? "text-green-600" : "text-red-600"}`} />;
  }
  // Required field checks
  if (checkId.includes("presence") || checkId.includes("required")) {
    return <FileText className={`w-5 h-5 ${passed ? "text-green-600" : "text-red-600"}`} />;
  }
  // HTTPS/security protocol checks
  if (checkId.includes("https") || checkId.includes("ssl") || checkId.includes("tls")) {
    return <Lock className={`w-5 h-5 ${passed ? "text-green-600" : "text-red-600"}`} />;
  }
  // Default
  return passed ? (
    <CheckCircle2 className="w-5 h-5 text-green-600" />
  ) : (
    <XCircle className="w-5 h-5 text-red-600" />
  );
};

const getSeverityBadge = (severity: "ERROR" | "WARNING") => {
  if (severity === "ERROR") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
      <AlertTriangle className="w-3 h-3 mr-1" />
      Warning
    </span>
  );
};

export const ValidationCheckCard: React.FC<ValidationCheckCardProps> = ({ check, index }) => {
  const [expanded, setExpanded] = React.useState(false);

  const cardColors = check.passed
    ? "bg-green-50 border-green-200 hover:border-green-300"
    : "bg-red-50 border-red-200 hover:border-red-300";

  const leftBorderColor = check.passed ? "border-l-green-500" : "border-l-red-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      whileHover={{ scale: 1.01 }}
      className={`border-l-4 ${leftBorderColor} ${cardColors} border rounded-lg p-4 transition-all cursor-pointer`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{getCheckIcon(check.checkId, check.passed)}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-semibold text-gray-900">{check.checkName}</h4>
                {!check.passed && getSeverityBadge(check.severity)}
              </div>

              {check.subcategory && (
                <p className="text-xs text-gray-600 mt-1">
                  {check.category} • {check.subcategory}
                </p>
              )}

              {check.field && (
                <div className="flex items-center gap-1 mt-1">
                  <Search className="w-3 h-3 text-gray-500" />
                  <code className="text-xs font-mono bg-white px-1.5 py-0.5 rounded border border-gray-300 text-gray-700">
                    {check.field}
                  </code>
                </div>
              )}
            </div>

            <button
              className="text-gray-400 hover:text-gray-600 transition"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              <motion.div
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                ▼
              </motion.div>
            </button>
          </div>

          {/* Quick Summary (always visible) */}
          {check.passed ? (
            <p className="text-sm text-green-700 mt-2">{check.details || "Check passed successfully"}</p>
          ) : (
            <p className="text-sm text-red-800 mt-2 font-medium">{check.issue}</p>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-4 pt-4 border-t border-gray-300 space-y-3"
        >
          {/* Expected vs Actual */}
          {(check.expectedValue || check.actualValue) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded border border-gray-200">
                <p className="text-xs font-semibold text-gray-600 mb-1">Expected</p>
                <code className="text-xs font-mono text-gray-800 break-all">
                  {check.expectedValue || "N/A"}
                </code>
              </div>
              <div className="bg-white p-3 rounded border border-gray-200">
                <p className="text-xs font-semibold text-gray-600 mb-1">Actual</p>
                <code className="text-xs font-mono text-gray-800 break-all">
                  {check.actualValue || "N/A"}
                </code>
              </div>
            </div>
          )}

          {/* Details */}
          {check.details && (
            <div className="bg-white p-3 rounded border border-gray-200">
              <p className="text-xs font-semibold text-gray-600 mb-1">Details</p>
              <p className="text-sm text-gray-700">{check.details}</p>
            </div>
          )}

          {/* Suggested Fix */}
          {check.suggestedFix && (
            <div className="suggestion-box">
              <div className="suggestion-box__icon">💡</div>
              <div className="suggestion-box__content">
                <p className="suggestion-box__label">Suggested Fix</p>
                <p className="text-sm text-blue-800">{check.suggestedFix}</p>
              </div>
            </div>
          )}

          {/* Spec Reference */}
          {check.specReference && (
            <div className="bg-gray-50 p-3 rounded border border-gray-200">
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-700 mb-1">Specification Reference</p>
                  <p className="text-sm text-gray-600">
                    {check.specReference.spec}
                    {check.specReference.section && ` - Section ${check.specReference.section}`}
                  </p>
                  {check.specReference.url && (
                    <a
                      href={check.specReference.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View Specification
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Check ID (for debugging) */}
          <div className="text-xs text-gray-500 font-mono">Check ID: {check.checkId}</div>
        </motion.div>
      )}
    </motion.div>
  );
};
