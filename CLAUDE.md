# CLAUDE.md — +1 Speed Evolve

Permanent project rules and design constraints. Read this before changing
anything.

## What this is

A **production** browser multiplayer obby game, and the next game in the same
series as `+1 Animal Obby Escape`. Not a demo, not a prototype.
"Roblox-inspired" describes the **visual and gameplay style only**.

The two gameplay differences from the previous game:

1. The mount is not bought, it **EVOLVES**. There are no stands to ride onto
   and no price to pay: the server unlocks and equips the next creature the
   moment the player's level and Wins both reach its requirement.
2. Speed is farmed through a **base value set by an upgrade pad**, multiplied
   by everything the player has earned - rather than a flat per-stride figure
   attached to the creature.

## Technology (fixed)

| Layer  | Stack                                   |
| ------ | --------------------------------------- |
| Client | Three.js + TypeScript + Vite            |
| Server | Colyseus + Node.js + TypeScript         |
| Shared | TypeScript, framework-free              |
| Target | Browser / WebGL, desktop **and** mobile |
| Repo   | npm workspaces monorepo                 |

**Not used, ever:** Unity. Roblox Studio or the Roblox engine. Any other game
engine. Do not add a framework or a build tool without a concrete need.

## Hard constraints

- Final browser build must stay **under 12 MB**. It is currently ~2.4 MB, and
  1.1 MB of that is the one supplied music track.
- **Progression and rewards are server-authoritative.** The client may predict
  for UI feel but never decides, computes or claims a reward.
- Desktop and mobile browsers are both first-class. No desktop-only input
  assumptions.
- **There is no sprint**, and there is no `walkSpeed` either. `MOVEMENT` holds
  ONE ground speed and `stepPlayer` has no branch over it. Shift used to pick
  between a walk of 14 and a run of 24, which was a second speed system
  competing with the one the whole progression ladder feeds: a player's level
  bought them a multiplier on whichever of two numbers a modifier key happened
  to be selecting. The multiplier is the game; the key was a way of turning
  most of it off, and on a phone it had to be faked from stick deflection
  because there is no Shift to hold. The intent that crosses the wire carries
  no sprint bit, so there is nothing to forge and nothing to keep in step.
- **Ports are not the defaults.** Two other games in this series run on 2567
  and 2568 (Colyseus) and 5173/5174 (Vite) on the same machine. This game uses
  **2569** and **5175** so all three can run side by side; sharing a port means
  whichever server starts first silently serves both clients. The dev script
  passes `--port 2569` explicitly, because a dev harness that hosts the client
  often exports `PORT` for its own web server and the game server would
  otherwise bind to it.

## The two axes, and why they never cross

This is the single most important rule in the project.

- **SPEED GAIN** - how much Speed one step is worth - is
  `upgradePad.perStep × rebirth × mount × trail × aura × treadmill`.
  Resolved by `speedPerStep` in `shared/src/config/speed.ts`, and by nothing
  else.
- **MOVEMENT SPEED** - how fast the mount physically travels - is a pure
  function of **LEVEL**. Resolved by `resolveMovementProfile` in
  `shared/src/config/movement.ts`, which takes one argument and deliberately
  cannot see the rebirth count, the mount, the trail or the aura.

A 400x trail must never make a rider physically faster. It would put them
through a thirty-stage obby faster than its platforms can be drawn, let alone
read. Multiplying how fast they EARN is the reward the player actually wants,
and it reaches movement anyway - by buying levels, which is the long way round
on purpose. `verify:progression` asserts both halves of this.

- **Every multiplier appears exactly once**, in `totalMultiplier`. That
  function exists so that a bonus cannot be applied twice - a mistake which is
  invisible in code review and obvious in the economy a week later. The HUD
  prints the REPLICATED figure rather than assembling its own copy, for the
  same reason.
- **The ITEM ladder is the one exception**, and it multiplies something else
  entirely: the Wins a stage pays, applied in `StageService` and nowhere else.
  That is what stops the third shop being the first two at a worse price.

## Progression

- **Speed** is the currency. Players farm it by riding: distance the SERVER
  observes, and nothing else. There is NO jump bonus - leaving the ground used
  to pay two extra steps, a second and occasional source of Speed beside the
  one every step pays.
- **Speed is paid in WHOLE STEPS at ONE rate.** `calculateSpeedGain` in
  `shared/src/config/speed.ts` is the only calculation of what a step is
  worth: `Base (pad) x Animal x Training (belt) x Items x Trail x Aura x
  Rebirth`, multiplied in that fixed order so the same setup gives the same
  float64 to the last bit. Items is always 1 there - the item ladder multiplies
  stage Wins, not Speed - and is listed so nobody "fixes" it by multiplying an
  item in. `totalMultiplier` and `speedPerStep` are views onto it, not
  formulas.
- A STEP is the unit the RATE is quoted in - `strideDistance` (2) world
  units, the pad's "+1/Steps" - and a FOOTFALL is the unit it is PAID in:
  `SPEED.footfallSteps` (6) steps, `FOOTFALL_DISTANCE` (12) units.
  `SpeedService` banks distance in a per-player `carry` and pays one footfall
  for every `FOOTFALL_DISTANCE` crossed; the remainder waits for the next
  input, and survives a respawn, because it is distance the server watched
  being ridden. It used to pay `distance / stride x rate` per tick - a
  FRACTION of a step, sized by how far the mount happened to move between two
  messages - which turned one constant rate into "+14, +15, +17, +8".
- **ONE FOOTFALL IS ONE AWARD IS ONE POPUP.** `credit` returns a LIST of
  awards, each exactly `footfallSpeedGain(calculateSpeedGain(...))` - the
  step gain times the steps in a footfall, summed ONCE on the server - and
  each added to the total on its own; `CourseRoom` sends one `SpeedAwarded`
  message per award (the gain, the input `seq` that completed it, and the
  total after it); `SpeedPopups` draws one "+6 Speed" per message with that
  figure and nothing beside it.
- **Never announce a single step.** The third version paid and sent every
  two-unit step as its own award: nineteen a second at level twelve, sixty at
  the top of the curve, and one stride of the mount's legs came out as twenty
  "+1" popups. The Speed was right; the unit was a sliver of a stride.
  `footfallSteps` changes how OFTEN Speed arrives and never how much a unit
  of distance pays - `verify:progression` checks both.
- **Never batch awards into a count.** The second version did: the room
  bundled the steps completed in each tick into `steps x perStep`, and the
  popup merged each quarter-second of those into "+1.06 x5", "+1.06 x8". The
  per-step value never moved - a server trace over two hundred and thirty-nine
  consecutive awards showed `1.04` every time - but the COUNT, which only said
  how far the mount had moved in the window, read as a multiplier that kept
  changing. How many steps a second a player earns depends on how fast they
  ride; what ONE step is worth depends on nothing but their setup.
- The server logs the breakdown (`Base -> Animal -> ... -> Final Gain`)
  whenever a player's rate changes. `EVOLVE_LOG_SPEED=1` also logs every award
  with the input that triggered it - its sequence number, frame time, the
  distance it covered and the stride accumulator before and after - and every
  message sent. That trace is what found the batching; it is off by default.
- The level curve **COMPOUNDS**, and it has two halves. Up to `levelKnee` (9)
  a level costs `levelStep × L` - a flat 5, 10, 15 - and past it that same
  linear figure is multiplied by `levelGrowth` (1.06) once per level beyond
  the knee.
- **The knee exists to preserve the reference art**, which pins three levels:
  level 5 reads "16.00 / 25.00", level 8 reads "24.00 / 40.00" over a lifetime
  "Speed: 164.00", and level 9 reads "36.00 / 45.00". Those are 5×5, 5×8 and
  5×9, they are on screen every second, and a curve that compounds from level 1
  cannot produce them. It also keeps the first nine levels as quick as they
  should be for somebody who has just arrived.
