// https-only, allow-listed hosts. Anything else is a 400, never attempted.
export function checkUrl(rawUrl, allowHostSet) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid url' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'only https urls are allowed' };
  }
  if (!allowHostSet.has(url.hostname.toLowerCase())) {
    return { ok: false, reason: `host not allowed: ${url.hostname}` };
  }
  return { ok: true, url };
}
