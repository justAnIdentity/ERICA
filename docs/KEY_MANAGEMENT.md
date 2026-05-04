# Key Management

Reference for cryptographic keys and certificates used in ERICA.

## Certificate and Key Types

### 1. PID Issuer Certificate (Stable)

**Location**: `src/security/issuer/`
- `issuer-certificate.pem` - X.509 certificate
- `issuer-private-key.pem` - PKCS#8 private key

**Managed by**: `CertificateManager` singleton

**Purpose**: Signs PID credentials. RPs can add this to their test trust lists.

**Details**:
- Subject: `CN=Test PID Issuer (DO NOT USE IN PRODUCTION), O=EUDI VP Debugger - TEST ONLY`
- Algorithm: ES256 (ECDSA P-256)
- Validity: 10 years
- Format: X.509 PEM

**API**: `GET /api/issuer/trust-anchor` returns certificate for RP configuration

**Security**: Both certificate and private key are committed to git and marked test-only. Never use in production.

### 2. Holder Key (Dynamic)

**Location**: Generated at runtime by `WalletSimulator`

**Purpose**: Signs key-binding JWTs (KB-JWT) to bind presentation to specific request

**Algorithm**: ES256

**Generation**: Uses `jose` library's `generateKeyPair('ES256')`

### 3. RP Access Certificates (Trust List)

**Location**: `src/security/trustlist/registrar.jwt`

**Managed by**: `TrustListManager` singleton

**Purpose**: Contains Registrar certificates for validating RP Access Certificates in `x5c` headers

**Format**: JWT with TrustedEntitiesList

**Trust Model**: Orchestrator issues both Registrar certificates (in trust list) and Access Certificates (to RPs). Wallet validates Access Cert by verifying its signature matches a Registrar cert from the trust list.

## Regenerating PID Issuer Certificate

### Using OpenSSL

```bash
cd src/security/issuer

# Generate P-256 private key
openssl ecparam -name prime256v1 -genkey -noout -out temp-ec.pem

# Convert to PKCS#8
openssl pkcs8 -topk8 -nocrypt -in temp-ec.pem -out issuer-private-key.pem

# Generate self-signed certificate (10 years)
openssl req -new -x509 -key issuer-private-key.pem \
  -out issuer-certificate.pem \
  -days 3650 \
  -subj "/CN=Test PID Issuer (DO NOT USE IN PRODUCTION)/O=EUDI VP Debugger - TEST ONLY/C=DE"

# Clean up
rm temp-ec.pem
```

After regeneration:
1. RPs must update trust lists with new certificate
2. Previously issued credentials become invalid
3. Rebuild project: `npm run build:core`

## Adding Test Keys for Simulation

For test scenarios requiring specific keys, generate JWK using Node.js:

```bash
node -e "
const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256'
});

const pubJwk = publicKey.export({ format: 'jwk' });
const privJwk = privateKey.export({ format: 'jwk' });

console.log(JSON.stringify({ publicKeyJwk: pubJwk, privateKeyJwk: privJwk }, null, 2));
"
```

Add to test files as needed for simulation modes.

## Key Rotation Testing

To test key rotation scenarios:

1. Generate new key pair
2. Add with versioned name (e.g., `ISSUER_KEY_V2`)
3. Update simulation mode to use old or new key
4. Verify validator handles both or rejects old keys as expected

## References

- [RFC 7517: JSON Web Key (JWK)](https://tools.ietf.org/html/rfc7517)
- [RFC 7518: JSON Web Algorithms (JWA)](https://tools.ietf.org/html/rfc7518)
- [SD-JWT Specification](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-selective-disclosure-jwt)
- [OpenID4VP HAIP](https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html)