- The curve used to be linear ALL the way, and that was the bug: level 100 cost
  500 and level 101 cost 505. A one percent step is not progression once the
  multiplier stack reaches the millions, and reaching level 200 cost less than
  a hundred thousand Speed. It now costs a billion - ten thousand times more -
  while level 25 costs only twice what it used to, which is the shape the
  grind is supposed to have.
- **1.06 is the one number to retune**, and both directions are failure modes.
  Much lower is the flat grind it replaced; much higher makes each level a
  wall rather than a step and reaches the end of float64 far sooner, which is
  the "impossible" end of the scale rather than the demanding one.
  `verify:progression` prints the cost of levels 10 through 200 against the
  curve it replaced, and that table is the thing to read when changing it.
- **THE CURVE HAS NO CEILING.** Every level costs 1.06 times the one before
  it, for ever. It used to be clamped at `MAX_SAFE_INTEGER`, which froze it at
  level 460; that is gone. The only end is arithmetic: the running total
  passes `Number.MAX_VALUE` (~1e308) around level 11,950. `clampSpeed`
  SATURATES there rather than overflowing, because an `Infinity` total would
  otherwise read as invalid and reset to zero. Levels past ~800 cost over 1e20
  each, so an award is a vanishing fraction of the total long before that end
  - precision thins out, the curve does not.
- `totalSpeedToReach` is a **TABLE**, not a formula, and it has to be: the
  per-level cost is rounded, so the running total is a sum of rounded terms.
  Building the table out of `speedForNextLevel` is also what guarantees the two
  can never disagree - a full bar that does not level anybody up is exactly the
  bug a second formula produces. With no cap it has no fixed length: it GROWS
  on demand, a row at a time, as far as somebody's Speed actually reaches.
- `resolveLevel` **binary-searches that table**. The linear curve inverted to a
  quadratic so the level was one square root; a compounding curve has no such
  inverse, and counting levels in a loop would be hundreds of iterations on a
  function the HUD calls every frame.
- Level is DERIVED from lifetime Speed and never persisted, so a change to the
  curve reaches returning players rather than only new ones. Retuning it moves
  everybody's level the next time they join - that is correct, and it is worth
  knowing before you touch 1.06.
- The level CAP is `(rebirths + 1) x 25` - 25, 50, 75, 100 ... 475 at
  eighteen rebirths - and it is not a constant: it is whatever the next
  rebirth requires (`maxLevelForRebirth`, read off the ladder), so reaching
  the cap and unlocking a rebirth are the same moment. A cap is a gate, never
  a dead end. Speed keeps banking past it; the level waits for the rebirth.
- **There is no MAXIMUM level and no MAXIMUM rebirth count.** Nothing clamps
  the cap and the ladder never runs out. `level`, `rebirths` and `maxLevel`
  are `float64` on the wire for that reason - a `uint32` wraps at
  4,294,967,295, and a wrapped cap silently drops a player's ceiling to
  nothing. `verify:progression` checks the formula at every count to 100,000
  and past uint32, and rebirths forty times in a row.
- `REBIRTH_TIERS` is the authored head (level 25 → x2, level 50 → x3) and
  `EXTENSION` continues the same pattern for ever.
- A rebirth resets the level curve - which means clearing `totalSpeed`,
  because level FOLLOWS from it - and **resets the equipped upgrade pad to the
  free one**. That is the one deliberate cost, and it is cheap on purpose: the
  pad is gated on Wins, which a rebirth keeps, so re-equipping is a ride across
  the camp the player was making anyway. It puts the left side of the camp
  back in play after every prestige. Wins, mounts, trails, auras and items all
  survive untouched.
- **A LOCKED TREADMILL PAYS NOTHING.** The gate is in the SIMULATION, not only
  in the economy: `activeTreadmillAt` takes the rebirth count and reports a
  machine the player has not unlocked as no machine at all, so they are
  credited no belt distance, receive no tier multiplier, and their mount does
  not run on the spot as though it were working. `PlayerMotion` carries both
  figures - `treadmillUnder` is where the mount is, `treadmill` is what is
  paying - and the difference between them is what puts the requirement on
  screen. It used to gate only the multiplier, which meant a brand-new player
  could stand on the machine behind five rebirths and be credited its full
  distance at the ordinary rate: free progression from a tier nobody earned.
  The rebirth count reaches the step through `SimParams`, which is
  SERVER-OWNED - a client that could supply it could unlock the 3x belt by
  typing a number.
- **Wins** come from crossing a stage's win dais - a small square on a SPUR at
  the player's right, off the line the route itself travels. Crossing it awards
  that stage's Wins and RETURNS the player to the camp, which is also what makes
  a second payment impossible: the dais is hundreds of units behind them before
  another request could arrive. Off the line is not decoration - a dais in the
  middle of the path teleports away anyone trying to run deeper in.
- Stage rewards are `3^(index-1)`: 1, 3, 9, 27 and on by threes, to about
  6.9e13 at stage 30. A pure formula rather than a thirty-row table, because
  thirty authored rows is thirty chances to make one worth less than the stage
  before it.
- **THERE ARE NO CHECKPOINTS, and there must not be any.** Every placement -
  a death, a stage banked, a rebirth, a fresh join - puts the player at
  `SPAWN_POSITION` and nowhere else. `CourseRoom.placeAt` takes no position for
  exactly that reason.
- `wins` and `totalSpeed` are **float64**, not the previous game's uint32. The
  Sun trail costs 250 trillion Wins; a uint32 stops at 4.3 billion, so the top
  half of both shops would have been unbuyable by construction.

## Evolution

- The roster is **pure data** in `shared/src/config/mounts.ts`. Adding a
  fifteenth mount is a new entry and nothing more: no movement code, no
  renderer branch, no server case statement.
- Evolution is **AUTOMATIC**. `EvolveService.refresh` is idempotent and is
  called wherever level or Wins can have moved - on join, after a stage reward
  and on a level-up. The Evolve menu is a WINDOW onto a decision the server has
  already made, which is why it can never promise something that does not then
  happen. Both sides call `qualifiesForMount`.
- **Wins are a THRESHOLD, not a price.** Nothing is deducted. The shops spend
  the same wallet, so a subtractive evolution would mean buying a trail could
  cost a player a mount they had already earned.
- A mount once earned is **kept**, even if Wins are later spent below its
  threshold. `unlockedMounts` is the record of what happened rather than a
  cache of what the current figures imply. Losing a mount at a shop counter
  would be the most confusing thing this economy could do.
- The chain is walked **in order**: qualifying for the dragon without ever
  meeting the spider's requirement is not a state this game recognises.
- Two hard ceilings: a slot must be at most 31, because `mountBit(32)` is
  `1 << 31`, which is NEGATIVE in JavaScript. `verify:progression` checks it.

## The mount

- The player rides a creature. The CREATURE is the movement character: the
  simulation's transform, the collision body and the physics all belong to it.
  The rider is carried and has no transform of their own on the wire.
- The rider is parented to the creature's **body node**, so it inherits the
  gait bob, pitch and roll for free. There is deliberately no per-frame "copy
  the creature's transform onto the rider" step - a copy is always a frame late
  and always slides.
- **The rider's walking animation never plays.** A rider whose legs cycle while
  seated is the single most obvious way a mounted character looks wrong.
- **The animals are ANIMALS.** They are not one toy in fourteen colours, and
  the first version of this roster was: one slab for a barrel, four identical
  posts under it, a pale bib on the chest and a pair of white squares a third
  of the skull wide for eyes. Everything below exists to stop that coming back.
- **The torso is a swept PROFILE, not a box.** `MountShape` gives the builder a
  maximum size and multipliers at the chest, the waist and the rump, plus a
  spine that rises over the shoulder and a belly that tucks up at the flank;
  `MountGeometry` sweeps cross-sections along it. `verify:progression` refuses
  a shape whose profile is 1 everywhere, because that is a box.
