import type { CarData, TrackData } from "@/lib/data";
import { brakingDecelMps2, simulateRun, solveLaunchLimitN, buildGearbox } from "@/lib/physics";

/** A race over a distance rather than a lap: two hundred and fifty kilometres
 * of a circuit, with tyres that go off, stops to change them, and a driver who
 * is not perfect twice in a row.
 *
 * Everything here is deliberately outside the lap-time model. A lap on the
 * leaderboards is one clean lap by a machine; this is a race, and a race has
 * luck in it. That is also why nothing from here is written to the boards. */

/** The distance every race runs to. Whole laps, so the flag falls where the
 * lap ends rather than in the middle of a straight. */
export const RACE_DISTANCE_M = 250_000;

/** Cars on the grid. Twenty-eight is the biggest field anybody has to watch. */
export const MAX_RACE_CARS = 28;

/** Time lost changing tyres, from pit entry to pit exit. */
export const PIT_LOSS_MS = 25_000;

/** A set of tyres lasts this share of the race - the gentlest car on its tyres
 * at the top of the range, the hardest at the bottom. Written as a share of the
 * race rather than in kilometres on purpose: it is what decides whether a stop
 * is one or two, and that question should read the same on every circuit.
 *
 * Note that even the longest-lasting set does not see the flag, so every car
 * stops at least once. */
const TYRE_LIFE_MIN = 0.6;
const TYRE_LIFE_MAX = 0.85;

/** A tyre is not at its best when it is new. It comes to the front after about
 * a sixth of its life, holds there briefly, and then goes away - slowly at
 * first and then all at once, which is what makes the last laps of a stint
 * cost so much and a stop worth its twenty-five seconds. */
const TYRE_PEAK_AT = 0.15;
const TYRE_NEW_LOSS = 0.015;
/** Grip given away by the time a set has done its life. */
const TYRE_SPENT_LOSS = 0.18;
/** Nothing gets worse than this, however far past its life a set is run. */
const TYRE_MAX_LOSS = 0.4;

/** How far off the pit wall's own answer a stop actually happens. Traffic, a
 * lap worth completing, a driver who wants one more - the field does not all
 * come in on the same lap. */
const PIT_WINDOW_LAPS = 4;

/** Tread per tonne an ordinary car carries; the tyre life is measured against
 * it, so a heavy car on narrow tyres gets through a set far quicker. */
const REFERENCE_TYRE_MM_PER_TONNE = 600;

const REFERENCE_CORNER_SHARE = 0.5;

/** Chance per lap of a mistake, on a circuit that is half corners and with
 * ordinary brakes. A mistake costs a tenth of the grip for that lap - a
 * moment out of shape, not a crash. */
const ERROR_CHANCE = 0.03;
const ERROR_GRIP_LOSS = 0.1;
const REFERENCE_DECEL_MPS2 = 10.3; // about 1.05 g, a car on good discs

/** How much power a car is down on any given lap, and how much it is down for
 * the whole race. Both are drawn between nothing and two per cent: an engine
 * has a good day and a bad day, and no lap is quite like the last. */
const LAP_POWER_SPREAD = 0.02;
const RACE_FORM_SPREAD = 0.02;

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

/** Everything about one car on one circuit that does not change from lap to
 * lap: how quick it is, how much a lost tenth of grip or of power costs it,
 * how fast it uses its tyres and how likely it is to get it wrong.
 *
 * The sensitivities come from three runs - clean, ten per cent down on grip,
 * ten per cent down on power - and are read off linearly in between. A lap
 * simulated afresh for every one of fifty laps and twenty-eight cars would be
 * fourteen hundred runs, and the honest answer is that the curve is close
 * enough to straight over the couple of per cent that are ever in play. */
export interface CarPace {
  carId: string;
  baseLapMs: number;
  /** Extra lap time as a share, per unit of grip lost. */
  gripSensitivity: number;
  /** Extra lap time as a share, per unit of power lost. */
  powerSensitivity: number;
  /** Share of the race one set of tyres lasts, between 0.6 and 0.85. */
  tyreLifeShare: number;
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
  const launchLimitN = solveLaunchLimitN(car, buildGearbox(car));
  const base = simulateRun(car, track.segments, { launchLimitN }).totalTimeMs;
  const lowGrip = simulateRun(car, track.segments, { launchLimitN, gripFactor: 0.9 }).totalTimeMs;
  const lowPower = simulateRun(car, track.segments, { launchLimitN, powerFactor: 0.9 }).totalTimeMs;

  const share = cornerShare(track);
  const tyreMmPerTonne = (car.tyreWidthMm * 4) / (car.weightKg / 1000);
  const load = Math.min(2, Math.max(0.6, REFERENCE_TYRE_MM_PER_TONNE / tyreMmPerTonne));
  const brakes = Math.min(1.4, Math.max(0.8, REFERENCE_DECEL_MPS2 / brakingDecelMps2(car)));

  // How hard this car works its tyres on this circuit. The car decides most of
  // it - the weight it hangs on however much rubber it has - and the circuit
  // shifts it, because a lap that is mostly corner is a lap mostly spent
  // leaning on them.
  // Normalised over what road cars actually carry: about 750 mm of tread per
  // tonne at the gentle end, half that at the hard end.
  const carScore = Math.min(1, Math.max(0, (load - 0.75) / 0.75));
  const severity = 0.7 * carScore + 0.3 * share;

