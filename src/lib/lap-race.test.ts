import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  MAX_RACE_CARS,
  PIT_LOSS_MS,
  RACE_DISTANCE_M,
  carPace,
  cornerShare,
  lapsFor,
  planStops,
  progressAt,
  rankRace,
  simulateRace,
  strategyCostMs,
  tyreGrip,
  type CarPace,
} from "./lap-race";
import { cars, tracks } from "./data";

const monza = tracks.find((t) => t.name === "Monza")!;
const monaco = tracks.find((t) => t.name === "Monaco")!;

/** A pace with round numbers, so the arithmetic in a race is checkable by
 * hand: a hundred-second lap that loses nothing to anything. */
const flat: CarPace = {
  carId: "flat",
  baseLapMs: 100_000,
  gripSensitivity: 0,
  powerSensitivity: 0,
  tyreLifeShare: 0.85,
  errorChance: 0,
};

/** Never rolls anything: no errors, no form loss. The pit window jitter runs
 * off the same roll, so a zero puts every stop four laps early. */
const never = () => 0;
/** Rolls in the middle: no jitter on the stop laps at all. */
const middling = () => 0.5;

describe("lapsFor", () => {
  it("makes whole laps out of the race distance", () => {
    assert.equal(lapsFor(5000), 50);
    assert.equal(lapsFor(RACE_DISTANCE_M), 1);
  });

  it("rounds to the nearest lap rather than cutting one short", () => {
    // 6.96 km: 35.9 laps, so 36 and a slightly long race.
    assert.equal(lapsFor(6960), 36);
  });

  it("never asks for less than a lap", () => {
    assert.equal(lapsFor(400_000), 1);
  });
});

describe("cornerShare", () => {
  it("reads a street circuit as more corner than a fast one", () => {
    assert.ok(cornerShare(monaco) > cornerShare(monza));
  });

  it("is a share, so it stays between nothing and everything", () => {
    for (const track of tracks) {
      const share = cornerShare(track);
      assert.ok(share >= 0 && share <= 1, `${track.name}: ${share}`);
    }
  });
});

describe("carPace", () => {
  const golf = cars.find((c) => c.make === "Volkswagen" && c.model.includes("Golf"))!;
  const heavy = { ...golf, id: "heavy", weightKg: 2400, tyreWidthMm: 175 };
  const light = { ...golf, id: "light", weightKg: 1100, tyreWidthMm: 285 };

  it("costs time to lose grip or power", () => {
    const pace = carPace(golf, monaco);
    assert.ok(pace.gripSensitivity > 0);
    assert.ok(pace.powerSensitivity > 0);
  });

  it("keeps every car's tyres inside the sixty to eighty-five per cent window", () => {
    for (const track of [monza, monaco]) {
      for (const car of cars.filter((_, i) => i % 700 === 0)) {
        const life = carPace(car, track).tyreLifeShare;
        assert.ok(life >= 0.6 - 1e-9 && life <= 0.85 + 1e-9, `${car.id} on ${track.name}: ${life}`);
      }
    }
  });

  it("gets a heavy car on narrow tyres through a set quicker", () => {
    assert.ok(carPace(heavy, monaco).tyreLifeShare < carPace(light, monaco).tyreLifeShare);
  });

  it("is harder on tyres where there are more corners", () => {
    assert.ok(carPace(heavy, monaco).tyreLifeShare <= carPace(heavy, monza).tyreLifeShare);
  });
});

describe("tyreGrip", () => {
  it("is a little off when the set is new", () => {
    assert.ok(tyreGrip(0) < 1);
    assert.ok(tyreGrip(0) > 0.98);
  });

  it("peaks after about a sixth of the life", () => {
    assert.equal(tyreGrip(0.15), 1);
    assert.ok(tyreGrip(0.15) > tyreGrip(0));
    assert.ok(tyreGrip(0.15) > tyreGrip(0.3));
  });

  it("goes away slowly and then quickly", () => {
    const early = tyreGrip(0.3) - tyreGrip(0.45);
    const late = tyreGrip(0.85) - tyreGrip(1);
    assert.ok(late > early * 3, `early ${early.toFixed(4)}, late ${late.toFixed(4)}`);
  });

  it("has given away about a fifth of the grip by the end of the set", () => {
    assert.ok(Math.abs(1 - tyreGrip(1) - 0.18) < 0.001);
  });

  it("never falls through the floor, however far a set is run past its life", () => {
    assert.equal(tyreGrip(10), tyreGrip(100));
    assert.ok(tyreGrip(10) >= 0.6);
  });
});

