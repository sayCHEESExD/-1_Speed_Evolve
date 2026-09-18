/**
 * Persistent, cross-device progress: proved end to end.
 *
 * Spawns the BUILT server (`server/dist`) with `persistence-stub.mjs` preloaded
 * via `node --import` - that stub replaces Bloxity's token-verify URL and
 * nothing else - joins it with real colyseus.js clients, and reads the store
 * DIRECTLY to check what actually landed.
 *
 * It runs:
 *   - against the JSON dev store, always;
 *   - against MongoDB at MONGODB_URI, when that is set;
 *   - against a mongod this script starts and stops itself, for the outage
 *     tests, when a mongod binary is found (MONGOD_BIN, or the cache
 *     mongodb-memory-server keeps in ~/.cache/mongodb-binaries - install that
 *     package OUTSIDE this repo if you need it to fetch one).
 *
 *   !!! WARNING: WITH MONGODB_URI SET, THE DATABASE NAMED IN THAT URI IS    !!!
 *   !!! WIPED - DROPPED - BEFORE AND AFTER THE RUN. POINT IT AT A THROWAWAY !!!
 *   !!! DATABASE, NEVER AT ANYTHING WITH REAL PLAYERS IN IT.                !!!
 *
 *   npm run verify:persistence
 *   MONGODB_URI=mongodb://127.0.0.1:27017/evolve-test npm run verify:persistence
 *
 * Not part of `npm run verify`: it spawns servers and databases and takes a
 * couple of minutes.
 */
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join as joinPath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from 'colyseus.js';
import { MongoClient } from 'mongodb';
import { MessageType, ROOM_NAME } from '../shared/dist/index.js';

const ROOT = joinPath(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = joinPath(ROOT, 'server', 'dist', 'index.js');
const STUB = pathToFileURL(joinPath(ROOT, 'scripts', 'persistence-stub.mjs')).href;
const SECRET = 'verify-persistence-secret';
const OWN_MONGO_PORT = 27999;

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.error(`  FAIL  ${message}`);
};
const check = (message, ok, detail = '') => {
  if (ok) console.log(`  ok    ${message}`);
  else fail(`${message}${detail ? ` - ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until `fn` returns something truthy, or undefined after `ms`. */
const waitFor = async (fn, ms = 10_000, every = 100) => {
  const until = Date.now() + ms;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      /* not yet */
    }
    if (Date.now() > until) return undefined;
    await sleep(every);
  }
};

const profile = (fields) => ({
  totalSpeed: 0,
  wins: 0,
  unlockedMounts: 1,
  rebirths: 0,
  ownedTrails: 0,
  trailSlot: 0,
  ownedAuras: 0,
  auraSlot: 0,
  ownedItems: 0,
  itemSlot: 0,
  upgradeSlot: 1,
  bestStage: 0,
  displayName: '',
  updatedAt: 1,
  ...fields,
});

// ---------------------------------------------------------------------------
// The server under test.
// ---------------------------------------------------------------------------

let nextPort = 2611;
const allLogs = [];

