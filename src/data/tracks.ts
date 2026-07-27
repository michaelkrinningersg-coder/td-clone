import type { Segment, TrackDefinition, TurnDirection } from "@/lib/track-types";
import { circuitFromOutline, type OutlineVertex } from "@/lib/track-outline";

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

/** The circuits are drawn as the closed shapes they are and the segment list is
 * derived from the outline, rather than written out corner by corner.
 *
 * Written out corner by corner, nothing tied the last corner back to the first:
 * a lap never came back to where it started, and Monaco turned through 588
 * degrees and finished 1.8 km from the line. Drawn as a shape, the lap closes
 * because the shape does, and the radii the physics uses are the radii of the
 * line on screen.
 *
 * The shapes are drawn by eye from the real layouts - corner order, character,
 * turn direction and gradients - and then scaled to the circuit's real length.
 * They are a likeness, not survey data.
 *
 * Pikes Peak stays a segment list: it is a hillclimb, not a lap, and has no
 * business closing. */

// Monaco, clockwise: pit straight up the left, the climb to Casino across the
// top, the hairpin doubling back on itself, then the tunnel and the harbour
// section down the right.
const MONACO: OutlineVertex[] = [
  { x: 0, y: 0, radiusM: 60, name: "Start/Ziel", gradientPercent: 1 },
  { x: 55, y: 330, radiusM: 18, name: "Sainte Devote", gradientPercent: 7 },
  { x: 175, y: 520, radiusM: 120, name: "Beau Rivage", gradientPercent: 7 },
  { x: 250, y: 700, radiusM: 35, name: "Massenet", gradientPercent: 2 },
  { x: 430, y: 690, radiusM: 28, name: "Casino", gradientPercent: -3 },
  { x: 495, y: 590, radiusM: 20, name: "Mirabeau", gradientPercent: -6 },
  { x: 435, y: 515, radiusM: 10, name: "Fairmont-Haarnadel", gradientPercent: -6 },
  { x: 452, y: 570, radiusM: 18, name: "Mirabeau bas", gradientPercent: -5 },
  { x: 585, y: 520, radiusM: 22, name: "Portier", gradientPercent: -2 },
  { x: 760, y: 470, radiusM: 140, name: "Tunnel" },
  { x: 905, y: 300, radiusM: 14, name: "Nouvelle Chicane" },
  { x: 855, y: 250, radiusM: 45, name: "Tabac" },
  { x: 800, y: 150, radiusM: 20, name: "Piscine Einfahrt" },
  { x: 700, y: 115, radiusM: 18, name: "Piscine Ausfahrt" },
  { x: 655, y: 45, radiusM: 10, name: "La Rascasse" },
  { x: 560, y: 75, radiusM: 22, name: "Anthony Noghes", gradientPercent: 1 },
];

// Monza, clockwise: main straight up the left, Curva Grande across the top, the
// Lesmos, the Serraglio down the right, Ascari, and the Parabolica sweeping
// back onto the line. Almost flat throughout.
const MONZA: OutlineVertex[] = [
  { x: 0, y: 0, radiusM: 260, name: "Start/Ziel" },
  { x: 0, y: 1150, radiusM: 20, name: "Variante del Rettifilo" },
  { x: 95, y: 1245, radiusM: 22, name: "Rettifilo Ausfahrt" },
  { x: 250, y: 1720, radiusM: 175, name: "Curva Grande" },
  { x: 545, y: 1990, radiusM: 24, name: "Variante della Roggia" },
  { x: 640, y: 1935, radiusM: 26, name: "Roggia Ausfahrt" },
  { x: 930, y: 2120, radiusM: 80, name: "Lesmo 1" },
  { x: 1045, y: 2035, radiusM: 65, name: "Lesmo 2" },
  { x: 1180, y: 1290, radiusM: 400, name: "Serraglio" },
  { x: 1245, y: 880, radiusM: 50, name: "Variante Ascari" },
  { x: 1155, y: 800, radiusM: 55, name: "Ascari Ausfahrt" },
  { x: 1215, y: 210, radiusM: 150, name: "Parabolica" },
  { x: 900, y: -195, radiusM: 220, name: "Parabolica Scheitel" },
  { x: 320, y: -160, radiusM: 260, name: "Parabolica Ausfahrt" },
];

// Spa, clockwise: pit straight up the right, La Source doubling back into the
// Eau Rouge dip, the Kemmel climb away to Les Combes, then the long descent
// through the forest to Stavelot and Blanchimont back to the Bus Stop.
const SPA: OutlineVertex[] = [
  { x: 0, y: 0, radiusM: 250, name: "Start/Ziel", gradientPercent: 3 },
  { x: 0, y: 330, radiusM: 13, name: "La Source", gradientPercent: -6 },
  { x: 95, y: 95, radiusM: 70, name: "Eau Rouge", gradientPercent: 12 },
  { x: 260, y: 175, radiusM: 90, name: "Raidillon", gradientPercent: 12 },
  { x: 890, y: 720, radiusM: 55, name: "Les Combes", gradientPercent: -2 },
  { x: 1010, y: 645, radiusM: 45, name: "Malmedy", gradientPercent: -4 },
  { x: 1330, y: 575, radiusM: 22, name: "Rivage", gradientPercent: -5 },
  { x: 1270, y: 330, radiusM: 110, name: "Pouhon", gradientPercent: -4 },
  { x: 1520, y: 80, radiusM: 60, name: "Fagnes", gradientPercent: -2 },
  { x: 1470, y: -230, radiusM: 45, name: "Stavelot", gradientPercent: 2 },
  { x: 1130, y: -420, radiusM: 300, name: "Blanchimont", gradientPercent: 3 },
  { x: 230, y: -250, radiusM: 20, name: "Bus-Stop-Schikane", gradientPercent: 2 },
  { x: 140, y: -175, radiusM: 22, name: "Bus Stop Ausfahrt", gradientPercent: 2 },
];

export const tracks: TrackDefinition[] = [
  { name: "Sprint 250m", type: "SPRINT", segments: [straight(250)] },
  { name: "Sprint 500m", type: "SPRINT", segments: [straight(500)] },
  { name: "Sprint 1000m", type: "SPRINT", segments: [straight(1000)] },
  { name: "Sprint 2000m", type: "SPRINT", segments: [straight(2000)] },

  { name: "Monza", type: "CIRCUIT", segments: circuitFromOutline(MONZA, 5793) },
  { name: "Spa-Francorchamps", type: "CIRCUIT", segments: circuitFromOutline(SPA, 7004) },
  { name: "Monaco", type: "CIRCUIT", segments: circuitFromOutline(MONACO, 3337) },

  {
    name: "Pikes Peak Hillclimb",
    type: "CIRCUIT",
    // ~20km, ~156 corners, ~1440m total elevation gain - modeled as three climbing
    // sectors that get progressively tighter and steeper toward the summit.
    segments: [
      ...switchbacks(52, 60, 68, 40, 5), // lower / forest section
      ...switchbacks(52, 60, 68, 30, 7), // mid mountain section
      ...switchbacks(52, 60, 68, 22, 9), // upper / alpine section near the summit
    ],
  },
];
