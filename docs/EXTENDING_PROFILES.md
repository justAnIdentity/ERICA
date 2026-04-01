# Extending Profiles

This document explains how to add new OID4VP profiles to ERICA and how to extend validation rules for different credential types and use cases.

## Understanding Profiles

A **profile** is a set of additional validation rules that apply on top of the base OpenID4VP specification. Profiles constrain what's allowed, add requirements, or specialize validation for specific use cases.

### Current Profiles

All profiles are defined in `src/types/index.ts`:

```typescript
export enum Profile {
  PID_PRESENTATION = "pid-presentation",    // EUDI HAIP profile for Personal ID
  BASE_OPENID4VP = "base",                  // Base OpenID4VP (minimal rules)
  CUSTOM = "custom",                        // User-defined custom profile
}
```

### Profile Validation Flow

```
User selects profile
  ↓
Request validation runs base checks
  ↓
Profile-specific checks applied
  ↓
Issues collected
  ↓
Results include profile name and profile-specific errors
```

## How Profiles Work in Code

### 1. Profile Selection (UI Layer)

**File**: `web/src/components/InputForm.tsx`

```typescript
const [selectedProfile, setSelectedProfile] = useState(Profile.PID_PRESENTATION);

return (
  <select value={selectedProfile} onChange={(e) => setSelectedProfile(e.target.value)}>
    <option value={Profile.BASE_OPENID4VP}>Base OpenID4VP</option>
    <option value={Profile.PID_PRESENTATION}>EUDI HAIP (PID)</option>
    <option value={Profile.CUSTOM}>Custom</option>
  </select>
);
```

### 2. Validation (API/Core Layer)

**File**: `src/validators/PresentationRequestValidator.ts`

```typescript
async validate(
  request: AuthorizationRequest,
  profile: Profile = Profile.BASE_OPENID4VP
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  // 1. Base validation (always runs)
  issues.push(...this.validateBaseOpenID4VP(request));

  // 2. Profile-specific validation
  switch (profile) {
    case Profile.PID_PRESENTATION:
      issues.push(...this.validatePidPresentationProfile(request));
      break;

    case Profile.BASE_OPENID4VP:
      // No additional checks
      break;

    case Profile.CUSTOM:
      issues.push(...this.validateCustomProfile(request));
      break;
  }

  return {
    isValid: issues.filter(i => i.severity === Severity.ERROR).length === 0,
    issues,
    profile,
  };
}
```

## Anatomy of a Profile

Each profile consists of:

1. **Name** (enum value): `PID_PRESENTATION`, `BASE_OPENID4VP`, etc.
2. **Description**: What use case or spec it covers
3. **Required Claims**: Which claims MUST be present in credentials
4. **Validation Rules**: Additional checks beyond base OpenID4VP
5. **Signature Algorithm**: Allowed algorithms (e.g., ES256 only)
6. **Key Binding**: Whether KB-JWT is required
7. **Format Restrictions**: Allowed credential formats

### Example: PID Presentation Profile

```typescript
export const PID_PRESENTATION_PROFILE: IProfile = {
  name: "pid-presentation",
  
  description: "EUDI High Assurance Interoperability Profile for PID",
  
  requiredClaims: [
    "given_name",
    "family_name",
    "birthdate",
    "age_over_18",  // OR age_over_21, etc.
    "issuing_country",
    "issuance_date",
    "expiry_date",
  ],
  
  allowedFormats: ["dc+sd-jwt"],  // SD-JWT only for PID
  
  allowedSignatureAlgorithms: ["ES256"],  // Only ECDSA P-256
  
  requiresHolderBinding: true,  // KB-JWT required
  
  requiresNonce: true,
  
  requiresAudience: true,
  
  trustedIssuers: [
    "https://eudi.example/issuer",  // Add trusted issuer URLs
  ],
  
  specReference: "https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html",
};
```

## Step-by-Step: Adding a New Profile