const startServer = async ({ dataDir, mongoUri = '', slug = 'speed-evolve' }) => {
  const port = nextPort;
  nextPort += 1;
  const env = { ...process.env, EVOLVE_DATA_DIR: dataDir, BLOXITY_GAME_ID: slug, BLOXITY_WEBHOOK_SECRET: SECRET };
  delete env.MONGODB_URI;
  delete env.PORT;
  if (mongoUri) env.MONGODB_URI = mongoUri;
  const proc = spawn(process.execPath, ['--import', STUB, SERVER_ENTRY, '--port', String(port)], {
    cwd: joinPath(ROOT, 'server'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines = [];
  const take = (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (!line) continue;
      lines.push(line);
      allLogs.push(line);
      if (process.env.VERBOSE) console.log(`      [server ${port}] ${line}`);
    }
  };
  proc.stdout.on('data', take);
  proc.stderr.on('data', take);
  const exited = new Promise((resolve) => proc.once('exit', resolve));
  const up = await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/health`)).ok, 20_000, 200);
  if (!up) throw new Error(`server on ${port} never answered /health:\n${lines.join('\n')}`);
  return {
    port,
    lines,
    alive: () => proc.exitCode === null && proc.signalCode === null,
    // HARD kill. On Windows a signal never reaches Node's handlers, so there is
    // no graceful path to rely on: every test that kills a server first waits
    // until the writes it cares about are visible in the store.
    kill: async () => {
      proc.kill('SIGKILL');
      await exited;
    },
  };
};

/** Join as a real client; resolves once this player's own state has arrived. */
const enter = async (server, options, timeoutMs = 15_000) => {
  const client = new Client(`ws://127.0.0.1:${server.port}`);
  const room = await Promise.race([
    client.joinOrCreate(ROOM_NAME, options),
    sleep(timeoutMs).then(() => {
      throw new Error('join timed out');
    }),
  ]);
  const messages = [];
  room.onMessage('*', (type, message) => messages.push({ type, message }));
  const me = () => room.state?.players?.get?.(room.sessionId);
  const arrived = await waitFor(() => me(), 10_000);
  if (!arrived) throw new Error('joined but no state arrived');
  return {
    room,
    me,
    messages,
    send: (type, message) => room.send(type, message),
    leave: async () => {
      await room.leave(true);
      await sleep(150);
    },
  };
};

const tryEnter = async (server, options) => {
  try {
    const session = await enter(server, options, 10_000);
    return { session };
  } catch (error) {
    return { error };
  }
};

const webhook = async (server, body, secret = SECRET) => {
  const response = await fetch(`http://127.0.0.1:${server.port}/bloxity/bux`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-legion-webhook-secret': secret },
    body: JSON.stringify(body),
  });
  return response.status;
};

// ---------------------------------------------------------------------------
// The stores, read directly.
// ---------------------------------------------------------------------------

const jsonStore = (dir) => ({
  label: 'JSON store',
  dir,
  seed: async (profiles) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(joinPath(dir, 'profiles.json'), JSON.stringify(profiles));
  },
  get: async (key) => {
    const file = joinPath(dir, 'profiles.json');
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8'))[key] ?? null;
  },
  grant: async (id) => {
    const file = joinPath(dir, 'grants.json');
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8'))[id] ?? null;
  },
  close: async () => {},
});

const mongoStore = async (uri, dir) => {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
  const db = client.db();
  return {
    label: `MongoDB (${db.databaseName})`,
    dir,
    uri,
    seed: async (profiles) => {
      const docs = Object.entries(profiles).map(([_id, fields]) => ({ _id, ...fields }));
      if (docs.length > 0) await db.collection('profiles').insertMany(docs);
    },
    get: async (key) => {
      const doc = await db.collection('profiles').findOne({ _id: key });
      if (!doc) return null;
      const { _id, ...rest } = doc;
      return rest;
    },
    grant: async (id) => db.collection('grants').findOne({ _id: id }),
    wipe: async () => {
      await db.dropDatabase();
    },
    raw: db,
    close: async () => client.close(),
  };
};

// ---------------------------------------------------------------------------
// A mongod this script owns, for the outage tests.
// ---------------------------------------------------------------------------

const findMongod = () => {
  if (process.env.MONGOD_BIN && existsSync(process.env.MONGOD_BIN)) return process.env.MONGOD_BIN;
  const cache = joinPath(homedir(), '.cache', 'mongodb-binaries');
  if (!existsSync(cache)) return null;
  const found = readdirSync(cache)
    .filter((name) => /^mongod/.test(name))
    .sort();
  return found.length > 0 ? joinPath(cache, found[0]) : null;
};

const ownMongod = (bin, dbPath) => {
  let proc = null;
  const uri = `mongodb://127.0.0.1:${OWN_MONGO_PORT}/speed-evolve-verify`;
  const reachable = async () => {
    const probe = new MongoClient(uri, { serverSelectionTimeoutMS: 700 });
    try {
      await probe.db().command({ ping: 1 });
      return true;
    } catch {
      return false;
    } finally {
      await probe.close().catch(() => {});
    }
  };
  return {
    uri,
    start: async () => {
      mkdirSync(dbPath, { recursive: true });
      proc = spawn(bin, ['--port', String(OWN_MONGO_PORT), '--dbpath', dbPath, '--bind_ip', '127.0.0.1'], {
        stdio: 'ignore',
      });
      const up = await waitFor(reachable, 30_000, 300);
      if (!up) throw new Error('own mongod never came up');
    },
    stop: async () => {
      if (!proc) return;
      const exited = new Promise((resolve) => proc.once('exit', resolve));
      proc.kill('SIGKILL');
      await exited;
      proc = null;
      await waitFor(async () => !(await reachable()), 10_000, 300);
    },
  };
};

