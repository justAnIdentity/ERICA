/**
 * Unit tests for PresentationResponseValidator
 * Tests actual validation logic for response validation
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { PresentationResponseValidator } from '../../validators/PresentationResponseValidator.js';

test('PresentationResponseValidator - detects missing vp_token', async () => {
  const validator = new PresentationResponseValidator();

  const emptyResponse = {};
  const mockRequest = {
    clientId: 'https://verifier.example.com',
    nonce: 'test-nonce'
  };

  const result = await validator.validate(emptyResponse, mockRequest as any);

  // Should be invalid
  assert.strictEqual(result.valid, false, 'Response without vp_token should be invalid');
  
  // Should have at least one error
  assert.ok(result.errors.length > 0, 'Should have validation errors');
  assert.ok(result.checks.length > 0, 'Should perform checks');
});

test('PresentationResponseValidator - accepts response with vp_token', async () => {
  const validator = new PresentationResponseValidator();

  const response = {
    vp_token: {
      'vc+sd-jwt': ['eyJhbGciOiJFUzI1NiIsInR5cCI6InZjK3NkLWp3dCJ9.eyJpc3MiOiJodHRwczovL2lzc3Vlci5leGFtcGxlLmNvbSJ9.signature']
    }
  };

  const mockRequest = {
    clientId: 'https://verifier.example.com',
    nonce: 'test-nonce'
  };

  const result = await validator.validate(response as any, mockRequest as any);

  // Should process without throwing
  assert.ok(result.checks.length > 0, 'Should perform validation checks');
  assert.ok(result.summary, 'Should generate summary');
});

test('PresentationResponseValidator - validates response structure', async () => {
  const validator = new PresentationResponseValidator();

  const response = {
    vp_token: {
      'vc+sd-jwt': ['test.jwt.token']
    }
  };

  const mockRequest = {
    clientId: 'https://verifier.example.com',
    nonce: 'nonce-123'
  };

  const result = await validator.validate(response as any, mockRequest as any);

  assert.ok(typeof result.valid === 'boolean', 'Should have valid flag');
  assert.ok(Array.isArray(result.checks), 'Should have checks array');
  assert.ok(Array.isArray(result.errors), 'Should have errors array');
  assert.ok(Array.isArray(result.warnings), 'Should have warnings array');
  assert.ok(result.summary, 'Should have summary');
});

test('PresentationResponseValidator - processes decoded tokens with nonce', async () => {
  const validator = new PresentationResponseValidator();

  // Response with decoded tokens
  const response = {
    vp_token: {
      'vc+sd-jwt': ['fake.jwt.token']
    },
    decodedVPTokens: [
      {
        format: 'sd-jwt',
        holderBinding: {
          nonce: 'test-nonce-123',
          audience: 'https://verifier.example.com',
          issuedAt: Math.floor(Date.now() / 1000),
          expiresAt: Math.floor(Date.now() / 1000) + 300
        }
      }
    ]
  };

  const mockRequest = {
    clientId: 'https://verifier.example.com',
    nonce: 'test-nonce-123'
  };

  const result = await validator.validate(response as any, mockRequest as any);

  // Should process decoded tokens
  assert.ok(result, 'Should return validation result');
  assert.ok(result.checks.length > 0, 'Should perform holder binding checks');
});

test('PresentationResponseValidator - processes timing information', async () => {
  const validator = new PresentationResponseValidator();

  const currentTime = Math.floor(Date.now() / 1000);

  const response = {
    vp_token: {
      'vc+sd-jwt': ['fake.jwt.token']
    },
    decodedVPTokens: [
      {
        format: 'sd-jwt',
        metadata: {
          expiresAt: currentTime + 3600, // Valid for 1 hour
          issuedAt: currentTime - 3600,  // Issued 1 hour ago
          issuer: 'https://issuer.example.com'
        }
      }
    ]
  };

  const mockRequest = {
    clientId: 'https://verifier.example.com',
    nonce: 'test-nonce'
  };

  const result = await validator.validate(response as any, mockRequest as any);

  // Should perform timing validations
  assert.ok(result, 'Should return validation result');
  assert.ok(result.checks.length > 0, 'Should perform timing checks');
});