### Example: Add "DIPLOMA_PRESENTATION" (Higher Education Diploma EAA)

**Background**: Electronic Attestations of Attributes (EAA) are a generic framework for credentials. This example implements an OID4VP profile for a specific EAA use case: university diploma attestation, following the EAA Rulebook for higher education.

**Goal**: Create a profile validating higher education diplomas according to the Diploma EAA Rulebook.

#### Step 1: Define the Profile Type

**File**: `src/types/index.ts`

Add to enum:

```typescript
export enum Profile {
  PID_PRESENTATION = "pid-presentation",
  BASE_OPENID4VP = "base",
  DIPLOMA_PRESENTATION = "diploma-presentation",  // NEW: Higher Education Diploma EAA
  CUSTOM = "custom",
}
```

#### Step 2: Create Profile Specification

**File**: `src/profiles/DiplomaProfile.ts`

Create a new file with profile definition for the Diploma EAA:

```typescript
/**
 * Higher Education Diploma - Electronic Attestation of Attributes (EAA) Profile
 * 
 * Implements validation rules for university degree credentials according to the
 * Diploma EAA Rulebook: https://data.europa.eu/api/hub/store/specification/diploma-rulebook
 * 
 * EAA is a generic framework for credentials. This profile specifies rules for
 * a specific EAA use case: diploma attestation for higher education.
 */

import { Profile, Severity, ValidationErrorCategory, ValidationIssue } from "../types/index.js";

export interface IProfile {
  name: string;
  description: string;
  requiredClaims: string[];
  allowedFormats: string[];
  allowedSignatureAlgorithms: string[];
  requiresHolderBinding: boolean;
  requiresNonce: boolean;
  requiresAudience: boolean;
  trustedIssuers?: string[];
  specReference?: string;
}

export const DIPLOMA_PRESENTATION_PROFILE: IProfile = {
  name: "diploma-presentation",
  
  description: "Higher Education Diploma - Electronic Attestation of Attributes",
  
  requiredClaims: [
    // Identity claims
    "given_name",
    "family_name",
    "birthdate",
    
    // Education institution claims
    "institution_name",
    "institution_country",
    
    // Degree claims
    "degree_name",      // e.g., "Master of Science"
    "field_of_study",   // e.g., "Computer Science"
    "graduation_date",  // Date obtained degree
    "issue_date",       // When diploma was issued
    "ects_credits",     // European Credit Transfer and Accumulation System
  ],
  
  allowedFormats: ["dc+sd-jwt"],  // SD-JWT recommended per Diploma Rulebook
  
  allowedSignatureAlgorithms: ["ES256"],  // Only ES256 per Diploma Rulebook
  
  requiresHolderBinding: true,  // KB-JWT required for holder binding
  
  requiresNonce: true,  // Required for security
  
  requiresAudience: true,  // Audience must match relying party
  
  trustedIssuers: [
    // Example: EQAR-listed institutions
    // https://www.eqar.int/
  ],
  
  specReference: "https://data.europa.eu/api/hub/store/specification/diploma-rulebook",
};
```

#### Step 3: Implement Profile Validation

**File**: `src/validators/PresentationRequestValidator.ts`

Add validation method:

```typescript
private validateDiplomaProfile(
  request: AuthorizationRequest
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const profile = DIPLOMA_PRESENTATION_PROFILE;

  // Check for required claims in credential requirements
  const requestedClaims = this.extractRequestedClaims(request);
  
  for (const requiredClaim of profile.requiredClaims) {
    if (!requestedClaims.includes(requiredClaim)) {
      issues.push({
        severity: Severity.ERROR,  // Diploma requires all claims
        category: ValidationErrorCategory.CLAIM_VALIDATION,
        message: `Required diploma claim '${requiredClaim}' not requested`,
        context: {
          profile: "diploma-presentation",
          missingClaim: requiredClaim,
        },
        specReference: "Diploma Rulebook §3.1",
      });
    }
  }

  // Verify institution and degree claims present (core diploma data)
  const institutionClaims = ["institution_name", "institution_country"];
  const hasInstitutionData = institutionClaims.every(c => requestedClaims.includes(c));
  
  if (!hasInstitutionData) {
    issues.push({
      severity: Severity.ERROR,
      category: ValidationErrorCategory.CLAIM_VALIDATION,
      message: "Diploma profile requires both institution_name and institution_country",
      context: { profile: "diploma-presentation" },
      specReference: "Diploma Rulebook §3.1",
    });
  }

  return issues;
}
```

