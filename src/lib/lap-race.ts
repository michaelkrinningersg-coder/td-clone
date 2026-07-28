import type { CarData, TrackData } from "@/lib/data";
import {
  altitudeModifiers,
  brakingDecelMps2,
  simulateRun,
  solveLaunchGrip,
  buildGearbox,
} from "@/lib/physics";

/** A race over a distance rather than a lap: two hundred and fifty kilometres
 * of a circuit, with tyres that go off, stops to change them, a driver who is
 * not perfect twice in a row - and, unlike anywhere else in the game, other
 * cars in the way.
 *
 * Everything here is deliberately outside the lap-time model. A lap on the
 * leaderboards is one clean lap by a machine; this is a race, and a race has
 * luck and traffic in it. That is also why nothing from here is written to the
 * boards.
 *
 * The whole field is run together, lap by lap, because that is the only way a
 * car can be held up by the one in front. Every lap: each car's own time is
 * worked out, the order is read off the clock, and then from the front
 * backwards each car is either let past the one ahead or stuck behind it. */

/** The distance every race runs to. Whole laps, so the flag falls where the
 * lap ends rather than in the middle of a straight. */
export const RACE_DISTANCE_M = 250_000;

/** Cars on the grid. Twenty-eight is the biggest field anybody has to watch. */
export const MAX_RACE_CARS = 28;

/** Time lost changing tyres, from pit entry to pit exit. */
export const PIT_LOSS_MS = 25_000;

// ---------------------------------------------------------------- tyres

/** A set of tyres lasts this share of the race - the gentlest car on its tyres
 * at the top of the range, the hardest at the bottom. Written as a share of the
 * race rather than in kilometres on purpose: it is what decides whether a stop
 * is one or two, and that question should read the same on every circuit.
 *
 * Even the longest-lasting set does not see the flag, so every car stops. */
const TYRE_LIFE_MIN = 0.6;
const TYRE_LIFE_MAX = 0.85;

/** A tyre is not at its best when it is new. It comes to the front after about
 * a sixth of its life and then goes away - slowly at first and then all at
 * once, which is what makes a stop worth its twenty-five seconds. */
const TYRE_PEAK_AT = 0.15;
const TYRE_NEW_LOSS = 0.015;
/** Grip given away by the time a set has done its life. */
const TYRE_SPENT_LOSS = 0.18;
/** Nothing gets worse than this, however far past its life a set is run. */
const TYRE_MAX_LOSS = 0.4;

/** Which axle does the work. A front-driven car puts the power, the braking and
 * most of the steering through the front tyres and eats them; a rear-driven one
 * wears the rears; four-wheel drive shares it out and gets the most out of a
 * set. Both axles are changed at a stop, so what limits a stint is whichever
 * axle goes first. */
const AXLE_WEAR: Record<string, { front: number; rear: number }> = {
  FWD: { front: 1.35, rear: 0.75 },
  RWD: { front: 0.8, rear: 1.3 },
  AWD: { front: 1.05, rear: 1.05 },
};

/** Tread per tonne an ordinary car carries; the tyre life is measured against
 * it, so a heavy car on narrow tyres gets through a set far quicker. */
const REFERENCE_TYRE_MM_PER_TONNE = 600;
const REFERENCE_CORNER_SHARE = 0.5;

// ------------------------------------------------------------ pit stops

/** How far off the pit wall's own answer a stop actually happens. */
const PIT_WINDOW_LAPS = 4;
/** How far a car's own appetite for risk moves its stop: an aggressive car
 * comes in early for the undercut, a patient one stays out. */
const RISK_LAPS = 3;
/** A stop that goes wrong: a wheel that will not come off, a car released into
 * someone. Rare, expensive, and the reason a race is not arithmetic. */
const PIT_BOTCH_CHANCE = 0.04;
const PIT_BOTCH_MIN_MS = 3_000;
const PIT_BOTCH_MAX_MS = 8_000;

// -------------------------------------------------------------- the lap

/** The circuit rubbers in as the race goes on: by the flag the surface is worth
 * this much lap time to everybody. */
const EVOLUTION_GAIN = 0.015;
/** The first lap of the race is on cold tyres and a cold brake - nobody's
 * quickest lap is their first. */