- **`MountShape.plan` decides what a scale factor never can**: where limbs
  attach, which way joints fold, and whether there is one torso or two masses
  joined by a waist. Four plans - quadruped, biped, arachnid, insect - and all
  four must be in use.
- **Every limb has THREE segments and THREE joints**: hip, knee, ankle. The
  third is the one that actually meets the ground - a dog's hock, a bird's
  ankle, a spider's tarsus - and a limb without it either floats or drives its
  shin through the floor.
- **The stance height is SOLVED, not authored.** `footDrop` runs forward
  kinematics through a limb's rest angles, so the belly line, the saddle, the
  rider and the nameplate all follow from the legs the animal actually has. A
  hand-written stance is four things that go wrong together the first time a
  segment changes length.
- **`seat` is measured from the BACKLINE**, not from the feet: it is a fact
  about the saddle, so a longer leg raises the animal and the rider with it.
  Every mount authors its own, because a spider's abdomen slopes away behind
  the seat and a theropod's spine is horizontal - one universal offset is what
  floated the riders on the small animals and sank them into the large ones.
- **Eyes are a TENTH of the skull**, dark, set in a socket under a brow, with
  one specular highlight. `verify:progression` enforces a ceiling per body
  plan: a fifth for a mammal, a third for a bird or an insect, whose eyes
  really are that large. One googly eye undoes any amount of anatomy under it.
- **The leg count is a NUMBER, not a branch.** `legPairs` runs from one (chick,
  ostrich, raptor) to four (spider), and `MountAnimator` derives its gait
  phases from `hips.length`. That is why a cockroach and a mammoth share one
  builder and one animator.
- The ORDER of `hips` is the contract: right then left within a pair, front
  pair first. The animator relies on that and on nothing else about the count.
- `hipRest` is the creature's rest pose - pitch, yaw and roll - and the
  animator must **RE-APPLY the yaw and the roll** every frame while adding only
  its gait to the pitch. Writing 0 there is what made a spider's eight bowed
  legs snap upright the moment it started walking. `kneeRest` and `ankleRest`
  follow the same rule on whichever axis `jointAxis` names.
- **`jointAxis` is 'z' for a limb that has already been thrown out sideways.**
  A spider bends its knee in the vertical plane its own leg lies in, which is
  not the plane its body travels in; `jointSign` is what lets one loop drive a
  left limb and a right one without branching.
- Colour is a FAMILY, not a swatch. A wolf is six greys. `BoxOptions.shade`
  gives every box a vertical gradient in its vertex colours, which is what
  makes form read without a single texture byte - and `verify:progression`
  refuses a palette whose entries collapse to fewer than four tones.
- Walk and gallop are ONE cycle. The trot rule - each pair out of phase with
  its neighbour, each leg with its partner - falls out as the alternating
  tripod a real cockroach walks with, which is a pleasant accident of one rule
  rather than a special case.
- Gait phase advances with **distance**, not wall-clock time, but the cadence
  is CLAMPED. A late-game mount covers hundreds of units a second and an
  unclamped cycle would strobe.

## Movement

- **The MOUSE aims the camera; the camera defines forward.** WASD moves
  relative to it and never rotates it. `MouseLook.yaw` is a GETTER: the only
  writer is `addLookDelta`, which SUBTRACTS. Assigning to `yaw` silently does
  nothing.
- The camera's RIGHT is `(-cos yaw, sin yaw)`. At yaw 0 that is world **-X**.
- **The player's LEFT is +X and their RIGHT is -X.** Every "left" and "right"
  in the world layout means the PLAYER's: the upgrade pads at +X, the
  treadmills at -X, the win pads at -X.
- **`LANDING_TOLERANCE` and `MOVEMENT.stepHeight` are the same number, and must
  stay that way.** When the two disagreed, every ledge between them was
  reported as the floor and then refused as a landing, and the mount fell
  through the solid ground underneath it.
- A feature the player is meant to ride over must be UNDER `stepHeight`. The
  upgrade pads (0.45), their deck (0.8), the training deck (0.6) and the shop
  counters (0.85) are all deliberately inside it.
- **There is no speed cap, and there must not be one.** `stepPlayer`
  SUBDIVIDES its own step until no substep travels further than
  `MOVEMENT.maxSubstepDistance`. Never "fix" a tunnelling bug by capping speed.
- Horizontal collision is **axis-separated**: move X, resolve, move Z, resolve,
  then move Y.
- **One render transform.** `LocalPlayer.position` is the simulation
  interpolated to the current frame PLUS the eased reconciliation offset.

## The camera

- Framed at 15.5 units back and 6.4 up, pulled back from the previous game's
  9.6. That framing was authored for a horse in a corridor; at this game's
  arena scale it put the camera close enough to clip the furniture and left the
  player unable to see the bank they were riding along.
- The distance SCALES with the mount, through `setSubjectHeight`. The roster
  runs from a cockroach two units at the shoulder to a dragon over five, and a
  distance that frames one crowds the other. The pull is EASED, because it
  changes at the moment of an evolution and a camera that jumped backwards on
  that frame would make the reward read as a glitch.
- The camera smooths the POINT IT FOLLOWS, once. Smoothing the position while
  taking the look target raw makes the two disagree every frame.

## The world

A tropical RAINFOREST expedition, fourteen thousand units long, and it shares
NOTHING with the previous game in this series but its file layout. The route is
cut through a forest that closes over it - see **The rainforest** below, which
is what bounds this world now that nothing in it is a wall. That game
ran down a 64-wide corridor with a continuous floor under every inch of it, and
each stage was a pattern of obstacles dropped onto that floor at lanes written
as fractions of its width. All of it - the corridor, the floor, the lane
fractions, the pattern vocabulary and every one of its twenty stages - was
deleted rather than retuned.

### The route cursor

`shared/src/config/course/route.ts` is where the difference actually lives, and
it is the first thing to read.

A stage builder receives a `Route`: a cursor carrying a POSITION, an ELEVATION,
a WIDTH and a MATERIAL. Every call moves it forward and lays something behind
it - a trail, a rope bridge, a run of logs, a flight of stairs, a tunnel, a
gap. What it emits is the only thing the player can stand on. A route that
turns, climbs, narrows, splits and dives underground therefore costs a builder
a line each, rather than being impossible.

- The world axis is still +Z, because the stage ranges, the spatial buckets and
  the camera all depend on it. What is free is the ROUTE inside that axis:
  `aimAt` sets a lateral target and the next stretch curves toward it in blocky
  steps, which is both how a Roblox path looks and how an axis-aligned
  collision model stays exact.
