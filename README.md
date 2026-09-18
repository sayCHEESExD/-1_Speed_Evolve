# +1 Speed Evolve

A browser multiplayer **tropical rainforest expedition** where the player rides a
creature that **evolves**. Thirty stages across fourteen thousand units of
valley: dirt trails, rope bridges, ancient ruins, a boulder ramp, a lost
temple and a cave, with two guardians hunting the groves. Three.js on the
client, Colyseus on the server, TypeScript throughout, and a browser build
under 12 MB.

```
npm install
npm run dev          # server on :2569, client on :5175
```

Open <http://localhost:5175>.

## The loop

Ride to farm **Speed**. Speed raises your **Level**, and level is the only
thing that makes you physically faster. The level curve **compounds**: the
first nine levels cost 5, 10, 15 and so on, and every level after that costs
six percent more than the last on top of that - so level 25 is a session and
level 200 is a campaign. Being faster gets you further into the
obby, and each stage's win pad pays **Wins**. Wins unlock better upgrade pads,
better trails, auras and relics - and, once your level has caught up, the next
creature in the evolution chain.

| System             | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| **Upgrade pads**   | Set the BASE Speed one step is worth: +1 through +2K       |
| **Evolution**      | Cockroach → Spider → Chick → … → Dragon, a gain multiplier |
| **The animals**    | Fourteen, built from anatomy: four body plans, three-jointed limbs |
| **Trails**         | Speed-gain multiplier, x1.25 to x400                       |
| **Auras**          | Speed-gain multiplier, x1.25 to x300, stacks with a trail  |
| **Items**          | Multiply the WINS a stage pays, x1.5 to x25                |
| **Treadmills**     | Farm Speed on the spot, x1 to x3, gated behind rebirths    |
| **Rebirth**        | Resets the level curve for a permanent gain multiplier     |

One step is worth
`pad × rebirth × mount × trail × aura × treadmill`, and that product is what
the HUD prints as **Total Multiplier**.

## The expedition

Six acts of five stages, and each should be recognisable from one screenshot.

| Act | Stages | Where |
| --- | ------ | ----- |
| 1 | 1-5   | **Jungle Entrance** — dirt trails, fords, felled timber, the canopy |
| 2 | 6-10  | **Deep Jungle** — rapids, rope bridges, a ledge behind a waterfall |
| 3 | 11-15 | **Ancient Ruins** — statues, turning stones, dart traps, a failing court |
| 4 | 16-20 | **Danger Zone** — the boulder ramp, a gale, the first guardian, a cataract |
| 5 | 21-25 | **Lost Temple** — the great stair, a flooded vault, fire, the deep cavern |
| 6 | 26-30 | **Final Expedition** — a split valley, thunder falls, the skybridge, the summit |

## The camp

```
        ┌──────────── leaderboards, on the ancient wall ───────────┐
        │            Rebirths     Speed     Wins                   │
        │                                                          │
        │   treadmills                          Trail Trader       │
        │   ┌──────────┐                        Aura Trader        │
        │   │ x1  x1   │                        Relic Trader       │
        │   │ x1.5 x1.5│          SPAWN         ┌───────────────┐  │
        │   │ x2  x3   │                        │ 12 speed pads │  │
        │   └──────────┘                        │ on two tiers  │  │
        │      RIGHT                            └───────────────┘  │
        │                                          LEFT            │
        └──────────── the cut trail, and stage 1 ──────────────────┘
```

The traders share the pad side, so the whole of the player's left is one
training-and-trade strip. The back six pads sit on a terrace seven units up,
reached by a stair at either end. Everything else is open ground, with the
jungle in a band between the zones and the wall.

The treadmills are a ladder: the 1.5x pair needs one rebirth, the 2x needs
three and the 3x needs five. A machine you have not unlocked pays **nothing** -
it is not a reduced rate - and tells you what it costs.

## Commands

| Command                    | What it does                                     |
| -------------------------- | ------------------------------------------------ |
| `npm run dev`              | Server and client together, with watch           |
| `npm run build`            | Everything                                       |
| `npm run typecheck`        | All three workspaces                             |
| `npm run verify`           | Course, barrier and server-authority tests       |
| `npm run verify:assets`    | Digests of the supplied FBX and texture          |
| `npm run size:client`      | Build size against the 12 MB budget              |
| `npm run verify:capacity`  | Room capacity, against a RUNNING server          |

