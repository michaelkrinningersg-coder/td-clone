import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  polylineLength,
  polylineToSegments,
  resample,
  rotateToDistance,
  startAtLongestStraight,
  type Point,
} from "./track-polyline";
import { outlinePath } from "./track-geometry";
import { tracks } from "./data";

/** A closed square, 400 m a side. */
const square: Point[] = [
  [0, 0],
  [0, 400],
  [400, 400],
  [400, 0],
];

/** A ring of `n` points, which is a corner of constant radius all the way. */
function circle(radiusM: number, n = 180): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * radiusM, Math.sin(a) * radiusM] as Point;
  });
}

describe("polylineLength", () => {
  it("counts the closing leg back to the start", () => {
    assert.equal(polylineLength(square), 1600);
  });
});

describe("resample", () => {
  it("walks the outline in even steps", () => {
    const samples = resample(square, 10);
    assert.equal(samples.length, 160);
    for (let i = 1; i < samples.length; i++) {
      const step = Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]);
      assert.ok(Math.abs(step - 10) < 0.5, `step ${i} was ${step.toFixed(2)} m`);
    }
  });

  it("starts where the outline starts", () => {
    assert.deepEqual(resample(square, 10)[0], [0, 0]);
  });
});

describe("polylineToSegments", () => {
  it("measures a constant-radius ring back to that radius", () => {
    const segments = polylineToSegments(circle(120), { straightRadiusM: 400 });
    assert.ok(segments.every((s) => s.kind === "corner"));
    for (const segment of segments) {
      if (segment.kind === "corner") {
        assert.ok(Math.abs(segment.radiusM - 120) < 12, `read ${segment.radiusM.toFixed(1)} m, expected 120`);
      }
    }
  });

  it("keeps the lap's length", () => {
    const total = polylineToSegments(square).reduce((sum, s) => sum + s.lengthM, 0);
    assert.ok(Math.abs(total - 1600) < 2, `${total}`);
  });

  it("calls a gentle bend a straight and a tight one a corner", () => {
    const gentle = polylineToSegments(circle(2000), { straightRadiusM: 400 });
    const tight = polylineToSegments(circle(60), { straightRadiusM: 400 });
    assert.ok(gentle.every((s) => s.kind === "straight"));
    assert.ok(tight.every((s) => s.kind === "corner"));
  });

  it("reads the turn direction off the line", () => {
    const anticlockwise = polylineToSegments(circle(120), { straightRadiusM: 400 });
    const clockwise = polylineToSegments([...circle(120)].reverse(), { straightRadiusM: 400 });
    assert.ok(anticlockwise.every((s) => s.kind !== "corner" || s.dir === "left"));
    assert.ok(clockwise.every((s) => s.kind !== "corner" || s.dir === "right"));
  });

  // Grouped as one corner, a chicane's right and left cancel and the arc comes
  // back with the radius of a fast kink instead of two tight corners.
  it("splits a chicane into its two corners", () => {
    const chicane: Point[] = [
      [0, 0],
      [0, 300],
      [40, 340],
      [40, 420],
      [0, 460],
      [0, 900],
      [600, 900],
      [600, 0],
    ];
    const segments = polylineToSegments(chicane, { straightRadiusM: 400 });
    const kink = segments.findIndex((s) => s.kind === "corner");
    assert.notEqual(kink, -1);
    const dirs = segments.filter((s) => s.kind === "corner").map((s) => (s as { dir: string }).dir);
    assert.ok(dirs.includes("left") && dirs.includes("right"), `only found ${dirs.join(", ")}`);
  });

  it("folds away scraps of straight but never a corner", () => {
    const segments = polylineToSegments(square, { minSegmentM: 50 });
    for (const segment of segments) {
      if (segment.kind === "straight") assert.ok(segment.lengthM >= 50);
    }
  });

  it("puts the gradient of the band a segment sits in onto it", () => {
    const segments = polylineToSegments(square, {
      gradients: [{ from: 0, to: 0.5, percent: 6 }],
    });
    assert.ok(segments.some((s) => s.gradientPercent === 6));
    assert.ok(segments.some((s) => s.gradientPercent === 0));
  });

  it("returns nothing for a shape that is not one", () => {
    assert.deepEqual(polylineToSegments([]), []);
  });
});

describe("rotateToDistance", () => {
  it("re-cuts the loop to start further along", () => {
    const moved = rotateToDistance(square, 400);
    assert.deepEqual(moved[0], [0, 400]);
    assert.ok(Math.abs(polylineLength(moved) - polylineLength(square)) < 1);
  });

  it("leaves the shape it describes unchanged", () => {
    const moved = rotateToDistance(square, 250);
    const before = polylineToSegments(square).filter((s) => s.kind === "corner").length;
    const after = polylineToSegments(moved).filter((s) => s.kind === "corner").length;
    assert.equal(after, before);
  });
});

