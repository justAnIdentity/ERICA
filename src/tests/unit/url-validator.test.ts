/**
 * Unit tests for URLValidator (SSRF Protection)
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { URLValidator } from '../../security/URLValidator.js';

test('URLValidator - allows valid HTTPS URLs', async () => {
  const result = await URLValidator.validate('https://example.com/request');

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
  assert.ok(result.checks.some(c => c.checkId === 'ssrf.protocol.https'));
});

test('URLValidator - rejects HTTP URLs by default', async () => {
  const result = await URLValidator.validate('http://example.com/request');

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.checks.some(c => c.checkId === 'ssrf.protocol.invalid'));
});

test('URLValidator - allows HTTP when allowHttp is true', async () => {
  const result = await URLValidator.validate('http://example.com/request', true);

  assert.strictEqual(result.valid, true);
  assert.ok(result.checks.some(c => c.checkId === 'ssrf.protocol.http'));
});

test('URLValidator - rejects localhost', async () => {
  const result = await URLValidator.validate('https://localhost/request');

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('localhost')));
  assert.ok(result.checks.some(c => c.checkId === 'ssrf.hostname.localhost'));
});

test('URLValidator - rejects 127.0.0.1', async () => {
  const result = await URLValidator.validate('https://127.0.0.1/request');

  assert.strictEqual(result.valid, false);
  assert.ok(result.checks.some(c => c.checkId === 'ssrf.ip.private'));
});

test('URLValidator - rejects private IP 10.0.0.1', async () => {
  const result = await URLValidator.validate('https://10.0.0.1/request');

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('10.0.0.0/8')));
});

test('URLValidator - rejects private IP 192.168.1.1', async () => {
  const result = await URLValidator.validate('https://192.168.1.1/request');

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('192.168.0.0/16')));
});

test('URLValidator - rejects cloud metadata endpoint 169.254.169.254', async () => {
  const result = await URLValidator.validate('https://169.254.169.254/latest/meta-data/');

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('cloud metadata')));
  assert.ok(result.checks.some(c => c.checkId === 'ssrf.ip.cloud_metadata'));
});

test('URLValidator - rejects malformed URLs', async () => {
  const result = await URLValidator.validate('not-a-url');

  assert.strictEqual(result.valid, false);
  assert.ok(result.checks.some(c => c.checkId === 'ssrf.url.parse'));
});

test('URLValidator - rejects file:// protocol', async () => {
  const result = await URLValidator.validate('file:///etc/passwd');

  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('URLValidator - successfully resolves valid hostnames', async () => {
  const result = await URLValidator.validate('https://example.com/request');

  assert.strictEqual(result.valid, true);
  assert.ok(result.checks.some(c => c.checkId === 'ssrf.hostname.resolve' && c.passed));
});

test('URLValidator - rejects IPv6 link-local fe80::', async () => {
  const result = await URLValidator.validate('https://[fe80::1]/request');

  // IPv6 addresses might fail at DNS resolution or IP validation
  assert.strictEqual(result.valid, false);
  // Just ensure it was rejected for security reasons
  assert.ok(result.errors.length > 0);
});