// ---------------------------------------------------------------------------
// The scenarios.
// ---------------------------------------------------------------------------

const G1 = 'p_guestone';
const G3 = 'p_guestthree';
const G4 = 'p_guestfour';
const G5 = 'p_guestfive';
const G8 = 'p_guesteight';
const G9 = 'p_guestnine';

const SEED = {
  [G1]: profile({ wins: 7, totalSpeed: 500, displayName: 'SeedGuest', notInThisBuild: 'keep-me' }),
  [G3]: profile({ wins: 3, totalSpeed: 100 }),
  [G4]: profile({ wins: 400, totalSpeed: 50 }),
  [G5]: profile({ wins: 50 }),
  [G8]: profile({ wins: 8 }),
  [G9]: profile({ wins: 300 }),
  'bloxity:acc2': profile({ wins: 99, totalSpeed: 900, accountOnlyField: 'untouched' }),
};

const core = async (store, boot) => {
  console.log(`\n${store.label}: accounts, guests, migration, purchases`);
  await store.seed(SEED);
  let server = await boot();

  // 1. An existing guest profile restores - with a field this build does not know.
  {
    const s = await enter(server, { playerId: G1 });
    check('an existing guest profile restores', s.me().wins === 7 && Math.round(s.me().totalSpeed) === 500);
    await s.leave();
    const stored = await waitFor(async () => {
      const p = await store.get(G1);
      return p && p.updatedAt > 1 ? p : null;
    });
    check('  and its save keeps a field this build does not know', stored?.notInThisBuild === 'keep-me', JSON.stringify(stored));
  }

  // 2. Nothing but a verified token names an account.
  {
    const a = await enter(server, { playerId: 'bloxity:acc2' });
    check('a guest id with the account prefix gets NOTHING', a.me().wins === 0);
    await a.leave();
    const b = await enter(server, { playerId: 'acc2' });
    check('a raw account id as a browser id gets NOTHING', b.me().wins === 0);
    await b.leave();
    const c = await enter(server, { playerId: 'p_forgerone', token: 'forged-token' });
    check('a forged token gets NOTHING', c.me().wins === 0);
    await c.leave();
    const d = await enter(server, { playerId: 'p_forgertwo', bloxityId: 'acc2' });
    check('the old plain-text bloxityId option is ignored', d.me().wins === 0);
    await d.leave();
    await sleep(400);
    const account = await store.get('bloxity:acc2');
    check('  and the account they aimed at is untouched', account?.wins === 99);
  }

  // 3. First login migrates the browser's guest progress.
  {
    const s = await enter(server, { playerId: G3, token: 'good:acc3:Three' });
    check('first login keeps the guest progress in the session', s.me().wins === 3);
    const account = await waitFor(() => store.get('bloxity:acc3'));
    const guest = await waitFor(async () => {
      const g = await store.get(G3);
      return g?.migratedTo ? g : null;
    });
    check(
      '  the account profile was created from it, with migratedFrom',
      account?.wins === 3 && Math.round(account.totalSpeed) === 100 && account.migratedFrom === G3,
      JSON.stringify(account),
    );
    check(
      '  and the guest copy is kept, marked migratedTo',
      guest?.migratedTo === 'bloxity:acc3' && guest.wins === 3,
      JSON.stringify(guest),
    );
    await s.leave();
  }

  // 4-5. Mid-session sign-in carries LIVE progress; sign-out and back in.
  let rotated = '';
  {
    const s = await enter(server, { playerId: G4 });
    check('a guest session starts on its own profile', s.me().wins === 400);
    s.send(MessageType.BuyTrail, { slot: 1 });
    await waitFor(() => s.me().ownedTrails === 1);
    s.send(MessageType.Auth, { token: 'good:acc4:Four' });
    const account = await waitFor(async () => {
      const a = await store.get('bloxity:acc4');
      return a && a.ownedTrails === 1 ? a : null;
    });
    check(
      'signing in mid-session migrates the LIVE state',
      account?.wins === 150 && account.migratedFrom === G4,
      JSON.stringify(account),
    );
    check('  and the session keeps its progress', s.me().wins === 150 && s.me().ownedTrails === 1);

    s.send(MessageType.Auth, { token: null });
    const guestId = await waitFor(() => s.messages.find((m) => m.type === MessageType.GuestId));
    rotated = guestId?.message?.playerId ?? '';
    await waitFor(() => s.me().wins === 0);
    check(
      'signing out of a migrated browser gives a FRESH guest under a new id',
      s.me().wins === 0 && rotated !== '' && rotated !== G4,
    );
    const recovery = await store.get(G4);
    check('  and the migrated guest copy is left alone', recovery?.migratedTo === 'bloxity:acc4' && recovery.wins !== 0);

    s.send(MessageType.Auth, { token: 'good:acc4:Four' });
    await waitFor(() => s.me().wins === 150);
    check('signing back in restores the account', s.me().wins === 150 && s.me().ownedTrails === 1);
    await s.leave();
  }

  // 6. The same account from a reconnect, and from another browser.
  {
    const again = await enter(server, { playerId: rotated || 'p_somebrowser', token: 'good:acc4:Four' });
    check('reconnecting as the same account restores it', again.me().wins === 150);
    await again.leave();
    const elsewhere = await enter(server, { playerId: 'p_otherbrowser', token: 'good:acc4:Four' });
    check('the same account on another browser restores it', elsewhere.me().wins === 150);
    await elsewhere.leave();
  }

  // 7. An existing account always wins over browser data.
  {
    const s = await enter(server, { playerId: G5, token: 'good:acc2:Two' });
    check('an existing account is not overwritten by the browser profile', s.me().wins === 99);
    await sleep(500);
    const guest = await store.get(G5);
    const account = await store.get('bloxity:acc2');
    check('  the browser profile is untouched and not marked migrated', guest?.wins === 50 && !guest.migratedTo);
    check('  and the account keeps fields this build does not know', account?.accountOnlyField === 'untouched');
    s.send(MessageType.Auth, { token: null });
    await waitFor(() => s.me().wins === 50);
    check("  logging out returns this browser's own progress", s.me().wins === 50);
    await s.leave();
  }

  // 8. Purchases: only the verified account, exactly once.
  {
    check('a purchase webhook with a bad secret is refused', (await webhook(server, { transactionId: 'tx-bad', userId: 'acc6', sku: 'wins_small' }, 'nope')) === 401);
    const first = await webhook(server, { transactionId: 'tx-1', userId: 'acc6', sku: 'wins_small' });
    const again = await webhook(server, { transactionId: 'tx-1', userId: 'acc6', sku: 'wins_small' });
    check('a purchase is recorded, and a retried webhook still answers 2xx', first === 200 && again === 200);
    const grant = await store.grant('tx-1');
    check('  recorded durably before the reply, owed to the account', grant?.account === 'bloxity:acc6' && grant.state === 'pending');

    const x = await enter(server, { playerId: 'acc6' });
    const y = await enter(server, { playerId: 'p_thief', bloxityId: 'acc6' });
    await sleep(6500);
    check('a browser claiming the account id gets NO purchase', x.me().wins === 0 && y.me().wins === 0);
    check('  and it is still waiting for the real account', (await store.grant('tx-1'))?.state === 'pending');
    await x.leave();
    await y.leave();

    const live = await enter(server, { playerId: 'p_buyer', token: 'good:acc7:Seven' });
    await webhook(server, { transactionId: 'tx-2', userId: 'acc7', sku: 'wins_large' });
    await waitFor(() => live.me().wins === 1500, 15_000);
    check('a purchase made while playing lands in the live session', live.me().wins === 1500);
    await live.leave();
  }

  // 9. Bloxity unavailable: in as a guest, not refused.
  {
    const s = await tryEnter(server, { playerId: G8, token: 'down:acc8' });
    check('Bloxity unavailable - let in as a guest', !!s.session && s.session.me().wins === 8, String(s.error ?? ''));
    await s.session?.leave();
  }

  // 10. A restart - between a webhook and the join it is for - loses nothing.
  {
    const posted = await webhook(server, { transactionId: 'tx-3', userId: 'acc9', sku: 'wins_small' });
    check('a purchase webhook for a player who is offline answers 2xx', posted === 200);
    const settled = await waitFor(async () => {
      const acc7 = await store.get('bloxity:acc7');
      const tx2 = await store.grant('tx-2');
      return acc7?.wins === 1500 && tx2?.state === 'applied';
    }, 15_000);
    check('  (every write has landed before the hard kill)', !!settled);
    await server.kill();
    server = await boot();

    const buyer = await enter(server, { playerId: 'p_newdevice', token: 'good:acc9:Nine' });
    await waitFor(() => buyer.me().wins === 250, 10_000);
    check('a purchase survives a restart between the webhook and the join', buyer.me().wins === 250);
    await buyer.leave();

    const guest = await enter(server, { playerId: G1 });
    const four = await enter(server, { playerId: 'p_x4', token: 'good:acc4:Four' });
    const seven = await enter(server, { playerId: 'p_x7', token: 'good:acc7:Seven' });
    check(
      'a server restart loses nothing',
      guest.me().wins === 7 && four.me().wins === 150 && four.me().ownedTrails === 1 && seven.me().wins === 1500,
    );
    await guest.leave();
    await four.leave();
    await seven.leave();

    const replay = await webhook(server, { transactionId: 'tx-3', userId: 'acc9', sku: 'wins_small' });
    const nine = await enter(server, { playerId: 'p_newdevice', token: 'good:acc9:Nine' });
    await sleep(6500);
    check('a webhook replayed after a restart pays nothing twice', replay === 200 && nine.me().wins === 250);
    await nine.leave();
  }

  return server;
};