  return {
    carId: car.id,
    baseLapMs: base,
    gripSensitivity: (lowGrip - base) / base / 0.1,
    powerSensitivity: (lowPower - base) / base / 0.1,
    tyreLifeShare: Math.min(
      TYRE_LIFE_MAX,
      Math.max(TYRE_LIFE_MIN, TYRE_LIFE_MAX - severity * (TYRE_LIFE_MAX - TYRE_LIFE_MIN)),
    ),
    // More corners is more opportunity; weaker brakes is a later braking point
    // guessed at rather than known.
    errorChance: ERROR_CHANCE * (share / REFERENCE_CORNER_SHARE) * brakes,
  };
}

/** What a plan costs in tyre time and pit time, in milliseconds. Everything
 * the strategy call is decided on. */
export function strategyCostMs(pace: CarPace, lapCount: number, stopLaps: readonly number[]): number {
  const lifeLaps = Math.max(1, pace.tyreLifeShare * lapCount);
  let onSet = 0;
  let cost = 0;
  for (let lap = 1; lap <= lapCount; lap++) {
    cost += pace.baseLapMs * pace.gripSensitivity * (1 - tyreGrip(onSet / lifeLaps));
    if (stopLaps.includes(lap) && lap < lapCount) {
      cost += PIT_LOSS_MS;
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
 * gentle one runs the middle of the race on one set. */
export function planStops(pace: CarPace, lapCount: number, random: () => number = Math.random): number[] {
  const oneStop = evenStops(lapCount, 1);
  const twoStop = evenStops(lapCount, 2);
  const planned =
    lapCount >= 4 && strategyCostMs(pace, lapCount, twoStop) < strategyCostMs(pace, lapCount, oneStop)
      ? twoStop
      : oneStop;

  // Each stop lands within four laps of the plan, and they stay in order and
  // apart - two stops on top of each other would be one stop and a wasted set.
  const jittered: number[] = [];
  for (const lap of planned) {
    const offset = Math.round((random() * 2 - 1) * PIT_WINDOW_LAPS);
    const earliest = jittered.length > 0 ? jittered[jittered.length - 1] + 2 : 1;
    jittered.push(Math.min(lapCount - 1, Math.max(earliest, lap + offset)));
  }
  return jittered.filter((lap) => lap >= 1 && lap < lapCount);
}

export interface RaceLap {
  lapTimeMs: number;
  /** Cumulative time at the end of this lap. */
  elapsedMs: number;
  /** Share of the tyres' life used at the start of the lap, 1 being a spent
   * set. */
  tyreUsed: number;
  /** Grip the lap was run on, 1 being a set at its best. */
  grip: number;
  error: boolean;
  pitted: boolean;
}

export interface RaceEntry {
  carId: string;
  gridIndex: number;
  laps: RaceLap[];
  totalTimeMs: number;
  stops: number;
  /** How far off its best the car was all race, as a share. */
  formLoss: number;
}

export interface RaceOptions {
  laps: number;
  /** Overrides the pit wall, which is how the strategy call itself can be
   * checked: run the race both ways and see which was quicker. */
  stopLaps?: readonly number[];
  random?: () => number;
}

/** Runs the race lap by lap for one car. */
function runCar(pace: CarPace, gridIndex: number, options: RaceOptions): RaceEntry {
  const { laps: lapCount, random = Math.random } = options;
  const formLoss = random() * RACE_FORM_SPREAD;
  const stopLaps = options.stopLaps ?? planStops(pace, lapCount, random);
  const lifeLaps = Math.max(1, pace.tyreLifeShare * lapCount);

  const laps: RaceLap[] = [];
  let onSet = 0;
  let elapsedMs = 0;
  let stops = 0;

  for (let lap = 1; lap <= lapCount; lap++) {
    const tyreUsed = onSet / lifeLaps;
    const error = random() < pace.errorChance;
    // A mistake is a moment out of shape: the grip is there, the driver is not.
    const grip = tyreGrip(tyreUsed) * (error ? 1 - ERROR_GRIP_LOSS : 1);
    const powerLoss = formLoss + random() * LAP_POWER_SPREAD;

    let lapTimeMs =
      pace.baseLapMs * (1 + pace.gripSensitivity * (1 - grip) + pace.powerSensitivity * powerLoss);

    // Nobody changes tyres on the last lap - the race is over before they wear.
    const pitted = lap < lapCount && stopLaps.includes(lap);
    if (pitted) {
      lapTimeMs += PIT_LOSS_MS;
      stops += 1;
      onSet = 0;
    } else {
      onSet++;
    }

    elapsedMs += lapTimeMs;
    laps.push({ lapTimeMs, elapsedMs, tyreUsed, grip, error, pitted });
  }

  return { carId: pace.carId, gridIndex, laps, totalTimeMs: elapsedMs, stops, formLoss };
}

/** The whole race. Grid order is the order the cars are handed over, which is
 * how the caller has already sorted them. */
export function simulateRace(paces: CarPace[], options: RaceOptions): RaceEntry[] {
  return paces.map((pace, i) => runCar(pace, i, options));
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
  const lapFraction = current ? Math.min(1, (atMs - startedAt) / current.lapTimeMs) : 0;

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
