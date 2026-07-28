import type { Segment, TrackDefinition, TurnDirection } from "@/lib/track-types";
import {
  polylineToSegments,
  startAtLongestStraight,
  type GradientBand,
  type Point,
} from "@/lib/track-polyline";
import {
  AUSTIN_OUTLINE,
  BAHRAIN_OUTLINE,
  BAKU_OUTLINE,
  BARCELONA_OUTLINE,
  BRANDS_HATCH_OUTLINE,
  BUENOS_AIRES_OUTLINE,
  DAYTONA_OUTLINE,
  ESTORIL_OUTLINE,
  FUJI_OUTLINE,
  HOCKENHEIM_OUTLINE,
  HUNGARORING_OUTLINE,
  IMOLA_OUTLINE,
  INDIANAPOLIS_OUTLINE,
  INDIANAPOLIS_OVAL_OUTLINE,
  INTERLAGOS_OUTLINE,
  ISTANBUL_OUTLINE,
  JACAREPAGUA_OUTLINE,
  JEDDAH_OUTLINE,
  KYALAMI_OUTLINE,
  LAGUNA_SECA_OUTLINE,
  LAS_VEGAS_OUTLINE,
  LIME_ROCK_OUTLINE,
  LONG_BEACH_OUTLINE,
  LOSAIL_OUTLINE,
  MADRID_OUTLINE,
  MAGNY_COURS_OUTLINE,
  MELBOURNE_OUTLINE,
  MEXIKO_OUTLINE,
  MIAMI_OUTLINE,
  MONACO_OUTLINE,
  MOSCOW_RACEWAY_OUTLINE,
  MOSPORT_OUTLINE,
  MONTREAL_OUTLINE,
  MONZA_OUTLINE,
  MUGELLO_OUTLINE,
  NORISRING_OUTLINE,
  NUERBURGRING_OUTLINE,
  OSCHERSLEBEN_OUTLINE,
  PAUL_RICARD_OUTLINE,
  PORTIMAO_OUTLINE,
  RED_BULL_RING_OUTLINE,
  ROAD_AMERICA_OUTLINE,
  ROAD_ATLANTA_OUTLINE,
  SEBRING_OUTLINE,
  SEPANG_OUTLINE,
  SHANGHAI_OUTLINE,
  SILVERSTONE_OUTLINE,
  SINGAPUR_OUTLINE,
  SOCHI_OUTLINE,
  SPA_FRANCORCHAMPS_OUTLINE,
  SUZUKA_OUTLINE,
  VIRGINIA_OUTLINE,
  WATKINS_GLEN_OUTLINE,
  YAS_MARINA_OUTLINE,
  ZANDVOORT_OUTLINE,
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

/** The Red Bull Ring is a hill: up from turn one to the Remus hairpin, along
 * the top, then all the way back down to the line. About 65 m of it. */
const RED_BULL_RING_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.1, percent: 2 },
  { from: 0.1, to: 0.3, percent: 9 },
  { from: 0.3, to: 0.5, percent: 3 },
  { from: 0.5, to: 0.75, percent: -5 },
  { from: 0.75, to: 1, percent: -4 },
];

/** Austin climbs about 40 m straight up to the blind turn one and gives it all
 * back through the esses and the run to the back straight. */
const AUSTIN_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.08, percent: 11 },
  { from: 0.08, to: 0.2, percent: -6 },
  { from: 0.2, to: 0.45, percent: -1 },
  { from: 0.45, to: 0.7, percent: 2 },
  { from: 0.7, to: 1, percent: -1 },
];

/** Imola runs uphill from Tosa to Piratella, drops through Acque Minerali and
 * climbs back to the line - some 40 m either way. */
const IMOLA_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.25, percent: -2 },
  { from: 0.25, to: 0.45, percent: 6 },
  { from: 0.45, to: 0.6, percent: -5 },
  { from: 0.6, to: 0.8, percent: 4 },
  { from: 0.8, to: 1, percent: -2 },
];

/** Mugello sits in the Tuscan hills: down from the line to San Donato, along
 * the valley, then the long climb back up through the Arrabbiatas. */
const MUGELLO_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.12, percent: -4 },
  { from: 0.12, to: 0.4, percent: 2 },
  { from: 0.4, to: 0.7, percent: 5 },
  { from: 0.7, to: 0.85, percent: -3 },
  { from: 0.85, to: 1, percent: -2 },
];

