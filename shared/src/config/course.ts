/**
 * The world.
 *
 * A re-export, so every consumer keeps importing `config/course.js` while the
 * world itself lives in the package beside it. Thirty hand-authored stages, an
 * expedition camp, a route builder and the motion functions do not belong in
 * one file - and the previous game in this series proved it, at three and a
 * half thousand lines.
 *
 * Nothing of that file survives here. The corridor, the full floor under it,
 * the lane fractions, the pattern vocabulary and all twenty of its stages were
 * deleted rather than retuned: this is a different world, laid out by a cursor
 * that walks a meandering, climbing route through a valley that has no floor.
 * See `course/route.ts`, which is where the difference actually lives.
 */
export * from './course/index.js';
