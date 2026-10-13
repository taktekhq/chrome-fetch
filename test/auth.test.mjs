import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkToken, bearerToken } from '../lib/auth.mjs';

test('checkToken accepts the right token', () => {
  assert.equal(checkToken('abc123', 'abc123'), true);
});

test('checkToken rejects a wrong token of the same length', () => {
  assert.equal(checkToken('abc123', 'abc124'), false);
});

test('checkToken rejects a different-length token', () => {
  assert.equal(checkToken('abc123', 'abc'), false);
});

test('checkToken rejects everything when no token is configured', () => {
  assert.equal(checkToken('', 'abc'), false);
});

test('bearerToken extracts the token from the header', () => {
  assert.equal(bearerToken('Bearer sekrit'), 'sekrit');
  assert.equal(bearerToken('bearer sekrit'), 'sekrit'); // case-insensitive scheme
  assert.equal(bearerToken(''), null);
  assert.equal(bearerToken(undefined), null);
  assert.equal(bearerToken('Basic foo'), null);
});
