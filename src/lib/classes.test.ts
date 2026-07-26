import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { carClassOf, carClasses, classRangeLabel, getCarClass, powerToWeight } from "./classes";
import { cars } from "./data";

const car = (weightKg: number, powerPs: number) => ({ weightKg, powerPs });

describe("powerToWeight", () => {
  it("is kilograms per horsepower", () => {
    assert.equal(powerToWeight(car(1400, 200)), 7);
  });
});

describe("carClassOf", () => {
  it("puts a hypercar in the top class", () => {
    // Chiron: 1995 kg, 1500 PS -> 1.33 kg/PS
    assert.equal(carClassOf(car(1995, 1500)).id, "hyper");
  });

  it("puts a hot hatch in Sport", () => {
    // Golf GTI: 1400 kg, 230 PS -> 6.1 kg/PS
    assert.equal(carClassOf(car(1400, 230)).id, "sport");
  });

  it("puts a slow saloon in Alltag", () => {
    assert.equal(carClassOf(car(1600, 90)).id, "alltag");
  });

  it("counts the lower bound into the class and the upper bound out of it", () => {
    assert.equal(carClassOf(car(300, 100)).id, "supersport"); // exactly 3.0
    assert.equal(carClassOf(car(299, 100)).id, "hyper"); // just under 3
    assert.equal(carClassOf(car(500, 100)).id, "sport"); // exactly 5.0
  });

  it("leaves nothing without a class, however extreme", () => {
    for (const [w, p] of [
      [100, 2000],
      [4000, 20],
      [1, 1],
    ]) {
      assert.ok(carClassOf(car(w, p)));
    }
  });

  it("classifies every car in the dataset", () => {
    for (const c of cars) {
      const cls = carClassOf(c);
      assert.ok(cls, `${c.id} has no class`);
      assert.ok(carClasses.includes(cls));
    }
  });

  it("leaves no class empty on the real dataset", () => {
    const used = new Set(cars.map((c) => carClassOf(c).id));
    for (const cls of carClasses) {
      assert.ok(used.has(cls.id), `class ${cls.id} has no cars`);
    }
  });
});

describe("classRangeLabel", () => {
  it("describes open and closed ends", () => {
    assert.equal(classRangeLabel(getCarClass("hyper")!), "unter 3 kg/PS");
    assert.equal(classRangeLabel(getCarClass("sport")!), "5 – 7 kg/PS");
    assert.equal(classRangeLabel(getCarClass("alltag")!), "über 14 kg/PS");
  });
});

describe("carClasses", () => {
  it("has no gaps and no overlaps", () => {
    for (let i = 1; i < carClasses.length; i++) {
      assert.equal(carClasses[i].min, carClasses[i - 1].max);
    }
    assert.equal(carClasses[0].min, null);
    assert.equal(carClasses[carClasses.length - 1].max, null);
  });
});
