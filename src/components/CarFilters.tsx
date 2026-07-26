"use client";

import { useState } from "react";
import { activeFilterCount, type CarFilter, type Range } from "@/lib/filters";
import { statRanges } from "@/lib/data";
import type { Drivetrain } from "@/lib/physics";

const DRIVETRAINS: Drivetrain[] = ["FWD", "RWD", "AWD"];

/** Panel narrowing which cars are offered. It sits above both the marque index
 * and a single marque's cars, so the same criteria apply before and after
 * picking a brand. */
export function CarFilters({
  filter,
  onChange,
  onReset,
  fuelTypes,
  trackName,
  resultLabel,
}: {
  filter: CarFilter;
  onChange: (next: CarFilter) => void;
  onReset: () => void;
  fuelTypes: string[];
  /** When set, the "no time yet" switch is offered for that track. */
  trackName?: string;
  resultLabel: string;
}) {
  const count = activeFilterCount(filter);
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900">
      <header className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 text-sm font-medium text-white"
        >
          <span aria-hidden>{open ? "▾" : "▸"}</span>
          Filter
          {count > 0 && (
            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-zinc-950">{count}</span>
          )}
        </button>

        <span className="text-sm text-zinc-500">{resultLabel}</span>

        {count > 0 && (
          <button onClick={onReset} className="ml-auto text-sm text-zinc-400 hover:text-white">
            Filter zurücksetzen
          </button>
        )}
      </header>

      {open && (
        <div className="grid gap-5 border-t border-zinc-800 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <RangeInput
            label="Leistung (PS)"
            range={filter.powerPs}
            bounds={statRanges.powerPs}
            onChange={(powerPs) => onChange({ ...filter, powerPs })}
          />
          <RangeInput
            label="Top-Speed (km/h)"
            range={filter.topSpeedKph}
            bounds={statRanges.topSpeedKph}
            onChange={(topSpeedKph) => onChange({ ...filter, topSpeedKph })}
          />
          <RangeInput
            label="0-100 (s)"
            range={filter.accel0to100s}
            bounds={statRanges.accel0to100s}
            step={0.1}
            onChange={(accel0to100s) => onChange({ ...filter, accel0to100s })}
          />
          <RangeInput
            label="Baujahr"
            range={filter.year}
            bounds={statRanges.year}
            onChange={(year) => onChange({ ...filter, year })}
          />

          <ChipGroup
            label="Antrieb"
            options={DRIVETRAINS}
            selected={filter.drivetrains}
            onChange={(drivetrains) => onChange({ ...filter, drivetrains: drivetrains as Drivetrain[] })}
          />
          <ChipGroup
            label="Kraftstoff"
            options={fuelTypes}
            selected={filter.fuelTypes}
            onChange={(types) => onChange({ ...filter, fuelTypes: types })}
          />

          {trackName && (
            <label className="flex items-start gap-3 sm:col-span-2 lg:col-span-3">
              <input
                type="checkbox"
                checked={filter.onlyWithoutTime}
                onChange={(e) => onChange({ ...filter, onlyWithoutTime: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-emerald-500"
              />
              <span className="text-sm">
                <span className="text-white">Nur Autos ohne Zeit auf {trackName}</span>
                <span className="block text-xs text-zinc-500">
                  Blendet alle Autos aus, die hier schon eine Zeit stehen haben.
                </span>
              </span>
            </label>
          )}
        </div>
      )}
    </section>
  );
}

function RangeInput({
  label,
  range,
  bounds,
  step,
  onChange,
}: {
  label: string;
  range: Range;
  bounds: { min: number; max: number };
  step?: number;
  onChange: (next: Range) => void;
}) {
  const parse = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number.parseFloat(trimmed);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <div>
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="number"
          step={step}
          value={range.min ?? ""}
          onChange={(e) => onChange({ ...range, min: parse(e.target.value) })}
          placeholder={`ab ${Math.round(bounds.min)}`}
          aria-label={`${label} von`}
          className="w-full min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
        />
        <span className="text-zinc-600">–</span>
        <input
          type="number"
          step={step}
          value={range.max ?? ""}
          onChange={(e) => onChange({ ...range, max: parse(e.target.value) })}
          placeholder={`bis ${Math.round(bounds.max)}`}
          aria-label={`${label} bis`}
          className="w-full min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
        />
      </div>
    </div>
  );
}

function ChipGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div>
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              onClick={() => onChange(active ? selected.filter((o) => o !== option) : [...selected, option])}
              aria-pressed={active}
              className={`rounded-full border px-3 py-1 text-xs ${
                active
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