And for response validation:

**File**: `src/validators/PresentationResponseValidator.ts`

```typescript
private validateDiplomaProfile(
  credential: any
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const profile = DIPLOMA_PRESENTATION_PROFILE;

  // Verify all required claims are present
  for (const claim of profile.requiredClaims) {
    if (!credential[claim]) {
      issues.push({
        severity: Severity.ERROR,
        category: ValidationErrorCategory.CLAIM_VALIDATION,
        message: `Required diploma claim '${claim}' not found`,
        context: { missingClaim: claim },
        specReference: "Diploma Rulebook §3.1",
      });
    }
  }

  // Validate degree_name is non-empty string
  if (credential.degree_name && typeof credential.degree_name !== "string") {
    issues.push({
      severity: Severity.ERROR,
      category: ValidationErrorCategory.CLAIM_VALIDATION,
      message: "Diploma 'degree_name' claim must be a string",
      context: { claimType: typeof credential.degree_name },
      specReference: "Diploma Rulebook §3.2",
    });
  }

  // Validate date formats (graduation_date, issue_date)
  const dateClaims = ["graduation_date", "issue_date"];
  for (const dateClaim of dateClaims) {
    if (credential[dateClaim] && !this.isValidDateFormat(credential[dateClaim])) {
      issues.push({
        severity: Severity.ERROR,
        category: ValidationErrorCategory.CLAIM_VALIDATION,
        message: `Diploma '${dateClaim}' must be in YYYY-MM-DD format`,
        context: { providedValue: credential[dateClaim] },
        specReference: "Diploma Rulebook §3.3",
      });
    }
  }

  // Validate ECTS credits is non-negative number
  if (credential.ects_credits !== undefined && 
      (typeof credential.ects_credits !== "number" || credential.ects_credits < 0)) {
    issues.push({
      severity: Severity.ERROR,
      category: ValidationErrorCategory.CLAIM_VALIDATION,
      message: "Diploma 'ects_credits' must be a non-negative number",
      context: { providedValue: credential.ects_credits },
      specReference: "Diploma Rulebook §3.4",
    });
  }

  return issues;
}
```

#### Step 4: Register Profile in Validators

Add to switch statements in both `PresentationRequestValidator` and `PresentationResponseValidator`:

```typescript
// In validate() method
switch (profile) {
  case Profile.PID_PRESENTATION:
    issues.push(...this.validatePidPresentationProfile(request));
    break;

  case Profile.DIPLOMA_PRESENTATION:
    issues.push(...this.validateDiplomaProfile(request));  // NEW
    break;

  case Profile.BASE_OPENID4VP:
    // No additional checks
    break;

  case Profile.CUSTOM:
    issues.push(...this.validateCustomProfile(request));
    break;
}
```

#### Step 5: Update UI Selector

**File**: `web/src/components/InputForm.tsx`

Add new option to profile dropdown:

```typescript
import { Profile } from "../types.ts";

return (
  <select value={selectedProfile} onChange={(e) => setSelectedProfile(e.target.value)}>
    <option value={Profile.BASE_OPENID4VP}>Base OpenID4VP</option>
    <option value={Profile.PID_PRESENTATION}>EUDI HAIP (PID)</option>
    <option value={Profile.DIPLOMA_PRESENTATION}>Diploma (Higher Education EAA)</option>  {/* NEW */}
    <option value={Profile.CUSTOM}>Custom</option>
  </select>
);
```

