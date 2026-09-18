import { block, decorate, groundDuringBuild, hazard, movers, pit, solids } from '../emit.js';
import type { Route } from '../route.js';
import type { DecorationKind } from '../types.js';

/**
 * Set dressing, shared by every act.
 *
 * The rule these all follow: scenery is placed RELATIVE TO THE ROUTE, from the
 * cursor's own position, and never at absolute world coordinates. A jungle
 * authored at fixed coordinates stops lining up with the path the moment the
 * path is retuned, and the whole point of the route cursor is that a stage can
 * be retuned.
 *
 * Everything here is deterministic. Scattered positions come from the route's
 * own seeded generator, never from `Math.random`, because the world is built
 * independently on every client and on the server - a jungle that was
 * differently overgrown on each machine would be a jungle where one player's
 * cover is another player's open ground.
 */

export interface ScatterOptions {
  /** Multiplier on how much is placed. 1 is an ordinary trailside. */
  readonly density?: number;
  /** Fraction of the trees that are palms rather than broadleaf. */
  readonly palms?: number;
  /** Fraction of the clutter that is fallen logs. */
  readonly fallen?: number;
  /** Fraction that is broken masonry. */
  readonly ruins?: number;
  /** True to add a high canopy layer over the route. */
  readonly canopy?: boolean;
  /** How far out from the route's centre the planting starts. */
  readonly inset?: number;
  /** How far out it reaches. */
  readonly reach?: number;
  /**
   * How far BELOW the route a plant may be dropped to find ground.
   *
   * Beyond this it is simply not placed. On a bridge two hundred units above
   * the valley, a tree on the valley floor is scenery; a tree that had to fall
   * two hundred units to find it is a tree nobody will ever see, and forty
   * thousand of them is the frame budget.
   */
  readonly drop?: number;
}

/**
 * Where a plant at this point actually stands.
 *
 * The route's own height where there is path beside it, and the top of
 * whatever kill volume is under it where there is not - so a trailside fern
 * sits on the trail's shoulder and a valley tree sits on the riverbank far
 * below, with nothing anywhere hanging in the air. Returns null when the drop
 * is too far to be worth drawing.
 */
const standOn = (x: number, z: number, routeY: number, drop: number): number | null => {
  const below = groundDuringBuild(x, z);
  if (below === null) return routeY - 1;
  if (below > routeY - 3) return routeY - 1;
  return routeY - below > drop ? null : below;
};

/**
 * Plant the sides of a stretch of route that has already been laid.
 *
 * Walks BACKWARD from the cursor over the whole stage by default, so a builder
 * dresses its stage as its last line and does not have to remember - or keep
 * up to date - how long the stage turned out to be.
 *
 * Density is bought with vertices, not with draw calls: every tree, fern and
 * rock in the game merges into a handful of instanced meshes, so a thick
 * treeline costs the frame almost exactly what a thin one does.
 */
