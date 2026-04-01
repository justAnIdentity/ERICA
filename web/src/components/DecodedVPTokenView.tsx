import React, { useState } from "react";
import { DecodedVPToken } from "../types";
import styles from "./ResponseInspector.module.css";
import { logger } from "../../../src/utils/Logger.js";

interface DecodedVPTokenViewProps {
  decodedTokens: DecodedVPToken[];
}

export const DecodedVPTokenView: React.FC<DecodedVPTokenViewProps> = ({
  decodedTokens,
}) => {
  const [currentTokenIndex, setCurrentTokenIndex] = useState(0);
  const [showCopyToast, setShowCopyToast] = useState(false);

  if (!decodedTokens || decodedTokens.length === 0) {
    return null;
  }

  const currentToken = decodedTokens[currentTokenIndex];

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setShowCopyToast(true);
      setTimeout(() => setShowCopyToast(false), 2000);
    }).catch(err => {
      logger.error('Failed to copy to clipboard', err instanceof Error ? err : new Error(String(err)));
    });
  };

  const formatTimestamp = (timestamp?: number): string => {
    if (!timestamp) return "N/A";
    return new Date(timestamp * 1000).toISOString();
  };

  const handlePrevToken = () => {
    setCurrentTokenIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNextToken = () => {
    setCurrentTokenIndex((prev) => Math.min(decodedTokens.length - 1, prev + 1));
  };

  return (
    <div className={styles.subsection}>
      {showCopyToast && (
        <div className={styles.copyToast}>
          <span className="status-badge status-badge--success text-sm">✓ Copied</span>
        </div>
      )}

      <div className={styles.fullResponseHeader}>
        <h4>Decoded VP Token</h4>
        <button
          className={styles.copyButton}
          onClick={() => copyToClipboard(JSON.stringify(currentToken, null, 2))}
        >
          <span>Copy Decoded JSON</span>
        </button>
      </div>

      {/* Navigation for multiple tokens */}
      {decodedTokens.length > 1 && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '1rem',
          marginBottom: '1rem',
          padding: '0.5rem',
          background: 'rgba(0, 0, 0, 0.05)',
          borderRadius: '4px'
        }}>
          <button
            onClick={handlePrevToken}
            disabled={currentTokenIndex === 0}
            style={{
              padding: '0.25rem 0.75rem',
              background: currentTokenIndex === 0 ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: currentTokenIndex === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            ← Previous
          </button>
          <span style={{ fontWeight: 'bold' }}>
            Token {currentTokenIndex + 1} of {decodedTokens.length}
          </span>
          <button
            onClick={handleNextToken}
            disabled={currentTokenIndex === decodedTokens.length - 1}
            style={{
              padding: '0.25rem 0.75rem',
              background: currentTokenIndex === decodedTokens.length - 1 ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: currentTokenIndex === decodedTokens.length - 1 ? 'not-allowed' : 'pointer',
            }}
          >
            Next →
          </button>
        </div>
      )}

      {/* JWT Header Section */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h5 style={{ 
          margin: '0 0 0.5rem 0', 
          color: '#2c5282',
          fontSize: '0.95rem',
          fontWeight: '600'
        }}>
          JWT Header
        </h5>
        <div style={{ 
          background: '#f7fafc', 
          padding: '0.75rem', 
          borderRadius: '4px',
          border: '1px solid #e2e8f0'
        }}>
          <div className={styles.field}>
            <span className={styles.label}>Algorithm:</span>
            <code>{currentToken.metadata.algorithm}</code>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Type:</span>
            <code>{currentToken.metadata.type}</code>
          </div>
          {currentToken.metadata.keyId && (
            <div className={styles.field}>
              <span className={styles.label}>Key ID:</span>
              <code>{currentToken.metadata.keyId}</code>
            </div>
          )}
        </div>
      </div>

      {/* JWT Payload/Claims Section */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h5 style={{ 
          margin: '0 0 0.5rem 0', 
          color: '#2c5282',
          fontSize: '0.95rem',
          fontWeight: '600'
        }}>
          Claims (Payload)
        </h5>
        <div style={{ 
          background: '#f7fafc', 
          padding: '0.75rem', 
          borderRadius: '4px',
          border: '1px solid #e2e8f0'
        }}>
          {currentToken.metadata.issuer && (
            <div className={styles.field}>
              <span className={styles.label}>Issuer (iss):</span>
              <code>{currentToken.metadata.issuer}</code>
            </div>
          )}
          {currentToken.metadata.subject && (
            <div className={styles.field}>
              <span className={styles.label}>Subject (sub):</span>
              <code>{currentToken.metadata.subject}</code>
            </div>
          )}
          {currentToken.metadata.credentialType && (
            <div className={styles.field}>
              <span className={styles.label}>Credential Type (vct):</span>
              <code>{currentToken.metadata.credentialType}</code>
            </div>
          )}
          {currentToken.metadata.audience && (
            <div className={styles.field}>
              <span className={styles.label}>Audience (aud):</span>
              <code>{currentToken.metadata.audience}</code>
            </div>
          )}
          {currentToken.metadata.issuedAt && (
            <div className={styles.field}>
              <span className={styles.label}>Issued At (iat):</span>
              <code>{formatTimestamp(currentToken.metadata.issuedAt)}</code>
            </div>
          )}
          {currentToken.metadata.expiresAt && (
            <div className={styles.field}>
              <span className={styles.label}>Expires At (exp):</span>
              <code>{formatTimestamp(currentToken.metadata.expiresAt)}</code>
            </div>
          )}
          {currentToken.metadata.notBefore && (
            <div className={styles.field}>
              <span className={styles.label}>Not Before (nbf):</span>
              <code>{formatTimestamp(currentToken.metadata.notBefore)}</code>
            </div>
          )}
          
          {/* User Claims */}
          {currentToken.jwt.payload && (
            <div style={{ marginTop: '1rem' }}>
              <h6 style={{ 
                margin: '0 0 0.5rem 0', 
                fontSize: '0.85rem',
                fontWeight: '600',
                color: '#4a5568'
              }}>
                User Claims:
              </h6>
              <pre style={{
                background: 'white',
                padding: '0.5rem',
                borderRadius: '4px',
                fontSize: '0.85rem',
                overflow: 'auto',
                maxHeight: '300px',
                border: '1px solid #cbd5e0'
              }}>
                {JSON.stringify(currentToken.jwt.payload, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Holder Binding Section */}
      {currentToken.holderBinding && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h5 style={{ 
            margin: '0 0 0.5rem 0', 
            color: '#2c5282',
            fontSize: '0.95rem',
            fontWeight: '600'
          }}>
            Holder Binding (KB-JWT)
          </h5>
          <div style={{ 
            background: '#f7fafc', 
            padding: '0.75rem', 
            borderRadius: '4px',
            border: '1px solid #e2e8f0'
          }}>
            <div className={styles.field}>
              <span className={styles.label}>Nonce:</span>
              <code>{currentToken.holderBinding.nonce}</code>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Audience:</span>
              <code>{currentToken.holderBinding.audience}</code>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Issued At:</span>
              <code>{formatTimestamp(currentToken.holderBinding.issuedAt)}</code>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Expires At:</span>
              <code>{formatTimestamp(currentToken.holderBinding.expiresAt)}</code>
            </div>
            
            {currentToken.kbJwt && (
              <div style={{ marginTop: '1rem' }}>
                <h6 style={{ 
                  margin: '0 0 0.5rem 0', 
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  color: '#4a5568'
                }}>
                  KB-JWT Full Payload:
                </h6>
                <pre style={{
                  background: 'white',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  overflow: 'auto',
                  maxHeight: '200px',
                  border: '1px solid #cbd5e0'
                }}>
                  {JSON.stringify(currentToken.kbJwt.payload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Validity Period Summary */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h5 style={{ 
          margin: '0 0 0.5rem 0', 
          color: '#2c5282',
          fontSize: '0.95rem',
          fontWeight: '600'
        }}>
          Validity Period
        </h5>
        <div style={{ 
          background: '#f7fafc', 
          padding: '0.75rem', 
          borderRadius: '4px',
          border: '1px solid #e2e8f0'
        }}>
          {currentToken.metadata.notBefore && (
            <div className={styles.field}>
              <span className={styles.label}>Valid From:</span>
              <code>{formatTimestamp(currentToken.metadata.notBefore)}</code>
            </div>
          )}
          {currentToken.metadata.expiresAt && (
            <div className={styles.field}>
              <span className={styles.label}>Valid Until:</span>
              <code>{formatTimestamp(currentToken.metadata.expiresAt)}</code>
            </div>
          )}
          <div className={styles.field}>
            <span className={styles.label}>Status:</span>
            <code style={{
              color: (() => {
                const now = Math.floor(Date.now() / 1000);
                if (currentToken.metadata.notBefore && now < currentToken.metadata.notBefore) {
                  return '#ea580c';
                }
                if (currentToken.metadata.expiresAt && now > currentToken.metadata.expiresAt) {
                  return '#dc2626';
                }
                return '#16a34a';
              })()
            }}>
              {(() => {
                const now = Math.floor(Date.now() / 1000);
                if (currentToken.metadata.notBefore && now < currentToken.metadata.notBefore) {
                  return '⚠ Not Yet Valid';
                }
                if (currentToken.metadata.expiresAt && now > currentToken.metadata.expiresAt) {
                  return '✕ Expired';
                }
                return '✓ Valid';
              })()}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DecodedVPTokenView;
