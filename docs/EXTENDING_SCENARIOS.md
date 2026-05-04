# Extending Scenarios

Guide for adding new test scenarios (simulation modes) to ERICA.

## What is a Simulation Mode?

Simulation modes generate wallet responses that are intentionally compliant or intentionally flawed, testing whether the RP correctly validates each scenario.

## Current Modes

Defined in `src/types/index.ts`:

```typescript
export enum SimulationMode {
  // Valid/Compliant
  VALID = "VALID",
  COMPLIANT = "VALID",

  // Credential Validity
  EXPIRED = "EXPIRED",
  NOT_YET_VALID = "NOT_YET_VALID",

  // Signature Issues
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  MISSING_SIGNATURE = "MISSING_SIGNATURE",

  // Claim Issues
  MISSING_CLAIMS = "MISSING_CLAIMS",
  OVER_DISCLOSURE = "OVER_DISCLOSURE",
  MODIFIED_CLAIMS = "MODIFIED_CLAIMS",

  // Binding Issues
  WRONG_NONCE = "WRONG_NONCE",
  MISSING_HOLDER_BINDING = "MISSING_HOLDER_BINDING",
  WRONG_AUDIENCE = "WRONG_AUDIENCE",

  // Format Issues
  FORMAT_MISMATCH = "FORMAT_MISMATCH",
  MALFORMED_SD_JWT = "MALFORMED_SD_JWT",

  // Issuer Issues
  WRONG_ISSUER = "WRONG_ISSUER",
  WRONG_CREDENTIAL_TYPE = "WRONG_CREDENTIAL_TYPE",
}
```

## Adding a New Scenario

Example: Add `INCOMPLETE_BIRTHDATE` to test missing required claim

### Step 1: Add to Enum

File: `src/types/index.ts`

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

### Step 2: Implement Logic

File: `src/simulator/CredoSDJWTGenerator.ts` or `src/simulator/WalletSimulator.ts`

```typescript
private async generateSDJWT(
  credentials: DCQLCredential[],
  mode: SimulationMode
): Promise<string> {
  // ... existing code ...

  switch (mode) {
    case SimulationMode.EXPIRED:
      credentialPayload.exp = Math.floor(Date.now() / 1000) - 3600;
      break;

    case SimulationMode.INCOMPLETE_BIRTHDATE:
      // Remove birthdate claim to test validator detects missing required claim
      delete credentialPayload.birthdate;
      break;

    case SimulationMode.MISSING_CLAIMS:
      delete credentialPayload.birthdate;
      delete credentialPayload.family_name;
      break;

    // ... other modes ...
  }

  // Continue with signing
}
```

### Step 3: Verify UI Picks It Up

The UI should dynamically load from enum. File: `web/src/components/InputForm.tsx`

```typescript
const availableScenarios = Object.values(SimulationMode);

return (
  <select value={selectedMode} onChange={...}>
    {availableScenarios.map(mode => (
      <option key={mode} value={mode}>{mode}</option>
    ))}
  </select>
);
```

### Step 4: Test

File: `src/tests/simulation-modes.test.ts`

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
    const decodedToken = decodeJWT(response.vpToken);

    expect(decodedToken.vc.credentialSubject).not.toHaveProperty("birthdate");
  });
});
```

## Common Patterns

### Remove a Claim

```typescript
case SimulationMode.MISSING_CLAIMS:
  delete credentialPayload.birthdate;
  delete credentialPayload.family_name;
  break;
```

### Modify a Claim Value

```typescript
case SimulationMode.MODIFIED_CLAIMS:
  credentialPayload.family_name = "TAMPERED";
  break;
```

### Modify Timestamps

```typescript
case SimulationMode.EXPIRED:
  credentialPayload.exp = Math.floor(Date.now() / 1000) - 3600;  // 1 hour ago
  break;

case SimulationMode.NOT_YET_VALID:
  credentialPayload.nbf = Math.floor(Date.now() / 1000) + 86400;  // 24 hours from now
  break;
```

### Wrong Binding Data

```typescript
case SimulationMode.WRONG_NONCE:
  kbJwt.nonce = "wrong-nonce-" + Math.random();
  break;

case SimulationMode.WRONG_AUDIENCE:
  kbJwt.aud = "https://wrong-rp.example";
  break;
```

### Skip a Component

```typescript
case SimulationMode.MISSING_HOLDER_BINDING:
  return sdJwt;  // Skip KB-JWT
  break;
```

### Use Wrong Key

```typescript
case SimulationMode.INVALID_SIGNATURE:
  const wrongSigner = await importJWK(INVALID_SIGNATURE_KEY.privateKeyJwk, "ES256");
  // Continue with signing using wrongSigner
  break;
```

## Testing

### Manual

```bash
npm run dev
# Open http://localhost:3000
# Select scenario from dropdown
# Submit debug request
# Verify validation catches the flaw
```

### Automated

```typescript
describe("All Simulation Modes", () => {
  const simulator = new WalletSimulator();
  const validator = new PresentationResponseValidator();

  Object.values(SimulationMode).forEach(mode => {
    if (mode !== SimulationMode.VALID && mode !== SimulationMode.COMPLIANT) {
      it(`${mode} is caught by validator`, async () => {
        const request = createValidRequest();
        const response = await simulator.simulate(request, { mode, credentialSource: "TEMPLATE" });
        const validation = await validator.validate(response, request);

        expect(validation.issues.filter(i => i.severity === Severity.ERROR).length).toBeGreaterThan(0);
      });
    }
  });
});
```

## References

- [SimulationMode enum](../src/types/index.ts)
- [WalletSimulator implementation](../src/simulator/WalletSimulator.ts)
- [Validation checks](./VALIDATION_CHECKLIST.md)
- [OpenID4VP Specification](https://openid.net/specs/openid4vc-core-1_0.html)
