// Config from flags and env. A flag wins over its env var; env wins over the default.
// LISTEN, CDP_URL, TOKEN, ALLOW_HOSTS, MIN_GAP_S, TIMEOUT_S, WAIT_S
// --listen, --cdp-url, --token, --allow-hosts, --min-gap-s, --timeout-s, --wait-s

const DEFAULTS = {
  listen: '127.0.0.1:7777',
  cdpUrl: 'http://127.0.0.1:9222',
  token: '',
  allowHosts: 'www.reddit.com,old.reddit.com',
  minGapS: 3,
  timeoutS: 20,
  waitS: 2,
};

const FLAG_TO_KEY = {
  '--listen': 'listen',
  '--cdp-url': 'cdpUrl',
  '--token': 'token',
  '--allow-hosts': 'allowHosts',
  '--min-gap-s': 'minGapS',
  '--timeout-s': 'timeoutS',
  '--wait-s': 'waitS',
};

const ENV_TO_KEY = {
  LISTEN: 'listen',
  CDP_URL: 'cdpUrl',
  TOKEN: 'token',
  ALLOW_HOSTS: 'allowHosts',
  MIN_GAP_S: 'minGapS',
  TIMEOUT_S: 'timeoutS',
  WAIT_S: 'waitS',
};

const NUMERIC_KEYS = new Set(['minGapS', 'timeoutS', 'waitS']);

export function parseConfig(argv = [], env = {}) {
  const out = { ...DEFAULTS };

  for (const [envKey, key] of Object.entries(ENV_TO_KEY)) {
    if (env[envKey] !== undefined && env[envKey] !== '') out[key] = env[envKey];
  }

  for (let i = 0; i < argv.length; i++) {
    const key = FLAG_TO_KEY[argv[i]];
    if (key) out[key] = argv[++i];
  }

  for (const key of NUMERIC_KEYS) {
    out[key] = Number(out[key]);
    if (!Number.isFinite(out[key]) || out[key] < 0) {
      throw new Error(`${key} must be a non-negative number, got "${out[key]}"`);
    }
  }

  if (!out.token) {
    throw new Error('TOKEN is required (env TOKEN or --token)');
  }

  const [host, port] = splitListen(out.listen);
  out.host = host;
  out.port = Number(port);

  out.allowHostSet = new Set(
    String(out.allowHosts)
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );

  return out;
}

function splitListen(listen) {
  const idx = listen.lastIndexOf(':');
  if (idx === -1) throw new Error(`LISTEN must be host:port, got "${listen}"`);
  const host = listen.slice(0, idx);
  const port = listen.slice(idx + 1);
  if (!host || !port || Number.isNaN(Number(port))) {
    throw new Error(`LISTEN must be host:port, got "${listen}"`);
  }
  return [host, port];
}
