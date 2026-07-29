import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { duelCalendar, duelLeader, duelScores, duelTeam, type DuelRoundResult } from "./duel";
import type { CarData, TrackData } from "./data";

const car = (over: Partial<CarData> & { id: string; make: string }): CarData => ({
  model: "Modell",
  variant: "2.0",
  year: 2020,
  topSpeedKph: 250,
  accel0to100s: 6,
  powerPs: 200,
  weightKg: 1400,
  torqueNm: 350,
  drivetrain: "RWD",
  fuelType: "Gasoline",
  dragCoefficient: 0.3,
  widthMm: 1800,
  heightMm: 1450,
  brakeFront: "ventilated-disc",
  brakeRear: "disc",
  cylinders: 4,
  wheelbaseMm: 2650,
  tyreWidthMm: 225,
  gearCount: 6,
  manualGearbox: false,
  gearboxKind: "automatic" as const,
  ...over,
});

describe("duelTeam", () => {
  const pool = [
    car({ id: "p1", make: "Porsche", model: "911", powerPs: 700 }),
    car({ id: "p2", make: "Porsche", model: "911", powerPs: 650 }),
    car({ id: "p3", make: "Porsche", model: "Cayman", powerPs: 400 }),
    car({ id: "p4", make: "Porsche", model: "Boxster", powerPs: 350 }),
    car({ id: "b1", make: "BMW", model: "M3", powerPs: 510 }),
  ];

  it("takes the most powerful cars of the marque", () => {
    const team = duelTeam(pool, "Porsche", 3);
    assert.deepEqual(
      team.map((c) => c.id),
      ["p1", "p3", "p4"],
    );
  });

  it("takes one car per model before repeating a model", () => {
    const team = duelTeam(pool, "Porsche", 3);
    assert.equal(new Set(team.map((c) => c.model)).size, 3);
  });

  // Five places, three models: the fourth and fifth have to come from
  // somewhere rather than the marque turning up short.
  it("fills the last places from what is left when models run out", () => {
    const team = duelTeam(pool, "Porsche", 4);
    assert.equal(team.length, 4);
    assert.ok(team.some((c) => c.id === "p2"));
  });

  it("never picks a car of another marque", () => {
    for (const c of duelTeam(pool, "Porsche", 5)) assert.equal(c.make, "Porsche");
  });

  it("returns what there is when the marque is smaller than the team", () => {
    assert.equal(duelTeam(pool, "BMW", 5).length, 1);
  });
});

describe("duelCalendar", () => {
  const tracks = ["a", "b", "c", "d"].map((id) => ({ id, name: id }) as TrackData);

  it("draws the number of rounds asked for", () => {
    assert.equal(duelCalendar(tracks, 3, () => 0.5).length, 3);
  });

  it("never draws the same track twice", () => {
    const drawn = duelCalendar(tracks, 4, () => 0.5);
    assert.equal(new Set(drawn.map((t) => t.id)).size, 4);
  });

  it("cannot ask for more tracks than exist", () => {
    assert.equal(duelCalendar(tracks, 10, () => 0.5).length, 4);
  });
});

describe("duelScores", () => {
  const makes: [string, string] = ["Audi", "BMW"];
  const round = (trackId: string, times: [number, number, number, number]): DuelRoundResult => ({
    trackId,
    results: [
      { carId: "a1", make: "Audi", timeMs: times[0] },
      { carId: "a2", make: "Audi", timeMs: times[1] },
      { carId: "b1", make: "BMW", timeMs: times[2] },
      { carId: "b2", make: "BMW", timeMs: times[3] },
    ],
  });

  it("gives the round to the lower team total", () => {
    const [audi, bmw] = duelScores(makes, [round("t1", [100, 110, 120, 130])]);
    assert.equal(audi.roundsWon, 1);
    assert.equal(bmw.roundsWon, 0);
  });

  // One runaway car should not carry a marque whose others are nowhere.
  it("does not let a single quick car win a round on its own", () => {
    const [audi, bmw] = duelScores(makes, [round("t1", [50, 400, 120, 130])]);
    assert.equal(audi.roundsWon, 0);
    assert.equal(bmw.roundsWon, 1);
    // ...but its head-to-head record still shows what it did.
    assert.equal(audi.duelsWon, 2);
  });

  it("counts every car against every car of the other marque", () => {
    const [audi, bmw] = duelScores(makes, [round("t1", [100, 110, 120, 130])]);
    assert.equal(audi.duelsWon, 4);
    assert.equal(bmw.duelsWon, 0);
  });

  it("adds the rounds up", () => {
    const scores = duelScores(makes, [round("t1", [100, 110, 120, 130]), round("t2", [200, 210, 100, 110])]);
    const [audi, bmw] = scores;
    assert.equal(audi.roundsWon, 1);
    assert.equal(bmw.roundsWon, 1);
    assert.equal(audi.totalTimeMs, 100 + 110 + 200 + 210);
    assert.equal(bmw.bestTimeMs, 100);
  });

  it("reports nothing driven before the first round", () => {
    const [audi] = duelScores(makes, []);
    assert.equal(audi.roundsWon, 0);
    assert.equal(audi.bestTimeMs, null);
  });

  it("ignores a car belonging to neither marque", () => {
    const scores = duelScores(makes, [
      { trackId: "t1", results: [{ carId: "x", make: "Ford", timeMs: 1 }] },
    ]);
    for (const s of scores) assert.equal(s.totalTimeMs, 0);
  });
});

describe("duelLeader", () => {
  const makes: [string, string] = ["Audi", "BMW"];

  it("names the marque with more rounds", () => {
    const scores = duelScores(makes, [
      {
        trackId: "t1",
        results: [
          { carId: "a", make: "Audi", timeMs: 100 },
          { carId: "b", make: "BMW", timeMs: 200 },
        ],
      },
    ]);
    assert.equal(duelLeader(scores)?.make, "Audi");
  });

  it("falls back to the head-to-head record on level rounds", () => {
    const scores = duelScores(makes, [
      {
        trackId: "t1",
        results: [
          { carId: "a1", make: "Audi", timeMs: 100 },
          { carId: "a2", make: "Audi", timeMs: 300 },
          { carId: "b1", make: "BMW", timeMs: 199 },
          { carId: "b2", make: "BMW", timeMs: 200 },
        ],
      },
    ]);
    // BMW takes the round on total; Audi and BMW win two head-to-heads each,
    // so the total time decides and BMW stays ahead.
    assert.equal(duelLeader(scores)?.make, "BMW");
  });

  it("is null before anything has been driven", () => {
    assert.equal(duelLeader(duelScores(makes, [])), null);
  });
});
