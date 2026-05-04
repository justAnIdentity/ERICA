/**
 * Unit tests for client_id validation
 * Tests that client_id in URL matches client_id in JWT payload
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { PresentationRequestURLParser } from '../../validators/PresentationRequestURLParser.js';

// Helper to create a simple JWT
function createTestJWT(payload: any): string {
  const header = { alg: 'none', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${headerB64}.${payloadB64}.fake-signature`;
}

test('Client ID validation - matching client_id passes', async () => {
  const parser = new PresentationRequestURLParser();

  const payload = {
    client_id: 'test-client-123',
    response_type: 'vp_token',
    nonce: 'test-nonce',
  };

  const jwt = createTestJWT(payload);
  const url = `https://example.com?client_id=test-client-123&request=${jwt}`;

  const result = await parser.parseURL(url);

  assert.strictEqual(result.success, true);
  const matchCheck = result.checks.find(c => c.checkId === 'semantics.client_id.url_jwt_match');
  assert.ok(matchCheck, 'Should have client_id match check');
  assert.strictEqual(matchCheck.passed, true, 'client_id should match');
});

test('Client ID validation - mismatched client_id fails', async () => {
  const parser = new PresentationRequestURLParser();

  const payload = {
    client_id: 'different-client-456',
    response_type: 'vp_token',
    nonce: 'test-nonce',
  };

  const jwt = createTestJWT(payload);
  const url = `https://example.com?client_id=test-client-123&request=${jwt}`;

  const result = await parser.parseURL(url);

  assert.strictEqual(result.success, false);
  const matchCheck = result.checks.find(c => c.checkId === 'semantics.client_id.url_jwt_match');
  assert.ok(matchCheck, 'Should have client_id match check');
  assert.strictEqual(matchCheck.passed, false, 'client_id should not match');
  assert.ok(matchCheck.issue?.includes('mismatch'), 'Should mention mismatch');
});

test('Client ID validation - URL has client_id but JWT missing it', async () => {
  const parser = new PresentationRequestURLParser();

  const payload = {
    response_type: 'vp_token',
    nonce: 'test-nonce',
    // Missing client_id
  };

  const jwt = createTestJWT(payload);
  const url = `https://example.com?client_id=test-client-123&request=${jwt}`;

  const result = await parser.parseURL(url);

  // Should still parse but with warning
  const missingCheck = result.checks.find(c => c.checkId === 'semantics.client_id.jwt_missing');
  assert.ok(missingCheck, 'Should have JWT missing client_id check');
  assert.strictEqual(missingCheck.passed, false);
  assert.ok(missingCheck.issue?.includes('missing from JWT'));
});

test('Client ID validation - JWT has client_id but URL missing it', async () => {
  const parser = new PresentationRequestURLParser();

  const payload = {
    client_id: 'test-client-123',
    response_type: 'vp_token',
    nonce: 'test-nonce',
  };

  const jwt = createTestJWT(payload);
  const url = `https://example.com?request=${jwt}`; // No client_id in URL

  const result = await parser.parseURL(url);

  assert.strictEqual(result.success, true);
  const urlMissingCheck = result.checks.find(c => c.checkId === 'semantics.client_id.url_missing');
  assert.ok(urlMissingCheck, 'Should have URL missing client_id check');
  assert.strictEqual(urlMissingCheck.passed, true);
});

test('Client ID validation - neither URL nor JWT has client_id', async () => {
  const parser = new PresentationRequestURLParser();

  const payload = {
    response_type: 'vp_token',
    nonce: 'test-nonce',
  };

  const jwt = createTestJWT(payload);
  const url = `https://example.com?request=${jwt}`;

  const result = await parser.parseURL(url);

  // Should parse successfully, just no client_id validation
  assert.strictEqual(result.success, true);
  const matchCheck = result.checks.find(c => c.checkId === 'semantics.client_id.url_jwt_match');
  assert.strictEqual(matchCheck, undefined, 'Should not have match check if neither has client_id');
});
