/**
 * Trust List Manager - Relying Party Certificate Validation
 *
 * CRITICAL SECURITY NOTE:
 * - This validates RELYING PARTY certificates (NOT PID Issuer certificates)
 * - These are Access Certificates presented by verifiers during PID PRESENTATION
 * - All certificates here are PUBLIC and safe to commit to repository
 *
 * DO NOT CONFUSE WITH:
 * - PID Issuer Signer Certificates (handled by CertificateManager - test only)
 * - These are completely separate certificate chains for different purposes
 *
 * Trust model: Orchestrator issues both Registrar certs and Access certs independently
 *
 * Trust Model for Presentation:
 * 1. The orchestrator (trust list owner) issues Registrar certificates
 * 2. registrar.jwt contains these Registrar certificates as reference certificates
 * 3. The orchestrator also issues Access Certificates to authorized RPs
 * 4. Verifiers present Access Certificates in verifier_info.x5c
 * 5. Wallet validates: Does the Access Cert signature match a Registrar cert in the trust list?
 *
 * Note: Registrar certificates do NOT sign Access Certificates - both are issued
 * independently by the orchestrator. The trust list links them together.
 */

import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import { webcrypto } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Polyfill for PKI.js
const cryptoEngine = new pkijs.CryptoEngine({
  name: "",
  crypto: webcrypto as any,
  subtle: webcrypto.subtle as any,
});
pkijs.setEngine("newEngine", cryptoEngine);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RegistrarCertificate {
  commonName: string;
  organization: string;
  country: string;
  certificate: pkijs.Certificate;
  certificateDER: Buffer;
  certificatePEM: string;
  fingerprint: string;
  validFrom: Date;
  validTo: Date;
  serviceType: string; // "Issuance" or "Revocation"
}

export interface AccessCertificateValidationResult {
  valid: boolean;
  trusted: boolean;
  expired: boolean;
  registrar?: RegistrarCertificate;
  errors: string[];
  warnings: string[];
}

