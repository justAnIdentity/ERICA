# EUDI VP Debugger - Project Setup Summary

## ✅ Completed

### 1. Project Initialization
- ✓ TypeScript configuration (`tsconfig.json`)
- ✓ NPM package setup (`package.json`)
- ✓ Git configuration (`.gitignore`)
- ✓ Documentation (`README.md`)

### 2. Core Architecture Implemented

The project follows a modular architecture with these core components:

```
src/
├── types/
│   └── index.ts                           # Shared TypeScript interfaces & enums
├── validators/
│   ├── PresentationRequestValidator.ts   # Request validation (syntax, semantics, profile)
│   ├── PresentationRequestURLParser.ts   # URL parameter parsing
│   ├── PresentationResponseValidator.ts  # Response validation (crypto, trust, semantics)
│   └── index.ts
├── simulator/
│   ├── WalletSimulator.ts                # Main wallet behavior simulator
│   ├── WalletSimulatorOrchestrator.ts    # Orchestrates credential matching and response assembly
│   ├── CredentialMatcher.ts              # Matches available credentials to request requirements
│   ├── CredentialTemplate.ts             # Template structure for credential data
│   ├── PresentationResponseAssembler.ts  # Assembles VP tokens and responses
│   ├── PIDDataGenerator.ts               # Generates PID-specific test data
│   ├── PIDTemplateLoader.ts              # Loads PID templates from files
│   ├── FakePIDData.ts                    # Fake PID data for testing
│   ├── SDJWTGenerator.ts                 # Generates SD-JWT credentials
│   ├── CredoSDJWTGenerator.ts            # Credo library-based SD-JWT generation
│   ├── KeyManager.ts                     # Cryptographic key management
│   ├── TestKeys.ts                       # Pre-configured test keys
│   ├── SimulationModeHandler.ts          # Applies intentional faults for testing
│   ├── WalletSimulatorDiagnostics.ts    # Diagnostic utilities for simulator
│   ├── index.ts
│   └── pid-templates/                    # PID template files (JSON)
├── profiles/
│   ├── IValidationProfile.ts             # Profile interface contract
│   ├── BaseOpenID4VPProfile.ts           # OpenID4VP-Core requirements
│   ├── PIDPresentationProfile.ts         # EUDI HAIP Profile for PID Presentation
│   ├── ValidationProfileRegistry.ts      # Profile registry for dynamic profile management
│   └── index.ts
├── explainability/
│   ├── ExplainabilityEngine.ts           # Diagnostics & spec mapping orchestrator
│   └── index.ts
├── utils/
│   ├── Logger.ts                         # Logging utilities
│   ├── ClaimNameMapper.ts                # Claim name mapping utilities
│   └── index.ts
├── index.ts                               # Main orchestrator (EudiVpDebugger)
├── runtime.ts                            # Runtime utilities
└── tests/                                 # Test suite
    ├── integration/
    │   └── *.test.ts
    └── unit/
        └── *.test.ts
```

### 3. Core Components

#### a) **Types System** (`src/types/index.ts`)
- ValidationResult, ValidationIssue, Severity
- AuthorizationRequest, PresentationDefinition
- VerifiableCredential, PresentationResponse
- DiagnosticEvent, DiagnosticReport
- Profile, SimulationMode enums

#### b) **Validators** (`src/validators/`)
- `PresentationRequestValidator`: Validates requests for syntax, semantics, profile compliance
- `PresentationRequestURLParser`: Parses authorization request URLs
- `PresentationResponseValidator`: Validates responses as an RP would
- Both implement standardized interfaces (`IPresentationRequestValidator`, `IPresentationResponseValidator`)

