/**
 * Integration tests for full EudiVpDebugger pipeline
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { EudiVpDebugger, Profile, SimulationMode } from '../../index.js';

test('EudiVpDebugger - validates request', async () => {
  const vpDebugger = new EudiVpDebugger();

  const request = {
    clientId: 'https://verifier.example.com',
    responseType: 'vp_token',
    nonce: 'test-nonce',
    dcql_query: { credentials: [] }
  };

  const result = await vpDebugger.validateRequest(request as any, Profile.BASE_OPENID4VP);

  assert.ok(result, 'Should return validation result');
  assert.ok(typeof result.valid === 'boolean', 'Should have valid flag');
  assert.ok(Array.isArray(result.checks), 'Should have checks');
  assert.ok(Array.isArray(result.errors), 'Should have errors');
});

test('EudiVpDebugger - validates response', async () => {
  const vpDebugger = new EudiVpDebugger();

  const response = {
    vp_token: {
      'vc+sd-jwt': ['test.jwt.token']
    }
  };

  const request = {
    clientId: 'test-client',
    nonce: 'test-nonce'
  };

  const result = await vpDebugger.validateResponse(response as any, request as any);

  assert.ok(result, 'Should return validation result');
  assert.ok(typeof result.valid === 'boolean', 'Should have valid flag');
  assert.ok(Array.isArray(result.checks), 'Should have checks');
});

test('EudiVpDebugger - handles different profiles', async () => {
  const vpDebugger = new EudiVpDebugger();

  const request = {
    clientId: 'x509_hash:test',
    responseType: 'vp_token',
    responseMode: 'direct_post.jwt',
    nonce: 'nonce-pid',
    dcql_query: { credentials: [] }
  };

  const baseResult = await vpDebugger.validateRequest(request as any, Profile.BASE_OPENID4VP);
  const pidResult = await vpDebugger.validateRequest(request as any, Profile.PID_PRESENTATION);

  assert.ok(baseResult.checks.length > 0, 'BASE_OPENID4VP profile should perform checks');
  assert.ok(pidResult.checks.length > 0, 'PID profile should perform checks');
});

test('EudiVpDebugger - has correct API', () => {
  const vpDebugger = new EudiVpDebugger();

  assert.ok(typeof vpDebugger.debug === 'function', 'Should have debug method');
  assert.ok(typeof vpDebugger.validateRequest === 'function', 'Should have validateRequest method');
  assert.ok(typeof vpDebugger.validateResponse === 'function', 'Should have validateResponse method');
  assert.ok(typeof vpDebugger.getExplainabilityEngine === 'function', 'Should have getExplainabilityEngine method');
});
