/**
 * Certificate Manager - PID ISSUER Certificate Generation (TEST ONLY)
 *
 * CRITICAL SECURITY NOTE:
 * - This generates TEST-ONLY certificates for the PID ISSUER (NOT Relying Party)
 * - These certificates sign PID credentials during ISSUANCE
 * - In production, PID issuers use government-issued signer certificates (NEVER public)
 * - This tool generates fake certificates at runtime for debugging purposes only
 *
 * DO NOT CONFUSE WITH:
 * - Relying Party Access Certificates (handled by TrustListManager)
 * - Registrar Certificates (stored in trustlist/registrar.jwt)
 *
 * Trust model: Orchestrator issues both Registrar certs and Access certs independently
 *
 * Creates Root CA → Leaf certificate chain for PID signing (test environment only)
 */

import crypto from "crypto";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import { webcrypto } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// Import Web Crypto API types
type CryptoKey = webcrypto.CryptoKey;
type CryptoKeyPair = webcrypto.CryptoKeyPair;

// Polyfill for PKI.js
const cryptoEngine = new pkijs.CryptoEngine({
  name: "",
  crypto: webcrypto as any,
  subtle: webcrypto.subtle as any,
});
pkijs.setEngine("newEngine", cryptoEngine);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Certificate {
  cert: pkijs.Certificate;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  pemCert: string;
  derCert: Buffer;
  base64Der: string; // For x5c header
}

export interface CertificateChain {
  rootCA: Certificate;
  leafCert: Certificate;
  x5c: string[]; // For JWT header: [leaf, root]
  trustAnchor: {
    pem: string;
    der: Buffer;
  };
}

