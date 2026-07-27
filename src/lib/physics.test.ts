import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  brakingDecelMps2,
  buildGearbox,
  driveForceN,
  gearTopSpeedsMps,
  ratedSpeedRadS,
  torqueFactor,
  dragForceN,
  dragLimitedTopSpeedMps,
  effectiveTopSpeedMps,
  frontalAreaM2,
  simulateRun,
  simulateSpeedTest,
  wheelPowerW,
  type CarPhysicsInput,
} from "./physics";
import type { Segment, SpeedTest } from "./track-types";

const golfGti: CarPhysicsInput = {
  topSpeedKph: 250,
  accel0to100s: 6.2,
  powerPs: 245,
  weightKg: 1400,
  torqueNm: 370,
  drivetrain: "FWD",
  dragCoefficient: 0.3,
  widthMm: 1799,
  heightMm: 1492,
  brakeFront: "ventilated-disc" as const,
  brakeRear: "disc" as const,
  tyreWidthMm: 225,
  gearCount: 6,
  manualGearbox: true,
};

const veyron: CarPhysicsInput = {
  topSpeedKph: 407,
  accel0to100s: 2.5,
  powerPs: 1001,
  weightKg: 1888,
  torqueNm: 1250,
  drivetrain: "AWD",
  dragCoefficient: 0.36,
  widthMm: 1998,
  heightMm: 1204,
  brakeFront: "ventilated-disc" as const,
  brakeRear: "ventilated-disc" as const,
  tyreWidthMm: 365,
  gearCount: 7,
  manualGearbox: false,
};

const longStraight: Segment[] = [{ kind: "straight", lengthM: 8000, gradientPercent: 0 }];

/** Time at which the car first reaches `speedKph`, read off the simulation trace. */
function timeToReachKph(car: CarPhysicsInput, speedKph: number): number {
  const { trace } = simulateRun(car, longStraight);
  const idx = trace.findIndex((p) => p.speedKph >= speedKph);
  assert.notEqual(idx, -1, `car never reached ${speedKph} km/h`);
  const after = trace[idx];
  const before = trace[idx - 1];
  if (!before) return after.timeS;
  // Linear interpolation between samples, which are spaced by distance.
  const t = (speedKph - before.speedKph) / (after.speedKph - before.speedKph);
  return before.timeS + (after.timeS - before.timeS) * t;
}

describe("acceleration curve", () => {
  // The launch limit is solved so the model reproduces the car's real 0-100
  // time. Every other figure is measured; if this drifts, every lap is wrong.
  it("reproduces each car's real 0-100 km/h time", () => {
    for (const car of [golfGti, veyron]) {
      const measured = timeToReachKph(car, 100);
      assert.ok(
        Math.abs(measured - car.accel0to100s) < 0.15,
        `expected ~${car.accel0to100s}s to 100 km/h, simulated ${measured.toFixed(2)}s`,
      );
    }
  });

  // Nothing artificial holds a car back: it runs until the air stops it or the
  // engine runs out of revs in top gear.
  it("runs to where drag stops it, not to a figure from the spec sheet", () => {
    for (const car of [golfGti, veyron]) {
      const { trace } = simulateRun(car, longStraight);
      const fastest = Math.max(...trace.map((p) => p.speedKph));
      const dragLimit = dragLimitedTopSpeedMps(car) * 3.6;
      assert.ok(
        Math.abs(fastest - dragLimit) < dragLimit * 0.05,
        `${fastest.toFixed(1)} km/h should approach the drag limit of ${dragLimit.toFixed(1)}`,
      );
    }
  });

  it("ignores a lowered top-speed figure entirely", () => {
    const limited = { ...veyron, topSpeedKph: 250 };
    const fastest = Math.max(...simulateRun(limited, longStraight).trace.map((p) => p.speedKph));
    assert.ok(fastest > 300, `a limiter should not cap the car, but it stopped at ${fastest.toFixed(0)}`);
  });

  it("accelerates hardest from a standstill and tapers off", () => {
    const { trace } = simulateRun(golfGti, longStraight);
    const speedAt = (s: number) => trace.find((p) => p.timeS >= s)!.speedKph;
    const firstTwoSeconds = speedAt(2) - speedAt(0);
    const secondTwoSeconds = speedAt(4) - speedAt(2);
    assert.ok(
      firstTwoSeconds > secondTwoSeconds,
      "acceleration should decrease as speed rises, like a real car",
    );
  });
});

