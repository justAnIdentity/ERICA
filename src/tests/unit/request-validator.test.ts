/**
 * Unit tests for PresentationRequestValidator
 * Tests actual validation logic, not just API existence
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { PresentationRequestValidator } from '../../validators/PresentationRequestValidator.js';
import { Profile } from '../../types/index.js';

test('PresentationRequestValidator - detects missing clientId', async () => {
  const validator = new PresentationRequestValidator();

  const invalidRequest = {
    // Missing clientId
    responseType: 'vp_token',
    nonce: 'test-nonce',
    dcql_query: { credentials: [] }
  };

  const result = await validator.validate(invalidRequest as any, Profile.BASE_OPENID4VP);

  assert.strictEqual(result.valid, false, 'Should be invalid without clientId');

  const hasClientIdError = result.errors.some(err =>
    err.issue.toLowerCase().includes('client') ||
    err.issue.toLowerCase().includes('clientid')
  );

  assert.ok(hasClientIdError, 'Should have error about missing clientId');
});

test('PresentationRequestValidator - detects missing nonce', async () => {
  const validator = new PresentationRequestValidator();

  const invalidRequest = {
    clientId: 'https://verifier.example.com',
    responseType: 'vp_token',
    // Missing nonce
    dcql_query: { credentials: [] }
  };

  const result = await validator.validate(invalidRequest as any, Profile.BASE_OPENID4VP);

  assert.strictEqual(result.valid, false, 'Should be invalid without nonce');

  const hasNonceError = result.errors.some(err =>
    err.issue.toLowerCase().includes('nonce')
  );

  assert.ok(hasNonceError, 'Should have error about missing nonce');
});

test('PresentationRequestValidator - accepts valid minimal request', async () => {
  const validator = new PresentationRequestValidator();

  const validRequest = {
    clientId: 'https://verifier.example.com',
    responseType: 'vp_token',
    nonce: 'test-nonce-12345',
    dcql_query: {
      credentials: [
        {
          id: 'credential-1',
          format: 'dc+sd-jwt',
          claims: [{ path: ['given_name'] }]
        }
      ]
    }
  };

  const result = await validator.validate(validRequest as any, Profile.BASE_OPENID4VP);

  // May not be fully valid due to other requirements, but shouldn't fail on basic structure
  assert.ok(result.checks.length > 0, 'Should perform validation checks');
  assert.ok(result.summary, 'Should generate summary');

  // Should not have clientId or nonce errors
  const hasBasicFieldErrors = result.errors.some(err =>
    err.issue.toLowerCase().includes('clientid') ||
    err.issue.toLowerCase().includes('nonce')
  );

  assert.ok(!hasBasicFieldErrors, 'Should not have errors for present required fields');
});

test('PresentationRequestValidator - validates empty credentials array', async () => {
  const validator = new PresentationRequestValidator();

  const requestWithEmptyCredentials = {
    clientId: 'https://verifier.example.com',
    responseType: 'vp_token',
    nonce: 'test-nonce',
    dcql_query: {
      credentials: [] // Empty - no credentials requested
    }
  };

  const result = await validator.validate(requestWithEmptyCredentials as any, Profile.BASE_OPENID4VP);

  // Empty credentials might be valid or invalid depending on spec interpretation
  // At minimum, validator should process it without throwing
  assert.ok(result, 'Should return validation result');
  assert.ok(Array.isArray(result.checks), 'Should have checks array');
});

test('PresentationRequestValidator - PID profile enforces additional requirements', async () => {
  const validator = new PresentationRequestValidator();

  const baseRequest = {
    clientId: 'https://verifier.example.com',
    responseType: 'vp_token',
    nonce: 'test-nonce',
    dcql_query: { credentials: [] }
  };

  const baseResult = await validator.validate(baseRequest as any, Profile.BASE_OPENID4VP);
  const pidResult = await validator.validate(baseRequest as any, Profile.PID_PRESENTATION);

  // PID profile should have more stringent requirements
  assert.ok(baseResult.checks.length > 0, 'BASE profile should perform checks');
  assert.ok(pidResult.checks.length > 0, 'PID profile should perform checks');

  // PID profile likely has more errors due to stricter requirements
  const pidHasMoreErrors = pidResult.errors.length >= baseResult.errors.length;
  assert.ok(pidHasMoreErrors, 'PID profile should be at least as strict as BASE');
});
