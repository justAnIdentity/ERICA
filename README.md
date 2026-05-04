# ERICA - EUDI Relying Party Integration Compliance Analyzer

A comprehensive debugging tool for OpenID4VP Presentation Requests and Responses, supporting the EUDI Wallet Architecture & Reference Framework.

---

## Important Disclaimer

**ERICA is a development and debugging tool - NOT a compliance certification service.**

- Passing all checks in ERICA does not guarantee compliance with EUDI sandbox requirements
- ERICA helps developers identify common issues and speed up integration
- ERICA checks are manually maintained and may not be complete or correct
- There is no guarantee of completeness or correctness - always verify against official specifications

**Before production deployment:**
1. Conduct thorough security audits
2. Verify compliance with official EUDI certification processes
3. Test against official EUDI conformance tests
4. Review [VALIDATION_CHECKLIST.md](docs/VALIDATION_CHECKLIST.md) to understand what ERICA checks

**ERICA is provided as-is for development assistance only. Your own compliance verification is required.**

---

## Quick Start with Docker

The easiest way to run ERICA is using Docker:

```bash
# Clone the repository
git clone https://github.com/justAnIdentity/ERICA.git
cd ERICA

# Start ERICA with Docker Compose
docker-compose up -d

# Access the web UI
open http://localhost:3001
```

ERICA will be available at `http://localhost:3001` with both the web interface and API endpoints.

### Docker Components

The Docker setup includes:
- Web Frontend (port 3001) - Interactive debugging interface
- API Server (port 3001/api) - REST API for validation and simulation
- Core Library - Validation and simulation engine

---

## What Does ERICA Do?

ERICA helps Relying Parties (RPs) integrating with the EUDI Wallet ecosystem by providing:

### 1. Request Validation
Analyzes OpenID4VP Presentation Requests for:
- Syntax correctness (valid JWT structure, URL format)
- Required fields (client_id, nonce, response_uri, etc.)
- DCQL query structure and credential requests
- Security checks (certificate validation, signature verification)
- Profile compliance (EUDI HAIP, ARF requirements)

### 2. Wallet Simulation
Simulates different wallet behaviors:
- Compliant Mode - Generates valid PID presentations
- Test Modes - Simulates common errors (expired credentials, wrong signatures, etc.)
- SD-JWT Support - Selective disclosure with proper crypto
- Certificate Infrastructure - Uses stable test certificates for consistent testing

### 3. Response Validation
Validates wallet responses from the RP's perspective:
- VP Token structure and format
- Credential signatures and trust chains
- Holder binding (KB-JWT validation)
- Nonce and audience verification
- Claim matching against requested attributes

### 4. Trust List Management
- Registrar Validation - Checks RP Access Certificates against trust list
- Certificate Expiration - Validates certificate validity periods
- Signature Verification - Verifies JWT signatures using certificate public keys

---

## Using the Web Interface

### Basic Usage

1. **Choose Input Method:**
   - Authorization URL - Paste a complete `openid4vp://` or `https://` URL
   - JSON Request - Paste or edit the request JSON directly

2. **Enter Your Request:**
   - Paste an authorization URL from your RP
   - Or paste/edit the JSON request object
   - ERICA validates as you type

3. **Review Validation Results:**
   - Technical Details - All validation checks organized by category
   - Summary - Pass/fail overview with error counts
   - Diagnostics - Detailed explanations and spec references

### Advanced Options

Click "Advanced Options" to access:

#### Wallet Simulation Settings

- **Simulation Mode:**

  Available modes:
  - `VALID` - Generates valid, spec-compliant responses
  - `EXPIRED` - Simulates expired credential (exp in past)
  - `NOT_YET_VALID` - Simulates not-yet-valid credential (nbf in future)
  - `INVALID_SIGNATURE` - Signature signed with wrong key
  - `MISSING_SIGNATURE` - Credential without signature
  - `MISSING_CLAIMS` - Omits requested attributes
  - `OVER_DISCLOSURE` - Returns more claims than requested
  - `WRONG_NONCE` - Uses incorrect nonce in KB-JWT
  - `MISSING_HOLDER_BINDING` - Omits KB-JWT entirely
  - `WRONG_AUDIENCE` - Uses incorrect audience in KB-JWT

  Planned modes (not yet implemented):
  - `MODIFIED_CLAIMS` - Tampered claim values
  - `FORMAT_MISMATCH` - Wrong credential format
  - `MALFORMED_SD_JWT` - Invalid SD-JWT structure
  - `WRONG_ISSUER` - Incorrect issuer DID/URL
  - `WRONG_CREDENTIAL_TYPE` - Incorrect vct value

- **PID Template:**
  - `normal` - Standard German PID data
  - `special-characters` - Tests Unicode/special characters (umlauts, etc.)
  - `incomplete-birthdate` - Tests partial birthdate formats

- **Preferred Credential Format:**
  - `dc+sd-jwt` - SD-JWT format (default, recommended)
  - `mso_mdoc` - ISO mDoc format (not yet supported)

#### Response Behavior

