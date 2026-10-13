import { createServer as createHttpServer } from 'node:http';
import { bearerToken, checkToken } from './auth.mjs';
import { checkUrl } from './hosts.mjs';
import { GapQueue } from './queue.mjs';
import { TabTracker } from './tabs.mjs';
import { openTab, fetchPage } from './cdp.mjs';
import { withTimeout } from './timeout.mjs';

const TEN_MINUTES_MS = 10 * 60 * 1000;

// Builds the HTTP app. `deps` lets tests swap in a fake CDP (fetch + a fake
// WebSocket) and a fake sleep, so the suite never needs a real Chrome.
export function createApp(config, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const WS = deps.WS ?? globalThis.WebSocket;
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const tracker = new TabTracker({ cdpUrl: config.cdpUrl, fetchImpl });
  const queue = new GapQueue({ minGapMs: config.minGapS * 1000 });

  async function doFetch(targetUrl) {
    const tab = await openTab(config.cdpUrl, fetchImpl);
    tracker.track(tab.id);
    try {
      return await withTimeout(
        fetchPage({
          wsUrl: tab.webSocketDebuggerUrl,
          targetUrl,
          waitMs: config.waitS * 1000,
          sleep,
          WS,
        }),
        config.timeoutS * 1000,
        'fetch timed out',
      );
    } finally {
      // Always closes, on success, on error and on timeout.
      await tracker.close(tab.id);
    }
  }

  function startSweeper(intervalMs = TEN_MINUTES_MS) {
    tracker.sweep().catch(() => {});
    const timer = setInterval(() => tracker.sweep().catch(() => {}), intervalMs);
    timer.unref?.();
    return timer;
  }

  function json(res, status, body) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    });
    res.end(data);
  }

  async function handle(req, res) {
    let url;
    try {
      url = new URL(req.url, 'http://internal');
    } catch {
      return json(res, 400, { error: 'bad request' });
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/fetch') {
      const provided = bearerToken(req.headers.authorization);
      if (!provided || !checkToken(config.token, provided)) {
        return json(res, 401, { error: 'unauthorized' });
      }

      const target = url.searchParams.get('url');
      if (!target) return json(res, 400, { error: 'missing url' });

      const check = checkUrl(target, config.allowHostSet);
      if (!check.ok) return json(res, 400, { error: check.reason });

      try {
        const result = await queue.run(() => doFetch(target));
        return json(res, 200, result);
      } catch (err) {
        const timedOut = /timed out/i.test(err?.message || '');
        return json(res, timedOut ? 504 : 502, { error: err?.message || 'fetch failed' });
      }
    }

    return json(res, 404, { error: 'not found' });
  }

  const server = createHttpServer((req, res) => {
    handle(req, res).catch((err) => json(res, 500, { error: err?.message || 'internal error' }));
  });

  return { server, tracker, queue, startSweeper };
}
