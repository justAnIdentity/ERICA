# Validation Checklist

Quick reference showing which validation checks are implemented where in the codebase and their corresponding spec references.

## Request Validation Checks

### Cryptography & Key Binding

| # | Check | File | Spec Reference | Description |
|---|---|---|---|---|
| 1 | response_uri HTTPS | PresentationRequestValidator.ts:487-520 | OpenID4VP Section 5 | response_uri must be HTTPS URL |
| 2 | response_uri format | PresentationRequestValidator.ts:520-560 | OpenID4VP Section 5 | response_uri must be valid URL |
| 3 | Wallet holder key | WalletSimulator.ts:45-120 | OpenID4VP Section 5.2 | Response signed with wallet holder key |
| 4 | Signature algorithm valid | CredoSDJWTGenerator.ts:80-150 | HAIP Section 3.1 | Only ES256 for PID (SD-JWT key binding) |
| 5 | Request JWT Signature | PresentationRequestURLParser.ts:441-515 | OpenID4VP Section 6.1 | Verifies JWT request signature using x5c certificate public key |
| 6 | Trust Anchor Validation | PresentationRequestURLParser.ts:712-789 | EUDI ARF Trust Model | Validates RP Access Certificate against Registrar trust list |

### Nonce & State

| # | Check | File | Spec Reference | Description |
|---|---|---|---|---|
| 7 | Nonce present | PresentationRequestValidator.ts:300-320 | OpenID4VP Section 6.1 | Nonce must be present in request |
| 8 | Nonce format | PresentationRequestValidator.ts:320-340 | OpenID4VP Section 6.1 | Nonce must be string, min length |
| 9 | State present | PresentationRequestValidator.ts:350-370 | OpenID4VP Section 5 | State parameter present |
| 10 | Nonce match in response | PresentationResponseValidator.ts:200-250 | OpenID4VP Section 6.1 | Response nonce matches request nonce |

### DCQL Query Format

| # | Check | File | Spec Reference | Description |
|---|---|---|---|---|
| 11 | dcql_query present | PresentationRequestValidator.ts:85-110 | HAIP Section 3.2 | dcql_query object must exist |
| 12 | credentials array non-empty | PresentationRequestValidator.ts:110-135 | HAIP Section 3.2 | credentials array must have at least one entry |
| 13 | credential id present | PresentationRequestValidator.ts:140-160 | HAIP Section 3.2 | Each credential must have id field |
| 14 | credential format valid | PresentationRequestValidator.ts:165-190 | HAIP Section 3.2 | Format must be dc+sd-jwt for PID |
| 15 | claims object valid | PresentationRequestValidator.ts:195-220 | HAIP Section 3.2 | Claims object structure valid |

### Client ID & RP Validation

| # | Check | File | Spec Reference | Description |
|---|---|---|---|---|
| 16 | client_id present | PresentationRequestValidator.ts:250-270 | OpenID4VP Section 5 | client_id must be present |
| 17 | client_id format | PresentationRequestValidator.ts:270-290 | OpenID4VP Section 5 | client_id must be valid URL |
| 18 | client_id scheme validation | ClientIDValidator.ts:45-120 | OpenID4VP Section 5.3 | Validates client_id scheme (https, x509_san_dns, x509_san_uri) |
| 19 | client_id HTTPS check | ClientIDValidator.ts:130-180 | OpenID4VP Section 5.3 | For https scheme, validates domain and prevents SSRF |
| 20 | client_id X.509 SAN validation | ClientIDValidator.ts:190-250 | OpenID4VP Section 5.3.2 | For x509_san_* schemes, validates certificate SAN matches |

## Response Validation Checks

### VP Token Validation

| # | Check | File | Spec Reference | Description |
|---|---|---|---|---|
| 21 | vp_token present | PresentationResponseValidator.ts:80-100 | OpenID4VP Section 6.1 | vp_token must be present in response |
| 22 | vp_token format | PresentationResponseValidator.ts:100-130 | OpenID4VP Section 6.1 | vp_token must be valid JWT format |
| 23 | VP signature valid | PresentationResponseValidator.ts:260-320 | OpenID4VP Section 6.1 | Verifies cryptographic signature on VP token |

### Credential Validation

| # | Check | File | Spec Reference | Description |
|---|---|---|---|---|
| 24 | Required claims present | PresentationResponseValidator.ts:350-400 | HAIP Section 2.2 | All required PID claims present |
| 25 | Credential not expired | PresentationResponseValidator.ts:410-450 | SD-JWT Section 4.2 | exp claim is in future |
| 26 | Credential format matches | PresentationResponseValidator.ts:460-490 | HAIP Section 3.2 | Format matches request (dc+sd-jwt) |
| 27 | SD-JWT structure valid | CredoSDJWTGenerator.ts:200-280 | SD-JWT Section 5 | SD-JWT has valid structure (issuer-signed~disclosures~kb-jwt) |
| 28 | Selective disclosure valid | CredoSDJWTGenerator.ts:290-350 | SD-JWT Section 6 | Disclosed claims match request |

## Simulation Mode Coverage

### Implemented Modes

| # | Mode | File | Description |
|---|---|---|---|
| 1 | VALID | WalletSimulator.ts:150-200 | Fully compliant response |
| 2 | EXPIRED | WalletSimulator.ts:210-230 | Credential with exp in past |
| 3 | NOT_YET_VALID | WalletSimulator.ts:235-255 | Credential with nbf in future |
| 4 | INVALID_SIGNATURE | WalletSimulator.ts:260-290 | Tampered signature |
| 5 | MISSING_SIGNATURE | WalletSimulator.ts:295-310 | No signature present |
| 6 | MISSING_CLAIMS | WalletSimulator.ts:315-340 | Required claims missing |
| 7 | OVER_DISCLOSURE | WalletSimulator.ts:345-370 | More claims than requested |
| 8 | WRONG_NONCE | WalletSimulator.ts:375-395 | Nonce mismatch |
| 9 | MISSING_HOLDER_BINDING | WalletSimulator.ts:400-420 | No KB-JWT present |
| 10 | WRONG_AUDIENCE | WalletSimulator.ts:425-445 | Audience claim mismatch |

### Planned Modes (Not Yet Implemented)

| # | Mode | Status | Description |
|---|---|---|---|
| 11 | MODIFIED_CLAIMS | Planned | Tampered claim values (requires semantic validation) |
| 12 | FORMAT_MISMATCH | Planned | Wrong credential format (mDoc instead of SD-JWT) |
| 13 | MALFORMED_SD_JWT | Planned | Invalid SD-JWT structure |
| 14 | WRONG_ISSUER | Planned | Incorrect issuer DID/URL (requires issuer validation) |
| 15 | WRONG_CREDENTIAL_TYPE | Planned | Incorrect vct value (requires vct validation) |

## Trust Infrastructure

| Component | File | Description |
|---|---|---|
| TrustListManager | src/security/TrustListManager.ts | Validates RP Access Certificates against Registrar trust list |
| CertificateManager | src/security/CertificateManager.ts | Manages stable PID issuer certificates |
| Registrar Trust List | src/security/trustlist/registrar.jwt | Contains Registrar certificates for RP validation |
| Issuer Certificate | src/security/issuer/issuer-certificate.pem | Stable test PID issuer certificate |
| Issuer Private Key | src/security/issuer/issuer-private-key.pem | Stable test PID issuer private key (PKCS#8) |
