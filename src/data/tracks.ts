import type { Segment, TrackDefinition, TurnDirection } from "@/lib/track-types";
import {
  polylineToSegments,
  startAtLongestStraight,
  type GradientBand,
  type Point,
} from "@/lib/track-polyline";
import { MONACO_OUTLINE, MONZA_OUTLINE, SPA_FRANCORCHAMPS_OUTLINE } from "@/data/track-outlines";

function straight(lengthM: number, gradientPercent = 0): Segment {
  return { kind: "straight", lengthM, gradientPercent };
}

function corner(lengthM: number, radiusM: number, dir: TurnDirection, gradientPercent = 0): Segment {
  return { kind: "corner", lengthM, radiusM, dir, gradientPercent };
}

/** Repeats a straight+corner "switchback" unit `reps` times - used for Pikes Peak,
 * which has ~156 corners in reality and would be impractical to hand-list one by
 * one. Real switchbacks alternate direction, which is what makes a hillclimb road
 * zigzag up the mountain. */
function switchbacks(
  reps: number,
  straightM: number,
  cornerM: number,
  radiusM: number,
  gradientPercent: number,
): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < reps; i++) {
    segs.push(straight(straightM, gradientPercent));
    segs.push(corner(cornerM, radiusM, i % 2 === 0 ? "right" : "left", gradientPercent));
  }
  return segs;
}

/** The three circuits come from their surveyed centrelines - see
 * `scripts/import-tracks.ts` - so the shape on screen is the circuit's own and
 * the radius a car corners on is the radius the road actually has.
 *
 * Only the gradients are set by hand: OpenStreetMap carries no elevation, and a
 * lap of Spa without the Eau Rouge climb would be a different circuit. Each band
 * covers a fraction of the lap, measured from the start line. */

/** Spa climbs about 100 m over a lap: down into the Eau Rouge dip, up the
 * Raidillon and the Kemmel straight, then a long descent through the forest to
 * Stavelot and a gentle climb back along Blanchimont. */
const SPA_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.04, percent: 2 },
  { from: 0.04, to: 0.07, percent: -8 },
  { from: 0.07, to: 0.12, percent: 12 },
  { from: 0.12, to: 0.22, percent: 4 },
  { from: 0.22, to: 0.55, percent: -4 },
  { from: 0.55, to: 0.75, percent: -2 },
  { from: 0.75, to: 1, percent: 3 },
];

/** Monaco climbs from Sainte Devote to Casino and drops back to the harbour
 * through Mirabeau, the hairpin and Portier; the harbour half is flat. */
const MONACO_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.08, percent: 1 },
  { from: 0.08, to: 0.22, percent: 7 },
  { from: 0.22, to: 0.28, percent: 2 },
  { from: 0.28, to: 0.42, percent: -6 },
  { from: 0.42, to: 1, percent: 0 },
];

function circuit(name: string, outline: [number, number][], gradients?: GradientBand[]): TrackDefinition {
  const options = { gradients };
  // The surveyed way starts wherever the mapper began drawing, which is rarely
  // the start line; every one of these has its line on the longest straight.
  const fromLine = startAtLongestStraight(outline as Point[], options);
  return {
    name,
    type: "CIRCUIT",
    segments: polylineToSegments(fromLine, options),
    outline: fromLine as [number, number][],
  };
}

export const tracks: TrackDefinition[] = [
  { name: "Sprint 250m", type: "SPRINT", segments: [straight(250)] },
  { name: "Sprint 500m", type: "SPRINT", segments: [straight(500)] },
  { name: "Sprint 1000m", type: "SPRINT", segments: [straight(1000)] },
  { name: "Sprint 2000m", type: "SPRINT", segments: [straight(2000)] },

  circuit("Monza", MONZA_OUTLINE),
  circuit("Spa-Francorchamps", SPA_FRANCORCHAMPS_OUTLINE, SPA_GRADIENTS),
  circuit("Monaco", MONACO_OUTLINE, MONACO_GRADIENTS),

  {
    name: "Pikes Peak Hillclimb",
    type: "CIRCUIT",
    // ~20km, ~156 corners, ~1440m total elevation gain - modeled as three climbing
    // sectors that get progressively tighter and steeper toward the summit. A
    // hillclimb is not a lap, so there is no outline to close.
    segments: [
      ...switchbacks(52, 60, 68, 40, 5), // lower / forest section
      ...switchbacks(52, 60, 68, 30, 7), // mid mountain section
      ...switchbacks(52, 60, 68, 22, 9), // upper / alpine section near the summit
    ],
  },
];
