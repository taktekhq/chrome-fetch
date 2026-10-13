import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchPage } from '../lib/cdp.mjs';

// A fake CDP page target: just enough of the protocol for fetchPage to drive
// a navigation and read the result, with no real Chrome involved.
class FakeChromeSocket {
  constructor(url) {
    this.url = url;
    this.closed = false;
    queueMicrotask(() => this.onopen?.());
  }

  send(raw) {
    const msg = JSON.parse(raw);
    queueMicrotask(() => this._respond(msg));
  }

  _respond(msg) {
    if (msg.method === 'Page.navigate') {
      this._emit({ id: msg.id, result: { frameId: 'f1' } });
      this._emit({
        method: 'Network.responseReceived',
        params: { type: 'Document', response: { status: 200 } },
      });
      this._emit({ method: 'Page.loadEventFired' });
      return;
    }
    if (msg.method === 'Runtime.evaluate') {
      this._emit({ id: msg.id, result: { result: { value: 'hello world' } } });
      return;
    }
    this._emit({ id: msg.id, result: {} }); // Page.enable / Network.enable
  }

  _emit(obj) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }
}

class ErrorSocket {
  constructor() {
    queueMicrotask(() => this.onerror?.(new Error('boom')));
  }
  send() {}
  close() {}
}

test('fetchPage waits for load, then waitMs, then reads innerText and status', async () => {
  const waited = [];
  const sleep = async (ms) => waited.push(ms);

  const result = await fetchPage({
    wsUrl: 'ws://fake',
    targetUrl: 'https://www.reddit.com/x',
    waitMs: 2000,
    sleep,
    WS: FakeChromeSocket,
  });

  assert.equal(result.body, 'hello world');
  assert.equal(result.status, 200);
  assert.deepEqual(waited, [2000]);
});

test('fetchPage surfaces a socket error instead of hanging', async () => {
  await assert.rejects(
    fetchPage({
      wsUrl: 'ws://fake',
      targetUrl: 'https://x',
      waitMs: 0,
      sleep: async () => {},
      WS: ErrorSocket,
    }),
    /boom/,
  );
});

test('fetchPage is not fooled by a load event that arrives before it is awaited', async () => {
  // Same fake, but it fires every event synchronously within one microtask
  // turn, so Page.loadEventFired can race ahead of fetchPage's own await.
  class EagerSocket extends FakeChromeSocket {
    _respond(msg) {
      if (msg.method === 'Page.navigate') {
        this._emit({ id: msg.id, result: {} });
        this._emit({ method: 'Page.loadEventFired' }); // fires immediately
        return;
      }
      super._respond(msg);
    }
  }
  const result = await fetchPage({
    wsUrl: 'ws://fake',
    targetUrl: 'https://www.reddit.com/x',
    waitMs: 0,
    sleep: async () => {},
    WS: EagerSocket,
  });
  assert.equal(result.body, 'hello world');
});
