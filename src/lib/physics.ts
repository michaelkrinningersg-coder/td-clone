import type { Segment, SpeedTest } from "./track-types";
import type { BrakeKind, GearboxKind } from "./car-import";

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
  /** Kept on the input for the car pages and filters that quote it. The model
   * itself never reads it: how fast a car goes is decided by its power against
   * its drag, and by the rev limiter in top gear - not by the figure the
   * manufacturer chose to restrain it to. */
  topSpeedKph: number;
  accel0to100s: number;
  powerPs: number;
  weightKg: number;
  torqueNm: number;
  drivetrain: Drivetrain;
  /** Only the model's air-density rule reads this, to leave an electric motor
   * its full power at altitude. Optional so a hand-built test car need not
   * carry it; every imported car does. */
  fuelType?: string;
  dragCoefficient: number;
  widthMm: number;
  heightMm: number;
  brakeFront: BrakeKind;
  brakeRear: BrakeKind;
  tyreWidthMm: number;
  /** Distance between the axles, which sets how much load moves rearward under
   * acceleration - see `tractionLimitedDriveN`. */
  wheelbaseMm: number;
  gearCount: number;
  manualGearbox: boolean;
  gearboxKind: GearboxKind;
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
  /** Metres actually covered. The same as the track's length for a lap; on a
   * speed test it is whatever the car needed. */
  distanceM: number;
  /** Hottest the brakes got over the run, as a multiple of what they can take
   * before fading: at or below 1 they never complained. */
  peakBrakeHeat: number;
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

/** Time lost to one gearchange, by what kind of gearbox is fitted.
 *
 * A dual-clutch box has the next gear already engaged and swaps clutches, so it
 * barely interrupts the drive. A torque converter slurs through it. A manual
 * needs the clutch and the driver. An automated single-clutch box - Selespeed,
 * Easytronic, the early sequentials - has to do everything a manual does with
 * an actuator, and is the slowest thing here. A CVT never changes gear at all. */
const SHIFT_TIME_S: Record<GearboxKind, number> = {
  "dual-clutch": 0.05,
  automatic: 0.25,
  manual: 0.45,
  sequential: 0.6,
  cvt: 0,
};

/** How long one gearchange costs this car. */
export function shiftTimeS(car: CarPhysicsInput): number {
  return SHIFT_TIME_S[car.gearboxKind];
}

export function frontalAreaM2(car: CarPhysicsInput): number {
  return FRONTAL_AREA_FACTOR * (car.widthMm / 1000) * (car.heightMm / 1000);
}

/** How thin the air is at a track's altitude, as a share of sea level.
 *
 * The barometric formula for the standard atmosphere. Mexiko-Stadt at 2.232 m
 * runs on about four fifths of the air Monza has, Kyalami on about five sixths.
 * Nothing here is per car and nothing is estimated - the altitudes are surveyed
 * figures on the track, the formula is the ISA. */
export function airDensityRatio(altitudeM: number): number {
  return Math.pow(1 - 2.25577e-5 * altitudeM, 4.2559);
}

/** How much of its power an engine keeps in thin air.
 *
 * An atmospheric engine loses it about in proportion: less air, less fuel, less
 * power. A turbo winds up the boost and gives back most of the loss until it
 * runs out of turbine. The dataset does not say which engine is which - the
 * variant strings name forced induction for barely a fifth of the field and
 * miss 699 diesels that are all turbocharged - so guessing per car would
 * mislabel more cars than it labelled. One exponent for the whole field
 * instead, nearer the atmospheric end because most of the field is.
 *
 * An electric motor carries its own oxidiser and does not care. */
const ALTITUDE_POWER_EXPONENT = 0.75;

export function altitudePowerFactor(car: CarPhysicsInput, altitudeM: number): number {
  if (car.fuelType === "Electric") return 1;
  return Math.pow(airDensityRatio(altitudeM), ALTITUDE_POWER_EXPONENT);
}

export function dragForceN(car: CarPhysicsInput, speedMps: number): number {
  return 0.5 * AIR_DENSITY * car.dragCoefficient * frontalAreaM2(car) * speedMps * speedMps;
}

