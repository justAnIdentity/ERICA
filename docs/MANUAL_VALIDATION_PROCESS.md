# Manual Validation Process

This document describes how to manually audit ERICA's validation checks for correctness and spec compliance.

The goal is to have a human-verifiable, auditable codebase where security checks can be inspected and verified without needing to run a test suite.

## Overview

ERICA performs three types of validation:

1. **Request Validation** - Checks that presentation requests are well-formed and spec-compliant
2. **Response Validation** - Checks that presentation responses are valid and trustworthy
3. **Simulation Correctness** - Ensures the wallet simulator generates appropriate test cases

All three must be manually audited before the tool is released.

---

## Phase 1: Quick Setup (15 minutes)

### Gather Materials

You'll need:

1. **Specifications** (local copies):
   - OpenID4VP: https://openid.net/specs/openid-4-verifiable-presentations-1_0.html
   - OpenID4VP HAIP: https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html
   - SD-JWT: https://datatracker.ietf.org/doc/draft-ietf-oauth-selective-disclosure-jwt/
   - EUDI ARF: https://github.com/eu-digital-identity-wallet/architecture-and-reference-framework

2. **Code References**:
   - `src/validators/PresentationRequestValidator.ts`
   - `src/validators/PresentationResponseValidator.ts`
   - `src/simulator/WalletSimulator.ts`

