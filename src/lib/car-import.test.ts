import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  convertEngine,
  isPlausible,
  normalizeMake,
  parseDrivetrain,
  parseModelAndYear,
  parsePowerPs,
  parseSeconds,
  parseTopSpeedKph,
  parseTorqueNm,
  parseWeightKg,
  pickRepresentativeVariants,
  type ImportedCar,
  type RawEngine,
} from "./car-import";
import { carSlug } from "./slug";

/** An engine variant with every required field, copied from the real dump. */
const completeEngine: RawEngine = {
  automobile_id: "1",
  name: "3.5L V8 32V Turbo 6MT (354 HP)",
  specs: {
    "Engine Specs": {
      "Power:": "257.4 Kw @ 6500 Rpm\r\n350 Hp @ 6500 Rpm\r\n345 Bhp @ 6500 Rpm",
      "Torque:": "300 Lb-Ft @ 4000 Rpm\r\n407 Nm @ 4000 Rpm",
      "Fuel:": "Gasoline",
    },
    "Weight Specs": { "Unladen Weight:": "3560 Lbs (1615 Kg)" },
    "Performance Specs": {
      "Acceleration 0-62 Mph (0-100 Kph):": "5.6 S",
      "Top Speed:": "155 Mph (249 Km/H)",
    },
    "Transmission Specs": { "Drive Type:": "Rear Wheel Drive" },
  },
};

const automobile = { id: "1", brand_id: "7", name: "AUDI S4 2005-2007 Photos, engines &amp; full specs " };
const brand = { id: "7", name: "AUDI" };

describe("convertEngine", () => {
  it("converts a complete variant", () => {
    assert.deepEqual(convertEngine(completeEngine, automobile, brand), {
      make: "Audi",
      model: "S4",
      year: 2005,
      topSpeedKph: 249,
      accel0to100s: 5.6,
      powerPs: 350,
      weightKg: 1615,
      torqueNm: 407,
      drivetrain: "RWD",
      fuelType: "Gasoline",
    });
  });

  // The point of the import is that no car enters the game with an estimated
  // stat, so a missing value must drop the car rather than default it.
  const required: [string, string][] = [
    ["Engine Specs", "Power:"],
    ["Engine Specs", "Torque:"],
    ["Engine Specs", "Fuel:"],
    ["Weight Specs", "Unladen Weight:"],
    ["Performance Specs", "Acceleration 0-62 Mph (0-100 Kph):"],
    ["Performance Specs", "Top Speed:"],
    ["Transmission Specs", "Drive Type:"],
  ];

  for (const [group, key] of required) {
    it(`drops the car when ${group} / ${key} is absent`, () => {
      const specs = structuredClone(completeEngine.specs)!;
      delete specs[group][key];
      assert.equal(convertEngine({ ...completeEngine, specs }, automobile, brand), null);
    });

    it(`drops the car when ${group} / ${key} is unparseable`, () => {
      const specs = structuredClone(completeEngine.specs)!;
      specs[group][key] = "-";
      assert.equal(convertEngine({ ...completeEngine, specs }, automobile, brand), null);
    });
  }

  it("drops the car when the model carries no year", () => {
    assert.equal(
      convertEngine(completeEngine, { ...automobile, name: "Smart Roadster Photos, engines &amp; full specs " }, brand),
      null,
    );
  });

  it("drops the car when the brand is unknown", () => {
    assert.equal(convertEngine(completeEngine, automobile, undefined), null);
  });
});

describe("parsePowerPs", () => {
  it("reads the metric Hp line, not kW and not Bhp", () => {
    assert.equal(parsePowerPs("257.4 Kw @ 6500 Rpm\r\n350 Hp @ 6500 Rpm\r\n345 Bhp @ 6500 Rpm"), 350);
  });

  it("does not mistake a Bhp-only figure for Hp", () => {
    assert.equal(parsePowerPs("345 Bhp @ 6500 Rpm"), null);
  });

  it("returns null for missing or unparseable input", () => {
    for (const raw of [undefined, "", "-", "n/a"]) assert.equal(parsePowerPs(raw), null);
  });
});

describe("parseTorqueNm", () => {
  it("reads Nm and ignores Lb-Ft", () => {
    assert.equal(parseTorqueNm("300 Lb-Ft @ 4000 Rpm\r\n407 Nm @ 4000 Rpm"), 407);
  });

  it("returns null when only imperial units are given", () => {
    assert.equal(parseTorqueNm("300 Lb-Ft @ 4000 Rpm"), null);
  });
});

describe("parseWeightKg and parseTopSpeedKph", () => {
  it("prefer the metric figure in parentheses", () => {
    assert.equal(parseWeightKg("3560 Lbs (1615 Kg)"), 1615);
    assert.equal(parseTopSpeedKph("155 Mph (249 Km/H)"), 249);
  });

  it("fall back to a metric-only value", () => {
    assert.equal(parseWeightKg("1615 Kg"), 1615);
    assert.equal(parseTopSpeedKph("249 Km/H"), 249);
  });

  it("return null when only imperial units are given", () => {
    assert.equal(parseWeightKg("3560 Lbs"), null);
    assert.equal(parseTopSpeedKph("155 Mph"), null);
  });
});

describe("parseSeconds", () => {
  it("parses the acceleration figure", () => {
    assert.equal(parseSeconds("5.6 S"), 5.6);
    assert.equal(parseSeconds("12 S"), 12);
  });

  it("returns null for missing or zero values", () => {
    for (const raw of [undefined, "", "-", "0 S"]) assert.equal(parseSeconds(raw), null);
  });
});

