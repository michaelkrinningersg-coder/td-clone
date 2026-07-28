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
  parseBrake,
  parseDragCoefficient,
  parseGearbox,
  parseGearboxKind,
  parseMillimetres,
  parseTyreWidthMm,
  dedupeVariants,
  keepBaseAndTopVariants,
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
    "Brakes Specs": { "Front:": "Ventilated Discs", "Rear:": "Discs" },
    "Tires Specs": { "Tire Size:": "245/40 R18" },
    "Performance Specs": {
      "Acceleration 0-62 Mph (0-100 Kph):": "5.6 S",
      "Top Speed:": "155 Mph (249 Km/H)",
    },
    "Transmission Specs": { "Drive Type:": "Rear Wheel Drive", "Gearbox:": "6-Speed Manual" },
    Dimensions: {
      "Aerodynamics (Cd):": "0.34",
      "Width:": "74.4 In (1890 Mm)",
      "Height:": "52.8 In (1341 Mm)",
      "Wheelbase:": "104.3 In (2650 Mm)",
    },
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
      dragCoefficient: 0.34,
      widthMm: 1890,
      heightMm: 1341,
      brakeFront: "ventilated-disc",
      brakeRear: "disc",
      wheelbaseMm: 2650,
      tyreWidthMm: 245,
      gearCount: 6,
      manualGearbox: true,
      gearboxKind: "manual" as const,
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
    ["Transmission Specs", "Gearbox:"],
    ["Dimensions", "Aerodynamics (Cd):"],
    ["Dimensions", "Width:"],
    ["Dimensions", "Height:"],
    ["Dimensions", "Wheelbase:"],
    ["Brakes Specs", "Front:"],
    ["Brakes Specs", "Rear:"],
    ["Tires Specs", "Tire Size:"],
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
    dragCoefficient: 0.32,
    widthMm: 1800,
    heightMm: 1450,
    brakeFront: "ventilated-disc" as const,
    brakeRear: "disc" as const,
    wheelbaseMm: 2650,
    tyreWidthMm: 225,
    gearCount: 6,
    manualGearbox: false,
    gearboxKind: "automatic" as const,
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

describe("keepBaseAndTopVariants", () => {
  const car = (over: Partial<ImportedCar>): ImportedCar => ({
    make: "BMW",
    model: "5 Series",
    variant: "520i",
    year: 2020,
    powerPs: 150,
    topSpeedKph: 250,
    accel0to100s: 5,
    weightKg: 1500,
    torqueNm: 400,
    drivetrain: "RWD",
    fuelType: "Gasoline",
    dragCoefficient: 0.32,
    widthMm: 1800,
    heightMm: 1450,
    brakeFront: "ventilated-disc" as const,
    brakeRear: "disc" as const,
    wheelbaseMm: 2650,
    tyreWidthMm: 225,
    gearCount: 6,
    manualGearbox: false,
    gearboxKind: "automatic" as const,
    ...over,
  });

  it("keeps the weakest and the strongest and drops what is between", () => {
    const result = keepBaseAndTopVariants([
      car({ variant: "520i", powerPs: 184 }),
      car({ variant: "530i", powerPs: 252 }),
      car({ variant: "540i", powerPs: 340 }),
      car({ variant: "M550i", powerPs: 530 }),
    ]);
    assert.deepEqual(
      result.map((c) => c.variant).sort(),
      ["520i", "M550i"],
    );
  });

  it("leaves a model year that only has one engine alone", () => {
    assert.equal(keepBaseAndTopVariants([car({})]).length, 1);
  });

  it("returns a single car when every variant has the same power", () => {
    const result = keepBaseAndTopVariants([
      car({ variant: "a", powerPs: 200 }),
      car({ variant: "b", powerPs: 200 }),
    ]);
    assert.equal(result.length, 1);
  });

  // Collapsing across years would delete every generation between the oldest
  // and the newest, and the year is shown throughout the app.
  it("treats each model year as its own group", () => {
    const result = keepBaseAndTopVariants([
      car({ year: 1995, powerPs: 150 }),
      car({ year: 1995, powerPs: 286 }),
      car({ year: 2020, powerPs: 184 }),
      car({ year: 2020, powerPs: 530 }),
    ]);
    assert.equal(result.length, 4);
  });

  it("keeps models and makes apart", () => {
    const result = keepBaseAndTopVariants([
      car({ model: "3 Series", powerPs: 150 }),
      car({ model: "5 Series", powerPs: 150 }),
      car({ make: "Audi", model: "A4", powerPs: 150 }),
    ]);
    assert.equal(result.length, 3);
  });

  it("picks the slower of two equally strong entry engines as the base", () => {
    const result = keepBaseAndTopVariants([
      car({ variant: "quick", powerPs: 150, accel0to100s: 8.0 }),
      car({ variant: "slow", powerPs: 150, accel0to100s: 9.5 }),
      car({ variant: "top", powerPs: 400 }),
    ]);
    assert.deepEqual(
      result.map((c) => c.variant).sort(),
      ["slow", "top"],
    );
  });

  it("does not depend on the order the variants arrive in", () => {
    const variants = [
      car({ variant: "a", powerPs: 150 }),
      car({ variant: "b", powerPs: 250 }),
      car({ variant: "c", powerPs: 400 }),
    ];
    const forwards = keepBaseAndTopVariants(variants).map((c) => c.variant).sort();
    const backwards = keepBaseAndTopVariants([...variants].reverse()).map((c) => c.variant).sort();
    assert.deepEqual(forwards, backwards);
  });

  it("returns nothing for nothing", () => {
    assert.deepEqual(keepBaseAndTopVariants([]), []);
  });
});