describe("corners", () => {
  it("costs time compared to the same distance in a straight line", () => {
    const straight: Segment[] = [{ kind: "straight", lengthM: 1000 }];
    const withCorner: Segment[] = [
      { kind: "straight", lengthM: 500 },
      { kind: "corner", lengthM: 100, radiusM: 30, dir: "right" },
      { kind: "straight", lengthM: 400 },
    ];
    assert.ok(simulateRun(golfGti, withCorner).totalTimeMs > simulateRun(golfGti, straight).totalTimeMs);
  });

  it("lets a car through a wide corner faster than a tight one", () => {
    const corner = (radiusM: number): Segment[] => [
      { kind: "straight", lengthM: 500 },
      { kind: "corner", lengthM: 100, radiusM, dir: "right" },
    ];
    assert.ok(simulateRun(golfGti, corner(200)).totalTimeMs < simulateRun(golfGti, corner(20)).totalTimeMs);
  });

  it("turn direction does not affect the time - it is only for drawing", () => {
    const base = (dir: "left" | "right"): Segment[] => [
      { kind: "straight", lengthM: 400 },
      { kind: "corner", lengthM: 120, radiusM: 45, dir },
      { kind: "straight", lengthM: 300 },
    ];
    assert.equal(simulateRun(golfGti, base("left")).totalTimeMs, simulateRun(golfGti, base("right")).totalTimeMs);
  });
});

describe("gradients", () => {
  it("makes a climb slower and a descent faster than flat ground", () => {
    const road = (gradientPercent: number): Segment[] => [
      { kind: "straight", lengthM: 2000, gradientPercent },
    ];
    const uphill = simulateRun(golfGti, road(10)).totalTimeMs;
    const flat = simulateRun(golfGti, road(0)).totalTimeMs;
    const downhill = simulateRun(golfGti, road(-10)).totalTimeMs;
    assert.ok(uphill > flat, "uphill should be slower than flat");
    assert.ok(downhill < flat, "downhill should be faster than flat");
  });
});

describe("car comparison", () => {
  it("puts the faster car ahead on every kind of segment", () => {
    const tracks: Segment[][] = [
      [{ kind: "straight", lengthM: 400 }],
      [
        { kind: "straight", lengthM: 600 },
        { kind: "corner", lengthM: 150, radiusM: 60, dir: "right" },
        { kind: "straight", lengthM: 600, gradientPercent: 6 },
      ],
    ];
    for (const segments of tracks) {
      assert.ok(simulateRun(veyron, segments).totalTimeMs < simulateRun(golfGti, segments).totalTimeMs);
    }
  });
});

describe("trace", () => {
  it("starts at rest and ends at the finish line", () => {
    const segments: Segment[] = [
      { kind: "straight", lengthM: 500 },
      { kind: "corner", lengthM: 100, radiusM: 50, dir: "left" },
    ];
    const { trace, totalTimeMs } = simulateRun(golfGti, segments);
    assert.equal(trace[0].distanceM, 0);
    assert.equal(trace[0].speedKph, 0);
    const last = trace[trace.length - 1];
    assert.ok(Math.abs(last.distanceM - 600) < 1, `trace ended at ${last.distanceM}m, expected 600m`);
    assert.ok(Math.abs(last.timeS * 1000 - totalTimeMs) < 20);
  });

  it("increases monotonically in both distance and time", () => {
    const { trace } = simulateRun(veyron, [
      { kind: "straight", lengthM: 800 },
      { kind: "corner", lengthM: 200, radiusM: 40, dir: "right" },
      { kind: "straight", lengthM: 800 },
    ]);
    for (let i = 1; i < trace.length; i++) {
      assert.ok(trace[i].distanceM >= trace[i - 1].distanceM, "distance went backwards");
      assert.ok(trace[i].timeS >= trace[i - 1].timeS, "time went backwards");
    }
  });
});

