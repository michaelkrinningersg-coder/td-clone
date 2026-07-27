import type { Segment, TrackDefinition, TurnDirection } from "@/lib/track-types";
import {
  polylineToSegments,
  startAtLongestStraight,
  type GradientBand,
  type Point,
} from "@/lib/track-polyline";
import {
  HUNGARORING_OUTLINE,
  INTERLAGOS_OUTLINE,
  MONACO_OUTLINE,
  MONZA_OUTLINE,
  SILVERSTONE_OUTLINE,
  SPA_FRANCORCHAMPS_OUTLINE,
  SUZUKA_OUTLINE,
} from "@/data/track-outlines";

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

/** Interlagos runs anticlockwise and drops into the Senna S before climbing all
 * the way back up to the line - about 40 m of it over a short lap. */
const INTERLAGOS_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.08, percent: -6 },
  { from: 0.08, to: 0.45, percent: -1 },
  { from: 0.45, to: 0.72, percent: 2 },
  { from: 0.72, to: 1, percent: 5 },
];

/** A slalom: one gate after another, nothing else.
 *
 * Power is worth almost nothing here - the car never gets near a speed where it
 * matters. What decides it is how much tyre is under how much car, which is
 * exactly what nothing else in the game asks. */
function slalom(gates: number, spacingM: number, radiusM: number): Segment[] {
  const segs: Segment[] = [straight(30)];
  for (let i = 0; i < gates; i++) {
    segs.push(corner(spacingM, radiusM, i % 2 === 0 ? "right" : "left"));
  }
  segs.push(straight(30));
  return segs;
}

/** Full throttle, one very tight hairpin, full throttle again. Top speed is
 * irrelevant on 800 m; what the stopwatch measures is how hard a car can brake
 * and how hard it can pull away again. */
function brakeTest(runupM: number, hairpinRadiusM: number): Segment[] {
  return [
    straight(runupM),
    corner(Math.PI * hairpinRadiusM, hairpinRadiusM, "right"),
    straight(runupM),
  ];
}

/** A closed handling course built from a lobed curve, so the radius is never
 * the same twice: hairpins where the lobes pinch, long sweepers where they open
 * out. Written as a formula rather than a list of corners because a closed
 * curve is closed by construction - the one thing hand-drawn circuits could
 * never manage - and the same curvature reading the real circuits go through
 * then finds the corners. */
function handlingCourse(lengthM: number, points = 400): [number, number][] {
  const raw: [number, number][] = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    const r = 1 + 0.42 * Math.sin(3 * a) + 0.16 * Math.sin(5 * a + 1.1);
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  let perimeter = 0;
  for (let i = 0; i < raw.length; i++) {
    const [ax, ay] = raw[i];
    const [bx, by] = raw[(i + 1) % raw.length];
    perimeter += Math.hypot(bx - ax, by - ay);
  }
  const scale = lengthM / perimeter;
  return raw.map(([x, y]) => [x * scale, y * scale]);
}

/** A ring of one constant radius. Nothing here but the corner: power decides
 * nothing, tyre width per tonne decides everything, and a 200 m radius is fast
 * enough that the quick cars are held by grip rather than by gearing. */
function circleOutline(radiusM: number, points = 360): [number, number][] {
  return Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    return [Math.cos(a) * radiusM, Math.sin(a) * radiusM] as [number, number];
  });
}

/** A superspeedway shape: three long straights joined by three wide turns, the
 * whole lap turning through 360 degrees so it closes by construction. The turns
 * are wide enough that only the fastest cars have to lift, which makes the lap
 * a question of power against drag with one grip check per corner.
 *
 * Banking is not modelled, so these turns are flat - a real trioval would carry
 * far more speed through them. */
function triovalOutline(lengthM: number, turnRadiusM: number, points = 600): [number, number][] {
  const turnArcM = (2 * Math.PI * turnRadiusM) / 3; // three 120-degree turns
  const straightM = (lengthM - 3 * turnArcM) / 3;
  if (straightM <= 0) throw new Error("trioval: turns alone are longer than the lap");

  const out: [number, number][] = [];
  const stepM = lengthM / points;
  let x = 0;
  let y = 0;
  let heading = 0;
  let leftInLeg = straightM;
  let onStraight = true;

  for (let i = 0; i < points; i++) {
    let remaining = stepM;
    while (remaining > 0) {
      const take = Math.min(remaining, leftInLeg);
      if (onStraight) {
        x += Math.cos(heading) * take;
        y += Math.sin(heading) * take;
      } else {
        heading += take / turnRadiusM; // arc length over radius is the angle
        x += Math.cos(heading) * take;
        y += Math.sin(heading) * take;
      }
      leftInLeg -= take;
      remaining -= take;
      if (leftInLeg <= 1e-9) {
        onStraight = !onStraight;
        leftInLeg = onStraight ? straightM : turnArcM;
      }
    }
    out.push([x, y]);
  }
  return out;
}