/** Zandvoort runs through dunes; the banked Hugenholtz and Arie Luyendyk are
 * the high points. Banking is not modelled, only the climb. */
const ZANDVOORT_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.15, percent: 3 },
  { from: 0.15, to: 0.4, percent: -2 },
  { from: 0.4, to: 0.75, percent: 2 },
  { from: 0.75, to: 1, percent: -2 },
];

/** Portimão is the roller coaster of the calendar: blind crests, a plunge to
 * the bottom of the valley and a long climb back to the line, about 40 m. */
const PORTIMAO_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.12, percent: -5 },
  { from: 0.12, to: 0.3, percent: 6 },
  { from: 0.3, to: 0.5, percent: -7 },
  { from: 0.5, to: 0.72, percent: 5 },
  { from: 0.72, to: 0.88, percent: -6 },
  { from: 0.88, to: 1, percent: 7 },
];

/** The Nürburgring's GP circuit - not the Nordschleife - climbs out of the
 * Mercedes-Arena and drops back down through the Veedol chicane. */
const NUERBURGRING_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.15, percent: -3 },
  { from: 0.15, to: 0.45, percent: 5 },
  { from: 0.45, to: 0.7, percent: 2 },
  { from: 0.7, to: 1, percent: -3 },
];

/** Watkins Glen runs up the hill through the esses and back down the boot. */
const WATKINS_GLEN_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.2, percent: 4 },
  { from: 0.2, to: 0.45, percent: 6 },
  { from: 0.45, to: 0.75, percent: -4 },
  { from: 0.75, to: 1, percent: -3 },
];

/** Kyalami climbs all the way up the back to Leeukop and drops down the
 * main straight - the reason the old circuit was known for its long haul. */
const KYALAMI_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.15, percent: -4 },
  { from: 0.15, to: 0.55, percent: 3 },
  { from: 0.55, to: 0.8, percent: 6 },
  { from: 0.8, to: 1, percent: -5 },
];

/** Istanbul drops away downhill into the quadruple-apex turn eight and climbs
 * back to the line. */
const ISTANBUL_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.1, percent: -6 },
  { from: 0.1, to: 0.35, percent: 3 },
  { from: 0.35, to: 0.6, percent: -4 },
  { from: 0.6, to: 0.85, percent: 4 },
  { from: 0.85, to: 1, percent: 2 },
];

/** Laguna Seca climbs from the line to the top of the hill at turn six and then
 * throws it all away at once: the Corkscrew drops about 18 m in 140 m, which is
 * the steepest thing in the game outside Pikes Peak. */
const LAGUNA_SECA_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.15, percent: 3 },
  { from: 0.15, to: 0.4, percent: 5 },
  { from: 0.4, to: 0.55, percent: 4 },
  { from: 0.55, to: 0.65, percent: -13 },
  { from: 0.65, to: 0.85, percent: -5 },
  { from: 0.85, to: 1, percent: -1 },
];

/** Road Atlanta drops away from the line, climbs the esses, and falls into the
 * bridge before the long haul back up. */
const ROAD_ATLANTA_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.12, percent: -3 },
  { from: 0.12, to: 0.35, percent: 5 },
  { from: 0.35, to: 0.6, percent: -2 },
  { from: 0.6, to: 0.8, percent: -6 },
  { from: 0.8, to: 1, percent: 6 },
];

/** Virginia rolls the whole way round - roughly 40 m between its lowest and
 * highest points, and never flat for long. */
const VIRGINIA_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.2, percent: 3 },
  { from: 0.2, to: 0.45, percent: -4 },
  { from: 0.45, to: 0.7, percent: 4 },
  { from: 0.7, to: 0.85, percent: -5 },
  { from: 0.85, to: 1, percent: 2 },
];

/** Mosport falls away from turn one, climbs the back of the circuit and drops
 * again down to Moss Corner and onto the long straight. */
const MOSPORT_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.15, percent: -4 },
  { from: 0.15, to: 0.45, percent: 5 },
  { from: 0.45, to: 0.65, percent: -2 },
  { from: 0.65, to: 0.85, percent: -6 },
  { from: 0.85, to: 1, percent: 4 },
];

/** Brands Hatch drops off the end of the pit straight into Paddock Hill Bend,
 * climbs to Druids, and rolls through the Grand Prix loop behind it. */