/** How hard the car can brake cold, from what is fitted front and rear. The
 * front does most of the work under braking, so it weighs heavier. */
export function brakingDecelMps2(car: CarPhysicsInput): number {
  return (BRAKE_G[car.brakeFront] * 0.65 + BRAKE_G[car.brakeRear] * 0.35) * G;
}

/** Braking energy per kilogram of car the brakes take before they start to give
 * way, and how quickly they shed it again.
 *
 * A ventilated disc has air running through it and holds up; a solid disc has
 * only its face; a drum encloses the heat and is the first thing to go. The
 * capacity is in joules per kilogram of car, which makes it comparable across
 * the field: a 1.400 kg car hauled from 250 to 100 km/h puts about 2.000 J/kg
 * into its brakes, so a ventilated set takes three such stops before it
 * complains and a drum barely one.
 *
 * Cooling is a decay constant per second at 108 km/h and scales with speed,
 * because what cools a brake is air moving past it - which is why the brakes
 * come back on a long straight and never do round a street circuit. Iron takes
 * its time: the constants are minute-scale, so a lap sheds a third of what it
 * put in rather than all of it. */
const BRAKE_CAPACITY_J_PER_KG: Record<BrakeKind, number> = {
  "ventilated-disc": 6000,
  disc: 3500,
  drum: 1500,
};
const BRAKE_COOLING_PER_S: Record<BrakeKind, number> = {
  "ventilated-disc": 0.006,
  disc: 0.004,
  drum: 0.002,
};
const BRAKE_COOLING_REFERENCE_MPS = 30;
/** How much braking is lost per full capacity of overheating, and the floor no
 * amount of abuse gets under - a faded brake is a bad brake, not no brake. */
const BRAKE_FADE_SLOPE = 0.5;
const BRAKE_MAX_FADE = 0.35;

function brakeSpec<T>(car: CarPhysicsInput, table: Record<BrakeKind, T & number>): number {
  return table[car.brakeFront] * 0.65 + table[car.brakeRear] * 0.35;
}

/** Heat in the brakes at each point of the run, as a multiple of what they can
 * take before fading - so 1 is the onset and 2 is twice as much again.
 *
 * Energy in wherever the car is slowing, energy out everywhere according to how
 * fast it is going. Only the speed the brakes actually took out counts; a car
 * slowing because it ran out of revs is not braking. */
export function brakeHeatProfile(
  car: CarPhysicsInput,
  speeds: readonly number[],
  stepM: number,
): number[] {
  const capacity = brakeSpec(car, BRAKE_CAPACITY_J_PER_KG);
  const cooling = brakeSpec(car, BRAKE_COOLING_PER_S);
  const decel = brakingDecelMps2(car);
  const heats = new Array<number>(Math.max(0, speeds.length - 1));
  let energy = 0; // J/kg
  for (let i = 0; i + 1 < speeds.length; i++) {
    const v = speeds[i];
    const vNext = speeds[i + 1];
    const vAvg = Math.max(1, (v + vNext) / 2);
    const dt = stepM / vAvg;
    // Everything the car shed over the step, capped at what the brakes could
    // physically have done in that distance - the rest was drag and gradient.
    const shed = Math.max(0, (v * v - vNext * vNext) / 2);
    energy += Math.min(shed, decel * stepM);
    energy = Math.max(0, energy - energy * cooling * (vAvg / BRAKE_COOLING_REFERENCE_MPS) * dt);
    heats[i] = energy / capacity;
  }
  return heats;
}

