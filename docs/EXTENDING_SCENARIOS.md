# Extending Scenarios

This document explains how to add new test scenarios (simulation modes) to ERICA for testing different validation failures and edge cases.

## Understanding Simulation Modes

Simulation modes allow you to generate wallet responses that are intentionally compliant or intentionally flawed, testing whether the RP correctly validates each scenario.

### Current Modes

All simulation modes are defined in `src/types/index.ts`:

```typescript
export enum SimulationMode {
  // Valid/Compliant Responses
  VALID = "VALID",                          // Fully spec-compliant response
  COMPLIANT = "VALID",                      // Alias for backward compatibility

  // Credential Validity Issues
  EXPIRED = "EXPIRED",                      // exp claim in the past
  NOT_YET_VALID = "NOT_YET_VALID",         // nbf claim in the future

  // Signature Issues
  INVALID_SIGNATURE = "INVALID_SIGNATURE",  // Tampered signature
  MISSING_SIGNATURE = "MISSING_SIGNATURE",  // No signature present

  // Claim Issues
  MISSING_CLAIMS = "MISSING_CLAIMS",        // Required claims missing
  OVER_DISCLOSURE = "OVER_DISCLOSURE",      // More claims than requested
  MODIFIED_CLAIMS = "MODIFIED_CLAIMS",      // Claim values altered

  // Binding Issues
  WRONG_NONCE = "WRONG_NONCE",              // Nonce doesn't match request
  MISSING_HOLDER_BINDING = "MISSING_HOLDER_BINDING",  // No KB-JWT
  WRONG_AUDIENCE = "WRONG_AUDIENCE",        // aud claim mismatch

  // Format Issues
  FORMAT_MISMATCH = "FORMAT_MISMATCH",      // Wrong format (mDoc vs SD-JWT)
  MALFORMED_SD_JWT = "MALFORMED_SD_JWT",    // Invalid SD-JWT structure

  // Issuer Issues
  WRONG_ISSUER = "WRONG_ISSUER",            // Unexpected issuer
  WRONG_CREDENTIAL_TYPE = "WRONG_CREDENTIAL_TYPE",  // Wrong vct value
}
```

**19 modes total** covering the main validation checks.

## Scenario Architecture

### Where Scenarios Are Applied

1. **Enum Definition** → `src/types/index.ts` (SimulationMode enum)
2. **Implementation Logic** → `src/simulator/WalletSimulator.ts` or `src/simulator/CredoSDJWTGenerator.ts`
3. **UI Selector** → `web/src/components/InputForm.tsx` (loads dynamically from enum)
4. **Test Coverage** → `src/tests/simulation-modes.test.ts` (optional, verify each mode works)

### Data Flow

```
User selects mode in Web UI
  ↓
InputForm.tsx reads SimulationMode enum
  ↓
API call includes mode parameter
  ↓
WalletSimulator.simulate() applies mode logic
  ↓
Response has intentional flaw (or is valid)
  ↓
PresentationResponseValidator catches the flaw
  ↓
Results displayed with diagnostics
```

## Step-by-Step: Adding a New Scenario

### Example: Add "INCOMPLETE_BIRTHDATE" Scenario

**Goal**: Test that the RP rejects credentials missing the required birthdate claim.

#### Step 1: Add Enum Value

**File**: `src/types/index.ts`

```typescript
export enum SimulationMode {
  // ... existing modes ...

  // Claim Issues
  MISSING_CLAIMS = "MISSING_CLAIMS",
  OVER_DISCLOSURE = "OVER_DISCLOSURE",
  MODIFIED_CLAIMS = "MODIFIED_CLAIMS",
  INCOMPLETE_BIRTHDATE = "INCOMPLETE_BIRTHDATE",  // NEW

  // ... rest of modes ...
}
```

**Notes**:
- Use SCREAMING_SNAKE_CASE for enum keys
- Use kebab-case for enum values if they might appear in URLs/APIs
- Add a comment explaining what claim is affected