describe("planStops", () => {
  const wearing: CarPace = { ...flat, gripSensitivity: 0.4, tyreLifeShare: 0.7 };

  it("never sends a car the whole way on one set", () => {
    for (const laps of [10, 25, 40, 76, 199]) {
      assert.ok(planStops(wearing, laps, middling).length >= 1, `${laps} laps`);
    }
  });

  it("never asks for three stops", () => {
    for (const life of [0.6, 0.7, 0.85]) {
      for (const sensitivity of [0.05, 0.3, 0.8, 2]) {
        const pace: CarPace = { ...flat, gripSensitivity: sensitivity, tyreLifeShare: life };
        for (const laps of [8, 20, 43, 76, 199]) {
          const stops = planStops(pace, laps, middling).length;
          assert.ok(stops === 1 || stops === 2, `${stops} stops at ${laps} laps, life ${life}`);
        }
      }
    }
  });

  it("splits the race evenly when nothing pushes it about", () => {
    assert.deepEqual(planStops(wearing, 40, middling), [20]);
  });

  it("stops within four laps of the pit wall's answer", () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      const [stop] = planStops(wearing, 40, () => roll);
      assert.ok(Math.abs(stop - 20) <= 4, `rolled ${roll} and stopped on lap ${stop}`);
    }
  });

  it("takes the second stop when the tyres cost more than the pit lane", () => {
    // Loses a lot of lap time on worn tyres and gets through a set quickly.
    const punishing: CarPace = { ...flat, gripSensitivity: 3, tyreLifeShare: 0.6 };
    assert.equal(planStops(punishing, 60, middling).length, 2);
  });

  it("stays on one stop when the tyres cost less than the pit lane", () => {
    const gentle: CarPace = { ...flat, gripSensitivity: 0.05, tyreLifeShare: 0.85 };
    assert.equal(planStops(gentle, 60, middling).length, 1);
  });

  it("agrees with the cost it is deciding on", () => {
    const punishing: CarPace = { ...flat, gripSensitivity: 3, tyreLifeShare: 0.6 };
    assert.ok(
      strategyCostMs(punishing, 60, [20, 40]) < strategyCostMs(punishing, 60, [30]),
      "two stops has to be the cheaper answer for the car that takes it",
    );
  });

  // The strongest check there is on the pit wall: run the race both ways and
  // see whether the plan it chose was the quicker one.
  it("chooses the strategy that is actually faster", () => {
    for (const track of [monza, monaco]) {
      const laps = lapsFor(track.lengthM);
      for (const car of cars.filter((_, i) => i % 800 === 0)) {
        const pace = carPace(car, track);
        const chosen = planStops(pace, laps, middling).length;
        const one = simulateRace([pace], {
          laps,
          stopLaps: [Math.round(laps / 2)],
          random: middling,
        })[0].totalTimeMs;
        const two = simulateRace([pace], {
          laps,
          stopLaps: [Math.round(laps / 3), Math.round((2 * laps) / 3)],
          random: middling,
        })[0].totalTimeMs;
        assert.equal(
          chosen,
          one <= two ? 1 : 2,
          `${car.id} at ${track.name}: chose ${chosen}, one-stop ${(one / 1000).toFixed(1)} s, two-stop ${(two / 1000).toFixed(1)} s`,
        );
      }
    }
  });

  it("keeps two stops apart and inside the race", () => {
    const punishing: CarPace = { ...flat, gripSensitivity: 3, tyreLifeShare: 0.6 };
    for (const roll of [0, 0.5, 0.999]) {
      const stops = planStops(punishing, 12, () => roll);
      for (let i = 1; i < stops.length; i++) assert.ok(stops[i] - stops[i - 1] >= 2);
      for (const lap of stops) assert.ok(lap >= 1 && lap < 12, `stop on lap ${lap} of 12`);
    }
  });
});

