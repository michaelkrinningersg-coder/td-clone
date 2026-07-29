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
  qualify,
  rankRace,
  simulateRace,
  strategyCostMs,
  trackTraits,
  tyreGrip,
  type CarPace,
  type TrackTraits,
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
  towSensitivity: 0,
  tyreLifeShare: 0.85,
  axleWear: { front: 1, rear: 1 },
  errorChance: 0,
};

/** A circuit that does nothing to a race: no corners to lose grip in, no
 * straight to tow down, and passing free. */
const plain: TrackTraits = {
  cornerShare: 0,
  straightShare: 0,
  longestStraightM: 0,
  overtakeThreshold: 0,
};

/** Rolls in the middle every time: no jitter on the stop laps, no errors, the
 * same form for everyone. */
const middling = () => 0.5;

describe("lapsFor", () => {
  it("makes whole laps out of the race distance", () => {
    assert.equal(lapsFor(5000), 50);
    assert.equal(lapsFor(RACE_DISTANCE_M), 1);
  });

  it("rounds to the nearest lap rather than cutting one short", () => {
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

describe("trackTraits", () => {
  it("asks for far more pace to pass at Monaco than at Monza", () => {
    assert.ok(trackTraits(monaco).overtakeThreshold > trackTraits(monza).overtakeThreshold * 3);
  });

  it("reads the straight a tow would be had on", () => {
    assert.ok(trackTraits(monza).straightShare > trackTraits(monaco).straightShare);
    assert.ok(trackTraits(monza).longestStraightM > 800);
  });

  it("keeps every circuit's threshold in a range that means something", () => {
    for (const track of tracks.filter((t) => t.outline !== undefined)) {
      const { overtakeThreshold } = trackTraits(track);
      assert.ok(
        overtakeThreshold > 0.002 && overtakeThreshold < 0.021,
        `${track.name}: ${(overtakeThreshold * 100).toFixed(2)} %`,
      );
    }
  });
});

describe("carPace", () => {
  const golf = cars.find((c) => c.make === "Volkswagen" && c.model.includes("Golf"))!;
  const heavy = { ...golf, id: "heavy", weightKg: 2400, tyreWidthMm: 175 };
  const light = { ...golf, id: "light", weightKg: 1100, tyreWidthMm: 285 };

  it("costs time to lose grip or power, and saves it to lose drag", () => {
    const pace = carPace(golf, monza);
    assert.ok(pace.gripSensitivity > 0);
    assert.ok(pace.powerSensitivity > 0);
    assert.ok(pace.towSensitivity > 0);
  });

  it("gives the tow to the car that needs it", () => {
    // A barn door gains more from someone else's hole in the air than a car
    // that was already slippery.
    const brick = { ...golf, id: "brick", dragCoefficient: 0.42, heightMm: 1900, widthMm: 1950 };
    const slippery = { ...golf, id: "slippery", dragCoefficient: 0.24, heightMm: 1300 };
    assert.ok(carPace(brick, monza).towSensitivity > carPace(slippery, monza).towSensitivity);
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

  it("wears the axle that does the work", () => {
    const fwd = carPace({ ...golf, drivetrain: "FWD" }, monza).axleWear;
    const rwd = carPace({ ...golf, drivetrain: "RWD" }, monza).axleWear;
    const awd = carPace({ ...golf, drivetrain: "AWD" }, monza).axleWear;
    assert.ok(fwd.front > fwd.rear, "front-driven cars eat the fronts");
    assert.ok(rwd.rear > rwd.front, "rear-driven cars eat the rears");
    // Four-wheel drive shares it out, so its worst axle is the least worst.
    assert.ok(Math.max(awd.front, awd.rear) < Math.max(fwd.front, fwd.rear));
    assert.ok(Math.max(awd.front, awd.rear) < Math.max(rwd.front, rwd.rear));
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

describe("qualify", () => {
  const field: CarPace[] = [
    { ...flat, carId: "quick", baseLapMs: 90_000 },
    { ...flat, carId: "middle", baseLapMs: 91_000 },
    { ...flat, carId: "slow", baseLapMs: 120_000 },
  ];

  it("puts the quickest car on pole when nobody has a moment", () => {
    const grid = qualify(field, middling);
    assert.equal(grid[0].carId, "quick");
    assert.deepEqual(
      grid.map((g) => g.gridIndex),
      [0, 1, 2],
    );
  });

  it("costs every car up to three per cent of its lap", () => {
    for (const roll of [0, 0.5, 0.999]) {
      const [pole] = qualify([field[0]], () => roll);
      assert.ok(pole.lapMs >= 90_000);
      assert.ok(pole.lapMs <= 90_000 * 1.03 + 1, `rolled ${roll}: ${pole.lapMs}`);
    }
  });

  it("can turn the order round between cars that are close", () => {
    // The quick car has a scruffy lap, the one a per cent behind a clean one.
    let call = 0;
    const grid = qualify([field[0], field[1]], () => (call++ === 0 ? 0.999 : 0));
    assert.equal(grid[0].carId, "middle");
    // And never between cars that are not close at all.
    let second = 0;
    const wide = qualify([field[0], field[2]], () => (second++ === 0 ? 0.999 : 0));
    assert.equal(wide[0].carId, "quick");
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
          for (const risk of [-1, 0, 1]) {
            const stops = planStops(pace, laps, middling, risk).length;
            assert.ok(stops === 1 || stops === 2, `${stops} stops at ${laps} laps, life ${life}`);
          }
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

  it("sends the impatient in early and the patient out long", () => {
    const [early] = planStops(wearing, 40, middling, -1);
    const [late] = planStops(wearing, 40, middling, 1);
    assert.ok(early < 20 && late > 20, `${early} vs ${late}`);
    assert.equal(late - early, 6);
  });

  it("takes the second stop when the tyres cost more than the pit lane", () => {
    const punishing: CarPace = { ...flat, gripSensitivity: 3, tyreLifeShare: 0.6 };
    assert.equal(planStops(punishing, 60, middling).length, 2);
  });

  it("stays on one stop when the tyres cost less than the pit lane", () => {
    const gentle: CarPace = { ...flat, gripSensitivity: 0.05, tyreLifeShare: 0.85 };
    assert.equal(planStops(gentle, 60, middling).length, 1);
  });

  it("agrees with the cost it is deciding on", () => {
    const punishing: CarPace = { ...flat, gripSensitivity: 3, tyreLifeShare: 0.6 };
    assert.ok(strategyCostMs(punishing, 60, [20, 40]) < strategyCostMs(punishing, 60, [30]));
  });

  // The strongest check there is on the pit wall: run the race both ways and
  // see whether the plan it chose was the quicker one.
  it("chooses the strategy that is actually faster", () => {
    for (const track of [monza, monaco]) {
      const laps = lapsFor(track.lengthM);
      const traits = trackTraits(track);
      for (const car of cars.filter((_, i) => i % 800 === 0)) {
        const pace = carPace(car, track);
        const chosen = planStops(pace, laps, middling).length;
        const race = (stopLaps: number[]) =>
          simulateRace([pace], { laps, traits, stopLaps, random: middling }).entries[0].totalTimeMs;
        const one = race([Math.round(laps / 2)]);
        const two = race([Math.round(laps / 3), Math.round((2 * laps) / 3)]);
        assert.equal(
          chosen,
          one <= two ? 1 : 2,
          `${car.id} at ${track.name}: chose ${chosen}, one ${(one / 1000).toFixed(1)} s, two ${(two / 1000).toFixed(1)} s`,
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

describe("a lap of the race", () => {
  const solo = (over: Partial<CarPace> = {}, laps = 20) =>
    simulateRace([{ ...flat, ...over }], { laps, traits: plain, random: middling }).entries[0];

  it("is slowest on the first lap, because everything is cold", () => {
    const entry = solo();
    assert.ok(entry.laps[0].lapTimeMs > entry.laps[1].lapTimeMs);
    assert.ok(Math.abs(entry.laps[0].lapTimeMs / flat.baseLapMs - 1.02) < 0.001);
  });

  it("is quicker at the end than in the middle, because the circuit rubbers in", () => {
    const entry = solo();
    const clean = entry.laps.filter((l) => !l.pitted && !l.outLap && l !== entry.laps[0]);
    assert.ok(clean[clean.length - 1].lapTimeMs < clean[0].lapTimeMs);
    // A per cent and a half over the race, near enough.
    const gain = 1 - clean[clean.length - 1].lapTimeMs / clean[0].lapTimeMs;
    assert.ok(gain > 0.01 && gain < 0.02, `${(gain * 100).toFixed(2)} %`);
  });

  it("loses time on the lap out of the pits", () => {
    const entry = solo();
    const out = entry.laps.findIndex((l) => l.outLap);
    assert.ok(out > 0, "there has to be an out lap");
    assert.ok(entry.laps[out].lapTimeMs > entry.laps[out + 1].lapTimeMs);
  });

  it("keeps the power loss inside the two per cent it is allowed", () => {
    const worst = simulateRace([{ ...flat, powerSensitivity: 1 }], {
      laps: 1,
      traits: plain,
      random: () => 0.999,
    }).entries[0];
    // One lap, so cold tyres too - the power part alone must not exceed four
    // per cent, and the first lap adds its two.
    assert.ok(worst.totalTimeMs <= 100_000 * 1.061, `${worst.totalTimeMs}`);
  });

  it("runs slower on a spent set than on a peaked one", () => {
    const entry = solo({ gripSensitivity: 1 }, 40);
    const spent = [...entry.laps].filter((l) => !l.pitted).sort((a, b) => b.tyreUsed - a.tyreUsed)[0];
    const peaked = [...entry.laps]
      .filter((l) => !l.pitted && !l.outLap)
      .sort((a, b) => Math.abs(a.tyreUsed - 0.15) - Math.abs(b.tyreUsed - 0.15))[0];
    assert.ok(spent.lapTimeMs > peaked.lapTimeMs);
  });
});

describe("pit stops in the race", () => {
  it("brings every car in once or twice, whatever it is and wherever it races", () => {
    for (const track of [monza, monaco]) {
      const laps = lapsFor(track.lengthM);
      const traits = trackTraits(track);
      for (const car of cars.filter((_, i) => i % 900 === 0)) {
        const [entry] = simulateRace([carPace(car, track)], { laps, traits }).entries;
        assert.ok(entry.stops === 1 || entry.stops === 2, `${car.id} made ${entry.stops} stops`);
      }
    }
  });

  it("costs the pit time, and sometimes more", () => {
    const clean = simulateRace([flat], { laps: 20, traits: plain, random: middling }).entries[0];
    // A roll that always botches the stop: same race, several seconds worse.
    let call = 0;
    const botched = simulateRace([flat], {
      laps: 20,
      traits: plain,
      // Every fifth roll is the botch check; 0.5 elsewhere keeps the rest put.
      random: () => (++call % 5 === 0 ? 0.001 : 0.5),
    }).entries[0];
    assert.ok(botched.totalTimeMs > clean.totalTimeMs);
    assert.ok(clean.botchedStops === 0);
  });

  it("puts the car on fresh tyres afterwards", () => {
    const entry = simulateRace([flat], { laps: 20, traits: plain, random: middling }).entries[0];
    const pitLap = entry.laps.findIndex((l) => l.pitted);
    assert.equal(entry.laps[pitLap + 1].tyreUsed, 0);
  });

  it("does not change tyres on the last lap", () => {
    const entry = simulateRace([flat], { laps: 3, traits: plain, random: middling }).entries[0];
    assert.equal(entry.laps[2].pitted, false);
  });
});

describe("traffic", () => {
  /** Two cars, the quicker one starting behind - which is the only situation
   * in which traffic means anything. */
  const chase = (advantage: number, traits: TrackTraits, random = middling) =>
    simulateRace(
      [
        { ...flat, carId: "slow", baseLapMs: 100_000 },
        { ...flat, carId: "quick", baseLapMs: 100_000 * (1 - advantage) },
      ],
      { laps: 12, traits, stopLaps: [6], grid: ["slow", "quick"], random },
    );

  it("lets a much quicker car through", () => {
    const race = chase(0.05, { ...plain, overtakeThreshold: 0.004 });
    const quick = race.entries.find((e) => e.carId === "quick")!;
    const slow = race.entries.find((e) => e.carId === "slow")!;
    assert.ok(quick.totalTimeMs < slow.totalTimeMs, "five per cent has to be enough");
  });

  it("holds up a car that is barely quicker", () => {
    const threshold = 0.02;
    const race = chase(0.005, { ...plain, overtakeThreshold: threshold });
    const quick = race.entries.find((e) => e.carId === "quick")!;
    assert.ok(
      quick.laps.some((l) => l.heldUp),
      "half a per cent must not get past where two are needed",
    );
  });

  it("costs the follower time it would not have lost alone", () => {
    const threshold = 0.02;
    const together = chase(0.005, { ...plain, overtakeThreshold: threshold });
    const alone = simulateRace([{ ...flat, carId: "quick", baseLapMs: 99_500 }], {
      laps: 12,
      traits: { ...plain, overtakeThreshold: threshold },
      stopLaps: [6],
      random: middling,
    });
    const stuck = together.entries.find((e) => e.carId === "quick")!;
    assert.ok(stuck.totalTimeMs > alone.entries[0].totalTimeMs);
  });

  it("makes the same car easier to pass on a circuit with a straight", () => {
    const advantage = 0.008;
    const easy = chase(advantage, { ...plain, overtakeThreshold: 0.003 });
    const hard = chase(advantage, { ...plain, overtakeThreshold: 0.02 });
    const heldOn = (race: ReturnType<typeof chase>) =>
      race.entries.find((e) => e.carId === "quick")!.laps.filter((l) => l.heldUp).length;
    assert.ok(heldOn(easy) < heldOn(hard), `${heldOn(easy)} vs ${heldOn(hard)}`);
  });

  it("gives the car behind a tow down the straight and takes grip in the corners", () => {
    const towed = simulateRace(
      [
        { ...flat, carId: "ahead" },
        { ...flat, carId: "behind", towSensitivity: 1 },
      ],
      {
        laps: 6,
        traits: { ...plain, straightShare: 1, overtakeThreshold: 10 },
        stopLaps: [3],
        grid: ["ahead", "behind"],
        random: middling,
      },
    );
    const behind = towed.entries.find((e) => e.carId === "behind")!;
    assert.ok(
      behind.laps.some((l) => l.inTraffic),
      "the car behind is in the wake",
    );

    const dirtied = simulateRace(
      [
        { ...flat, carId: "ahead" },
        { ...flat, carId: "behind", gripSensitivity: 1 },
      ],
      {
        laps: 6,
        traits: { ...plain, cornerShare: 1, overtakeThreshold: 10 },
        stopLaps: [3],
        grid: ["ahead", "behind"],
        random: middling,
      },
    );
    const inDirtyAir = dirtied.entries.find((e) => e.carId === "behind")!;
    const clean = simulateRace([{ ...flat, carId: "behind", gripSensitivity: 1 }], {
      laps: 6,
      traits: { ...plain, cornerShare: 1 },
      stopLaps: [3],
      random: middling,
    }).entries[0];
    assert.ok(inDirtyAir.totalTimeMs > clean.totalTimeMs, "following costs grip in the corners");
  });

  it("never lets two cars occupy the same piece of road", () => {
    const race = chase(0.01, { ...plain, overtakeThreshold: 0.05 });
    for (let lap = 0; lap < 12; lap++) {
      const times = race.entries.map((e) => e.laps[lap].elapsedMs).sort((a, b) => a - b);
      assert.ok(times[1] - times[0] >= 299, `lap ${lap + 1}: ${(times[1] - times[0]).toFixed(0)} ms apart`);
    }
  });
});

describe("the grid", () => {
  it("gives away time for every place further back", () => {
    const field = [
      { ...flat, carId: "a", baseLapMs: 90_000 },
      { ...flat, carId: "b", baseLapMs: 95_000 },
      { ...flat, carId: "c", baseLapMs: 100_000 },
    ];
    const race = simulateRace(field, { laps: 4, traits: plain, stopLaps: [2], random: middling });
    assert.deepEqual(
      race.entries.map((e) => e.gridIndex),
      [0, 1, 2],
    );
    // Nobody is on the road before the car in front of them has gone.
    const first = race.entries[0].laps[0].elapsedMs;
    const third = race.entries[2].laps[0].elapsedMs;
    assert.ok(third - first > 800 - 1);
  });
});

describe("the safety car", () => {
  /** A field that crashes constantly, so the safety car is certain to come. */
  const clumsy = { ...flat, errorChance: 1 };

  it("comes out after a big moment and bunches the field up", () => {
    // Every roll high: the error happens and the safety car is called.
    const race = simulateRace([clumsy, { ...clumsy, carId: "b", baseLapMs: 130_000 }], {
      laps: 20,
      traits: plain,
      stopLaps: [10],
      random: () => 0.001,
    });
    assert.ok(race.safetyCarLaps.length > 0, "no safety car at all");

    const last = race.safetyCarLaps[race.safetyCarLaps.length - 1];
    const gapAfter = Math.abs(
      race.entries[0].laps[last - 1].elapsedMs - race.entries[1].laps[last - 1].elapsedMs,
    );
    const gapBefore = Math.abs(
      race.entries[0].laps[last - 2].elapsedMs - race.entries[1].laps[last - 2].elapsedMs,
    );
    assert.ok(gapAfter < gapBefore, `${gapAfter.toFixed(0)} ms should be under ${gapBefore.toFixed(0)}`);
  });

  it("slows everybody to the same pace while it is out", () => {
    const race = simulateRace([clumsy, { ...clumsy, carId: "b", baseLapMs: 130_000 }], {
      laps: 20,
      traits: plain,
      stopLaps: [10],
      random: () => 0.001,
    });
    const lap = race.safetyCarLaps[0];
    assert.ok(race.entries.every((e) => e.laps[lap - 1].safetyCar));
  });

  it("stays away when nobody puts it in the wall", () => {
    const race = simulateRace([flat], { laps: 30, traits: plain, random: middling });
    assert.deepEqual(race.safetyCarLaps, []);
  });
});

describe("progressAt", () => {
  const entry = simulateRace([{ ...flat, tyreLifeShare: 100 }], {
    laps: 10,
    traits: plain,
    stopLaps: [],
    random: middling,
  }).entries[0];

  it("is on the grid before the start", () => {
    const p = progressAt(entry, 0, 10);
    assert.equal(p.lapsDone, 0);
    assert.equal(p.distanceLaps, 0);
  });

  it("counts the laps as they are completed", () => {
    assert.equal(progressAt(entry, entry.laps[1].elapsedMs + 1, 10).lapsDone, 2);
  });

  it("stops the clock at the flag", () => {
    const p = progressAt(entry, 5_000_000, 10);
    assert.ok(p.finished);
    assert.equal(p.elapsedMs, entry.totalTimeMs);
    assert.equal(p.distanceLaps, 10);
  });
});

describe("rankRace", () => {
  const race = simulateRace(
    [
      { ...flat, carId: "quick", baseLapMs: 100_000 },
      { ...flat, carId: "slow", baseLapMs: 200_000 },
    ],
    { laps: 5, traits: plain, stopLaps: [2], random: middling },
  );

  it("puts a finished car ahead of one still running", () => {
    const ranked = rankRace(race.entries.map((e) => progressAt(e, 600_000, 5)));
    assert.equal(ranked[0].carId, "quick");
    assert.ok(ranked[0].distanceLaps > ranked[1].distanceLaps);
  });

  it("gives the gap in laps while the race is on and in time once it is over", () => {
    const mid = rankRace(race.entries.map((e) => progressAt(e, 300_000, 5)));
    assert.ok(mid[1].gapLaps !== null && mid[1].gapLaps > 0);
    const end = rankRace(race.entries.map((e) => progressAt(e, 10_000_000, 5)));
    assert.equal(end[0].gapMs, 0);
    assert.ok((end[1].gapMs ?? 0) > 0);
  });
});

describe("the size of a field", () => {
  it("is twenty-eight", () => {
    assert.equal(MAX_RACE_CARS, 28);
  });

  it("costs twenty-five seconds to change tyres", () => {
    assert.equal(PIT_LOSS_MS, 25_000);
  });
});

/** The one rule the race mode must never break.
 *
 * A leaderboard time is one clean lap, repeatable to the millisecond; a race
 * has tyre wear, traffic, a driver's mistakes and the day's form in it.
 * Letting one into the other would quietly ruin every record in the game, and
 * it is the kind of thing a well-meaning refactor does by accident - so it is
 * checked at the source rather than left to good intentions. */
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
    const writers = ["src/lib/time-store.ts", "src/components/RaceRunner.tsx"];
    for (const file of writers) {
      assert.ok(readFileSync(root + file, "utf8").includes("saveRun"), `${file} should still write times`);
    }
  });

  it("keeps the race mode's own effects out of the ordinary lap", () => {
    // Tyre wear, traffic and the rest live in lap-race.ts. physics.ts knows
    // only what it is told to do for one run, which is what keeps a lap time
    // the same today as it was yesterday.
    const physics = readFileSync(root + "src/lib/physics.ts", "utf8");
    // Named exactly, not as substrings: physics.ts has its own tyre grip in
    // `tyreGripFactor`, which is a property of the car and has nothing to do
    // with a set going off over a stint.
    for (const forbidden of ["tyreGrip(", "tyreLife", "safetyCar", "overtake", "Math.random"]) {
      assert.ok(!physics.includes(forbidden), `physics.ts mentions ${forbidden}`);
    }
  });
});