const COLD_FIRST_LAP = 0.02;
/** And the lap out of the pits, which starts at pit-exit speed on a set that
 * has not been up to temperature since the last stop. */
const OUT_LAP_LOSS = 0.015;

/** Chance per lap of a mistake, on a circuit that is half corners and with
 * ordinary brakes. A mistake costs a tenth of the grip for that lap. */
const ERROR_CHANCE = 0.03;
const ERROR_GRIP_LOSS = 0.1;
const REFERENCE_DECEL_MPS2 = 10.3; // about 1.05 g, a car on good discs

/** How much power a car is down on any given lap, and for the whole race. */
const LAP_POWER_SPREAD = 0.02;
const RACE_FORM_SPREAD = 0.02;
/** And on its one lap in qualifying, where there is no second chance. */
const QUALIFYING_SPREAD = 0.03;

/** Grid slots are half a second apart, which is what a car starting eighth
 * gives away before anybody has turned a wheel. */
const GRID_GAP_MS = 400;

// ------------------------------------------------------------- traffic

/** Close enough to be in the wake of the car ahead. */
const TOW_WINDOW_MS = 1_500;
/** How much of its drag a car sheds tucked in behind another. */
const TOW_DRAG_RELIEF = 0.25;
/** And how much grip it gives up in the corners for the privilege. */
const DIRTY_AIR_GRIP_LOSS = 0.05;
/** Two cars cannot occupy the same piece of road. */
const MIN_GAP_MS = 300;
/** The pace advantage a car needs to get past on a circuit with an ordinary
 * straight. Scaled by the longest straight the circuit has. */
const OVERTAKE_BASE = 0.004;
const REFERENCE_STRAIGHT_M = 800;

// --------------------------------------------------------- safety car

/** Share of mistakes that are more than a moment: a car in the wall, and the
 * safety car out. Small, because a mistake is common and a safety car should
 * not be - a field of twenty-eight round Monaco makes some two thousand
 * mistakes in a race, and one or two of them should end in the wall. */
const SAFETY_CAR_PER_ERROR = 0.008;
const SAFETY_CAR_LAPS = 3;
/** Everybody circulates at the safety car's pace. */
const SAFETY_CAR_LAP_FACTOR = 1.4;
/** A stop behind the safety car is half price, because the whole field is
 * crawling while you do it. */
const SAFETY_CAR_PIT_FACTOR = 0.5;
/** Bumper to bumper again when it comes in. */
const BUNCH_GAP_MS = 1_200;

/** Whole laps that make up the race distance. */
export function lapsFor(trackLengthM: number): number {
  return Math.max(1, Math.round(RACE_DISTANCE_M / trackLengthM));
}

/** The share of a lap spent in corners, which is the share of it spent at the
 * limit - and so what decides how hard a circuit is on tyres. */
export function cornerShare(track: Pick<TrackData, "segments" | "lengthM">): number {
  const cornerM = track.segments
    .filter((s) => s.kind === "corner")
    .reduce((sum, s) => sum + s.lengthM, 0);
  return track.lengthM > 0 ? cornerM / track.lengthM : 0;
}

export interface TrackTraits {
  cornerShare: number;
  /** Share of the lap on a straight, where a tow is worth something. */
  straightShare: number;
  longestStraightM: number;
  /** Relative pace advantage a car needs to get past here. */
  overtakeThreshold: number;
}

/** What a circuit does to a race, read off its own geometry rather than
 * assigned: how much of it is corner, how much is straight, and how long the
 * longest straight is - which is the whole story of whether anybody can pass. */
export function trackTraits(track: Pick<TrackData, "segments" | "lengthM">): TrackTraits {
  const straights = track.segments.filter((s) => s.kind === "straight");
  const straightM = straights.reduce((sum, s) => sum + s.lengthM, 0);
  const longestStraightM = straights.length > 0 ? Math.max(...straights.map((s) => s.lengthM)) : 0;
  // A long straight makes passing easy, a lap of corners makes it nearly
  // impossible: Monza asks for a third of a per cent, Monaco for nearer two.
  const ease = Math.min(1.5, Math.max(0.2, longestStraightM / REFERENCE_STRAIGHT_M));
  return {
    cornerShare: cornerShare(track),
    straightShare: track.lengthM > 0 ? straightM / track.lengthM : 0,
    longestStraightM,
    overtakeThreshold: OVERTAKE_BASE / ease,
  };
}

