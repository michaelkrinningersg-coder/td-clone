import type { Segment } from "./track-types";
import type { BrakeKind } from "./car-import";

const G = 9.81;
const KPH_TO_MPS = 1 / 3.6;
const AIR_DENSITY = 1.225; // kg/m³ at sea level
const ROLLING_RESISTANCE = 0.012; // shared constant; the data carries no tyre compound
/** Frontal area is not in the data, so it is taken as a share of the bounding
 * box the width and height describe. 0.85 is the usual approximation. */
const FRONTAL_AREA_FACTOR = 0.85;
const DT = 0.02; // simulation time step in seconds
const TRACE_SAMPLES = 300; // points returned for the visualization, independent of track length

export type Drivetrain = "FWD" | "RWD" | "AWD";

export interface CarPhysicsInput {
  topSpeedKph: number;
  accel0to100s: number;
  powerPs: number;
  weightKg: number;
  torqueNm: number;
  drivetrain: Drivetrain;
  dragCoefficient: number;
  widthMm: number;
  heightMm: number;
  brakeFront: BrakeKind;
  brakeRear: BrakeKind;
  tyreWidthMm: number;
  gearCount: number;
  manualGearbox: boolean;
}

export interface TracePoint {
  distanceM: number;
  timeS: number;
  speedKph: number;
}

export interface SimResult {
  totalTimeMs: number;
  trace: TracePoint[];
  /** Cumulative time at each sector boundary, in milliseconds. */
  sectorTimesMs: number[];
}

export const SECTOR_COUNT = 3;

/** Maximum braking deceleration in g. The brake type is real; turning it into a
 * figure is a modelling step, like the tyre friction constant. Ventilated discs
 * shed heat and hold up, plain discs less so, drums fade first. */
const BRAKE_G: Record<BrakeKind, number> = {
  "ventilated-disc": 1.15,
  disc: 1.0,
  drum: 0.75,
};

/** Share of engine power that reaches the road. Transmission losses are not in
 * the data, so this is a shared constant like the friction and rolling figures. */
const DRIVETRAIN_EFFICIENCY = 0.85;
const PS_TO_WATT = 735.5;

/** Time lost to one gearchange. A manual needs the clutch and the driver. */
const SHIFT_TIME_S = { manual: 0.45, automatic: 0.2 };

export function frontalAreaM2(car: CarPhysicsInput): number {
  return FRONTAL_AREA_FACTOR * (car.widthMm / 1000) * (car.heightMm / 1000);
}

export function dragForceN(car: CarPhysicsInput, speedMps: number): number {
  return 0.5 * AIR_DENSITY * car.dragCoefficient * frontalAreaM2(car) * speedMps * speedMps;
}

/** How hard the car can brake, from what is fitted front and rear. The front
 * does most of the work under braking, so it weighs heavier. */
export function brakingDecelMps2(car: CarPhysicsInput): number {
  return (BRAKE_G[car.brakeFront] * 0.65 + BRAKE_G[car.brakeRear] * 0.35) * G;
}

/** Power reaching the road, from the engine's real output.
 *
 * Deriving it from the top speed instead looks tempting - at top speed drive
 * force balances drag exactly - but most of this field is electronically
 * limited. A Chiron Pur Sport stops at 350 km/h and a great many German cars at
 * 250, so working backwards from that would have credited the Chiron with 444
 * of its 1103 kW and left it crawling through the mid-range. */
export function wheelPowerW(car: CarPhysicsInput): number {
  return car.powerPs * PS_TO_WATT * DRIVETRAIN_EFFICIENCY;
}

/** Torque at the power peak, as a share of peak torque.
 *
 * Where both figures are quoted for a real engine this ratio sits just under
 * one, remarkably consistently: a Chiron makes 1573 of its 1600 Nm at the power
 * peak, an S2000 203 of 208, a Golf GTD 344 of 350. */
const TORQUE_AT_POWER_PEAK = 0.98;

/** Engine speed at the redline, relative to the power peak. */
const REDLINE_FRACTION = 1.1;

