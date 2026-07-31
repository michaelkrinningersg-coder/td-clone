import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SAVE_FORMAT,
  SAVE_VERSION,
  buildSave,
  mergeTimes,
  readSave,
  replaceTimes,
  saveFileName,
  type SavedTime,
} from "./save-game";
import type { TimeEntryData } from "./time-store";

const entry = (carId: string, trackId: string, timeMs: number): TimeEntryData => ({
  id: `${trackId}:${carId}`,
  carId,
  trackId,
  timeMs,
  createdAt: "2026-01-01T00:00:00.000Z",
});
const knowsAll = () => true;
const field = { cars: 5451, tracks: 70 };

describe("buildSave", () => {
  it("writes the times as tuples and stamps the file", () => {
    const save = buildSave(
      { times: [entry("golf", "monza", 90_000)], field },
      new Date("2026-07-31T12:00:00.000Z"),
    );
    assert.equal(save.format, SAVE_FORMAT);
    assert.equal(save.version, SAVE_VERSION);
    assert.equal(save.exportedAt, "2026-07-31T12:00:00.000Z");
    assert.deepEqual(save.times, [["golf", "monza", 90_000]]);
    assert.deepEqual(save.field, field);
  });

  // A save should not claim a championship is running when none is.
  it("leaves out what is not running", () => {
    const save = buildSave({ times: [], field }, new Date(0));
    assert.ok(!("championship" in save));
    assert.ok(!("duel" in save));
    assert.ok(!("session" in save));
  });

  it("carries whatever is running, verbatim", () => {
    const championship = { round: 3, calendar: ["monza"], nested: { deep: true } };
    const save = buildSave({ times: [], field, championship, duel: null }, new Date(0));
    assert.deepEqual(save.championship, championship);
    assert.ok(!("duel" in save), "null is not something running");
  });

  it("names the file so saves sort by date", () => {
    assert.equal(
      saveFileName(new Date("2026-07-31T12:34:56.000Z")),
      "top-drives-spielstand-2026-07-31-12-34.json",
    );
  });
});

describe("readSave", () => {
  const good = JSON.stringify(buildSave({ times: [entry("golf", "monza", 90_000)], field }, new Date(0)));

  it("reads back what buildSave wrote", () => {
    const result = readSave(good);
    assert.ok(result.ok);
    assert.deepEqual(result.save.times, [["golf", "monza", 90_000]]);
  });

  // Being handed the wrong file is the ordinary case, so it has to say which.
  it("says what is wrong rather than just failing", () => {
    const cases: [string, RegExp][] = [
      ["not json", /keine JSON-Datei/],
      ["[1,2,3]", /keinen Spielstand/],
      ["null", /keinen Spielstand/],
      ['{"format":"something-else"}', /kein Spielstand dieses Spiels/],
      [`{"format":"${SAVE_FORMAT}","version":99}`, /neueren Version/],
      [`{"format":"${SAVE_FORMAT}","version":1}`, /fehlen die Zeiten/],
    ];
    for (const [text, expected] of cases) {
      const result = readSave(text);
      assert.ok(!result.ok, text);
      assert.match(result.error, expected, text);
    }
  });

  it("drops a broken time instead of rejecting the whole file", () => {
    const result = readSave(
      `{"format":"${SAVE_FORMAT}","version":1,"times":[["golf","monza",90000],["bad"],null,["x","y",0],["z","w",-5]]}`,
    );
    assert.ok(result.ok);
    assert.deepEqual(result.save.times, [["golf", "monza", 90_000]]);
  });

  it("accepts a file from an older version", () => {
    const result = readSave(`{"format":"${SAVE_FORMAT}","version":1,"times":[]}`);
    assert.ok(result.ok);
  });
});

describe("mergeTimes", () => {
  const existing = [entry("golf", "monza", 90_000), entry("m3", "monza", 85_000)];

  it("keeps whichever time is quicker", () => {
    const incoming: SavedTime[] = [
      ["golf", "monza", 88_000], // quicker than stored
      ["m3", "monza", 87_000], // slower than stored
      ["polo", "monza", 99_000], // new
    ];
    const report = mergeTimes(existing, incoming, knowsAll);
    assert.equal(report.improved, 1);
    assert.equal(report.kept, 1);
    assert.equal(report.added, 1);
    const byCar = new Map(report.entries.map((t) => [t[0], t[2]]));
    assert.equal(byCar.get("golf"), 88_000);
    assert.equal(byCar.get("m3"), 85_000, "the stored time stands");
    assert.equal(byCar.get("polo"), 99_000);
  });

  // Importing your own save back has to be a no-op, or nobody would dare.
  it("changes nothing when a save is imported into itself", () => {
    const save = buildSave({ times: existing, field }, new Date(0));
    const report = mergeTimes(existing, save.times, knowsAll);
    assert.equal(report.added, 0);
    assert.equal(report.improved, 0);
    assert.equal(report.kept, existing.length);
    assert.equal(report.entries.length, existing.length);
  });

  it("counts and skips times for cars this build no longer has", () => {
    const report = mergeTimes([], [["dropped", "monza", 90_000], ["golf", "monza", 91_000]], (carId) => carId === "golf");
    assert.equal(report.unknown, 1);
    assert.equal(report.added, 1);
    assert.deepEqual(report.entries, [["golf", "monza", 91_000]]);
  });

  it("keeps one time per car and track however often it appears", () => {
    const report = mergeTimes(
      [],
      [
        ["golf", "monza", 95_000],
        ["golf", "monza", 90_000],
        ["golf", "monza", 92_000],
      ],
      knowsAll,
    );
    assert.equal(report.entries.length, 1);
    assert.equal(report.entries[0][2], 90_000, "the quickest of them survives");
  });

  it("treats the same car on another track as another time", () => {
    const report = mergeTimes([], [["golf", "monza", 90_000], ["golf", "spa", 130_000]], knowsAll);
    assert.equal(report.entries.length, 2);
  });
});

describe("replaceTimes", () => {
  it("takes only the file, dropping what was there", () => {
    const report = replaceTimes([["polo", "spa", 140_000]], knowsAll);
    assert.deepEqual(report.entries, [["polo", "spa", 140_000]]);
    assert.equal(report.added, 1);
    assert.equal(report.kept, 0);
  });

  it("still refuses a car this build does not have", () => {
    const report = replaceTimes([["dropped", "spa", 140_000]], () => false);
    assert.deepEqual(report.entries, []);
    assert.equal(report.unknown, 1);
  });
});