describe("parseGearboxKind", () => {
  it("reads the kinds the source names", () => {
    assert.equal(parseGearboxKind("6-Speed Manual"), "manual");
    assert.equal(parseGearboxKind("8-Speed Automatic"), "automatic");
    assert.equal(parseGearboxKind("7-Speed Dsg"), "dual-clutch");
    assert.equal(parseGearboxKind("7-Speed Double Clutch Transmission"), "dual-clutch");
    assert.equal(parseGearboxKind("Amg Speedshift Mct 7 Speed"), "dual-clutch");
    assert.equal(parseGearboxKind("6-Speed Automatic (Selespeed)"), "sequential");
    assert.equal(parseGearboxKind("9- Speed Hydra-Matic"), "automatic");
    assert.equal(parseGearboxKind("Cvt"), "cvt");
  });

  // An unqualified "Automatic" is a torque converter far more often than not,
  // and a string that says nothing at all is likelier one than a manual.
  it("falls back to a torque converter rather than guessing a fast box", () => {
    assert.equal(parseGearboxKind(""), "automatic");
    assert.equal(parseGearboxKind("5 Speed"), "automatic");
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
    dragCoefficient: 0.32,
    widthMm: 1800,
    heightMm: 1450,
    brakeFront: "ventilated-disc" as const,
    brakeRear: "disc" as const,
    wheelbaseMm: 2650,
    tyreWidthMm: 225,
    gearCount: 6,
    manualGearbox: false,
    gearboxKind: "automatic" as const,
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

  // The frontal area comes from these two, and the frontal area is what stops
  // the car - the source really does hold a Ford Focus 71 mm wide.
  it("rejects a body no car could have", () => {
    assert.equal(isPlausible({ ...base, widthMm: 71 }), false);
    assert.equal(isPlausible({ ...base, heightMm: 58 }), false);
    assert.equal(isPlausible({ ...base, widthMm: 180365 }), false);
    assert.equal(isPlausible({ ...base, heightMm: 18 }), false);
  });

  it("accepts the extremes that are real", () => {
    assert.equal(isPlausible({ ...base, widthMm: 1250, heightMm: 1000 }), true); // a bubble car
    assert.equal(isPlausible({ ...base, widthMm: 2100, heightMm: 2300 }), true); // a big van
  });

  // Power and torque fix the engine speed: P = M · omega. The source really
  // does hold a Toyota Auris with 90 PS and 20 Nm, which would be an engine
  // making its power at 32.000/min.
  it("rejects a power and torque pair that contradict each other", () => {
    assert.equal(isPlausible({ ...base, powerPs: 90, torqueNm: 20 }), false); // ~32.000/min
    assert.equal(isPlausible({ ...base, powerPs: 83, torqueNm: 1801 }), false); // ~330/min
    assert.equal(isPlausible({ ...base, powerPs: 240, torqueNm: 208 }), true); // ~8.300/min, an S2000
    assert.equal(
      isPlausible({ ...base, powerPs: 140, torqueNm: 320, weightKg: 1400, accel0to100s: 9.5 }),
      true, // ~3.200/min, a diesel
    );
  });

  // Half the kinetic energy divided by the power is a floor no gearbox or tyre
  // can get under, so a car quoted below it cannot be simulated honestly.
  it("rejects a 0-100 time faster than the power allows", () => {
    assert.equal(isPlausible({ ...base, powerPs: 125, weightKg: 1745, accel0to100s: 7 }), false);
    assert.equal(isPlausible({ ...base, powerPs: 125, weightKg: 1745, accel0to100s: 9.5 }), true);
  });

  it("rejects tyres, gears and a drag figure outside what a car can carry", () => {
    assert.equal(isPlausible({ ...base, tyreWidthMm: 40 }), false);
    assert.equal(isPlausible({ ...base, gearCount: 0 }), false);
    assert.equal(isPlausible({ ...base, gearCount: 12 }), false);
    assert.equal(isPlausible({ ...base, dragCoefficient: 0.05 }), false);
    assert.equal(isPlausible({ ...base, dragCoefficient: 1.1 }), false);
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

describe("parseDragCoefficient", () => {
  it("reads the bare number", () => {
    assert.equal(parseDragCoefficient("0.31"), 0.31);
    assert.equal(parseDragCoefficient(" 0.28 "), 0.28);
  });

  it("rejects values outside what a car can physically have", () => {
    for (const raw of [undefined, "", "-", "0", "5", "0.02"]) {
      assert.equal(parseDragCoefficient(raw), null, `expected ${JSON.stringify(raw)} to be rejected`);
    }
  });
});

describe("parseBrake", () => {
  // The source spells the same brake a dozen ways, so the words decide.
  it("recognises the spellings the source uses", () => {
    for (const raw of ["Ventilated Discs", "Vented Discs", "Ventilated Disks", "Ventilated Disc"]) {
      assert.equal(parseBrake(raw), "ventilated-disc", raw);
    }
    assert.equal(parseBrake("Single-Piston Floating-Calliper Vented Disc Brakes"), "ventilated-disc");
    assert.equal(parseBrake("Discs"), "disc");
    assert.equal(parseBrake("Solid Discs"), "disc");
    assert.equal(parseBrake("Drums"), "drum");
    assert.equal(parseBrake("Drum"), "drum");
  });

  it("returns null when it cannot tell", () => {
    assert.equal(parseBrake(undefined), null);
    assert.equal(parseBrake(""), null);
    assert.equal(parseBrake("Regenerative"), null);
  });
});

describe("parseTyreWidthMm", () => {
  it("takes the tread width", () => {
    assert.equal(parseTyreWidthMm("225/50 R17"), 225);
    assert.equal(parseTyreWidthMm("205/55R16"), 205);
    assert.equal(parseTyreWidthMm("345/30 ZR20"), 345);
  });

  it("returns null for anything it cannot read", () => {
    for (const raw of [undefined, "", "R17", "50/17"]) assert.equal(parseTyreWidthMm(raw), null);
  });
});

describe("parseGearbox", () => {
  it("reads the gear count and whether it is manual", () => {
    assert.deepEqual(parseGearbox("6-Speed Manual"), { gearCount: 6, manual: true, kind: "manual" });
    assert.deepEqual(parseGearbox("8-Speed Automatic"), {
      gearCount: 8,
      manual: false,
      kind: "automatic",
    });
    assert.deepEqual(parseGearbox("7 Speed Dual Clutch"), {
      gearCount: 7,
      manual: false,
      kind: "dual-clutch",
    });
  });

  it("returns null without a gear count", () => {
    for (const raw of [undefined, "", "Automatic", "CVT"]) assert.equal(parseGearbox(raw), null);
  });
});

describe("parseMillimetres", () => {
  it("prefers the metric figure in parentheses", () => {
    assert.equal(parseMillimetres("74.4 In (1890 Mm)"), 1890);
    assert.equal(parseMillimetres("1890 Mm"), 1890);
  });

  it("returns null when only imperial units are given", () => {
    assert.equal(parseMillimetres("74.4 In"), null);
  });
});
