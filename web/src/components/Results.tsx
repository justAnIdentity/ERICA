import React, { useState } from "react";
import { DebuggerSession } from "../types.js";
import { ComplianceScore } from "./ComplianceScore.js";
import { ChecksDisplay } from "./ChecksDisplay.js";

interface ResultsProps {
  session: DebuggerSession;
}

interface ExpandableSection {
  id: string;
  label: string;
  content: React.ReactNode;
}

export const Results: React.FC<ResultsProps> = ({ session }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["request-details"]));

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpanded(newExpanded);
  };

  const renderValidationSection = (validation: any, title: string) => {
    const checks = validation.checks || [];
    const summary = validation.summary;

    return (
      <div className="space-y-6">
        {/* Compliance Score - only show if summary exists */}
        {summary && <ComplianceScore summary={summary} />}

        {/* Enhanced Checks Display */}
        {checks.length > 0 && <ChecksDisplay checks={checks} title={`${title} - Detailed Checks`} />}

        {/* Fallback if no checks */}
        {checks.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No validation checks available</p>
          </div>
        )}
      </div>
    );
  };

  const sections: ExpandableSection[] = [
    {
      id: "request-details",
      label: "Request Validation Details",
      content: renderValidationSection(session.requestValidation, "Presentation Request"),
    },
    {
      id: "response-details",
      label: "Response Validation Details",
      content: renderValidationSection(session.responseValidation, "Presentation Response"),
    },
    {
      id: "raw-response",
      label: "Raw JSON Response",
      content: (
        <pre className="text-xs bg-gray-100 p-3 rounded overflow-x-auto">
          {JSON.stringify(session, null, 2)}
        </pre>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section.id} className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleExpanded(section.id)}
            className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left transition"
          >
            <span className="font-medium text-gray-900">{section.label}</span>
            <span className={`text-gray-500 transition transform ${expanded.has(section.id) ? "rotate-180" : ""}`}>
              ▼
            </span>
          </button>
          {expanded.has(section.id) && (
            <div className="px-4 py-3 border-t border-gray-200 bg-white">
              {section.content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
