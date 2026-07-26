import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDurationMs, formatTimeMs } from "./format";

describe("formatTimeMs", () => {
  it("keeps a short lap in bare seconds", () => {
    assert.equal(formatTimeMs(8_420), "8.42s");
  });

  it("switches to minutes once there is a minute to show", () => {
    assert.equal(formatTimeMs(125_600), "2:05.60");
  });
});

describe("formatDurationMs", () => {
  it("always shows minutes, even for a few seconds", () => {
    assert.equal(formatDurationMs(8_420), "0:08.42");
  });

  it("adds an hour field once the total runs that long", () => {
    assert.equal(formatDurationMs(3_725_600), "1:02:05.60");
  });

  it("pads the minutes behind an hour so the columns line up", () => {
    assert.equal(formatDurationMs(3_605_000), "1:00:05.00");
  });

  it("does not pad the minutes when there is no hour", () => {
    assert.equal(formatDurationMs(305_000), "5:05.00");
  });
});
