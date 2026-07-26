import type { CarData } from "@/lib/data";

/** Kilograms the engine has to move per horsepower.
 *
 * The single most telling number the dataset yields: it says more about how a
 * car will feel than power or weight alone, because 400 PS mean something very
 * different in a 1200 kg coupé than in a 2600 kg SUV. */
export function powerToWeight(car: Pick<CarData, "weightKg" | "powerPs">): number {
  return car.weightKg / car.powerPs;
}

export interface CarClass {
  id: string;
  name: string;
  /** Inclusive lower bound in kg/PS; null on the open end. */
  min: number | null;
  /** Exclusive upper bound in kg/PS; null on the open end. */
  max: number | null;
  /** Tailwind colour for the badge. */
  color: string;
}

/** Six classes over power-to-weight, cut finer at the quick end where a
 * kilogram per horsepower decides whole seconds of lap time, and coarser at the
 * slow end where it barely registers. The bounds are round numbers rather than
 * quantiles of the dataset, so a car's class does not move when the field is
 * reimported. */
export const carClasses: CarClass[] = [
  { id: "hyper", name: "Hyper", min: null, max: 3, color: "text-fuchsia-300" },
  { id: "supersport", name: "Supersport", min: 3, max: 5, color: "text-red-300" },
  { id: "sport", name: "Sport", min: 5, max: 7, color: "text-orange-300" },
  { id: "gt", name: "GT", min: 7, max: 10, color: "text-amber-300" },
  { id: "kompakt", name: "Kompakt", min: 10, max: 14, color: "text-emerald-300" },
  { id: "alltag", name: "Alltag", min: 14, max: null, color: "text-sky-300" },
];

/** The class a car falls into. Every car has one - the outer classes are open
 * ended, so nothing can fall through. */
export function carClassOf(car: Pick<CarData, "weightKg" | "powerPs">): CarClass {
  const ratio = powerToWeight(car);
  for (const cls of carClasses) {
    if (cls.max === null || ratio < cls.max) return cls;
  }
  return carClasses[carClasses.length - 1];
}

export function getCarClass(id: string): CarClass | undefined {
  return carClasses.find((c) => c.id === id);
}

/** "3 – 5 kg/PS", "unter 3 kg/PS", "über 14 kg/PS". */
export function classRangeLabel(cls: CarClass): string {
  if (cls.min === null) return `unter ${cls.max} kg/PS`;
  if (cls.max === null) return `über ${cls.min} kg/PS`;
  return `${cls.min} – ${cls.max} kg/PS`;
}
