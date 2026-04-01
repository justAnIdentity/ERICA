import React, { useState } from "react";
import { DebuggerSession } from "../types.js";
import { ChecksDisplay } from "./ChecksDisplay.js";

interface TabbedDetailsViewProps {
  session: DebuggerSession;
}

type TabId = "summary" | "request" | "response" | "raw";

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const tabs: Tab[] = [
  { id: "summary", label: "Summary", icon: "" },
  { id: "request", label: "Request Checks", icon: "" },
  { id: "response", label: "Response Checks", icon: "" },
  { id: "raw", label: "Raw Data", icon: "" },
];

export const TabbedDetailsView: React.FC<TabbedDetailsViewProps> = ({
  session,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>("summary");

  const requestErrors = session.requestValidation.errors || [];
  const responseErrors = session.responseValidation.errors || [];
  const requestChecks = session.requestValidation.checks || [];
  const responseChecks = session.responseValidation.checks || [];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Tab Headers */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-all relative ${
              activeTab === tab.id
                ? "bg-white text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === "summary" && (
          <SummaryTab
            requestValidation={session.requestValidation}
            responseValidation={session.responseValidation}
          />
        )}
        {activeTab === "request" && (
          <div>
            {requestChecks.length > 0 ? (
              <ChecksDisplay
                checks={requestChecks}
                title="Request Validation Checks"
              />
            ) : (
              <EmptyState message="No request validation checks available" />
            )}
          </div>
        )}
        {activeTab === "response" && (
          <div>
            {responseChecks.length > 0 ? (
              <ChecksDisplay
                checks={responseChecks}
                title="Response Validation Checks"
              />
            ) : (
              <EmptyState message="No response validation checks available" />
            )}
          </div>
        )}
        {activeTab === "raw" && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-700">
                Complete Session Data
              </h4>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    JSON.stringify(session, null, 2)
                  );
                }}
                className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors font-medium"
              >
                Copy JSON
              </button>
            </div>
            <pre className="text-xs bg-gray-50 p-4 rounded border border-gray-200 overflow-x-auto max-h-96 overflow-y-auto">
              {JSON.stringify(session, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

const SummaryTab: React.FC<{
  requestValidation: any;
  responseValidation: any;
}> = ({ requestValidation, responseValidation }) => {
  const requestSummary = requestValidation.summary;
  const responseSummary = responseValidation.summary;

  return (
    <div className="space-y-6">
      {/* Overall Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Request Checks"
          value={requestSummary?.totalChecks || 0}
          passed={requestSummary?.passedChecks || 0}
          failed={requestSummary?.failedChecks || 0}
        />
        <StatCard
          label="Response Checks"
          value={responseSummary?.totalChecks || 0}
          passed={responseSummary?.passedChecks || 0}
          failed={responseSummary?.failedChecks || 0}
        />
        <StatCard
          label="Overall"
          value={
            (requestSummary?.totalChecks || 0) +
            (responseSummary?.totalChecks || 0)
          }
          passed={
            (requestSummary?.passedChecks || 0) +
            (responseSummary?.passedChecks || 0)
          }
          failed={
            (requestSummary?.failedChecks || 0) +
            (responseSummary?.failedChecks || 0)
          }
          highlight
        />
      </div>

      {/* Validation Results */}
      <div className="grid grid-cols-2 gap-4">
        <ValidationStatusCard
          title="Request Validation"
          valid={requestValidation.valid}
          errors={requestValidation.errors || []}
          summary={requestSummary}
        />
        <ValidationStatusCard
          title="Response Validation"
          valid={responseValidation.valid}
          errors={responseValidation.errors || []}
          summary={responseSummary}
        />
      </div>

      {/* Key Metrics */}
      {(requestSummary || responseSummary) && (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Compliance Metrics
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {requestSummary && (
              <div>
                <span className="text-gray-600">Request Compliance:</span>
                <span className="ml-2 font-semibold text-gray-900">
                  {requestSummary.compliancePercentage}%
                </span>
              </div>
            )}
            {responseSummary && (
              <div>
                <span className="text-gray-600">Response Compliance:</span>
                <span className="ml-2 font-semibold text-gray-900">
                  {responseSummary.compliancePercentage}%
                </span>
              </div>
            )}
            {requestSummary && (
              <div>
                <span className="text-gray-600">Request Errors:</span>
                <span className="ml-2 font-semibold text-red-600">
                  {requestSummary.errorCount}
                </span>
              </div>
            )}
            {responseSummary && (
              <div>
                <span className="text-gray-600">Response Errors:</span>
                <span className="ml-2 font-semibold text-red-600">
                  {responseSummary.errorCount}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: number;
  passed: number;
  failed: number;
  highlight?: boolean;
}> = ({ label, value, passed, failed, highlight }) => {
  return (
    <div
      className={`rounded-lg p-4 ${
        highlight
          ? "bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200"
          : "bg-gray-50 border border-gray-200"
      }`}
    >
      <div className="text-xs text-gray-600 mb-1 font-medium">{label}</div>
      <div
        className={`text-2xl font-bold mb-2 ${
          highlight ? "text-blue-900" : "text-gray-900"
        }`}
      >
        {value}
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="status-badge status-badge--success text-sm">✓ {passed}</span>
        <span className="status-badge status-badge--error text-sm">✕ {failed}</span>
      </div>
    </div>
  );
};

const ValidationStatusCard: React.FC<{
  title: string;
  valid: boolean;
  errors: any[];
  summary: any;
}> = ({ title, valid, errors, summary }) => {
  return (
    <div
      className={`rounded-lg p-4 border-2 ${
        valid
          ? "bg-green-50 border-green-200"
          : "bg-red-50 border-red-200"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-900">{title}</h4>
        <span
          className={`text-lg font-bold ${
            valid ? "text-green-600" : "text-red-600"
          }`}
        >
          {valid ? "✓" : "✕"}
        </span>
      </div>
      <div
        className={`text-sm font-medium ${
          valid ? "text-green-800" : "text-red-800"
        }`}
      >
        {valid ? "All checks passed" : `${errors.length} issue(s) found`}
      </div>
      {summary && (
        <div className="text-xs text-gray-600 mt-2">
          {summary.passedChecks}/{summary.totalChecks} checks passed
        </div>
      )}
    </div>
  );
};

const EmptyState: React.FC<{ message: string }> = ({ message }) => {
  return (
    <div className="text-center py-12 text-gray-500">
      <div className="text-4xl mb-3">📭</div>
      <p className="text-sm">{message}</p>
    </div>
  );
};
