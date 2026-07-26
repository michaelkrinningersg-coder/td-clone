import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatGap, playbackDurationMs, rankRacers, type RacerProgress } from "./race";

let nextGrid = 0;
function racer(carId: string, distanceM: number, opts: Partial<RacerProgress> = {}): RacerProgress {
  return { carId, gridIndex: nextGrid++, distanceM, speedKph: 100, totalTimeMs: 100_000, finished: false, ...opts };
}

describe("rankRacers", () => {
  it("ranks cars still on track by distance covered", () => {
    const ranked = rankRacers([racer("b", 500), racer("a", 900), racer("c", 100)]);
    assert.deepEqual(
      ranked.map((r) => [r.position, r.carId]),
      [
        [1, "a"],
        [2, "b"],
        [3, "c"],
      ],
    );
  });

  it("reports the gap to the leader in metres while racing", () => {
    const ranked = rankRacers([racer("a", 900), racer("b", 500)]);
    assert.equal(ranked[0].gapM, 0);
    assert.equal(ranked[1].gapM, 400);
    assert.equal(ranked[1].gapMs, null);
  });

  // A car that has crossed the line cannot be overtaken by one still driving,
  // however much distance the latter racks up on a longer lap.
  it("puts finished cars ahead of cars still running", () => {
    const ranked = rankRacers([
      racer("running", 5000),
      racer("finished", 4000, { finished: true, totalTimeMs: 90_000 }),
    ]);
    assert.equal(ranked[0].carId, "finished");
    assert.equal(ranked[1].carId, "running");
  });

  it("ranks finished cars by their time, not their distance", () => {
    const ranked = rankRacers([
      racer("slow", 6000, { finished: true, totalTimeMs: 120_000 }),
      racer("fast", 6000, { finished: true, totalTimeMs: 95_000 }),
    ]);
    assert.equal(ranked[0].carId, "fast");
    assert.equal(ranked[1].gapMs, 25_000);
    assert.equal(ranked[1].gapM, null);
  });

  it("orders the whole field once every car has finished", () => {
    const ranked = rankRacers([
      racer("c", 6000, { finished: true, totalTimeMs: 130_000 }),
      racer("a", 6000, { finished: true, totalTimeMs: 100_000 }),
      racer("b", 6000, { finished: true, totalTimeMs: 110_000 }),
    ]);
    assert.deepEqual(
      ranked.map((r) => r.carId),
      ["a", "b", "c"],
    );
    assert.deepEqual(
      ranked.map((r) => r.gapMs),
      [0, 10_000, 30_000],
    );
  });

  it("handles a single car and an empty field", () => {
    assert.equal(rankRacers([racer("solo", 100)])[0].position, 1);
    assert.deepEqual(rankRacers([]), []);
  });

  // Colour is tied to the starting grid, so a car that gets overtaken must keep
  // the colour it started with.
  it("carries the grid slot through unchanged", () => {
    const first = racer("a", 100);
    const second = racer("b", 900);
    const ranked = rankRacers([first, second]);
    assert.equal(ranked[0].carId, "b");
    assert.equal(ranked[0].gridIndex, second.gridIndex);
    assert.equal(ranked[1].gridIndex, first.gridIndex);
  });

  it("does not mutate the input order", () => {
    const input = [racer("b", 100), racer("a", 900)];
    rankRacers(input);
    assert.deepEqual(
      input.map((r) => r.carId),
      ["b", "a"],
    );
  });
});

describe("playbackDurationMs", () => {
  it("compresses long laps and stretches very short ones", () => {
    assert.equal(playbackDurationMs(1_000_000), 15_000); // 17-minute hillclimb
    assert.equal(playbackDurationMs(10_000), 4_000); // 10-second sprint
    assert.equal(playbackDurationMs(500_000), 10_000);
  });
});

describe("formatGap", () => {
  it("marks the leader and formats both gap kinds", () => {
    const [leader, second] = rankRacers([racer("a", 900), racer("b", 500)]);
    assert.equal(formatGap(leader), "—");
    assert.equal(formatGap(second), "+400 m");

    const finished = rankRacers([
      racer("a", 6000, { finished: true, totalTimeMs: 100_000 }),
      racer("b", 6000, { finished: true, totalTimeMs: 102_500 }),
    ]);
    assert.equal(formatGap(finished[1]), "+2.50s");
  });
});