#### Step 6: Test Your Profile

Create a test file:

**File**: `src/tests/profile-diploma.test.ts`

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
            birthdate: {},
            institution_name: {},
            institution_country: {},
            degree_name: {},
            field_of_study: {},
            graduation_date: {},
            issue_date: {},
            ects_credits: {},
          },
        }],
      },
    };

    const result = await validator.validate(request, Profile.DIPLOMA_PRESENTATION);
    
    // Should be valid (has all required claims)
    expect(result.isValid).toBe(true);
  });

  it("should reject request missing institution data", async () => {
    const request = {
      dcql_query: {
        credentials: [{
          claims: {
            given_name: {},
            family_name: {},
            degree_name: {},
            // Missing institution_name and institution_country
          },
        }],
      },
    };

    const result = await validator.validate(request, Profile.DIPLOMA_PRESENTATION);
    
    // Should have errors about missing institution data
    expect(result.issues.filter(i => i.severity === "ERROR").length).toBeGreaterThan(0);
  });

  it("should validate graduation_date format", async () => {
    const credential = {
      given_name: "Jane",
      family_name: "Smith",
      institution_name: "University of Example",
      degree_name: "Master of Science",
      graduation_date: "invalid-date",  // Wrong format
    };

    const issues = validator.validateDiplomaProfile(credential);
    
    expect(issues.some(i => i.message.includes("YYYY-MM-DD"))).toBe(true);
  });

  it("should validate ects_credits is non-negative", async () => {
    const credential = {
      given_name: "Jane",
      family_name: "Smith",
      institution_name: "University of Example",
      degree_name: "Master of Science",
      ects_credits: -10,  // Invalid negative value
    };

    const issues = validator.validateDiplomaProfile(credential);
    
    expect(issues.some(i => i.message.includes("non-negative"))).toBe(true);
  });
});
```

Run:
```bash
npm run test:core -- --testNamePattern="EAA Profile"
```

#### Step 7: Add to Documentation

Update this file to document the new profile:

```markdown
## Diploma Profile (Higher Education EAA)

Added in Phase 2.

### Purpose
Validate university degree credentials according to the Diploma EAA Rulebook. EAA (Electronic Attestation of Attributes) is a generic framework; this profile implements rules for a specific EAA use case.

### Required Claims
- Identity: given_name, family_name, birthdate
- Institution: institution_name, institution_country
- Degree: degree_name, field_of_study
- Dates: graduation_date, issue_date
- Credits: ects_credits

### EAA Rulebook Reference
https://data.europa.eu/api/hub/store/specification/diploma-rulebook

