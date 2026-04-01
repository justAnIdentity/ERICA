import React, { useState } from "react";
import styles from "./ResponseInspector.module.css";
import { DecodedVPTokenView } from "./DecodedVPTokenView";
import { logger } from "../../../src/utils/Logger.js";

interface ComponentDiagnostic {
  component: string;
  phase: string;
  duration: number;
  eventCount: number;
  hasErrors: boolean;
  errorCount: number;
}

interface DiagnosticSummary {
  simulationId: string;
  totalDuration: number;
  success: boolean;
  components: ComponentDiagnostic[];
  totalEventCount: number;
  errorCount: number;
}

interface DecodedVPToken {
  format: 'sd-jwt';
  jwt: {
    header: Record<string, any>;
    payload: Record<string, any>;
    signature: string;
  };
  disclosures: string[];
  kbJwt?: {
    header: Record<string, any>;
    payload: Record<string, any>;
    signature: string;
  };
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

interface WalletResponse {
  vpToken?: string | string[] | Record<string, string | string[]>;
  presentationSubmission?: {
    id?: string;
    definitionId?: string;
    descriptorMap: Array<{
      id: string;
      format: string;
      path: string;
    }>;
  };
  decodedVPTokens?: DecodedVPToken[];
}

interface ResponseInspectorProps {
  response?: WalletResponse;
  diagnostics?: any;
  loading?: boolean;
}

export const ResponseInspector: React.FC<ResponseInspectorProps> = ({
  response,
  diagnostics,
  loading = false,
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["response", "diagnostics"])
  );
  const [showCopyToast, setShowCopyToast] = useState(false);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setShowCopyToast(true);
      setTimeout(() => setShowCopyToast(false), 2000);
    }).catch(err => {
      logger.error('Failed to copy to clipboard', err instanceof Error ? err : new Error(String(err)));
    });
  };

  // Helper to get VP tokens as array regardless of format
  const getVPTokensArray = (vpToken: string | string[] | Record<string, string | string[]> | undefined): { id?: string; token: string }[] => {
    if (!vpToken) return [];
    if (typeof vpToken === 'string') return [{ token: vpToken }];
    if (Array.isArray(vpToken)) return vpToken.map(token => ({ token }));
    // Object format: { "pid-sd-jwt": "eyJ...", ... }
    return Object.entries(vpToken).flatMap(([id, value]) =>
      Array.isArray(value)
        ? value.map(token => ({ id, token }))
        : [{ id, token: value }]
    );
  };

  const syntaxHighlight = (jsonString: string): JSX.Element => {
    try {
      const obj = JSON.parse(jsonString);
      return (
        <pre className={styles.fullResponseCode}>
          {JSON.stringify(obj, null, 2)
            .replace(/"([^(")"]+)":/g, '<span class="syntaxKey">"$1":</span>')
            .replace(/: "([^"]+)"/g, ': <span class="syntaxString">"$1"</span>')
            .replace(/: ([0-9]+)/g, ': <span class="syntaxNumber">$1</span>')
            .replace(/: (true|false)/g, ': <span class="syntaxBoolean">$1</span>')
            .replace(/: null/g, ': <span class="syntaxNull">null</span>')
            .split('\n').map((line, i) => (
              <React.Fragment key={i}>
                {line}<br/>
              </React.Fragment>
            ))}
        </pre>
      );
    } catch (e) {
      return <pre className={styles.fullResponseCode}>{jsonString}</pre>;
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>Generating wallet response...</p>
        </div>
      </div>
    );
  }

  if (!response && !diagnostics) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <p>No wallet simulation result available. Run a validation first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Copy Success Toast */}
      {showCopyToast && (
        <div className={styles.copyToast}>
          <span className="status-badge status-badge--success text-sm">✓ Copied</span>
        </div>
      )}
      {/* Response Section */}
      {response && (
        <div className={styles.section}>
          <div
            className={styles.sectionHeader}
            onClick={() => toggleSection("response")}
          >
            <span className={styles.icon}>
              {expandedSections.has("response") ? "▼" : "▶"}
            </span>
            <h3>Presentation Response</h3>
            <span className={styles.badge}>
              {getVPTokensArray(response.vpToken).length}{" "}
              VP(s)
            </span>
          </div>

          {expandedSections.has("response") && (
            <div className={styles.sectionContent}>
              {/* Full Response JSON with Copy Button */}
              <div className={styles.subsection}>
                <div className={styles.fullResponseHeader}>
                  <h4>Full Response JSON</h4>
                  <button
                    className={styles.copyButton}
                    onClick={() => copyToClipboard(JSON.stringify(response, null, 2))}
                  >
                    <span>Copy JSON</span>
                  </button>
                </div>
                {syntaxHighlight(JSON.stringify(response, null, 2))}
              </div>

              {/* Decoded VP Tokens */}
              {response.decodedVPTokens && response.decodedVPTokens.length > 0 && (
                <DecodedVPTokenView decodedTokens={response.decodedVPTokens} />
              )}

              {/* VP Tokens */}
              <div className={styles.subsection}>
                <h4>VP Tokens (Encoded)</h4>
                <div className={styles.tokenList}>
                  {getVPTokensArray(response.vpToken).map(({ id, token }, idx) => (
                    <div key={idx} className={styles.token}>
                      <div className={styles.tokenHeader}>
                        {id ? `Token: ${id}` : `Token ${idx + 1}`}
                      </div>
                      <div className={styles.tokenContent}>
                        <pre className={styles.fullResponseCode}>
                          {token}
                        </pre>
                      </div>
                      <button
                        className={styles.copyButton}
                        onClick={() => copyToClipboard(token)}
                        style={{marginTop: '0.5rem'}}
                      >
                        <span>Copy Complete Token</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Presentation Submission */}
              {response.presentationSubmission && (
                <div className={styles.subsection}>
                  <div className={styles.fullResponseHeader}>
                    <h4>Presentation Submission</h4>
                    <button
                      className={styles.copyButton}
                      onClick={() => copyToClipboard(JSON.stringify(response.presentationSubmission, null, 2))}
                    >
                      <span>Copy Submission</span>
                    </button>
                  </div>
                  <div className={styles.submission}>
                    <div className={styles.field}>
                      <span className={styles.label}>ID:</span>
                      <code>{response.presentationSubmission.id}</code>
                    </div>
                    <div className={styles.field}>
                      <span className={styles.label}>Definition ID:</span>
                      <code>
                        {response.presentationSubmission.definitionId}
                      </code>
                    </div>
                    <div className={styles.field}>
                      <span className={styles.label}>Descriptors:</span>
                      <div className={styles.descriptors}>
                        {response.presentationSubmission.descriptorMap.map(
                          (desc, idx) => (
                            <div key={idx} className={styles.descriptor}>
                              <div className={styles.descriptorId}>
                                {desc.id}
                              </div>
                              <div className={styles.descriptorDetails}>
                                <span>Format: {desc.format}</span>
                                <span>Path: {desc.path}</span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Diagnostics Section */}
      {diagnostics && (
        <div className={styles.section}>
          <div
            className={styles.sectionHeader}
            onClick={() => toggleSection("diagnostics")}
          >
            <span className={styles.icon}>
              {expandedSections.has("diagnostics") ? "▼" : "▶"}
            </span>
            <h3>Diagnostics</h3>
            <span
              className={`${styles.badge} ${
                diagnostics.success
                  ? styles.badgeSuccess
                  : styles.badgeError
              }`}
            >
              {diagnostics.success ? "✓ Success" : "✗ Failed"}
            </span>
          </div>

          {expandedSections.has("diagnostics") && (
            <div className={styles.sectionContent}>
              <div className={styles.summary}>
                <div className={styles.summaryItem}>
                  <span className={styles.label}>Simulation ID:</span>
                  <code>{diagnostics.simulationId}</code>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.label}>Duration:</span>
                  <span>{diagnostics.totalDuration}ms</span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.label}>Components:</span>
                  <span>{diagnostics.components.length}</span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.label}>Events:</span>
                  <span>{diagnostics.totalEventCount}</span>
                </div>
                {diagnostics.errorCount > 0 && (
                  <div className={styles.summaryItem}>
                    <span className={styles.label}>Errors:</span>
                    <span className={styles.error}>{diagnostics.errorCount}</span>
                  </div>
                )}
              </div>

              {/* Component Diagnostics */}
              <div className={styles.components}>
                <h4>Components</h4>
                {diagnostics.components.map((comp: any, idx: number) => (
                  <div
                    key={idx}
                    className={`${styles.component} ${
                      comp.hasErrors ? styles.componentError : ""
                    }`}
                  >
                    <div className={styles.componentHeader}>
                      <span className={`${styles.componentStatus} ${comp.hasErrors ? 'text-red-600' : 'text-green-600'}`}>
                        {comp.hasErrors ? "✕" : "✓"}
                      </span>
                      <span className={styles.componentName}>{comp.component}</span>
                      <span className={styles.componentPhase}>{comp.phase}</span>
                    </div>
                    <div className={styles.componentDetails}>
                      <span>Duration: {comp.duration}ms</span>
                      <span>Events: {comp.eventCount}</span>
                      {comp.errorCount > 0 && (
                        <span className={styles.error}>
                          Errors: {comp.errorCount}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ResponseInspector;