## Controls

|            | Desktop                 | Touch                        |
| ---------- | ----------------------- | ---------------------------- |
| Move       | WASD                    | Left stick                   |
| Jump       | Space                   | Right button                 |
| Look       | Mouse                   | Drag anywhere                |
| Zoom       | Wheel                   | —                            |
| Evolve     | V                       | Rail tile                    |
| Rebirth    | R                       | Rail tile                    |
| Shop       | T                       | Rail tile                    |
| Use a stall| E when the prompt shows | Tap the prompt               |
| Mute       | M                       | Rail tile                    |
| Close      | Escape                  | The panel's ✕                |

There is deliberately **no sprint**. Movement speed comes from level.

## Deployment

### Bloxity Hosting (automated)

`.github/workflows/deploy.yml` deploys on every push:

| Branch | Channel | Frontend                                 | Backend                                   |
| ------ | ------- | ---------------------------------------- | ----------------------------------------- |
| `dev`  | dev     | https://speed-evolve.dev.play.bloxity.io | wss://speed-evolve.dev.host.bloxity.io    |
| `main` | prod    | https://speed-evolve.play.bloxity.io     | wss://speed-evolve.host.bloxity.io        |

It runs `typecheck`, `verify` and `verify:assets` first, then in parallel:

- **server** - builds the `Dockerfile`, pushes
  `ghcr.io/<owner>/speed-evolve-server:<channel>-<sha>` to GHCR and rolls it
  with `POST https://legion.bloxity.io/v1/apps/speed-evolve/deploy`
  (`seatCap` 15, the room's `maxClients`).
- **client** - builds with the channel's `VITE_SERVER_URL`, zips `client/dist`
  with `index.html` at the root and uploads it raw to
  `POST https://api.bloxity.io/v1/hosting/games/speed-evolve/frontend`.

The commit SHA is the version on both halves. Both routes come from
https://hosting.bloxity.io/docs. Setup is one repository secret,
`LEGION_DEPLOY_TOKEN` (My Games on hosting.bloxity.io, behind the eye icon),
plus making the GHCR package public once after the first push.

### Other hosts

Netlify cannot run a WebSocket server, so there the client is deployed alone
and the Colyseus server runs as a long-lived Node process elsewhere
(`Dockerfile` included).

- `VITE_SERVER_URL` is the ONLY client-side server configuration, and it is
  baked in at build time.
- `MONGODB_URI` (Legion injects it) puts progress in MongoDB. Without it the
  server uses JSON files in `EVOLVE_DATA_DIR`, which should then be a mounted
  volume or a redeploy wipes them.
- `BLOXITY_WEBHOOK_SECRET` verifies the Bux webhook when set.

### Player progress

Signed-in Bloxity players keep their progress on their ACCOUNT - every
browser, every device, and through restarts, scale-to-zero and deploys. Guests
keep it in their browser, exactly as before.

- **Storage.** With `MONGODB_URI` set (Legion sets it: an isolated database
  per game and channel) progress is in MongoDB, one document per player.
  Without it, JSON files in `EVOLVE_DATA_DIR` - the dev store.
- **Identity.** The client sends its Bloxity portal TOKEN - never an account
  id - with the join, and again whenever the login changes. The server asks
  Bloxity who it belongs to (`POST https://api.bloxity.io/v1/auth/game-token/verify`,
  the same call the SDK makes); only a verified account is ever loaded as one.
  If Bloxity cannot answer, the player is let in as a guest and verified again
  shortly.
- **First login** carries this browser's guest progress into an account that
  has none. An account that already has progress always wins.
- **Purchases** are recorded durably against the account Bloxity says paid,
  before the webhook answers 2xx, and pay out exactly once.
- **Storage down** means joins are refused - never let in on an empty profile -
  and the client's retry brings players in once it is back. `/health` keeps
  answering throughout.

`npm run verify:persistence` proves all of this end to end against the built
server, the JSON store, and a MongoDB it starts and stops itself (set
`MONGOD_BIN`, or keep a binary in `~/.cache/mongodb-binaries`). With
`MONGODB_URI` set it ALSO runs against that database - and WIPES it.

See `CLAUDE.md` for the design constraints this project is built under.
