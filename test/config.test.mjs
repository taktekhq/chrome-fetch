import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../lib/config.mjs';

test('applies defaults when only TOKEN is given', () => {
  const c = parseConfig([], { TOKEN: 't' });
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.port, 7777);
  assert.equal(c.cdpUrl, 'http://127.0.0.1:9222');
  assert.equal(c.minGapS, 3);
  assert.equal(c.timeoutS, 20);
  assert.equal(c.waitS, 2);
  assert.deepEqual([...c.allowHostSet].sort(), ['old.reddit.com', 'www.reddit.com']);
});

test('requires a token', () => {
  assert.throws(() => parseConfig([], {}), /TOKEN is required/);
});

test('env overrides defaults', () => {
  const c = parseConfig([], { TOKEN: 't', LISTEN: '100.1.2.3:8080', MIN_GAP_S: '5' });
  assert.equal(c.host, '100.1.2.3');
  assert.equal(c.port, 8080);
  assert.equal(c.minGapS, 5);
});

test('a flag overrides the matching env var', () => {
  const c = parseConfig(['--listen', '0.0.0.0:9'], { TOKEN: 't', LISTEN: '1.2.3.4:5' });
  assert.equal(c.host, '0.0.0.0');
  assert.equal(c.port, 9);
});

test('rejects a malformed LISTEN', () => {
  assert.throws(() => parseConfig([], { TOKEN: 't', LISTEN: 'no-port' }));
});
