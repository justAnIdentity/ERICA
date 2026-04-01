/**
 * Key Manager for WalletSimulator
 * Manages cryptographic key generation and lifecycle
 * Keys are generated once per application session and reused
 */

import crypto from "crypto";

export interface JWK {
  kty: string;
  crv: string;
  x: string;
  y: string;
  alg?: string;
  use?: string;
  kid?: string;
}

export interface KeyPair {
  privateKey: crypto.KeyObject;
  publicJWK: JWK;
  kid: string; // Key ID for reference
}

export class KeyManager {
  private static instance: KeyManager;
  private keyPair: KeyPair | null = null;
  private algorithm = "EC";
  private curve = "prime256v1"; // P-256
  private hashAlgorithm = "sha256";

  private constructor() {
    this.generateKeys();
  }

  /**
   * Get singleton instance of KeyManager
   */
  static getInstance(): KeyManager {
    if (!KeyManager.instance) {
      KeyManager.instance = new KeyManager();
    }
    return KeyManager.instance;
  }

  /**
   * Generate EC P-256 key pair
   */
  private generateKeys(): void {
    const keyPair = crypto.generateKeyPairSync("ec", {
      namedCurve: this.curve,
    }) as { publicKey: crypto.KeyObject; privateKey: crypto.KeyObject };

    const publicJWK = this.publicKeyToJWK(keyPair.publicKey);
    const kid = this.generateKeyId();

    this.keyPair = {
      privateKey: keyPair.privateKey,
      publicJWK: {
        ...publicJWK,
        kid,
        alg: "ES256",
        use: "sig",
      },
      kid,
    };
  }

  /**
   * Convert public key to JWK format
   */
  private publicKeyToJWK(publicKey: crypto.KeyObject): JWK {
    const publicKeyDer = publicKey.export({ format: "der", type: "spki" }) as Buffer;
    
    // For P-256, extract x and y coordinates (65 bytes: 0x04 || x (32 bytes) || y (32 bytes))
    // We need to parse the DER-encoded SPKI structure
    const coordinates = this.extractECCoordinates(publicKeyDer);

    return {
      kty: "EC",
      crv: "P-256",
      x: coordinates.x,
      y: coordinates.y,
    };
  }

  /**
   * Extract x and y coordinates from DER-encoded EC public key
   * This is a helper to parse SPKI format for P-256
   */
  private extractECCoordinates(derKey: Buffer): { x: string; y: string } {
    // For P-256 SPKI, the public key is at a fixed offset
    // SPKI structure: SEQUENCE { AlgorithmIdentifier, BIT STRING (public key bytes) }
    // The actual public key bytes are: 0x04 || x (32 bytes) || y (32 bytes)
    
    // Find the BIT STRING containing the public key
    let publicKeyOffset = 0;
    
    // Skip SEQUENCE tag and length
    let offset = 2; // Skip 0x30 tag and length byte
    if (derKey[2] > 127) offset += 1; // Multi-byte length
    
    // Skip AlgorithmIdentifier SEQUENCE
    offset += derKey[offset] + 2; // Skip SEQUENCE tag, length, and contents
    
    // Skip BIT STRING tag and length
    offset += 2; // 0x03 tag and length
    if (derKey[offset] > 127) offset += 1; // Multi-byte length
    offset += 1; // Skip unused bits indicator
    
    // Now we're at the 0x04 indicator for uncompressed point
    const publicKeyBytes = derKey.slice(offset + 1); // Skip 0x04
    
    const x = publicKeyBytes.slice(0, 32);
    const y = publicKeyBytes.slice(32, 64);
    
    return {
      x: x.toString("base64url"),
      y: y.toString("base64url"),
    };
  }

  /**
   * Generate a unique key ID
   */
  private generateKeyId(): string {
    return crypto.randomBytes(8).toString("hex");
  }

  /**
   * Get the current key pair
   */
  getKeyPair(): KeyPair {
    if (!this.keyPair) {
      throw new Error("KeyManager not initialized");
    }
    return this.keyPair;
  }

  /**
   * Get the public JWK
   */
  getPublicJWK(): JWK {
    return this.getKeyPair().publicJWK;
  }

  /**
   * Get the private key for signing
   */
  getPrivateKey(): crypto.KeyObject {
    return this.getKeyPair().privateKey;
  }

  /**
   * Get key ID
   */
  getKeyId(): string {
    return this.getKeyPair().kid;
  }

  /**
   * Sign data with private key
   */
  sign(data: Buffer): Buffer {
    const sign = crypto.createSign(this.hashAlgorithm);
    sign.update(data);
    return sign.sign(this.getPrivateKey());
  }

  /**
   * Verify signature (for testing)
   */
  verify(data: Buffer, signature: Buffer): boolean {
    const verify = crypto.createVerify(this.hashAlgorithm);
    verify.update(data);
    return verify.verify(this.getPublicJWK() as any, signature);
  }
}

export default KeyManager;