/** Everything about one car on one circuit that does not change from lap to
 * lap: how quick it is, what a lost tenth of grip, of power or of drag is worth
 * to it, how fast it uses its tyres and how likely it is to get it wrong.
 *
 * The sensitivities come from four runs - clean, a tenth down on grip, a tenth
 * down on power, a quarter off the drag - and are read off linearly in between.
 * A lap simulated afresh for every one of fifty laps and twenty-eight cars
 * would be fourteen hundred runs, and the curve is close enough to straight
 * over the few per cent that are ever in play. */
export interface CarPace {
  carId: string;
  baseLapMs: number;
  /** Extra lap time as a share, per unit of grip lost. */
  gripSensitivity: number;
  /** Extra lap time as a share, per unit of power lost. */
  powerSensitivity: number;
  /** Lap time saved as a share, per unit of drag removed - what a tow is worth
   * to this particular car. A brick gains; something slippery barely notices. */
  towSensitivity: number;
  /** Share of the race one set of tyres lasts, between 0.6 and 0.85. */
  tyreLifeShare: number;
  /** How much faster each axle uses its share of that life. */
  axleWear: { front: number; rear: number };
  errorChance: number;
}

/** What is left of a set of tyres that has used `used` of its life, 1 being a
 * set at its best rather than a set that is new. */
export function tyreGrip(used: number): number {
  if (used < TYRE_PEAK_AT) {
    // Coming in: a new set is a little off and warms up to its peak.
    return 1 - TYRE_NEW_LOSS * (1 - used / TYRE_PEAK_AT);
  }
  const past = (used - TYRE_PEAK_AT) / (1 - TYRE_PEAK_AT);
  // Squared, so the first half of a stint costs almost nothing and the last
  // laps cost most of it.
  return 1 - Math.min(TYRE_MAX_LOSS, TYRE_SPENT_LOSS * past * past);
}

export function carPace(car: CarData, track: TrackData): CarPace {
  const launchGrip = solveLaunchGrip(car, buildGearbox(car));
  // The circuit's own air multiplies into whatever the race is doing to the
  // car, rather than replacing it - a lap in the tow at Mexiko-Stadt is both.
  const air = altitudeModifiers(car, track.altitudeM);
  const run = (mods: { powerFactor?: number; gripFactor?: number; dragFactor?: number }) =>
    simulateRun(car, track.segments, {
      launchGrip,
      ...mods,
      powerFactor: (mods.powerFactor ?? 1) * air.powerFactor,
      dragFactor: (mods.dragFactor ?? 1) * air.dragFactor,
    }).totalTimeMs;
  const base = run({});
  const lowGrip = run({ gripFactor: 0.9 });
  const lowPower = run({ powerFactor: 0.9 });
  const inTow = run({ dragFactor: 1 - TOW_DRAG_RELIEF });

  const share = cornerShare(track);
  const tyreMmPerTonne = (car.tyreWidthMm * 4) / (car.weightKg / 1000);
  const load = Math.min(2, Math.max(0.6, REFERENCE_TYRE_MM_PER_TONNE / tyreMmPerTonne));
  const brakes = Math.min(1.4, Math.max(0.8, REFERENCE_DECEL_MPS2 / brakingDecelMps2(car)));

  // How hard this car works its tyres on this circuit. The car decides most of
  // it - the weight it hangs on however much rubber it has - and the circuit
  // shifts it, because a lap that is mostly corner is a lap mostly spent
  // leaning on them. Normalised over what road cars actually carry: about
  // 750 mm of tread per tonne at the gentle end, half that at the hard end.
  const carScore = Math.min(1, Math.max(0, (load - 0.75) / 0.75));
  const severity = 0.7 * carScore + 0.3 * share;

  return {
    carId: car.id,
    baseLapMs: base,
    gripSensitivity: (lowGrip - base) / base / 0.1,
    powerSensitivity: (lowPower - base) / base / 0.1,
    towSensitivity: (base - inTow) / base / TOW_DRAG_RELIEF,
    tyreLifeShare: Math.min(
      TYRE_LIFE_MAX,
      Math.max(TYRE_LIFE_MIN, TYRE_LIFE_MAX - severity * (TYRE_LIFE_MAX - TYRE_LIFE_MIN)),
    ),
    axleWear: AXLE_WEAR[car.drivetrain] ?? AXLE_WEAR.AWD,
    // More corners is more opportunity; weaker brakes is a later braking point
    // guessed at rather than known.
    errorChance: ERROR_CHANCE * (share / REFERENCE_CORNER_SHARE) * brakes,
  };
}

