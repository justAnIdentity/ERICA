/**
 * Integration tests for validation checks
 * Tests that validators actually catch real validation issues
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { EudiVpDebugger, Profile } from '../../index.js';

test('End-to-end - validates request with missing required fields', async () => {
  const vpDebugger = new EudiVpDebugger();

  const incompleteRequest = {
    clientId: 'https://verifier.example.com',
    // Missing nonce
    responseType: 'vp_token',
    dcql_query: { credentials: [] }
  };

  const result = await vpDebugger.validateRequest(incompleteRequest as any, Profile.BASE_OPENID4VP);

  assert.strictEqual(result.valid, false, 'Request without nonce should be invalid');
  assert.ok(result.errors.length > 0, 'Should have validation errors');
});

test('End-to-end - validates response with missing vp_token', async () => {
  const vpDebugger = new EudiVpDebugger();

  const emptyResponse = {};
  const mockRequest = {
    clientId: 'https://verifier.example.com',
    nonce: 'test-nonce'
  };

  const result = await vpDebugger.validateResponse(emptyResponse, mockRequest as any);

  assert.strictEqual(result.valid, false, 'Response without vp_token should be invalid');
  assert.ok(result.errors.length > 0, 'Should have validation errors');
});

test('End-to-end - full validation pipeline processes requests', async () => {
  const vpDebugger = new EudiVpDebugger();

  const request = {
    clientId: 'https://verifier.example.com',
    responseType: 'vp_token',
    nonce: 'integration-test-nonce',
    dcql_query: { credentials: [] }
  };

  const result = await vpDebugger.validateRequest(request as any, Profile.BASE_OPENID4VP);

  // Should complete validation
  assert.ok(result, 'Should return validation result');
  assert.ok(typeof result.valid === 'boolean', 'Should have valid flag');
  assert.ok(result.checks.length > 0, 'Should perform validation checks');
  assert.ok(result.summary, 'Should generate summary');
});

test('End-to-end - validation detects profile-specific requirements', async () => {
  const vpDebugger = new EudiVpDebugger();

  // Request missing PID-specific requirements
  const request = {
    clientId: 'https://verifier.example.com', // Should be x509_hash for PID
    responseType: 'vp_token',
    nonce: 'test-nonce',
    dcql_query: { credentials: [] }
  };

  const baseResult = await vpDebugger.validateRequest(request as any, Profile.BASE_OPENID4VP);
  const pidResult = await vpDebugger.validateRequest(request as any, Profile.PID_PRESENTATION);

  // PID profile should be stricter
  assert.ok(pidResult.errors.length >= baseResult.errors.length, 
    'PID profile should have at least as many errors as BASE profile');
});
