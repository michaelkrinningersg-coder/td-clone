import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeFilterCount,
  EMPTY_FILTER,
  isFilterActive,
  matchesFilter,
  type CarFilter,
} from "./filters";
import type { CarData } from "./data";

const car: CarData = {
  id: "audi-s4-2005-4-2-v8",
  make: "Audi",
  model: "S4",
  variant: "4.2 V8",
  year: 2005,
  topSpeedKph: 250,
  accel0to100s: 5.6,
  powerPs: 344,
  weightKg: 1710,
  torqueNm: 410,
  drivetrain: "AWD",
  fuelType: "Gasoline",
  dragCoefficient: 0.31,
  widthMm: 1816,
  heightMm: 1435,
  brakeFront: "ventilated-disc",
  brakeRear: "disc",
  tyreWidthMm: 235,
  gearCount: 6,
  manualGearbox: true,
};

const filter = (over: Partial<CarFilter>): CarFilter => ({ ...EMPTY_FILTER, ...over });

describe("matchesFilter", () => {
  it("keeps every car when nothing is set", () => {
    assert.equal(matchesFilter(car, EMPTY_FILTER), true);
  });

  it("applies a lower bound, an upper bound, and both", () => {
    assert.equal(matchesFilter(car, filter({ powerPs: { min: 300, max: null } })), true);
    assert.equal(matchesFilter(car, filter({ powerPs: { min: 400, max: null } })), false);
    assert.equal(matchesFilter(car, filter({ powerPs: { min: null, max: 300 } })), false);
    assert.equal(matchesFilter(car, filter({ powerPs: { min: null, max: 400 } })), true);
    assert.equal(matchesFilter(car, filter({ powerPs: { min: 300, max: 400 } })), true);
    assert.equal(matchesFilter(car, filter({ powerPs: { min: 100, max: 200 } })), false);
  });

  it("treats the bounds as inclusive", () => {
    assert.equal(matchesFilter(car, filter({ powerPs: { min: 344, max: 344 } })), true);
  });

  it("filters on top speed, acceleration and year", () => {
    assert.equal(matchesFilter(car, filter({ topSpeedKph: { min: 260, max: null } })), false);
    assert.equal(matchesFilter(car, filter({ accel0to100s: { min: null, max: 5 } })), false);
    assert.equal(matchesFilter(car, filter({ accel0to100s: { min: null, max: 6 } })), true);
    assert.equal(matchesFilter(car, filter({ year: { min: 2010, max: null } })), false);
  });

  // An untouched set of ticks means "any", not "none" - otherwise opening the
  // panel would empty the list.
  it("treats an empty drivetrain or fuel selection as no restriction", () => {
    assert.equal(matchesFilter(car, filter({ drivetrains: [] })), true);
    assert.equal(matchesFilter(car, filter({ fuelTypes: [] })), true);
  });

  it("filters on drivetrain and fuel when set", () => {
    assert.equal(matchesFilter(car, filter({ drivetrains: ["AWD"] })), true);
    assert.equal(matchesFilter(car, filter({ drivetrains: ["FWD", "RWD"] })), false);
    assert.equal(matchesFilter(car, filter({ fuelTypes: ["Gasoline"] })), true);
    assert.equal(matchesFilter(car, filter({ fuelTypes: ["Diesel"] })), false);
  });

  it("combines criteria as an AND", () => {
    const f = filter({ powerPs: { min: 300, max: null }, drivetrains: ["AWD"] });
    assert.equal(matchesFilter(car, f), true);
    assert.equal(matchesFilter({ ...car, drivetrain: "RWD" }, f), false);
    assert.equal(matchesFilter({ ...car, powerPs: 200 }, f), false);
  });

  describe("only cars without a time", () => {
    const f = filter({ onlyWithoutTime: true });

    it("hides a car that already holds a time", () => {
      assert.equal(matchesFilter(car, f, new Set([car.id])), false);
    });

    it("keeps a car with no time yet", () => {
      assert.equal(matchesFilter(car, f, new Set(["someone-else"])), true);
    });

    it("keeps every car while the times are still unknown", () => {
      assert.equal(matchesFilter(car, f, undefined), true);
    });

    it("is ignored while switched off", () => {
      assert.equal(matchesFilter(car, EMPTY_FILTER, new Set([car.id])), true);
    });
  });
});

describe("isFilterActive and activeFilterCount", () => {
  it("report an untouched filter as inactive", () => {
    assert.equal(isFilterActive(EMPTY_FILTER), false);
    assert.equal(activeFilterCount(EMPTY_FILTER), 0);
  });

  it("count a range once whichever end is set", () => {
    assert.equal(activeFilterCount(filter({ powerPs: { min: 300, max: null } })), 1);
    assert.equal(activeFilterCount(filter({ powerPs: { min: 300, max: 500 } })), 1);
  });

  it("count each criterion separately", () => {
    const f = filter({
      powerPs: { min: 300, max: null },
      year: { min: null, max: 2010 },
      drivetrains: ["AWD"],
      onlyWithoutTime: true,
    });
    assert.equal(isFilterActive(f), true);
    assert.equal(activeFilterCount(f), 4);
  });
});