const wrongSlug = async (dataDir, mongoUri) => {
  const server = await startServer({ dataDir, mongoUri, slug: 'some-other-game' });
  const s = await enter(server, { playerId: 'p_slugtest', token: 'good:acc2:Two' });
  check('a token checked against the wrong game slug is refused (guest)', s.me().wins === 0);
  await s.leave();
  await server.kill();
};

const outages = async (store, mongod, boot, server) => {
  console.log(`\n${store.label}: outages`);

  // A sign-out that cannot reach storage stays put.
  {
    const s = await enter(server, { playerId: G5, token: 'good:acc2:Two' });
    check('signed in before the outage', s.me().wins === 99);
    await mongod.stop();
    s.send(MessageType.Auth, { token: null });
    await sleep(9000);
    check('a sign-out that cannot reach storage stays on the account', s.me().wins === 99);
    await mongod.start();
    await waitFor(() => s.me().wins === 50, 45_000, 250);
    check('  and completes once storage is back', s.me().wins === 50);
    await s.leave();
  }

  // A save made during an outage lands once the database is back.
  {
    const s = await enter(server, { playerId: G9 });
    check('a guest in before the outage', s.me().wins === 300);
    await mongod.stop();
    s.send(MessageType.BuyTrail, { slot: 1 });
    await waitFor(() => s.me().ownedTrails === 1);
    await sleep(2000);
    await mongod.start();
    const landed = await waitFor(async () => (await store.get(G9))?.ownedTrails === 1, 60_000, 500);
    check('a save made during an outage lands once the database is back', !!landed);
    await s.leave();
  }

  // DB down: joins are REFUSED, never let in fresh.
  {
    await mongod.stop();
    const refused = await tryEnter(server, { playerId: G1 });
    check('database down - the join is refused, not let in fresh', !!refused.error && !refused.session);
    await refused.session?.leave();
    check('  and the server keeps answering /health', (await fetch(`http://127.0.0.1:${server.port}/health`)).ok);
    await mongod.start();
    let session = null;
    await waitFor(async () => {
      const attempt = await tryEnter(server, { playerId: G1 });
      session = attempt.session ?? null;
      return session;
    }, 45_000, 1000);
    check('database back - everything intact', !!session && session.me().wins === 7);
    await session?.leave();
  }

  // A server that BOOTS with the database down still answers /health.
  {
    await server.kill();
    await mongod.stop();
    const cold = await startServer({ dataDir: store.dir, mongoUri: store.uri });
    check('a server that boots with the database down still answers /health', cold.alive());
    const refused = await tryEnter(cold, { playerId: G1 });
    check('  and refuses joins rather than inventing profiles', !!refused.error);
    await mongod.start();
    let session = null;
    await waitFor(async () => {
      const attempt = await tryEnter(cold, { playerId: G1 });
      session = attempt.session ?? null;
      return session;
    }, 45_000, 1000);
    check('  and lets them in once it is up', !!session && session.me().wins === 7);
    await session?.leave();
    await cold.kill();
  }
  return boot;
};