3. **Tracking**:
   - `docs/VALIDATION_CHECKLIST.md` (this document's companion)
   - Pen and paper or text editor

### Set Up Your Workspace

```bash
# Terminal 1: Keep codebase visible
cd /Users/arjen/eudi-vp-debugger
code .

# Terminal 2: Keep spec open
# Open specs in browser or PDF reader
# Keep focused on one section at a time
```

---

## Phase 2: Understanding the Code Architecture (30 minutes)

### Map Validation Flows

**Request Validation Flow**:
```
PresentationRequestValidator.validate()
  ├── validateDCQLQuery() - Modern format
  ├── validatePresentationDefinition() - Legacy format
  ├── validateResponseUri()
  ├── validateNonce()
  ├── validateState()
  └── validateCredentialFormats()
```

**Response Validation Flow**:
```
PresentationResponseValidator.validate()
  ├── validateVPTokenPresent()
  ├── validateVPTokenSignature()
  ├── validateNonceMatch()
  ├── validateCredentialClaims()
  ├── validateCredentialExpiry()
  └── validateCredentialFormat()
```

### Read Each Validator

For each validator method:
1. Read the code (5 lines at a time, slowly)
2. Understand the logic in plain English
3. Note what it's checking for
4. Identify edge cases

---

## Phase 3: Individual Check Audit (5-10 minutes per check)

### Template for Each Check

Follow this template for every validation check:

#### 1. **Identify the Check**
- Location: `src/validators/PresentationRequestValidator.ts:85`
- What it validates: "DCQL credentials array must be non-empty"

#### 2. **Find the Code**
```typescript
// FROM: PresentationRequestValidator.ts:85
if (!dcqlQuery.credentials || dcqlQuery.credentials.length === 0) {
  return {
    valid: false,
    errors: ["DCQL credentials array cannot be empty"],
  };
}
```

#### 3. **Read the Spec**
- **Spec**: OpenID4VP HAIP §3.2
- **Quote**: "The credentials parameter of the DCQL query MUST be a non-empty array of ..."
- **Your understanding**: The spec requires at least one credential definition

#### 4. **Compare Code to Spec**
| Spec Requirement | Code Does This | Match? |
|---|---|---|
| Credentials must be non-empty | Checks `length === 0` | ✓ Yes |
| Must be array | Checks `!dcqlQuery.credentials` | ✓ Yes |
| Each element is valid | No additional checks | ⚠️ Check details |

#### 5. **Test the Logic**

**Valid Case**: 
```json
"dcql_query": {
  "credentials": [
    { "id": "pid", "format": "dc+sd-jwt" }
  ]
}
```
Expected: Validation passes  
Actual: [Run test and confirm]

**Invalid Case 1** (Empty):
```json
"dcql_query": {
  "credentials": []
}
```
Expected: Validation fails with "cannot be empty"  
Actual: [Run test and confirm]

**Invalid Case 2** (Missing):
```json
"dcql_query": {}
```
Expected: Validation fails  
Actual: [Run test and confirm]

#### 6. **Document Result**

In `VALIDATION_CHECKLIST.md`:
```markdown
| 2 | dcql_query.credentials array | PresentationRequestValidator.ts:85 | Verified (Arjen, 2026-03-30) | OpenID4VP HAIP §3.2 | credentials array must exist and be non-empty |
```

---

## Phase 4: Cross-Check Security Invariants (20 minutes)

### Critical Invariants

These **must** be verified:

#### Invariant 1: Signature Always Checked

**Question**: Can a presentation response be accepted without verifying the signature?

**How to check**:
1. Search for `validateVPTokenSignature()` in `PresentationResponseValidator.ts`
2. Trace the call in `validate()` method
3. Verify it's ALWAYS called (not conditional on some flag)
4. Verify it FAILS if signature is invalid

**Expected code pattern**:
```typescript
const signatureValid = await this.validateVPTokenSignature(response);
if (!signatureValid) {
  issues.push({ message: "Invalid signature", severity: "ERROR" });
  return { valid: false, errors, issues };
}
```

**Bad code pattern** (DON'T SEE):
```typescript
if (options.skipSignatureCheck) {  // 🚫 WRONG - no skip flag!
  return valid;
}
```

---

#### Invariant 2: Nonce is Mandatory

**Question**: Can a response without nonce be accepted?

**How to check**:
1. Find where nonce is validated
2. Verify nonce is **required** (not optional)
3. Verify response nonce must **match** request nonce (not just any nonce)

**Test scenario**:
- Request with nonce: "abc123"
- Response with nonce: "def456" (wrong nonce)
- Expected: FAIL ✓

---

#### Invariant 3: Expiry is Always Checked

**Question**: Can an expired credential be accepted?

**How to check**:
1. Find expiry validation logic
2. Verify it checks `exp` claim value
3. Verify it compares to current time
4. Verify it rejects if `exp` < now

**Test scenario**:
- Credential with `exp: 1000000000` (year 2001)
- Current time: 2026
- Expected: FAIL ✓

---

#### Invariant 4: Credentials Must Come from Trusted Issuers

**Question**: Can a credential from unknown issuer be accepted?

**How to check** (for Phase 2):
1. Locate issuer validation logic
2. Verify issuer is checked against trust anchor
3. Verify unknown issuers are rejected

**Current Status**: ⚠️ MVP might not fully implement this

---

### Run Invariant Tests

```bash
# Use ERICA's simulator to test each invariant

# Test 1: Invalid signature should fail
POST http://localhost:3001/api/debug
{
  "request": {...},
  "simulationMode": "INVALID_SIGNATURE"
}
# Expected: Response validator should report signature error

# Test 2: Missing nonce should fail
POST http://localhost:3001/api/debug
{
  "request": {...},
  "simulationMode": "MISSING_NONCE"
}
# Expected: Response validator should report nonce error

# Test 3: Expired credential should fail
POST http://localhost:3001/api/debug
{
  "request": {...},
  "simulationMode": "EXPIRED"
}
# Expected: Response validator should report expiry error
```

---

## Phase 5: Check Coverage (15 minutes)

### Completeness Check

Ask yourself:

1. **Syntax Checks** ✓
   - Are all required fields present?
   - Are field types correct?
   - Are URLs properly formatted?

2. **Semantic Checks** ✓
   - Do claims make sense?
   - Do dates make sense (not in future/past inappropriately)?
   - Do references (nonce, state) match between request and response?

3. **Cryptography Checks** ✓
   - Are signatures verified?
   - Are the right keys used?
   - Is the signature algorithm allowed?

4. **Trust Checks** ✓
   - Is the issuer trusted?
   - Is the verifier the intended recipient?
   - Are credentials not revoked?

5. **Negative Checks** ✓
   - Are invalid signatures rejected?
   - Are mismatched nonces rejected?
   - Are extra/unexpected fields handled safely?

### For Each Category, Ask

- Is this category checked in request validator? YES / NO / N/A
- Is this category checked in response validator? YES / NO / N/A
- Are there edge cases the check might miss?

---

## Phase 6: Create Audit Report

### Template

Create `docs/AUDIT_REPORT_[DATE].md`:

```markdown
# Validation Audit Report
**Date**: 2026-03-30  
**Auditor**: Arjen  
**Duration**: 2 hours  

## Summary
- Checks audited: 28/28
- Checks verified: 25/28
- Checks flagged for review: 3/28
- Critical issues found: 0
- Recommendations: 2

## Verified Checks ✓
1. dcql_query presence (§3.2)
2. credentials array non-empty (§3.2)
3. response_uri HTTPS (§5)
4. nonce required (§6.1)
5. ... (23 more)

## Flagged for Phase 2 ⚠️
1. Full issuer trust validation (needs trust anchor implementation)
2. SD-JWT disclosure verification (format adapter incomplete)
3. Certificate chain validation (not yet implemented)

## Recommendations
1. Add logging to signature validation for debugging
2. Document the trust anchor loading process
3. Create integration tests for negative scenarios

## Signoff
- [ ] Code changes verified
- [ ] Specs reviewed
- [ ] Security invariants confirmed
- [ ] Ready for Phase 2

Auditor: ___________________  Date: ___________
```

---

## Quick Reference: What NOT to Do

❌ **Don't just scan the code** - Actually read it carefully  
❌ **Don't skip the spec** - Always read the corresponding spec section  
❌ **Don't assume it works** - Test with invalid inputs  
❌ **Don't ignore edge cases** - Test empty, null, wrong type  
❌ **Don't skip security checks** - Signature, nonce, expiry are critical  

---

## Quick Reference: Red Flags

If you see any of these during audit, stop and investigate:

🚩 **`if (skipValidation)`** or **`if (debug)`** - Validation can be bypassed  
🚩 **`any` type in TypeScript** - Unvalidated data flowing through  
🚩 **No error thrown on failure** - Invalid data might be silently accepted  
🚩 **Hardcoded keys** - Use only for testing, never production  
🚩 **`console.log()` instead of proper error handling** - Hard to detect issues  
🚩 **No signature verification** - Most critical security issue  

---

## Timeline Estimate

For a thorough audit of all ~28 checks:

- Phase 1 (Setup): 15 min
- Phase 2 (Architecture): 30 min
- Phase 3 (Individual checks @ 5-10 min each): 2-3 hours
- Phase 4 (Invariants): 20 min
- Phase 5 (Coverage): 15 min
- Phase 6 (Report): 15 min

**Total: ~4 hours for complete audit**

This can be split across multiple days.

---

## Continuation

After audit, next steps:

1. **Mark verified checks** in `VALIDATION_CHECKLIST.md`
2. **Create audit report** (template above)
3. **Address flagged issues** (Phase 2 backlog or urgent fixes)
4. **Request peer review** (if team available)
5. **Move to Phase 2** with confidence

---

## Questions?

- **General questions**: See `README.md`
- **Spec questions**: See `.clinerules` for spec links
- **Code questions**: See inline comments in validators
- **Process questions**: See this document