export const scatterJungle = (
  r: Route,
  stage: number,
  length = r.z - r.startZ,
  options: ScatterOptions = {},
): void => {
  const density = options.density ?? 1;
  const inset = options.inset ?? 16;
  const reach = options.reach ?? 46;
  const palms = options.palms ?? 0.22;
  const fallen = options.fallen ?? 0.18;
  const ruins = options.ruins ?? 0;
  const fromZ = r.z - length;
  const count = Math.round((length / 9) * density);

  for (let i = 0; i < count; i += 1) {
    const a = r.next();
    const b = r.next();
    const c = r.next();
    const side = i % 2 === 0 ? 1 : -1;
    const z = fromZ + a * length;
    // Placed off the CURSOR'S line rather than off world zero, so a stage that
    // curves keeps its planting beside the path instead of drifting into it.
    const x = r.x + side * (inset + b * reach);
    const y = standOn(x, z, r.y, options.drop ?? 60);
    if (y === null) continue;

    let kind: DecorationKind = 'tree';
    if (c < palms) kind = 'palm';
    else if (c < palms + fallen) kind = 'fallenLog';
    else if (c < palms + fallen + ruins) kind = 'arch';

    decorate(stage, kind, x, y, z, 0.85 + b * 0.8, a * 6.28, i % 3);

    // Ground cover between the trees, twice as thick as the trees themselves.
    // Ferns are what make a jungle floor read as a floor rather than as green
    // paint, and they are six boxes each.
    for (let j = 0; j < 2; j += 1) {
      const fa = r.next();
      const fb = r.next();
      const fx = r.x + side * (inset * 0.55 + fa * reach);
      const fz = fromZ + fb * length;
      const fy = standOn(fx, fz, r.y, options.drop ?? 60);
      if (fy === null) continue;
      decorate(
        stage,
        fb < 0.2 ? 'bush' : fb < 0.3 ? 'mushroom' : 'fern',
        fx,
        fy,
        fz,
        0.7 + fa * 0.6,
        fa * 6.28,
        j,
      );
    }
  }

  // Roots crawling out of the banks onto the path's shoulders.
  for (let i = 0; i < Math.round(count * 0.4); i += 1) {
    const a = r.next();
    const side = i % 2 === 0 ? 1 : -1;
    const rx = r.x + side * (inset * 0.7);
    const rz = fromZ + a * length;
    const ry = standOn(rx, rz, r.y, options.drop ?? 60);
    if (ry === null) continue;
    decorate(stage, 'root', rx, ry - 0.2, rz, 0.9 + a * 0.7, side > 0 ? 0.6 : -0.6, i % 2);
  }

  if (options.canopy) {
    // A high layer arching over the route, so a trail through the canopy has a
    // ceiling of leaves rather than open sky.
    for (let i = 0; i < Math.round(count * 0.5); i += 1) {
      const a = r.next();
      const b = r.next();
      decorate(stage, 'tree', r.x + (b - 0.5) * 70, r.y + 22 + a * 14, fromZ + a * length, 1.8 + b, a * 6.28, 1);
      decorate(stage, 'vine', r.x + (b - 0.5) * 44, r.y + 20, fromZ + b * length, 1 + a, 0, i % 3);
    }
  }
};

/**
 * A shallow stream running under the route at the cursor.
 *
 * Purely environmental: it is drawn, it is below the path, and it kills only
 * if the player is already off the path - which the route's own kill volume
 * would have done anyway. It exists so that a trail crosses WATER rather than
 * crossing nothing.
 */
export const streamUnder = (r: Route, width: number): void => {
  pit(r.stage, 'water', r.x - 70, r.x + 70, r.z - width, r.z + width, r.y - 7, 0.4);
  for (let i = 0; i < 5; i += 1) {
    const a = r.next();
    decorate(r.stage, 'rock', r.x + (a - 0.5) * 80, r.y - 6, r.z + r.wobble(width), 0.7 + a, a * 6.28, 1);
  }
};

/**
 * Where a stage's route actually IS over a slice of Z: its left and right
 * edges and its highest walkable top, read from the ground already laid.
 *
 * Scenery placed from the cursor's position is placed from where the route
 * ENDED, and on a route that weaves, climbs a stair or drops down a cataract
 * that is somewhere else entirely - pillars in the path, torches in mid-air, a
 * cliff face through a landing. Everything that has to stand BESIDE the route
 * asks this instead. Returns null over a slice with no ground at all.
 */
export const routeAt = (
  stage: number,
  z0: number,
  z1: number,
): { left: number; right: number; top: number } | null => {
  let left = Infinity;
  let right = -Infinity;
  let top = -Infinity;
  const consider = (minX: number, maxX: number, minZ: number, maxZ: number, maxY: number): void => {
    if (maxZ < z0 - 4 || minZ > z1 + 4) return;
    if (minX < left) left = minX;
    if (maxX > right) right = maxX;
    if (maxY > top) top = maxY;
  };
  for (const solid of solids) {
    if (solid.stage !== stage || solid.maxY - solid.minY > 30) continue;
    if (solid.kind === 'ruin' && solid.maxX - solid.minX < 9 && solid.maxY - solid.minY > 8) continue;
    consider(solid.minX, solid.maxX, solid.minZ, solid.maxZ, solid.maxY);
  }
  for (const mover of movers) {
    if (mover.stage !== stage) continue;
    const sway = mover.motion === 'shuttle' && mover.axis === 'x' ? mover.amount : 0;
    consider(mover.minX - sway, mover.maxX + sway, mover.minZ, mover.maxZ, mover.maxY);
  }
  return left === Infinity ? null : { left, right, top };
};