#### Step 2: Implement Logic

**File**: `src/simulator/CredoSDJWTGenerator.ts` or `src/simulator/WalletSimulator.ts`

The mode is passed through the simulator pipeline. Find where claims are assembled:

```typescript
// In CredoSDJWTGenerator.ts (or similar)
private async generateSDJWT(
  credentials: DCQLCredential[],
  mode: SimulationMode
): Promise<string> {
  // ... existing code ...

  // Apply simulation mode
  switch (mode) {
    case SimulationMode.EXPIRED:
      credentialPayload.exp = Math.floor(Date.now() / 1000) - 3600;
      break;

    case SimulationMode.INCOMPLETE_BIRTHDATE:
      // Remove or zero-out the birthdate claim
      delete credentialPayload.birthdate;
      // OR: credentialPayload.birthdate = undefined;
      break;

    case SimulationMode.MISSING_CLAIMS:
      // Remove multiple required claims
      delete credentialPayload.birthdate;
      delete credentialPayload.family_name;
      break;

    // ... other modes ...
  }

  // Continue with signing and SD-JWT generation
}
```

**Key Considerations**:
- Apply the mode BEFORE signing (so the signature covers the flaw)
- Document which claim(s) are affected
- Consider whether the mode should apply to all credentials or just some

#### Step 3: Document the Mode

Add a comment above the case statement:

```typescript
case SimulationMode.INCOMPLETE_BIRTHDATE:
  /**
   * Test that RP rejects credentials missing required birthdate claim
   * Spec Reference: HAIP §2.2 (Required Claims for PID)
   * What's tested: RP must verify all mandatory claims are present
   * Expected validation error: "Claim 'birthdate' not found in credential"
   */
  delete credentialPayload.birthdate;
  break;
```

#### Step 4: Verify UI Picks It Up

**File**: `web/src/components/InputForm.tsx`

The UI should dynamically load the enum. Check if it does:

```typescript
// In InputForm.tsx or similar
const availableScenarios = Object.values(SimulationMode);

return (
  <select value={selectedMode} onChange={...}>
    {availableScenarios.map(mode => (
      <option key={mode} value={mode}>
        {mode}
      </option>
    ))}
  </select>
);
```

If the UI is **hardcoded** instead of dynamic, update it to be dynamic (Phase 2 improvement).

Current UI pattern (find in `web/src/components/`):
```typescript
// OLD (hardcoded) - REPLACE THIS
<option value="VALID">Valid/Compliant</option>
<option value="EXPIRED">Expired Credential</option>
// ... etc

// NEW (dynamic) - USE THIS
{Object.values(SimulationMode).map(mode => (
  <option key={mode} value={mode}>{mode}</option>
))}
```

#### Step 5: Test Your Mode

Create a simple test to verify the mode works:

**File**: `src/tests/simulation-modes.test.ts`

```typescript
import { SimulationMode } from "../types/index.js";
import { WalletSimulator } from "../simulator/WalletSimulator.js";

describe("Simulation Modes", () => {
  it("INCOMPLETE_BIRTHDATE mode removes birthdate claim", async () => {
    const simulator = new WalletSimulator();
    
    const request = createValidRequest();
    const options = {
      mode: SimulationMode.INCOMPLETE_BIRTHDATE,
      credentialSource: "TEMPLATE" as const,
    };

    const response = await simulator.simulate(request, options);
    
    // Decode and verify birthdate is missing
    const decodedToken = decodeJWT(response.vpToken);
    expect(decodedToken.vc.credentialSubject).not.toHaveProperty("birthdate");
  });
});
```

Run the test:
```bash
npm run test:core -- --testNamePattern="INCOMPLETE_BIRTHDATE"
```

#### Step 6: Verify Validation Catches It

The validation should now detect this issue. Verify `PresentationResponseValidator` has a check for missing required claims:

**File**: `src/validators/PresentationResponseValidator.ts`

