import { createHash } from 'node:crypto';
import { serverConfig } from '../config/serverConfig.js';
import { logger } from '../util/logger.js';

const SCOPE = 'auth';

/**
 * Bloxity's API. A CONSTANT, never configuration: an env var that could point
 * verification somewhere else would be an env var that could make every token
 * valid.
 */
const BLOXITY_API = 'https://api.bloxity.io';

/**
 * The route the official SDK itself validates a game token against. The
 * hosting docs do not cover server-side verification; this is the call
 * `legion-sdk.js` makes, with the same header and body.
 */
const VERIFY_PATH = '/v1/auth/game-token/verify';

/** How long a verification may take before it counts as "unavailable". */
const VERIFY_TIMEOUT_MS = 4000;

/** How long a VERIFIED token is trusted without asking again (capped at its exp). */
const VERIFIED_TTL_MS = 5 * 60 * 1000;

/** How long a REJECTED token is remembered, so a bad one is not re-sent in a loop. */
const REJECTED_TTL_MS = 30 * 1000;

/** Longest token accepted at all. Real ones are a few hundred bytes. */
const MAX_TOKEN_LENGTH = 8192;

/** Entries the cache holds before the oldest are dropped. */
const CACHE_LIMIT = 5000;

/**
 * What asking Bloxity about a token produced.
 *
 * THREE outcomes, and the third matters: "unavailable" - a timeout, a 5xx, a
 * network fault - is not "rejected". The player is let in as a guest for now
 * and verified again on a backoff; they are never permanently demoted because
 * Bloxity had a bad minute.
 */
export type AuthResult =
  | { readonly status: 'verified'; readonly accountId: string; readonly name: string }
  | { readonly status: 'rejected'; readonly reason: string }
  | { readonly status: 'unavailable'; readonly reason: string };

interface CacheEntry {
  readonly result: AuthResult;
  readonly until: number;
}

const cache = new Map<string, CacheEntry>();

/** The cache key: a hash of the token, never the token itself. */
const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * The token's `exp`, in milliseconds, or null.
 *
 * Read ONLY to cap how long a verification Bloxity already made is cached. It
 * is never used to decide validity: the token is signed with Bloxity's key,
 * which this server does not have (Legion's `JWT_SECRET` is the game's own
 * secret, not Bloxity's), so nothing about it is trusted locally.
 */
const expiryOf = (token: string): number | null => {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown };
    return typeof parsed.exp === 'number' && Number.isFinite(parsed.exp) ? parsed.exp * 1000 : null;
  } catch {
    return null;
  }
};

const remember = (key: string, result: AuthResult, until: number): void => {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { result, until });
};

/**
 * Ask Bloxity who a portal token belongs to.
 *
 * FAIL CLOSED: only a 2xx whose body carries a non-empty string `_id` - as
 * `{ user }` or as the user itself, the two shapes the SDK accepts - is an
 * account. Anything else is a guest.
 */
export const verifyToken = async (token: unknown): Promise<AuthResult> => {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { status: 'rejected', reason: 'no usable token' };
  }

  const key = tokenHash(token);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.until > now) return cached.result;
  if (cached) cache.delete(key);

  let response: Response;
  try {
    response = await fetch(`${BLOXITY_API}${VERIFY_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ gameSlug: serverConfig.gameSlug }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(SCOPE, `Bloxity verification unavailable: ${reason}`);
    return { status: 'unavailable', reason };
  }

  if (response.status >= 500 || response.status === 429) {
    logger.warn(SCOPE, `Bloxity verification unavailable: HTTP ${response.status}`);
    return { status: 'unavailable', reason: `HTTP ${response.status}` };
  }

  if (!response.ok) {
    let code = '';
    try {
      code = ((await response.json()) as { code?: string }).code ?? '';
    } catch {
      /* the status says enough */
    }
    const result: AuthResult = { status: 'rejected', reason: `HTTP ${response.status} ${code}`.trim() };
    remember(key, result, now + REJECTED_TTL_MS);
    return result;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // A 2xx that is not JSON is not a verification. Not the player's fault
    // either, so it is retried rather than remembered.
    return { status: 'unavailable', reason: 'unreadable 2xx reply' };
  }
  const user = (
    body && typeof body === 'object' && 'user' in body && (body as { user?: unknown }).user
      ? (body as { user: unknown }).user
      : body
  ) as { _id?: unknown; username?: unknown; displayName?: unknown } | null;
  const accountId = user?._id;
  if (typeof accountId !== 'string' || accountId.length === 0 || accountId.length > 128) {
    return { status: 'unavailable', reason: '2xx reply without an account id' };
  }

  const name =
    typeof user?.displayName === 'string' && user.displayName
      ? user.displayName
      : typeof user?.username === 'string'
        ? user.username
        : '';
  const result: AuthResult = { status: 'verified', accountId, name };
  const expiry = expiryOf(token);
  const until = Math.min(now + VERIFIED_TTL_MS, expiry ?? Number.POSITIVE_INFINITY);
  if (until > now) remember(key, result, until);
  return result;
};