- **Post Response to URI:**
  - Enable to simulate wallet posting response to `response_uri`
  - Useful for testing your RP's callback endpoint
  - ERICA will show the POST result (success/failure)

### Understanding Results

#### Validation Checks are Categorized:

- Syntax - Basic format and structure errors
- Semantics - Logical consistency and field relationships
- Security - Cryptographic validation and trust anchors
- Profile - EUDI-specific requirements (ARF, HAIP)
- Protocol - OpenID4VP protocol compliance

#### Check Status:

- PASS - Check succeeded
- FAIL - Check failed (see details for explanation)
- WARNING - Potential issue (may be acceptable in some contexts)

Each failed check includes:
- Issue - What went wrong
- Suggested Fix - How to resolve it
- Spec Reference - Link to relevant specification (when available)

---

## API Usage

ERICA also provides a REST API for automated testing:

```bash
# Validate and simulate a request
curl -X POST http://localhost:3001/api/debug \
  -H "Content-Type: application/json" \
  -d '{
    "url": "openid4vp://...",
    "profile": "eudi-arf",
    "simulationMode": "COMPLIANT"
  }'
```

---

## Development Setup

### Prerequisites

- Node.js 18+ (Node 20+ recommended)
- npm 9+
- Docker (for containerized deployment)

### Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Start development server
npm run dev
```

### Project Structure

```
eudi-vp-debugger/
├── src/                    # Core library
│   ├── validators/         # Request/Response validation
│   ├── simulator/          # Wallet behavior simulation
│   ├── security/           # Certificate and trust management
│   ├── types/             # TypeScript interfaces
│   └── index.ts           # Main entry point
├── api/                    # REST API server
│   └── src/
│       └── routes/        # API endpoints
├── web/                    # React frontend
│   └── src/
│       └── components/    # UI components
├── docs/                   # Documentation
└── docker-compose.yml      # Docker setup
```

---

## Contributing

We welcome contributions! Here's how you can help:

### Reporting Bugs

Found a bug? Please report it:

1. Check existing issues at [GitHub Issues](https://github.com/justAnIdentity/ERICA/issues)
2. Create a new issue with:
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Sample request/response (if applicable)
   - Your environment (OS, Node version, Docker version)

### Requesting Features

Have an idea for ERICA?

1. Open a feature request at [GitHub Issues](https://github.com/justAnIdentity/ERICA/issues)
2. Describe:
   - The use case / problem you're trying to solve
   - Proposed solution (if you have one)
   - Why it would be valuable for other developers

### Contributing Code

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes with:
   - Clear commit messages
   - Tests for new functionality
   - Updated documentation
   - Code comments explaining complex logic
4. Ensure tests pass: `npm test`
5. Submit a Pull Request with:
   - Description of changes
   - Reference to related issue (if applicable)
   - Any breaking changes highlighted

#### Validation Check Contributions

When adding validation checks:
1. Add entry to [VALIDATION_CHECKLIST.md](docs/VALIDATION_CHECKLIST.md)
2. Reference the specific spec section (with URL)
3. Include both positive and negative test cases
4. Add inline comments explaining the check
5. Update this README if needed

---

## Documentation

- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Docker deployment guide
- [VALIDATION_CHECKLIST.md](docs/VALIDATION_CHECKLIST.md) - Complete list of validation checks
- [KEY_MANAGEMENT.md](docs/KEY_MANAGEMENT.md) - Certificate and key management
- [EXTENDING_PROFILES.md](docs/EXTENDING_PROFILES.md) - Adding new validation profiles
- [EXTENDING_SCENARIOS.md](docs/EXTENDING_SCENARIOS.md) - Adding new simulation modes

---

## Security & Certificates

### Test Certificates

ERICA uses stable test certificates for the wallet simulator:

- PID Issuer Certificate - Available at `GET /api/issuer/trust-anchor`
- Registrar Certificates - Loaded from `src/security/trustlist/registrar.jwt`

All certificates are TEST ONLY - clearly labeled "DO NOT USE IN PRODUCTION"

For RPs testing against ERICA:
1. Fetch the issuer trust anchor: `curl http://localhost:3001/api/issuer/trust-anchor`
2. Add to your test trust list (test environment only)
3. Your RP can now verify PIDs signed by ERICA's wallet simulator

See [KEY_MANAGEMENT.md](docs/KEY_MANAGEMENT.md) for certificate details.

---

## Specifications & Standards

ERICA implements validation based on:

- [OpenID4VP 1.0](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
- [OpenID4VP HAIP](https://openid.net/specs/openid4vc-high-assurance-interoperability-profile-1_0.html)
- [EUDI Wallet ARF](https://github.com/eu-digital-identity-wallet/architecture-and-reference-framework)
- [SD-JWT](https://datatracker.ietf.org/doc/draft-ietf-oauth-selective-disclosure-jwt/)
- [ISO/IEC 18013-5:2021 (mDoc)](https://www.iso.org/standard/69084.html)

Note: Specifications evolve. Always verify against the latest official versions.
