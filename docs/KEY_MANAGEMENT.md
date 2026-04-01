# Key Management

This document explains how cryptographic keys are managed in ERICA and how to add new keys for testing different scenarios.

## Overview

ERICA uses fixed, deterministic test keys for signing credentials and validating presentations. All keys are stored in `src/simulator/TestKeys.ts` and are strictly for **testing purposes only** — never use these in production.

## Current Key Setup

### Issuer Key

**Location**: `src/simulator/TestKeys.ts` → `ISSUER_KEY`

```typescript
export const ISSUER_KEY: TestKeyPair = {
  publicKeyJwk: {
    kty: "EC",           // Key type: Elliptic Curve
    crv: "P-256",        // Curve: P-256 (ES256)
    x: "C2WRkgDyibUC44F08yBdCbJQ5SaWfUszz0QZJUktZk4",
    y: "IcjvvTUcOo7_2GciKcvAthusRsJIZ159_FO4gESGl_Q",
    kid: "issuer-test-key-1",  // Key ID
  },
  privateKeyJwk: {
    kty: "EC",
    crv: "P-256",
    x: "...",
    y: "...",
    d: "gp7KYg8lFnSjcY3wo54CKoQsn9T7p9Mgxe6xTVpYZq0",  // Private component
    kid: "issuer-test-key-1",
  },
};
```

**Purpose**: Signs PID (Personal Identification Data) credentials as an SD-JWT issuer

**Algorithm**: ES256 (ECDSA with P-256 curve and SHA-256)

