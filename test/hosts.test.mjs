import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUrl } from '../lib/hosts.mjs';

const allow = new Set(['www.reddit.com', 'old.reddit.com']);

test('allows an https url on the allow list', () => {
  assert.equal(checkUrl('https://www.reddit.com/r/foo', allow).ok, true);
});

test('rejects http, even for an allowed host', () => {
  assert.equal(checkUrl('http://www.reddit.com/r/foo', allow).ok, false);
});

test('rejects a host not on the list', () => {
  assert.equal(checkUrl('https://evil.example.com', allow).ok, false);
});

test('rejects an invalid url', () => {
  assert.equal(checkUrl('not a url', allow).ok, false);
});

test('host match is case-insensitive', () => {
  assert.equal(checkUrl('https://WWW.REDDIT.COM/x', allow).ok, true);
});
