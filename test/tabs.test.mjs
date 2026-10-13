import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TabTracker } from '../lib/tabs.mjs';

function fakeFetch(handlers) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const entry = handlers.find(([match]) => url.includes(match));
    if (!entry) throw new Error(`unexpected call ${url}`);
    return entry[1]();
  };
  impl.calls = calls;
  return impl;
}

test('close removes the tab from tracking and calls CDP close', async () => {
  const fetchImpl = fakeFetch([['/json/close/', () => ({ ok: true })]]);
  const t = new TabTracker({ cdpUrl: 'http://cdp', fetchImpl });
  t.track('abc');
  await t.close('abc');
  assert.equal(t.opened.has('abc'), false);
  assert.ok(fetchImpl.calls.some((u) => u.includes('/json/close/abc')));
});

test('sweep closes only our own tabs that are still listed', async () => {
  const fetchImpl = fakeFetch([
    ['/json/list', () => ({ ok: true, json: async () => [{ id: 'ours' }, { id: 'someone-elses' }] })],
    ['/json/close/', () => ({ ok: true })],
  ]);
  const t = new TabTracker({ cdpUrl: 'http://cdp', fetchImpl });
  t.track('ours');
  t.track('long-gone'); // already closed elsewhere; should not call close on it

  const closed = await t.sweep();

  assert.deepEqual(closed, ['ours']);
  assert.equal(t.opened.has('ours'), false);
  assert.equal(t.opened.has('long-gone'), false);
  assert.ok(!fetchImpl.calls.some((u) => u.includes('someone-elses')));
});

test('sweep does nothing when nothing is tracked', async () => {
  const fetchImpl = fakeFetch([]);
  const t = new TabTracker({ cdpUrl: 'http://cdp', fetchImpl });
  assert.deepEqual(await t.sweep(), []);
  assert.equal(fetchImpl.calls.length, 0);
});

test('a failed close keeps the tab tracked for the next sweep', async () => {
  const fetchImpl = fakeFetch([
    [
      '/json/close/',
      () => {
        throw new Error('network blip');
      },
    ],
  ]);
  const t = new TabTracker({ cdpUrl: 'http://cdp', fetchImpl });
  t.track('abc');
  await t.close('abc');
  assert.equal(t.opened.has('abc'), true);
});

test('sweep never calls /json/close on a tab it did not open', async () => {
  const fetchImpl = fakeFetch([
    ['/json/list', () => ({ ok: true, json: async () => [{ id: 'not-ours' }] })],
  ]);
  const t = new TabTracker({ cdpUrl: 'http://cdp', fetchImpl });
  // Nothing tracked, so even though CDP lists a tab, we must not touch it.
  await t.sweep();
  assert.ok(!fetchImpl.calls.some((u) => u.includes('close')));
});
