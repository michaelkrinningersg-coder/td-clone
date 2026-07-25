import type { Segment, TrackDefinition } from "@/lib/track-types";

function straight(lengthM: number, gradientPercent = 0): Segment {
  return { kind: "straight", lengthM, gradientPercent };
}

function corner(lengthM: number, radiusM: number, gradientPercent = 0): Segment {
  return { kind: "corner", lengthM, radiusM, gradientPercent };
}

/** Repeats a straight+corner "switchback" unit `reps` times - used for Pikes Peak,
 * which has ~156 corners in reality and would be impractical to hand-list one by one. */
function switchbacks(reps: number, straightM: number, cornerM: number, radiusM: number, gradientPercent: number): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < reps; i++) {
    segs.push(straight(straightM, gradientPercent));
    segs.push(corner(cornerM, radiusM, gradientPercent));
  }
  return segs;
}

// All tracks below are loosely inspired by public knowledge of the real circuits'
// approximate length, corner count/character, and elevation profile. They are
// hand-authored segment approximations, not exact geodata.

export const tracks: TrackDefinition[] = [
  { name: "Sprint 250m", type: "SPRINT", segments: [straight(250)] },
  { name: "Sprint 500m", type: "SPRINT", segments: [straight(500)] },
  { name: "Sprint 1000m", type: "SPRINT", segments: [straight(1000)] },
  { name: "Sprint 2000m", type: "SPRINT", segments: [straight(2000)] },

  {
    name: "Monza",
    type: "CIRCUIT",
    // ~5.8km, fast, only 11 corners, almost no elevation change
    segments: [
      straight(1150),
      corner(40, 25), // Variante del Rettifilo
      straight(300),
      corner(200, 180), // Curva Grande
      straight(400),
      corner(60, 30), // Variante della Roggia
      straight(700),
      corner(120, 90), // Lesmo 1
      straight(150),
      corner(100, 70), // Lesmo 2
      straight(950),
      corner(150, 60), // Ascari chicane
      straight(1150),
      corner(250, 200), // Parabolica
      straight(130),
    ],
  },

  {
    name: "Spa-Francorchamps",
    type: "CIRCUIT",
    // ~7km, ~19 corners, ~100m elevation change (Eau Rouge climb), long Kemmel straight
    segments: [
      straight(700),
      corner(35, 15, -2), // La Source
      straight(250, -6), // downhill toward Eau Rouge
      corner(180, 150, 12), // Eau Rouge / Raidillon compression, steep uphill
      straight(1700, 3), // Kemmel straight, gently uphill
      corner(90, 80), // Les Combes
      straight(300, -4),
      corner(60, 45), // Malmedy
      straight(500, -5), // downhill through Rivage sector
      corner(50, 30), // Rivage hairpin
      straight(900),
      corner(220, 170), // Pouhon
      straight(400),
      corner(70, 50), // Fagnes
      straight(350),
      corner(90, 70), // Stavelot
      straight(600, 4),
      corner(200, 180), // Blanchimont
      straight(200, 2),
      corner(45, 20), // Bus Stop chicane
      straight(65),
    ],
  },

  {
    name: "Monaco",
    type: "CIRCUIT",
    // ~3.3km, 19 corners, tightest/slowest track, short climb then descent to the harbor tunnel
    segments: [
      straight(400),
      corner(30, 20), // Sainte Devote
      straight(300, 8), // climb toward Massenet/Casino
      corner(40, 35, 6), // Massenet
      corner(35, 18), // Casino Square
      straight(150, -3),
      corner(30, 15), // Mirabeau
      corner(25, 12, -6), // Fairmont Hairpin
      straight(200, -4),
      corner(45, 30), // Portier
      straight(650), // the tunnel, flat and fast
      corner(60, 50), // Nouvelle Chicane
      straight(400),
      corner(50, 40), // Tabac
      straight(200),
      corner(30, 15), // Swimming Pool entry
      corner(35, 18), // Swimming Pool exit
      straight(200),
      corner(25, 12), // La Rascasse
      straight(100),
      corner(40, 25), // Anthony Noghes
      straight(250),
    ],
  },

  {
    name: "Pikes Peak Hillclimb",
    type: "CIRCUIT",
    // ~20km, ~156 corners, ~1440m total elevation gain - modeled as three climbing sectors
    // that get progressively tighter and steeper toward the summit.
    segments: [
      ...switchbacks(52, 60, 68, 40, 5), // lower / forest section
      ...switchbacks(52, 60, 68, 30, 7), // mid mountain section
      ...switchbacks(52, 60, 68, 22, 9), // upper / alpine section near the summit
    ],
  },
];
