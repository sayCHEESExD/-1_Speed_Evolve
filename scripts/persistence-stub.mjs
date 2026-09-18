/**
 * A stand-in for Bloxity's token check, for `verify-persistence.mjs` ONLY.
 *
 * Preloaded into the test server with `node --import`, so the production code
 * runs completely unchanged - there is no test switch anywhere in it. It
 * replaces exactly ONE URL, Bloxity's verify route, and passes every other
 * request to the real `fetch`.
 *
 * Tokens it understands (anything else is rejected like a junk token):
 *   good:<accountId>:<name>   200 { user: { _id, username } }
 *   down:<anything>           503 - Bloxity unavailable
 *
 * It answers the way the live endpoint was probed to: 401 GAME_TOKEN_REQUIRED
 * with no token, 401 GAME_TOKEN_INVALID for a bad one - and it rejects a
 * request for any gameSlug but this game's, as the real one does for a token
 * minted for a different game.
 */
const VERIFY_URL = 'https://api.bloxity.io/v1/auth/game-token/verify';
const GAME_SLUG = 'speed-evolve';
const realFetch = globalThis.fetch;

const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url !== VERIFY_URL) return realFetch(input, init);

  if ((init.method ?? 'GET').toUpperCase() !== 'POST') return reply(404, { error: 'Not Found' });
  const header = new Headers(init.headers).get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  let body = {};
  try {
    body = JSON.parse(typeof init.body === 'string' ? init.body : '{}');
  } catch {
    return reply(400, { error: 'Validation error' });
  }
  if (typeof body.gameSlug !== 'string') return reply(400, { error: 'Validation error' });
  if (!token) return reply(401, { code: 'GAME_TOKEN_REQUIRED', error: 'A game capability is required' });
  if (body.gameSlug !== GAME_SLUG) {
    return reply(401, { code: 'GAME_TOKEN_INVALID', error: 'The game capability is invalid or expired' });
  }
  if (token.startsWith('down:')) return reply(503, { error: 'Service Unavailable' });
  const match = /^good:([A-Za-z0-9]+):([A-Za-z0-9]+)$/.exec(token);
  if (!match) return reply(401, { code: 'GAME_TOKEN_INVALID', error: 'The game capability is invalid or expired' });
  return reply(200, { user: { _id: match[1], username: match[2] } });
};