describe("simulateRace", () => {
  it("adds the laps up, with the tyre loss and the stop in them", () => {
    const [entry] = simulateRace([flat], { laps: 10, random: middling });
    // A pace that shrugs off worn tyres and never errs: laps plus one stop.
    assert.equal(entry.totalTimeMs, 1_000_000 + PIT_LOSS_MS);
    assert.equal(entry.stops, 1);
    assert.equal(entry.laps.length, 10);
  });

  it("puts the car on fresh tyres after a stop", () => {
    const [entry] = simulateRace([flat], { laps: 20, random: middling });
    const pitLap = entry.laps.findIndex((l) => l.pitted);
    assert.ok(pitLap >= 0);
    assert.equal(entry.laps[pitLap + 1].tyreUsed, 0);
  });

  it("does not change tyres on the last lap", () => {
    assert.equal(simulateRace([flat], { laps: 3, random: middling })[0].laps[2].pitted, false);
  });

  it("runs slower on a spent set than on a peaked one", () => {
    const sensitive: CarPace = { ...flat, gripSensitivity: 1, tyreLifeShare: 0.85 };
    const [entry] = simulateRace([sensitive], { laps: 40, random: middling });
    // The most worn lap of the race against the one closest to the tyre's best.
    const spent = [...entry.laps].filter((l) => !l.pitted).sort((a, b) => b.tyreUsed - a.tyreUsed)[0];
    const peaked = [...entry.laps]
      .filter((l) => !l.pitted)
      .sort((a, b) => Math.abs(a.tyreUsed - 0.15) - Math.abs(b.tyreUsed - 0.15))[0];
    assert.ok(
      spent.lapTimeMs > peaked.lapTimeMs,
      `spent ${spent.lapTimeMs.toFixed(0)} at ${spent.tyreUsed.toFixed(2)} vs peaked ${peaked.lapTimeMs.toFixed(0)}`,
    );
  });

  it("is quicker just past the tyre's peak than on a set straight out of the box", () => {
    const sensitive: CarPace = { ...flat, gripSensitivity: 1, tyreLifeShare: 0.85 };
    const [entry] = simulateRace([sensitive], { laps: 40, random: middling });
    const first = entry.laps[0];
    const peaked = [...entry.laps]
      .filter((l) => !l.pitted)
      .sort((a, b) => Math.abs(a.tyreUsed - 0.15) - Math.abs(b.tyreUsed - 0.15))[0];
    assert.ok(peaked.lapTimeMs < first.lapTimeMs, "a new set is not the quickest set");
  });

  it("costs time to be off form and to make a mistake", () => {
    const sensitive: CarPace = { ...flat, gripSensitivity: 1, powerSensitivity: 1, errorChance: 1 };
    const clean = simulateRace([sensitive], { laps: 5, random: middling })[0];
    const rough = simulateRace([sensitive], { laps: 5, random: () => 0.999 })[0];
    assert.ok(rough.totalTimeMs > clean.totalTimeMs);
  });

  it("keeps the power loss inside the two per cent it is allowed", () => {
    const sensitive: CarPace = { ...flat, powerSensitivity: 1 };
    const worst = simulateRace([sensitive], { laps: 1, random: () => 0.999 })[0];
    assert.ok(worst.totalTimeMs <= 100_000 * 1.04 + 1, `${worst.totalTimeMs}`);
    assert.ok(worst.totalTimeMs > 100_000 * 1.03);
  });

  it("gives every car its own grid slot", () => {
    const race = simulateRace([flat, { ...flat, carId: "b" }], { laps: 2, random: never });
    assert.deepEqual(
      race.map((e) => e.gridIndex),
      [0, 1],
    );
  });

  it("brings every car in once or twice, whatever it is and wherever it races", () => {
    for (const track of [monza, monaco]) {
      const laps = lapsFor(track.lengthM);
      for (const car of cars.filter((_, i) => i % 900 === 0)) {
        const [entry] = simulateRace([carPace(car, track)], { laps });
        assert.ok(
          entry.stops === 1 || entry.stops === 2,
          `${car.id} made ${entry.stops} stops at ${track.name}`,
        );
      }
    }
  });
});

