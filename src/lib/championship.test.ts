import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  championshipStandings,
  currentHeat,
  currentTrackId,
  heatCount,
  isFinished,
  newChampionship,
  recordHeat,
  splitIntoHeats,
  type ChampionshipState,
} from "./championship";

const field = Array.from({ length: 30 }, (_, i) => `car${i + 1}`);

describe("splitIntoHeats", () => {
  it("breaks thirty cars into five heats of six", () => {
    const heats = splitIntoHeats(field);
    assert.equal(heats.length, 5);
    for (const heat of heats) assert.equal(heat.length, 6);
  });

  it("keeps the order it was given", () => {
    assert.deepEqual(splitIntoHeats(field)[0], field.slice(0, 6));
  });

  it("leaves a short last heat rather than padding it", () => {
    const heats = splitIntoHeats(field.slice(0, 8));
    assert.deepEqual(
      heats.map((h) => h.length),
      [6, 2],
    );
  });

  it("returns nothing for an empty field", () => {
    assert.deepEqual(splitIntoHeats([]), []);
  });
});

describe("championshipStandings", () => {
  it("scores a round across the whole field, not per heat", () => {
    // Two heats. The slowest car of heat one is still quicker than the
    // quickest of heat two, so it must place fourth overall - not first of
    // its own heat.
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
    assert.equal(standings[0].points, 5000);
    assert.equal(standings[3].points, 4997);
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
    // The ghost took first place, so the real car scored second.
    assert.equal(standings[0].points, 4999);
  });
});

describe("running a championship", () => {
  function run(state: ChampionshipState, times: number[]): ChampionshipState {
    const heat = currentHeat(state);
    return recordHeat(
      state,
      heat.map((carId, i) => ({ carId, timeMs: times[i] ?? 100 + i })),
    );
  }

  it("walks through the heats before closing the round", () => {
    let state = newChampionship(field, ["t1", "t2"]);
    assert.equal(heatCount(state), 5);
    assert.equal(currentTrackId(state), "t1");

    for (let heat = 0; heat < 4; heat++) {
      state = run(state, []);
      assert.equal(state.rounds.length, 0, "the round must stay open");
      assert.equal(state.heatIndex, heat + 1);
      assert.equal(currentTrackId(state), "t1");
    }

    state = run(state, []);
    assert.equal(state.rounds.length, 1);
    assert.equal(state.rounds[0].results.length, 30);
    assert.equal(state.heatIndex, 0);
    assert.equal(state.pending.length, 0);
    assert.equal(currentTrackId(state), "t2");
  });

  it("is finished once the calendar runs out", () => {
    let state = newChampionship(["a", "b"], ["t1"]);
    assert.equal(isFinished(state), false);
    state = run(state, [100, 200]);
    assert.equal(isFinished(state), true);
    assert.equal(currentTrackId(state), null);
  });

  it("sends the leaders out together after the first round", () => {
    let state = newChampionship(field, ["t1", "t2"]);
    // Drive round one so the last car on the grid ends up quickest overall.
    for (let heat = 0; heat < 5; heat++) {
      const cars = currentHeat(state);
      state = recordHeat(
        state,
        cars.map((carId) => ({ carId, timeMs: carId === "car30" ? 1 : 1000 + field.indexOf(carId) })),
      );
    }
    assert.equal(currentHeat(state)[0], "car30");
  });

  it("does nothing when a heat is filed after the calendar is over", () => {
    let state = newChampionship(["a"], ["t1"]);
    state = recordHeat(state, [{ carId: "a", timeMs: 100 }]);
    const after = recordHeat(state, [{ carId: "a", timeMs: 50 }]);
    assert.deepEqual(after, state);
  });
});