describe("aerodynamics", () => {
  it("computes frontal area from the car's own dimensions", () => {
    // 0.85 x 1.799 m x 1.492 m
    assert.ok(Math.abs(frontalAreaM2(golfGti) - 2.282) < 0.01);
  });

  it("makes drag rise with the square of speed", () => {
    const at50 = dragForceN(golfGti, 50);
    const at100 = dragForceN(golfGti, 100);
    assert.ok(Math.abs(at100 / at50 - 4) < 0.01, `expected 4x, got ${(at100 / at50).toFixed(2)}x`);
  });

  it("takes wheel power from the engine, less transmission losses", () => {
    assert.ok(Math.abs(wheelPowerW(golfGti) - 245 * 735.5 * 0.85) < 1);
  });

  // Most of this field is electronically limited, so the listed top speed is a
  // limiter rather than the point where drag wins. Reading power back out of it
  // would rob every limited car of most of its engine.
  // The quoted top speed says how the manufacturer chose to restrain the car,
  // not what it can do, so it must not reach the model at all.
  it("takes nothing at all from the quoted top speed", () => {
    const limited = { ...veyron, topSpeedKph: 250 };
    assert.equal(wheelPowerW(limited), wheelPowerW(veyron));
    assert.equal(effectiveTopSpeedMps(limited), effectiveTopSpeedMps(veyron));
    assert.equal(
      simulateRun(limited, longStraight).totalTimeMs,
      simulateRun(veyron, longStraight).totalTimeMs,
    );
  });

  // The point of modelling drag: with the same engine, the slippery car pulls
  // away down a long straight.
  it("lets the slipperier of two otherwise identical cars go faster", () => {
    const slippery = { ...golfGti, dragCoefficient: 0.24, topSpeedKph: 400 };
    const boxy = { ...golfGti, dragCoefficient: 0.45, topSpeedKph: 400 };
    assert.ok(dragLimitedTopSpeedMps(slippery) > dragLimitedTopSpeedMps(boxy));
    const straight: Segment[] = [{ kind: "straight", lengthM: 4000 }];
    assert.ok(simulateRun(slippery, straight).totalTimeMs < simulateRun(boxy, straight).totalTimeMs);
  });

  // Top speed is no longer a ceiling the car is clamped to: it is where drive
  // force and drag balance, so the car creeps up on it and never quite arrives.
  it("approaches the top speed rather than snapping to it", () => {
    const { trace } = simulateRun(golfGti, [{ kind: "straight", lengthM: 6000 }]);
    const top = golfGti.topSpeedKph;
    const reached90 = trace.find((p) => p.speedKph >= top * 0.9);
    const reached99 = trace.find((p) => p.speedKph >= top * 0.99);
    assert.ok(reached90, "should get to 90% of top speed");
    // Closing the last tenth takes far longer than reaching 90% did, which is
    // what a drag-limited approach looks like.
    assert.ok(
      !reached99 || reached99.distanceM > reached90!.distanceM * 2,
      "the last stretch to top speed should cost disproportionate distance",
    );
  });
});

describe("braking", () => {
  it("stops a car on discs harder than one on drums", () => {
    const discs = brakingDecelMps2({ ...golfGti, brakeFront: "ventilated-disc", brakeRear: "ventilated-disc" });
    const drums = brakingDecelMps2({ ...golfGti, brakeFront: "drum", brakeRear: "drum" });
    assert.ok(discs > drums);
  });

  it("weighs the front brakes more heavily, as braking loads the front", () => {
    const frontDiscs = brakingDecelMps2({ ...golfGti, brakeFront: "ventilated-disc", brakeRear: "drum" });
    const rearDiscs = brakingDecelMps2({ ...golfGti, brakeFront: "drum", brakeRear: "ventilated-disc" });
    assert.ok(frontDiscs > rearDiscs);
  });

  // Weaker brakes mean braking has to start earlier, which costs time on the
  // approach - the car was quick before, it just cannot carry it as long.
  it("costs time on a track with a corner to brake for", () => {
    const approach: Segment[] = [
      { kind: "straight", lengthM: 1200 },
      { kind: "corner", lengthM: 80, radiusM: 30, dir: "right" },
      { kind: "straight", lengthM: 400 },
    ];
    const good = simulateRun({ ...golfGti, brakeFront: "ventilated-disc", brakeRear: "ventilated-disc" }, approach);
    const poor = simulateRun({ ...golfGti, brakeFront: "drum", brakeRear: "drum" }, approach);
    assert.ok(poor.totalTimeMs > good.totalTimeMs, "drums should lose time into a corner");
  });

  it("changes nothing on a straight, where no braking happens", () => {
    const straight: Segment[] = [{ kind: "straight", lengthM: 1000 }];
    const good = simulateRun({ ...golfGti, brakeFront: "ventilated-disc", brakeRear: "ventilated-disc" }, straight);
    const poor = simulateRun({ ...golfGti, brakeFront: "drum", brakeRear: "drum" }, straight);
    assert.equal(good.totalTimeMs, poor.totalTimeMs);
  });
});

