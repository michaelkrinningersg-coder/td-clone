import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";
import { StorageFullError, browserTimeStore as store, isImprovement } from "./time-store";

describe("isImprovement", () => {
  it("accepts a quicker run", () => {
    assert.equal(isImprovement(100_000, 99_999), true);
  });

  it("keeps the stored time when the repeat ties or is slower", () => {
    assert.equal(isImprovement(100_000, 100_000), false);
    assert.equal(isImprovement(100_000, 100_001), false);
  });
});

/** A localStorage that lives in a Map, so the store can be driven without a
 * browser. Shared by every block below that needs one. */
function stubStorage() {
  const data = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    },
  };
}

/** The localStorage store is the one that ships to Pages, so its clearing rules
 * are worth pinning down: they are the only destructive path in the app. */
describe("localStorage store", () => {
  before(stubStorage);

  async function seed() {
    await store.clear();
    await store.saveRun("car-a", "monza", 100_000);
    await store.saveRun("car-b", "monza", 110_000);
    await store.saveRun("car-a", "spa", 200_000);
  }

  it("empties a single track and leaves the others alone", async () => {
    await seed();
    assert.equal(await store.clear("monza"), 2);
    assert.deepEqual(await store.getLeaderboard("monza"), []);
    assert.equal((await store.getLeaderboard("spa")).length, 1);
  });

  it("empties every track when none is named", async () => {
    await seed();
    assert.equal(await store.clear(), 3);
    assert.deepEqual(await store.getLeaderboard("monza"), []);
    assert.deepEqual(await store.getLeaderboard("spa"), []);
  });

  it("reports nothing dropped for a track without times", async () => {
    await seed();
    assert.equal(await store.clear("nuerburgring"), 0);
    assert.equal((await store.getLeaderboard("monza")).length, 2);
  });

  it("is harmless on an already empty board", async () => {
    await store.clear();
    assert.equal(await store.clear(), 0);
  });

  it("lets a car set a time again after a reset", async () => {
    await seed();
    await store.clear("monza");
    const result = await store.saveRun("car-a", "monza", 105_000);
    assert.equal(result.rank, 1);
    assert.equal(result.totalEntries, 1);
    assert.equal(result.entry.timeMs, 105_000);
  });
});

describe("storage format", () => {
  before(stubStorage);
  beforeEach(() => store.clear());

  it("writes tuples, not objects, and reads its own writing back", async () => {
    await store.saveRun("golf", "monza", 90_000);
    const raw = JSON.parse(window.localStorage.getItem("td-clone:times")!);
    assert.ok(Array.isArray(raw[0]), "an entry should be stored as a tuple");
    assert.deepEqual(raw[0].slice(0, 3), ["golf", "monza", 90_000]);

    const [entry] = await store.getLeaderboard("monza");
    assert.equal(entry.carId, "golf");
    assert.equal(entry.timeMs, 90_000);
    assert.equal(entry.id, "monza:golf");
    assert.ok(!Number.isNaN(Date.parse(entry.createdAt)));
  });

  // Times written before the format changed have to survive the upgrade, or a
  // player loses everything to a deploy.
  it("still reads times written in the old object format", async () => {
    window.localStorage.setItem(
      "td-clone:times",
      JSON.stringify([
        { id: "monza:golf", carId: "golf", trackId: "monza", timeMs: 88_000, createdAt: "2020-01-01T00:00:00.000Z" },
      ]),
    );
    const [entry] = await store.getLeaderboard("monza");
    assert.equal(entry.carId, "golf");
    assert.equal(entry.timeMs, 88_000);

    // And the next write puts them back compact.
    await store.saveRun("polo", "monza", 95_000);
    const raw = JSON.parse(window.localStorage.getItem("td-clone:times")!);
    assert.ok(raw.every((e: unknown) => Array.isArray(e)));
    assert.equal((await store.getLeaderboard("monza")).length, 2);
  });

  it("survives a corrupt store rather than throwing", async () => {
    window.localStorage.setItem("td-clone:times", "not json at all");
    assert.deepEqual(await store.getLeaderboard("monza"), []);
  });
});

describe("saveRuns", () => {
  before(stubStorage);
  beforeEach(() => store.clear());

  it("writes a whole grid in one go", async () => {
    let writes = 0;
    const setItem = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = (k: string, v: string) => {
      writes++;
      setItem(k, v);
    };
    const results = await store.saveRuns([
      { carId: "a", trackId: "monza", timeMs: 90_000 },
      { carId: "b", trackId: "monza", timeMs: 91_000 },
      { carId: "c", trackId: "monza", timeMs: 89_000 },
    ]);
    window.localStorage.setItem = setItem;
    assert.equal(writes, 1, "one write for the whole grid");
    assert.equal(results.length, 3);
    assert.equal((await store.getLeaderboard("monza")).length, 3);
  });

  it("ranks each car against the whole grid, not against the ones before it", async () => {
    const results = await store.saveRuns([
      { carId: "slow", trackId: "monza", timeMs: 99_000 },
      { carId: "quick", trackId: "monza", timeMs: 80_000 },
    ]);
    assert.equal(results[0].rank, 2, "the slow car is second even though it saved first");
    assert.equal(results[1].rank, 1);
  });

  it("writes nothing when no car improved", async () => {
    await store.saveRuns([{ carId: "a", trackId: "monza", timeMs: 90_000 }]);
    let writes = 0;
    const setItem = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = (k: string, v: string) => {
      writes++;
      setItem(k, v);
    };
    await store.saveRuns([{ carId: "a", trackId: "monza", timeMs: 95_000 }]);
    window.localStorage.setItem = setItem;
    assert.equal(writes, 0);
  });
});

describe("a full store", () => {
  before(stubStorage);
  beforeEach(() => store.clear());

  it("says so in words a player can act on", async () => {
    const setItem = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = () => {
      const err = new Error("Failed to execute 'setItem' on 'Storage': quota exceeded");
      err.name = "QuotaExceededError";
      throw err;
    };
    await assert.rejects(
      () => store.saveRun("golf", "monza", 90_000),
      (err: Error) => {
        assert.equal(err.name, "StorageFullError");
        assert.ok(err instanceof StorageFullError);
        assert.ok(/voll/.test(err.message), err.message);
        assert.ok(/zurückgesetzt/.test(err.message), "it should say what to do");
        return true;
      },
    );
    window.localStorage.setItem = setItem;
  });

  it("passes anything that is not a quota problem straight through", async () => {
    const setItem = window.localStorage.setItem.bind(window.localStorage);
    window.localStorage.setItem = () => {
      throw new TypeError("something else entirely");
    };
    await assert.rejects(
      () => store.saveRun("golf", "monza", 90_000),
      (err: Error) => err instanceof TypeError,
    );
    window.localStorage.setItem = setItem;
  });
});
