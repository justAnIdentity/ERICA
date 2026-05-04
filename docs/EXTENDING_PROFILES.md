# Extending Profiles

Guide for adding new OID4VP validation profiles to ERICA.

## What is a Profile?

A profile is a set of validation rules that apply on top of base OpenID4VP. Profiles constrain what's allowed, add requirements, or specialize validation for specific use cases.

## Current Profiles

Defined in `src/types/index.ts`:

```typescript
export enum Profile {
  PID_PRESENTATION = "pid-presentation",    // EUDI HAIP for Personal ID
  BASE_OPENID4VP = "base",                  // Base OpenID4VP
  CUSTOM = "custom",                        // User-defined
}
```

## Profile Components

Each profile consists of:

1. Name (enum value)
2. Description
3. Required claims
4. Validation rules beyond base OpenID4VP
5. Allowed signature algorithms
6. Key binding requirements
7. Allowed credential formats

## Adding a New Profile

Example: Add `DIPLOMA_PRESENTATION` for university diplomas

### Step 1: Add to Enum

File: `src/types/index.ts`

```typescript
export enum Profile {
  PID_PRESENTATION = "pid-presentation",
  BASE_OPENID4VP = "base",
  DIPLOMA_PRESENTATION = "diploma-presentation",  // NEW
  CUSTOM = "custom",
}
```

### Step 2: Create Profile Definition

File: `src/profiles/DiplomaProfile.ts`

```typescript
import { Profile, Severity, ValidationErrorCategory, ValidationIssue } from "../types/index.js";

export const DIPLOMA_PRESENTATION_PROFILE = {
  name: "diploma-presentation",
  description: "Higher Education Diploma",

  requiredClaims: [
    "given_name",
    "family_name",
    "birthdate",
    "institution_name",
    "institution_country",
    "degree_name",
    "field_of_study",
    "graduation_date",
    "issue_date",
    "ects_credits",
  ],

  allowedFormats: ["dc+sd-jwt"],
  allowedSignatureAlgorithms: ["ES256"],
  requiresHolderBinding: true,
  requiresNonce: true,
  requiresAudience: true,

  specReference: "https://data.europa.eu/api/hub/store/specification/diploma-rulebook",
};
```

### Step 3: Implement Validation

File: `src/validators/PresentationRequestValidator.ts`

```typescript
private validateDiplomaProfile(request: AuthorizationRequest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const profile = DIPLOMA_PRESENTATION_PROFILE;
  const requestedClaims = this.extractRequestedClaims(request);

  for (const requiredClaim of profile.requiredClaims) {
    if (!requestedClaims.includes(requiredClaim)) {
      issues.push({
        severity: Severity.ERROR,
        category: ValidationErrorCategory.CLAIM_VALIDATION,
        message: `Required diploma claim '${requiredClaim}' not requested`,
        context: { profile: "diploma-presentation", missingClaim: requiredClaim },
        specReference: "Diploma Rulebook Section 3.1",
      });
    }
  }

  return issues;
}
```

### Step 4: Register in Validator

Add to switch statement in `validate()`:

```typescript
switch (profile) {
  case Profile.PID_PRESENTATION:
    issues.push(...this.validatePidPresentationProfile(request));
    break;

  case Profile.DIPLOMA_PRESENTATION:
    issues.push(...this.validateDiplomaProfile(request));
    break;

  case Profile.BASE_OPENID4VP:
    break;

  case Profile.CUSTOM:
    issues.push(...this.validateCustomProfile(request));
    break;
}
```

### Step 5: Update UI

File: `web/src/components/InputForm.tsx`

```typescript
<select value={selectedProfile} onChange={(e) => setSelectedProfile(e.target.value)}>
  <option value={Profile.BASE_OPENID4VP}>Base OpenID4VP</option>
  <option value={Profile.PID_PRESENTATION}>EUDI HAIP (PID)</option>
  <option value={Profile.DIPLOMA_PRESENTATION}>Diploma</option>
  <option value={Profile.CUSTOM}>Custom</option>
</select>
```

### Step 6: Add Tests

File: `src/tests/profile-diploma.test.ts`

```typescript
import { Profile } from "../types/index.js";
import { PresentationRequestValidator } from "../validators/index.js";

describe("Diploma Profile", () => {
  const validator = new PresentationRequestValidator();

  it("should accept request with all required diploma claims", async () => {
    const request = {
      dcql_query: {
        credentials: [{
          claims: {
            given_name: {},
            family_name: {},
            institution_name: {},
            degree_name: {},
            // ... other required claims
          },
        }],
      },
    };

    const result = await validator.validate(request, Profile.DIPLOMA_PRESENTATION);
    expect(result.isValid).toBe(true);
  });

  it("should reject request missing institution data", async () => {
    const request = {
      dcql_query: {
        credentials: [{
          claims: {
            given_name: {},
            family_name: {},
            // Missing institution_name and institution_country
          },
        }],
      },
    };

    const result = await validator.validate(request, Profile.DIPLOMA_PRESENTATION);
    expect(result.issues.filter(i => i.severity === "ERROR").length).toBeGreaterThan(0);
  });
});
```

## References

- [OpenID4VP Core](https://openid.net/specs/openid4vc-core-1_0.html)
- [HAIP Profile](https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html)
- [EAA Specification](https://data.europa.eu/api/hub/store/specification/eaa-1.0.0)
