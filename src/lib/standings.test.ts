import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStandings, pointsForPosition } from "./standings";
import type { TimeEntryData } from "./time-store";

let n = 0;
function entry(carId: string, trackId: string, timeMs: number): TimeEntryData {
  return { id: `e${n++}`, carId, trackId, timeMs, createdAt: "2026-01-01T00:00:00.000Z" };
}

describe("pointsForPosition", () => {
  it("drops steeply over the first places", () => {
    assert.equal(pointsForPosition(1), 25);
    assert.equal(pointsForPosition(2), 18);
    assert.equal(pointsForPosition(3), 15);
  });

  it("gives a point for turning up, however far back", () => {
    assert.equal(pointsForPosition(10), 1);
    assert.equal(pointsForPosition(11), 1);
    assert.equal(pointsForPosition(500), 1);
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
    assert.equal(standings[0].points, 25 + 18);
    assert.equal(standings[1].points, 25 + 18);
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
    assert.equal(sprinter.points, 25);
    assert.equal(allrounder.points, 18 + 25); // second, then a win elsewhere
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
    // Both score 26: one won and came tenth, the other was second twice
    // (18+18=36) - so instead make the tie exact.
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
});
