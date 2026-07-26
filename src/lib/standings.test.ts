import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStandings, hasMixedTrackCounts, pointsForPosition, sortStandings } from "./standings";
import type { TimeEntryData } from "./time-store";

let n = 0;
function entry(carId: string, trackId: string, timeMs: number): TimeEntryData {
  return { id: `e${n++}`, carId, trackId, timeMs, createdAt: "2026-01-01T00:00:00.000Z" };
}

describe("pointsForPosition", () => {
  it("starts at 5000 for the win", () => {
    assert.equal(pointsForPosition(1), 5000);
    assert.equal(pointsForPosition(2), 4999);
    assert.equal(pointsForPosition(3), 4998);
  });

  it("is worth the same one point wherever a place is gained", () => {
    const front = pointsForPosition(1) - pointsForPosition(2);
    const middle = pointsForPosition(500) - pointsForPosition(501);
    const back = pointsForPosition(4000) - pointsForPosition(4001);
    assert.equal(front, 1);
    assert.equal(middle, 1);
    assert.equal(back, 1);
  });

  it("scores down to the 5000th place and no further", () => {
    assert.equal(pointsForPosition(4999), 2);
    assert.equal(pointsForPosition(5000), 1);
    assert.equal(pointsForPosition(5001), 0);
    assert.equal(pointsForPosition(20_000), 0);
  });

  it("never goes up as the position gets worse", () => {
    let previous = Infinity;
    for (let position = 1; position <= 5100; position++) {
      const points = pointsForPosition(position);
      assert.ok(points <= previous, `position ${position} scores more than ${position - 1}`);
      previous = points;
    }
  });

  it("halves by the middle of the field", () => {
    assert.equal(pointsForPosition(2500), 2501);
  });

  it("ignores a position that does not exist", () => {
    assert.equal(pointsForPosition(0), 0);
    assert.equal(pointsForPosition(-3), 0);
  });
});

describe("buildStandings", () => {
  it("returns nothing when no times have been set", () => {
    assert.deepEqual(buildStandings([]), []);
  });

  it("scores each track separately and adds the points up", () => {
    const standings = buildStandings([
      entry("a", "monza", 100_000),
      entry("b", "monza", 110_000),
      entry("a", "spa", 200_000),
      entry("b", "spa", 190_000),
    ]);
    // Both won once and came second once.
    assert.equal(standings.length, 2);
    assert.equal(standings[0].points, 5000 + 4999);
    assert.equal(standings[1].points, 5000 + 4999);
    for (const s of standings) {
      assert.equal(s.raced, 2);
      assert.equal(s.wins, 1);
    }
  });

  // Summing lap times would rank a car that only ran the 250 m sprint above one
  // that has done Pikes Peak. Positions are what compare across tracks.
  it("does not reward a car for only entering the short tracks", () => {
    const standings = buildStandings([
      entry("sprinter", "sprint-250m", 8_000),
      entry("allrounder", "sprint-250m", 9_000),
      entry("allrounder", "pikes-peak", 900_000),
    ]);
    const sprinter = standings.find((s) => s.carId === "sprinter")!;
    const allrounder = standings.find((s) => s.carId === "allrounder")!;
    assert.equal(sprinter.points, 5000);
    assert.equal(allrounder.points, 4999 + 5000); // second, then a win elsewhere
    assert.equal(standings[0].carId, "allrounder");
  });

  it("counts wins and podiums", () => {
    const standings = buildStandings([
      entry("a", "t1", 100),
      entry("b", "t1", 200),
      entry("c", "t1", 300),
      entry("d", "t1", 400),
    ]);
    const byId = new Map(standings.map((s) => [s.carId, s]));
    assert.deepEqual([byId.get("a")!.wins, byId.get("a")!.podiums], [1, 1]);
    assert.deepEqual([byId.get("c")!.wins, byId.get("c")!.podiums], [0, 1]);
    assert.deepEqual([byId.get("d")!.wins, byId.get("d")!.podiums], [0, 0]);
  });

  it("reports the mean position and the mean shortfall against the best time", () => {
    const standings = buildStandings([
      entry("a", "t1", 100_000),
      entry("b", "t1", 110_000),
      entry("a", "t2", 100_000),
      entry("b", "t2", 130_000),
    ]);
    const b = standings.find((s) => s.carId === "b")!;
    assert.equal(b.averagePosition, 2);
    // 10% off on one track, 30% on the other.
    assert.ok(Math.abs(b.averageGapPercent - 20) < 0.001);
  });

  it("breaks a points tie on the better average position", () => {
    const standings = buildStandings([
      entry("winner", "t1", 100),
      entry("second", "t1", 200),
      entry("second", "t2", 100),
      entry("winner", "t2", 200),
    ]);
    assert.equal(standings[0].points, standings[1].points);
    assert.equal(standings[0].averagePosition, standings[1].averagePosition);
  });

  it("orders by points, best first", () => {
    const standings = buildStandings([
      entry("slow", "t1", 300),
      entry("mid", "t1", 200),
      entry("fast", "t1", 100),
    ]);
    assert.deepEqual(
      standings.map((s) => s.carId),
      ["fast", "mid", "slow"],
    );
  });

  it("adds every recorded time up", () => {
    const standings = buildStandings([entry("a", "t1", 100_000), entry("a", "t2", 250_000)]);
    assert.equal(standings[0].totalTimeMs, 350_000);
  });
});

describe("sortStandings", () => {
  // Same four cars, three ways of reading the same times.
  const built = buildStandings([
    entry("allrounder", "t1", 100_000),
    entry("allrounder", "t2", 100_000),
    entry("sprinter", "t1", 99_000),
    entry("sprinter", "t2", 130_000),
  ]);

  it("puts the smallest total first when ordering by time", () => {
    const sorted = sortStandings(built, "time");
    assert.deepEqual(
      sorted.map((s) => s.carId),
      ["allrounder", "sprinter"], // 200.0s against 229.0s
    );
  });

  it("puts the smallest mean shortfall first when ordering by gap", () => {
    const sorted = sortStandings(built, "gap");
    // The sprinter is 31.3% off on t2, the allrounder 1% off on t1.
    assert.equal(sorted[0].carId, "allrounder");
  });

  it("keeps the points order untouched by default", () => {
    assert.deepEqual(
      sortStandings(built, "points").map((s) => s.carId),
      built.map((s) => s.carId),
    );
  });

  it("does not change the table it was given", () => {
    const before = built.map((s) => s.carId);
    sortStandings(built, "time");
    assert.deepEqual(
      built.map((s) => s.carId),
      before,
    );
  });

  it("puts the car that covered more ground first on an equal total", () => {
    const standings = buildStandings([
      entry("one-track", "t1", 100_000),
      entry("two-tracks", "t1", 50_000),
      entry("two-tracks", "t2", 50_000),
    ]);
    assert.equal(sortStandings(standings, "time")[0].carId, "two-tracks");
  });
});

describe("hasMixedTrackCounts", () => {
  it("is false while everyone has run the same tracks", () => {
    const standings = buildStandings([
      entry("a", "t1", 100),
      entry("b", "t1", 200),
      entry("a", "t2", 100),
      entry("b", "t2", 200),
    ]);
    assert.equal(hasMixedTrackCounts(standings), false);
  });

  it("is true as soon as one car has skipped a track", () => {
    const standings = buildStandings([
      entry("a", "t1", 100),
      entry("b", "t1", 200),
      entry("a", "t2", 100),
    ]);
    assert.equal(hasMixedTrackCounts(standings), true);
  });

  it("is false for an empty table", () => {
    assert.equal(hasMixedTrackCounts([]), false);
  });
});
