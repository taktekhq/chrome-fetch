// Talks to Chrome's DevTools Protocol: open/close tabs over the HTTP
// endpoint, and drive one page load over its per-tab WebSocket.

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function openTab(cdpUrl, fetchImpl = fetch) {
  const res = await fetchImpl(`${cdpUrl}/json/new?about:blank`, { method: 'PUT' });
  if (!res.ok) throw new Error(`CDP /json/new failed: ${res.status}`);
  return res.json(); // {id, webSocketDebuggerUrl, ...}
}

export async function closeTab(cdpUrl, id, fetchImpl = fetch) {
  await fetchImpl(`${cdpUrl}/json/close/${id}`);
}

// Navigates `targetUrl` in the tab at `wsUrl`, waits for the page's load
// event plus `waitMs` more, then reads document.body.innerText (format
// "text") or document.documentElement.outerHTML (format "html", for pages
// whose data lives in attributes). Status is best effort: the main document
// response, when CDP reports one in time.
export const EXPRESSIONS = {
  text: 'document.body.innerText',
  html: 'document.documentElement.outerHTML',
};

export function fetchPage({ wsUrl, targetUrl, waitMs, format = 'text', sleep = defaultSleep, WS = globalThis.WebSocket }) {
  return new Promise((resolve, reject) => {
    const ws = new WS(wsUrl);
    let nextId = 1;
    let settled = false;
    let status = null;
    const pending = new Map();

    // Created up front so a Page.loadEventFired that arrives before we
    // start waiting for it is not missed.
    let loadResolve;
    const loaded = new Promise((res) => {
      loadResolve = res;
    });

    const cleanup = () => {
      try {
        ws.close();
      } catch {
        // already closed
      }
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const succeed = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const send = (method, params = {}) =>
      new Promise((res) => {
        const id = nextId++;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      });

    ws.onerror = (event) => fail(new Error(`CDP socket error: ${event?.message || event}`));
    ws.onclose = () => fail(new Error('CDP socket closed before the page finished loading'));

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
      } catch {
        return;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result ?? msg.error ?? null);
        pending.delete(msg.id);
        return;
      }
      if (msg.method === 'Page.loadEventFired') {
        loadResolve();
      } else if (msg.method === 'Network.responseReceived' && status === null) {
        const { type, response } = msg.params || {};
        if (type === 'Document' && response) status = response.status;
      }
    };

    ws.onopen = async () => {
      try {
        await send('Page.enable');
        await send('Network.enable');
        await send('Page.navigate', { url: targetUrl });
        await loaded;
        await sleep(waitMs);
        const result = await send('Runtime.evaluate', {
          expression: EXPRESSIONS[format] ?? EXPRESSIONS.text,
          returnByValue: true,
        });
        succeed({ status, body: result?.result?.value ?? '' });
      } catch (err) {
        fail(err);
      }
    };
  });
}