/** How worn a set is: whichever axle has done more of its share, because both
 * are changed together and the worse one is what the driver feels. */
export function tyreUsedAfter(pace: CarPace, lapsOnSet: number, lapCount: number): number {
  const lifeLaps = Math.max(1, pace.tyreLifeShare * lapCount);
  return (lapsOnSet / lifeLaps) * Math.max(pace.axleWear.front, pace.axleWear.rear);
}

/** What a plan costs in tyre time and pit time, in milliseconds. Everything
 * the strategy call is decided on. */
export function strategyCostMs(pace: CarPace, lapCount: number, stopLaps: readonly number[]): number {
  let onSet = 0;
  let cost = 0;
  for (let lap = 1; lap <= lapCount; lap++) {
    cost += pace.baseLapMs * pace.gripSensitivity * (1 - tyreGrip(tyreUsedAfter(pace, onSet, lapCount)));
    if (stopLaps.includes(lap) && lap < lapCount) {
      // The pit lane, and the lap after it on tyres that are not up to
      // temperature - both are what a stop costs.
      cost += PIT_LOSS_MS + pace.baseLapMs * OUT_LAP_LOSS;
      onSet = 0;
    } else {
      onSet++;
    }
  }
  return cost;
}

/** Evenly spaced stops, which is the right shape when the penalty for worn
 * tyres grows the way it does: equal stints share the pain out. */
function evenStops(lapCount: number, stops: number): number[] {
  return Array.from({ length: stops }, (_, i) => Math.round(((i + 1) * lapCount) / (stops + 1)));
}

/** The pit wall's answer: one stop or two, whichever the car is quicker with.
 *
 * Never none - no set of tyres lasts a race - and never three, which is a
 * minute of pit lane no tyre saving pays back. A car that leans hard on its
 * tyres and loses a lot of lap time when they go finds two stops cheaper; a
 * gentle one runs the middle of the race on one set.
 *
 * `risk` moves the whole plan: an aggressive car comes in early and hopes the
 * fresh tyres pay for themselves before anybody else stops, a patient one
 * stays out and hopes the opposite. */
export function planStops(
  pace: CarPace,
  lapCount: number,
  random: () => number = Math.random,
  risk = 0,
): number[] {
  const oneStop = evenStops(lapCount, 1);
  const twoStop = evenStops(lapCount, 2);
  const planned =
    lapCount >= 4 && strategyCostMs(pace, lapCount, twoStop) < strategyCostMs(pace, lapCount, oneStop)
      ? twoStop
      : oneStop;

  // Each stop lands within four laps of the plan, shifted by the car's own
  // appetite, and they stay in order and apart - two stops on top of each other
  // would be one stop and a wasted set.
  const jittered: number[] = [];
  for (const lap of planned) {
    const offset = Math.round((random() * 2 - 1) * PIT_WINDOW_LAPS + risk * RISK_LAPS);
    const earliest = jittered.length > 0 ? jittered[jittered.length - 1] + 2 : 1;
    jittered.push(Math.min(lapCount - 1, Math.max(earliest, lap + offset)));
  }
  return jittered.filter((lap) => lap >= 1 && lap < lapCount);
}