/** Where in the rev range peak torque sits, and how much of it is there just
 * off idle - for the two ends of the field. A low-revving engine is broad: it
 * pulls almost from idle and peaks early. A high-revving one has to be kept
 * spinning and rewards it by holding on past the power peak. */
const BROAD = { offIdle: 0.9, peakAt: 0.45, fadePastPeak: 0.35 };
const PEAKY = { offIdle: 0.55, peakAt: 0.7, fadePastPeak: 0.15 };

/** Where a car sits between the two, from its rated speed: 0 at 3.000/min,
 * 1 at 8.000/min. This is the whole reason torque is in the model - power and
 * top speed alone cannot tell a turbodiesel from an atmospheric screamer. */
function revviness(car: CarPhysicsInput): number {
  const rpm = (ratedSpeedRadS(car) * 60) / (2 * Math.PI);
  return Math.max(0, Math.min(1, (rpm - 3000) / 5000));
}

function curveShape(car: CarPhysicsInput) {
  const r = revviness(car);
  const mix = (a: number, b: number) => a + (b - a) * r;
  return {
    offIdle: mix(BROAD.offIdle, PEAKY.offIdle),
    peakAt: mix(BROAD.peakAt, PEAKY.peakAt),
    fadePastPeak: mix(BROAD.fadePastPeak, PEAKY.fadePastPeak),
  };
}

/** Ratio between the speeds top gear and first gear are good for. Four and a
 * half is ordinary; the gear count decides how finely it is divided. */
const GEARBOX_SPREAD = 4.5;

/** Where the engine makes its rated power, in rad/s.
 *
 * The dataset has no engine speeds, but power and torque together imply one:
 * P = M · omega. Solving it for a peak-torque figure that holds nearly to the
 * power peak lands close to the real number across the field - a Golf GTD at
 * ~3.700/min, a Golf GTI at ~4.600, an S2000 at ~8.100, a Chiron at ~6.600 -
 * and it separates a torquey diesel from a high-revving atmospheric engine
 * without a single invented per-car value.
 *
 * Clamped either side because the dataset does contain the odd implausible
 * torque figure, and a nonsense engine speed would poison the gearing. */
export function ratedSpeedRadS(car: CarPhysicsInput): number {
  const raw = (car.powerPs * PS_TO_WATT) / (TORQUE_AT_POWER_PEAK * car.torqueNm);
  return Math.max(210, Math.min(1000, raw)); // ~2.000 to ~9.550 /min
}

/** Engine torque at a given speed, as a share of the peak.
 *
 * Torque climbs off idle, peaks, holds to the power peak - it has to, or the
 * car would not make its rated power there - and falls away past it. How much
 * is there off idle, how early it peaks and how hard it fades are what separate
 * a broad turbodiesel from a peaky atmospheric engine.
 *
 * That difference is not cosmetic. Gearing follows the rated speed, so two cars
 * with the same power, top speed and gear count sit at the same point on their
 * curves at any given speed; if the curves had the same shape they would be
 * indistinguishable. The shape is where the torque figure earns its keep. */
export function torqueFactor(car: CarPhysicsInput, radS: number): number {
  const shape = curveShape(car);
  const x = radS / ratedSpeedRadS(car);
  if (x <= 0) return shape.offIdle;
  if (x <= shape.peakAt) {
    return shape.offIdle + (x / shape.peakAt) * (1 - shape.offIdle);
  }
  if (x <= 1) {
    const t = (x - shape.peakAt) / (1 - shape.peakAt);
    return 1 - t * (1 - TORQUE_AT_POWER_PEAK);
  }
  if (x <= REDLINE_FRACTION) {
    const t = (x - 1) / (REDLINE_FRACTION - 1);
    return TORQUE_AT_POWER_PEAK * (1 - shape.fadePastPeak * t);
  }
  return 0; // past the redline there is no drive at all
}

/** How fast the engine could push the car if power were the only limit.
 *
 * Constant power against drag, which is the gearbox-free view: it says what the
 * engine is capable of, not what the car is allowed to do. */