describe("tyres", () => {
  it("carries more speed through a corner on wider tyres", () => {
    const corner: Segment[] = [
      { kind: "straight", lengthM: 400 },
      { kind: "corner", lengthM: 150, radiusM: 45, dir: "right" },
    ];
    const wide = simulateRun({ ...golfGti, tyreWidthMm: 295 }, corner);
    const narrow = simulateRun({ ...golfGti, tyreWidthMm: 175 }, corner);
    assert.ok(wide.totalTimeMs < narrow.totalTimeMs);
  });

  it("gives the same tyre less to work with under a heavier car", () => {
    const corner: Segment[] = [{ kind: "corner", lengthM: 200, radiusM: 50, dir: "right" }];
    const light = simulateRun({ ...golfGti, weightKg: 1100 }, corner);
    const heavy = simulateRun({ ...golfGti, weightKg: 2100 }, corner);
    assert.ok(light.totalTimeMs < heavy.totalTimeMs);
  });
});

describe("gearbox", () => {
  // Every shift is a moment with no drive. More ratios means more of them.
  it("costs time for each additional gear", () => {
    const straight: Segment[] = [{ kind: "straight", lengthM: 2000 }];
    const few = simulateRun({ ...golfGti, gearCount: 4 }, straight).totalTimeMs;
    const many = simulateRun({ ...golfGti, gearCount: 9 }, straight).totalTimeMs;
    assert.ok(many > few, `9 gears (${many}ms) should cost more than 4 (${few}ms)`);
  });

  it("costs a manual more per shift than an automatic", () => {
    const straight: Segment[] = [{ kind: "straight", lengthM: 2000 }];
    const manual = simulateRun({ ...golfGti, manualGearbox: true }, straight).totalTimeMs;
    const auto = simulateRun({ ...golfGti, manualGearbox: false }, straight).totalTimeMs;
    assert.ok(manual > auto);
  });
});

const toRpm = (radS: number) => (radS * 60) / (2 * Math.PI);

describe("engine speed", () => {
  // Power and torque together imply where the power peak sits. These are the
  // real figures, and the model lands close to the published engine speeds.
  it("puts a torquey diesel low and a screamer high", () => {
    const gtd = { ...golfGti, powerPs: 170, torqueNm: 350 };
    const s2000 = { ...golfGti, powerPs: 240, torqueNm: 208 };
    assert.ok(toRpm(ratedSpeedRadS(gtd)) < 4000, `${toRpm(ratedSpeedRadS(gtd))}`);
    assert.ok(toRpm(ratedSpeedRadS(s2000)) > 8000, `${toRpm(ratedSpeedRadS(s2000))}`);
  });

  it("lands within a few hundred rpm of the real Chiron", () => {
    const rpm = toRpm(ratedSpeedRadS({ ...veyron, powerPs: 1500, torqueNm: 1600 }));
    assert.ok(Math.abs(rpm - 6700) < 400, `${rpm} should be near 6700`);
  });

  it("refuses a nonsense engine speed even for a broken torque figure", () => {
    const silly = { ...golfGti, torqueNm: 1 };
    const rpm = toRpm(ratedSpeedRadS(silly));
    assert.ok(rpm >= 2000 && rpm <= 9600, `${rpm} should be clamped`);
  });
});

describe("torque curve", () => {
  it("holds almost all its torque at the rated speed", () => {
    const rated = ratedSpeedRadS(golfGti);
    assert.ok(torqueFactor(golfGti, rated) > 0.95);
    assert.ok(torqueFactor(golfGti, rated) < 1);
  });

  it("never claims more than peak torque", () => {
    const rated = ratedSpeedRadS(golfGti);
    for (let x = 0; x <= 1.2; x += 0.01) {
      assert.ok(torqueFactor(golfGti, rated * x) <= 1 + 1e-9, `${x} of rated exceeds peak torque`);
    }
  });

  it("is weaker off idle than at the peak", () => {
    const rated = ratedSpeedRadS(golfGti);
    assert.ok(torqueFactor(golfGti, rated * 0.05) < torqueFactor(golfGti, rated * 0.6));
  });

  it("falls away past the rated speed and stops at the redline", () => {
    const rated = ratedSpeedRadS(golfGti);
    assert.ok(torqueFactor(golfGti, rated * 1.05) < torqueFactor(golfGti, rated));
    assert.equal(torqueFactor(golfGti, rated * 1.2), 0);
  });

  // Power is torque times engine speed, so a curve that peaked after the rated
  // speed would mean the car makes more than its rated power.
  it("makes its most power at the rated speed", () => {
    const rated = ratedSpeedRadS(golfGti);
    const power = (x: number) => torqueFactor(golfGti, rated * x) * rated * x;
    for (const x of [0.5, 0.7, 0.9, 1.05, 1.09]) {
      assert.ok(power(x) <= power(1) + 1e-9, `power at ${x} of rated exceeds the peak`);
    }
  });
});

