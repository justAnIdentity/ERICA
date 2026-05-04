/**
 * Test client_id validation with request_uri
 */

import { test } from 'node:test';
import { PresentationRequestURLParser } from '../../validators/PresentationRequestURLParser.js';

test('Debug: client_id validation with request_uri (simulated)', async () => {
  const parser = new PresentationRequestURLParser();

  // Simulate what happens with request_uri
  // Since we can't actually fetch from a real URL in tests, let's trace through the logic

  const testUrl = "openid4vp://?client_id=x509_hash%3AtMqdcPmXTb5yZPBdQ7RTJcXOBViD9wUAO_SzvOaBXv0&request_uri=https%3A%2F%2Feudiplo.eudi-wallet.org%2Fpresentations%2Fc9451be1-5814-4cdf-bf99-afd5359a08a4%2Foid4vp%2Frequest&request_uri_method=get";

  console.log('\n=== Testing with request_uri URL ===');
  console.log('URL:', testUrl);

  try {
    const result = await parser.parseURL(testUrl);

    console.log('\nResult success:', result.success);
    console.log('Total checks:', result.checks.length);

    console.log('\n=== All checks ===');
    result.checks.forEach((check, idx) => {
      console.log(`[${idx + 1}] ${check.checkId} - ${check.checkName} (${check.passed ? 'PASS' : 'FAIL'})`);
    });

    console.log('\n=== Looking for client_id checks ===');
    const clientIdChecks = result.checks.filter(c => c.checkId.includes('client_id'));
    console.log(`Found ${clientIdChecks.length} client_id related checks`);
    clientIdChecks.forEach(check => {
      console.log(`  - ${check.checkId}: ${check.passed ? 'PASS' : 'FAIL'}`);
      if (check.details) console.log(`    Details: ${check.details}`);
      if (check.issue) console.log(`    Issue: ${check.issue}`);
    });

    // If fetch succeeded, we should see client_id validation
    if (result.success && result.request) {
      console.log('\n✅ Request was successfully fetched and parsed');
      console.log('Request has client_id:', (result.request as any).client_id);
    } else {
      console.log('\n❌ Request fetch failed (expected in test environment)');
      console.log('Errors:', result.errors);
    }
  } catch (error) {
    console.error('Error:', error);
  }
});
