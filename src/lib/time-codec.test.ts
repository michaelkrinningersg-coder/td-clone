import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BYTES_PER_TIME, decodeTimes, encodeTimes } from "./time-codec";
import type { TimeEntryData } from "./time-store";
import { cars, tracks } from "./data";

const entry = (carId: string, trackId: string, timeMs: number): TimeEntryData => ({
  id: `${trackId}:${carId}`,
  carId,
  trackId,
  timeMs,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("encodeTimes and decodeTimes", () => {
  it("gives back exactly what it was given", () => {
    const entries = [
      entry("golf", "monza", 90_123),
      entry("m3", "monza", 88_456),
      entry("golf", "spa", 130_000),
    ];
    const decoded = decodeTimes(encodeTimes(entries, 1_700_000_000));
    assert.deepEqual(
      decoded.map((e) => [e.carId, e.trackId, e.timeMs]),
      entries.map((e) => [e.carId, e.trackId, e.timeMs]),
    );
    assert.deepEqual(
      decoded.map((e) => e.id),
      ["monza:golf", "monza:m3", "spa:golf"],
    );
  });

  it("keeps one timestamp for the write rather than one per time", () => {
    const [decoded] = decodeTimes(encodeTimes([entry("golf", "monza", 90_000)], 1_700_000_000));
    assert.equal(decoded.createdAt, new Date(1_700_000_000_000).toISOString());
  });

  it("handles an empty store", () => {
    assert.deepEqual(decodeTimes(encodeTimes([], 0)), []);
  });

  // A dictionary means a car that has been round twenty tracks costs its long
  // slug once, not twenty times.
  it("writes each id once however often it is used", () => {
    const long = "porsche-cayenne-turbo-s-955-2006-4-5l-v8-6at";
    const many = tracks.slice(0, 20).map((t) => entry(long, t.id, 100_000));
    const payload = JSON.parse(encodeTimes(many, 0)) as { c: string[]; t: string[] };
    assert.deepEqual(payload.c, [long]);
    assert.equal(payload.t.length, 20);
  });

  it("costs six bytes a time, which is what the budget is made of", () => {
    const entries = Array.from({ length: 1000 }, (_, i) => entry(`car-${i}`, "monza", 90_000 + i));
    const payload = JSON.parse(encodeTimes(entries, 0)) as { d: string };
    // Base64 is four characters per three bytes.
    const bytes = (payload.d.length / 4) * 3;
    assert.equal(bytes, entries.length * BYTES_PER_TIME);
  });

  // The whole field on every track is the worst case the storage has to hold.
  it("fits the entire field inside a browser's five megabytes", () => {
    const entries: TimeEntryData[] = [];
    for (const track of tracks) {
      for (const car of cars) entries.push(entry(car.id, track.id, 90_000));
    }
    const size = encodeTimes(entries, 0).length;
    assert.equal(entries.length, cars.length * tracks.length);
    assert.ok(size < 5_000_000, `${(size / 1024 / 1024).toFixed(2)} MB should fit in 5 MB`);
  });

  it("clamps a time no run could produce rather than wrapping it round", () => {
    const [decoded] = decodeTimes(encodeTimes([entry("golf", "monza", 99_999_999)], 0));
    assert.ok(decoded.timeMs > 16_000_000, `${decoded.timeMs} should be pinned at the ceiling`);
    assert.ok(decoded.timeMs <= 0xffffff);
  });

  it("rounds a fractional millisecond instead of writing a broken byte", () => {
    const [decoded] = decodeTimes(encodeTimes([entry("golf", "monza", 90_000.6)], 0));
    assert.equal(decoded.timeMs, 90_001);
  });
});

describe("reading what earlier versions wrote", () => {
  // An update must never cost a player their history.
  it("reads the first shape, an array of full objects", () => {
    const raw = JSON.stringify([
      { id: "monza:golf", carId: "golf", trackId: "monza", timeMs: 88_000, createdAt: "2020-01-01T00:00:00.000Z" },
    ]);
    assert.deepEqual(
      decodeTimes(raw).map((e) => [e.carId, e.trackId, e.timeMs]),
      [["golf", "monza", 88_000]],
    );
  });

  it("reads the second shape, an array of tuples", () => {
    const raw = JSON.stringify([["golf", "monza", 88_000, 1_600_000_000]]);
    const [decoded] = decodeTimes(raw);
    assert.equal(decoded.carId, "golf");
    assert.equal(decoded.timeMs, 88_000);
    assert.equal(decoded.id, "monza:golf");
  });

  it("comes back empty rather than throwing on anything it cannot read", () => {
    for (const raw of ["", "not json", "{}", '{"v":99}', '{"v":3}', "null", "42"]) {
      assert.deepEqual(decodeTimes(raw), [], raw);
    }
  });

  it("skips a time whose id is missing from the dictionary", () => {
    const good = encodeTimes([entry("golf", "monza", 90_000)], 0);
    const broken = JSON.parse(good) as { c: string[] };
    broken.c = [];
    assert.deepEqual(decodeTimes(JSON.stringify(broken)), []);
  });
});
