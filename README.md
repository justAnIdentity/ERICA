# EUDI VP Debugger

A comprehensive TypeScript debugging tool for OpenID4VP Presentation Requests and Responses, with support for the EUDI Wallet Architecture & Reference Framework.

**Status**: MVP-grade sandbox debugger for testing RP implementations. Validation checks are manually maintained against specifications.

## Purpose

This tool helps relying parties (RPs) integrating with the German EUDI ecosystem:

- **Validate** OpenID4VP Presentation Requests (syntax, semantics, profile compliance)
- **Simulate** compliant wallet behavior and intentionally invalid test cases
- **Validate** Presentation Responses as an RP would (cryptography, trust, semantics)
- **Debug** common RP implementation mistakes with spec-aware guidance

## Validation Correctness

This is a **sandbox debugging tool**, not production software. Validation checks are manually verified against specifications.

**Before using in production, you must**:
1. Review [VALIDATION_CHECKLIST.md](docs/VALIDATION_CHECKLIST.md) to understand what's checked
2. Read [MANUAL_VALIDATION_PROCESS.md](docs/MANUAL_VALIDATION_PROCESS.md) for audit methodology
3. Verify the checks match your understanding of the specs

See [Deployment Guide](docs/DEPLOYMENT.md) for running ERICA.

## Architecture

The tool is organized into modular components:

### Core Modules

- **`validators/`** - Presentation Request & Response validators
- **`simulator/`** - Wallet behavior simulator (compliant and faulty modes)
- **`profiles/`** - Validation profiles (OpenID4VP base, PID Presentation, etc.)
- **`explainability/`** - Diagnostic event collection and spec reference mapping
- **`types/`** - Shared TypeScript interfaces and enums
- **`utils/`** - Utilities including claim mapping and logging

### Key Components

```
EudiVpDebugger (main orchestrator)
├── PresentationRequestValidator
├── PresentationResponseValidator
├── WalletSimulator
└── ExplainabilityEngine
```

## Getting Started

### Installation

```bash
npm install
```

### Building

```bash
npm run build
```

### Running Tests

```bash
npm test
```

### Development (watch mode)

```bash
npm run dev
```

### Docker (Recommended)

```bash
# Build and run
docker-compose up

# Access web UI at http://localhost:3001
# API endpoint at http://localhost:3001/api/debug
```

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed Docker instructions.

## Usage Example

```typescript
import { EudiVpDebugger, Profile, SimulationMode } from "./src/index.js";

const vpdebugger = new EudiVpDebugger();

// Validate a Presentation Request
const requestValidation = await vpdebugger.validateRequest(
  authorizationRequest,
  Profile.PID_PRESENTATION
);

// Run full debug session
const session = await vpdebugger.debug(
  authorizationRequest,
  Profile.EUDI_ARF,
  SimulationMode.COMPLIANT
);

console.log(session.diagnostics);
```

## Supported Credential Formats

- `jwt_vc` - JWT-based VCs
- `vc+sd-jwt` - SD-JWT VCs (selective disclosure)
- `mso_mdoc` - ISO mDoc (CBOR + COSE) [Phase 2]

## Supported Profiles

- **base** - OpenID4VP-Core requirements
- **pid-presentation** - EUDI HAIP Profile for PID Presentation
- **eaa-presentation** - EUDI HAIP Profile for EAA [Phase 2]

## Documentation

- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - How to run ERICA (Docker, Kubernetes, etc.)
- [VALIDATION_CHECKLIST.md](docs/VALIDATION_CHECKLIST.md) - What validations are implemented
- [MANUAL_VALIDATION_PROCESS.md](docs/MANUAL_VALIDATION_PROCESS.md) - How to audit the checks
- [MVP_ROADMAP.md](MVP_ROADMAP.md) - Implementation roadmap and backlog

## Extensibility

### Adding a Custom Profile

```typescript
class CustomProfile implements IValidationProfile {
  profileId = "custom";
  // Implement interface methods...
}

profileRegistry.register(new CustomProfile());
```

See [docs/EXTENDING_PROFILES.md](docs/EXTENDING_PROFILES.md) [Phase 2] for detailed guide.

### Adding Test Scenarios

See [docs/EXTENDING_SCENARIOS.md](docs/EXTENDING_SCENARIOS.md) [Phase 2] for how to add new simulation modes and test cases.

## Dependencies

- **jose** - JWT/JOSE operations
- **@credo-ts/core** - Credential handling
- **@credo-ts/openid4vc** - OpenID4VC protocol support
- **TypeScript 5.3+**
- **Node.js 18+**

## License

MIT

## Contributing

This project is open source. When contributing validation checks, please:

1. Add a test case to [VALIDATION_CHECKLIST.md](docs/VALIDATION_CHECKLIST.md)
2. Reference the relevant spec section
3. Add inline code comments explaining the check
4. Test with both valid and invalid inputs

See [MANUAL_VALIDATION_PROCESS.md](docs/MANUAL_VALIDATION_PROCESS.md) for audit guidelines.

## References

- [OpenID4VP-Core](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
- [OpenID4VP HAIP](https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0-ID1.html)
- [EUDI Wallet Architecture & Reference Framework](https://github.com/eu-digital-identity-wallet/architecture-and-reference-framework)
- [SD-JWT](https://datatracker.ietf.org/doc/draft-ietf-oauth-selective-disclosure-jwt/)
- [ISO/IEC 18013-5:2021 (mDoc)](https://www.iso.org/standard/69084.html)


