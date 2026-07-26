import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { browserTimeStore as store, isImprovement } from "./time-store";

describe("isImprovement", () => {
  it("accepts a quicker run", () => {
    assert.equal(isImprovement(100_000, 99_999), true);
  });

  it("keeps the stored time when the repeat ties or is slower", () => {
    assert.equal(isImprovement(100_000, 100_000), false);
    assert.equal(isImprovement(100_000, 100_001), false);
  });
});

/** The localStorage store is the one that ships to Pages, so its clearing rules
 * are worth pinning down: they are the only destructive path in the app. */
describe("localStorage store", () => {
  before(() => {
    const data = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
      },
    };
  });

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