export function powerLimitedTopSpeedMps(car: CarPhysicsInput): number {
  let low = 1;
  let high = 200; // 720 km/h, past anything here
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    const resistance = dragForceN(car, mid) + ROLLING_RESISTANCE * car.weightKg * G;
    if (wheelPowerW(car) / mid > resistance) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** The speed each gear is good for at the rated engine speed.
 *
 * Top gear is set so the power peak lands where the engine runs out of breath
 * against the air, which is how road cars are geared. Deliberately not the
 * quoted top speed: a great many of these cars are electronically limited, and
 * gearing to 250 km/h would turn a limiter into a mechanical ceiling the real
 * car does not have. The limiter stays a separate cap.
 *
 * The rest follow as a geometric series over a fixed spread, so a four-speed
 * takes big steps and an eight-speed small ones - the gear count is real data,
 * the spread is not. */
export function gearTopSpeedsMps(car: CarPhysicsInput): number[] {
  const vTop = Math.max(car.topSpeedKph * KPH_TO_MPS, powerLimitedTopSpeedMps(car));
  const gears = Math.max(1, car.gearCount);
  if (gears === 1) return [vTop];
  const step = Math.pow(GEARBOX_SPREAD, 1 / (gears - 1));
  return Array.from({ length: gears }, (_, i) => vTop / Math.pow(step, gears - 1 - i));
}

/** Drive force in a given gear at a given speed, or zero past the redline. */
function gearForceN(car: CarPhysicsInput, gearTopSpeed: number, speedMps: number): number {
  const rated = ratedSpeedRadS(car);
  const radS = (rated * speedMps) / gearTopSpeed;
  // Wheel power is torque times engine speed, so the force works out as the
  // torque factor times the rated power divided by the gear's own top speed.
  return (
    (torqueFactor(car, radS) * car.torqueNm * rated * DRIVETRAIN_EFFICIENCY) / gearTopSpeed
  );
}

export interface Gearbox {
  /** Speed each gear tops out at, first gear first. */
  gearTopSpeeds: number[];
  /** Speeds at which the next gear starts to pull harder. */
  shiftSpeeds: number[];
}

/** Builds the gearbox once per car: the ratios and the speeds a driver would
 * change gear at, which is where the next ratio starts to out-pull this one. */
export function buildGearbox(car: CarPhysicsInput): Gearbox {
  const gearTopSpeeds = gearTopSpeedsMps(car);
  const shiftSpeeds: number[] = [];
  for (let gear = 0; gear < gearTopSpeeds.length - 1; gear++) {
    // Scan up from where the lower gear is still pulling to where it runs out.
    const from = gearTopSpeeds[gear] * 0.2;
    const to = gearTopSpeeds[gear] * REDLINE_FRACTION;
    let crossing = to;
    for (let v = from; v <= to; v += 0.25) {
      if (gearForceN(car, gearTopSpeeds[gear + 1], v) >= gearForceN(car, gearTopSpeeds[gear], v)) {
        crossing = v;
        break;
      }
    }
    shiftSpeeds.push(crossing);
  }
  return { gearTopSpeeds, shiftSpeeds };
}

/** Which gear the car is in at a given speed, and what it pulls there. */
export function driveForceN(car: CarPhysicsInput, gearbox: Gearbox, speedMps: number): number {
  let gear = 0;
  while (gear < gearbox.shiftSpeeds.length && speedMps >= gearbox.shiftSpeeds[gear]) gear++;
  return gearForceN(car, gearbox.gearTopSpeeds[gear], speedMps);
}

/** How fast the car would go with drag as the only thing stopping it. */
export function dragLimitedTopSpeedMps(car: CarPhysicsInput): number {
  const gearbox = buildGearbox(car);
  let low = 1;
  let high = 200; // 720 km/h, past anything here
  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    const resistance = dragForceN(car, mid) + ROLLING_RESISTANCE * car.weightKg * G;
    if (driveForceN(car, gearbox, mid) > resistance) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** The speed the car actually reaches: whichever comes first, the limiter it
 * leaves the factory with or the point where drag wins. */
export function effectiveTopSpeedMps(car: CarPhysicsInput): number {
  return Math.min(car.topSpeedKph * KPH_TO_MPS, dragLimitedTopSpeedMps(car));
}

/** Cornering grip. The friction constant is shared by every car; what varies is
 * real: how much tyre is under how much car, and which wheels drive. */
export function corneringSpeedCapMps(radiusM: number, car: CarPhysicsInput): number {
  const baseMu = 0.95;
  const tyreMmPerTonne = (car.tyreWidthMm * 4) / (car.weightKg / 1000);
  // Around 600 mm of tread per tonne is ordinary; more grips better.
  const tyreFactor = Math.max(0.75, Math.min(1.35, tyreMmPerTonne / 600));
  const drivetrainFactor = car.drivetrain === "AWD" ? 1.05 : car.drivetrain === "FWD" ? 0.95 : 1.0;
  return Math.sqrt(baseMu * tyreFactor * drivetrainFactor * G * radiusM);
}

/** Net acceleration at a given speed. `launchLimitN` is the traction ceiling:
 * however hard the engine pulls, the tyres decide what reaches the road. */
function accelerationMps2(
  car: CarPhysicsInput,
  gearbox: Gearbox,
  speedMps: number,
  launchLimitN: number,
  gradientPercent: number,
): number {
  const driveN = Math.min(launchLimitN, driveForceN(car, gearbox, speedMps));
  const dragN = dragForceN(car, speedMps);
  const rollN = ROLLING_RESISTANCE * car.weightKg * G;
  const gradeN = car.weightKg * G * Math.sin(Math.atan(gradientPercent / 100));
  return (driveN - dragN - rollN - gradeN) / car.weightKg;
}

/** Time from rest to 100 km/h on the flat for a given launch limit, including
 * the gearchanges. This is what gets solved against the car's real figure. */
function simulate0to100(car: CarPhysicsInput, gearbox: Gearbox, launchLimitN: number): number {
  const target = 100 * KPH_TO_MPS;
  const shifts = gearbox.shiftSpeeds;
  const shiftCost = car.manualGearbox ? SHIFT_TIME_S.manual : SHIFT_TIME_S.automatic;
  let v = 0;
  let t = 0;
  let nextShift = 0;

  while (v < target && t < 120) {
    const a = accelerationMps2(car, gearbox, v, launchLimitN, 0);
    if (a <= 0) return Number.POSITIVE_INFINITY;
    v += a * DT;
    t += DT;
    while (nextShift < shifts.length && v >= shifts[nextShift]) {
      t += shiftCost; // clutch out: no drive, and the clock runs on
      nextShift++;
    }
  }
  return t;
}

/** Solves the launch limit so the model reproduces the car's real 0-100 time.
 * Every other number in the model is measured; this one is what the measurement
 * pins down. */
export function solveLaunchLimitN(car: CarPhysicsInput, gearbox = buildGearbox(car)): number {
  let low = car.weightKg * 0.5; // ~0.05 g, hopeless
  let high = car.weightKg * G * 3; // ~3 g, beyond any road tyre
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (simulate0to100(car, gearbox, mid) > car.accel0to100s) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** Speed the car may not exceed at each step along the track, from the corners
 * alone. Straights are unlimited here - drag is what caps them. */
function speedLimitProfile(car: CarPhysicsInput, segments: Segment[], stepM: number): number[] {
  const limiter = car.topSpeedKph * KPH_TO_MPS;
  const limits: number[] = [];
  for (const seg of segments) {
    const steps = Math.max(1, Math.round(seg.lengthM / stepM));
    const cap = seg.kind === "corner" ? Math.min(limiter, corneringSpeedCapMps(seg.radiusM, car)) : limiter;
    for (let i = 0; i < steps; i++) limits.push(cap);
  }
  return limits;
}

function gradientProfile(segments: Segment[], stepM: number): number[] {
  const grades: number[] = [];
  for (const seg of segments) {
    const steps = Math.max(1, Math.round(seg.lengthM / stepM));
    for (let i = 0; i < steps; i++) grades.push(seg.gradientPercent ?? 0);
  }
  return grades;
}

export function simulateRun(car: CarPhysicsInput, segments: Segment[]): SimResult {
  const totalLengthM = segments.reduce((sum, s) => sum + s.lengthM, 0);
  const stepM = Math.max(1, Math.min(5, totalLengthM / 4000));
  const limits = speedLimitProfile(car, segments, stepM);
  const grades = gradientProfile(segments, stepM);
  const steps = limits.length;

  // Backward pass: a corner has to be arrived at slowly enough, so its limit
  // reaches back up the track as far as the brakes need. This is what gives a
  // car a braking point instead of shedding speed instantly at the corner.
  const decel = brakingDecelMps2(car);
  for (let i = steps - 2; i >= 0; i--) {
    const reachable = Math.sqrt(limits[i + 1] * limits[i + 1] + 2 * decel * stepM);
    limits[i] = Math.min(limits[i], reachable);
  }

  // Forward pass: accelerate as hard as the engine, drag and gradient allow,
  // never exceeding the limit profile.
  const gearbox = buildGearbox(car);
  const launchLimitN = solveLaunchLimitN(car, gearbox);
  const shifts = gearbox.shiftSpeeds;
  const shiftCost = car.manualGearbox ? SHIFT_TIME_S.manual : SHIFT_TIME_S.automatic;
  let nextShift = 0;

  const sampleStepM = totalLengthM / TRACE_SAMPLES;
  const sectorBoundaries = Array.from({ length: SECTOR_COUNT }, (_, i) => ((i + 1) * totalLengthM) / SECTOR_COUNT);
  const sectorTimesMs: number[] = [];

  let v = 0;
  let t = 0;
  let distance = 0;
  let nextSampleAt = 0;
  const trace: TracePoint[] = [{ distanceM: 0, timeS: 0, speedKph: 0 }];
  nextSampleAt += sampleStepM;

  for (let i = 0; i < steps; i++) {
    const limit = limits[i];
    if (v > limit) v = limit; // braking already accounted for by the backward pass

    const a = accelerationMps2(car, gearbox, v, launchLimitN, grades[i]);
    const vNext = Math.max(1, Math.min(limit, Math.sqrt(Math.max(0, v * v + 2 * a * stepM))));
    const vAvg = (v + vNext) / 2;
    t += stepM / vAvg;
    v = vNext;
    distance += stepM;

    while (nextShift < shifts.length && v >= shifts[nextShift]) {
      t += shiftCost;
      nextShift++;
    }

    while (sectorTimesMs.length < SECTOR_COUNT && distance >= sectorBoundaries[sectorTimesMs.length]) {
      sectorTimesMs.push(Math.round(t * 1000));
    }
    while (distance >= nextSampleAt && trace.length <= TRACE_SAMPLES) {
      trace.push({ distanceM: distance, timeS: t, speedKph: v / KPH_TO_MPS });
      nextSampleAt += sampleStepM;
    }
  }

  const totalTimeMs = Math.round(t * 1000);
  while (sectorTimesMs.length < SECTOR_COUNT) sectorTimesMs.push(totalTimeMs);
  if ((trace[trace.length - 1]?.distanceM ?? 0) < distance) {
    trace.push({ distanceM: distance, timeS: t, speedKph: v / KPH_TO_MPS });
  }

  return { totalTimeMs, trace, sectorTimesMs };
}

/** Interpolates the trace (which is sampled at fixed distance intervals) at an
 * arbitrary point in time - used to drive the race animation frame by frame. */
export function interpolateTraceAtTime(trace: TracePoint[], timeS: number): TracePoint {
  if (timeS <= trace[0].timeS) return trace[0];
  const last = trace[trace.length - 1];
  if (timeS >= last.timeS) return last;

  let lo = 0;
  let hi = trace.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (trace[mid].timeS <= timeS) lo = mid;
    else hi = mid;
  }
  const a = trace[lo];
  const b = trace[hi];
  const span = b.timeS - a.timeS;
  const t = span > 0 ? (timeS - a.timeS) / span : 0;
  return {
    timeS,
    distanceM: a.distanceM + (b.distanceM - a.distanceM) * t,
    speedKph: a.speedKph + (b.speedKph - a.speedKph) * t,
  };
}
