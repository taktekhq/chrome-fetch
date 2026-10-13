# chrome-fetch

Fetch a URL through an already-running, logged-in Chrome, over its DevTools
protocol (CDP), and get back the page's text. For the case where a site
blocks plain server requests but serves the same page fine to a real,
logged-in browser.

```
$ curl -H "Authorization: Bearer $TOKEN" \
    "http://127.0.0.1:7777/fetch?url=https://www.reddit.com/r/foo/.json"
{"status": 200, "body": "..."}
```

## Why

Some sites (Reddit is the common one) return a 403 to requests that look
like a server, but work fine in an actual browser, especially one that is
already logged in. If you already keep a Chrome instance open with
`--remote-debugging-port` for some other reason (browser automation, a
scraping pipeline, an agent that drives the browser), `chrome-fetch` is a
small HTTP wrapper around it: open a new tab in that Chrome, load the URL,
read `document.body.innerText`, close the tab. Nothing it does needs a
login of its own; it borrows the one already sitting in that Chrome
profile.

It is deliberately tiny: one process, Node's own `http`, `fetch` and
`WebSocket`, no dependencies.

## Requirements

- Node 22 or newer (uses the built-in `fetch` and `WebSocket` client).
- A Chrome (or Chromium) already running with remote debugging on, e.g.
  `--remote-debugging-port=9222`.

## Run

```sh
TOKEN=$(openssl rand -hex 32) node bin/chrome-fetch.mjs
```

Or install it as a global command:

```sh
npm install -g .
TOKEN=... chrome-fetch
```

## Config

Every setting is an env var, or the matching flag (a flag wins over its env
var):

| Env | Flag | Default | Meaning |
|---|---|---|---|
| `LISTEN` | `--listen` | `127.0.0.1:7777` | `host:port` to bind to |
| `CDP_URL` | `--cdp-url` | `http://127.0.0.1:9222` | the Chrome DevTools endpoint |
| `TOKEN` | `--token` | *(required)* | bearer token callers must send |
| `ALLOW_HOSTS` | `--allow-hosts` | `www.reddit.com,old.reddit.com` | comma-separated hostnames `/fetch` is allowed to open |
| `MIN_GAP_S` | `--min-gap-s` | `3` | minimum seconds between the start of one fetch and the next |
| `TIMEOUT_S` | `--timeout-s` | `20` | give up on a fetch after this long |
| `WAIT_S` | `--wait-s` | `2` | extra wait after the page's load event, for JS-rendered content |

## API

- `GET /health`: `{"ok": true}`. No auth.
- `GET /fetch?url=<url-encoded https url>`, header `Authorization: Bearer <TOKEN>`:
  - `401` if the token is missing or wrong.
  - `400` if the url is not `https://`, or its host is not in `ALLOW_HOSTS`.
  - Otherwise opens a new tab, navigates, waits for the page to load plus
    `WAIT_S` more, and returns `{"status": <http status, best effort>, "body": "<innerText>"}`.
    Add `&format=html` to get `document.documentElement.outerHTML` instead, for pages whose
    data lives in attributes (for example Reddit's `<shreddit-post>` elements, now that
    Reddit blocks its `.json` endpoints for most browsers).
  - The tab is always closed afterwards, including on a timeout or an
    error.

Only one fetch runs at a time; a new one waits for `MIN_GAP_S` since the
last one started before it begins. This is a shared Chrome someone is also
using themselves: a slow, serial queue is the point, not a bug.

Every 10 minutes (and once at startup), `chrome-fetch` closes any tab *it
opened* that is somehow still open (a crash mid-fetch, a close that
failed). It never looks at, or touches, a tab it did not open.

## Security

`chrome-fetch` hands out whatever that Chrome profile is logged into, to
anyone holding the token, for any host on the allow list. Treat it like a
credential:

- **Bind to a private interface**, never `0.0.0.0`: a VPN/tailnet IP, or
  `127.0.0.1` if only local processes need it. `LISTEN` takes exactly one
  `host:port`; there is no way to listen on every interface by accident
  through this tool, but a firewall rule on the host is still worth having.
- Keep `ALLOW_HOSTS` as narrow as whatever you actually need; it exists so
  a stolen token cannot be used to fetch arbitrary logged-in pages.
- Generate the token with something like `openssl rand -hex 32`, and do not
  commit it. The example deploys below keep it in a file the service
  reads, never in the unit file itself.

## Tests

```sh
npm test
```

`node --test` covers everything that does not need a real Chrome: the
token check (including timing-safe comparison and length mismatches), the
host allow-list, the fetch queue's gap/serialization logic, and tab
tracking/cleanup bookkeeping. A fake WebSocket stands in for CDP in
`test/cdp.test.mjs` and `test/server.test.mjs`, so the whole HTTP surface
(`/health`, `/fetch`, auth, allow-list, tab close-on-finish) is covered
without a browser.

## Deploying

### launchd (macOS)

Keep the token out of the plist; have it read from a small env file
instead.

`~/.config/chrome-fetch/env` (mode `600`):

```
TOKEN=<your generated token>
LISTEN=100.x.y.z:7777
CDP_URL=http://127.0.0.1:9222
ALLOW_HOSTS=www.reddit.com,old.reddit.com
```

`bin/launchd-run.sh` (included in this repo) loads that file and starts the
service:

```sh
ENV_FILE=~/.config/chrome-fetch/env /path/to/chrome-fetch/bin/launchd-run.sh
```

`~/Library/LaunchAgents/com.example.chrome-fetch.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.example.chrome-fetch</string>
  <key>ProgramArguments</key>
  <array><string>/path/to/chrome-fetch/bin/launchd-run.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/chrome-fetch.log</string>
  <key>StandardErrorPath</key><string>/tmp/chrome-fetch.log</string>
</dict>
</plist>
```

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.chrome-fetch.plist
```

### systemd (Linux)

`/etc/chrome-fetch.env` (mode `600`, owned by the service user):

```
TOKEN=<your generated token>
LISTEN=127.0.0.1:7777
```

`/etc/systemd/system/chrome-fetch.service`:

```ini
[Unit]
Description=chrome-fetch
After=network.target

[Service]
EnvironmentFile=/etc/chrome-fetch.env
ExecStart=/usr/bin/node /path/to/chrome-fetch/bin/chrome-fetch.mjs
Restart=on-failure
User=chrome-fetch

[Install]
WantedBy=multi-user.target
```

```sh
systemctl daemon-reload
systemctl enable --now chrome-fetch
```

## License

MIT, see [LICENSE](LICENSE).
