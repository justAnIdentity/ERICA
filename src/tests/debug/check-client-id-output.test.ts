/**
 * Debug test to see what checks are actually returned
 */

import { test } from 'node:test';
import { PresentationRequestURLParser } from '../../validators/PresentationRequestURLParser.js';

test('Debug: Check what checks are returned for client_id validation', async () => {
  const parser = new PresentationRequestURLParser();

  // Helper to create a simple JWT
  function createTestJWT(payload: any): string {
    const header = { alg: 'none', typ: 'JWT' };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${headerB64}.${payloadB64}.fake-signature`;
  }

  const payload = {
    client_id: 'test-client-123',
    response_type: 'vp_token',
    nonce: 'test-nonce',
  };

  const jwt = createTestJWT(payload);
  const url = `https://example.com?client_id=test-client-123&request=${jwt}`;

  const result = await parser.parseURL(url);

  console.log('\n=== DEBUG: All checks returned ===');
  console.log(`Total checks: ${result.checks.length}`);
  result.checks.forEach((check, idx) => {
    console.log(`\n[${idx + 1}] ${check.checkId}`);
    console.log(`    Name: ${check.checkName}`);
    console.log(`    Category: ${check.category}`);
    console.log(`    Passed: ${check.passed}`);
  });

  console.log('\n=== Looking for client_id checks ===');
  const clientIdChecks = result.checks.filter(c => c.checkId.includes('client_id'));
  console.log(`Found ${clientIdChecks.length} client_id related checks:`);
  clientIdChecks.forEach(check => {
    console.log(`  - ${check.checkId}: ${check.checkName} (${check.passed ? 'PASS' : 'FAIL'})`);
  });
});
