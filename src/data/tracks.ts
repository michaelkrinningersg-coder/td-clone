import type { Segment, TrackDefinition, TurnDirection } from "@/lib/track-types";

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

// All circuits below are loosely modeled on public knowledge of the real tracks'
// approximate length, corner sequence/character, turn directions and elevation
// profile. They are hand-authored approximations, not exact geodata - the drawn
// outline is a likeness, and a lap will not close perfectly back on itself.

export const tracks: TrackDefinition[] = [
  { name: "Sprint 250m", type: "SPRINT", segments: [straight(250)] },
  { name: "Sprint 500m", type: "SPRINT", segments: [straight(500)] },
  { name: "Sprint 1000m", type: "SPRINT", segments: [straight(1000)] },
  { name: "Sprint 2000m", type: "SPRINT", segments: [straight(2000)] },

  {
    name: "Monza",
    type: "CIRCUIT",
    // ~5.8km, fast, only 11 corners, almost no elevation change. Runs clockwise.
    segments: [
      straight(1150),
      corner(20, 25, "right"), // Variante del Rettifilo, part 1
      corner(20, 25, "left"), // Variante del Rettifilo, part 2
      straight(300),
      corner(200, 180, "right"), // Curva Grande
      straight(400),
      corner(30, 30, "left"), // Variante della Roggia, part 1
      corner(30, 30, "right"), // Variante della Roggia, part 2
      straight(700),
      corner(120, 90, "right"), // Lesmo 1
      straight(150),
      corner(100, 70, "right"), // Lesmo 2
      straight(950),
      corner(50, 60, "left"), // Variante Ascari, part 1
      corner(50, 60, "right"), // Variante Ascari, part 2
      corner(50, 60, "left"), // Variante Ascari, part 3
      straight(1150),
      corner(250, 200, "right"), // Parabolica
      straight(130),
    ],
  },

  {
    name: "Spa-Francorchamps",
    type: "CIRCUIT",
    // ~7km, ~19 corners, ~100m elevation change (Eau Rouge climb), long Kemmel
    // straight. Runs clockwise.
    segments: [
      straight(700),
      corner(35, 15, "right", -2), // La Source hairpin
      straight(250, -6), // downhill toward Eau Rouge
      corner(90, 150, "left", 12), // Eau Rouge, steep uphill
      corner(90, 150, "right", 12), // Raidillon
      straight(1700, 3), // Kemmel straight, gently uphill
      corner(90, 80, "right"), // Les Combes
      straight(300, -4),
      corner(60, 45, "right"), // Malmedy
      straight(500, -5), // downhill toward Rivage
      corner(50, 30, "right"), // Rivage hairpin
      straight(900),
      corner(220, 170, "left"), // Pouhon
      straight(400),
      corner(35, 50, "right"), // Fagnes, part 1
      corner(35, 50, "left"), // Fagnes, part 2
      straight(350),
      corner(90, 70, "right"), // Stavelot
      straight(600, 4),
      corner(200, 180, "left"), // Blanchimont
      straight(200, 2),
      corner(22, 20, "right"), // Bus Stop chicane, part 1
      corner(23, 20, "left"), // Bus Stop chicane, part 2
      straight(65),
    ],
  },

  {
    name: "Monaco",
    type: "CIRCUIT",
    // ~3.3km, 19 corners, the tightest and slowest track. Runs clockwise, which
    // is why almost every corner is a right-hander. Climbs to Casino, then drops
    // back down to the harbour tunnel.
    segments: [
      straight(400),
      corner(30, 20, "right"), // Sainte Devote
      straight(300, 8), // climb up Beau Rivage
      corner(40, 35, "left", 6), // Massenet
      corner(35, 18, "right"), // Casino Square
      straight(150, -3),
      corner(30, 15, "right"), // Mirabeau
      corner(25, 12, "right", -6), // Fairmont Hairpin
      straight(200, -4),
      corner(45, 30, "right"), // Portier
      straight(650), // the tunnel, flat and fast
      corner(30, 50, "right"), // Nouvelle Chicane, part 1
      corner(30, 50, "left"), // Nouvelle Chicane, part 2
      straight(400),
      corner(50, 40, "left"), // Tabac
      straight(200),
      corner(30, 15, "left"), // Swimming Pool entry
      corner(35, 18, "right"), // Swimming Pool exit
      straight(200),
      corner(25, 12, "right"), // La Rascasse
      straight(100),
      corner(40, 25, "right"), // Anthony Noghes
      straight(250),
    ],
  },

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
