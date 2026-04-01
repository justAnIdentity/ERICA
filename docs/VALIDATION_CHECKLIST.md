# Validation Checklist

This document tracks the validation checks implemented in ERICA and their spec compliance status.

Each check is listed with:
- **Location**: File and line number
- **Description**: What the check does
- **Spec Reference**: Which specification section(s) it validates
- **Status**: Implementation and verification status
- **Edge Cases**: Special scenarios covered by this check

## How to Use This Checklist

1. **For Maintainers**: Use this to understand what each validator checks
2. **For Auditors**: Use this to verify all checks are spec-compliant
3. **For Contributors**: Reference this when adding new checks or modifying existing ones

To mark a check as verified:
1. Read the spec section referenced
2. Review the implementation code
3. Manually test with spec-compliant and non-compliant inputs
4. Update the Status to "Verified" with date and verifier name

---

## Request Validation Checks

### Cryptography & Key Binding

| # | Check | File | Status | Spec Reference | Description |
|---|---|---|---|---|---|
| 5 | response_uri HTTPS | PresentationRequestValidator.ts:487-520 | MVP | OpenID4VP §5 | response_uri must be HTTPS URL |
| 6 | response_uri format | PresentationRequestValidator.ts:520-560 | MVP | OpenID4VP §5 | response_uri must be valid URL |
| 7 | Wallet holder key | WalletSimulator.ts:45-120 | MVP | OpenID4VP §5.2 | Response signed with wallet holder key |
| 8 | Signature algorithm valid | CredoSDJWTGenerator.ts:80-150 | MVP | HAIP §3.1 | Only ES256 for PID (SD-JWT key binding) |

**Status**: Not yet manually verified  
**Next Step**: Test with invalid HTTPS URLs and wrong signing keys

---

### Nonce & State

| # | Check | File | Status | Spec Reference | Description |
|---|---|---|---|---|---|
| 9 | Nonce present | PresentationRequestValidator.ts:600-650 | MVP | OpenID4VP §6.1 | nonce field must exist in request |
| 10 | Nonce non-empty | PresentationRequestValidator.ts:650-700 | MVP | OpenID4VP §6.1 | nonce must be non-empty string |
| 11 | Nonce in response | PresentationResponseValidator.ts:383-450 | MVP | OpenID4VP §6.1 | Response nonce must match request nonce |
| 12 | State optional | PresentationRequestValidator.ts:700-750 | MVP | OpenID4VP §6.1 | state is optional but if present must be returned |

**Status**: Not yet manually verified  
**Next Step**: Test nonce mismatch scenarios and verify detection

---

### Credential Format & Structure

| # | Check | File | Status | Spec Reference | Description |
|---|---|---|---|---|---|
| 13 | Credential format valid | CredentialMatcher.ts:50-100 | MVP | HAIP §2.1 | Format must be "dc+sd-jwt" (PID only) |
| 14 | Claims array present | CredentialMatcher.ts:100-150 | MVP | HAIP §3.2 | credentials[].claims should be array if present |
| 15 | VP Token format | PresentationResponseValidator.ts:223-280 | MVP | OpenID4VP §5.2 | vp_token can be JWT string or object |
| 16 | presentation_submission structure | PresentationResponseValidator.ts:118-220 | MVP | OpenID4VP §6.1 | descriptor_map required for legacy format |

**Status**: Not yet manually verified  
**Next Step**: Test with non-DC+SD-JWT formats and verify rejection

---

## Response Validation Checks

### VP Token & Signature

| # | Check | File | Status | Spec Reference | Description |
|---|---|---|---|---|---|
| 17 | VP Token present | PresentationResponseValidator.ts:118-160 | MVP | OpenID4VP §6.2 | Response must include vp_token |
| 18 | VP Token signed | PresentationResponseValidator.ts:223-280 | MVP | OpenID4VP §6.2 | vp_token must be validly signed |
| 19 | Signature verification | PresentationResponseValidator.ts:491-580 | MVP | OpenID4VP §5.2 | Verify JWT signature with wallet holder's public key |
| 20 | Key ID matches | PresentationResponseValidator.ts:580-650 | MVP | HAIP §3.1 | VP Token kid must match expected holder key |

**Status**: Not yet manually verified  
**Risks**: 
- Need to verify we're checking signature, not just structure
- Need to ensure we reject forged signatures

---

### Claim Validation