/** What is left of the brakes at a given heat, 1 being cold and unhurt. */
export function brakeFadeFactor(heat: number): number {
  if (heat <= 1) return 1;
  return 1 - Math.min(BRAKE_MAX_FADE, BRAKE_FADE_SLOPE * (heat - 1));
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

/** Engine speed at the redline, relative to the power peak.
 *
 * Not the same everywhere: a turbodiesel making its power at 3.800/min still
 * turns to about 5.000, a third past the peak, while an atmospheric engine
 * already peaking at 6.500 has barely five hundred left. The broad engines are
 * the ones that need the room - they carry a gear far longer than the fixed
 * value allowed, which cost them a shift they do not really make. */
const REDLINE_BROAD = 1.3;
const REDLINE_PEAKY = 1.05;

export function redlineFraction(car: CarPhysicsInput): number {
  return REDLINE_BROAD + (REDLINE_PEAKY - REDLINE_BROAD) * revviness(car);
}

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

/** Ratio between the speeds top gear and first gear are good for.
 *
 * Four and a half is the middle of the road, but the spread is not the same
 * across the field: an engine that pulls to 8.000/min covers a range of speeds
 * in one gear that a diesel revving to 3.700 has to split over two, so the
 * diesel is given the wider box - real ones spread five to six where a
 * high-revving atmospheric engine sits nearer four. Clamped either side so an
 * odd rated speed cannot invent a gearbox no manufacturer builds. */
function gearboxSpread(car: CarPhysicsInput): number {
  const ratedRpm = (ratedSpeedRadS(car) * 60) / (2 * Math.PI);
  return Math.max(3.5, Math.min(6.5, 4.5 * Math.sqrt(5200 / ratedRpm)));
}

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
  return Math.max(RATED_SPEED_MIN, Math.min(RATED_SPEED_MAX, rawRatedSpeedRadS(car)));
}

/** The engine speed power and torque imply, before it is bounded - the number
 * the import uses to throw a car out rather than let the clamp invent one. */
export function rawRatedSpeedRadS(car: Pick<CarPhysicsInput, "powerPs" | "torqueNm">): number {
  return (car.powerPs * PS_TO_WATT) / (TORQUE_AT_POWER_PEAK * car.torqueNm);
}

/** Slowest and fastest engine speeds the model will represent: ~2.000/min, at
 * which even a big diesel is past its power peak, to ~9.550/min, past every
 * road engine bar a handful of atmospheric specials. */
