import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { heatColor, lapScore, positionScore, readableOn } from "./heat";

describe("heatColor", () => {
  it("runs from dark green to dark red", () => {
    assert.equal(heatColor(0), "#14532d");
    assert.equal(heatColor(1), "#7f1d1d");
  });

  it("passes through yellow in the middle", () => {
    assert.equal(heatColor(0.4), "#facc15");
  });

  it("mixes between the stops", () => {
    const between = heatColor(0.3);
    assert.notEqual(between, heatColor(0.2));
    assert.notEqual(between, heatColor(0.4));
  });

  it("stays on the scale for scores outside it", () => {
    assert.equal(heatColor(-5), heatColor(0));
    assert.equal(heatColor(5), heatColor(1));
  });
});

describe("readableOn", () => {
  it("writes dark on the bright middle and light on the dark ends", () => {
    assert.equal(readableOn(heatColor(0.4)), "#18181b");
    assert.equal(readableOn(heatColor(0)), "#ffffff");
    assert.equal(readableOn(heatColor(1)), "#ffffff");
  });
});

describe("lapScore", () => {
  it("gives the record holder the best score", () => {
    assert.equal(lapScore(60_000, 60_000), 0);
  });

  it("measures the gap in proportion, not in seconds", () => {
    // 10 % off the record reads the same on a sprint and on a circuit.
    assert.equal(lapScore(11_000, 10_000), lapScore(110_000, 100_000));
  });

  it("bottoms out a third off the record", () => {
    assert.equal(lapScore(140_000, 100_000), 1);
    assert.ok(lapScore(120_000, 100_000) < 1);
  });

  it("survives a track without a best time", () => {
    assert.equal(lapScore(60_000, 0), 0);
  });
});

describe("positionScore", () => {
  it("puts the winner at the good end and the last car at the bad one", () => {
    assert.equal(positionScore(1, 10), 0);
    assert.equal(positionScore(10, 10), 1);
  });

  it("calls a field of one a win", () => {
    assert.equal(positionScore(1, 1), 0);
  });
});