```typescript
private validateRequiredClaims(credential: any): ValidationIssue[] {
  const REQUIRED_CLAIMS = ['given_name', 'family_name', 'birthdate', /*...*/];
  const issues: ValidationIssue[] = [];

  for (const claim of REQUIRED_CLAIMS) {
    if (!credential[claim]) {
      issues.push({
        severity: Severity.ERROR,
        category: ValidationErrorCategory.CLAIM_VALIDATION,
        message: `Required claim '${claim}' not found in credential`,
        context: { missingClaim: claim },
        specReference: "HAIP §2.2",
      });
    }
  }

  return issues;
}
```

If this check doesn't exist, add it (see [VALIDATION_CHECKLIST.md](./VALIDATION_CHECKLIST.md) for similar checks).

#### Step 7: Update Documentation

Add your scenario to this file:

```markdown
## Scenarios Added

### INCOMPLETE_BIRTHDATE
- **Category**: Claim Validation
- **What It Tests**: RP must reject credentials missing required birthdate claim
- **Expected Error**: "Claim 'birthdate' not found"
- **Spec Reference**: HAIP §2.2
- **Files Modified**: 
  - src/types/index.ts (enum)
  - src/simulator/CredoSDJWTGenerator.ts (implementation)
```

---

## Common Scenario Patterns

### Pattern 1: Remove a Claim

```typescript
case SimulationMode.MISSING_CLAIMS:
  delete credentialPayload.birthdate;
  delete credentialPayload.family_name;
  break;
```

**Test For**: RP checks all required claims are present

### Pattern 2: Modify a Claim Value

```typescript
case SimulationMode.MODIFIED_CLAIMS:
  credentialPayload.family_name = "HACKER";  // Changed value
  break;
```

**Test For**: RP detects tampered claims (signature should fail or claims should not match request)

### Pattern 3: Modify Timestamps

```typescript
case SimulationMode.EXPIRED:
  credentialPayload.exp = Math.floor(Date.now() / 1000) - 3600;  // 1 hour ago
  break;

case SimulationMode.NOT_YET_VALID:
  credentialPayload.nbf = Math.floor(Date.now() / 1000) + 86400;  // 24 hours from now
  break;
```

**Test For**: RP checks credential validity windows (exp, nbf, iat)

### Pattern 4: Wrong Binding Data

```typescript
case SimulationMode.WRONG_NONCE:
  // Generate KB-JWT with different nonce
  kbJwt.nonce = "wrong-nonce-" + Math.random();
  break;

case SimulationMode.WRONG_AUDIENCE:
  // Generate KB-JWT with different audience
  kbJwt.aud = "https://wrong-rp.example";
  break;
```

**Test For**: RP verifies KB-JWT nonce and audience match request

### Pattern 5: Skip a Component

```typescript
case SimulationMode.MISSING_HOLDER_BINDING:
  // Return credential without KB-JWT
  return sdJwt;  // Skip: vp_token = sdJwt + "." + kbJwt
  break;
```

**Test For**: RP requires KB-JWT for binding

### Pattern 6: Use Wrong Key

```typescript
case SimulationMode.INVALID_SIGNATURE:
  // Use a different private key to sign
  const wrongSigner = await importJWK(INVALID_SIGNATURE_KEY.privateKeyJwk, "ES256");
  // Continue with signing using wrongSigner
  break;
```

**Test For**: RP verifies signature with correct public key (fails with wrong key)

---

## UI Integration

### Dynamic Scenario Selector

**File**: `web/src/components/InputForm.tsx`

Ensure the scenario dropdown is **dynamic** (loads from enum):

