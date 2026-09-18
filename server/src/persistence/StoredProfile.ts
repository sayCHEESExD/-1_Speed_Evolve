import { sanitizeDisplayName } from '@evolve/shared';

/**
 * Everything worth keeping about a player between sessions.
 *
 * Deliberately the DERIVING facts only: level, movement speed, the gain
 * figures and the equipped mount are all recomputed from these on load through
 * the same formulas a live session uses, so a tuning change reaches returning
 * players too.
 *
 * ONE DOCUMENT PER PLAYER, keyed by `profileKey`: `bloxity:<accountId>` for a
 * signed-in account, the browser's own id for a guest.
 */
export interface StoredProfile {
  /** Lifetime Speed farmed. Level follows from it. */
  totalSpeed: number;
  /** Stage wins banked. */
  wins: number;
  /**
   * Bitmask of mounts evolved into. The equipped one is the highest of these.
   *
   * Stored rather than re-derived from level and Wins, and that is deliberate:
   * a mount once earned is kept even if Wins are later spent below its
   * threshold, so the mask is the record of what happened rather than a cache
   * of what the current figures would imply.
   */
  unlockedMounts: number;
  /** Rebirths performed. */
  rebirths: number;
  /** Bitmask of trails bought, and the one worn. Permanent unlocks. */
  ownedTrails: number;
  trailSlot: number;
  /** Bitmask of auras bought, and the one worn. Permanent unlocks. */
  ownedAuras: number;
  auraSlot: number;
  /** Bitmask of items bought, and the one carried. Permanent unlocks. */
  ownedItems: number;
  itemSlot: number;
  /**
   * The speed-upgrade pad the player last rode onto.
   *
   * A CHOICE rather than a derived fact, which is why it is stored at all. It
   * is still CLAMPED to what the restored Wins can afford on load.
   */
  upgradeSlot: number;
  /** Highest stage ever finished. */
  bestStage: number;
  /**
   * The player's Bloxity name as last seen, or '' for a player who has only
   * played signed out. Public text and never an account id - kept only so the
   * boards can name somebody who is not currently connected.
   */
  displayName: string;
  /** Wall clock of the last save. The newer copy wins a leaderboard merge. */
  updatedAt: number;
  /**
   * Bux transactions already credited to this profile, newest last.
   *
   * The profile's own record of what it has been paid, so a grant whose
   * "applied" mark never reached the database - a pod killed between the two
   * writes - is recognised and not paid a second time when it is claimed
   * again.
   */
  appliedGrants: string[];
  /** On an ACCOUNT profile: the guest key its first progress came from. */
  migratedFrom?: string;
  /**
   * On a GUEST profile: the account it was migrated into.
   *
   * Set only AFTER the account copy is safely written. A guest profile carrying
   * it is a recovery copy and nothing more: it is never restored into a guest
   * session, never migrated again - which is what stops one browser seeding
   * its progress into any number of accounts - and never shown on a board.
   */
  migratedTo?: string;
}

/** Fields this build writes on every save. Everything else is left alone. */
export const SAVED_FIELDS = [
  'totalSpeed',
  'wins',
  'unlockedMounts',
  'rebirths',
  'ownedTrails',
  'trailSlot',
  'ownedAuras',
  'auraSlot',
  'ownedItems',
  'itemSlot',
  'upgradeSlot',
  'bestStage',
  'displayName',
  'updatedAt',
  'appliedGrants',
] as const;

/**
 * Optional fields a save may CLEAR, and the only ones.
 *
 * A save `$unset`s these when they are empty and never touches a field that is
 * not on this list or on `SAVED_FIELDS`, so a field written by a newer build -
 * or by migration - survives an older build's saves.
 */
export const CLEARABLE_FIELDS = ['displayName'] as const;

/** How many transaction ids a profile remembers. Far more than any session buys. */
export const APPLIED_GRANTS_KEPT = 200;

