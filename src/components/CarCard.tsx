"use client";

import type { CarData, StatRange, StatRanges } from "@/lib/data";
import { raceColor } from "@/lib/race";
import { brandColor } from "@/lib/brand-colors";
import { useSession } from "@/lib/selection";
import { carClassOf, classRangeLabel, powerToWeight } from "@/lib/classes";

interface StatBarProps {
  label: string;
  value: number;
  range: StatRange;
  unit: string;
  /** True for stats where a lower number is the better one (0-100 time, weight). */
  lowerIsBetter?: boolean;
}

/** A full bar always means "strong for this stat", whichever direction the
 * underlying number runs - otherwise a 2.9s sprint would render as an almost
 * empty bar and read as bad. Scaled between the field's weakest and strongest
 * car so ordinary cars still show a meaningful difference. */
function StatBar({ label, value, range, unit, lowerIsBetter }: StatBarProps) {
  const span = range.max - range.min;
  const position = span > 0 ? (value - range.min) / span : 0.5;
  const strength = lowerIsBetter ? 1 - position : position;
  const widthPercent = Math.max(3, Math.min(100, strength * 100));

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-zinc-400">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full ${lowerIsBetter ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${widthPercent}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-zinc-300">
        {value}
        {unit}
      </span>
    </div>
  );
}

export function CarCard({ car, statRanges }: { car: CarData; statRanges: StatRanges }) {
  const { selectedIds, isSelected, toggleCar, isFull } = useSession();
  const selected = isSelected(car.id);
  const gridPosition = selectedIds.indexOf(car.id);
  const color = selected ? raceColor(gridPosition) : null;
  const blocked = isFull && !selected;
  const carClass = carClassOf(car);

  return (
    <button
      type="button"
      onClick={() => toggleCar(car.id)}
      disabled={blocked}
      aria-pressed={selected}
      className={`flex flex-col gap-3 rounded-xl border bg-zinc-900 p-4 text-left transition-colors ${
        selected
          ? `${color!.border} ring-1 ${color!.ring}`
          : blocked
            ? "cursor-not-allowed border-zinc-800 opacity-40"
            : "border-zinc-800 hover:border-emerald-600"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            <span className="font-medium" style={{ color: brandColor(car.make) }}>
              {car.make}
            </span>{" "}
            · {car.year}
          </div>
          <div className="text-lg font-semibold text-white">{car.model}</div>
          <div className="truncate text-xs text-zinc-400" title={car.variant}>
            {car.variant}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
            <span
              className={`rounded bg-zinc-800 px-1.5 py-0.5 font-medium ${carClass.color}`}
              title={classRangeLabel(carClass)}
            >
              {carClass.name}
            </span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5">{car.drivetrain}</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5">{car.fuelType}</span>
          </div>
        </div>
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            selected ? `${color!.bg} text-zinc-950` : "border border-zinc-700 text-transparent"
          }`}
          aria-hidden
        >
          {selected ? gridPosition + 1 : ""}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <StatBar label="Top-Speed" value={car.topSpeedKph} range={statRanges.topSpeedKph} unit=" km/h" />
        <StatBar label="0-100" value={car.accel0to100s} range={statRanges.accel0to100s} unit="s" lowerIsBetter />
        <StatBar label="Leistung" value={car.powerPs} range={statRanges.powerPs} unit=" PS" />
        <StatBar label="Drehmoment" value={car.torqueNm} range={statRanges.torqueNm} unit=" Nm" />
        <StatBar label="Gewicht" value={car.weightKg} range={statRanges.weightKg} unit=" kg" lowerIsBetter />
        <StatBar
          label="kg/PS"
          value={Math.round(powerToWeight(car) * 10) / 10}
          range={statRanges.powerToWeight}
          unit=""
          lowerIsBetter
        />
      </div>
    </button>
  );
}
