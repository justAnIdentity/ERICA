/**
 * Quick test of enhanced validator with detailed checks
 */

import { PresentationRequestValidator } from "./dist/validators/PresentationRequestValidator.js";

const validator = new PresentationRequestValidator();

// Test with a valid request
const validRequest = {
  clientId: "x509_hash:abc123",
  responseType: "vp_token",
  responseMode: "direct_post.jwt",
  responseUri: "https://example.com/callback",
  nonce: "85d5e24a-7163-4e44-a0ed-94be98cab666",
  state: "state-123",
  dcqlQuery: {
    credentials: [
      {
        id: "pid-sd-jwt",
        format: "dc+sd-jwt",
        claims: [
          { path: ["given_name"] },
          { path: ["family_name"] }
        ],
        meta: {
          vctValues: ["urn:eudi:pid:de:1"]
        }
      }
    ],
    credentialSets: [
      { options: [["pid-sd-jwt"]] }
    ]
  },
  clientMetadata: {
    jwks: {
      keys: [{
        kty: "EC",
        crv: "P-256",
        x: "ShU4Fr3NH7v9TOAc9aYiu9eicdkfVT9ecVCPaPgJrMs",
        y: "iV0VXASylR0qWoDr_mKUWwzo-M59Wz3QBzpCm4oiXT0"
      }]
    }
  }
};

console.log("========================================");
console.log("Testing VALID Request");
console.log("========================================\n");

const result1 = await validator.validate(validRequest, "pid-presentation");

console.log(`✅ Validation Result: ${result1.valid ? "PASSED" : "FAILED"}`);
console.log(`📊 Total Checks: ${result1.checks.length}`);
console.log(`✓ Passed: ${result1.summary.passedChecks}`);
console.log(`✗ Failed: ${result1.summary.failedChecks}`);
console.log(`📈 Compliance: ${result1.summary.compliancePercentage}%`);
console.log(`🚨 Errors: ${result1.summary.errorCount}`);
console.log(`⚠️  Warnings: ${result1.summary.warningCount}`);

console.log("\n📋 Checks by Category:");
result1.summary.checksByCategory.forEach(cat => {
  console.log(`  ${cat.category}: ${cat.passed}/${cat.total} passed`);
});

console.log("\n🔍 First 5 Checks:");
result1.checks.slice(0, 5).forEach(check => {
  const icon = check.passed ? "✅" : "❌";
  console.log(`  ${icon} [${check.checkId}] ${check.checkName}`);
  console.log(`     Field: ${check.field}`);
  console.log(`     Expected: ${check.expectedValue}`);
  console.log(`     Actual: ${check.actualValue}`);
  if (!check.passed) {
    console.log(`     Issue: ${check.issue}`);
  }
  console.log("");
});

// Test with invalid request
console.log("\n========================================");
console.log("Testing INVALID Request (missing fields)");
console.log("========================================\n");

const invalidRequest = {
  clientId: "test-client", // Wrong format
  responseType: "code", // Wrong type
  // Missing many required fields
};

const result2 = await validator.validate(invalidRequest, "pid-presentation");

console.log(`✅ Validation Result: ${result2.valid ? "PASSED" : "FAILED"}`);
console.log(`📊 Total Checks: ${result2.checks.length}`);
console.log(`✓ Passed: ${result2.summary.passedChecks}`);
console.log(`✗ Failed: ${result2.summary.failedChecks}`);
console.log(`📈 Compliance: ${result2.summary.compliancePercentage}%`);
console.log(`🚨 Errors: ${result2.summary.errorCount}`);
console.log(`⚠️  Warnings: ${result2.summary.warningCount}`);

console.log("\n❌ Failed Checks:");
result2.checks.filter(c => !c.passed).slice(0, 10).forEach(check => {
  console.log(`  [${check.checkId}] ${check.checkName}`);
  console.log(`     Field: ${check.field}`);
  console.log(`     Expected: ${check.expectedValue}, Got: ${check.actualValue}`);
  console.log(`     Issue: ${check.issue}`);
  if (check.suggestedFix) {
    console.log(`     💡 Fix: ${check.suggestedFix}`);
  }
  console.log("");
});

console.log("\n========================================");
console.log("✅ Validator Check System Working!");
console.log("========================================");
