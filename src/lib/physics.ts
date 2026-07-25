import type { Segment } from "./track-types";

const G = 9.81;
const KPH_TO_MPS = 1 / 3.6;
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
}

export interface TracePoint {
  distanceM: number;
  timeS: number;
  speedKph: number;
}

export interface SimResult {
  totalTimeMs: number;
  trace: TracePoint[];
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

/**
 * Solves a_ref so that v(t) = v_top * tanh(a_ref * t / v_top) passes exactly
 * through the car's real 0-100 km/h time. This is the only calibration step -
 * everything else follows from the two real stats (top speed, 0-100 time).
 */
function solveARef(topSpeedMps: number, accel0to100s: number): number {
  const v100 = 100 * KPH_TO_MPS;
  if (v100 >= topSpeedMps) {
    // Edge case: car's top speed is at/below 100 km/h. Fall back to a constant
    // acceleration so the formula stays well-defined.
    return v100 / accel0to100s;
  }
  const x = v100 / topSpeedMps;
  const artanh = 0.5 * Math.log((1 + x) / (1 - x));
  return (topSpeedMps * artanh) / accel0to100s;
}

/**
 * Max speed through a corner. mu (tire/asphalt friction) is a shared physics
 * constant applied to every car equally - not an invented per-car stat. The
 * only per-car inputs are the real, required fields: power/weight, torque/weight
 * and drivetrain, used as a small proxy for how much grip a sportier car's
 * tires/suspension likely offer (we have no tire or aero data per car).
 */
function corneringSpeedCapMps(radiusM: number, car: CarPhysicsInput): number {
  const baseMu = 0.95;
  const specificPowerPsPerKg = car.powerPs / car.weightKg;
  const specificTorqueNmPerKg = car.torqueNm / car.weightKg;
  const drivetrainFactor = car.drivetrain === "AWD" ? 1.05 : car.drivetrain === "FWD" ? 0.95 : 1.0;
  const gripFactor = drivetrainFactor * (1 + 0.3 * specificPowerPsPerKg + 0.1 * specificTorqueNmPerKg);
  return Math.sqrt(baseMu * gripFactor * G * radiusM);
}

export function simulateRun(car: CarPhysicsInput, segments: Segment[]): SimResult {
  const topSpeedMps = car.topSpeedKph * KPH_TO_MPS;
  const aRef = solveARef(topSpeedMps, car.accel0to100s);
  const totalLengthM = segments.reduce((sum, s) => sum + s.lengthM, 0);
  const sampleStepM = totalLengthM / TRACE_SAMPLES;

  let v = 0;
  let t = 0;
  let distanceSoFar = 0;
  let nextSampleAt = 0;
  const trace: TracePoint[] = [];

  const pushSample = () => {
    trace.push({ distanceM: distanceSoFar, timeS: t, speedKph: v / KPH_TO_MPS });
    nextSampleAt += sampleStepM;
  };
  pushSample();

  for (const seg of segments) {
    let remaining = seg.lengthM;
    const gradientPercent = seg.gradientPercent ?? 0;
    const theta = Math.atan(gradientPercent / 100);
    const gradeDecel = G * Math.sin(theta);

    let vCap = topSpeedMps;
    if (seg.kind === "corner") {
      vCap = Math.min(topSpeedMps, corneringSpeedCapMps(seg.radiusM, car));
      if (v > vCap) v = vCap; // braking ahead of the corner is assumed instantaneous (no brake stat available)
    }

    while (remaining > 1e-6) {
      const straightAccel = aRef * (1 - Math.pow(Math.min(v, vCap) / topSpeedMps, 2));
      const a = straightAccel - gradeDecel;
      let vNext = v + a * DT;
      if (vNext > vCap) vNext = vCap;
      if (vNext < 0) vNext = 0;
      const dx = ((v + vNext) / 2) * DT;

      if (dx >= remaining) {
        const frac = dx > 0 ? remaining / dx : 1;
        const dtPartial = DT * frac;
        t += dtPartial;
        distanceSoFar += remaining;
        v = Math.min(Math.max(v + a * dtPartial, 0), vCap);
        remaining = 0;
      } else {
        t += DT;
        distanceSoFar += dx;
        v = vNext;
        remaining -= dx;
      }

      while (distanceSoFar >= nextSampleAt && trace.length < TRACE_SAMPLES + 1) {
        pushSample();
      }
    }
  }

  if (trace[trace.length - 1]?.distanceM < totalLengthM) {
    trace.push({ distanceM: totalLengthM, timeS: t, speedKph: v / KPH_TO_MPS });
  }

  return { totalTimeMs: Math.round(t * 1000), trace };
}
