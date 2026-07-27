import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  championshipPoints,
  championshipStandings,
  currentTrackId,
  gridOrder,
  isFinished,
  newChampionship,
  recordRound,
  type ChampionshipState,
} from "./championship";

const field = Array.from({ length: 30 }, (_, i) => `car${i + 1}`);

describe("championshipPoints", () => {
  it("runs from the field size down to a single point", () => {
    assert.equal(championshipPoints(1, 30), 30);
    assert.equal(championshipPoints(2, 30), 29);
    assert.equal(championshipPoints(29, 30), 2);
    assert.equal(championshipPoints(30, 30), 1);
  });

  it("is worth one point per place, wherever it is gained", () => {
    assert.equal(championshipPoints(4, 30) - championshipPoints(5, 30), 1);
    assert.equal(championshipPoints(24, 30) - championshipPoints(25, 30), 1);
  });

  it("follows a smaller field so the last car still scores", () => {
    assert.equal(championshipPoints(1, 6), 6);
    assert.equal(championshipPoints(6, 6), 1);
  });

  it("scores nothing for a place outside the field", () => {
    assert.equal(championshipPoints(31, 30), 0);
    assert.equal(championshipPoints(0, 30), 0);
  });
});

describe("championshipStandings", () => {
  it("ranks a round on time, whatever order the results arrive in", () => {
    const state = newChampionship(["a", "b", "c", "d"], ["t1"]);
    const standings = championshipStandings(state.carIds, [
      {
        trackId: "t1",
        results: [
          { carId: "a", timeMs: 100 },
          { carId: "b", timeMs: 110 },
          { carId: "c", timeMs: 200 },
          { carId: "d", timeMs: 210 },
        ],
      },
    ]);
    assert.deepEqual(
      standings.map((s) => s.carId),
      ["a", "b", "c", "d"],
    );
    assert.equal(standings[0].points, 4);
    assert.equal(standings[3].points, 1);
  });

  it("lists every car, including one that has not run yet", () => {
    const standings = championshipStandings(["a", "b"], []);
    assert.equal(standings.length, 2);
    for (const s of standings) {
      assert.equal(s.points, 0);
      assert.equal(s.rounds, 0);
      assert.equal(s.lastPosition, null);
    }
  });

  it("adds the rounds up and remembers the last position", () => {
    const standings = championshipStandings(
      ["a", "b"],
      [
        { trackId: "t1", results: [{ carId: "a", timeMs: 100 }, { carId: "b", timeMs: 200 }] },
        { trackId: "t2", results: [{ carId: "b", timeMs: 100 }, { carId: "a", timeMs: 200 }] },
      ],
    );
    for (const s of standings) {
      assert.equal(s.rounds, 2);
      assert.equal(s.wins, 1);
      assert.equal(s.bestPosition, 1);
      assert.equal(s.totalTimeMs, 300);
    }
    assert.equal(standings.find((s) => s.carId === "a")!.lastPosition, 2);
    assert.equal(standings.find((s) => s.carId === "b")!.lastPosition, 1);
  });

  it("breaks a points tie on the shorter total time", () => {
    const standings = championshipStandings(
      ["a", "b"],
      [
        { trackId: "t1", results: [{ carId: "a", timeMs: 100 }, { carId: "b", timeMs: 200 }] },
        { trackId: "t2", results: [{ carId: "b", timeMs: 100 }, { carId: "a", timeMs: 400 }] },
      ],
    );
    assert.equal(standings[0].carId, "b"); // 300 ms against 500
  });

  it("ignores a result for a car outside the championship", () => {
    const standings = championshipStandings(
      ["a"],
      [{ trackId: "t1", results: [{ carId: "a", timeMs: 100 }, { carId: "ghost", timeMs: 50 }] }],
    );
    assert.equal(standings.length, 1);
    // The ghost took first place, so the real car scored second of two.
    assert.equal(standings[0].points, 1);
  });
});

describe("running a championship", () => {
  /** Drives the whole field, giving each car a time that follows `order`. */
  function drive(state: ChampionshipState, order: readonly string[]) {
    return recordRound(
      state,
      state.carIds.map((carId) => ({ carId, timeMs: 1000 + order.indexOf(carId) })),
    );
  }

  it("closes a round in one go, with every car's time", () => {
    let state = newChampionship(field, ["t1", "t2"]);
    assert.equal(currentTrackId(state), "t1");
    state = drive(state, field);
    assert.equal(state.rounds.length, 1);
    assert.equal(state.rounds[0].results.length, 30);
    assert.equal(state.rounds[0].trackId, "t1");
    assert.equal(currentTrackId(state), "t2");
  });

  it("is finished once the calendar runs out", () => {
    let state = newChampionship(["a", "b"], ["t1"]);
    assert.equal(isFinished(state), false);
    state = drive(state, ["a", "b"]);
    assert.equal(isFinished(state), true);
    assert.equal(currentTrackId(state), null);
  });

  it("does nothing when a round is filed after the calendar is over", () => {
    let state = newChampionship(["a"], ["t1"]);
    state = drive(state, ["a"]);
    assert.deepEqual(recordRound(state, [{ carId: "a", timeMs: 50 }]), state);
  });
});

describe("gridOrder", () => {
  it("keeps the field as it was picked before the first round", () => {
    assert.deepEqual(gridOrder(newChampionship(field, ["t1"])), field);
  });

  it("puts the championship leader on pole afterwards", () => {
    // Reverse the field's pace so the last car picked ends up leading.
    const reversed = [...field].reverse();
    const state = recordRound(
      newChampionship(field, ["t1", "t2"]),
      field.map((carId) => ({ carId, timeMs: 1000 + reversed.indexOf(carId) })),
    );
    assert.deepEqual(gridOrder(state), reversed);
  });

  it("lines up the whole field, never a slice of it", () => {
    const state = recordRound(
      newChampionship(field, ["t1", "t2"]),
      field.map((carId, i) => ({ carId, timeMs: 1000 + i })),
    );
    assert.equal(gridOrder(state).length, field.length);
  });
});
