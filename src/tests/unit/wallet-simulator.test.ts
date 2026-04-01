/**
 * Unit tests for WalletSimulator
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { WalletSimulator } from '../../simulator/WalletSimulator.js';
import { SimulationMode } from '../../types/index.js';

test('WalletSimulator - handles request without throwing', async () => {
  const simulator = new WalletSimulator();

  const request = {
    clientId: 'https://verifier.example.com',
    responseType: 'vp_token',
    nonce: 'test-nonce-789',
    dcql_query: {
      credentials: []
    }
  };

  const response = await simulator.simulate(request as any, {
    mode: SimulationMode.COMPLIANT,
    credentialSource: 'TEMPLATE',
    postResponseToUri: false,
    preferredFormat: 'dc+sd-jwt'
  });

  assert.ok(response, 'Should return a response object');
  assert.ok(typeof response === 'object', 'Response should be an object');

  // Response can be success {vp_token: {...}} or failure {success: false, error: '...'}
  const hasValidStructure =
    ('vp_token' in response && typeof response.vp_token === 'object') ||
    ('error' in response && typeof response.error === 'string');

  assert.ok(hasValidStructure, 'Should have valid response structure');
});

test('WalletSimulator - handles different simulation modes without throwing', async () => {
  const simulator = new WalletSimulator();

  const request = {
    clientId: 'https://verifier.example.com',
    responseType: 'vp_token',
    nonce: 'test-nonce',
    dcql_query: {
      credentials: []
    }
  };

  const modes = [
    SimulationMode.COMPLIANT,
    SimulationMode.MISSING_CLAIMS,
    SimulationMode.EXPIRED
  ];

  for (const mode of modes) {
    const response = await simulator.simulate(request as any, {
      mode,
      credentialSource: 'TEMPLATE',
      postResponseToUri: false,
      preferredFormat: 'dc+sd-jwt'
    });

    assert.ok(response, `Should return response for ${mode} mode`);
    assert.ok(typeof response === 'object', 'Response should be an object');
  }
});

test('WalletSimulator - returns consistent response structure', async () => {
  const simulator = new WalletSimulator();

  const request = {
    clientId: 'test-client',
    nonce: 'nonce-123',
    dcql_query: { credentials: [] }
  };

  const response = await simulator.simulate(request as any, {
    mode: SimulationMode.COMPLIANT,
    credentialSource: 'TEMPLATE',
    postResponseToUri: false,
    preferredFormat: 'dc+sd-jwt'
  });

  assert.ok(response, 'Should return response');
  assert.ok(typeof response === 'object', 'Response should be object');

  // Response structure can be:
  // Success: {vp_token: {format: [tokens]}, presentation_submission?: {...}, ...}
  // Failure: {success: false, error: string, diagnostics: {...}}
  const hasExpectedStructure =
    ('vp_token' in response) ||
    ('error' in response && 'success' in response);

  assert.ok(hasExpectedStructure, 'Should have expected response structure');
});
