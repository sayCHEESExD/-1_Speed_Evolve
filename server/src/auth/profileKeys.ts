import { randomBytes } from 'node:crypto';

/**
 * Which document a player's progress lives in.
 *
 * Two kinds of key and never a third:
 *
 *   `bloxity:<accountId>`  a signed-in Bloxity account, VERIFIED server-side
 *   `<browser id>`         a guest, the id this browser keeps in localStorage
 *
 * The prefix is RESERVED. A browser id is whatever a client chose to send, so
 * one that started with it would be a guest naming themselves into somebody
 * else's account - every browser id carrying it is refused outright.
 */
export const ACCOUNT_PREFIX = 'bloxity:';

/** Longest browser id accepted. The client's own ids are about twenty. */
const MAX_GUEST_ID = 64;

/** The characters a browser id may use. The client's are `p_` and base-36. */
const GUEST_ID = /^[A-Za-z0-9_-]+$/;

/** The profile key for a verified Bloxity account id. */
export const accountKey = (accountId: string): string => `${ACCOUNT_PREFIX}${accountId}`;

/** True for a key that names an account. */
export const isAccountKey = (key: string): boolean => key.startsWith(ACCOUNT_PREFIX);

/** True for a key a guest may use: well-formed, and never the reserved prefix. */
export const isGuestKey = (key: string): boolean =>
  key.length > 0 &&
  key.length <= MAX_GUEST_ID &&
  !key.startsWith(ACCOUNT_PREFIX) &&
  GUEST_ID.test(key);

/**
 * A browser id from a client, or null if it cannot be used.
 *
 * Null means the player plays as an unsaved guest: they are let in, and
 * nothing they do is written anywhere. That is the answer to a forged id - not
 * an error the client can probe with.
 */
export const guestKeyFrom = (value: unknown): string | null =>
  typeof value === 'string' && isGuestKey(value) ? value : null;

/**
 * A fresh guest id, in the shape the client makes its own. Random bytes from
 * the CSPRNG, because a guest id is the only thing standing between a guest
 * profile and anybody who could guess it.
 */
export const freshGuestKey = (): string => `p_${randomBytes(12).toString('hex')}`;
