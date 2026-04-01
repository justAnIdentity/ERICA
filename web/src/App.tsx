import React, { useState } from "react";
import { InputForm } from "./components/InputForm.js";
import { ComplianceStatus } from "./components/ComplianceStatus.js";
import { PlainEnglishSummary } from "./components/PlainEnglishSummary.js";
import { TabbedDetailsView } from "./components/TabbedDetailsView.js";
import { WalletResponseInspector } from "./components/WalletResponseInspector.js";
import { DebuggerSession } from "./types.js";
import { getComplianceLevel, convertToPlainEnglishIssues } from "./utils/validationHelpers.js";
import { logger } from "../../src/utils/Logger.js";
import "./index.css";

export const App: React.FC = () => {
  const [session, setSession] = useState<DebuggerSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInputExpanded, setIsInputExpanded] = useState(true);

  const handleDebug = (newSession: DebuggerSession) => {
    logger.debug("Debug session received", {
      hasRequestValidation: !!newSession?.requestValidation,
      hasResponseValidation: !!newSession?.responseValidation,
      hasSimulatedResponse: !!newSession?.simulatedResponse,
    });

    try {
      setSession(newSession);
      setIsLoading(false);
      // Collapse input form after successful debug
      setIsInputExpanded(false);
    } catch (error) {
      logger.error("Error setting session", error instanceof Error ? error : new Error(String(error)));
    }
  };

  return (
    <div className="min-h-screen app-content">
      {/* Header */}
      <header className="bg-gradient-to-r from-emerald-50/95 via-teal-50/95 to-cyan-50/95 backdrop-blur-sm border-b border-emerald-200/50 py-6 shadow-lg sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
                ERICA
              </h1>
              <p className="text-gray-700 mt-0.5 text-sm">
                EUDI Relying Party Integration Conformance Analyzer – Debug OpenID4VP Presentation Requests and Responses
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Input Form Section - Collapsible after first debug */}
        <div className="mb-8">
          {session && !isInputExpanded ? (
            // Collapsed state - show compact header with expand button
            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 flex items-center justify-between border border-gray-100 hover:shadow-xl transition-all">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Presentation Request</h2>
                  <p className="text-sm text-gray-500">Click to edit and re-debug</p>
                </div>
              </div>
              <button
                onClick={() => setIsInputExpanded(true)}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2 font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Edit Request
              </button>
            </div>
          ) : (
            // Expanded state - show full input form
            <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Debug a Presentation Request
                  </h2>
                </div>
                {session && (
                  <button
                    onClick={() => setIsInputExpanded(false)}
                    className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                    Collapse
                  </button>
                )}
              </div>
              <InputForm onSubmit={handleDebug} isLoading={isLoading} />
            </div>
          )}
        </div>

        {/* Results Section - New Layout */}
        {session ? (
          <div className="space-y-6">

            {/* Traffic Light Status - Overall Compliance */}
            {(() => {
              try {
                if (session.requestValidation && session.responseValidation) {
                  return (
                    <ComplianceStatus
                      {...getComplianceLevel(session.requestValidation, session.responseValidation)}
                    />
                  );
                } else {
                  return (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <p className="text-yellow-800 text-sm">
                        ⚠️ Validation data incomplete. Some components may not render correctly.
                      </p>
                    </div>
                  );
                }
              } catch (error) {
                logger.error("Error rendering ComplianceStatus", error instanceof Error ? error : new Error(String(error)));
                return (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800 text-sm">Error rendering compliance status: {String(error)}</p>
                  </div>
                );
              }
            })()}

            {/* Plain English Summary - What You Need to Know */}
            {(() => {
              try {
                return (
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      Summary
                    </h2>
                    <PlainEnglishSummary
                      isCompliant={
                        session.requestValidation?.valid !== false &&
                        session.responseValidation?.valid !== false
                      }
                      issues={convertToPlainEnglishIssues([
                        ...(session.requestValidation?.errors || []),
                        ...(session.responseValidation?.errors || []),
                      ])}
                    />
                  </div>
                );
              } catch (error) {
                logger.error("Error rendering PlainEnglishSummary", error instanceof Error ? error : new Error(String(error)));
                return (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800 text-sm">Error rendering summary: {String(error)}</p>
                  </div>
                );
              }
            })()}

            {/* Tabbed Technical Details */}
            {(() => {
              try {
                return (
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      Technical Details
                    </h2>
                    <TabbedDetailsView session={session} />
                  </div>
                );
              } catch (error) {
                logger.error("Error rendering TabbedDetailsView", error instanceof Error ? error : new Error(String(error)));
                return (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800 text-sm">Error rendering technical details: {String(error)}</p>
                  </div>
                );
              }
            })()}

            {/* Wallet Response Inspector */}
            {session.simulatedResponse && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  Wallet Response
                </h2>
                <WalletResponseInspector response={session.simulatedResponse} />
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-12 text-center border border-gray-100">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl flex items-center justify-center">
                <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <p className="text-gray-700 text-xl font-semibold mb-2">
                Ready to Debug
              </p>
              <p className="text-gray-500">
                Enter or paste a Presentation Request above and click "Debug Request" to analyze it
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white/80 backdrop-blur-sm border-t border-gray-200/50 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-600 text-sm">
          <p>
            ERICA – EUDI VP Debugger • OpenID4VP-Core • EUDI Wallet ARF •{" "}
            <a
              href="https://openid.net/specs/openid-4-verifiable-presentations-1_0.html"
              className="text-blue-600 hover:text-purple-600 transition-colors font-medium"
            >
              Specification
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
