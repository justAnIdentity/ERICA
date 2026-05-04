/**
 * Integration test: Certificate Infrastructure
 * Tests X.509 certificate chain generation and integration with wallet simulator
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { CertificateManager } from '../../security/CertificateManager.js';
import { initializeRuntime } from '../../runtime.js';
import { getSDJWTGenerator } from '../../simulator/CredoSDJWTGenerator.js';
import { SimulationMode } from '../../types/index.js';

test('Certificate infrastructure initialization', async () => {
  // Initialize runtime (this sets up certificates)
  await initializeRuntime();

  const certManager = CertificateManager.getInstance();
  const chain = certManager.getCertificateChain();

  console.log('\n=== Certificate Chain ===');
  console.log(`Root CA: ${chain.rootCA.cert.subject.typesAndValues[3].value.toString()}`);
  console.log(`Leaf Cert: ${chain.leafCert.cert.subject.typesAndValues[2].value.toString()}`);

  // Verify x5c array has 2 certificates
  assert.strictEqual(chain.x5c.length, 2, 'x5c should contain 2 certificates');
  console.log(`\nx5c array length: ${chain.x5c.length} ✓`);

  // Verify trust anchor is available
  assert.ok(chain.trustAnchor.pem.includes('BEGIN CERTIFICATE'), 'Trust anchor PEM should be valid');
  assert.ok(chain.trustAnchor.der.length > 0, 'Trust anchor DER should exist');
  console.log(`Trust anchor PEM format: ${chain.trustAnchor.pem.substring(0, 30)}... ✓`);
  console.log(`Trust anchor DER size: ${chain.trustAnchor.der.length} bytes ✓`);
});

test('SD-JWT generation includes x5c header', async () => {
  // Ensure runtime is initialized
  await initializeRuntime();

  const generator = getSDJWTGenerator();

  // Generate an SD-JWT credential
  const result = await generator.generate({
    mode: SimulationMode.VALID,
    requestedClaims: [['given_name'], ['family_name']],
    nonce: 'test-nonce',
    audience: 'https://example.com',
  });

  console.log('\n=== SD-JWT with x5c ===');
  console.log(`JWT Header: ${JSON.stringify(result.decoded.jwt.header, null, 2)}`);

  // Verify x5c is in the header
  assert.ok(result.decoded.jwt.header.x5c, 'JWT header should contain x5c');
  assert.ok(Array.isArray(result.decoded.jwt.header.x5c), 'x5c should be an array');
  assert.strictEqual(result.decoded.jwt.header.x5c.length, 2, 'x5c should contain 2 certificates');

  console.log(`\nx5c found in JWT header with ${result.decoded.jwt.header.x5c.length} certificates ✓`);
  console.log(`First certificate (leaf) length: ${result.decoded.jwt.header.x5c[0].length} bytes ✓`);
  console.log(`Second certificate (root) length: ${result.decoded.jwt.header.x5c[1].length} bytes ✓`);
});

test('Trust anchor export works', async () => {
  await initializeRuntime();

  const certManager = CertificateManager.getInstance();
  const trustAnchor = certManager.getTrustAnchor();

  console.log('\n=== Trust Anchor Export ===');

  // Verify PEM format
  assert.ok(trustAnchor.pem.includes('-----BEGIN CERTIFICATE-----'), 'Should have PEM BEGIN marker');
  assert.ok(trustAnchor.pem.includes('-----END CERTIFICATE-----'), 'Should have PEM END marker');
  console.log('PEM format valid ✓');

  // Verify DER format
  assert.ok(trustAnchor.der instanceof Buffer, 'DER should be a Buffer');
  assert.ok(trustAnchor.der.length > 400, 'DER certificate should be substantial');
  console.log(`DER format valid (${trustAnchor.der.length} bytes) ✓`);

  // Show sample PEM for visual verification
  console.log(`\nSample PEM (first 200 chars):\n${trustAnchor.pem.substring(0, 200)}...`);
});
