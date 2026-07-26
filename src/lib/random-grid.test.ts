import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldAround, pickRandom, randomGrid } from "./random-grid";
import { carClassOf } from "./classes";
import type { CarData } from "./data";

/** A deterministic stand-in for Math.random, cycling through fixed values. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const car = (over: Partial<CarData> & { id: string }): CarData => ({
  make: "Audi",
  model: "A4",
  variant: "2.0 TFSI",
  year: 2020,
  topSpeedKph: 250,
  accel0to100s: 6,
  powerPs: 200,
  weightKg: 1400, // 7 kg/PS -> GT
  torqueNm: 350,
  drivetrain: "FWD",
  fuelType: "Gasoline",
  dragCoefficient: 0.3,
  widthMm: 1800,
  heightMm: 1450,
  brakeFront: "ventilated-disc",
  brakeRear: "disc",
  tyreWidthMm: 225,
  gearCount: 6,
  manualGearbox: false,
  ...over,
});

const pool = [
  car({ id: "a", make: "Audi" }),
  car({ id: "b", make: "BMW" }),
  car({ id: "c", make: "Citroen" }),
  car({ id: "d", make: "Dacia" }),
  car({ id: "e", make: "Audi" }),
];

describe("pickRandom", () => {
  it("draws the number asked for", () => {
    assert.equal(pickRandom(pool, 3, sequence([0])).length, 3);
  });

  it("never draws the same item twice", () => {
    const picked = pickRandom(pool, 5, sequence([0.9, 0.1, 0.5, 0, 0.3]));
    assert.equal(new Set(picked.map((c) => c.id)).size, 5);
  });

  it("returns the whole pool rather than failing when it is too small", () => {
    assert.equal(pickRandom(pool, 99, sequence([0.5])).length, 5);
  });

  it("returns nothing for an empty pool", () => {
    assert.deepEqual(pickRandom([], 3, sequence([0.5])), []);
  });

  // Math.random() can return values arbitrarily close to 1; an index off the
  // end would hand back undefined.
  it("stays inside the pool when the draw comes back at almost 1", () => {
    const picked = pickRandom(pool, 2, sequence([0.999999999]));
    assert.ok(picked.every(Boolean));
  });
});

describe("randomGrid", () => {
  it("leaves out the cars that already hold a time", () => {
    const picked = randomGrid(pool, {
      count: 5,
      excludeIds: new Set(["a", "b"]),
      random: sequence([0.5]),
    });
    assert.equal(picked.length, 3);
    assert.ok(!picked.some((c) => c.id === "a" || c.id === "b"));
  });

  it("draws only from one class when asked", () => {
    const mixed = [...pool, car({ id: "hyper", make: "Bugatti", powerPs: 1500, weightKg: 1995 })];
    const picked = randomGrid(mixed, { count: 6, classId: "hyper", random: sequence([0.5]) });
    assert.deepEqual(
      picked.map((c) => c.id),
      ["hyper"],
    );
  });

  it("takes at most one car per marque when asked", () => {
    const picked = randomGrid(pool, { count: 5, onePerMake: true, random: sequence([0]) });
    const makes = picked.map((c) => c.make);
    assert.equal(new Set(makes).size, makes.length);
    assert.equal(picked.length, 4); // Audi appears twice in the pool
  });

  it("allows two cars of a marque when the rule is off", () => {
    const picked = randomGrid(pool, { count: 5, random: sequence([0]) });
    assert.equal(picked.length, 5);
  });

  it("combines the rules", () => {
    const picked = randomGrid(pool, {
      count: 5,
      onePerMake: true,
      excludeIds: new Set(["a"]),
      random: sequence([0]),
    });
    assert.ok(!picked.some((c) => c.id === "a"));
    assert.equal(new Set(picked.map((c) => c.make)).size, picked.length);
  });
});

describe("fieldAround", () => {
  const golf = car({ id: "golf", make: "Volkswagen", powerPs: 230, weightKg: 1400 }); // 6.1 -> Sport
  const sameClass = [
    car({ id: "s1", make: "Honda", powerPs: 310, weightKg: 1900 }),
    car({ id: "s2", make: "Renault", powerPs: 300, weightKg: 1800 }),
    car({ id: "s3", make: "Seat", powerPs: 290, weightKg: 1750 }),
  ];
  const otherClass = [car({ id: "slow", make: "Dacia", powerPs: 75, weightKg: 1200 })];

  it("puts the chosen car first", () => {
    const field = fieldAround(golf, [golf, ...sameClass, ...otherClass], 3, { random: sequence([0]) });
    assert.equal(field[0].id, "golf");
  });

  it("fills up from the same class only", () => {
    const field = fieldAround(golf, [golf, ...sameClass, ...otherClass], 4, { random: sequence([0]) });
    assert.equal(field.length, 4);
    for (const c of field) assert.equal(carClassOf(c).id, carClassOf(golf).id);
  });

  it("never draws the chosen car a second time", () => {
    const field = fieldAround(golf, [golf, ...sameClass], 4, { random: sequence([0.5]) });
    assert.equal(field.filter((c) => c.id === "golf").length, 1);
  });

  it("returns a shorter field when the class does not hold enough cars", () => {
    const field = fieldAround(golf, [golf, ...sameClass], 30, { random: sequence([0.5]) });
    assert.equal(field.length, 4);
  });
});
