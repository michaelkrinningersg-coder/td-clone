import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  brakingDecelMps2,
  dragForceN,
  dragLimitedTopSpeedMps,
  effectiveTopSpeedMps,
  frontalAreaM2,
  simulateRun,
  wheelPowerW,
  type CarPhysicsInput,
} from "./physics";
import type { Segment } from "./track-types";

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
  it("does not mistake a limiter for the drag limit", () => {
    const limited = { ...veyron, topSpeedKph: 250 };
    assert.equal(wheelPowerW(limited), wheelPowerW(veyron));
    assert.ok(effectiveTopSpeedMps(limited) * 3.6 < 251);
    assert.ok(dragLimitedTopSpeedMps(limited) * 3.6 > 300);
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