/**
 * A cliff face rising beside the route, with the route running along its foot.
 *
 * The shoulder a ledge stage hugs. It is a real solid: a mount pressed against
 * the wall stops, which is what makes a narrow ledge feel like a ledge rather
 * than a strip of floor with nothing on either side.
 *
 * Every segment is placed from the ground ALREADY LAID at its own Z - how far
 * out the route reaches there, and how high it stands - rather than from where
 * the cursor has ended up. The old version put the whole face at the route's
 * final X and height, which on a route that shifts sideways or descends put a
 * hundred-unit wall straight through the landings it was meant to stand
 * beside.
 */
export const cliffWall = (r: Route, length: number, side: 1 | -1, height = 64): void => {
  const fromZ = r.z - length;
  const steps = Math.max(1, Math.round(length / 14));
  const span = length / steps;
  let edge = r.x + side * (r.width / 2);
  let top = r.y;
  for (let i = 0; i < steps; i += 1) {
    const z0 = fromZ + span * i;
    const here = routeAt(r.stage, z0, z0 + span);
    if (here) {
      edge = side > 0 ? here.right : here.left;
      top = here.top;
    }
    const x = edge + side * 4;
    const z = z0 + span / 2;
    block(r.stage, 'rock', side > 0 ? x : x - 26, top - 24, z0, 26, height, span + 0.4);
    if (i % 2 === 0) {
      decorate(r.stage, 'vine', x + side * 2, top + 14 + r.next() * 18, z, 1 + r.next(), 0, i % 3);
      decorate(r.stage, 'fern', x + side * 1.5, top, z, 0.8, 0, 0);
    }
  }
};

/**
 * A waterfall pouring down beside or across the route.
 *
 * Two things at once, and they are deliberately separable: the SHEET is
 * scenery and costs nothing, and the `cascade` hazard is the lethal column
 * under it. A fall the player can ride behind therefore takes the sheet alone,
 * and one they have to time takes both.
 */
export const waterfall = (
  r: Route,
  x: number,
  z: number,
  topY: number,
  height: number,
  options: { lethal?: boolean; width?: number; scale?: number } = {},
): void => {
  const width = options.width ?? 14;
  decorate(r.stage, 'waterfall', x, topY, z, options.scale ?? height / 20, 0, 0);
  for (let i = 0; i < 4; i += 1) {
    decorate(r.stage, 'rock', x + r.wobble(width), topY - height + 2, z + r.wobble(8), 0.9 + r.next(), r.next() * 6.28, 1);
  }
  if (options.lethal) {
    hazard(r.stage, 'cascade', {
      x,
      y: topY,
      z,
      radius: width / 2,
      sweep: height,
      rate: 0,
    });
  }
};

/**
 * A row of temple columns down both sides of the route.
 *
 * The one piece of architecture that turns a stone floor into a HALL, and the
 * reason the ruins acts read as interiors while the jungle acts read as
 * outdoors - without either of them needing a roof.
 */