describe("startAtLongestStraight", () => {
  it("begins the lap on the longest straight", () => {
    // A long leg followed by three short ones: the lap has to start on the long
    // one, some way into it.
    const line: Point[] = [
      [0, 0],
      [0, 2000],
      [300, 2000],
      [300, 0],
    ];
    const rotated = startAtLongestStraight(line);
    const [x, y] = rotated[0];
    assert.ok(x < 5, `started at x=${x}`);
    assert.ok(y > 100 && y < 1900, `started at y=${y}`);
  });
});

describe("the circuits that ship", () => {
  const surveyed = tracks.filter((t) => t.outline !== undefined);

  it("draws every closed track from a point list rather than from segments", () => {
    assert.deepEqual(
      surveyed.map((t) => t.name).sort(),
      [
        "Handlingkurs",
        "Hungaroring",
        "Interlagos",
        "Kreisbahn 200 m",
        "Monaco",
        "Monza",
        "Silverstone",
        "Spa-Francorchamps",
        "Stadtkurs eng",
        "Suzuka",
        "Trioval 4500 m",
      ],
    );
  });

  for (const track of surveyed) {
    it(`closes ${track.name} back onto the line`, () => {
      const path = outlinePath(track.outline as Point[]);
      const first = path.points[0];
      const last = path.points[path.points.length - 1];
      assert.ok(Math.hypot(last.x - first.x, last.y - first.y) < 0.01);
    });

    it(`gives ${track.name} its measured length`, () => {
      // The surveyed circuits at their real length; the handling course at the
      // length it was built to.
      const expected: Record<string, number> = {
        "Kreisbahn 200 m": 1257,
        "Stadtkurs eng": 2500,
        "Trioval 4500 m": 4500,
        Monza: 5766,
        "Spa-Francorchamps": 6956,
        Monaco: 3311,
        Suzuka: 5798,
        Silverstone: 5862,
        Hungaroring: 4364,
        Interlagos: 4283,
        Handlingkurs: 2000,
      };
      assert.ok(
        Math.abs(track.lengthM - expected[track.name]) < 5,
        `${track.name} came out ${track.lengthM.toFixed(0)} m`,
      );
    });

    it(`keeps every segment of ${track.name} drivable`, () => {
      for (const segment of track.segments) {
        assert.ok(segment.lengthM > 0);
        if (segment.kind === "corner") assert.ok(segment.radiusM > 0);
      }
    });
  }

  // Monza's Rettifilo, Spa's La Source, Monaco's hairpin, the Hungaroring's
  // first corner. If the curvature reading drifts, these go first. The
  // constructed shapes are exempt: a 200 m ring has no tight corner by
  // definition, and neither does a trioval.
  const SWEEPING = new Set(["Kreisbahn 200 m", "Trioval 4500 m"]);

  it("finds the tight corners the circuits are known for", () => {
    for (const track of surveyed.filter((t) => !SWEEPING.has(t.name))) {
      const tightest = Math.min(
        ...track.segments.filter((s) => s.kind === "corner").map((s) => (s as { radiusM: number }).radiusM),
      );
      assert.ok(tightest < 45, `${track.name}'s tightest corner read ${tightest.toFixed(0)} m`);
    }
  });

  // Each of these was picked for a different demand; if two of them read the
  // same the point of having both is gone.
  it("keeps the circuits telling different stories", () => {
    const of = (name: string) => tracks.find((t) => t.name === name)!;
    const longestStraight = (name: string) =>
      Math.max(...of(name).segments.filter((s) => s.kind === "straight").map((s) => s.lengthM));
    const cornersPerKm = (name: string) =>
      of(name).segments.filter((s) => s.kind === "corner").length / (of(name).lengthM / 1000);

    assert.ok(longestStraight("Monza") > longestStraight("Hungaroring"), "Monza is the one with the straight");
    assert.ok(cornersPerKm("Monaco") > cornersPerKm("Silverstone"), "Monaco is the busy one");
    assert.ok(of("Slalom 20 Tore").segments.every((s) => s.kind === "corner" || s.lengthM <= 30));
    assert.equal(of("Bremstest 200-0-200").segments.filter((s) => s.kind === "corner").length, 1);
  });

  it("finds Monza's main straight", () => {
    const monza = tracks.find((t) => t.name === "Monza")!;
    const longest = Math.max(
      ...monza.segments.filter((s) => s.kind === "straight").map((s) => s.lengthM),
    );
    assert.ok(longest > 800, `longest straight read ${longest.toFixed(0)} m`);
  });

  // A hillclimb starts at the bottom and finishes at the top.
  it("leaves Pikes Peak without an outline", () => {
    assert.equal(tracks.find((t) => t.name === "Pikes Peak Hillclimb")!.outline, undefined);
  });
});