export interface RaceLap {
  lapTimeMs: number;
  /** Cumulative time at the end of this lap, from the start of the race. */
  elapsedMs: number;
  /** Share of the tyres' life used at the start of the lap. */
  tyreUsed: number;
  /** Grip the lap was run on, 1 being a set at its best. */
  grip: number;
  error: boolean;
  pitted: boolean;
  /** The lap out of the pits, on tyres that are not up to temperature. */
  outLap: boolean;
  /** Ran in the wake of the car ahead. */
  inTraffic: boolean;
  /** Wanted past the car ahead and could not get there. */
  heldUp: boolean;
  safetyCar: boolean;
}

export interface RaceEntry {
  carId: string;
  /** Slot on the starting grid, which qualifying decided. */
  gridIndex: number;
  laps: RaceLap[];
  totalTimeMs: number;
  stops: number;
  /** How far off its best the car was all race, as a share. */
  formLoss: number;
  /** Below zero it stops early, above it stays out. */
  risk: number;
  botchedStops: number;
}

export interface QualifyingLap {
  carId: string;
  lapMs: number;
  /** Slot on the grid, 0 being pole. */
  gridIndex: number;
}

/** One lap each, no second chance, and everybody a little off their best -
 * which is why the grid is not simply the order of the lap-time chart. */
export function qualify(paces: CarPace[], random: () => number = Math.random): QualifyingLap[] {
  return paces
    .map((pace) => ({ carId: pace.carId, lapMs: pace.baseLapMs * (1 + random() * QUALIFYING_SPREAD) }))
    .sort((a, b) => a.lapMs - b.lapMs)
    .map((lap, gridIndex) => ({ ...lap, gridIndex }));
}

export interface RaceOptions {
  laps: number;
  traits: TrackTraits;
  /** Overrides the pit wall, which is how the strategy call itself can be
   * checked: run the race both ways and see which was quicker. */
  stopLaps?: readonly number[];
  /** Overrides qualifying with a grid of car ids, front to back. */
  grid?: readonly string[];
  random?: () => number;
}

export interface RaceResult {
  grid: QualifyingLap[];
  entries: RaceEntry[];
  /** Laps run behind the safety car. */
  safetyCarLaps: number[];
}

/** Everything one car carries through the race that the next lap depends on. */
interface CarState {
  pace: CarPace;
  gridIndex: number;
  stopLaps: number[];
  formLoss: number;
  risk: number;
  lapsOnSet: number;
  elapsedMs: number;
  stops: number;
  botchedStops: number;
  pittedLastLap: boolean;
  laps: RaceLap[];
}