- **There is no floor.** What is beside the path is a river, a ravine or a
  two-hundred-unit drop. Act one's trails are RAISED THROUGH SWAMP: a three-
  unit verge (`shoulders`) and then mud a few units down, lethal and visible
  (`Route.fall` sets how far below the ground a kill volume's surface sits).
  The old act laid walkable forest floor twenty-nine units out on both sides,
  which made the first five stages a field with a stripe painted down it.
- **Every stretch lays its own KILL VOLUME**, at `COURSE.fallDepth` below the
  lowest ground in it and spanning the valley. The cursor does it, not the
  author, so there is no such thing as a stretch of this course with a
  bottomless drop beside it. A builder that lays its OWN volume across a whole
  stage must follow the route's elevation as it descends - two stages shipped
  with their own floor underneath their own river before `verify:course` grew
  a check for it.
- Scenery is placed RELATIVE TO THE CURSOR and finds its own ground:
  `standOn` drops a plant to the top of whatever kill volume is under it, so a
  trailside fern sits on the shoulder and a valley tree sits on the riverbank
  forty units below. Nothing hangs in the air.

### Thirty stages, six acts

Five stages an act, and each act must be recognisable from a single screenshot:

1. **Jungle Entrance** - ten-wide dirt trails raised through swamp, fords,
   felled timber, the first climb and shuttles, the first hazard. Forgiving:
   no chain overshoots, and the first two stages let a rider who only steers
   through.
2. **Deep Jungle** - rapids, rope bridges over a gorge, a ledge behind a
   waterfall, a switchback climb up buttress roots, a ruined span.
3. **Ancient Ruins** - cut stone, colossal statues with sweeping arms, turning
   stones over a void, a dart corridor, a courtyard whose floor fails in a
   diagonal wave. Grey, enclosed and rectilinear where the first two acts were
   green, open and organic.
4. **Danger Zone** - the boulder ramp, a gale on a ledge a mount wide, the
   first guardian, crumbling shelves, a leap across a cataract.
5. **Lost Temple** - a monumental stair, a flooded vault, a furnace floor, a
   hall of orbiting machinery, and the cave the river cut underneath.
6. **Final Expedition** - a split path over a valley of roots, the largest
   waterfall in the world, a four-hundred-unit skybridge, a chase, and the
   summit temple.

### Difficulty

The course was a highway: paths up to twenty-six wide with forest floor
beside them, plazas sixty to a hundred and twenty wide, and gaps sized in
world units that were a quarter of a jump by the late game. A player could
hold W and hammer jump through most of it. It was rebuilt stage by stage
against the rules below, and `npm run verify:difficulty` holds it to them.

- **Everything is a fraction of `Route.reach`** - how far a full-speed jump
  carries at the stage's OWN recommended level, from the same movement curve
  the game runs. Nine units is a jump at level one and a stride at level one
  hundred and sixty; a quarter of a reach is the same ask at every stage.
  `Route.jumpHeight` does the same for climbs.
- **Widths narrow act by act**: about ten in act one, seven in act two, six and
  a half from act three, down to five and a half in places in act six. Courts
  and arenas are sixteen to sixty wide, never a field to ride round the edge of.
- **`hops` is the precision primitive**: a chain of landings with a jump
  between each. From act two, `gap + land` is LESS than a jump, so a jump from
  the very edge overshoots - the player takes off early or eases off. Every
  chain keeps `gap + 2 x land` at least 1.15 jumps, so there is always a
  takeoff that works and the window is the landing's own length. Below that
  margin the window vanishes and the chain is a lottery. `jog` is the whole
  sideways step between neighbouring landings; keep it and `aim` together to
  about a quarter of a hop's length, or the hop is a guess.
- **Every crossing wider than a jump is crossed on something that moves** -
  rafts, shuttles, lifts, turning stones, orbiting stones - so it is WAITED
  for, and it has a ledge before it long enough to stop on.
- **Moving landings are long enough to land on at speed**: about a third of a
  jump from act five. A thirteen-unit lift is under the mount for a tenth of a
  second at level one hundred and twenty.
- **A lift works BELOW the ledges it joins.** One whose top rose above them
  presented its side face to a rider in the air, and a mount that hits a side
  face loses all its speed and drops short: a trap, not a timing.
- **Collapsing spans leave a window** (`collapsing({ spread })`): the give-way
  runs through part of the cycle and the span stands whole for the rest. A
  span that always has one section down is never crossable.
- **One arm, not two, on a spinner in a narrow court.** Two arms opposite each
  other make a bar through the middle that never leaves the path clear for
  long enough to cross.
- **Hazards sit BESIDE the line where the line cannot move.** A lethal
  waterfall over the outer half of a ledge leaves a lane; one over the middle
  of a ledge narrower than itself leaves nothing (stage eight shipped that way
  and could not be cleared).
- **Nothing lands a rider somewhere it cannot leave.** Pillars that stones
  orbit are scenery, not solids: a solid top far below the path is somewhere
  a falling rider lands and is stranded rather than killed.
- **Every stage must be rideable at ENDGAME SPEED.** There are no checkpoints,
  so a player going for stage thirty rides stages one to twenty-nine at level
  one hundred and sixty on every run. Controls take the same TIME to answer
  at every level (about 0.28 s to swing the mount's direction, 0.4 s to
  stop), so a faster rider covers more ground while turning - and a stage
  that is fair at its own level but cannot be ridden that fast locks every
  late-game player out of everything after it.
- **Scenery that stands beside the route asks `routeAt`** where the route is
  at its own Z: `cliffWall`, `colonnade`, `torchlight` and `guardians` all do.
  Placed from the cursor, they were placed from where the route ENDED, and on
  a route that shifts or climbs that put a cliff through a landing, pillars in
  the path and torches in mid-air. `tunnel` and `walkway` capture their line
  BEFORE laying the floor for the same reason, and a tunnel's walls stand
  three units back from the floor's edge so a weaving tunnel does not put the
  end face of each wall segment in the lane.

`verify:difficulty` drives the real simulation with four riders on every
stage from five start times: HOLD (W and jump, no steering), SPAM (W and jump,
steering onto the landing), RUNNER (W, steering, jumping only at edges - the
"just hop the gaps" player) and SKILLED (plans two and a half seconds ahead,
waits for things, and jumps at edges or at the last moment a jump still
lands). The bar: the three riders with no skill clear no more than a handful
of stages and almost nothing from act two on; the skilled rider clears every
stage from most start times, both at the stage's own level and at level one
hundred and sixty. Guardians chase on the server only, so stages 18 and 29
are measured without them and are harder than reported.

- `STAGE_TUNING` is the ONE place a stage is named and levelled. The
  recommended SPEED is derived from the level through the curve the player
  actually levels on, never written beside it.
- **Every act has its own ground material**, and `verify:course` checks it.
- **The win dais sits on a SPUR off the route**, at the player's right.
  Banking a stage returns the player to the camp, so a dais in the middle of
  the path is a dais that teleports away anyone trying to run deeper into the
  expedition.

### The rainforest

`client/src/world/Rainforest.ts` is the world's boundary, and it is a FOREST.

It replaced two rust-red brick walls ninety units high running the whole
length of the valley. They did what a boundary has to do - stop the eye at the
edge of the playable space - and they made every screenshot of this game look
like a corridor with green decorations in it. Three ranks of trees stood
behind them, drawing every frame, completely hidden.

- **Trees are the vertical framing, not terrain.** The forest floor climbs away
  from the route by about sixteen units and no more. An earlier attempt ramped
  it to sixty, and a smooth green mass sixty units high on both sides is the
  rust-red wall wearing a different colour. What closes the horizon is canopy.
- **Five layers, and the layering is the point**: a bank and shelves at the
  route's edge, understory on them, mid trees standing ON the shelf they are
  planted on, a few GIANTS, a low-detail far rank that closes the skyline, and
  a roof over the middle of the valley with real gaps in it.
- **Everything is placed from the LOCAL ground and the LOCAL corridor width.**
  `Elevation` bucket-samples the finished course's own solids and smooths them,
  so the forest follows the route up a temple stair and down into a gorge. A
  treeline founded at a constant height - which the old one was - is buried
  under half the course and floating over the rest.
- **Nothing hangs off nothing.** Every canopy plate over the route has a branch
  reaching back to the treeline, and the branch is skipped past fifty-two units
  because beyond that it is a girder rather than a branch. In a game whose
  whole vocabulary is floating platforms, a green square in the sky with
  nothing holding it up reads as one more platform.
- **Far trees are drawn with different proportions from near ones**: thin
  trunk, broad crown. Fog washes a distant crown out long before it washes out
  the dark line of a trunk, so a far tree with a near tree's proportions ends
  up a bare pole with a smudge on top.
- It is **chunked**, and that is the whole performance story. The old treeline
  merged four thousand trees into four meshes spanning fourteen thousand units,
  so their bounding spheres covered the world and every one drew every frame.
  Merged per chunk, the frustum rejects all but the two or three in view.
  Boxes carry **no UVs** - every material here is a flat colour, and eight
  bytes a vertex across a million vertices of planting is a megabyte bought for
  nothing.
- Every material KEY is a draw call in every visible chunk, so parts that share
  a colour share a key: the fallen logs are `bark`, and moss on a shelf is the
  same material as moss in a canopy.

### What moves

Everything in the world except the guardians is a PURE FUNCTION OF TIME, in
`course/motion.ts`. The server evaluates it against its own clock to decide a
death or a carry and every client evaluates the identical function against the
replicated clock, so there is no world state on the wire at all.

- **Platforms the player RIDES** are new to this game and are the reason
  `WorldCollision.carryAt` exists. `shuttle` slides, `orbit` travels a circle,
  `lift` rises, `collapse` gives way and rebuilds. The carry is applied as a
  DISPLACEMENT inside the substep, not as a velocity - a velocity would persist
  after stepping off and turn a carousel into a launcher.
- An orbiting platform stays AXIS-ALIGNED. A box that actually turned would
  need a rotating collision test, which against an axis-aligned world is a
  solver rather than a radius; orbiting reads the same and collides exactly.
- Moving platforms are bucketed over every Z they can REACH. Bucketing one
  where it was authored makes it solid only for the part of its cycle it spends
  there, which is exactly the bug where a player rides a disc out of the world.
- **Hazards**: `boulder` rolls downhill and drifts, `swing` is a pendulum,
  `spinner` orbits, `faller` drops, `dart` fires across a corridor, `cascade`
  is a lethal column of water. `hazardReachX` and `hazardZRange` are the ONE
  definition of how far each can get - `sweep` means something different to
  every kind, and a dart's reach was once computed as `|x| + |sweep|`, which
  said a trap firing from +30 to -30 covered most of a valley.
- **Lethal moving things are LAVENDER.** A colour is a promise in this game.
  Two deliberate exceptions, both because the alternative is worse: a cascade
  is water, and boulders and falling debris are stone PULLED toward the
  lavender - grey rock on a grey ramp is the camouflage the rule exists to
  prevent.

### The guardians

The only things in the world that are not pure functions of time, because they
chase: their positions depend on where the players are, which is state. Two of
them - stage 18 to learn on, stage 29 where one is the stage - and the service
drives however many the world declares rather than exactly one. Their
territories are DERIVED from the arenas those stages actually laid.

### The camp

FOUR ZONES round a large empty middle, and the emptiness is the design. Two
hundred and forty-eight wide by two hundred and twenty-four deep - about
seventy percent more ground than the 184 x 172 before it. Top-down with the
back wall at the top, so +X is on the drawing's RIGHT - which is the player's
LEFT, because they face down the drawing toward the gate:

```
   z -224  ┌──────────── the ancient wall: three LEADERBOARDS ────────────┐
           │                                                              │
           │                                               ┌──────────┐   │
           │   treadmills                                  │ 12 PADS  │   │
           │   ┌─────────┐           open green            │ two tiers│   │
           │   │ 6 belts │                                 │ on a     │   │
           │   │ on a    │             SPAWN               │ terrace  │   │
           │   │ deck    │           (0, -108)             └──────────┘   │
           │   └─────────┘                                                │
           │                         ┌──gate──┐   ▣ TRADERS ▣   ▣       │
   z    0  └───────────────────── the cut trail, and stage 1 ─────────────┘
```

- **It grew sideways and backward, never forward.** `campEndZ` (0) is where the
  course cursor starts; moving it would move all thirty stages.

- The functional LAYOUT is inherited: pads down the player's left (+X),
  treadmills down their right (-X), leaderboards at the back, one spawn in the
  middle. Those are things a returning player's hands already know.
- **The traders stand in a row ACROSS THE FRONT, beside the gate** -
  `[ TRADERS ] [ GATE ]` as the player sees it - facing back into the camp,
  twenty-six apart for a thirteen-long hut. Every run leaves through here, so
  every player passes all three. They have stood in three wrong places: across the middle in front of
  the leaderboards; in the far back corner behind the upgrade bank, where
  nobody reached them; and in a column just inboard of the treadmill deck,
  which put three huts between the spawn and the machines. The front is the
  one strip neither side zone uses, which is why the upgrade bank now stops
  thirty units short of it.
- **A hut is built in its own frame and TURNED.** `SHOP_ROW.faceX/faceZ` is the
  single fact about orientation: the collision footprint (`SHOP_SIZE_X/Z`), the
  prompt and the rotation of every mesh in `ShopStalls` all come from it. The
  meshes failed to follow the counters twice before this.
- **The treadmills own their whole camp-side face.** The deck is ridden onto
  from the middle, so `isReserved` keeps the entire strip between the deck and
  the open middle clear, not just a margin round the deck.
- **The upgrade rows are SEVEN UNITS apart**, on a terrace with a retaining
  wall and a stair at either end. The stairs stand BEYOND the outermost plate
  at each end - `UPGRADE_STAIR_Z`, not an offset recomputed wherever it is
  needed. They share the front row's X, because they climb across it to reach
  the terrace behind, so the only thing keeping a fourteen-wide flight off a
  nine-wide plate is the Z it is built at. For a while nothing checked it and
  the first and twelfth upgrades were behind a staircase: both still claimable,
  because a pad is claimed by standing on it, and you could not get to it. The back row used to be raised by 0.8 - under
  one step height, so it could be ridden straight onto - and two rows that
  close merge into one band of twelve squares from every angle anybody actually
  looks from. A tier you cannot see is not a tier, and `verify:course` now
  refuses a gap under four.
- Every tread is 0.7 against a 0.9 step height, so the terrace is ridden up
  rather than jumped onto. `verify:course` walks both stairs the way the
  simulation does and fails on a tread over the step height.
- The MIDDLE stays empty: the player spawns at z -108 and the chase camera sits
  fifteen units behind them. `isReserved` keeps every prop out of the middle,
  out of the four zones and out of their approach lanes.
- **LUSH PERIMETER, CLEAN MIDDLE.** The clearing is deliberately wider than its
  four zones need, and the band between them and the wall is where the jungle
  goes - two ranks of treeline, undergrowth in front of it and vines down the
  wall. A clearing whose furniture reaches its own walls has no perimeter left
  to be lush, and comes out a brown room; one with props scattered across the
  middle has nowhere to stand. It is one or the other, not a compromise.
- Lighting a bank must not stand in front of it. One torch per pad put six
  posts across the sightline from the only place the bank is ever read; there
  are two, at the ends, and the treadmill deck's are behind the machines.
- The back wall is the LEADERBOARDS' and nothing else's, and they sit in the
  MIDDLE of it: both side strips run the camp's whole depth, so a board out at
  either end is a board behind a treadmill or behind a trader from everywhere
  anybody stands.

### The camp's four structures

The leaderboards, the training rigs, the traders' huts and the upgrade plates
are built from ONE vocabulary - found stone, felled timber, rope, thatch, moss
and vine - because they are meant to read as one expedition's work rather than
as four features standing near each other. `PALETTE.timber`, `rockSolid`,
`ropeCord` and `thatch` are shared by all four for exactly that reason.

- The **stelae** are ancient and the expedition only cleared them: stepped
  plinth, banded pilasters, a receding cap, moss and vines, torches. The FACE
  gets none of it - a leaderboard that is hard to read is not a better one for
  being handsome - and the frame stone is deliberately DARKER than the panel,
  because a surround within a shade of its own panel wastes every piece of
  carving on it.
- The **rigs** keep their belt, side rails and console through the redesign.
  Those three are the silhouette; lose them and it is six handsome sheds.
- The **huts** have an ASYMMETRIC roof - long low back pitch, short high front
  pitch. A symmetrical one brought the eave to eye height and put thatch
  between the player and the counter they had ridden up to. Which pitch is the
  short one follows `SHOP_ROW.facing`, like everything else about a hut.
- The **plates** carry their state on the plate AND on a totem band, because a
  player riding along the row reads the totems, not the plate they are
  standing on.

- **They are authored loose and merged.** Each is a hundred-odd boxes, which is
  the only sane way to author a lashed timber hut - and six hundred and
  ninety-five separate meshes took the camp from about two hundred and thirty
  draw calls to eight hundred and sixty. `mergeStatic` collapses everything
  that never changes into one mesh per material and leaves the parts that do -
  a scrolling belt, a re-tinting plate, a redrawing canvas - named in `keep`.
  That is 209 calls, below where it started.
- **Nothing here touches gameplay.** Every position comes from the shared camp
  layout, and these four files only draw at it.

### Camp geometry

The camp is the one part of this world built by hand from overlapping
furniture rather than emitted by the route cursor, so it is the one part that
can z-fight. `verify:course` audits it:

- **No two solids may share a face.** Two axis-aligned boxes whose top faces
  sit at the same height and whose footprints overlap are two surfaces
  competing for the same pixels, and the result flickers. Abutting boxes are
  fine - they share an edge, not an area. This found a 30x16 patch of dirt laid
  at `floorY` in the gateway, on top of a camp floor that was already dirt and
  already at `floorY`: 450 square units of tie in the one place every run
  passes through.
- **Nothing may interpenetrate above ground.** Below it is allowed and
  deliberate: the terrace, the deck and the counters are all FOUNDED in the
  clearing's earth rather than resting on it, which is what keeps their
  undersides out of the floor's plane.

### Rainforest light

- The key light is WARM and the fill is GREEN. Daylight under a canopy has been
  through leaves twice, and a white key over a blue fill is what makes a jungle
  look like a studio. It stays bright: this is a tropical afternoon, and the
  player has to read the ground at four hundred units a second.
- The fog is warm green and starts closer than a clear day would. It is humid
  air rather than a draw-distance trick, and it is also what stops the last
  chunk of forest ending at a visible edge.

## Assets

- `assets/player/player.fbx` is the **canonical** player asset, and
  `assets/player/base_rig.fbx` is byte-identical to it. Do not load both.
- **Never modify the supplied FBX files.** `npm run verify:assets` checks their
  digests.
- The FBX embeds **dead absolute texture paths**. Texture resolution is handled
  explicitly in `client/src/config/assets.ts` and `PlayerModelLoader`.
- The FBX contains **no animation clips** - it is a bind-pose rig with 12
  bones. All animation is procedural. Do not add an animation library.
- The FBX declares **two skin deformers**, so FBXLoader creates two Bone
  objects per name. `PlayerRig` binds the **first** of each name.
- **Every static file lives in the repo-level `assets/`**, which Vite publishes
  as the web ROOT. There is no `client/public/`.
- `assets/ui/` ships **seven** images - a trophy, a backpack, a shop front, a
  rebirth swirl, a running shoe, a trail ribbon and an aura flame - and every
  one of them is used as it is. Only the evolve chevron and the speaker are
  inline SVG: tracing an approximation of art nobody supplied is how a build
  acquires files that each buy nothing. The opposite mistake costs the same -
  `trail.png` and `aura.png` shipped for a while while the HUD drew its own
  worse versions, which is seventy kilobytes sent to every player to be
  ignored. **Never set both dimensions of a supplied icon in CSS** - drive one
  and leave the other automatic so the real aspect ratio survives.

## The cosmetics

- Trails, auras and items are the SAME shop three times: a ladder of tiers,
  each bought once with Wins, each owned for ever, one equipped at a time. They
  are one `CosmeticService` configured three times, because three copies of
  that logic would be three places for an unowned tier to pay out.
- `CosmeticService` never learns what a tier MULTIPLIES. Trails and auras reach
  the Speed-gain formula and items reach the stage reward, both a long way from
  it.
- The client sends a slot number and NOTHING else - never a cost, never a
  multiplier - so there is no figure in a message to forge.
- Slots must fit a uint16 mask: sixteen, and no more.
- A **trail** is where the player has ALREADY been, so it lives on
  `Mount.worldRoot` and must not be parented to a moving node. An **aura** is
  where the player IS, so it lives on `Mount.root`. That one difference is the
  whole reason there are two effect roots on that class.
- The aura is ONE `Points` cloud per player, allocated once at full size and
  never regrown. Four styles are four MOTIONS over the same cloud, not four
  effects. `RADIUS` is 3.1 so the motes sit OUTSIDE the rider: at 2.3 a Fire
  aura read as the player being on fire rather than surrounded by it.

## Architecture rules

- **No god files.** Logic belongs in its module: `net`, `player`, `input`,
  `rendering`, `camera`, `animation`, `mount`, `world`, `progression`, `ui`,
  `config`.
- Gameplay tuning is **data-driven** and lives in `shared/src/config/*`.
- `shared/` must not import `three`, `colyseus`, or anything DOM.
- The client touches `colyseus.js` only inside `client/src/net/`.
- **Wins move in exactly one place**: `Wallet`. Three things want to move
  them - finishing a stage and the two spending shops - and they must not
  become three ways to take payment. Evolving and equipping a pad both READ the
  wallet and neither touches it, which is checkable precisely because neither
  appears in that file.
- **Speed is granted in exactly one place**: `SpeedService`, derived from
  movement the server observes and capped at a plausible step so a teleport
  pays nothing. The cap is derived from the player's OWN authoritative run
  speed, so validation and movement cannot disagree.
- **Deaths are decided on the server tick**, from the position it simulated and
  the clock it owns.
- Persistence sits behind `ProfileStorage`, and `createPersistence` is the
  ONLY place naming a concrete store. See **Player progress** below.
- Only the DERIVING facts are persisted. The one exception is `upgradeSlot`,
  which is a CHOICE rather than a derived fact: re-deriving it would either
  silently promote everyone to the best pad their wallet allows, or reset them
  to +1 every session. It is still clamped to what the restored Wins afford.

## Player progress

Signed-in Bloxity players keep their progress on their ACCOUNT - every browser,
every device, through restarts, scale-to-zero and deploys. Guests keep it in
their browser. Nothing on Legion resets progress any more.

- **Storage.** `MONGODB_URI` set (Legion injects it into every pod: an
  ISOLATED managed database per game+channel, named in the URI - use
  `client.db()`) means MongoDB; unset means JSON files in `EVOLVE_DATA_DIR`,
  the dev store. There is no Bloxity database API. The driver is `mongodb`
  6.x, because `engines` allows Node 20.11 and 7.x needs 20.19; it is HOISTED
  to the root node_modules, which is the only one the Dockerfile copies.
- **The contract is PER KEY**: `get` / `put` / `insertIfAbsent` / `loadAll` /
  `flush`, one document per player. Several pods share one database, so
  NOTHING writes a whole-map snapshot back, and a profile is read from storage
  at JOIN time - never from a cache filled at boot. The one boot snapshot is
  the leaderboard's, refreshed every minute, newer `updatedAt` winning.
- **A failed read is not "no profile".** `get` THROWS, and `onAuth` then
  REFUSES the join (4503); the client's join backoff brings the player in once
  storage is back. Letting them in on an empty profile would have the next
  autosave write that emptiness over their real one.
- **Writes** queue the LATEST update per key and land as idempotent
  `updateOne($set, upsert)` - never a replace. Failures retry with backoff for
  as long as it takes; nothing is dropped. A save `$unset`s only the known
  clearable fields (`CLEARABLE_FIELDS`), and every field this build does not
  know survives it - the old JSON loader silently dropped unknown fields on
  restart. The store reads its own queued writes back, so a leave and a quick
  rejoin on one pod never read a stale copy.
- **Boot never fails on storage.** A database that is down is logged loudly,
  `/health` keeps answering (or Legion restart-loops the pod), and joins fail
  cleanly until it is back. The Mongo client is made lazily and REPLACED if
  its first connect fails: a MongoClient whose initial connect fails keeps its
  closed topology and fails every later operation for ever.
- **Shutdown** is `gracefullyShutdown(false)`, THEN await the store's flush
  and close, then exit. With no argument Colyseus exits before the flush runs.
- **The JSON store** writes temp + fsync + rename, recovers a leftover `.tmp`
  that parses (a save that was fsynced but never renamed), and MOVES ASIDE a
  file it cannot parse rather than overwrite it.
- **Legacy import.** A `profiles.json` in the data directory is imported into
  Mongo on every boot with `$setOnInsert` - insert-only, never a replace.
  Account-prefixed keys in it are skipped.

### Identity

- **Keys.** An account is `bloxity:<accountId>`; a guest is this browser's id.
  The prefix is RESERVED: a browser id carrying it - or any malformed one - is
  refused, and that player plays as an UNSAVED guest. Otherwise a guest could
  name themselves into somebody's account.
- **Only a verified token names an account.** The client sends its portal
  TOKEN (`Legion.SDK.auth.getToken()`) with the join and again, as an `Auth`
  message, whenever the login changes - deduped. Never an account id, anywhere,
  Bux included.
- **Verification** is `POST https://api.bloxity.io/v1/auth/game-token/verify`
  with `Authorization: Bearer <token>` and `{ gameSlug }` - the call the
  official SDK makes. The host is a CONSTANT, not configuration. The token is
  NEVER verified locally: `JWT_SECRET` is the game's own secret, not
  Bloxity's signing key. FAIL CLOSED: only a 2xx carrying a non-empty string
  `_id` (as `{ user }` or the user itself) is an account.
- **Three outcomes, not two.** Verified; rejected (4xx: a guest); unavailable
  (timeout, 5xx, a 2xx without an id: a guest FOR NOW, re-verified on a
  backoff, never a permanent demotion). Verified results are cached for five
  minutes capped at the token's `exp`, rejected ones for 30 s, unavailable
  never - keyed by a hash of the token.

### First login and switching

- **An account's profile always wins.** Browser data never touches it.
- **An account with none** takes this browser's guest progress - if it has
  real progress and was never migrated - through `insertIfAbsent(account,
  guest + migratedFrom)`. ONLY once that insert succeeds is the guest copy
  marked `migratedTo` (and kept, as a recovery copy): a crash between the two
  duplicates progress, never loses it. Losing the insert race loads the winner.
- **A `migratedTo` guest profile** is never restored, never migrated again -
  which stops one browser seeding its progress into many accounts - and never
  on a board. A guest in that browser plays on under a FRESH id the server
  sends (`GuestId`), so nothing saves over the recovery copy.
- **Sign-in and sign-out mid-session** are a message on the LIVE session, not a
  reconnect: a reconnect can land on another pod before the last write reaches
  the database. While switching, the session's autosaves are blocked; the
  profile being LEFT is saved from live state and must be durable first; the
  new one is loaded (a sign-in from a guest carries the LIVE state, newer than
  the autosave), applied, pushed through the SAME initialisation `onJoin`
  uses, owed purchases are re-applied, the player is placed at spawn and
  saved. Storage failing anywhere before the apply leaves the session where
  it was, and it tries again. Only the newest login counts.

### Purchases

- The webhook records each purchase DURABLY, keyed by its transaction id,
  against `bloxity:<userId>` - the account Bloxity says paid - and answers 2xx
  only once it has (503 otherwise, so Bloxity retries). A retry is a
  duplicate key, and pays once across every pod and restart.
- Only a session whose account the server VERIFIED claims, atomically, so two
  pods cannot both apply one grant. The profile records the transaction id,
  and only once that profile write is durable is the grant marked applied. A
  claim that is never completed goes stale and is claimed again; the profile's
  record stops it paying twice.

## UI

The HUD is: **Evolve**, **Rebirth**, **Shop** and **Sound** as a TWO-COLUMN
grid at the LEFT-CENTRE of the screen, the **Wins** and **rebirth** tallies as
the grid's last row, **Total Multiplier** and **Speed** at the BOTTOM-CENTRE
over the level bar, and a small **nameplate** over every rider's head. The
tallies live INSIDE the rail's own grid so they sit under the tiles whatever
the tile count is.

- **ONE layout for a PC and a phone on its side.** The rail is centred in the
  screen's FREE height: below whatever the Bloxity portal draws over the top
  (`--aoe-portal-top`) and above the resting movement stick
  (`--aoe-stick-top`, computed from the stick's OWN radius formula,
  `clamp(46px, 15vmin, 84px)`). Both are zero where there is nothing to clear,
  so on a PC it is exactly centred and on a phone it sits in the band a thumb
  is not using. Only the tile size changes between the two.
- The level bar is centred, never closer than 20px to the bottom on a PC or
  12px on a phone, and on a phone its width is the channel BETWEEN the stick
  and the jump button, measured from the same radius formula.

- Every panel is the reference art's plate: a dark green box behind a heavy
  black frame, with a header of ICON, TITLE, a rule that takes up the slack and
  a red close square. The rule is what does the work - a one-word title and a
  three-word title still put the close button in the same place. `Panel` owns
  it, so a new panel cannot invent its own heading.
- `Panel.aside` is a column BESIDE the frame, and only the shop uses it. Its
  ladder tabs belong outside the panel, as the reference draws them, and
  putting them there on the base class is what keeps the two vertically
  centred on each other.
- `.aoe-btn` and `.aoe-gauge` are the ONE button and the ONE progress bar. Both
  are brick-faced plates with a dark frame; re-typing a gradient per panel is
  how three panels end up with three slightly different greens.
- The level bar's track is DARK GREEN and its fill is flat blue. A white track
  reads as the filled state, so a bar at 5% looked 95% full; the rainbow fill
  that preceded the blue changed colour as it grew, which made one level look
  like a different state at 40% and at 90%.
- **Large figures are COMPACT, and `formatSpeed` is the only place that
  decides so**: 1K, 2.5K, 100K, 1M, 1B, 1T, and never a trailing `.0`.
  Nothing has a ceiling, so the suffixes are GENERATED - the short-scale names
  Qa, Qi, Sx ... Dc, UDc ... Vg ... Ce, UCe - all the way to float64's end. Speed,
  Wins, shop prices, pad rates, popups and the leaderboards all go through it,
  so the game cannot abbreviate in two styles depending on where you look. The
  one exception is the HEADLINE reading and the level bar, which print the
  reference art's two decimals below `COMPACT_ABOVE` (a thousand) and fall back
  to the compact form at and above it - every figure the art pins is under the
  threshold. Both halves of the bar switch together, on the REQUIREMENT: a bar
  reading "940.00/1.2K" is two quantities rather than one fraction.
- `hudStyles.ts` owns the one stylesheet and the inline SVG icons.
- Everything shown is replicated server state. The HUD never awards, predicts
  or derives progress.
- The **total multiplier is replicated**, not recomputed. It is the product of
  five separate ladders, and a HUD that assembled its own copy would be a
  second place for one of them to be applied twice.
- The multiplier is ABSOLUTELY positioned at the left of its row, so the Speed
  figure stays centred under the player whatever digits the multiplier gains.
  On a screen under 560px there is no room beside a centred figure, so it
  returns to the flow as its own line - the fix for two things overlapping is
  a second line, not a smaller font.
- `Panel` counts open modals and the input layer polls that count. A COUNT
  rather than a boolean, so two panels closing out of order cannot leave the
  game permanently suppressed. `Game.panels` is a GETTER over the fields, so a
  panel added and forgotten cannot become one Escape does not close.
- **A rule that sets `display` beats the user agent's `[hidden]`**, because a
  class selector outranks an attribute one. `.aoe-prompt` is `display: flex`
  and needs its own `[hidden]` rule; without it the prompt is on screen from
  the first frame of every session.
- **Every menu must be reachable with a mouse.** Escape hands the cursor back
  and KEEPS it back, and one click on the world resumes play.
- Keys: **V** Evolve, **R** Rebirth, **T** Shop, **E** the stall in range,
  **M** mute, **Escape** to close and free the cursor.
- On a phone the interaction prompt IS the button - it is a real `<button>`,
  because a phone has no E key and a duplicate on-screen control would be a
  second thing to keep in step with the same proximity test.
- **A phone on its side** is `(orientation: landscape) and (max-height: 500px)`,
  and every rule for it is scoped to that query. The rail keeps the PC's
  left-centre grid with smaller tiles; `--aoe-stick-top` is what keeps it off
  the movement stick at any height.
- The bottom HUD is lifted by the STICK'S OWN size (`30vmin + 34px`) rather
  than a constant. A constant is a number that happens to work on one phone.
- **Inside the Bloxity portal the top-left corner is not ours.**
  `body.aoe-portal-embedded` supplies `--aoe-portal-top`.

## The Evolve menu

- Laid out as a BEFORE and AFTER pair, the same framing the rebirth panel uses,
  because they are the same question: what am I trading, and for what.
- It has ONE button, and **Evolve** is the STATE: evolution is automatic, so
  by the time anyone could press a button the server has already done it, and
  rather than ship a control that lies it is disabled until the requirement is
  met and then says what is happening. There is no Skip on this menu or the
  rebirth one: both close from their own close square and Escape.
- The portraits are the REAL models, rendered once offscreen into data URLs by
  `MountThumbnails` and cached. A second `WebGLRenderer` exists only for as
  long as it takes to draw the roster and is then destroyed. A browser that
  refuses the context gets an empty string and the menu falls back to a
  coloured card - a menu is not worth a crash.

## Audio

Every SOUND EFFECT is synthesised - oscillators cost bytes measured in
hundreds. The BACKGROUND MUSIC is the one deliberate exception: the supplied
`assets/audio/Background.mp3`, STREAMED through an `<audio>` element rather
than decoded into a buffer. Muting PAUSES the element rather than merely
silencing it.

- **ONE context, ONE music voice.** `resume()` is idempotent.
- **Only the LOCAL player makes noise.** Remote riders are drawn, animated and
  silent.
- Death, level and rebirth sounds fire on the EDGE, never the level.

## Multiplayer

- Other players are **ghosted**, and that word means EXACTLY one thing: they do
  not collide. They render completely normally.
- **Never transmit bone transforms or mount part transforms.** Every remote
  mount runs the same procedural animators the local one does.
- Remote animation is DERIVED from authoritative state, never from an event
  stream. `deathCount` is a LIFETIME total and only means anything as a
  difference against a baseline taken on FIRST sight.
- **A room holds `MAX_PLAYERS_PER_ROOM` (15).** `onAuth` re-checks capacity at
  the door, because `maxClients` is enforced at seat RESERVATION.

## Bloxity

`client/src/bloxity/Bloxity.ts` is the only file that touches `window.Legion`.
Every call is guarded; a missing SDK degrades to "no portal", never to a broken
game. Bux are server-authoritative like every other reward: the client passes a
SKU and NEVER a price, the webhook is `POST /bloxity/bux`, and **answering 2xx
is the contract** - sent only once the purchase is durably recorded. Fulfilment
QUEUES rather than writes, because the webhook arrives on the HTTP thread while
the player may be live. Who a player IS comes only from a token Bloxity
verifies - see **Player progress**.

The game slug is `speed-evolve`, overridable with `VITE_BLOXITY_GAME_ID` on the
client and `BLOXITY_GAME_ID` (which Legion injects) on the server.

## Verification

Do not claim something works without running it.

- `npm run typecheck` must pass.
- `npm run verify` must pass. `verify:course` is the one that catches world
  bugs a screenshot will not show:
  - no unsupported run longer than the stage's own recommended level can clear,
    counting a moving platform over its whole REACH;
  - kill volumes covering every stage, and no walkable surface inside one;
  - every win dais on solid ground and out of a kill volume;
  - every named set piece still present - boulders, swings, collapses,
    carousels, caves, rivers, fire, both guardians;
  - every act still using its own ground material, and every scenery kind
    still placed somewhere;
  - no hazard reaching through a valley wall;
  - and the CAMP's own geometry: no shared faces, nothing interpenetrating
    above ground, two upgrade tiers far enough apart to read as two, every pad
    claimable from its own tier and no other, and both terrace stairs ridable;
  - and the camp's LAYOUT, measured from the laid solids: nothing between the
    open middle and the treadmill deck, no trader in the gateway, every trader
    twenty units clear of the upgrade bank and a hut's length from the next,
    all three at the front, and the spawn in open ground.
  `verify:progression` exercises the server's reward, evolution, upgrade and
  purchase authority INCLUDING the rejection paths.
- `npm run size:client` must report under 12 MB.
- `npm run verify:difficulty` must pass after any change to a stage. It takes
  several minutes, which is why it is not part of `verify`; `--stage N` runs
  one stage and `--quick` uses three start times instead of five.
- `npm run verify:capacity` needs a RUNNING server, which is why it is not part
  of `verify`.
- `npm run verify:persistence` must pass after any change to storage,
  identity or purchases. It spawns the BUILT server with
  `scripts/persistence-stub.mjs` preloaded (`node --import`) - which replaces
  Bloxity's verify URL and NOTHING else; there is no test switch in production
  code - joins it with real colyseus.js clients, and reads the store directly.
  It always runs the JSON store; with `MONGODB_URI` it also runs against that
  database and WIPES it; with a mongod binary (`MONGOD_BIN`, or
  `~/.cache/mongodb-binaries`) it drives its own mongod for the outage tests.
  Not part of `verify`: it takes a couple of minutes. On Windows it kills
  servers hard, so it waits for writes to be visible in the store first.
- Browser behaviour must be checked in a real browser.

When driving the game from the browser console for a test: the window `blur`
fired when the pane loses focus clears every held key, so a harness has to
re-assert them; `requestAnimationFrame` does not fire while the pane is hidden,
so pump `game.update(1/60)` on a timer instead; and **`look.yaw` is a getter** -
steer with `look.addLookDelta(look.yaw - target, 0)`.

## Current milestone

Milestone 5 is complete: the thirty stages were rebuilt for difficulty. Every
gap, landing and width is a fraction of the stage's own jump reach, the
chains overshoot from act two on, every crossing wider than a jump moves, and
`verify:difficulty` proves the course beats riders with no skill while a
skilled rider clears every stage - at its own level and at level 160. See
**Difficulty** above.

Milestone 4 was: the environment was rebuilt as a rainforest. The
valley's rock walls are gone and a layered forest bounds the world in their
place, following the route's own elevation the whole way.

Milestone 3 was: the animals were rebuilt from anatomy rather than
recoloured, the rider is seated per species, and the HUD, the three panels, the
upgrade bank and the training row were rebuilt against the reference art.

Milestone 2 was: the world was rebuilt from zero. The corridor, its
floor and all twenty of the previous game's stages are gone, replaced by a
route cursor, a fourteen-thousand-unit valley, thirty hand-authored stages in
six acts, platforms the player rides, caves, rivers, two guardians, and an
expedition camp.

Milestone 1 was: the evolution chain, the twelve upgrade pads, the six gated
treadmills, the three animal-run shops with their trail, aura and item ladders,
rebirth, the three leaderboards and the Bloxity integration carried over from
the previous game.

**Not built yet, and out of scope until the milestone advances:** the daily
reward, the codes panel, the index/collection book, the teleport menu, the free
chest and the Bux-funded "2x Wins" gamepass. The rail tiles for those in the
reference art are deliberately absent rather than present and dead.