describe("gear ratios", () => {
  it("gives one ratio per gear, each taller than the last", () => {
    const speeds = gearTopSpeedsMps({ ...golfGti, gearCount: 6 });
    assert.equal(speeds.length, 6);
    for (let i = 1; i < speeds.length; i++) assert.ok(speeds[i] > speeds[i - 1]);
  });

  it("takes bigger steps with fewer gears", () => {
    const four = gearTopSpeedsMps({ ...golfGti, gearCount: 4 });
    const eight = gearTopSpeedsMps({ ...golfGti, gearCount: 8 });
    assert.ok(four[1] / four[0] > eight[1] / eight[0]);
  });

  // Gearing to the quoted top speed would turn an electronic limiter into a
  // mechanical ceiling the real car does not have.
  it("gears past a limiter rather than to it", () => {
    const limited = gearTopSpeedsMps({ ...veyron, topSpeedKph: 250 });
    assert.ok(limited[limited.length - 1] * 3.6 > 300);
  });

  it("gives a single-speed car one ratio and no shifts", () => {
    const ev = { ...golfGti, gearCount: 1 };
    assert.equal(gearTopSpeedsMps(ev).length, 1);
    assert.deepEqual(buildGearbox(ev).shiftSpeeds, []);
  });

  it("changes gear before the engine runs out of revs", () => {
    const gearbox = buildGearbox(golfGti);
    assert.equal(gearbox.shiftSpeeds.length, golfGti.gearCount - 1);
    gearbox.shiftSpeeds.forEach((v, i) => {
      assert.ok(v <= gearbox.gearTopSpeeds[i] * 1.1 + 1e-9, `shift ${i + 1} is past the redline`);
      assert.ok(v > 0);
    });
  });

  it("pulls hardest in first gear and least in top", () => {
    const gearbox = buildGearbox(golfGti);
    const inFirst = driveForceN(golfGti, gearbox, gearbox.gearTopSpeeds[0] * 0.6);
    const inTop = driveForceN(golfGti, gearbox, gearbox.gearTopSpeeds[gearbox.gearTopSpeeds.length - 1] * 0.6);
    assert.ok(inFirst > inTop);
  });

  // Same power, same top speed, same gear count: gearing follows the rated
  // speed, so both sit at the same point on their curves. Only the shape of
  // the curve can tell them apart - which is exactly what the torque figure is
  // in the model for.
  it("lets the broad engine pull harder off idle and the peaky one past the peak", () => {
    const diesel = { ...golfGti, powerPs: 220, torqueNm: 450 };
    const screamer = { ...golfGti, powerPs: 220, torqueNm: 200 };
    const dGear = buildGearbox(diesel);
    const sGear = buildGearbox(screamer);
    const firstGear = dGear.gearTopSpeeds[0];
    assert.deepEqual(dGear.gearTopSpeeds, sGear.gearTopSpeeds, "gearing should be identical");
    assert.ok(
      driveForceN(diesel, dGear, firstGear * 0.15) > driveForceN(screamer, sGear, firstGear * 0.15),
      "the diesel should pull better just off idle",
    );
    assert.ok(
      driveForceN(screamer, sGear, firstGear * 1.08) > driveForceN(diesel, dGear, firstGear * 1.08),
      "the screamer should hold on better past the power peak",
    );
  });

  // Crawling out of a hairpin is where a broad powerband earns its keep.
  it("gets the broad engine out of a slow corner quicker", () => {
    const diesel = { ...golfGti, powerPs: 220, torqueNm: 450 };
    const screamer = { ...golfGti, powerPs: 220, torqueNm: 200 };
    const hairpin: Segment[] = [
      { kind: "straight", lengthM: 200 },
      { kind: "corner", lengthM: 60, radiusM: 15, dir: "right" },
      { kind: "straight", lengthM: 400 },
    ];
    assert.ok(simulateRun(diesel, hairpin).totalTimeMs < simulateRun(screamer, hairpin).totalTimeMs);
  });
});