/** The whole race, run as a field rather than as a set of solo runs. */
export function simulateRace(paces: CarPace[], options: RaceOptions): RaceResult {
  const { laps: lapCount, traits, random = Math.random } = options;
  const grid = options.grid
    ? options.grid.map((carId, gridIndex) => ({
        carId,
        lapMs: paces.find((p) => p.carId === carId)?.baseLapMs ?? 0,
        gridIndex,
      }))
    : qualify(paces, random);
  const gridOf = new Map(grid.map((lap) => [lap.carId, lap.gridIndex]));

  const state: CarState[] = paces.map((pace) => {
    const risk = random() * 2 - 1;
    const gridIndex = gridOf.get(pace.carId) ?? 0;
    return {
      pace,
      gridIndex,
      stopLaps: [...(options.stopLaps ?? planStops(pace, lapCount, random, risk))],
      formLoss: random() * RACE_FORM_SPREAD,
      risk,
      lapsOnSet: 0,
      // Starting further back is time given away before a wheel turns.
      elapsedMs: gridIndex * GRID_GAP_MS,
      stops: 0,
      botchedStops: 0,
      pittedLastLap: false,
      laps: [],
    };
  });

  const safetyCarLaps: number[] = [];
  let safetyCarUntil = 0;

  for (let lap = 1; lap <= lapCount; lap++) {
    const underSafetyCar = lap <= safetyCarUntil;
    if (underSafetyCar) safetyCarLaps.push(lap);

    // The order at the start of the lap: the clock decides it, not the grid.
    const order = [...state].sort((a, b) => a.elapsedMs - b.elapsedMs);
    // Everybody behind the safety car runs to the leader's pace, not their own.
    const safetyCarLapMs = order[0].pace.baseLapMs * SAFETY_CAR_LAP_FACTOR;
    // The circuit gets quicker as rubber goes down.
    const evolution = -EVOLUTION_GAIN * ((lap - 1) / Math.max(1, lapCount - 1));

    const own: number[] = [];
    const rows: RaceLap[] = [];

    for (let i = 0; i < order.length; i++) {
      const car = order[i];
      const tyreUsed = tyreUsedAfter(car.pace, car.lapsOnSet, lapCount);
      const error = random() < car.pace.errorChance;
      if (error && !underSafetyCar && random() < SAFETY_CAR_PER_ERROR && lap < lapCount - 1) {
        safetyCarUntil = Math.min(lapCount - 1, lap + SAFETY_CAR_LAPS);
      }
      const grip = tyreGrip(tyreUsed) * (error ? 1 - ERROR_GRIP_LOSS : 1);
      const powerLoss = car.formLoss + random() * LAP_POWER_SPREAD;

      let lapTimeMs =
        car.pace.baseLapMs *
        (1 +
          car.pace.gripSensitivity * (1 - grip) +
          car.pace.powerSensitivity * powerLoss +
          evolution +
          (lap === 1 ? COLD_FIRST_LAP : 0) +
          (car.pittedLastLap ? OUT_LAP_LOSS : 0));

      if (underSafetyCar) lapTimeMs = Math.max(lapTimeMs, safetyCarLapMs);

      const pitting = lap < lapCount && car.stopLaps.includes(lap);
      if (pitting) {
        const botched = random() < PIT_BOTCH_CHANCE;
        lapTimeMs +=
          PIT_LOSS_MS * (underSafetyCar ? SAFETY_CAR_PIT_FACTOR : 1) +
          (botched ? PIT_BOTCH_MIN_MS + random() * (PIT_BOTCH_MAX_MS - PIT_BOTCH_MIN_MS) : 0);
        if (botched) car.botchedStops++;
        car.stops++;
      }

      own.push(lapTimeMs);
      rows.push({
        lapTimeMs,
        elapsedMs: 0,
        tyreUsed,
        grip,
        error,
        pitted: pitting,
        outLap: car.pittedLastLap,
        inTraffic: false,
        heldUp: false,
        safetyCar: underSafetyCar,
      });
      car.lapsOnSet = pitting ? 0 : car.lapsOnSet + 1;
      car.pittedLastLap = pitting;
    }

    // From the front backwards, because whether a car is held up depends on
    // where the one ahead of it ends up.
    for (let i = 0; i < order.length; i++) {
      const car = order[i];
      const row = rows[i];
      let lapTimeMs = own[i];

      if (i > 0 && !underSafetyCar && !row.pitted) {
        const ahead = order[i - 1];
        const gapAtStart = car.elapsedMs - ahead.elapsedMs;
        if (gapAtStart <= TOW_WINDOW_MS) {
          row.inTraffic = true;
          // In the wake: less drag down the straight, less grip in the corners.
          const tow = car.pace.towSensitivity * TOW_DRAG_RELIEF * traits.straightShare;
          const dirty = car.pace.gripSensitivity * DIRTY_AIR_GRIP_LOSS * traits.cornerShare;
          lapTimeMs *= 1 - tow + dirty;

          // Getting past takes a clear advantage, and how clear depends on the
          // circuit. The needed margin is drawn afresh every lap: a driver gets
          // it done at the third attempt where the first two went nowhere.
          const advantage = (own[i - 1] - lapTimeMs) / own[i - 1];
          const needed = traits.overtakeThreshold * (0.6 + 0.8 * random());
          if (advantage < needed) {
            row.heldUp = true;
            // Nose to tail: it cannot come out of the lap ahead of the car it
            // failed to pass.
            lapTimeMs = Math.max(lapTimeMs, ahead.elapsedMs + own[i - 1] + MIN_GAP_MS - car.elapsedMs);
          }
        }
      }

      row.lapTimeMs = lapTimeMs;
      car.elapsedMs += lapTimeMs;
      row.elapsedMs = car.elapsedMs;
      car.laps.push(row);
    }

    // The safety car comes in: the field is nose to tail again, and everything
    // anybody had built up is gone. That is what a safety car does.
    if (underSafetyCar && lap === safetyCarUntil) {
      const closing = [...state].sort((a, b) => a.elapsedMs - b.elapsedMs);
      const leaderMs = closing[0].elapsedMs;
      closing.forEach((car, i) => {
        car.elapsedMs = leaderMs + i * BUNCH_GAP_MS;
        car.laps[car.laps.length - 1].elapsedMs = car.elapsedMs;
      });
    }
  }

  return {
    grid,
    safetyCarLaps,
    entries: state.map((car) => ({
      carId: car.pace.carId,
      gridIndex: car.gridIndex,
      laps: car.laps,
      totalTimeMs: car.elapsedMs,
      stops: car.stops,
      formLoss: car.formLoss,
      risk: car.risk,
      botchedStops: car.botchedStops,
    })),
  };
}