export const RATED_SPEED_MIN = 210;
export const RATED_SPEED_MAX = 1000;

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
  const redline = redlineFraction(car);
  if (x <= redline) {
    const t = (x - 1) / (redline - 1);
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
 * car does not have.
 *
 * The rest follow as a geometric series over a fixed spread, so a four-speed
 * takes big steps and an eight-speed small ones - the gear count is real data,
 * the spread is not. */
export function gearTopSpeedsMps(car: CarPhysicsInput): number[] {
  const vTop = powerLimitedTopSpeedMps(car);
  const gears = Math.max(1, car.gearCount);
  if (gears === 1) return [vTop];
  const step = Math.pow(gearboxSpread(car), 1 / (gears - 1));
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
    const to = gearTopSpeeds[gear] * redlineFraction(car);
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

/** The speed the car actually reaches.
 *
 * Nothing artificial holds it back: the car runs until the air stops it, or
 * until the engine hits the rev limiter in top gear - whichever comes first.
 * The quoted top speed is a fact about how the manufacturer chose to restrain
 * the car, not about what it can do, so it plays no part here. */
export function effectiveTopSpeedMps(car: CarPhysicsInput): number {
  return dragLimitedTopSpeedMps(car);
}

/** Cornering grip. The friction constant is shared by every car; what varies is
 * real: how much tyre is under how much car, and which wheels drive. */
export function corneringSpeedCapMps(
  radiusM: number,
  car: CarPhysicsInput,
  bankingDegrees = 0,
): number {
  const baseMu = 0.95;
  const tyreMmPerTonne = (car.tyreWidthMm * 4) / (car.weightKg / 1000);
  // Around 600 mm of tread per tonne is ordinary; more grips better.
  const tyreFactor = Math.max(0.75, Math.min(1.35, tyreMmPerTonne / 600));
  const drivetrainFactor = car.drivetrain === "AWD" ? 1.05 : car.drivetrain === "FWD" ? 0.95 : 1.0;
  const mu = baseMu * tyreFactor * drivetrainFactor;
  return Math.sqrt(bankedGripFactor(mu, bankingDegrees) * G * radiusM);
}

/** What a banked corner is worth, as the factor replacing plain friction.
 *
 * On the flat the tyres carry the whole cornering force and the limit is
 * `mu · g · r`. Tip the road and part of the car's own weight points into the
 * corner instead, while the surface presses harder on the tyres:
 *
 *     v² = g · r · (mu · cos θ + sin θ) / (cos θ − mu · sin θ)
 *
 * At Indianapolis' nine degrees that is worth about a sixth more speed; on a
 * thirty-degree superspeedway it nearly doubles it, which is the whole reason
 * those places exist. The denominator goes to zero when the banking alone would
 * hold the car - a wall of death - so it is floored well before that. */
export function bankedGripFactor(mu: number, bankingDegrees: number): number {
  if (bankingDegrees <= 0) return mu;
  const theta = (bankingDegrees * Math.PI) / 180;
  const denominator = Math.max(0.15, Math.cos(theta) - mu * Math.sin(theta));
  return (mu * Math.cos(theta) + Math.sin(theta)) / denominator;
}

/** Net acceleration at a given speed. `launchGrip` is the tyres' grip:
 * however hard the engine pulls, the tyres decide what reaches the road. */
/** Height of the centre of gravity, as a share of the roof height.
 *
 * The one number here the dataset cannot supply. Where the engine sits would
 * settle it, and the source carries no such field for any car - not front, mid
 * or rear, not longitudinal or transverse - so a per-car figure would have to
 * be invented. A single share of the body height instead: a real car's centre
 * of gravity sits a little above a third of the way up, and low and tall cars
 * differ by their roofline, which is measured. */
const COG_HEIGHT_FACTOR = 0.38;

/** Share of the car's weight sitting on the driven axle at rest.
 *
 * Fifty-fifty, for the same reason: the static split follows from where the
 * engine is, and that is not in the data. What is in the data is the wheelbase
 * and the height, and those decide the part that actually varies with how hard
 * the car is accelerating. */
const STATIC_DRIVEN_SHARE = 0.5;

/** Drive force the tyres can take, at a given grip and against a given
 * resistance.
 *
 * Load moves rearward under acceleration by `m · a · h / L`, so a rear-driven
 * car presses its driven tyres down as it pulls and a front-driven one unloads
 * them - which is why a powerful front-driven car cannot use what it has, and
 * why a long, low car launches better than a short, tall one.
 *
 * The transfer depends on the acceleration and the acceleration depends on the
 * transfer, so it is solved rather than iterated:
 *
 *     F = mu · (s · W + sigma · m · a · k),   m · a = F - R
 *     F = mu · (s · W - sigma · k · R) / (1 - sigma · mu · k)
 *
 * with k = h / L and sigma +1 rear-driven, -1 front-driven, 0 for four-wheel
 * drive, where the transfer moves between driven axles and nets out. */
export function tractionLimitedDriveN(
  car: CarPhysicsInput,
  grip: number,
  resistanceN: number,
): number {
  const weightN = car.weightKg * G;
  if (car.drivetrain === "AWD") return grip * weightN;
  const k = (COG_HEIGHT_FACTOR * car.heightMm) / car.wheelbaseMm;
  const sigma = car.drivetrain === "RWD" ? 1 : -1;
  // Floored: a rear-driven car on enormous grip would otherwise divide by zero,
  // which is the wheelie the model has no business simulating.
  const denominator = Math.max(0.35, 1 - sigma * grip * k);
  return Math.max(0, (grip * (STATIC_DRIVEN_SHARE * weightN - sigma * k * resistanceN)) / denominator);
}

function accelerationMps2(
  car: CarPhysicsInput,
  gearbox: Gearbox,
  speedMps: number,
  launchGrip: number,
  gradientPercent: number,
  powerFactor = 1,
  dragFactor = 1,
): number {
  const dragN = dragForceN(car, speedMps) * dragFactor;
  const rollN = ROLLING_RESISTANCE * car.weightKg * G;
  const gradeN = car.weightKg * G * Math.sin(Math.atan(gradientPercent / 100));
  const resistanceN = dragN + rollN + gradeN;
  const tractionN = tractionLimitedDriveN(car, launchGrip, resistanceN);
  const driveN = Math.min(tractionN, driveForceN(car, gearbox, speedMps) * powerFactor);
  return (driveN - resistanceN) / car.weightKg;
}

/** Time from rest to 100 km/h on the flat for a given launch limit, including
 * the gearchanges. This is what gets solved against the car's real figure. */
export function simulate0to100(car: CarPhysicsInput, gearbox: Gearbox, launchGrip: number): number {
  const target = 100 * KPH_TO_MPS;
  const shifts = gearbox.shiftSpeeds;
  const shiftCost = SHIFT_TIME_S[car.gearboxKind];
  let v = 0;
  let t = 0;
  let nextShift = 0;

  while (v < target && t < 120) {
    const a = accelerationMps2(car, gearbox, v, launchGrip, 0);
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

/** Solves the grip at the driven tyres so the model reproduces the car's real
 * 0-100 time. Every other number in the model is measured; this one is what the
 * measurement pins down.
 *
 * A coefficient rather than a force, now that load transfer is in the model: the
 * force a car can put down changes with how hard it is accelerating, so only the
 * grip behind it is a constant of the car. */
export function solveLaunchGrip(car: CarPhysicsInput, gearbox = buildGearbox(car)): number {
  let low = 0.05; // hopeless
  let high = 3; // beyond any road tyre, even with the transfer helping
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (simulate0to100(car, gearbox, mid) > car.accel0to100s) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** Speed the car may not exceed at each step along the track. Corners cap it;
 * straights do not, because nothing but drag and the rev limiter should hold a
 * car back, and both of those act through the drive force rather than through a
 * ceiling imposed here. */
function speedLimitProfile(car: CarPhysicsInput, segments: Segment[], stepM: number): number[] {
  const limits: number[] = [];
  for (const seg of segments) {
    const steps = Math.max(1, Math.round(seg.lengthM / stepM));
    const cap =
      seg.kind === "corner"
        ? corneringSpeedCapMps(seg.radiusM, car, seg.bankingDegrees ?? 0)
        : Number.POSITIVE_INFINITY;
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

/** What a run is not doing at full strength.
 *
 * The engine's calibration - the traction limit solved against the car's real
 * 0-100 time - belongs to the car and is deliberately not re-solved when the
 * power is turned down: solving again would raise the traction limit to hit the
 * same 0-100 time and the power loss would cancel itself out. */
export interface RunModifiers {
  /** Share of the drive force the car has today, 1 being all of it. */
  powerFactor?: number;
  /** Share of the tyres' grip, 1 being fresh. Cornering speed goes with its
   * square root, braking and traction with the factor itself. */
  gripFactor?: number;
  /** Share of the car's own drag it is pushing. Below one for a car tucked into
   * the wake of another - the only thing in the model that depends on there
   * being a second car at all, which is why it exists for the race mode and
   * nothing else. */
  dragFactor?: number;
  /** The solved launch grip, when the caller has it already. Solving is the
   * expensive part of a run, and a lap simulated fifty times over does not need
   * it fifty times. */
  launchGrip?: number;
}

export function simulateRun(
  car: CarPhysicsInput,
  segments: Segment[],
  mods: RunModifiers = {},
): SimResult {
  const powerFactor = mods.powerFactor ?? 1;
  const gripFactor = mods.gripFactor ?? 1;
  const dragFactor = mods.dragFactor ?? 1;
  const totalLengthM = segments.reduce((sum, s) => sum + s.lengthM, 0);
  const stepM = Math.max(1, Math.min(5, totalLengthM / 4000));
  const limits = speedLimitProfile(car, segments, stepM).map((cap) =>
    // Cornering speed follows the square root of the grip, because the limit is
    // v^2 / r against the friction the tyres have.
    Number.isFinite(cap) ? cap * Math.sqrt(gripFactor) : cap,
  );
  const grades = gradientProfile(segments, stepM);
  const steps = limits.length;
  const baseLimits = [...limits];

  const gearbox = buildGearbox(car);
  const launchGrip = (mods.launchGrip ?? solveLaunchGrip(car, gearbox)) * gripFactor;
  const shifts = gearbox.shiftSpeeds;
  const shiftCost = SHIFT_TIME_S[car.gearboxKind];

  const sampleStepM = totalLengthM / TRACE_SAMPLES;
  const sectorBoundaries = Array.from({ length: SECTOR_COUNT }, (_, i) => ((i + 1) * totalLengthM) / SECTOR_COUNT);

  /** One trip around, with the brakes as good as `decels` says they are at each
   * point. Returns the speed at every step as well as the result, because how
   * hard the car braked is what heats the brakes for the next trip. */
  const lap = (decels: readonly number[]) => {
    // Backward pass: a corner has to be arrived at slowly enough, so its limit
    // reaches back up the track as far as the brakes need. This is what gives a
    // car a braking point instead of shedding speed instantly at the corner.
    const caps = [...baseLimits];
    for (let i = steps - 2; i >= 0; i--) {
      const reachable = Math.sqrt(caps[i + 1] * caps[i + 1] + 2 * decels[i] * stepM);
      caps[i] = Math.min(caps[i], reachable);
    }

    // Forward pass: accelerate as hard as the engine, drag and gradient allow,
    // never exceeding the limit profile.
    const sectorTimesMs: number[] = [];
    const speeds = new Array<number>(steps + 1);
    let nextShift = 0;
    let v = 0;
    let t = 0;
    let distance = 0;
    let nextSampleAt = sampleStepM;
    const trace: TracePoint[] = [{ distanceM: 0, timeS: 0, speedKph: 0 }];

    for (let i = 0; i < steps; i++) {
      const limit = caps[i];
      if (v > limit) v = limit; // braking already accounted for by the backward pass
      speeds[i] = v;

      const a = accelerationMps2(car, gearbox, v, launchGrip, grades[i], powerFactor, dragFactor);
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
    speeds[steps] = v;

    const totalTimeMs = Math.round(t * 1000);
    while (sectorTimesMs.length < SECTOR_COUNT) sectorTimesMs.push(totalTimeMs);
    if ((trace[trace.length - 1]?.distanceM ?? 0) < distance) {
      trace.push({ distanceM: distance, timeS: t, speedKph: v / KPH_TO_MPS });
    }
    return {
      result: { totalTimeMs, trace, sectorTimesMs, distanceM: distance, peakBrakeHeat: 0 },
      speeds,
    };
  };

  const coldDecel = brakingDecelMps2(car) * gripFactor;
  const first = lap(new Array<number>(steps).fill(coldDecel));

  // Second trip, with the brakes as hot as the first one made them. One
  // iteration rather than a loop to convergence: fading makes the car brake
  // earlier and so a little more gently, which cools it - the feedback works
  // against itself, and a second round moves the lap by well under a
  // thousandth. A lap that never troubles the brakes skips it entirely.
  const heat = brakeHeatProfile(car, first.speeds, stepM);
  const peakBrakeHeat = heat.length ? Math.max(...heat) : 0;
  if (peakBrakeHeat <= 1) return { ...first.result, peakBrakeHeat };
  return { ...lap(heat.map((h) => coldDecel * brakeFadeFactor(h))).result, peakBrakeHeat };
}

/** A run against the speedometer: from one speed to another, and on a standing
 * test back to a standstill.
 *
 * The clock is the real one; the distances in the trace are not. They are
 * stretched so that every car covers the drawn line exactly as it finishes,
 * because the line is a prop - the test is over when the speed is reached, not
 * when a distance is. A car that cannot reach the speed at all is given the
 * timeout, which is a placeholder and not a measurement: without it a car whose
 * top speed is below the target would simply never produce a time.
 *
 * `distanceM` still carries the metres the car really used, so anything that
 * wants an average speed gets an honest one. */
export function simulateSpeedTest(
  car: CarPhysicsInput,
  test: SpeedTest,
  drawnLengthM: number,
  mods: RunModifiers = {},
): SimResult {
  const powerFactor = mods.powerFactor ?? 1;
  const dragFactor = mods.dragFactor ?? 1;
  const gearbox = buildGearbox(car);
  const launchGrip = mods.launchGrip ?? solveLaunchGrip(car, gearbox);
  const shiftCost = SHIFT_TIME_S[car.gearboxKind];
  const from = test.fromKph * KPH_TO_MPS;
  const target = test.toKph * KPH_TO_MPS;

  let v = from;
  let t = 0;
  let distance = 0;
  // Gears below the rolling start are already behind the car.
  let nextShift = gearbox.shiftSpeeds.filter((s) => s <= from).length;
  const raw: TracePoint[] = [{ distanceM: 0, timeS: 0, speedKph: test.fromKph }];

  let stalled = false;
  while (v < target && t < test.timeoutS) {
    const a = accelerationMps2(car, gearbox, v, launchGrip, 0, powerFactor, dragFactor);
    // Not "a <= 0": as a car nears the speed drag holds it at, the acceleration
    // creeps towards zero and the run would crawl to the timeout a millimetre
    // at a time. Below a fiftieth of a g it is not going to get there.
    if (a < 0.2) {
      stalled = true;
      break;
    }
    const vNext = v + a * DT;
    distance += ((v + vNext) / 2) * DT;
    v = vNext;
    t += DT;
    while (nextShift < gearbox.shiftSpeeds.length && v >= gearbox.shiftSpeeds[nextShift]) {
      t += shiftCost;
      nextShift++;
    }
    raw.push({ distanceM: distance, timeS: t, speedKph: v / KPH_TO_MPS });
  }

  if (stalled || v < target) {
    const timedOut: TracePoint[] = [
      { distanceM: 0, timeS: 0, speedKph: test.fromKph },
      { distanceM: drawnLengthM, timeS: test.timeoutS, speedKph: v / KPH_TO_MPS },
    ];
    const timeoutMs = Math.round(test.timeoutS * 1000);
    return {
      totalTimeMs: timeoutMs,
      trace: timedOut,
      sectorTimesMs: Array.from({ length: SECTOR_COUNT }, () => timeoutMs),
      distanceM: distance,
      peakBrakeHeat: 0,
    };
  }

  if (test.brakeToStop) {
    const decel = brakingDecelMps2(car);
    while (v > 0.5 && t < test.timeoutS) {
      const vNext = Math.max(0, v - decel * DT);
      distance += ((v + vNext) / 2) * DT;
      v = vNext;
      t += DT;
      raw.push({ distanceM: distance, timeS: t, speedKph: v / KPH_TO_MPS });
    }
    raw.push({ distanceM: distance, timeS: t, speedKph: 0 });
  }

  // Stretch the run onto the drawn line, thinned to the usual trace length.
  const scale = distance > 0 ? drawnLengthM / distance : 0;
  const step = Math.max(1, Math.floor(raw.length / TRACE_SAMPLES));
  const trace: TracePoint[] = [];
  for (let i = 0; i < raw.length; i += step) {
    trace.push({ ...raw[i], distanceM: raw[i].distanceM * scale });
  }
  const last = raw[raw.length - 1];
  trace.push({ ...last, distanceM: last.distanceM * scale });

  const totalTimeMs = Math.round(t * 1000);
  const sectorTimesMs = Array.from({ length: SECTOR_COUNT }, (_, i) => {
    const at = ((i + 1) / SECTOR_COUNT) * distance;
    const point = raw.find((p) => p.distanceM >= at) ?? last;
    return Math.round(point.timeS * 1000);
  });

  return { totalTimeMs, trace, sectorTimesMs, distanceM: distance, peakBrakeHeat: 0 };
}

/** What the track's own air does to a car: thinner air is less drag to push
 * and less oxygen to burn. Composes with whatever else the caller is doing to
 * the run, which is why it comes back as modifiers rather than being applied. */
export function altitudeModifiers(
  car: CarPhysicsInput,
  altitudeM: number | undefined,
): { dragFactor: number; powerFactor: number } {
  if (!altitudeM) return { dragFactor: 1, powerFactor: 1 };
  return {
    dragFactor: airDensityRatio(altitudeM),
    powerFactor: altitudePowerFactor(car, altitudeM),
  };
}

/** Runs whichever kind of thing the track is. */
export function simulateTrack(
  car: CarPhysicsInput,
  track: { segments: Segment[]; lengthM: number; speedTest?: SpeedTest; altitudeM?: number },
): SimResult {
  const air = altitudeModifiers(car, track.altitudeM);
  return track.speedTest
    ? simulateSpeedTest(car, track.speedTest, track.lengthM, air)
    : simulateRun(car, track.segments, air);
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
