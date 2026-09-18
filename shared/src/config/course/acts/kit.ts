import { decorate } from '../emit.js';
import type { Route } from '../route.js';
import type { SolidKind } from '../types.js';

/**
 * Crossings: the places the course leaves the ground.
 *
 * Shared by every act, so a moving bridge in the jungle and one in the
 * temple are the same fair shape with different stone. The course is wide
 * ground almost everywhere; these are the rivers, chasms and fire pits
 * between, and every one is crossed on something that MOVES - waited for,
 * timed, and ridden - rather than on a strip of floor thin enough to fall
 * off.
 *
 * Each helper leaves the cursor at the far edge of its crossing, ready for
 * the builder to lay the landing.
 */

export interface BridgeOptions {
  /** Open air before, between and after the platforms. */
  readonly gap: number;
  /** Each platform's length along the route. */
  readonly size: number;
  /** Each platform's width across it. */
  readonly width: number;
  /** How far each slides either side of the line. More than half its width, or it never leaves it. */
  readonly travel: number;
  /** Cycles a second. */
  readonly rate: number;
  readonly kind?: SolidKind;
  /** Phase step between neighbours, so they are never in lockstep. */
  readonly stagger?: number;
}

/**
 * A gap crossed on platforms sliding side to side: a moving bridge.
 *
 * `travel` more than half the platform's `width` is the timing: the platform
 * is only under the line for part of its cycle, and a rider who jumps
 * blind lands in the river.
 */
export const movingBridge = (r: Route, count: number, o: BridgeOptions): void => {
  for (let i = 0; i < count; i += 1) {
    r.gap(o.gap);
    r.shuttle(r.z + o.size / 2, {
      x: r.x,
      y: r.y,
      width: o.width,
      length: o.size,
      travel: o.travel,
      rate: o.rate,
      phase: (i * (o.stagger ?? 0.37)) % 1,
      kind: o.kind ?? 'plank',
      axis: 'x',
    });
    r.gap(o.size);
  }
  r.gap(o.gap);
};

export interface LiftOptions {
  /** Drop from the ledge to the lift's HIGHEST point. Kept small: the lift works below its ledges. */
  readonly drop: number;
  /** Half the lift's rise. At the bottom it is `drop + 2 x travel` below the ledge. */
  readonly travel: number;
  readonly size: number;
  readonly width: number;
  readonly gapIn: number;
  readonly gapOut: number;
  readonly rate: number;
  readonly phase?: number;
  readonly kind?: SolidKind;
}

/**
 * A chasm crossed on a platform rising and falling in the middle of it.
 *
 * The lift works BELOW the two ledges it joins: at its top it is a short hop
 * down from the near ledge and a jump up to the far one, and at its bottom
 * the far ledge is out of reach. So the rider waits for it to rise - and a
 * lift that rose ABOVE its ledges would present its side face to a rider in
 * the air, which stops them dead and drops them.
 */
export const liftCrossing = (r: Route, o: LiftOptions): void => {
  r.gap(o.gapIn);
  const centre = r.y - o.drop - o.travel;
  r.lift(r.z + o.size / 2, {
    x: r.x,
    y: centre,
    size: o.size,
    width: o.width,
    travel: o.travel,
    rate: o.rate,
    phase: o.phase ?? 0,
    kind: o.kind ?? 'stone',
  });
  r.standing(centre - o.travel);
  r.gap(o.size);
  r.gap(o.gapOut);
};

export interface CarouselOptions {
  /** Width of the chasm. More than a jump: the stones are the only way. */
  readonly across: number;
  readonly size: number;
  /** Radius of the orbit. */
  readonly radius: number;
  /** Radians a second; the sign is the direction. */
  readonly rate: number;
  readonly phase?: number;
  /** How far the hub sits off the line, so the stones come to the rider from one side. */
  readonly offset?: number;
  readonly kind?: SolidKind;
}

/**
 * A chasm crossed on two stones circling a pillar in its middle.
 *
 * One of the pair is always coming round. The pillar is scenery, never a
 * solid: a solid top far below the path is somewhere a falling rider lands
 * and is stranded rather than killed.
 */
export const carouselCrossing = (r: Route, o: CarouselOptions): void => {
  const hubX = r.x + (o.offset ?? 0);
  const hubZ = r.z + o.across / 2;
  const phase = o.phase ?? 0;
  for (const extra of [0, 0.5]) {
    r.carousel(hubZ, {
      x: hubX,
      y: r.y,
      size: o.size,
      radius: o.radius,
      rate: o.rate,
      phase: (phase + extra) % 1,
      kind: o.kind ?? 'stone',
    });
  }
  decorate(r.stage, 'stele', hubX, r.y - 30, hubZ, 3.2, 0, 1);
  decorate(r.stage, 'torch', hubX, r.y - 8, hubZ, 1.3, 0, 0);
  r.gap(o.across);
};

/**
 * A chain of big rocks across a river or a gap: the jump primitive.
 *
 * Wide rocks - a fifth of the trail's width at the least - because the skill
 * here is WHERE and WHEN to jump, not staying on something thin. From act two
 * `gap + land` is under a jump, so a jump from the very edge overshoots.
 */
export const rocks = (
  r: Route,
  count: number,
  o: { gap: number; land: number; width: number; jog?: number; kind?: SolidKind; step?: number },
): void => {
  r.hops(count, {
    gap: o.gap,
    land: o.land,
    width: o.width,
    jog: o.jog ?? 0,
    kind: o.kind ?? 'rock',
    depth: 6,
    step: o.step ?? 0,
  });
  r.gap(o.gap);
};
