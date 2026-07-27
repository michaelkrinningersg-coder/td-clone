import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { circuitFromOutline, outlineToSegments, scaleOutline, type OutlineVertex } from "./track-outline";
import { buildTrackPath } from "./track-geometry";
import { tracks } from "./data";

const square: OutlineVertex[] = [
  { x: 0, y: 0, radiusM: 20 },
  { x: 0, y: 400, radiusM: 20 },
  { x: 400, y: 400, radiusM: 20 },
  { x: 400, y: 0, radiusM: 20 },
];

/** How far the drawn lap ends from where it started. */
function closingGapM(outline: OutlineVertex[]): number {
  const path = buildTrackPath(outlineToSegments(outline), 1);
  const last = path.points[path.points.length - 1];
  return Math.hypot(last.x - path.points[0].x, last.y - path.points[0].y);
}

describe("outlineToSegments", () => {
  it("alternates a corner and a straight for every vertex", () => {
    const segments = outlineToSegments(square);
    assert.equal(segments.length, 8);
    assert.deepEqual(
      segments.map((s) => s.kind),
      ["corner", "straight", "corner", "straight", "corner", "straight", "corner", "straight"],
    );
  });

  // The whole point: a lap drawn from a closed shape comes back to the line.
  it("draws a lap that closes on itself", () => {
    assert.ok(closingGapM(square) < 0.5, `gap was ${closingGapM(square).toFixed(2)} m`);
  });

  it("turns through a full circle, once", () => {
    const turn = outlineToSegments(square).reduce(
      (sum, s) => (s.kind === "corner" ? sum + (s.lengthM / s.radiusM) * (s.dir === "left" ? 1 : -1) : sum),
      0,
    );
    assert.ok(Math.abs(Math.abs(turn) - 2 * Math.PI) < 1e-6, `turned ${((turn * 180) / Math.PI).toFixed(1)}°`);
  });

  it("reads the turn direction off the shape", () => {
    const clockwise = outlineToSegments(square);
    const anticlockwise = outlineToSegments([...square].reverse());
    assert.ok(clockwise.every((s) => s.kind !== "corner" || s.dir === "right"));
    assert.ok(anticlockwise.every((s) => s.kind !== "corner" || s.dir === "left"));
  });

  it("shortens the straights by what the corners take", () => {
    const segments = outlineToSegments(square);
    const straight = segments.find((s) => s.kind === "straight")!;
    // A 90° corner of radius 20 eats 20 m off each end of a 400 m leg.
    assert.ok(Math.abs(straight.lengthM - 360) < 1e-6, `${straight.lengthM}`);
  });

  it("gives a corner an arc length matching its radius and angle", () => {
    const corner = outlineToSegments(square).find((s) => s.kind === "corner")!;
    assert.ok(Math.abs(corner.lengthM - (Math.PI / 2) * 20) < 1e-6);
    assert.equal(corner.radiusM, 20);
  });

  // A radius wider than the legs can hold would run into the next corner.
  it("tightens a corner that does not fit rather than distorting the shape", () => {
    const tight: OutlineVertex[] = square.map((v) => ({ ...v, radiusM: 5000 }));
    const segments = outlineToSegments(tight);
    const corner = segments.find((s) => s.kind === "corner")!;
    assert.ok(corner.radiusM < 5000);
    assert.ok(segments.every((s) => s.lengthM > 0));
    assert.ok(closingGapM(tight) < 1, "it still has to close");
  });

  it("carries the gradient of the leg leaving each corner", () => {
    const hilly = square.map((v, i) => ({ ...v, gradientPercent: i === 0 ? 8 : 0 }));
    const segments = outlineToSegments(hilly);
    assert.equal(segments[1].gradientPercent, 8);
    assert.equal(segments[3].gradientPercent, 0);
  });

  it("returns nothing for a shape that is not one", () => {
    assert.deepEqual(outlineToSegments([]), []);
    assert.deepEqual(outlineToSegments([{ x: 0, y: 0, radiusM: 10 }]), []);
  });
});

describe("scaleOutline", () => {
  it("brings the lap to the length asked for", () => {
    const scaled = scaleOutline(square, 5000);
    const length = outlineToSegments(scaled).reduce((sum, s) => sum + s.lengthM, 0);
    assert.ok(Math.abs(length - 5000) < 1, `${length}`);
  });

  it("leaves the shape alone", () => {
    const scaled = scaleOutline(square, 5000);
    const ratio = scaled[1].y / square[1].y;
    for (let i = 0; i < square.length; i++) {
      assert.ok(Math.abs(scaled[i].x - square[i].x * ratio) < 1e-6);
      assert.ok(Math.abs(scaled[i].radiusM - square[i].radiusM * ratio) < 1e-6);
    }
  });
});

describe("the circuits that ship", () => {
  const circuits = tracks.filter((t) => t.type === "CIRCUIT" && t.name !== "Pikes Peak Hillclimb");

  it("has the three closed circuits", () => {
    assert.deepEqual(
      circuits.map((t) => t.name).sort(),
      ["Monaco", "Monza", "Spa-Francorchamps"],
    );
  });

  for (const track of circuits) {
    it(`draws ${track.name} as a lap that comes back to the line`, () => {
      const path = buildTrackPath(track.segments, 2);
      const last = path.points[path.points.length - 1];
      const gap = Math.hypot(last.x - path.points[0].x, last.y - path.points[0].y);
      assert.ok(gap < 1, `${track.name} ends ${gap.toFixed(1)} m from where it started`);
    });

    it(`gives ${track.name} its real length`, () => {
      const expected: Record<string, number> = {
        Monza: 5793,
        "Spa-Francorchamps": 7004,
        Monaco: 3337,
      };
      assert.ok(Math.abs(track.lengthM - expected[track.name]) < 2);
    });

    it(`keeps every segment of ${track.name} drivable`, () => {
      for (const segment of track.segments) {
        assert.ok(segment.lengthM > 0, "a segment of zero length would stall the simulation");
        if (segment.kind === "corner") assert.ok(segment.radiusM > 0);
      }
    });
  }

  // A hillclimb starts at the bottom and finishes at the top; closing it would
  // be wrong, not right.
  it("leaves Pikes Peak open", () => {
    const hillclimb = tracks.find((t) => t.name === "Pikes Peak Hillclimb")!;
    const path = buildTrackPath(hillclimb.segments, 20);
    const last = path.points[path.points.length - 1];
    assert.ok(Math.hypot(last.x, last.y) > 1000);
  });
});

describe("circuitFromOutline", () => {
  it("gives a closed lap of the requested length", () => {
    const segments = circuitFromOutline(square, 4000);
    const length = segments.reduce((sum, s) => sum + s.lengthM, 0);
    assert.ok(Math.abs(length - 4000) < 1);
    const path = buildTrackPath(segments, 1);
    const last = path.points[path.points.length - 1];
    assert.ok(Math.hypot(last.x, last.y) < 1, "the lap should end where it started");
  });
});