const BRANDS_HATCH_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.08, percent: -10 },
  { from: 0.08, to: 0.15, percent: 8 },
  { from: 0.15, to: 0.25, percent: -5 },
  { from: 0.25, to: 0.45, percent: 3 },
  { from: 0.45, to: 0.7, percent: -3 },
  { from: 0.7, to: 0.85, percent: 4 },
  { from: 0.85, to: 1, percent: -2 },
];

/** Road America runs over Wisconsin hills: up to the Moraine Sweep, down the
 * back and up again to Canada Corner. */
const ROAD_AMERICA_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.2, percent: 2 },
  { from: 0.2, to: 0.4, percent: 4 },
  { from: 0.4, to: 0.6, percent: -3 },
  { from: 0.6, to: 0.8, percent: 3 },
  { from: 0.8, to: 1, percent: -4 },
];

/** Lime Rock names two of its corners after the hill: the Uphill and, right
 * after it, the Downhill. */
const LIME_ROCK_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.3, percent: -2 },
  { from: 0.3, to: 0.5, percent: 4 },
  { from: 0.5, to: 0.7, percent: 6 },
  { from: 0.7, to: 0.9, percent: -6 },
  { from: 0.9, to: 1, percent: -2 },
];

/** Fuji rises and falls about 40 m over a lap, most of it in the middle
 * sector; the bands are that overall shape rather than corner by corner. */
const FUJI_GRADIENTS: GradientBand[] = [
  { from: 0, to: 0.25, percent: -2 },
  { from: 0.25, to: 0.5, percent: 4 },
  { from: 0.5, to: 0.7, percent: 2 },
  { from: 0.7, to: 0.9, percent: -4 },
  { from: 0.9, to: 1, percent: -2 },
];

/** Height above sea level in metres, for the circuits high enough to matter.
 *
 * Set by hand for the same reason the gradients are: OpenStreetMap carries no
 * heights, and Mexiko-Stadt on sea-level air would be a different circuit - it
 * sits on four fifths of it. Everything left out runs at sea level, which below
 * about 200 m is worth well under two percent of the air either way. */
const ALTITUDE_M: Record<string, number> = {
  "Mexiko-Stadt": 2232,
  "Kyalami": 1753,
  "Interlagos": 785,
  "Red Bull Ring": 677,
  "Las Vegas": 620,
  "Madrid": 600,
  "Fuji": 580,
  "Nürburgring GP": 570,
  "Watkins Glen": 500,
  "Spa-Francorchamps": 400,
  "Paul Ricard": 400,
  "Mosport": 350,
  "Laguna Seca": 300,
  "Road Atlanta": 300,
  "Norisring": 300,
  "Road America": 280,
  "Hungaroring": 250,
  "Magny-Cours": 230,
  "Indianapolis": 220,
  "Indianapolis Oval": 220,
  "Virginia International": 190,
  "Moscow Raceway": 180,
  "Monza": 162,
  "Silverstone": 150,
  "Estoril": 150,
  "Lime Rock Park": 150,
  // Below sea level, so the air is thicker than anywhere else on the calendar.
  "Baku": -25,
};

/** How far the turns are tipped into the corner, in degrees.
 *
 * Only the ovals have any: a road circuit is flat to within a degree or two,
 * and the surveyed centrelines carry no camber anyway. Indianapolis runs
 * 9°12' through all four turns, which is the published figure; the trioval is
 * ours to design, and twelve degrees is the shallow end of what a real
 * superspeedway carries. Every corner on those laps is a banked one, so it goes
 * on the track rather than on individual turns. */
const BANKING_DEGREES: Record<string, number> = {
  "Indianapolis Oval": 9.2,
  "Trioval 4500 m": 12,
};