describe("progressAt", () => {
  const [entry] = simulateRace([{ ...flat, tyreLifeShare: 100 }], { laps: 10, random: middling });

  it("is on the grid before the start", () => {
    const p = progressAt(entry, 0, 10);
    assert.equal(p.lapsDone, 0);
    assert.equal(p.distanceLaps, 0);
  });

  it("counts the laps as they are completed", () => {
    assert.equal(progressAt(entry, 250_000, 10).lapsDone, 2);
    assert.ok(Math.abs(progressAt(entry, 250_000, 10).lapFraction - 0.5) < 0.001);
  });

  it("stops the clock at the flag", () => {
    const p = progressAt(entry, 5_000_000, 10);
    assert.ok(p.finished);
    assert.equal(p.elapsedMs, entry.totalTimeMs);
    assert.equal(p.distanceLaps, 10);
  });
});

describe("rankRace", () => {
  it("puts a finished car ahead of one still running", () => {
    const race = simulateRace([flat, { ...flat, carId: "slow", baseLapMs: 200_000 }], {
      laps: 5,
      random: middling,
    });
    const at = 600_000;
    const ranked = rankRace(race.map((e) => progressAt(e, at, 5)));
    assert.equal(ranked[0].carId, "flat");
    assert.ok(ranked[0].distanceLaps > ranked[1].distanceLaps);
  });

  it("gives the gap in laps while the race is on and in time once it is over", () => {
    const race = simulateRace([flat, { ...flat, carId: "slow", baseLapMs: 110_000 }], {
      laps: 5,
      random: middling,
    });
    const mid = rankRace(race.map((e) => progressAt(e, 300_000, 5)));
    assert.ok(mid[1].gapLaps !== null && mid[1].gapLaps > 0);
    const end = rankRace(race.map((e) => progressAt(e, 10_000_000, 5)));
    assert.equal(end[0].gapMs, 0);
    assert.equal(end[1].gapMs, 50_000);
  });
});

describe("the size of a field", () => {
  it("is twenty-eight", () => {
    assert.equal(MAX_RACE_CARS, 28);
  });
});

/** The one rule the race mode must never break.
 *
 * A leaderboard time is one clean lap, repeatable to the millisecond; a race
 * has tyre wear, a driver's mistakes and the day's form in it. Letting one
 * into the other would quietly ruin every record in the game, and it is the
 * kind of thing a well-meaning refactor does by accident - so it is checked at
 * the source rather than left to good intentions.
 */
describe("nothing from a race reaches the records", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const raceMode = [
    "src/lib/lap-race.ts",
    "src/components/LapRaceRunner.tsx",
    "src/components/LapRaceSetup.tsx",
    "src/app/rennen/page.tsx",
  ];

  it("keeps the race mode away from the time store entirely", () => {
    for (const file of raceMode) {
      const source = readFileSync(root + file, "utf8");
      for (const forbidden of ["time-store", "timeStore", "saveRun", "use-track-times"]) {
        assert.ok(
          !source.includes(forbidden),
          `${file} mentions ${forbidden} - a race time must never reach a leaderboard`,
        );
      }
    }
  });

  it("leaves the writing of times to the lap runner alone", () => {
    // If a second place in the app ever starts writing times, this is where
    // the question gets asked: is that place deterministic?
    const writers = ["src/lib/time-store.ts", "src/components/RaceRunner.tsx"];
    for (const file of writers) {
      assert.ok(readFileSync(root + file, "utf8").includes("saveRun"), `${file} should still write times`);
    }
  });
});
