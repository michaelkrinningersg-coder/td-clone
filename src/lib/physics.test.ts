import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { simulateRun, type CarPhysicsInput } from "./physics";
import type { Segment } from "./track-types";

const golfGti: CarPhysicsInput = {
  topSpeedKph: 250,
  accel0to100s: 6.2,
  powerPs: 245,
  weightKg: 1400,
  torqueNm: 370,
  drivetrain: "FWD",
};

const veyron: CarPhysicsInput = {
  topSpeedKph: 407,
  accel0to100s: 2.5,
  powerPs: 1001,
  weightKg: 1888,
  torqueNm: 1250,
  drivetrain: "AWD",
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
  // The whole model is calibrated on this: the tanh curve is solved so it passes
  // through the car's real 0-100 time. If this drifts, every lap time is wrong.
  it("reproduces each car's real 0-100 km/h time", () => {
    for (const car of [golfGti, veyron]) {
      const measured = timeToReachKph(car, 100);
      assert.ok(
        Math.abs(measured - car.accel0to100s) < 0.15,
        `expected ~${car.accel0to100s}s to 100 km/h, simulated ${measured.toFixed(2)}s`,
      );
    }
  });

  it("never exceeds the car's real top speed", () => {
    for (const car of [golfGti, veyron]) {
      const { trace } = simulateRun(car, longStraight);
      const fastest = Math.max(...trace.map((p) => p.speedKph));
      assert.ok(
        fastest <= car.topSpeedKph + 0.01,
        `${fastest.toFixed(1)} km/h exceeded top speed ${car.topSpeedKph}`,
      );
    }
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