const legacyImport = async (mongod, dataDir, store) => {
  console.log('\nMongoDB: legacy import');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    joinPath(dataDir, 'profiles.json'),
    JSON.stringify({
      p_legacya: profile({ wins: 11 }),
      p_legacyb: profile({ wins: 1 }),
      'bloxity:evil': profile({ wins: 999 }),
    }),
  );
  await store.seed({ p_legacyb: profile({ wins: 22 }) });
  for (const boot of ['first', 'second']) {
    const server = await startServer({ dataDir, mongoUri: mongod.uri });
    const a = await waitFor(() => store.get('p_legacya'));
    await sleep(500);
    const b = await store.get('p_legacyb');
    const evil = await store.get('bloxity:evil');
    check(`legacy import (${boot} boot) adds new profiles`, a?.wins === 11);
    check(`  never overwrites one already in the database`, b?.wins === 22);
    check(`  and never imports an account-prefixed key`, evil === null);
    await server.kill();
  }
};

const jsonFileSafety = async (dir) => {
  console.log('\nJSON store: file safety');
  // A corrupt file is moved aside with its data intact.
  mkdirSync(dir, { recursive: true });
  const broken = '{"p_corrupt": {"wins": 5}, this is not json';
  writeFileSync(joinPath(dir, 'profiles.json'), broken);
  let server = await startServer({ dataDir: dir });
  const aside = readdirSync(dir).find((name) => name.startsWith('profiles.json.corrupt-'));
  check('a corrupt JSON file is moved aside', !!aside);
  check('  with its data intact', !!aside && readFileSync(joinPath(dir, aside), 'utf8') === broken);
  check('  and the server still starts', server.alive());
  await server.kill();

  // A leftover .tmp that parses is a newer save and is recovered.
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(joinPath(dir, 'profiles.json'), JSON.stringify({ p_tmp: profile({ wins: 1 }) }));
  writeFileSync(joinPath(dir, 'profiles.json.tmp'), JSON.stringify({ p_tmp: profile({ wins: 2 }) }));
  server = await startServer({ dataDir: dir });
  const s = await enter(server, { playerId: 'p_tmp' });
  check('a leftover .tmp from a save that was never renamed is recovered', s.me().wins === 2);
  await s.leave();
  await server.kill();
};