describe("sector times", () => {
  const track: Segment[] = [
    { kind: "straight", lengthM: 900 },
    { kind: "corner", lengthM: 150, radiusM: 40, dir: "right" },
    { kind: "straight", lengthM: 900 },
  ];

  it("reports one cumulative time per sector, ending at the lap time", () => {
    const { sectorTimesMs, totalTimeMs } = simulateRun(golfGti, track);
    assert.equal(sectorTimesMs.length, 3);
    assert.equal(sectorTimesMs[2], totalTimeMs);
  });

  it("increases from sector to sector, since the times are cumulative", () => {
    const { sectorTimesMs } = simulateRun(golfGti, track);
    assert.ok(sectorTimesMs[0] < sectorTimesMs[1]);
    assert.ok(sectorTimesMs[1] < sectorTimesMs[2]);
  });

  it("gives the faster car a lower time in every sector", () => {
    const slow = simulateRun(golfGti, track).sectorTimesMs;
    const fast = simulateRun(veyron, track).sectorTimesMs;
    for (let i = 0; i < 3; i++) assert.ok(fast[i] < slow[i], `sector ${i + 1}`);
  });
});

describe("simulateSpeedTest", () => {
  const standing: SpeedTest = { fromKph: 0, toKph: 100, brakeToStop: true, timeoutS: 120 };
  const rolling: SpeedTest = { fromKph: 50, toKph: 100, brakeToStop: false, timeoutS: 120 };

  it("reproduces the car's own 0-100 time before it starts braking", () => {
    // The accelerating half is the figure the launch limit was solved against,
    // so it has to come back out of a standing test.
    const toHundred: SpeedTest = { ...standing, brakeToStop: false };
    const s = simulateSpeedTest(golfGti, toHundred, 400).totalTimeMs / 1000;
    assert.ok(Math.abs(s - golfGti.accel0to100s) < 0.15, `read ${s.toFixed(2)} s`);
  });

  it("keeps the clock running through the braking", () => {
    const rollOn = simulateSpeedTest(golfGti, { ...standing, brakeToStop: false }, 400);
    const andBack = simulateSpeedTest(golfGti, standing, 400);
    assert.ok(andBack.totalTimeMs > rollOn.totalTimeMs);
    assert.ok(andBack.distanceM > rollOn.distanceM);
  });

  it("rewards the better brakes on the way back down", () => {
    const good = simulateSpeedTest({ ...golfGti, brakeFront: "ventilated-disc", brakeRear: "ventilated-disc" }, standing, 400);
    const poor = simulateSpeedTest({ ...golfGti, brakeFront: "drum", brakeRear: "drum" }, standing, 400);
    assert.ok(good.totalTimeMs < poor.totalTimeMs);
  });

  it("is quicker from a rolling start than from rest", () => {
    const fromRest = simulateSpeedTest(golfGti, { ...standing, brakeToStop: false }, 400);
    const fromFifty = simulateSpeedTest(golfGti, rolling, 300);
    assert.ok(fromFifty.totalTimeMs < fromRest.totalTimeMs);
  });

  it("hands out the timeout to a car that cannot get there", () => {
    // 40 PS in three tonnes of barn door: 100 km/h is not happening.
    const hopeless: CarPhysicsInput = {
      ...golfGti,
      powerPs: 40,
      torqueNm: 90,
      weightKg: 3000,
      dragCoefficient: 0.9,
      widthMm: 2200,
      heightMm: 2600,
      accel0to100s: 60,
    };
    const run = simulateSpeedTest(hopeless, standing, 400);
    assert.equal(run.totalTimeMs, 120_000);
    assert.equal(run.trace[run.trace.length - 1].distanceM, 400);
  });

  it("draws the run across the whole line whatever it really covered", () => {
    for (const car of [golfGti, veyron]) {
      const run = simulateSpeedTest(car, standing, 400);
      assert.ok(Math.abs(run.trace[run.trace.length - 1].distanceM - 400) < 1);
      // A Veyron needs about seventy metres for the whole thing, a Golf twice
      // that: the drawn line is a prop, the metres are the car's own.
      assert.ok(run.distanceM > 50 && run.distanceM < 1000, `${run.distanceM} m`);
    }
  });

  it("gives the quicker car the shorter time", () => {
    assert.ok(
      simulateSpeedTest(veyron, standing, 400).totalTimeMs <
        simulateSpeedTest(golfGti, standing, 400).totalTimeMs,
    );
  });
});