#### c) **Wallet Simulator** (`src/simulator/`)
- `WalletSimulator`: Main entry point for simulating wallet behavior
- `WalletSimulatorOrchestrator`: Coordinates credential matching and response assembly
- `CredentialMatcher`: Matches available credentials against request requirements
- `PresentationResponseAssembler`: Constructs VP tokens and complete responses
- `PIDDataGenerator`: Generates realistic PID test data
- `PIDTemplateLoader`: Loads credential templates from JSON files
- `SDJWTGenerator` & `CredoSDJWTGenerator`: Generate SD-JWT credentials
- `KeyManager`: Manages cryptographic keys and certificate chains
- `SimulationModeHandler`: Applies intentional faults (invalid signatures, expired credentials, etc.)
- Supports multiple simulation modes (COMPLIANT, PARTIAL_DISCLOSURE, INVALID_SIGNATURE, EXPIRED, etc.)

#### d) **Validation Profiles** (`src/profiles/`)
- `IValidationProfile`: Interface defining profile contract
- `ValidationProfileRegistry`: Manages available profiles
- `BaseOpenID4VPProfile`: Implements OpenID4VP-Core requirements
- `PIDPresentationProfile`: Implements EUDI HAIP Profile for PID Presentation
- Each profile enforces specific validation rules and claim mappings

#### e) **Explainability Engine** (`src/explainability/`)
- `ExplainabilityEngine`: Main orchestrator for diagnostics
- Collects diagnostic events throughout the validation pipeline
- Maps error codes to spec sections
- Classifies common RP implementation mistakes
- Generates diagnostic reports

#### f) **Main Orchestrator** (`src/index.ts`)
- `EudiVpDebugger`: Coordinates all components
- Provides high-level API methods:
  - `debug()` - Full pipeline (request validation → simulation → response validation)
  - `validateRequest()` - Isolated request validation
  - `validateResponse()` - Isolated response validation
  - `getSupportedProfiles()` - List available profiles
  - `getSupportedFormats()` - List available formats

### 4. Build System
- ✓ TypeScript compilation to ES2020 modules
- ✓ Source maps for debugging
- ✓ Declaration files for type exports
- ✓ NPM scripts: `build`, `dev` (watch), `test`, `lint`, `type-check`, `clean`

### 5. Testing
- ✓ Unit tests for request/response validators
- ✓ Integration tests for full pipeline
- ✓ Wallet simulator tests
- ✓ Feature discovery tests
- Test infrastructure with Node.js native test runner

Run tests with:
```bash
npm test                    # All tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
```

---

## 🏗️ Architecture Decisions

### Modularity
- Each component has clear, single responsibility
- Interfaces define contracts (e.g., `ICredentialFormatAdapter`, `IProfilePlugin`)
- Registry pattern enables extensibility without modifying core

### Pluggability
- New validation profiles can be registered dynamically
- Profiles implement `IValidationProfile` interface
- New simulation modes can be added via `SimulationModeHandler`
- Credential templates support multiple formats

### Type Safety
- Full TypeScript strict mode
- Exported interfaces for all public APIs
- Enums for controlled values (Severity, ValidationErrorCategory, etc.)

### Extensibility Prepared
- Format adapter framework ready for new credential types
- Profile plugin framework ready for custom profiles
- Spec reference mapper ready for comprehensive documentation

---

## 🛠️ Current Implementation Status

### ✅ Fully Implemented

1. **Core Validators** - Request and Response validation with syntax/semantic checks
2. **Wallet Simulator** - Complete credential matching and response assembly pipeline
3. **PID Data Generation** - Realistic test data generation with multiple templates
4. **SD-JWT Support** - SD-JWT credential generation with disclosure verification
5. **Profile System** - Multiple validation profiles with registry pattern
6. **Key Management** - Cryptographic key handling and certificate chains
7. **Test Infrastructure** - Comprehensive unit and integration tests

### 🔄 In Progress / Future

1. **Full Spec Coverage** - Expanding semantic validation checks against latest specs
2. **MDoc Support** - ISO/IEC 18013-5 mDoc format implementation (Phase 2)
3. **Advanced Diagnostics** - Enhanced RP mistake detection and reporting
4. **Extended Profiles** - Additional EUDI profiles as specifications mature
5. **API/UI Enhancements** - Improved web interface and REST API

---

## 📦 Project Dependencies