export class CertificateManager {
  private static instance: CertificateManager;
  private chain: CertificateChain | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): CertificateManager {
    if (!CertificateManager.instance) {
      CertificateManager.instance = new CertificateManager();
    }
    return CertificateManager.instance;
  }

  /**
   * Initialize certificate chain (call once on startup)
   * Loads stable test certificates from disk
   */
  async initialize(): Promise<void> {
    if (this.chain) {
      return; // Already initialized
    }
    this.chain = await this.loadCertificateChain();
  }

  /**
   * Get the certificate chain
   */
  getCertificateChain(): CertificateChain {
    if (!this.chain) {
      throw new Error("CertificateManager not initialized. Call initialize() first.");
    }
    return this.chain;
  }

  /**
   * Get x5c array for JWT header
   */
  getX5c(): string[] {
    return this.getCertificateChain().x5c;
  }

  /**
   * Get trust anchor (root CA certificate) for export
   */
  getTrustAnchor(): { pem: string; der: Buffer } {
    return this.getCertificateChain().trustAnchor;
  }

  /**
   * Get leaf certificate private key for signing
   */
  getLeafPrivateKey(): CryptoKey {
    return this.getCertificateChain().leafCert.privateKey;
  }

  /**
   * Load stable certificate chain from disk (issuer/ directory)
   * Uses pre-generated test certificates for consistent trust anchor
   */
  private async loadCertificateChain(): Promise<CertificateChain> {
    try {
      const issuerDir = path.resolve(__dirname, "issuer");
      const certPath = path.join(issuerDir, "issuer-certificate.pem");
      const keyPath = path.join(issuerDir, "issuer-private-key.pem");

      // Read PEM files
      const certPem = fs.readFileSync(certPath, "utf-8");
      const keyPem = fs.readFileSync(keyPath, "utf-8");

      // Parse certificate
      const certDer = this.pemToDer(certPem);
      const cert = this.parseCertificate(certDer);

      // Import private key
      const privateKey = await this.importPrivateKeyFromPem(keyPem);

      // Extract public key from certificate
      const publicKey = await cert.getPublicKey();

      const rootCA: Certificate = {
        cert,
        privateKey,
        publicKey,
        pemCert: certPem,
        derCert: certDer,
        base64Der: certDer.toString("base64"),
      };

      // For now, use same cert as leaf (self-signed)
      // In future, could generate leaf cert signed by root
      const leafCert = rootCA;

      // Build x5c array: [leaf] (since self-signed)
      const x5c = [leafCert.base64Der];

      console.log("[CertificateManager] Loaded stable test issuer certificate from disk");
      console.log(`[CertificateManager] Issuer: ${this.extractCN(cert.subject)}`);
      console.log(`[CertificateManager] Valid: ${cert.notBefore.value.toISOString()} - ${cert.notAfter.value.toISOString()}`);

      return {
        rootCA,
        leafCert,
        x5c,
        trustAnchor: {
          pem: rootCA.pemCert,
          der: rootCA.derCert,
        },
      };
    } catch (error) {
      console.warn("[CertificateManager] Failed to load certificates from disk, falling back to generated certificates");
      console.warn(`[CertificateManager] Error: ${error instanceof Error ? error.message : String(error)}`);
      return this.generateCertificateChain();
    }
  }

  /**
   * Generate complete certificate chain (fallback if disk load fails)
   */
  private async generateCertificateChain(): Promise<CertificateChain> {
    // Step 1: Generate Root CA
    const rootCA = await this.generateRootCA();

    // Step 2: Generate Leaf Certificate (signed by Root CA)
    const leafCert = await this.generateLeafCertificate(rootCA);

    // Build x5c array: [leaf, root]
    const x5c = [
      leafCert.base64Der,
      rootCA.base64Der,
    ];

    return {
      rootCA,
      leafCert,
      x5c,
      trustAnchor: {
        pem: rootCA.pemCert,
        der: rootCA.derCert,
      },
    };
  }

  /**
   * Generate Root CA certificate
   */
  private async generateRootCA(): Promise<Certificate> {
    const keyPair = await this.generateKeyPair();

    const cert = new pkijs.Certificate();
    cert.version = 2;
    cert.serialNumber = new asn1js.Integer({ value: 1 });

    // Issuer = Subject (self-signed)
    cert.issuer.typesAndValues.push(
      new pkijs.AttributeTypeAndValue({
        type: "2.5.4.6", // Country
        value: new asn1js.PrintableString({ value: "DE" }),
      }),
      new pkijs.AttributeTypeAndValue({
        type: "2.5.4.10", // Organization
        value: new asn1js.Utf8String({ value: "EUDI VP Debugger" }),
      }),
      new pkijs.AttributeTypeAndValue({
        type: "2.5.4.11", // Organizational Unit
        value: new asn1js.Utf8String({ value: "Test CA" }),
      }),
      new pkijs.AttributeTypeAndValue({
        type: "2.5.4.3", // Common Name
        value: new asn1js.Utf8String({ value: "EUDI VP Debugger Root CA" }),
      })
    );
    cert.subject.typesAndValues = cert.issuer.typesAndValues;

    // Validity: 10 years
    cert.notBefore.value = new Date();
    cert.notAfter.value = new Date();
    cert.notAfter.value.setFullYear(cert.notAfter.value.getFullYear() + 10);

    // Extensions
    cert.extensions = [
      // Basic Constraints (CA:TRUE)
      new pkijs.Extension({
        extnID: "2.5.29.19",
        critical: true,
        extnValue: new asn1js.OctetString({
          valueHex: new pkijs.BasicConstraints({
            cA: true,
            pathLenConstraint: 0,
          }).toSchema().toBER(false),
        }).toBER(false),
      }),
      // Key Usage (keyCertSign, cRLSign)
      new pkijs.Extension({
        extnID: "2.5.29.15",
        critical: true,
        extnValue: new asn1js.OctetString({
          valueHex: new asn1js.BitString({
            valueHex: Buffer.from([0x06]), // keyCertSign | cRLSign
          }).toBER(false),
        }).toBER(false),
      }),
    ];

    await cert.subjectPublicKeyInfo.importKey(keyPair.publicKey);

    // Self-sign
    await cert.sign(keyPair.privateKey, "SHA-256");

    const derCert = Buffer.from(cert.toSchema().toBER(false));
    const pemCert = this.derToPem(derCert, "CERTIFICATE");
    const base64Der = derCert.toString("base64");

    return {
      cert,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      pemCert,
      derCert,
      base64Der,
    };
  }

  /**
   * Generate Leaf certificate (end-entity certificate)
   */
  private async generateLeafCertificate(rootCA: Certificate): Promise<Certificate> {
    const keyPair = await this.generateKeyPair();

    const cert = new pkijs.Certificate();
    cert.version = 2;
    cert.serialNumber = new asn1js.Integer({ value: 2 });

    // Issuer = Root CA
    cert.issuer = rootCA.cert.subject;

    // Subject
    cert.subject.typesAndValues.push(
      new pkijs.AttributeTypeAndValue({
        type: "2.5.4.6",
        value: new asn1js.PrintableString({ value: "DE" }),
      }),
      new pkijs.AttributeTypeAndValue({
        type: "2.5.4.10",
        value: new asn1js.Utf8String({ value: "EUDI VP Debugger" }),
      }),
      new pkijs.AttributeTypeAndValue({
        type: "2.5.4.3",
        value: new asn1js.Utf8String({ value: "EUDI VP Debugger Wallet Simulator" }),
      })
    );

    // Validity: 1 year
    cert.notBefore.value = new Date();
    cert.notAfter.value = new Date();
    cert.notAfter.value.setFullYear(cert.notAfter.value.getFullYear() + 1);

    // Extensions
    cert.extensions = [
      // Basic Constraints (CA:FALSE)
      new pkijs.Extension({
        extnID: "2.5.29.19",
        critical: true,
        extnValue: new asn1js.OctetString({
          valueHex: new pkijs.BasicConstraints({
            cA: false,
          }).toSchema().toBER(false),
        }).toBER(false),
      }),
      // Key Usage (digitalSignature)
      new pkijs.Extension({
        extnID: "2.5.29.15",
        critical: true,
        extnValue: new asn1js.OctetString({
          valueHex: new asn1js.BitString({
            valueHex: Buffer.from([0x80]), // digitalSignature
          }).toBER(false),
        }).toBER(false),
      }),
    ];

    await cert.subjectPublicKeyInfo.importKey(keyPair.publicKey);

    // Sign with Root CA
    await cert.sign(rootCA.privateKey, "SHA-256");

    const derCert = Buffer.from(cert.toSchema().toBER(false));
    const pemCert = this.derToPem(derCert, "CERTIFICATE");
    const base64Der = derCert.toString("base64");

    return {
      cert,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      pemCert,
      derCert,
      base64Der,
    };
  }

  /**
   * Generate EC P-256 key pair
   */
  private async generateKeyPair(): Promise<CryptoKeyPair> {
    return await webcrypto.subtle.generateKey(
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      true,
      ["sign", "verify"]
    );
  }

  /**
   * Convert PEM to DER format
   */
  private pemToDer(pem: string): Buffer {
    const base64 = pem
      .replace(/-----BEGIN [^-]+-----/, "")
      .replace(/-----END [^-]+-----/, "")
      .replace(/\s/g, "");
    return Buffer.from(base64, "base64");
  }

  /**
   * Convert DER to PEM format
   */
  private derToPem(der: Buffer, label: string): string {
    const base64 = der.toString("base64");
    const lines: string[] = [];
    for (let i = 0; i < base64.length; i += 64) {
      lines.push(base64.slice(i, i + 64));
    }
    return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
  }

  /**
   * Parse certificate from DER bytes
   */
  private parseCertificate(derCert: Buffer): pkijs.Certificate {
    const asn1 = asn1js.fromBER(derCert);
    if (asn1.offset === -1) {
      throw new Error("Failed to parse certificate DER");
    }
    return new pkijs.Certificate({ schema: asn1.result });
  }

  /**
   * Import EC private key from PEM format
   */
  private async importPrivateKeyFromPem(pemKey: string): Promise<CryptoKey> {
    // Extract base64 from PEM
    const base64 = pemKey
      .replace(/-----BEGIN [^-]+-----/, "")
      .replace(/-----END [^-]+-----/, "")
      .replace(/\s/g, "");
    const der = Buffer.from(base64, "base64");

    // Import as PKCS#8 EC private key
    const privateKey = await webcrypto.subtle.importKey(
      "pkcs8",
      der,
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      true,
      ["sign"]
    );

    return privateKey;
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
}

export default CertificateManager;
