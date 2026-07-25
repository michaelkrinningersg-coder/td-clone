import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  convertTrim,
  mapDrivetrain,
  pickRepresentativeTrims,
  stripJsonpWrapper,
  toPositiveFloat,
  type ImportedCar,
  type RawTrim,
} from "./car-import";

/** A trim with every required field present, modeled on a real CarQuery response. */
const completeTrim: RawTrim = {
  model_make_display: "Dodge",
  model_name: "Viper SRT10",
  model_year: "2009",
  model_top_speed_kph: "314",
  model_0_to_100_kph: "3.9",
  model_engine_power_ps: "600",
  model_weight_kg: "1560",
  model_engine_torque_nm: "813",
  model_drive: "Rear",
  model_engine_fuel: "Gasoline",
};

describe("convertTrim", () => {
  it("converts a complete trim", () => {
    assert.deepEqual(convertTrim(completeTrim), {
      make: "Dodge",
      model: "Viper SRT10",
      year: 2009,
      topSpeedKph: 314,
      accel0to100s: 3.9,
      powerPs: 600,
      weightKg: 1560,
      torqueNm: 813,
      drivetrain: "RWD",
      fuelType: "Gasoline",
    });
  });

  // The whole point of the import is that no car enters the game with an
  // estimated stat, so a missing value must drop the car rather than default it.
  const requiredFields: (keyof RawTrim)[] = [
    "model_make_display",
    "model_name",
    "model_year",
    "model_top_speed_kph",
    "model_0_to_100_kph",
    "model_engine_power_ps",
    "model_weight_kg",
    "model_engine_torque_nm",
    "model_drive",
    "model_engine_fuel",
  ];

  for (const field of requiredFields) {
    it(`drops the car when ${field} is absent`, () => {
      const trim = { ...completeTrim };
      delete trim[field];
      assert.equal(convertTrim(trim), null);
    });

    it(`drops the car when ${field} is blank`, () => {
      assert.equal(convertTrim({ ...completeTrim, [field]: "" }), null);
    });
  }

  it("drops the car for CarQuery's placeholder values", () => {
    for (const placeholder of ["-", "n/a", "N/A", "null", "0"]) {
      assert.equal(
        convertTrim({ ...completeTrim, model_top_speed_kph: placeholder }),
        null,
        `expected ${placeholder} to be rejected as a top speed`,
      );
    }
  });

  it("drops the car for an unrecognized drivetrain instead of guessing", () => {
    assert.equal(convertTrim({ ...completeTrim, model_drive: "???" }), null);
  });
});

describe("mapDrivetrain", () => {
  it("maps the spellings CarQuery actually uses", () => {
    const cases: [string, string][] = [
      ["Front", "FWD"],
      ["front wheel drive", "FWD"],
      ["FWD", "FWD"],
      ["Rear", "RWD"],
      ["Rear-wheel drive", "RWD"],
      ["RWD", "RWD"],
      ["All", "AWD"],
      ["All wheel drive", "AWD"],
      ["AWD", "AWD"],
      ["4WD", "AWD"],
      ["4x4", "AWD"],
    ];
    for (const [raw, expected] of cases) {
      assert.equal(mapDrivetrain(raw), expected, `${raw} should map to ${expected}`);
    }
  });

  it("returns null for unknown or empty input", () => {
    for (const raw of ["", "  ", "hybrid drive", undefined]) {
      assert.equal(mapDrivetrain(raw), null);
    }
  });
});

describe("toPositiveFloat", () => {
  it("parses numeric strings", () => {
    assert.equal(toPositiveFloat("314"), 314);
    assert.equal(toPositiveFloat("3.9"), 3.9);
    assert.equal(toPositiveFloat(" 1560 "), 1560);
  });

  it("rejects anything that is not a usable positive number", () => {
    for (const raw of ["", "  ", "-", "n/a", "0", "-5", undefined]) {
      assert.equal(toPositiveFloat(raw), null, `expected ${JSON.stringify(raw)} to be rejected`);
    }
  });
});

describe("stripJsonpWrapper", () => {
  it("unwraps a JSONP callback", () => {
    assert.equal(stripJsonpWrapper('cb({"Trims":[]});'), '{"Trims":[]}');
    assert.equal(stripJsonpWrapper('?({"a":1})'), '{"a":1}');
  });

  it("leaves plain JSON untouched", () => {
    assert.equal(stripJsonpWrapper('{"Trims":[]}'), '{"Trims":[]}');
  });

  it("handles payloads spanning multiple lines", () => {
    assert.equal(stripJsonpWrapper('cb({\n  "a": 1\n});'), '{\n  "a": 1\n}');
  });
});

describe("pickRepresentativeTrims", () => {
  const car = (model: string, year: number, powerPs: number): ImportedCar => ({
    make: "BMW",
    model,
    year,
    powerPs,
    topSpeedKph: 250,
    accel0to100s: 5,
    weightKg: 1500,
    torqueNm: 400,
    drivetrain: "RWD",
    fuelType: "Gasoline",
  });

  it("keeps the most powerful trim per make/model/year", () => {
    const result = pickRepresentativeTrims([car("M3", 2020, 480), car("M3", 2020, 510), car("M3", 2020, 431)]);
    assert.equal(result.length, 1);
    assert.equal(result[0].powerPs, 510);
  });

  it("treats different years as different cars", () => {
    const result = pickRepresentativeTrims([car("M3", 2020, 480), car("M3", 2021, 510)]);
    assert.equal(result.length, 2);
  });
});