### Core
- **@credo-ts/core** - Verifiable credentials framework
- **@credo-ts/node** - Node.js bindings
- **@credo-ts/openid4vc** - OpenID4VC protocol support
- **jose** - JWT/JOSE operations

### API (Express)
- **express** - HTTP server framework
- **cors** - Cross-origin resource sharing

### Web (React)
- **react** - UI framework
- **axios** - HTTP client
- **recharts** - Data visualization
- **tailwindcss** - CSS framework
- **vite** - Build tool

---

## 📋 Quick Commands

```bash
# Build all modules
npm run build

# Watch mode (development)
npm run dev

# Type checking
npm run type-check

# Run all tests
npm test

# Run specific test categories
npm run test:unit
npm run test:integration

# Clean build artifacts
npm run clean

# Lint code
npm run lint

# Docker (development)
docker-compose up
```

Access the web UI at `http://localhost:3001` (when running via Docker).

---

## 🚀 Getting Started with Development

1. **Clone and install**:
   ```bash
   git clone <repo>
   cd eudi-vp-debugger
   npm install
   ```

2. **Run in watch mode**:
   ```bash
   npm run dev
   ```

3. **Build for production**:
   ```bash
   npm run build
   ```

4. **Run tests**:
   ```bash
   npm test
   ```

5. **Docker deployment**:
   ```bash
   docker-compose up
   ```

---

## 📚 Architecture Highlights

### Request-Response Pipeline
```
PresentationRequest (URL) 
  ↓
[PresentationRequestValidator] → ValidationResult
  ↓
[WalletSimulator] → generates appropriate response based on profile
  ↓
[PresentationResponseValidator] → validates RP would receive
  ↓
[ExplainabilityEngine] → diagnostic report
```

### Profile-Based Validation
- Each profile enforces different rules
- `BaseOpenID4VPProfile`: Core OpenID4VP requirements
- `PIDPresentationProfile`: EUDI HAIP-specific requirements
- New profiles can be added by implementing `IValidationProfile`

### Simulation Modes
- `COMPLIANT`: Generates fully compliant responses
- `PARTIAL_DISCLOSURE`: Tests selective disclosure
- `INVALID_SIGNATURE`: Tests signature validation
- `EXPIRED`: Tests expiration handling
- Additional modes can be defined in `SimulationModeHandler`

# Clean build artifacts
npm run clean

# Linting (when configured)
npm run lint
```

---

## 📚 Key File Locations

| Component | File |
|-----------|------|
| Type Definitions | [src/types/index.ts](src/types/index.ts) |
| Request Validator | [src/validators/PresentationRequestValidator.ts](src/validators/PresentationRequestValidator.ts) |
| Response Validator | [src/validators/PresentationResponseValidator.ts](src/validators/PresentationResponseValidator.ts) |
| Wallet Simulator | [src/simulator/WalletSimulator.ts](src/simulator/WalletSimulator.ts) |
| Format Registry | [src/formats/FormatAdapterRegistry.ts](src/formats/FormatAdapterRegistry.ts) |
| Profile Registry | [src/profiles/ProfilePluginRegistry.ts](src/profiles/ProfilePluginRegistry.ts) |
| Explainability | [src/explainability/ExplainabilityEngine.ts](src/explainability/ExplainabilityEngine.ts) |
| Main Orchestrator | [src/index.ts](src/index.ts) |
| Integration Test | [src/integration.test.ts](src/integration.test.ts) |

---

## ✨ What's Working Now

✅ Type system and interfaces  
✅ Core component architecture  
✅ Pluggable adapters (formats, profiles)  
✅ Basic validation hooks  
✅ Explainability engine structure  
✅ TypeScript compilation  
✅ Integration test passing  

---

## 🎯 Project Status

**Status:** Foundation complete, ready for implementation

The plumbing is solid. All components are properly typed and integrated. The system is prepared for incremental implementation of:
1. Validation logic
2. Credential format handling
3. VP token generation
4. Comprehensive diagnostics

The architecture supports the full specification-aware, extensible debugging tool as designed.