function circuit(name: string, outline: [number, number][], gradients?: GradientBand[]): TrackDefinition {
  const options = { gradients };
  // The surveyed way starts wherever the mapper began drawing, which is rarely
  // the start line; every one of these has its line on the longest straight.
  const fromLine = startAtLongestStraight(outline as Point[], options);
  const banking = BANKING_DEGREES[name];
  const segments = polylineToSegments(fromLine, options).map((seg) =>
    banking && seg.kind === "corner" ? { ...seg, bankingDegrees: banking } : seg,
  );
  return {
    name,
    type: "CIRCUIT",
    segments,
    outline: fromLine as [number, number][],
    altitudeM: ALTITUDE_M[name],
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
 * The turns are banked twelve degrees (see BANKING_DEGREES), which is what
 * keeps them from being the slow part of the lap. */
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
  circuit("Montreal", MONTREAL_OUTLINE),
  circuit("Red Bull Ring", RED_BULL_RING_OUTLINE, RED_BULL_RING_GRADIENTS),
  circuit("Zandvoort", ZANDVOORT_OUTLINE, ZANDVOORT_GRADIENTS),
  circuit("Baku", BAKU_OUTLINE),
  circuit("Austin", AUSTIN_OUTLINE, AUSTIN_GRADIENTS),
  circuit("Imola", IMOLA_OUTLINE, IMOLA_GRADIENTS),
  circuit("Singapur", SINGAPUR_OUTLINE),
  circuit("Mugello", MUGELLO_OUTLINE, MUGELLO_GRADIENTS),
  circuit("Jeddah", JEDDAH_OUTLINE),
  circuit("Mexiko-Stadt", MEXIKO_OUTLINE),
  circuit("Bahrain", BAHRAIN_OUTLINE),
  circuit("Shanghai", SHANGHAI_OUTLINE),
  circuit("Istanbul", ISTANBUL_OUTLINE, ISTANBUL_GRADIENTS),
  circuit("Sepang", SEPANG_OUTLINE),
  circuit("Melbourne", MELBOURNE_OUTLINE),
  circuit("Portimão", PORTIMAO_OUTLINE, PORTIMAO_GRADIENTS),
  circuit("Barcelona", BARCELONA_OUTLINE),
  circuit("Hockenheim", HOCKENHEIM_OUTLINE),
  circuit("Nürburgring GP", NUERBURGRING_OUTLINE, NUERBURGRING_GRADIENTS),
  circuit("Yas Marina", YAS_MARINA_OUTLINE),
  circuit("Paul Ricard", PAUL_RICARD_OUTLINE),
  circuit("Las Vegas", LAS_VEGAS_OUTLINE),
  circuit("Watkins Glen", WATKINS_GLEN_OUTLINE, WATKINS_GLEN_GRADIENTS),
  circuit("Indianapolis", INDIANAPOLIS_OUTLINE),
  circuit("Kyalami", KYALAMI_OUTLINE, KYALAMI_GRADIENTS),
  circuit("Estoril", ESTORIL_OUTLINE),
  circuit("Magny-Cours", MAGNY_COURS_OUTLINE),
  circuit("Losail", LOSAIL_OUTLINE),
  circuit("Miami", MIAMI_OUTLINE),
  circuit("Sochi", SOCHI_OUTLINE),
  circuit("Madrid", MADRID_OUTLINE),
  circuit("Buenos Aires", BUENOS_AIRES_OUTLINE),
  circuit("Jacarepaguá", JACAREPAGUA_OUTLINE),

  // Outside Formula 1: American road courses, the DTM circuits and one oval.
  circuit("Lime Rock Park", LIME_ROCK_OUTLINE, LIME_ROCK_GRADIENTS),
  circuit("Long Beach", LONG_BEACH_OUTLINE),
  circuit("Laguna Seca", LAGUNA_SECA_OUTLINE, LAGUNA_SECA_GRADIENTS),
  circuit("Mosport", MOSPORT_OUTLINE, MOSPORT_GRADIENTS),
  circuit("Road Atlanta", ROAD_ATLANTA_OUTLINE, ROAD_ATLANTA_GRADIENTS),
  circuit("Fuji", FUJI_OUTLINE, FUJI_GRADIENTS),
  circuit("Virginia International", VIRGINIA_OUTLINE, VIRGINIA_GRADIENTS),
  circuit("Daytona Rundkurs", DAYTONA_OUTLINE),
  circuit("Sebring", SEBRING_OUTLINE),
  circuit("Road America", ROAD_AMERICA_OUTLINE, ROAD_AMERICA_GRADIENTS),
  circuit("Brands Hatch", BRANDS_HATCH_OUTLINE, BRANDS_HATCH_GRADIENTS),
  circuit("Norisring", NORISRING_OUTLINE),
  circuit("Oschersleben", OSCHERSLEBEN_OUTLINE),
  circuit("Moscow Raceway", MOSCOW_RACEWAY_OUTLINE),
  circuit("Indianapolis Oval", INDIANAPOLIS_OVAL_OUTLINE),
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
    // Starts at 2.862 m and finishes at 4.302 m. The mean is what the car
    // breathes over the run, and it is thinner than anywhere else in the game:
    // barely two thirds of the air at Monza.
    altitudeM: 3580,
  },
];