// ---------------------------------------------------------------------------

const scratch = mkdtempSync(joinPath(tmpdir(), 'evolve-persistence-'));

try {
  if (!existsSync(SERVER_ENTRY)) throw new Error('server/dist is missing - run `npm run build:server` first');

  // JSON store, always.
  {
    const dir = joinPath(scratch, 'json');
    const store = jsonStore(dir);
    const server = await core(store, () => startServer({ dataDir: dir }));
    await server.kill();
    await wrongSlug(joinPath(scratch, 'json-slug'), '');
    await jsonFileSafety(joinPath(scratch, 'json-files'));
  }

  // MongoDB at MONGODB_URI, when given. WIPED.
  if (process.env.MONGODB_URI) {
    const dir = joinPath(scratch, 'uri');
    const store = await mongoStore(process.env.MONGODB_URI, dir);
    console.log(`\n!!! wiping ${store.label} (MONGODB_URI) !!!`);
    await store.wipe();
    const server = await core(store, () => startServer({ dataDir: dir, mongoUri: process.env.MONGODB_URI }));
    await server.kill();
    await store.wipe();
    await store.close();
  } else {
    console.log('\n(MONGODB_URI not set: skipping the run against an external MongoDB)');
  }

  // A mongod this script owns: the full suite plus every outage test.
  const bin = findMongod();
  if (bin) {
    console.log(`\nown mongod: ${bin}`);
    const mongod = ownMongod(bin, joinPath(scratch, 'mongod-data'));
    await mongod.start();
    const dir = joinPath(scratch, 'own');
    const store = await mongoStore(mongod.uri, dir);
    await store.wipe();
    const boot = () => startServer({ dataDir: dir, mongoUri: mongod.uri });
    const server = await core(store, boot);
    await outages(store, mongod, boot, server);
    await store.wipe();
    await legacyImport(mongod, joinPath(scratch, 'legacy'), store);
    await store.wipe();
    await store.close();
    await mongod.stop();
  } else {
    fail('no mongod binary found (set MONGOD_BIN): the outage tests did not run');
  }

  console.log('\nserver logs');
  const bad = allLogs.filter((line) =>
    /Unhandled|unhandledRejection|uncaughtException|TypeError|ReferenceError|RangeError|SyntaxError|failed to start/.test(line),
  );
  check('no unhandled errors in any server log', bad.length === 0, bad.slice(0, 5).join(' | '));
} catch (error) {
  fail(`the run itself failed: ${error instanceof Error ? error.stack : error}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(failures === 0 ? '\npersistence OK' : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