/** A tight city loop: the corner count is what is asked for, so the curve is
 * built from harmonics high enough to bend the road that often, then scaled to
 * the length. Like the handling course it is a formula, so it closes. */
function cityLoop(lengthM: number, points = 900): [number, number][] {
  const raw: [number, number][] = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    // Tuned to about sixteen corners per kilometre - a street circuit's density.
    const r = 1 + 0.1 * Math.sin(11 * a) + 0.055 * Math.sin(18 * a + 0.7) + 0.03 * Math.sin(25 * a + 2.1);
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  let perimeter = 0;
  for (let i = 0; i < raw.length; i++) {
    const [ax, ay] = raw[i];
    const [bx, by] = raw[(i + 1) % raw.length];
    perimeter += Math.hypot(bx - ax, by - ay);
  }
  const scale = lengthM / perimeter;
  return raw.map(([x, y]) => [x * scale, y * scale] as [number, number]);
}

/** Down a ten per cent slope, then a hairpin at the bottom of it. Gravity does
 * the accelerating, so what is measured is the brakes and the weight hanging on
 * them - the one test where a heavy car is punished twice. */
function downhillBrakeTest(runupM: number, hairpinRadiusM: number, gradientPercent: number): Segment[] {
  return [
    straight(runupM, gradientPercent),
    corner(Math.PI * hairpinRadiusM, hairpinRadiusM, "right", gradientPercent),
    straight(runupM / 3, gradientPercent),
  ];
}

export const tracks: TrackDefinition[] = [
  // A hundred metres is over before most cars are out of second: it asks about
  // traction and the first two gears, nothing else.
  { name: "Sprint 100m", type: "SPRINT", segments: [straight(100)] },
  { name: "Sprint 250m", type: "SPRINT", segments: [straight(250)] },
  { name: "Sprint 500m", type: "SPRINT", segments: [straight(500)] },
  { name: "Sprint 1000m", type: "SPRINT", segments: [straight(1000)] },
  { name: "Sprint 2000m", type: "SPRINT", segments: [straight(2000)] },
  { name: "Slalom 20 Tore", type: "SPRINT", segments: slalom(20, 20, 12) },
  { name: "Bremstest 200-0-200", type: "SPRINT", segments: brakeTest(800, 15) },
  { name: "Gefälle-Bremstest -10 %", type: "SPRINT", segments: downhillBrakeTest(900, 10, -10) },

  // Two runs against the speedometer rather than against a distance. The
  // segments only say how long the drawn line is; the clock stops at a speed.
  {
    name: "0-100-0 km/h",
    type: "SPRINT",
    // The length is nominal: what a car really covers is its own business, and
    // the drawn line is only there for the cars to run along.
    segments: [straight(250)],
    speedTest: { fromKph: 0, toKph: 100, brakeToStop: true, timeoutS: 120 },
  },
  {
    name: "Rollstart 50-100 km/h",
    type: "SPRINT",
    segments: [straight(250)],
    speedTest: { fromKph: 50, toKph: 100, brakeToStop: false, timeoutS: 120 },
  },

  circuit("Monza", MONZA_OUTLINE),
  circuit("Spa-Francorchamps", SPA_FRANCORCHAMPS_OUTLINE, SPA_GRADIENTS),
  circuit("Monaco", MONACO_OUTLINE, MONACO_GRADIENTS),
  circuit("Suzuka", SUZUKA_OUTLINE),
  circuit("Silverstone", SILVERSTONE_OUTLINE),
  circuit("Hungaroring", HUNGARORING_OUTLINE),
  circuit("Interlagos", INTERLAGOS_OUTLINE, INTERLAGOS_GRADIENTS),
  circuit("Handlingkurs", handlingCourse(2000)),
  circuit("Kreisbahn 200 m", circleOutline(200)),
  circuit("Stadtkurs eng", cityLoop(2500)),
  circuit("Trioval 4500 m", triovalOutline(4500, 300)),

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