| # | Check | File | Status | Spec Reference | Description |
|---|---|---|---|---|---|
| 21 | Required claims present | PresentationResponseValidator.ts:700-800 | MVP | HAIP §2.2 | All mandatory PID claims must be included |
| 22 | Claim value format | PresentationResponseValidator.ts:800-900 | MVP | HAIP §2.2 | Claim values must match expected types/formats |
| 23 | Selective disclosure valid | CredoSDJWTGenerator.ts:200-300 | MVP | SD-JWT §4 | Only disclosed claims returned, signatures valid |
| 24 | No extra claims | PresentationResponseValidator.ts:900-950 | MVP | HAIP §2.2 | No unexpected claims should be present |

**Status**: Not yet manually verified  
**Risks**: 
- Selective disclosure validation incomplete in MVP
- Need to verify negative checks (catching extra claims)

---

### Expiry & Freshness

| # | Check | File | Status | Spec Reference | Description |
|---|---|---|---|---|---|
| 25 | Credential not expired | PresentationResponseValidator.ts:1000-1050 | MVP | HAIP §2.2 | exp claim must be in future |
| 26 | KB-JWT fresh | PresentationResponseValidator.ts:1050-1100 | MVP | OpenID4VP §5.2 | KB-JWT (key binding JWT) generated recently |
| 27 | Nonce match | PresentationResponseValidator.ts:383-450 | MVP | OpenID4VP §5.2 | Nonce in KB-JWT matches request nonce |
| 28 | Audience match | PresentationResponseValidator.ts:450-520 | MVP | OpenID4VP §5.2 | Audience in KB-JWT matches verifier |

**Status**: Not yet manually verified  
**Next Step**: Test with expired credentials and old nonces

---

## Simulation Mode Coverage

| Mode | Scenario | File | Checks Bypassed | Status |
|---|---|---|---|---|
| COMPLIANT | Valid, spec-compliant response | WalletSimulator.ts | None | MVP |
| INVALID_SIGNATURE | Signed with wrong key | WalletSimulator.ts | Signature check should detect | MVP |
| EXPIRED | Credential exp claim in past | WalletSimulator.ts | Expiry check should detect | MVP |
| MISSING_NONCE | Nonce omitted from response | WalletSimulator.ts | Nonce check should detect | MVP |
| [Add more...] | ... | ... | ... | Phase 2 |

---

## Audit Process

### Step 1: Setup
- [ ] Clone latest repo
- [ ] Run `npm install` and `npm run build`
- [ ] Open this file and the code side-by-side

### Step 2: Per-Check Verification
For each check marked "MVP":
1. Read the spec section
2. Find the code implementing the check (use line number)
3. Read the implementation logic carefully
4. Test manually:
   - Valid case: Should pass
   - Invalid case: Should fail with clear error
5. Mark status: "Verified by [NAME] on [DATE]"

### Step 3: Edge Cases
For each check, test:
- Boundary values (empty string, null, 0)
- Wrong types (number instead of string)
- Malformed input (invalid JSON, truncated)

### Step 4: Negative Checks
Ensure validator:
- ✓ Rejects invalid input
- ✓ Has clear error message
- ✓ Doesn't accidentally accept bad input with weak checks

---

## Critical Checks to Verify First

Priority order (highest security risk first):

1. **Signature Verification** (Check #19)
   - If broken: Attacker can forge credentials
   - Test: Sign with wrong key, verify rejection

2. **Nonce Validation** (Check #11)
   - If broken: Replay attacks possible
   - Test: Reuse old nonce, verify rejection

3. **Credential Expiry** (Check #25)
   - If broken: Revoked credentials accepted
   - Test: Use exp in past, verify rejection

4. **Required Claims Present** (Check #21)
   - If broken: Incomplete credentials accepted
   - Test: Remove mandatory claim, verify rejection

5. **DCQL Structure** (Check #1-2)
   - If broken: Unpredictable request parsing
   - Test: Empty credentials array, verify rejection

---

## Phase 2 Expansion

These validations will be added in Phase 2:

- [ ] JWT format adapter implementation
- [ ] SD-JWT disclosure verification (full validation)
- [ ] ISO mDoc/CBOR parsing and validation
- [ ] Certificate chain validation
- [ ] Additional EUDI profiles (EAA, etc.)
- [ ] Advanced claim logic (nested, conditional fields)
- [ ] Rate limiting and DoS protection checks

---

## Notes for Maintainers

- **Update this document** whenever you add a new validation check
- **Test thoroughly** before marking as "Verified"
- **Document edge cases** that your check handles
- **Link to specs** for clarity on what you're validating
- **Use consistent naming** for check categories (Crypto, Semantics, etc.)

For questions, see:
- [MANUAL_VALIDATION_PROCESS.md](MANUAL_VALIDATION_PROCESS.md) - Step-by-step audit guide
- [MVP_ROADMAP.md](../MVP_ROADMAP.md) - Roadmap and priorities
- Individual files for code comments explaining logic