/** Where a car is at a moment in the race: whole laps done plus how far into
 * the current one, which is what puts it on the map and in the order. */
export interface RaceProgress {
  carId: string;
  gridIndex: number;
  lapsDone: number;
  /** Fraction of the lap in progress, 0 to 1. */
  lapFraction: number;
  /** Laps done plus the fraction - the number the order is read from. */
  distanceLaps: number;
  /** Share of the current set's life used, 0 fresh and 1 spent. */
  tyreUsed: number;
  stops: number;
  finished: boolean;
  /** Own clock: running while it races, stopped at its total when it finishes. */
  elapsedMs: number;
  totalTimeMs: number;
}

export function progressAt(entry: RaceEntry, atMs: number, lapCount: number): RaceProgress {
  const shared = {
    carId: entry.carId,
    gridIndex: entry.gridIndex,
    totalTimeMs: entry.totalTimeMs,
  };

  if (atMs >= entry.totalTimeMs) {
    const last = entry.laps[entry.laps.length - 1];
    return {
      ...shared,
      lapsDone: lapCount,
      lapFraction: 0,
      distanceLaps: lapCount,
      tyreUsed: last ? last.tyreUsed : 0,
      stops: entry.stops,
      finished: true,
      elapsedMs: entry.totalTimeMs,
    };
  }

  let lapsDone = 0;
  while (lapsDone < entry.laps.length && entry.laps[lapsDone].elapsedMs <= atMs) lapsDone++;
  const current = entry.laps[lapsDone];
  const startedAt = lapsDone === 0 ? 0 : entry.laps[lapsDone - 1].elapsedMs;
  const lapFraction = current ? Math.min(1, Math.max(0, (atMs - startedAt) / current.lapTimeMs)) : 0;

  return {
    ...shared,
    lapsDone,
    lapFraction,
    distanceLaps: lapsDone + lapFraction,
    tyreUsed: current ? current.tyreUsed : 0,
    stops: entry.laps.slice(0, lapsDone).filter((l) => l.pitted).length,
    finished: false,
    elapsedMs: atMs,
  };
}

export interface RankedRaceCar extends RaceProgress {
  position: number;
  /** Seconds behind the leader once both have finished; null while running. */
  gapMs: number | null;
  /** Laps behind the leader while the race is on; null once finished. */
  gapLaps: number | null;
}

/** The order of the race: cars that have finished are ranked by their time,
 * everyone still out there by how far they have got. */
export function rankRace(progress: RaceProgress[]): RankedRaceCar[] {
  const ordered = [...progress].sort((a, b) => {
    if (a.finished && b.finished) return a.totalTimeMs - b.totalTimeMs;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.distanceLaps - a.distanceLaps;
  });

  const leader = ordered[0];
  return ordered.map((car, i) => ({
    ...car,
    position: i + 1,
    gapMs: leader && car.finished && leader.finished ? car.totalTimeMs - leader.totalTimeMs : null,
    gapLaps: leader && !(car.finished && leader.finished) ? leader.distanceLaps - car.distanceLaps : null,
  }));
}

/** How long the replay of a race runs. A race is longer than a lap and worth
 * watching, but nobody sits through a real two hundred and fifty kilometres. */
export function racePlaybackMs(slowestTotalMs: number): number {
  return Math.min(40_000, Math.max(10_000, slowestTotalMs / 120));
}
