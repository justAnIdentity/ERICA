/**
 * Test: Registrar Trust List Integration
 * Validates EUDI trust list parsing and Access Certificate validation
 */

import { describe, it, before } from "node:test";
import assert from "node:assert";
import { TrustListManager } from "../../security/TrustListManager.js";

describe("Registrar Trust List Integration", () => {
  before(async () => {
    // Initialize trust list manager
    const trustListManager = TrustListManager.getInstance();
    await trustListManager.initialize();
  });

  it("should load Registrar certificates from registrar.jwt", async () => {
    const trustListManager = TrustListManager.getInstance();
    const registrars = trustListManager.getRegistrarCertificates();

    // Should have loaded at least one Registrar certificate
    assert.ok(registrars.length > 0, "Expected at least one Registrar certificate");

    console.log(`✓ Loaded ${registrars.length} Registrar certificate(s)`);

    // Verify certificate structure
    for (const registrar of registrars) {
      assert.ok(registrar.commonName, "Registrar should have commonName");
      assert.ok(registrar.organization, "Registrar should have organization");
      assert.ok(registrar.certificate, "Registrar should have certificate object");
      assert.ok(registrar.fingerprint, "Registrar should have fingerprint");
      assert.ok(registrar.serviceType, "Registrar should have serviceType");

      console.log(`  - ${registrar.commonName} (${registrar.organization}, ${registrar.serviceType})`);
      console.log(`    Fingerprint: ${registrar.fingerprint}`);
      console.log(`    Valid: ${registrar.validFrom.toISOString()} - ${registrar.validTo.toISOString()}`);
    }
  });

  it("should validate Access Certificate structure (without real cert)", async () => {
    const trustListManager = TrustListManager.getInstance();

    // Test with empty certificate (should fail gracefully)
    const result = await trustListManager.validateAccessCertificate("");

    assert.strictEqual(result.valid, false, "Empty certificate should be invalid");
    assert.strictEqual(result.trusted, false, "Empty certificate should not be trusted");
    assert.ok(result.errors.length > 0, "Should have error messages");

    console.log("✓ Empty certificate validation failed as expected");
  });

  it("should detect invalid base64 certificate", async () => {
    const trustListManager = TrustListManager.getInstance();

    // Test with invalid base64
    const result = await trustListManager.validateAccessCertificate("not-valid-base64!!!");

    assert.strictEqual(result.valid, false, "Invalid base64 should be invalid");
    assert.strictEqual(result.trusted, false, "Invalid base64 should not be trusted");
    assert.ok(result.errors.length > 0, "Should have error messages");

    console.log("✓ Invalid base64 certificate validation failed as expected");
  });
});
