import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cars, tracks, type CarData } from "./data";
import { carClassOf } from "./classes";
import {
  carInScope,
  carScopeIsEmpty,
  EMPTY_CAR_SCOPE,
  fuelTypesIn,
  makeRecordCounts,
  trackGroupOf,
  trackInScope,
  TRACK_SCOPES,
} from "./standings-filters";

const named = (name: string) => tracks.find((t) => t.name === name)!;

describe("trackGroupOf", () => {
  it("reads a sprint and a speed test as a straight line", () => {
    assert.equal(trackGroupOf(named("Sprint 1000m")), "straight");
    assert.equal(trackGroupOf(named("0-100-0 km/h")), "straight");
    assert.equal(trackGroupOf(named("Rollstart 50-100 km/h")), "straight");
  });

  // Not by name: a lap where nothing needs the brakes is an oval, whatever it
  // is called.
  it("reads the ovals off their corner radii", () => {
    const ovals = tracks.filter((t) => trackGroupOf(t) === "oval").map((t) => t.name).sort();
    assert.deepEqual(ovals, ["Indianapolis Oval", "Kreisbahn 200 m", "Trioval 4500 m"]);
  });

  it("reads everything with a slow corner as a circuit", () => {
    for (const name of ["Monza", "Monaco", "Daytona Rundkurs", "Stadtkurs eng", "Handlingkurs"]) {
      assert.equal(trackGroupOf(named(name)), "circuit", name);
    }
  });

  it("puts every track in exactly one group", () => {
    const total = (["straight", "oval", "circuit"] as const).reduce(
      (sum, g) => sum + tracks.filter((t) => trackGroupOf(t) === g).length,
      0,
    );
    assert.equal(total, tracks.length);
  });
});

describe("trackInScope", () => {
  it("keeps everything when nothing is chosen", () => {
    assert.equal(tracks.filter((t) => trackInScope(t, "all")).length, tracks.length);
  });

  // The two narrow scopes are a partition: every track is in one or the other,
  // never both, or a car's total would depend on which tab you opened.
  it("splits the calendar in two without overlap or gaps", () => {
    const power = tracks.filter((t) => trackInScope(t, "power"));
    const circuit = tracks.filter((t) => trackInScope(t, "circuit"));
    assert.equal(power.length + circuit.length, tracks.length);
    assert.equal(power.filter((t) => circuit.includes(t)).length, 0);
    assert.ok(power.length > 0 && circuit.length > 0);
  });

  it("counts the ovals with the straight-line runs, not with the circuits", () => {
    assert.ok(trackInScope(named("Indianapolis Oval"), "power"));
    assert.ok(!trackInScope(named("Indianapolis Oval"), "circuit"));
  });

  it("offers a scope for every id it knows", () => {
    assert.deepEqual(
      TRACK_SCOPES.map((s) => s.id),
      ["all", "power", "circuit"],
    );
  });
});

describe("carInScope", () => {
  const car = cars[0];

  it("keeps every car when nothing is chosen", () => {
    assert.ok(carScopeIsEmpty(EMPTY_CAR_SCOPE));
    for (const c of cars.slice(0, 50)) assert.ok(carInScope(c, EMPTY_CAR_SCOPE));
  });

  it("filters on class, drivetrain and fuel", () => {
    const cls = carClassOf(car).id;
    assert.ok(carInScope(car, { ...EMPTY_CAR_SCOPE, classId: cls }));
    assert.ok(!carInScope(car, { ...EMPTY_CAR_SCOPE, classId: "nonexistent" }));
    assert.ok(carInScope(car, { ...EMPTY_CAR_SCOPE, drivetrain: car.drivetrain }));
    assert.ok(!carInScope(car, { ...EMPTY_CAR_SCOPE, drivetrain: "nope" }));
    assert.ok(carInScope(car, { ...EMPTY_CAR_SCOPE, fuelType: car.fuelType }));
    assert.ok(!carInScope(car, { ...EMPTY_CAR_SCOPE, fuelType: "Kerosin" }));
  });

  it("combines the three rather than treating them as alternatives", () => {
    const scope = {
      classId: carClassOf(car).id,
      drivetrain: car.drivetrain,
      fuelType: car.fuelType,
    };
    assert.ok(carInScope(car, scope));
    assert.ok(!carInScope(car, { ...scope, drivetrain: car.drivetrain === "AWD" ? "FWD" : "AWD" }));
  });

  // A time can outlive its car - the field is reimported, a car is dropped for
  // implausible data. It stays in an unfiltered board and leaves a filtered one,
  // because there is nothing left to check it against.
  it("keeps an unknown car only while nothing is filtered", () => {
    assert.ok(carInScope(undefined, EMPTY_CAR_SCOPE));
    assert.ok(!carInScope(undefined, { ...EMPTY_CAR_SCOPE, drivetrain: "AWD" }));
  });
});

describe("fuelTypesIn", () => {
  it("lists what the field actually runs on, commonest first", () => {
    const fuels = fuelTypesIn(cars);
    assert.equal(fuels[0], "Gasoline");
    assert.ok(fuels.includes("Diesel"));
    assert.equal(new Set(fuels).size, fuels.length);
    for (const car of cars) assert.ok(fuels.includes(car.fuelType));
  });

  it("says nothing about an empty field", () => {
    assert.deepEqual(fuelTypesIn([]), []);
  });
});

describe("makeRecordCounts", () => {
  it("counts records per marque, most first", () => {
    const counts = makeRecordCounts([
      { make: "Audi" },
      { make: "BMW" },
      { make: "Audi" },
      { make: "Audi" },
      { make: "BMW" },
      { make: "Ferrari" },
    ]);
    assert.deepEqual(counts, [
      { make: "Audi", records: 3 },
      { make: "BMW", records: 2 },
      { make: "Ferrari", records: 1 },
    ]);
  });

  it("breaks a tie by name so the order does not wobble", () => {
    assert.deepEqual(
      makeRecordCounts([{ make: "Zonda" }, { make: "Alpine" }]).map((c) => c.make),
      ["Alpine", "Zonda"],
    );
  });

  it("ignores tracks nobody has driven", () => {
    assert.deepEqual(makeRecordCounts([{ make: undefined }, { make: "Audi" }]), [
      { make: "Audi", records: 1 },
    ]);
    assert.deepEqual(makeRecordCounts([]), []);
  });

  it("accounts for every record it was given", () => {
    const sample: { make: string | undefined }[] = cars
      .slice(0, 40)
      .map((c: CarData) => ({ make: c.make }));
    const total = makeRecordCounts(sample).reduce((sum, c) => sum + c.records, 0);
    assert.equal(total, sample.length);
  });
});