describe("parseDrivetrain", () => {
  it("maps the spellings the source uses", () => {
    assert.equal(parseDrivetrain("Front Wheel Drive"), "FWD");
    assert.equal(parseDrivetrain("Rear Wheel Drive"), "RWD");
    assert.equal(parseDrivetrain("All Wheel Drive"), "AWD");
    assert.equal(parseDrivetrain("Four Wheel Drive"), "AWD");
  });

  it("rejects the source's 'None' placeholder rather than guessing", () => {
    assert.equal(parseDrivetrain("None"), null);
    assert.equal(parseDrivetrain(""), null);
    assert.equal(parseDrivetrain(undefined), null);
  });
});

describe("normalizeMake", () => {
  it("titlecases shouted names", () => {
    assert.equal(normalizeMake("AUDI"), "Audi");
    assert.equal(normalizeMake("LAND ROVER"), "Land Rover");
    assert.equal(normalizeMake("ROLLS-ROYCE"), "Rolls-Royce");
  });

  it("keeps acronyms and stylized capitals", () => {
    assert.equal(normalizeMake("BMW"), "BMW");
    assert.equal(normalizeMake("AC"), "AC");
    assert.equal(normalizeMake("MINI"), "MINI");
    assert.equal(normalizeMake("SEAT"), "SEAT");
    assert.equal(normalizeMake("DS AUTOMOBILES"), "DS Automobiles");
  });

  it("leaves already-correct names untouched", () => {
    assert.equal(normalizeMake("DeLorean"), "DeLorean");
    assert.equal(normalizeMake("Mercedes-AMG"), "Mercedes-AMG");
    assert.equal(normalizeMake("Polestar"), "Polestar");
  });

  it("applies aliases where titlecasing would be wrong", () => {
    assert.equal(normalizeMake("MCLAREN"), "McLaren");
    assert.equal(normalizeMake("MERCEDES BENZ"), "Mercedes-Benz");
    assert.equal(normalizeMake("SSANGYONG"), "SsangYong");
  });
});

describe("parseModelAndYear", () => {
  it("strips the brand, the boilerplate and the year range", () => {
    assert.deepEqual(
      parseModelAndYear("VOLKSWAGEN Golf VII 5 Doors 2012-2017 Photos, engines &amp; full specs ", "Volkswagen"),
      { model: "Golf VII 5 Doors", year: 2012 },
    );
  });

  it("handles a leading year", () => {
    assert.deepEqual(parseModelAndYear("2015 Lotus Evora 400 Photos, engines &amp; full specs ", "Lotus"), {
      model: "Evora 400",
      year: 2015,
    });
  });

  // The normalized make is hyphenated while the model name spells it with a
  // space, so brand stripping has to treat the two as the same separator.
  it("strips a hyphenated brand that the model spells with a space", () => {
    assert.deepEqual(
      parseModelAndYear("MERCEDES BENZ SL 63 AMG (R231) 2012-2016 Photos, engines &amp; full specs ", "Mercedes-Benz"),
      { model: "SL 63 AMG (R231)", year: 2012 },
    );
    assert.deepEqual(
      parseModelAndYear("Mercedes AMG GT C Coupe 2016-2019 Photos, engines &amp; full specs ", "Mercedes-AMG"),
      { model: "GT C Coupe", year: 2016 },
    );
  });

  it("returns null without a year", () => {
    assert.equal(parseModelAndYear("Smart Roadster Photos, engines &amp; full specs ", "Smart"), null);
  });

  it("returns null when nothing but the year is left", () => {
    assert.equal(parseModelAndYear("AUDI 2005-2007 Photos, engines &amp; full specs ", "Audi"), null);
  });
});

describe("pickRepresentativeVariants", () => {
  const car = (model: string, year: number, powerPs: number): ImportedCar => ({
    make: "SEAT",
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

  it("keeps the most powerful variant of a car", () => {
    const result = pickRepresentativeVariants([car("Leon", 2020, 150), car("Leon", 2020, 300), car("Leon", 2020, 190)]);
    assert.equal(result.length, 1);
    assert.equal(result[0].powerPs, 300);
  });

  it("treats different years as different cars", () => {
    assert.equal(pickRepresentativeVariants([car("Leon", 2020, 150), car("Leon", 2021, 150)]).length, 2);
  });

  // Two names that differ only in punctuation slugify to one id; letting both
  // through would mean two cars sharing an id, and the second silently
  // overwriting the first when seeded.
  it("collapses names that would share an id", () => {
    const result = pickRepresentativeVariants([car("Ibiza 5 doors", 2017, 150), car("Ibiza 5-doors", 2017, 110)]);
    assert.equal(result.length, 1);
    assert.equal(result[0].powerPs, 150);
  });

  it("never returns two cars with the same id", () => {
    const cars = [car("Ibiza 5 doors", 2017, 150), car("Ibiza 5-doors", 2017, 110), car("Leon", 2020, 190)];
    const ids = pickRepresentativeVariants(cars).map(carSlug);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("isPlausible", () => {
  const base: ImportedCar = {
    make: "Audi",
    model: "S4",
    year: 2005,
    topSpeedKph: 249,
    accel0to100s: 5.6,
    powerPs: 350,
    weightKg: 1615,
    torqueNm: 407,
    drivetrain: "AWD",
    fuelType: "Gasoline",
  };

  it("accepts a normal car", () => {
    assert.equal(isPlausible(base), true);
  });

  it("rejects values that can only be source errors", () => {
    assert.equal(isPlausible({ ...base, topSpeedKph: 900 }), false);
    assert.equal(isPlausible({ ...base, accel0to100s: 0.2 }), false);
    assert.equal(isPlausible({ ...base, weightKg: 12 }), false);
    assert.equal(isPlausible({ ...base, powerPs: 9000 }), false);
  });
});