export class TrustListManager {
  private static instance: TrustListManager;
  private registrarCertificates: RegistrarCertificate[] = [];

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): TrustListManager {
    if (!TrustListManager.instance) {
      TrustListManager.instance = new TrustListManager();
    }
    return TrustListManager.instance;
  }

  /**
   * Initialize trust list (call once on startup)
   * Parses registrar.jwt and extracts Registrar certificates
   */
  async initialize(): Promise<void> {
    try {
      // Load registrar.jwt
      const trustListPath = path.resolve(__dirname, "trustlist", "registrar.jwt");
      const jwtContent = fs.readFileSync(trustListPath, "utf-8");

      // Parse JWT (manual base64url decode)
      const [headerB64, payloadB64, signatureB64] = jwtContent.split(".");
      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));

      // Extract TrustedEntitiesList
      const trustedEntities = payload.LoTE?.TrustedEntitiesList;
      if (!trustedEntities || !Array.isArray(trustedEntities)) {
        throw new Error("Invalid trust list format: missing TrustedEntitiesList");
      }

      // Extract Registrar certificates from all services
      for (const entity of trustedEntities) {
        const services = entity.TrustedEntityServices || [];

        for (const service of services) {
          const serviceInfo = service.ServiceInformation;
          const serviceTypeId = serviceInfo?.ServiceTypeIdentifier || "";
          const serviceType = serviceTypeId.includes("Issuance") ? "Issuance" : "Revocation";

          const x509Certs = serviceInfo?.ServiceDigitalIdentity?.X509Certificates;
          if (!x509Certs || !Array.isArray(x509Certs)) {
            continue;
          }

          // Parse each certificate
          for (const certEntry of x509Certs) {
            const certB64 = certEntry.val;
            if (!certB64) continue;

            try {
              const certDER = Buffer.from(certB64, "base64");
              const cert = this.parseCertificate(certDER);
              const fingerprint = await this.calculateFingerprint(certDER);

              // Extract certificate details
              const commonName = this.extractCN(cert.subject);
              const organization = this.extractO(cert.subject);
              const country = this.extractC(cert.subject);

              // Convert to PEM
              const certPEM = this.derToPEM(certDER);

              const registrarCert: RegistrarCertificate = {
                commonName,
                organization,
                country,
                certificate: cert,
                certificateDER: certDER,
                certificatePEM: certPEM,
                fingerprint,
                validFrom: cert.notBefore.value,
                validTo: cert.notAfter.value,
                serviceType,
              };

              this.registrarCertificates.push(registrarCert);
              console.log(`[TrustListManager] Added Registrar certificate: ${commonName} (${serviceType}, ${fingerprint})`);
            } catch (error) {
              console.error(`[TrustListManager] Failed to parse certificate:`, error);
            }
          }
        }
      }

      if (this.registrarCertificates.length === 0) {
        console.warn("[TrustListManager] WARNING: No Registrar certificates were loaded from trust list");
      }

      console.log(`[TrustListManager] Initialized with ${this.registrarCertificates.length} Registrar certificates`);
    } catch (error) {
      throw new Error(`Failed to initialize trust list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate an Access Certificate
   * @param accessCertB64 Base64-encoded DER certificate from verifier_info.x5c[0]
   */
  async validateAccessCertificate(accessCertB64: string): Promise<AccessCertificateValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!accessCertB64) {
      return {
        valid: false,
        trusted: false,
        expired: false,
        errors: ["No Access Certificate provided"],
        warnings,
      };
    }

    try {
      // Parse Access Certificate
      const accessCertDER = Buffer.from(accessCertB64, "base64");
      const accessCert = this.parseCertificate(accessCertDER);

      // Check expiration
      const now = new Date();
      const expired = now < accessCert.notBefore.value || now > accessCert.notAfter.value;

      if (now < accessCert.notBefore.value) {
        errors.push("Access Certificate is not yet valid");
      }
      if (now > accessCert.notAfter.value) {
        errors.push("Access Certificate has expired");
      }

      // Verify signature against each Registrar certificate
      let trusted = false;
      let trustedRegistrar: RegistrarCertificate | undefined;

      for (const registrar of this.registrarCertificates) {
        try {
          const verificationResult = await accessCert.verify(registrar.certificate);
          if (verificationResult) {
            trusted = true;
            trustedRegistrar = registrar;
            console.log(`[TrustListManager] Access Certificate verified against Registrar: ${registrar.commonName}`);
            break;
          }
        } catch (error) {
          // Continue trying other registrars
          continue;
        }
      }

      if (!trusted) {
        errors.push("Access Certificate signature could not be verified against any trusted Registrar");
      }

      const accessCN = this.extractCN(accessCert.subject);
      console.log(`[TrustListManager] Validated Access Certificate: ${accessCN} (trusted: ${trusted}, expired: ${expired})`);

      return {
        valid: errors.length === 0,
        trusted,
        expired,
        registrar: trustedRegistrar,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push(`Access Certificate validation failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        valid: false,
        trusted: false,
        expired: false,
        errors,
        warnings,
      };
    }
  }

  /**
   * Get all Registrar certificates
   */
  getRegistrarCertificates(): RegistrarCertificate[] {
    return [...this.registrarCertificates];
  }

  /**
   * Get trusted verifiers (alias for backward compatibility)
   */
  getTrustedVerifiers(): RegistrarCertificate[] {
    return this.getRegistrarCertificates();
  }

  // ========== Helper Methods ==========

  /**
   * Parse DER certificate
   */
  private parseCertificate(certDER: Buffer): pkijs.Certificate {
    const asn1 = asn1js.fromBER(certDER);
    if (asn1.offset === -1) {
      throw new Error("Failed to parse certificate");
    }
    return new pkijs.Certificate({ schema: asn1.result });
  }

  /**
   * Convert DER to PEM
   */
  private derToPEM(der: Buffer): string {
    const base64 = der.toString("base64");
    const pem = `-----BEGIN CERTIFICATE-----\n${base64.match(/.{1,64}/g)?.join("\n")}\n-----END CERTIFICATE-----`;
    return pem;
  }

  /**
   * Calculate SHA-256 fingerprint of certificate
   */
  private async calculateFingerprint(certDER: Buffer): Promise<string> {
    const hash = await webcrypto.subtle.digest("SHA-256", certDER);
    return Buffer.from(hash)
      .toString("hex")
      .toUpperCase()
      .match(/.{2}/g)!
      .join(":");
  }

  /**
   * Extract Common Name from certificate subject
   */
  private extractCN(subject: pkijs.RelativeDistinguishedNames): string {
    for (const rdn of subject.typesAndValues) {
      if (rdn.type === "2.5.4.3") {
        // CN OID
        return (rdn.value as any).valueBlock.value;
      }
    }
    return "Unknown";
  }

  /**
   * Extract Organization from certificate subject
   */
  private extractO(subject: pkijs.RelativeDistinguishedNames): string {
    for (const rdn of subject.typesAndValues) {
      if (rdn.type === "2.5.4.10") {
        // O OID
        return (rdn.value as any).valueBlock.value;
      }
    }
    return "Unknown";
  }

  /**
   * Extract Country from certificate subject
   */
  private extractC(subject: pkijs.RelativeDistinguishedNames): string {
    for (const rdn of subject.typesAndValues) {
      if (rdn.type === "2.5.4.6") {
        // C OID
        return (rdn.value as any).valueBlock.value;
      }
    }
    return "Unknown";
  }
}

export default TrustListManager;
