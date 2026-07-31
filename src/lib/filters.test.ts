import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeFilterCount,
  EMPTY_FILTER,
  decadeOf,
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
  cylinders: 4,
  engineLayout: "inline" as const,
  displacementCm3: 2000,
  lengthMm: 4500,
  trackWidthMm: 1550,
  wheelbaseMm: 2650,
  tyreWidthMm: 235,
  gearCount: 6,
  manualGearbox: true,
  gearboxKind: "manual" as const,
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

// The S4 is 1710 kg on 344 PS, so 4.97 kg/PS - Supersport, just under the
// 5 kg/PS boundary to Sport.
describe("power-to-weight and class", () => {
  it("keeps a car inside the kg/PS window", () => {
    assert.equal(matchesFilter(car, filter({ powerToWeight: { min: 4, max: 6 } })), true);
  });

  it("drops a car outside the kg/PS window", () => {
    assert.equal(matchesFilter(car, filter({ powerToWeight: { min: 6, max: null } })), false);
    assert.equal(matchesFilter(car, filter({ powerToWeight: { min: null, max: 4 } })), false);
  });

  it("keeps a car whose class is ticked", () => {
    assert.equal(matchesFilter(car, filter({ classes: ["supersport"] })), true);
  });

  it("drops a car whose class is not ticked", () => {
    assert.equal(matchesFilter(car, filter({ classes: ["hyper", "sport"] })), false);
  });

  it("treats no ticked class as any class", () => {
    assert.equal(matchesFilter(car, filter({ classes: [] })), true);
  });
});

describe("decades", () => {
  it("maps a year to the decade it starts", () => {
    assert.equal(decadeOf(2005), 2000);
    assert.equal(decadeOf(1999), 1990);
    assert.equal(decadeOf(2020), 2020);
  });

  // The S4 is a 2005 car.
  it("keeps a car whose decade is ticked", () => {
    assert.equal(matchesFilter(car, filter({ decades: [2000] })), true);
  });

  it("drops a car from an untouched decade", () => {
    assert.equal(matchesFilter(car, filter({ decades: [1990, 2010] })), false);
  });

  it("accepts any of several ticked decades", () => {
    assert.equal(matchesFilter(car, filter({ decades: [1990, 2000, 2010] })), true);
  });

  it("treats no ticked decade as any decade", () => {
    assert.equal(matchesFilter(car, filter({ decades: [] })), true);
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

  it("count the kg/PS range and the class list too", () => {
    const f = filter({ powerToWeight: { min: 4, max: 6 }, classes: ["sport"] });
    assert.equal(isFilterActive(f), true);
    assert.equal(activeFilterCount(f), 2);
  });
});