**Spec Reference**: [SD-JWT §4.2](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-selective-disclosure-jwt), [HAIP §3.1](https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html#section-3.1)

### Holder Key

**Location**: `src/simulator/TestKeys.ts` → `HOLDER_KEY`

```typescript
export const HOLDER_KEY: TestKeyPair = {
  publicKeyJwk: { /* ... */ },
  privateKeyJwk: { /* ... */ },
};
```

**Purpose**: Used for holder binding in key-binding JWTs (KB-JWT)

When the wallet signs a presentation response, it includes a KB-JWT that binds the presentation to:
- The nonce from the request
- The audience (relying party)
- The wallet's holder key

This proves that the holder (wallet) is responding to this specific request.

**Algorithm**: ES256

**Spec Reference**: [OpenID4VP §5.2](https://openid.net/specs/openid4vc-core-1_0.html#section-5.2), [HAIP §3.1](https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html#section-3.1)

## Key File Format

### TestKeyPair Interface

```typescript
export interface TestKeyPair {
  publicKeyJwk: {
    kty: string;           // "EC"
    crv: string;           // "P-256"
    x: string;             // Public X coordinate (base64url)
    y: string;             // Public Y coordinate (base64url)
    kid?: string;          // Optional key ID
  };
  privateKeyJwk: {
    kty: string;
    crv: string;
    x: string;
    y: string;
    d: string;             // Private key component (base64url)
    kid?: string;
  };
}
```

**Format**: JWK (JSON Web Key) - [RFC 7517](https://tools.ietf.org/html/rfc7517)

**Encoding**: All key components (x, y, d) are base64url-encoded

## Adding a New Key

### Step 1: Generate a P-256 Key Pair

Using Node.js crypto:

```bash
node -e "
const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256'
});

const pubDer = publicKey.export({ format: 'der', type: 'spki' });
const privDer = privateKey.export({ format: 'der', type: 'pkcs8' });

const pubJwk = crypto.createPrivateKey(privDer).publicKeyObject.export({ format: 'jwk' });
const privJwk = crypto.createPrivateKey(privDer).export({ format: 'jwk' });

console.log(JSON.stringify({ publicKeyJwk: pubJwk, privateKeyJwk: privJwk }, null, 2));
"
```

Or using OpenSSL:

```bash
# Generate P-256 private key
openssl ecparam -name prime256v1 -genkey -noout -out private.key

# Convert to JWK format
# (Requires additional tools or manual conversion)
```

Or using an online JWK generator at [jwk.io](https://jwk.io/):
1. Click "Generate"
2. Select "EC", "P-256"
3. Copy the generated JWK

### Step 2: Add to TestKeys.ts

```typescript
/**
 * ES256 (P-256) test key pair for [purpose]
 * Used for [what this key signs/validates]
 * Generated on [date]
 */
export const CUSTOM_KEY_NAME: TestKeyPair = {
  publicKeyJwk: {
    kty: "EC",
    crv: "P-256",
    x: "[your-x-coordinate]",
    y: "[your-y-coordinate]",
    kid: "custom-key-1",  // Unique identifier
  },
  privateKeyJwk: {
    kty: "EC",
    crv: "P-256",
    x: "[your-x-coordinate]",
    y: "[your-y-coordinate]",
    d: "[your-private-component]",
    kid: "custom-key-1",
  },
};
```

### Step 3: Export from Index

Update `src/simulator/index.ts` to export the new key:

```typescript
export { ISSUER_KEY, HOLDER_KEY, CUSTOM_KEY_NAME } from "./TestKeys.js";
```

### Step 4: Use in Simulator

Update `src/simulator/WalletSimulator.ts` or `src/simulator/CredoSDJWTGenerator.ts` to use the new key:

```typescript
import { CUSTOM_KEY_NAME } from "./TestKeys.js";

// In your signing logic:
const signer = await importJWK(CUSTOM_KEY_NAME.privateKeyJwk, "ES256");
const signed = await new CompactSign(/*...*/)
  .setProtectedHeader({ alg: "ES256", kid: CUSTOM_KEY_NAME.privateKeyJwk.kid })
  .sign(signer);
```

### Step 5: Test

Run the existing test suite to verify the key integrates correctly:

```bash
npm run test:core
```

Write a test specifically for your new key:

```typescript
import { CUSTOM_KEY_NAME } from "./TestKeys.js";

test("CUSTOM_KEY_NAME signs and verifies correctly", async () => {
  const signer = await importJWK(CUSTOM_KEY_NAME.privateKeyJwk, "ES256");
  const verifier = await importJWK(CUSTOM_KEY_NAME.publicKeyJwk, "ES256");
  
  // Generate a simple JWT and verify signature
  const token = await new CompactSign(/*...*/).sign(signer);
  const verified = await compactVerify(token, verifier);
  
  expect(verified).toBeDefined();
});
```

## Using Different Keys in Simulation

### For Testing Invalid Signatures

Create a variant key (different private key, same public key) and update `WalletSimulator.ts`:

```typescript
export const INVALID_SIGNATURE_KEY: TestKeyPair = {
  // Same public key as HOLDER_KEY but different private key
  publicKeyJwk: HOLDER_KEY.publicKeyJwk,
  privateKeyJwk: {
    // Different private component
    kty: "EC",
    crv: "P-256",
    x: HOLDER_KEY.publicKeyJwk.x,
    y: HOLDER_KEY.publicKeyJwk.y,
    d: "[different-private-component]",
    kid: "invalid-signature-key",
  },
};
```

Then in simulation mode `INVALID_SIGNATURE`:

```typescript
case SimulationMode.INVALID_SIGNATURE:
  signer = await importJWK(INVALID_SIGNATURE_KEY.privateKeyJwk, "ES256");
  break;
```

### For Testing Wrong Issuer Scenario

```typescript
export const WRONG_ISSUER_KEY: TestKeyPair = { /* ... */ };

case SimulationMode.WRONG_ISSUER:
  signer = await importJWK(WRONG_ISSUER_KEY.privateKeyJwk, "ES256");
  break;
```

## Certificate Chains

For MVP, ERICA uses single keys. To support certificate chains:

1. Generate an issuer certificate (self-signed for testing)
2. Generate intermediate and leaf certificates
3. Store as PEM in `src/simulator/TestKeys.ts`:

```typescript
export const ISSUER_CERT_CHAIN = `
-----BEGIN CERTIFICATE-----
[base64-encoded-certificate]
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
[intermediate-cert]
-----END CERTIFICATE-----
`;
```

4. Use in validation:

```typescript
import { ISSUER_CERT_CHAIN } from "./TestKeys.js";

// In PresentationResponseValidator.ts:
const certChain = ISSUER_CERT_CHAIN.split('\n\n').filter(c => c.trim());
const validated = await validateCertChain(certChain, trustedRoots);
```

**Note**: Full certificate chain validation is Phase 2 backlog.

## Security Notes

⚠️ **CRITICAL: Test Keys Only**

- These keys are publicly available in the repository
- **Never** use these keys to sign real credentials
- **Never** use these keys in production systems
- For production, use a Hardware Security Module (HSM) or Key Management Service (KMS)

### Generating Production Keys

```bash
# Generate a production ES256 key
openssl ecparam -name prime256v1 -genkey -noout -out production-key.pem

# Store securely (e.g., in AWS KMS, Azure Key Vault, HashiCorp Vault)
# Access via environment variables or secret management service

# Never commit production keys to git
echo "production-key.pem" >> .gitignore
```

## Key Rotation

For testing key rotation scenarios:

1. Generate a new key using Step 1
2. Add to `TestKeys.ts` with version suffix: `ISSUER_KEY_V2`
3. Create a test scenario:

```typescript
case SimulationMode.OLD_KEY:
  signer = await importJWK(ISSUER_KEY.privateKeyJwk, "ES256");
  break;

case SimulationMode.NEW_KEY:
  signer = await importJWK(ISSUER_KEY_V2.privateKeyJwk, "ES256");
  break;
```

4. In validation, test that the validator can handle both keys (or reject old ones):

```typescript
const validKeys = [
  ISSUER_KEY.publicKeyJwk,
  ISSUER_KEY_V2.publicKeyJwk,  // New key
];
```

## Reference

- [RFC 7517: JSON Web Key (JWK)](https://tools.ietf.org/html/rfc7517)
- [RFC 7518: JSON Web Algorithms (JWA)](https://tools.ietf.org/html/rfc7518)
- [SD-JWT Specification §4](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-selective-disclosure-jwt#section-4)
- [OpenID4VP HAIP §3.1 Key Binding](https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html#section-3.1)