/**
 * One write to one profile: fields to set and fields to remove.
 *
 * NEVER a whole document. Several pods share one database, and a write that
 * replaced the document would erase whatever another writer - or another
 * build - had put there.
 */
export interface ProfileUpdate {
  readonly set: Readonly<Record<string, unknown>>;
  readonly unset: readonly string[];
}

const numeric = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : undefined;

/**
 * A stored record, read back.
 *
 * The known fields are validated and defaulted; EVERY other field on the
 * record is kept exactly as it was. The loader this replaced rebuilt each
 * profile from a fixed list, which silently dropped anything it did not know
 * the next time the server restarted.
 */
export const readProfile = (raw: unknown): (StoredProfile & Record<string, unknown>) | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const grants = Array.isArray(value['appliedGrants'])
    ? (value['appliedGrants'] as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
  const { _id: _ignored, ...rest } = value;
  const profile: StoredProfile & Record<string, unknown> = {
    ...rest,
    totalSpeed: numeric(value['totalSpeed']),
    wins: numeric(value['wins']),
    unlockedMounts: numeric(value['unlockedMounts']),
    rebirths: numeric(value['rebirths']),
    ownedTrails: numeric(value['ownedTrails']),
    trailSlot: numeric(value['trailSlot']),
    ownedAuras: numeric(value['ownedAuras']),
    auraSlot: numeric(value['auraSlot']),
    ownedItems: numeric(value['ownedItems']),
    itemSlot: numeric(value['itemSlot']),
    upgradeSlot: numeric(value['upgradeSlot']),
    bestStage: numeric(value['bestStage']),
    displayName: sanitizeDisplayName(value['displayName']),
    updatedAt: numeric(value['updatedAt']),
    appliedGrants: grants.slice(-APPLIED_GRANTS_KEPT),
  };
  const from = text(value['migratedFrom']);
  const to = text(value['migratedTo']);
  if (from) profile.migratedFrom = from;
  else delete profile.migratedFrom;
  if (to) profile.migratedTo = to;
  else delete profile.migratedTo;
  return profile;
};

/** The save a profile turns into: every saved field set, empty clearables removed. */
export const saveUpdate = (profile: StoredProfile): ProfileUpdate => {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  for (const field of SAVED_FIELDS) {
    const value = profile[field];
    if ((CLEARABLE_FIELDS as readonly string[]).includes(field) && (value === '' || value === undefined)) {
      unset.push(field);
    } else {
      set[field] = value;
    }
  }
  return { set, unset };
};

/**
 * True when a profile holds progress worth carrying into an account.
 *
 * A brand-new browser's profile - nothing farmed, nothing won, nothing bought
 * - is not migrated: there is nothing to keep, and inserting it would mark an
 * account as "has a profile" with nothing in it.
 */
export const hasProgress = (profile: StoredProfile): boolean =>
  profile.totalSpeed > 0 ||
  profile.wins > 0 ||
  profile.rebirths > 0 ||
  profile.bestStage > 0 ||
  profile.ownedTrails > 0 ||
  profile.ownedAuras > 0 ||
  profile.ownedItems > 0;

/** Apply one update to a plain record, the way the database applies it. */
export const applyUpdate = (
  record: Record<string, unknown>,
  update: ProfileUpdate,
): Record<string, unknown> => {
  const next: Record<string, unknown> = { ...record, ...update.set };
  for (const field of update.unset) delete next[field];
  return next;
};

/**
 * Fold a later update into an earlier one still waiting to be written, so a
 * queue holds ONE pending write per key and it is always the latest.
 */
export const mergeUpdates = (earlier: ProfileUpdate, later: ProfileUpdate): ProfileUpdate => {
  const set: Record<string, unknown> = { ...earlier.set };
  const unset = new Set(earlier.unset);
  for (const field of later.unset) {
    delete set[field];
    unset.add(field);
  }
  for (const [field, value] of Object.entries(later.set)) {
    set[field] = value;
    unset.delete(field);
  }
  return { set, unset: [...unset] };
};
