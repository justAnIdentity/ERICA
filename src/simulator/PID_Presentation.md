# Implementer guide — implementing PID presentations with OpenID4VP

> Audience: Relying Parties implementing an OpenID4VP flow to enable the consumption of a PID credential in the German EUDI Wallet Ecosystem.

---

## Contents

1. Introduction
2. Concepts and Validation Layers
3. Building a PID Presentation Request
4. Interpreting the PID Presentation Response

---

## 1. Introduction

This guide targets implementers of OpenID4VP to support PID presentations in the German EUDI Ecosystem. 
Following this short introduction, Chapter 2 explains the security concepts and validation layers that make PID presentations trustworthy. Chapter 3 shows the structure of a PID Presentation Request and how to construct one correctly. Chapter 4 explains the response structure and provides a complete validation checklist.

The specification that forms the basis for this documentation can be found in the [Blueprint for the German EUDI Wallet Ecosystem](https://bmi.usercontent.opencode.de/eudi-wallet/wallet-development-documentation-public/architecture-concept/flows/22-pid-presentation/#detailed-description).

Throughout this guide, rules or optionality specific to Germany will be called out. Notes have been added with information specific to Sandbox participation. 

## 2. Concepts and Validation Layers

This chapter explains the foundations of PID (Person Identification Data) presentation as defined by the ARF PID Rulebook and realized through the OpenID4VP High Assurance Interoperability Profile (HAIP). It covers the security concepts that make PID presentations trustworthy, then explains the validation layers that implement these concepts in practice.

### 2.1 Trust Anchors and Governance

Everything in PID verification begins with the trust framework. Before any cryptographic validation is done, the verifier must know which issuers it is allowed to trust and which certificate hierarchies govern PID issuance. This prevents the acceptance of PID data from unrecognized or malicious sources. In the eIDAS context, this usually means the use of trust lists.

!!! info "German PID Provider"
    In Germany, there is only one PID Provider (Bundesdruckerei).
    For the purpose of Sandbox testing, we provide [mock trust lists](https://bmi.usercontent.opencode.de/eudi-wallet/test-trust-lists/)


### 2.2 Authenticity of PID Credentials

Once trust anchors are known, the verifier evaluates whether the PID itself was authentically issued. PIDs include signatures created by the issuing authority. Validating these signatures against the keys from the trust framework establishes that the data presented by the wallet corresponds to a genuine PID record and has not been modified since issuance. This ensures that the identifier information originates from the correct governmental entity and is in an unaltered state.

### 2.3 Holder Binding

Even if the PID was authentically issued, the verifier must ensure that the wallet instance presenting it is the same wallet that the PID was issued into. This is called Holder Binding or Key Binding. A detailed discussion can be found in the [SD-JWT specification](https://www.rfc-editor.org/rfc/rfc9901.html#name-key-binding-2); it is applicable in general to all credential formats.

During the presentation, the wallet signs the presented credential along with information bound to the particular presentation (see below) in the VP Token. The signature is performed with a private key that is tied to the secure wallet instance and for which the corresponding public key is contained in the Issuer-signed credential. This ensures the presentation comes from a valid wallet on a valid device, not from an exported credential or a cloned environment.

Without holder binding, an intercepted presentation, a malicious verifier, a cloned backup, or a compromised device could be used to impersonate someone. The holder-binding bridges the gap between "this is a valid PID" and "this PID is being presented by the right person". The signature produced by the wallet cannot be replayed or forged without access to the protected key material.



### 2.4 Session and Transaction Binding

A high-assurance PID presentation must be tied explicitly to the verifier’s session. The verifier generates a cryptographically strong nonce and embeds it in the presentation request. The wallet then includes this nonce in the proof-of-possession signature along with information about the verifier's identity and a timestamp. When the verifier later validates the response, it confirms that the presentation is fresh and could only have been created in response to its own request, mitigating phishing and replay attacks.

### 2.5 Selective Disclosure and Data Minimization

The ARF mandates that verifiers request only the attributes they genuinely need. HAIP and the underlying credential formats (SD-JWT or mDoc) allow the wallet to disclose only these attributes selectively. The verifier cannot collect anything outside its stated purpose, and over disclosed elements should be ignored.

#### Validation Philosophy

Validation should follow a fail-fast, layered approach:

- Foundational checks first (trust, transport, session binding)
- Cryptographic assurance next (credential validity, holder binding)
- Privacy and policy enforcement next (selective disclosure)
- Business logic last

If any layer fails, validation should stop immediately. Continuing after a critical failure increases attack surface and risks incorrect authorization decisions.

---

#### Layer 1: Trust and Transport

Before interpreting any protocol data, the verifier must establish a trusted baseline.

At this layer, the verifier conceptually validates that:
- Trust anchors for PID issuers and wallet providers are loaded from an official, trusted registry
- Trust lists are authentic, fresh, and correctly parsed
- Communication occurs over secure transport (HTTPS with valid TLS)
- The received payload is of the expected type and within reasonable size limits

---

#### Layer 2: Session Binding

The verifier must ensure that the response is cryptographically bound to its own request.

At this layer, the verifier validates that:
- A nonce is present and exactly matches the verifier-issued nonce
- The audience (`aud`) identifies the verifier and matches the request
- Timestamps (`iat`, `exp`) are present, valid, and within an acceptable freshness window

This layer prevents replay attacks, phishing, and cross-session injection.

---

#### Layer 3: Holder Binding

Even a valid PID credential is insufficient unless it is presented by its rightful holder.

At this layer, the verifier conceptually validates that:

- A proof-of-possession mechanism is present
- The proof is cryptographically valid
- The proof binds the presentation to the verifier’s nonce, the verifier’s identifier (audience), and the presented credential.
- The signing key is correctly associated with the PID’s holder binding mechanism

---

#### Layer 4: Credential Assurance

The verifier must confirm that the presented PID credential itself is genuine and valid.

At this layer, the verifier validates that:

- A PID credential is present and extractable from the presentation
- The credential format is supported (SD-JWT or mDoc)
- Issuer signatures are valid
- The issuer is trusted according to the loaded trust anchors
- The credential is within its validity period and not revoked
- The credential type matches what was requested

#### Layer 5: Selective Disclosure and Data Minimization

PID verification is subject to strict data minimization requirements.

At this layer, the verifier validates that:

- Only attributes explicitly requested are disclosed
- All mandatory attributes for the transaction are present
- No additional credentials are included
- The disclosed credential combination matches one of the allowed credential sets

---

#### Layer 6: Business Rules and Policy Enforcement

Only after all assurance layers succeed should the verifier apply business logic.

At this layer, the verifier validates that:

- Required attributes are present and usable
- Attribute values satisfy business requirements
- Data quality and completeness meet application expectations
- A clear authorization- and or business decision can be derived and audited


!!! Info "Wallet Integrity"

  Wallet integrity is established during the issuance process through a Wallet Unit Attestation. The issuer ensures that the PID is only issued into valid wallets. During presentation, the verifier relies on that established trust implicitly.

---


## 3. Building a PID Presentation Request

This chapter explains the structure of a PID Presentation Request and how to construct one correctly. It covers what a wallet receives when it calls a `request_uri` and how to understand a HAIP-aligned PID Presentation Request. The examples below are illustrative but structurally realistic for the German PID profile.

---

### 3.1 HTTPS Response When Dereferencing `request_uri`

When the wallet fetches the Presentation Request referenced by the `request_uri`, the verifier responds with a JSON object containing the actual Presentation Request. In HAIP-aligned deployments, this request is typically a pushed signed request object (PAR).

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store
Pragma: no-cache

{
eyJ0eXAiOiJvYXV0aC1hdXRoei1yZXErand0IiwiYWxnIjoiRVMyNTYiLCJ4NWMiOlsiTUlJQ2N6Q0NBaGlnQXdJQkFnSVVPeEQ3SkZrS1lnRlBrOEozWm1Tc0VDMkJIazR3Q2dZSUtvWkl6ajBFQXdJd0tERUxNQWtHQTFVRUJoTUNSRVV4R1RBWEJnTlZCQU1NRUVkbGNtMWhiaUJTWldkcGMzUnlZWEl3SGhjTk1qWXdNVEkzTURreU9ETTFXaGNOTWpjd01USTNNRGt5T0RNMVdqQmZNUXN3Q1FZRFZRUUdFd0pFUlRFWU1CWUdBMVVFQ2d3UFJWVkVTU0JRYkdGNVozSnZkVzVrTVJ3d0dnWURWUVJoREJORVJTNDBPRGN6TlRKRE1FWTJNVGN4UTBRek1SZ3dGZ1lEVlFRRERBOUZWVVJKSUZCc1lYbG5jbTkxYm1Rd1dUQVRCZ2NxaGtqT1BRSUJCZ2dxaGtqT1BRTUJCd05DQUFSdEFiL3d2MXYyTXJHKzNDSE1sQmFnQXgwQ1NXL0IzNUZWQThkTC9DdjRYWG81ZU9xeHl0c1dlQThmbHFLamRhNjBnTTdnWVF4MUpWMEJ3akRQbVIwK280SG9NSUhsTUF3R0ExVWRFd0VCL3dRQ01BQXdIUVlEVlIwT0JCWUVGRXlpMG1VSFRnVmFCTDRHRS9ZeTlRQ1EvMXdHTUI4R0ExVWRJd1FZTUJhQUZLbkNvOW92YmF4VTdzNjVUdWdzeVN3QWc0QXpNQTRHQTFVZER3RUIvd1FFQXdJSGdEQVNCZ05WSFNVRUN6QUpCZ2NvZ1l4ZEJRRUdNQ1VHQTFVZEVRUWVNQnlDR25Cc1lYbG5jbTkxYm1RdVpYVmthUzEzWVd4c1pYUXViM0puTUVvR0ExVWRId1JETUVFd1A2QTlvRHVHT1doMGRIQnpPaTh2YzJGdVpHSnZlQzVsZFdScExYZGhiR3hsZEM1dmNtY3ZZWEJwTDNOMFlYUjFjeTF0WVc1aFoyVnRaVzUwTDJOeWJEQUtCZ2dxaGtqT1BRUURBZ05KQURCR0FpRUFrbmsydkd0MUw4cGU2RXR0elhKMlIxdHVlRm5kQ1RVNDJFYUlSbGo5MlRvQ0lRRGova0ZmcldpN2p5UXRLbVNLb3JIY0JsWGluV09uRGtXLzZwQU5tZ1hHZGc9PSJdfQ.eyJyZXNwb25zZV90eXBlIjoidnBfdG9rZW4iLCJjbGllbnRfaWQiOiJ4NTA5X2hhc2g6ZlF1b2JWd0p2MDAwdkRXY010cmlYUHpvMnNQVG01X01wMTBPODdsQ3FjRSIsInJlc3BvbnNlX3VyaSI6Imh0dHBzOi8vcGxheWdyb3VuZC5ldWRpLXdhbGxldC5vcmcvZXVkaXBsby8zYWE0NzA2Yy02ZjM1LTQ3YjgtOGEwNS02YTBhMzM0YzMwMWQvb2lkNHZwIiwicmVzcG9uc2VfbW9kZSI6ImRpcmVjdF9wb3N0Lmp3dCIsIm5vbmNlIjoiODVkNWUyNGEtNzE2My00ZTQ0LWEwZWQtOTRiZTk4Y2FiNjY2IiwiZGNxbF9xdWVyeSI6eyJjcmVkZW50aWFscyI6W3siaWQiOiJwaWQtc2Qtand0IiwiZm9ybWF0IjoiZGMrc2Qtand0IiwiY2xhaW1zIjpbeyJwYXRoIjpbImdpdmVuX25hbWUiXX0seyJwYXRoIjpbImZhbWlseV9uYW1lIl19LHsicGF0aCI6WyJiaXJ0aGRhdGUiXX0seyJwYXRoIjpbImFkZHJlc3MiLCJzdHJlZXRfYWRkcmVzcyJdfSx7InBhdGgiOlsiYWRkcmVzcyIsInBvc3RhbF9jb2RlIl19LHsicGF0aCI6WyJhZGRyZXNzIiwibG9jYWxpdHkiXX0seyJwYXRoIjpbImFkZHJlc3MiLCJjb3VudHJ5Il19LHsicGF0aCI6WyJuYXRpb25hbGl0aWVzIl19XSwibWV0YSI6eyJ2Y3RfdmFsdWVzIjpbInVybjpldWRpOnBpZDpkZToxIl19fSx7ImlkIjoicGlkLW1zby1tZG9jIiwiZm9ybWF0IjoibXNvX21kb2MiLCJjbGFpbXMiOlt7InBhdGgiOlsiZXUuZXVyb3BhLmVjLmV1ZGkucGlkLjEiLCJnaXZlbl9uYW1lIl19LHsicGF0aCI6WyJldS5ldXJvcGEuZWMuZXVkaS5waWQuMSIsImZhbWlseV9uYW1lIl19LHsicGF0aCI6WyJldS5ldXJvcGEuZWMuZXVkaS5waWQuMSIsImJpcnRoX2RhdGUiXX0seyJwYXRoIjpbImV1LmV1cm9wYS5lYy5ldWRpLnBpZC4xIiwicmVzaWRlbnRfc3RyZWV0Il19LHsicGF0aCI6WyJldS5ldXJvcGEuZWMuZXVkaS5waWQuMSIsInJlc2lkZW50X3Bvc3RhbF9jb2RlIl19LHsicGF0aCI6WyJldS5ldXJvcGEuZWMuZXVkaS5waWQuMSIsInJlc2lkZW50X2NpdHkiXX0seyJwYXRoIjpbImV1LmV1cm9wYS5lYy5ldWRpLnBpZC4xIiwicmVzaWRlbnRfY291bnRyeSJdfSx7InBhdGgiOlsiZXUuZXVyb3BhLmVjLmV1ZGkucGlkLjEiLCJuYXRpb25hbGl0eSJdfV0sIm1ldGEiOnsiZG9jdHlwZV92YWx1ZSI6ImV1LmV1cm9wYS5lYy5ldWRpLnBpZC4xIn19XSwiY3JlZGVudGlhbF9zZXRzIjpbeyJvcHRpb25zIjpbWyJwaWQtc2Qtand0Il0sWyJwaWQtbXNvLW1kb2MiXV19XX0sImNsaWVudF9tZXRhZGF0YSI6eyJqd2tzIjp7ImtleXMiOlt7Imt0eSI6IkVDIiwieCI6IlNoVTRGcjNOSDd2OVRPQWM5YVlpdTllaWNka2ZWVDllY1ZDUGFQZ0pyTXMiLCJ5IjoiaVYwVlhBU3lsUjBxV29Ecl9tS1VXd3pvLU01OVd6M1FCenBDbTRvaVhUMCIsImNydiI6IlAtMjU2IiwiYWxnIjoiRUNESC1FUyIsImtpZCI6ImE0MjBlZTgzLWVjZmEtNDRmYy1iYjE2LTgwMzIwZDg3Zjc0NSJ9XX0sInZwX2Zvcm1hdHNfc3VwcG9ydGVkIjp7Im1zb19tZG9jIjp7ImFsZyI6WyJFUzI1NiIsIkVkMjU1MTkiXX0sImRjK3NkLWp3dCI6eyJrYi1qd3RfYWxnX3ZhbHVlcyI6WyJFUzI1NiIsIkVkMjU1MTkiXSwic2Qtand0X2FsZ192YWx1ZXMiOlsiRVMyNTYiLCJFZDI1NTE5Il19fSwiZW5jcnlwdGVkX3Jlc3BvbnNlX2VuY192YWx1ZXNfc3VwcG9ydGVkIjpbIkExMjhHQ00iXX0sInN0YXRlIjoiM2FhNDcwNmMtNmYzNS00N2I4LThhMDUtNmEwYTMzNGMzMDFkIiwiYXVkIjoiaHR0cHM6Ly9zZWxmLWlzc3VlZC5tZS92MiIsImV4cCI6MTc2OTUxMzY5NywiaWF0IjoxNzY5NTEwMDk3fQ.2VHx61tIyHCisIXq3v_QoDpOxMBVHs7R5K0qOlIRwc5FgP-O0Q0qVhBgt6Sr-1SmN9u2jinH4Fx7lIav5J4p6g
}
```

The wallet receives a single signed request object (JAR) rather than individual parameters. The signature allows the wallet to verify authenticity, and cache-control headers prevent reuse.


### 3.2 Example PID Presentation Request (Decoded)

Below is the decoded content of the Presentation Request contained in the signed request object. Line breaks and formatting are added for readability. Each field is annotated with a number (1) that corresponds to the explanation table below.

```json
{
  "response_type": "vp_token",                          // (1)
  "client_id": "x509_hash:fQuobVwJv000vDWcMtriXPzo2sPTm5_Mp10O87lCqcE", // (2)
  "response_uri": "https://playground.eudi-wallet.org/eudiplo/3aa4706c-6f35-47b8-8a05-6a0a334c301d/oid4vp", // (3)
  "response_mode": "direct_post.jwt",                   // (4)
  "nonce": "85d5e24a-7163-4e44-a0ed-94be98cab666",        // (5)

  "dcql_query": {                                       // (6)
    "credentials": [
      {
        "id": "pid-sd-jwt",                              // (7)
        "format": "dc+sd-jwt",                           // (8)
        "claims": [                                     // (9)
          {"path": ["given_name"]},                      // (10)
          {"path": ["family_name"]},                     // (11)
          {"path": ["birthdate"]},                       // (12)
          {"path": ["address", "street_address"]},       // (13)
          {"path": ["address", "postal_code"]},          // (14)
          {"path": ["address", "locality"]},             // (15)
          {"path": ["address", "country"]},              // (16)
          {"path": ["nationalities"]}                    // (17)
        ],
        "meta": {
          "vct_values": ["urn:eudi:pid:de:1"]             // (18)
        }
      },
      {
        "id": "pid-mso-mdoc",                             // (19)
        "format": "mso_mdoc",                             // (20)
        "claims": [
          {"path": ["eu.europa.ec.eudi.pid.1", "given_name"]},      // (21)
          {"path": ["eu.europa.ec.eudi.pid.1", "family_name"]},     // (22)
          {"path": ["eu.europa.ec.eudi.pid.1", "birth_date"]},      // (23)
          {"path": ["eu.europa.ec.eudi.pid.1", "resident_street"]}, // (24)
          {"path": ["eu.europa.ec.eudi.pid.1", "resident_postal_code"]}, // (25)
          {"path": ["eu.europa.ec.eudi.pid.1", "resident_city"]},   // (26)
          {"path": ["eu.europa.ec.eudi.pid.1", "resident_country"]},// (27)
          {"path": ["eu.europa.ec.eudi.pid.1", "nationality"]}      // (28)
        ],
        "meta": {
          "doctype_value": "eu.europa.ec.eudi.pid.1"       // (29)
        }
      }
    ],
    "credential_sets": [
      {
        "options": [
          ["pid-sd-jwt"],                                 // (30)
          ["pid-mso-mdoc"]                                // (31)
        ]
      }
    ]
  },

  "client_metadata": {                                   // (32)
    "jwks": {
      "keys": [
        {
          "kty": "EC",                                   // (33)
          "crv": "P-256",                                // (34)
          "x": "ShU4Fr3NH7v9TOAc9aYiu9eicdkfVT9ecVCPaPgJrMs", // (35)
          "y": "iV0VXASylR0qWoDr_mKUWwzo-M59Wz3QBzpCm4oiXT0", // (36)
          "alg": "ECDH-ES",                               // (37)
          "kid": "a420ee83-ecfa-44fc-bb16-80320d87f745"    // (38)
        }
      ]
    },
    "vp_formats_supported": {                             // (39)
      "mso_mdoc": {
        "alg": ["ES256", "Ed25519"]                       // (40)
      },
      "dc+sd-jwt": {
        "kb-jwt_alg_values": ["ES256", "Ed25519"],        // (41)
        "sd-jwt_alg_values": ["ES256", "Ed25519"]         // (42)
      }
    },
    "encrypted_response_enc_values_supported": ["A128GCM"] // (43)
  },

  "state": "3aa4706c-6f35-47b8-8a05-6a0a334c301d",         // (44)
  "aud": "https://self-issued.me/v2",                     // (45)
  "exp": 1769513697,                                      // (46)
  "iat": 1769510097                                       // (47)
}
```

#### Field-by-Field Explanation

| #       | Field                                     |  Purpose               | Notes                                                                          |
| ------- | ----------------------------------------- |  --------------------- | ------------------------------------------------------------------------------ |
| (1)     | `response_type`                           |  Response type         | Must be `vp_token` for OpenID4VP.                                              |
| (2)     | `client_id`                               |  Verifier identifier   | Uses `x509_hash:` scheme per HAIP; hash binds request to verifier certificate. |
| (3)     | `response_uri`                            |  Response endpoint     | HTTPS endpoint where wallet posts the `vp_token`.                              |
| (4)     | `response_mode`                           |  Response delivery     | `direct_post.jwt` is mandatory for HAIP high-assurance flows.                  |
| (5)     | `nonce`                                   |  Session binding       | Cryptographically random value preventing replay attacks.                      |
| (6)     | `dcql_query`                              |  Credential query      | Defines which credentials and attributes are requested.                        |
| (7)     | `credentials[].id`                        |  Credential identifier | Used to reference credentials in `credential_sets`.                            |
| (8)     | `credentials[].format`                    |  Credential format     | `dc+sd-jwt` for SD-JWT VC format.                                              |
| (9)     | `claims`                                  |  Requested claims      | List of attributes to be selectively disclosed.                                |
| (10–17) | `claims[].path`                           |  Claim paths (SD-JWT)  | JSON path segments into the SD-JWT payload.                                    |
| (18)    | `meta.vct_values`                         |  Credential type       | Identifies German PID VC (`urn:eudi:pid:de:1`).                                |
| (19)    | `credentials[].id`                        |  Credential identifier | Identifier for mDoc PID request.                                               |
| (20)    | `credentials[].format`                    |  Credential format     | ISO/IEC 18013-5 mDoc format.                                                   |
| (21–28) | `claims[].path`                           |  Claim paths (SD-JWT)    | Namespace + attribute name as defined in PID mDoc profile.                     |
| (29)    | `meta.doctype_value`                      |  Document type         | Identifies the PID mDoc document type.                                         |
| (30)    | `credential_sets.options[0]`              |  Option 1              | Wallet may respond using mDOc PID.                                           |
| (31)    | `credential_sets.options[1]`              |  Option 2              | Wallet may respond using SD-JWT PID.                                             |
| (32)    | `client_metadata`                         |  Verifier metadata     | Provides encryption keys and supported formats.                                |
| (33)    | `jwks.keys[].kty`                         |  Key type              | Elliptic Curve key.                                                            |
| (34)    | `jwks.keys[].crv`                         |  Curve                 | P-256 curve (secp256r1).                                                       |
| (35)    | `jwks.keys[].x`                           |  Public key X          | Base64url-encoded coordinate.                                                  |
| (36)    | `jwks.keys[].y`                           |  Public key Y          | Base64url-encoded coordinate.                                                  |
| (37)    | `jwks.keys[].alg`                         |  Key algorithm         | Used for ECDH encryption of response.                                          |
| (38)    | `jwks.keys[].kid`                         |  Key ID                | Used by wallet to select encryption key.                                       |
| (39)    | `vp_formats_supported`                    |  Format capabilities   | Declares supported VP formats and algorithms.                                  |
| (40)    | `vp_formats_supported.mso_mdoc.alg`       |  mDoc algorithms       | Algorithms supported for mDoc signatures.                                      |
| (41)    | `kb-jwt_alg_values`                       |  Holder binding algs   | Algorithms supported for key binding JWT.                                      |
| (42)    | `sd-jwt_alg_values`                       |  SD-JWT algs           | Algorithms supported for SD-JWT issuer signatures.                             |
| (43)    | `encrypted_response_enc_values_supported` |  Encryption            | Symmetric encryption algorithms supported.                                     |
| (44)    | `state`                                   |  CSRF protection       | Returned unmodified in the response.                                           |  
| (45)    | `aud`                                     |  Audience              | Fixed value for HAIP aligned responses.                                  |
| (46)    | `exp`                                     |  Expiration            | Limits lifetime of request object.                                             |
| (47)    | `iat`                                     |  Issued-at             | Used for freshness validation.                                                 |

### 3.3 Request Construction Checklist

Before sending a Presentation Request, verify that your request includes all elements needed for a PID presentation:

| Check | Field | Validation | Failure Action |
|-------|-------|------------|----------------|
|  | `iss` | Present and matches your verifier identifier | Request will be rejected |
|  | `aud` | Present and correctly targets the wallet | Request will be rejected |
|  | `iat` | Present and current timestamp | Request will be rejected if expired |
|  | `exp` | Present and set to reasonable future time (5-10 min) | Request will be rejected if expired |
|  | `client_id` | Present and uses correct scheme (e.g., `x509_hash:`) | Request will be rejected |
|  | `response_type` | Set to `"vp_token"` | Request will be rejected |
|  | `response_mode` | Set to `"direct_post.jwt"` for HAIP | Request will be rejected |
|  | `nonce` | Present, cryptographically random, unique per request | Security risk: replay attacks possible |
|  | `client_metadata.jwks` | Contains valid encryption key | Response cannot be encrypted |
|  | `verifier_info` | Contains valid registration certificate | Wallet will reject untrusted verifier |
|  | `response_uri` | Valid HTTPS URL, accessible by wallet | Response cannot be delivered |
|  | `dcql_query.credentials` | At least one credential specified | No data will be returned |
|  | `dcql_query.credentials[].format` | Valid format (`dc+sd-jwt` or `mso_mdoc`) | Request will be rejected |
|  | `dcql_query.credentials[].claims` | At least one claim per credential | Credential will be empty |
|  | Request object signature | Request object is properly signed (JAR) | Wallet will reject unsigned request |

!!! warning "Nonce Security"
    The `nonce` must be cryptographically random and unique per request. Reusing nonces enables replay attacks. Generate using a cryptographically secure random number generator.

!!! tip "Expiration Time"
    Set `exp` to 5-10 minutes after `iat`. Too short may cause timeouts; too long increases security risk if the request is intercepted.


## 4. Interpreting the PID Presentation Response

This chapter explains the structure of the PID Presentation Response and provides a complete validation checklist. It covers what the verifier receives at the response_uri, how to interpret the vp_token structure, and how to validate it using the validation layers described in Chapter 2.

### 4.1 Receiving the Presentation Response

When the wallet has satisfied the Presentation Request and the user has consented, it sends the response to the verifier’s response_uri. In a HAIP-aligned flow using direct_post.jwt, this happens as a HTTPS POST.

A typical HTTP interaction looks like this:

```http
POST /response HTTP/1.1
Host: response.example
Content-Type: application/x-www-form-urlencoded

response=eyJhbGciOiJFQ0RILUVTIiwiZW5jIjoiQTEyOEdDTSIsImtpZCI6ImFjIn0...

```

The `response` parameter contains an encrypted JWT (JWE). The verifier should treat this object as opaque until basic transport-level checks (TLS, content type, size limits) have passed.

### 4.2 High-Level Structure of the Response

The presentation response structure with `direct_post.jwt` consists of:

**Outer Layer (Encrypted Response):**
- An encrypted JWT (JWE) containing the entire response
- Encrypted using the verifier's public key (from the request's `client_metadata.jwks`)
- After decryption, contains session binding claims (`nonce`, `aud`, `iat`, `exp`, `state`) and the `vp_token`

**Inner Layer (vp_token):**
- For SD-JWT: A signed credential in the format `<Issuer-signed JWT>~<Disclosure 1>~...~<Disclosure N>~<KB-JWT>`
- For mDoc: CBOR-encoded credential with deviceAuth structure
- The vp_token itself is NOT encrypted separately - it's simply included in the encrypted response payload

!!! info "Response Encryption"
    The entire response is encrypted as a single JWE. The vp_token inside is a signed (not encrypted) credential format. This prevents "double encryption" which would be unnecessary.


### 4.3 Response Validation Checklist

The checklist below provides a complete validation workflow for the PID presentation response. It follows the validation layers described in [Chapter 2](#2-concepts-and-validation-layers), proceeding in order from transport checks through business rules. Each layer builds on the previous one, following a fail-fast principle: reject immediately upon any validation failure to save processing time and reduce attack surface.

**Important:** With `direct_post.jwt` response mode, the entire response is encrypted as a JWE. The vp_token inside is a signed credential (SD-JWT or mDoc), NOT separately encrypted. Decryption must happen before session binding can be validated.

For detailed explanations of why each check matters, refer back to the corresponding validation layer in Chapter 2.

| Step | Check | Implementation | Failure Action |
|------|-------|----------------|----------------|
| **1. Transport Layer** | | | |
| 1.1 | Verify HTTPS connection | Confirm TLS 1.2+ is used and server certificate is valid | Reject: Insecure transport |
| 1.2 | Check content type | Verify `Content-Type: application/x-www-form-urlencoded` header is present | Reject: Wrong content type |
| 1.3 | Verify payload size | Confirm payload is within reasonable limits (e.g., < 1MB) to prevent DoS | Optionally reject: Payload too large |
| **2. Decrypt Response** | | | |
| 2.1 | Extract response parameter | Parse the POST body and extract the `response` parameter value | Reject: Missing response parameter |
| 2.2 | Parse JWE structure | Verify the response has valid JWE format (five base64url-encoded parts) | Reject: Malformed JWE |
| 2.3 | Decode JWE header | Parse JWE header as valid JSON and extract `alg`, `enc`, and `kid` fields | Reject: Invalid JWE header |
| 2.4 | Verify encryption algorithm | Confirm `alg` is in allowed list (e.g., `ECDH-ES`) and `enc` is supported (e.g., `A128GCM`) | Reject: Unsupported encryption |
| 2.5 | Decrypt response | Use your private key (matching the public key sent in request `client_metadata.jwks`) to decrypt the JWE | Reject: Decryption failed |
| 2.6 | Parse decrypted payload | Parse the decrypted plaintext as valid JSON | Reject: Invalid payload structure |
| **3. Session Binding** | | | |
| 3.1 | Extract `nonce` from payload | Locate `nonce` claim in decrypted response payload | Reject: Missing nonce |
| 3.2 | Compare nonce with request | Verify nonce matches exactly (byte-for-byte) the nonce from your original request | Reject: Nonce mismatch |
| 3.3 | Extract `aud` from payload | Locate `aud` claim in decrypted response payload | Reject: Missing audience |
| 3.4 | Verify audience matches verifier | Confirm `aud` matches your verifier's `client_id` from the request | Reject: Wrong audience |
| 3.5 | Extract `iat` timestamp | Locate `iat` (issued-at) claim in decrypted response payload | Reject: Missing timestamp |
| 3.6 | Extract `exp` timestamp | Locate `exp` (expiration) claim in decrypted response payload | Reject: Missing expiration |
| 3.7 | Verify timestamp validity | Confirm current time is between `iat` and `exp` (accounting for clock skew, e.g., ±30s) | Reject: Expired or not yet valid |
| 3.8 | Check response freshness | Verify `iat` is within acceptable window from request time (e.g., last 5 minutes) | Reject: Response too old |
| 3.9 | Extract `state` (if used) | If `state` was included in your request, locate it in decrypted response payload and verify it matches | Reject: State mismatch |
| **4. Holder Binding** | | | |
| 4.1 | Extract `vp_token` | Locate the `vp_token` field in decrypted response payload | Reject: Missing vp_token |
| 4.2 | Verify credential format matches request | Confirm vp_token format (SD-JWT with `~` separators or mDoc CBOR) matches the format you requested in `dcql_query` | Reject: Wrong credential format |
| 4.3 | SD-JWT: Extract credential | Extract the issuer-signed JWT (first part before `~`) | Reject: Cannot extract credential |
| 4.4 | SD-JWT: Parse credential structure | Decode credential JWT header and payload | Reject: Malformed credential |
| 4.5 | SD-JWT: Extract holder's public key | Extract `cnf.jwk` claim from credential payload per RFC 7800 | Reject: Missing cnf claim |
| 4.6 | SD-JWT: Extract KB-JWT | Extract the KB-JWT (last element after final `~`) | Reject: Missing KB-JWT |
| 4.7 | SD-JWT: Parse KB-JWT structure | Decode KB-JWT header and payload | Reject: Malformed KB-JWT |
| 4.8 | SD-JWT: Verify KB-JWT audience | Confirm `aud` in KB-JWT matches your verifier identifier | Reject: Wrong KB-JWT audience |
| 4.9 | SD-JWT: Verify KB-JWT nonce | Confirm `nonce` in KB-JWT matches the nonce from your request | Reject: KB-JWT nonce mismatch |
| 4.10 | SD-JWT: Verify KB-JWT timestamp | Confirm `iat` in KB-JWT is recent and consistent with response `iat` from step 3.5 | Reject: Invalid KB-JWT timestamp |
| 4.11 | SD-JWT: Verify KB-JWT signature | Verify the KB-JWT signature using the public key extracted in step 4.5 | Reject: Invalid holder binding signature |
| 4.12 | SD-JWT: Verify hash binding | Confirm KB-JWT's `sd_hash` matches SHA-256 hash of the presentation (issuer-signed JWT + `~` + disclosures) | Reject: Hash mismatch |
| 4.13 | mDoc: Validate holder binding | Validate deviceAuth and holder binding in accordance with ISO 18013-5 specification | Reject: Invalid mDoc holder binding |
| **5. Credential Validation** | | | |
| 5.1 | SD-JWT: Identify credential type | Verify `vct` claim matches requested PID type (e.g., `urn:eudi:pid:de:1`) | Reject: Wrong credential type |
| 5.2 | SD-JWT: Extract issuer identifier | Extract `iss` claim from credential payload | Reject: Missing issuer |
| 5.3 | SD-JWT: Verify issuer is trusted | Look up issuer in your loaded trust list (PID providers) and verify it is authorized to issue PIDs | Reject: Untrusted issuer |
| 5.4 | SD-JWT: Extract issuer's public key | Retrieve issuer's public key from trust list or from credential's `x5c` chain in credential header | Reject: Cannot find issuer key |
| 5.5 | SD-JWT: Verify issuer signature | Verify the credential signature using issuer's public key | Reject: Invalid credential signature |
| 5.6 | SD-JWT: Verify credential validity | Check `iat`, `exp` claims and confirm credential is currently valid (accounting for clock skew) | Reject: Expired credential |
| 5.7 | SD-JWT: Check revocation status | Query revocation mechanism (status list, OCSP, or CRL) to confirm credential is not revoked | Reject: Revoked credential |
| 5.8 | SD-JWT: Verify certificate chain | If issuer uses X.509 certificates (`x5c` in header), verify the full chain up to trust anchor and check certificate validity | Reject: Invalid certificate chain |
| 5.9 | mDoc: Validate credential | Validate mDoc credential structure, issuer signature, trust, and validity in accordance with ISO 18013-5 specification | Reject: Invalid mDoc credential |
| **6. Selective Disclosure** | | | |
| 6.1 | SD-JWT: Extract disclosures | Parse all disclosed attributes from the SD-JWT (elements between `~` separators, excluding issuer-signed JWT and KB-JWT) | Reject: Cannot parse disclosures |
| 6.2 | SD-JWT: Verify disclosure integrity | Verify each disclosure's hash matches the corresponding `_sd` hash in the issuer-signed JWT | Reject: Disclosure tampering detected |
| 6.3 | mDoc: Validate selective disclosure | Validate disclosed namespaces and elements in accordance with ISO 18013-5 specification | Reject: Invalid mDoc disclosures |
| 6.4 | Compare with requested claims | Check that all disclosed claims were explicitly requested in your `dcql_query` | Warning: Extra claims disclosed |
| 6.5 | Verify mandatory claims present | Confirm all claims you marked as mandatory in your request are present in the response | Reject: Missing mandatory claims |
| 6.6 | Verify credential set compliance (if used) | If `credential_sets` was used in your request, confirm the combination of credentials received matches one of the options | Reject: Invalid credential combination |
| 6.7 | Check for over-disclosure | Verify no additional credentials beyond what was requested are included in the response | Warning: Unexpected credentials |
| **7. Business Rules** | | | |
| 7.1 | Validate attribute formats | Verify each disclosed claim value conforms to expected data types and formats (dates, strings, structured data) | Reject: Invalid attribute format |
| 7.2 | Evaluate business requirements | Apply your application-specific logic (e.g., age >= 18, nationality checks, address validation) | Reject: Business rule violation |
| 7.3 | Check data completeness | Verify all attributes needed for your use case are present and non-empty | Reject: Incomplete data |
| 7.4 | Record authorization decision | Log the validation outcome, disclosed attributes (respecting privacy), and authorization decision for audit purposes | N/A |

!!! tip "Fail-Fast Principle"
    Reject immediately upon any validation failure that is more severe than a warning. Do not continue validation after a critical failure (e.g., signature verification). This prevents information leakage and reduces processing costs.

---

### 4.4 Failure Handling and Diagnostics

Verifier implementations should provide clear diagnostics internally. Common rejection points include:

- Signature verification failure
- Nonce or audience mismatch
- Unsupported credential format
- Missing or extra disclosed attributes
- Invalid or untrusted wallet attestation

While error details should not be exposed to the wallet or user, precise internal logging is essential for debugging interoperability issues.