### Files Modified
- src/types/index.ts (Profile enum)
- src/profiles/DiplomaProfile.ts (definition)
- src/validators/PresentationRequestValidator.ts (validation)
- src/validators/PresentationResponseValidator.ts (validation)
```

---

## Common Profile Patterns

### Pattern 1: Strict Profile (Few Formats, One Algorithm)

```typescript
export const STRICT_PROFILE = {
  name: "strict",
  allowedFormats: ["dc+sd-jwt"],        // Only SD-JWT
  allowedSignatureAlgorithms: ["ES256"],  // Only ES256
  requiresHolderBinding: true,          // KB-JWT required
  trustedIssuers: ["https://issuer.example"],  // Whitelist only
};
```

**Use Case**: High-security scenarios (government credentials)

### Pattern 2: Flexible Profile (Multiple Options)

```typescript
export const FLEXIBLE_PROFILE = {
  name: "flexible",
  allowedFormats: ["dc+sd-jwt", "mso_mdoc", "jwt_vc"],  // Multiple
  allowedSignatureAlgorithms: ["ES256", "EdDSA", "RS256"],  // Multiple
  requiresHolderBinding: false,  // Optional KB-JWT
  trustedIssuers: undefined,  // Accept any issuer
};
```

**Use Case**: Early adopter/sandbox scenarios

### Pattern 3: Conditional Profile

```typescript
export const CONDITIONAL_PROFILE = {
  name: "conditional",
  rules: [
    {
      if: "credential.type === 'PID'",
      then: { requiresHolderBinding: true, allowedFormats: ["dc+sd-jwt"] },
    },
    {
      if: "credential.type === 'EAA'",
      then: { requiresHolderBinding: false, allowedFormats: ["mso_mdoc"] },
    },
  ],
};
```

**Use Case**: Multi-credential scenarios (PID + qualifications)

---

## Profile Discovery & Documentation

### Catalog Format

Create a profile catalog for UI/API documentation:

**File**: `src/profiles/ProfileCatalog.ts`

```typescript
export const PROFILE_CATALOG = {
  [Profile.BASE_OPENID4VP]: {
    name: "Base OpenID4VP",
    description: "Core OpenID4VP (1.0) requirements",
    icon: "🔐",
    specUrl: "https://openid.net/specs/openid4vc-core-1_0.html",
    riskLevel: "low",  // Conservative, widely supported
  },
  [Profile.PID_PRESENTATION]: {
    name: "EUDI HAIP (PID)",
    description: "European Digital Identity - Personal ID",
    icon: "🆔",
    specUrl: "https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html",
    riskLevel: "high",  // Strict requirements, secure
  },
  [Profile.EAA_PRESENTATION]: {
    name: "EAA (Employment)",
    description: "European Attribute Attestation for work/qualifications",
    icon: "💼",
    specUrl: "https://data.europa.eu/api/hub/store/specification/eaa-1.0.0",
    riskLevel: "medium",  // Balanced
  },
};
```

### UI Profile Selector with Descriptions

```typescript
import { PROFILE_CATALOG } from "../profiles/ProfileCatalog.ts";

return (
  <select value={selectedProfile} onChange={(e) => setSelectedProfile(e.target.value)}>
    {Object.entries(PROFILE_CATALOG).map(([key, meta]) => (
      <option key={key} value={key} title={meta.description}>
        {meta.icon} {meta.name}
      </option>
    ))}
  </select>
);
```

---

## Phase 2 Profile Backlog

Profiles to add in future phases (each implementing specific EAA Ruleooks or use cases):

- [ ] **Employment EAA Profile** (Work experience and skills attestations per Employment EAA Rulebook)
- [ ] **Driving License EAA Profile** (EU driving license per EDL Rulebook)
- [ ] **Higher Education Diploma EAA Profile** (University degrees per Diploma Rulebook - *example implemented above*)
- [ ] **Professional Qualification EAA Profile** (Trade certifications per PQA Rulebook)
- [ ] **SANDBOX Profile** (Minimal validation, testing only)
- [ ] **STRICT Profile** (Maximum validation, high-security)
- [ ] **CUSTOM Profile** (User-defined rules via JSON)

---

## API Reference

### IProfile Interface

```typescript
interface IProfile {
  name: string;                        // Unique identifier
  description?: string;                // Human-readable description
  requiredClaims: string[];            // Claims that MUST be present
  optionalClaims?: string[];           // Claims that MAY be present
  allowedFormats: string[];            // Allowed credential formats
  allowedSignatureAlgorithms: string[];  // Allowed signature algorithms
  requiresHolderBinding: boolean;      // Whether KB-JWT is required
  requiresNonce: boolean;              // Whether nonce check is required
  requiresAudience: boolean;           // Whether audience check is required
  trustedIssuers?: string[];           // Whitelist of trusted issuer URLs
  specReference?: string;              // URL to specification
}
```

---

## Reference

- [OpenID4VP Core §1](https://openid.net/specs/openid4vc-core-1_0.html#section-1) - Overview
- [HAIP Profile](https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html) - EUDI PID
- [EAA Specification](https://data.europa.eu/api/hub/store/specification/eaa-1.0.0) - Employment Attestation
- [Profile Pattern Design](./EXTENDING_PROFILES.md)