export const colonnade = (
  r: Route,
  length: number,
  options: { spacing?: number; offset?: number; height?: number; broken?: number } = {},
): void => {
  const spacing = options.spacing ?? 18;
  const offset = options.offset ?? r.width / 2 + 7;
  const height = options.height ?? 26;
  const broken = options.broken ?? 0.25;
  const fromZ = r.z - length;
  const count = Math.max(1, Math.round(length / spacing));

  // `offset` is measured from the route's centre line where it IS, and never
  // lets a pillar closer than three units to the route's own edge there.
  const margin = offset - r.width / 2;
  let here = { left: r.x - r.width / 2, right: r.x + r.width / 2, top: r.y };
  for (let i = 0; i <= count; i += 1) {
    const z = fromZ + (length * i) / count;
    here = routeAt(r.stage, z - spacing / 2, z + spacing / 2) ?? here;
    const centre = (here.left + here.right) / 2;
    for (const side of [-1, 1]) {
      // A quarter of them are snapped off halfway up. An unbroken colonnade
      // reads as a building; a broken one reads as a ruin, and this
      // civilisation has been gone a very long time.
      const shear = r.next() < broken ? 0.35 + r.next() * 0.4 : 1;
      const edge = side > 0 ? here.right : here.left;
      const x = side > 0 ? Math.max(centre + offset, edge + Math.max(3, margin) + 2.6) : Math.min(centre - offset, edge - Math.max(3, margin) - 2.6);
      block(r.stage, 'ruin', x - 2.6, here.top, z - 2.6, 5.2, height * shear, 5.2);
      if (shear > 0.95) {
        block(r.stage, 'ruin', x - 4, here.top + height, z - 4, 8, 3.4, 8);
      }
      if (i % 3 === 0) {
        decorate(r.stage, 'vine', x, here.top + height * shear, z, 1.1, 0, i % 3);
      }
    }
  }
};

/** A pair of guardian statues flanking the route, facing inward. */
export const guardians = (r: Route, z: number, scale = 2.2, offset = 0): void => {
  const out = offset || r.width / 2 + 11;
  const here = routeAt(r.stage, z - 6, z + 6);
  const centre = here ? (here.left + here.right) / 2 : r.x;
  const y = here ? here.top : r.y;
  for (const side of [-1, 1]) {
    decorate(r.stage, 'statue', centre + side * out, y, z, scale, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
  }
};

/** Torches down both sides of a stretch, for the temple interiors. */
export const torchlight = (r: Route, length: number, spacing = 22): void => {
  const fromZ = r.z - length;
  const count = Math.max(1, Math.round(length / spacing));
  for (let i = 0; i <= count; i += 1) {
    const z = fromZ + (length * i) / count;
    const here = routeAt(r.stage, z - 3, z + 3);
    if (!here) continue;
    decorate(r.stage, 'torch', here.left - 3.2, here.top, z, 1.1, 0, 0);
    decorate(r.stage, 'torch', here.right + 3.2, here.top, z, 1.1, 0, 0);
  }
};

/** An abandoned camp beside the route: the last expedition got this far. */
export const abandonedCamp = (r: Route, z: number, side: 1 | -1): void => {
  const x = r.x + side * (r.width / 2 + 13);
  decorate(r.stage, 'tent', x, r.y, z, 1.2, r.next() * 6.28, 2);
  decorate(r.stage, 'crates', x + side * 5, r.y, z + 7, 1, r.next() * 6.28, 1);
  decorate(r.stage, 'torch', x - side * 4, r.y, z - 5, 1, 0, 0);
  decorate(r.stage, 'stele', x + side * 8, r.y, z - 9, 1.1, 0, 0);
};


/**
 * Dressing for an underground stage.
 *
 * A separate call rather than an option on `scatterJungle`, because a cave
 * wants the OPPOSITE of what a trailside wants: nothing tall, nothing that
 * needs sky, and everything tight against the walls the tunnel already has.
 */
export const scatterCave = (r: Route, stage: number, length = r.z - r.startZ): void => {
  const fromZ = r.z - length;
  const count = Math.round(length / 11);
  for (let i = 0; i < count; i += 1) {
    const a = r.next();
    const b = r.next();
    const side = i % 2 === 0 ? 1 : -1;
    const z = fromZ + a * length;
    const x = r.x + side * (5 + b * 7);
    decorate(stage, b < 0.55 ? 'mushroom' : 'rock', x, r.y - 1, z, 0.7 + b * 0.8, a * 6.28, i % 3);
    if (b > 0.82) decorate(stage, 'vine', x, r.y + 9, z, 0.8 + a * 0.5, 0, i % 3);
  }
};
