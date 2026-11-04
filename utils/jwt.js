const crypto = require('crypto');
function b64(value) { return Buffer.from(value).toString('base64url'); }
function sign(payload, secret = process.env.JWT_SECRET, expiresIn = process.env.JWT_EXPIRES_IN || '8h') {
  if (!secret) throw new Error('JWT_SECRET must be set in the environment');
  const seconds = /^\d+$/.test(expiresIn) ? Number(expiresIn) : ({ '1h':3600, '8h':28800, '24h':86400 }[expiresIn] || 28800);
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ ...payload, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+seconds }));
  const input = `${head}.${body}`;
  const signature = crypto.createHmac('sha256', secret).update(input).digest('base64url');
  return `${input}.${signature}`;
}
function verify(token, secret = process.env.JWT_SECRET) {
  if (!secret) throw new Error('JWT_SECRET must be set in the environment');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid token');
  const input = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', secret).update(input).digest();
  let actual;
  try { actual = Buffer.from(parts[2], 'base64url'); } catch { throw new Error('Invalid token'); }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new Error('Invalid token');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (!payload.exp || payload.exp <= Math.floor(Date.now()/1000)) throw new Error('Token expired');
  return payload;
}
module.exports = { sign, verify };
