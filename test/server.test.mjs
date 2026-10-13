import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../lib/server.mjs';
import { parseConfig } from '../lib/config.mjs';

// A fake CDP: the HTTP /json/* endpoints plus a fake per-tab WebSocket.
// No real Chrome is involved in this whole file.
class FakeChromeSocket {
  constructor(url) {
    this.url = url;
    queueMicrotask(() => this.onopen?.());
  }
  send(raw) {
    const msg = JSON.parse(raw);
    queueMicrotask(() => {
      if (msg.method === 'Page.navigate') {
        this._emit({ id: msg.id, result: {} });
        this._emit({
          method: 'Network.responseReceived',
          params: { type: 'Document', response: { status: 200 } },
        });
        this._emit({ method: 'Page.loadEventFired' });
      } else if (msg.method === 'Runtime.evaluate') {
        const value = msg.params.expression.includes('outerHTML') ? '<html>page</html>' : 'page text';
        this._emit({ id: msg.id, result: { result: { value } } });
      } else {
        this._emit({ id: msg.id, result: {} });
      }
    });
  }
  _emit(obj) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  close() {
    this.onclose?.();
  }
}

function fakeCdpFetch(state) {
  return async (url) => {
    if (url.includes('/json/new')) {
      const id = `tab-${state.nextId++}`;
      state.opened.add(id);
      return { ok: true, json: async () => ({ id, webSocketDebuggerUrl: `ws://fake/${id}` }) };
    }
    if (url.includes('/json/close/')) {
      const id = url.split('/json/close/')[1];
      state.opened.delete(id);
      return { ok: true, json: async () => ({}) };
    }
    if (url.includes('/json/list')) {
      return { ok: true, json: async () => [...state.opened].map((id) => ({ id })) };
    }
    throw new Error(`unexpected CDP call ${url}`);
  };
}

async function startTestServer(overrides = {}) {
  const config = parseConfig([], {
    TOKEN: 'test-token',
    LISTEN: '127.0.0.1:0',
    ALLOW_HOSTS: 'www.reddit.com',
    MIN_GAP_S: '0',
    TIMEOUT_S: '5',
    WAIT_S: '0',
    ...overrides,
  });
  const state = { opened: new Set(), nextId: 1 };
  const { server, tracker } = createApp(config, {
    fetchImpl: fakeCdpFetch(state),
    WS: FakeChromeSocket,
    sleep: async () => {},
  });
  server.listen(config.port, config.host);
  await once(server, 'listening');
  const { port } = server.address();
  return { server, tracker, state, base: `http://127.0.0.1:${port}` };
}

test('GET /health needs no auth', async () => {
  const { server, base } = await startTestServer();
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  server.close();
});

test('GET /fetch without a token is rejected', async () => {
  const { server, base } = await startTestServer();
  const res = await fetch(`${base}/fetch?url=https://www.reddit.com/x`);
  assert.equal(res.status, 401);
  server.close();
});

test('GET /fetch with the wrong token is rejected', async () => {
  const { server, base } = await startTestServer();
  const res = await fetch(`${base}/fetch?url=https://www.reddit.com/x`, {
    headers: { Authorization: 'Bearer nope' },
  });
  assert.equal(res.status, 401);
  server.close();
});

test('GET /fetch rejects a host not on the allow list', async () => {
  const { server, base } = await startTestServer();
  const res = await fetch(`${base}/fetch?url=https://evil.example.com`, {
    headers: { Authorization: 'Bearer test-token' },
  });
  assert.equal(res.status, 400);
  server.close();
});

test('GET /fetch rejects a plain http url', async () => {
  const { server, base } = await startTestServer();
  const res = await fetch(`${base}/fetch?url=http://www.reddit.com/x`, {
    headers: { Authorization: 'Bearer test-token' },
  });
  assert.equal(res.status, 400);
  server.close();
});

test('GET /fetch returns the page text and closes the tab it opened', async () => {
  const { server, base, state } = await startTestServer();
  const res = await fetch(`${base}/fetch?url=https://www.reddit.com/x`, {
    headers: { Authorization: 'Bearer test-token' },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 200, body: 'page text' });
  assert.equal(state.opened.size, 0); // closed in finally
  server.close();
});

test('GET /fetch with format=html returns the page html', async () => {
  const { server, base, state } = await startTestServer();
  const res = await fetch(`${base}/fetch?url=https://www.reddit.com/x&format=html`, {
    headers: { Authorization: 'Bearer test-token' },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 200, body: '<html>page</html>' });
  assert.equal(state.opened.size, 0);
  server.close();
});

test('GET /fetch rejects an unknown format', async () => {
  const { server, base } = await startTestServer();
  const res = await fetch(`${base}/fetch?url=https://www.reddit.com/x&format=pdf`, {
    headers: { Authorization: 'Bearer test-token' },
  });
  assert.equal(res.status, 400);
  server.close();
});