```typescript
import { SimulationMode } from "../types.ts";

export function InputForm() {
  const [selectedMode, setSelectedMode] = useState(SimulationMode.VALID);

  return (
    <select value={selectedMode} onChange={(e) => setSelectedMode(e.target.value)}>
      <optgroup label="Valid Responses">
        <option value={SimulationMode.VALID}>Valid/Compliant</option>
      </optgroup>
      
      <optgroup label="Credential Validity">
        <option value={SimulationMode.EXPIRED}>Expired Credential</option>
        <option value={SimulationMode.NOT_YET_VALID}>Not Yet Valid</option>
      </optgroup>

      <optgroup label="Signature Issues">
        <option value={SimulationMode.INVALID_SIGNATURE}>Invalid Signature</option>
        <option value={SimulationMode.MISSING_SIGNATURE}>Missing Signature</option>
      </optgroup>

      {/* ... other optgroups ... */}
    </select>
  );
}
```

**Benefits**:
- No hardcoding needed
- New enum values automatically appear
- Groups make UI more usable

### Scenario Description Popup

Add a help tooltip or modal explaining each scenario:

```typescript
const SCENARIO_DESCRIPTIONS: Record<SimulationMode, string> = {
  [SimulationMode.VALID]: "Fully compliant, valid presentation",
  [SimulationMode.EXPIRED]: "Credential with exp claim in the past",
  [SimulationMode.INCOMPLETE_BIRTHDATE]: "Credential missing required birthdate claim",
  // ... etc
};

// In UI:
<span title={SCENARIO_DESCRIPTIONS[selectedMode]}>
  <InfoIcon />
</span>
```

---

## Testing Your Scenarios

### Manual Testing

1. Start the debugger: `npm run dev`
2. Open Web UI at http://localhost:3000
3. Select scenario from dropdown
4. Submit debug request
5. Verify validation catches the flaw in "Results" section

### Automated Testing

Create a comprehensive test file:

**File**: `src/tests/simulation-modes-comprehensive.test.ts`

```typescript
import { SimulationMode } from "../types/index.js";
import { WalletSimulator } from "../simulator/WalletSimulator.js";
import { PresentationResponseValidator } from "../validators/index.js";

describe("All Simulation Modes", () => {
  const simulator = new WalletSimulator();
  const validator = new PresentationResponseValidator();

  Object.values(SimulationMode).forEach(mode => {
    it(`${mode} mode generates response`, async () => {
      const request = createValidRequest();
      const response = await simulator.simulate(request, {
        mode,
        credentialSource: "TEMPLATE",
      });
      
      expect(response.vpToken).toBeDefined();
    });

    // For non-VALID modes, validator should detect issues
    if (mode !== SimulationMode.VALID && mode !== SimulationMode.COMPLIANT) {
      it(`${mode} mode is caught by validator`, async () => {
        const request = createValidRequest();
        const response = await simulator.simulate(request, {
          mode,
          credentialSource: "TEMPLATE",
        });
        
        const validation = await validator.validate(response, request);
        
        // Should have at least one error
        expect(validation.issues.filter(i => i.severity === Severity.ERROR).length)
          .toBeGreaterThan(0);
      });
    }
  });
});
```

Run:
```bash
npm run test:core -- --testNamePattern="Simulation Modes"
```

---

## Phase 2 Scenario Backlog

Scenarios to add in future phases:

- [ ] Incomplete disclosure (missing one disclosed claim)
- [ ] Over-disclosure (more claims disclosed than requested)
- [ ] Revoked credential (issuer revocation check)
- [ ] Invalid certificate chain (issuer cert not trusted)
- [ ] Multiple credentials with mixed validity (some valid, some expired)
- [ ] SD-JWT with wrong MAC
- [ ] Credential format conversion (mDoc instead of SD-JWT)
- [ ] Audience mismatch variants (partial match, typo in domain)
- [ ] Nonce timing issues (old nonce, predictable nonce)

---

## Reference

- [SimulationMode enum](../src/types/index.ts)
- [WalletSimulator implementation](../src/simulator/WalletSimulator.ts)
- [Validation checks](./VALIDATION_CHECKLIST.md)
- [OpenID4VP §6](https://openid.net/specs/openid4vc-core-1_0.html#section-6) - Validation requirements
- [HAIP §2.2](https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html#section-2.2) - PID validation rules

