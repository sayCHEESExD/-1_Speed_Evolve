import { accountKey } from '../auth/profileKeys.js';
import { logger } from '../util/logger.js';
import { profileStore } from './ProfileStore.js';

const SCOPE = 'bux';

/**
 * What a SKU is worth, in Wins.
 *
 * The PRICE is not here and must never be: Bloxity charges the Bux from its
 * own catalogue, keyed by the game slug, and this server is only ever told
 * which SKU was bought. What this table decides is the other half - what the
 * game hands over - and that half belongs to the game.
 *
 * An unknown SKU grants nothing and is logged. It is still RECORDED, so a
 * retry is still recognised as a retry.
 */
const SKU_WINS: Readonly<Record<string, number>> = {
  wins_small: 250,
  wins_large: 1500,
};

/** SKUs that grant something other than Wins, so they are not "unknown". */
const KNOWN_NON_WINS = new Set(['speed_boost_1h']);

/**
 * Purchases that have been paid for and not yet handed over.
 *
 * A QUEUE rather than a direct write, and that is the whole design. The
 * webhook arrives on the HTTP thread at a moment of Bloxity's choosing; the
 * player may be live in a room with their Wins held in replicated state that
 * the autosave will write over the stored profile a few seconds later. So the
 * webhook only ever RECORDS - durably, in the same store as the profiles - and
 * the room claims and applies what is waiting.
 *
 * Recorded against the ACCOUNT Bloxity says paid, `bloxity:<userId>`, and
 * claimed only by a session whose account the server VERIFIED with Bloxity.
 * No browser-supplied id plays any part.
 */
class BuxGrants {
  /**
   * Record a paid purchase. Resolves once it is DURABLE; throws if it could
   * not be made so, and the webhook then must not answer 2xx.
   */
  async record(userId: string, transactionId: string, sku: string): Promise<'recorded' | 'duplicate'> {
    const wins = SKU_WINS[sku] ?? 0;
    if (wins === 0 && !KNOWN_NON_WINS.has(sku)) {
      logger.warn(SCOPE, `unknown sku "${sku}" - recorded, nothing to grant`);
    }
    const outcome = await profileStore.recordGrant({
      transactionId,
      account: accountKey(userId),
      sku,
      wins,
    });
    if (outcome === 'duplicate') {
      logger.info(SCOPE, `duplicate webhook for ${transactionId}, already recorded`);
    } else {
      logger.info(SCOPE, `recorded ${sku} (+${wins} wins) for ${accountKey(userId)} [${transactionId}]`);
    }
    return outcome;
  }
}

export const buxGrants = new BuxGrants();
