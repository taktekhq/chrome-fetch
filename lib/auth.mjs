import { timingSafeEqual } from 'node:crypto';

// Constant-time token check. A wrong length fails too, without letting the
// length itself leak through timing: we still run a same-size comparison.
export function checkToken(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string' || expected.length === 0) {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function bearerToken(authorizationHeader) {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match ? match[1] : null;
}
