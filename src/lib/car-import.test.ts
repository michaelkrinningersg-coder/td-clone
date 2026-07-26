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
  cleanVariant,
  dedupeVariants,
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
      variant: "3.5L V8 32V Turbo 6MT",
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

describe("dedupeVariants", () => {
  const car = (over: Partial<ImportedCar>): ImportedCar => ({
    make: "SEAT",
    model: "Leon",
    variant: "1.4 TSI",
    year: 2020,
    powerPs: 150,
    topSpeedKph: 250,
    accel0to100s: 5,
    weightKg: 1500,
    torqueNm: 400,
    drivetrain: "RWD",
    fuelType: "Gasoline",
    ...over,
  });

  // Variants that drive differently are different cars in the game.
  it("keeps variants whose performance differs", () => {
    const result = dedupeVariants([
      car({ variant: "1.4 TSI", powerPs: 150 }),
      car({ variant: "2.0 TSI", powerPs: 300 }),
    ]);
    assert.equal(result.length, 2);
  });

  // Three gearboxes with identical figures are three identical cars to choose
  // between, which is only noise.
  it("collapses variants that drive identically", () => {
    const result = dedupeVariants([
      car({ variant: "2.0 TSI 6MT" }),
      car({ variant: "2.0 TSI 7DSG" }),
      car({ variant: "2.0 TSI 6AT" }),
    ]);
    assert.equal(result.length, 1);
  });

  it("separates different model years", () => {
    assert.equal(dedupeVariants([car({ year: 2020 }), car({ year: 2021 })]).length, 2);
  });

  it("treats any differing stat as a different car", () => {
    for (const over of [
      { topSpeedKph: 260 },
      { accel0to100s: 4.5 },
      { weightKg: 1400 },
      { torqueNm: 420 },
      { drivetrain: "AWD" as const },
      { fuelType: "Diesel" },
    ]) {
      const result = dedupeVariants([car({ variant: "a" }), car({ variant: "b", ...over })]);
      assert.equal(result.length, 2, `expected ${JSON.stringify(over)} to count as a different car`);
    }
  });

  // Two cars sharing an id would mean duplicate React keys and one silently
  // overwriting the other when seeded.
  it("never returns two cars with the same id", () => {
    const result = dedupeVariants([
      car({ model: "Ibiza 5 doors", variant: "1.0 TSI", powerPs: 95 }),
      car({ model: "Ibiza 5-doors", variant: "1.0 TSI", powerPs: 110 }),
      car({ variant: "2.0 TSI", powerPs: 300 }),
    ]);
    const ids = result.map(carSlug);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("isPlausible", () => {
  const base: ImportedCar = {
    make: "Audi",
    model: "S4",
    variant: "4.2 V8",
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

describe("cleanVariant", () => {
  it("drops the trailing power, which the card already shows as a number", () => {
    assert.equal(cleanVariant("3.5L V8 32V Turbo 6MT (354 HP)"), "3.5L V8 32V Turbo 6MT");
    assert.equal(cleanVariant("2.0 TDI (150 hp)"), "2.0 TDI");
    assert.equal(cleanVariant("Electric (408 kW)"), "Electric");
  });

  it("leaves a variant without a power suffix alone", () => {
    assert.equal(cleanVariant("1.6 HDi 8V"), "1.6 HDi 8V");
  });

  it("returns null when there is nothing left", () => {
    assert.equal(cleanVariant(undefined), null);
    assert.equal(cleanVariant("  "), null);
  });
});
