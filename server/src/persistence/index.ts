import { serverConfig } from '../config/serverConfig.js';
import { JsonProfileStorage } from './JsonProfileStorage.js';
import { MongoProfileStorage } from './MongoProfileStorage.js';
import type { ProfileStorage } from './ProfileStorage.js';

export type { GrantRecord, ProfileStorage } from './ProfileStorage.js';
export { StorageUnavailableError } from './ProfileStorage.js';
export type { ProfileUpdate, StoredProfile } from './StoredProfile.js';

/**
 * The ONLY place a concrete store is named.
 *
 * `MONGODB_URI` set - which Legion does for every backend pod, an isolated
 * database per game and channel - means MongoDB, and progress lives on the
 * account across every device, restart, scale-to-zero and deploy. Unset means
 * the JSON files in the data directory, the dev store.
 */
export const createPersistence = (): ProfileStorage =>
  serverConfig.mongoUri
    ? new MongoProfileStorage(serverConfig.mongoUri, serverConfig.dataDir)
    : new JsonProfileStorage(serverConfig.dataDir);
