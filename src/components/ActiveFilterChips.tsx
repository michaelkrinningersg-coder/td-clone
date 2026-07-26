"use client";

import { EMPTY_RANGE, type CarFilter, type Range } from "@/lib/filters";
import { getCarClass } from "@/lib/classes";

interface Chip {
  key: string;
  label: string;
  clear: () => CarFilter;
}

function rangeLabel(range: Range, unit: string): string {
  if (range.min !== null && range.max !== null) return `${range.min}–${range.max}${unit}`;
  if (range.min !== null) return `ab ${range.min}${unit}`;
  return `bis ${range.max}${unit}`;
}

/** The criteria in force, each one removable on its own.
 *
 * The panel can set eleven different things; once it is folded away the only
 * clue left was a number in a badge, and the only way out was clearing the lot.
 * Here every criterion says what it is and drops out on its own. */
export function ActiveFilterChips({
  filter,
  onChange,
  trackName,
}: {
  filter: CarFilter;
  onChange: (next: CarFilter) => void;
  trackName?: string;
}) {
  const chips: Chip[] = [];

  const ranges: [keyof CarFilter, string, string][] = [
    ["powerPs", "Leistung", " PS"],
    ["topSpeedKph", "Top-Speed", " km/h"],
    ["accel0to100s", "0-100", " s"],
    ["year", "Baujahr", ""],
    ["powerToWeight", "kg/PS", ""],
  ];
  for (const [key, label, unit] of ranges) {
    const range = filter[key] as Range;
    if (range.min === null && range.max === null) continue;
    chips.push({
      key,
      label: `${label} ${rangeLabel(range, unit)}`,
      clear: () => ({ ...filter, [key]: EMPTY_RANGE }),
    });
  }

  for (const decade of filter.decades) {
    chips.push({
      key: `decade-${decade}`,
      label: `${String(decade).slice(2)}er`,
      clear: () => ({ ...filter, decades: filter.decades.filter((d) => d !== decade) }),
    });
  }

  for (const id of filter.classes) {
    chips.push({
      key: `class-${id}`,
      label: getCarClass(id)?.name ?? id,
      clear: () => ({ ...filter, classes: filter.classes.filter((c) => c !== id) }),
    });
  }

  for (const drivetrain of filter.drivetrains) {
    chips.push({
      key: `dt-${drivetrain}`,
      label: drivetrain,
      clear: () => ({ ...filter, drivetrains: filter.drivetrains.filter((d) => d !== drivetrain) }),
    });
  }

  for (const fuel of filter.fuelTypes) {
    chips.push({
      key: `fuel-${fuel}`,
      label: fuel,
      clear: () => ({ ...filter, fuelTypes: filter.fuelTypes.filter((f) => f !== fuel) }),
    });
  }

  if (filter.onlyWithoutTime) {
    chips.push({
      key: "untimed",
      label: trackName ? `ohne Zeit auf ${trackName}` : "ohne Zeit",
      clear: () => ({ ...filter, onlyWithoutTime: false }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-xs uppercase tracking-wide text-zinc-500">Aktive Filter:</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onChange(chip.clear())}
          aria-label={`Filter ${chip.label} entfernen`}
          className="flex items-center gap-1.5 rounded-full border border-emerald-700 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200 transition hover:border-red-700 hover:bg-red-950/40 hover:text-red-200"
        >
          {chip.label}
          <span aria-hidden className="text-emerald-500/70">
            ×
          </span>
        </button>
      ))}
    </div>
  );
}
