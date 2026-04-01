/**
 * Fixed test keys for SD-JWT generation
 * These are deterministic keys for testing purposes only
 * DO NOT use in production!
 */

export interface TestKeyPair {
  publicKeyJwk: {
    kty: string;
    crv: string;
    x: string;
    y: string;
    kid?: string;
  };
  privateKeyJwk: {
    kty: string;
    crv: string;
    x: string;
    y: string;
    d: string;
    kid?: string;
  };
}

/**
 * Fixed ES256 (P-256) test key pair for issuer
 * This key is used to sign PID credentials
 * Generated with Node.js crypto.generateKeyPairSync
 */
export const ISSUER_KEY: TestKeyPair = {
  publicKeyJwk: {
    kty: "EC",
    crv: "P-256",
    x: "C2WRkgDyibUC44F08yBdCbJQ5SaWfUszz0QZJUktZk4",
    y: "IcjvvTUcOo7_2GciKcvAthusRsJIZ159_FO4gESGl_Q",
    kid: "issuer-test-key-1",
  },
  privateKeyJwk: {
    kty: "EC",
    crv: "P-256",
    x: "C2WRkgDyibUC44F08yBdCbJQ5SaWfUszz0QZJUktZk4",
    y: "IcjvvTUcOo7_2GciKcvAthusRsJIZ159_FO4gESGl_Q",
    d: "gp7KYg8lFnSjcY3wo54CKoQsn9T7p9Mgxe6xTVpYZq0",
    kid: "issuer-test-key-1",
  },
};

/**
 * Fixed ES256 (P-256) test key pair for holder
 * This key is used for holder binding (KB-JWT)
 * Generated with Node.js crypto.generateKeyPairSync
 */
export const HOLDER_KEY: TestKeyPair = {
  publicKeyJwk: {
    kty: "EC",
    crv: "P-256",
    x: "P56_fStEQOoKJZGJI8j9mKliCuwjgSXoz3Al08iNpQs",
    y: "5TUBP-ayVF7WX5B4O5OZWIv6BVDvamsRT_5zYF6pjEQ",
    kid: "holder-test-key-1",
  },
  privateKeyJwk: {
    kty: "EC",
    crv: "P-256",
    x: "P56_fStEQOoKJZGJI8j9mKliCuwjgSXoz3Al08iNpQs",
    y: "5TUBP-ayVF7WX5B4O5OZWIv6BVDvamsRT_5zYF6pjEQ",
    d: "KRgEpBQKd6I4MFLWOA8DNJKq3Flb_LrRZ4uAH4PE0os",
    kid: "holder-test-key-1",
  },
};

/**
 * Alternate issuer key for INVALID_SIGNATURE simulation mode
 * This key is used to create a signature that doesn't match the ISSUER_KEY
 * When a verifier checks the signature with ISSUER_KEY, it will fail
 */
export const INVALID_SIGNATURE_KEY: TestKeyPair = {
  publicKeyJwk: {
    kty: "EC",
    crv: "P-256",
    x: "WKn-ZIGevcwGIyyrzFoZNBdaq9_TsqzGl96oc9LDZGA",
    y: "y77t-RvAHRKTsSGdIYUfweuOvwrvDD-Q3Hv5J0fQiLI",
    kid: "invalid-signature-test-key-1",
  },
  privateKeyJwk: {
    kty: "EC",
    crv: "P-256",
    x: "WKn-ZIGevcwGIyyrzFoZNBdaq9_TsqzGl96oc9LDZGA",
    y: "y77t-RvAHRKTsSGdIYUfweuOvwrvDD-Q3Hv5J0fQiLI",
    d: "Hndv23dBBTmIy4EfkwhYxF8K2kVGtXBAK3kqKSLQULc",
    kid: "invalid-signature-test-key-1",
  },
};

/**
 * Issuer URL for the debug tool
 */
export const ISSUER_DID = "https://debugger.eudi-wallet-demo.example";

/**
 * DID for the holder (wallet)
 */
export const HOLDER_DID = "did:example:holder:wallet";
