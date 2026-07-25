import Link from "next/link";
import type { CarData, StatRange, StatRanges } from "@/lib/data";

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

export interface CarCardProps {
  car: CarData;
  statRanges: StatRanges;
  href: string;
}

export function CarCard({ car, statRanges, href }: CarCardProps) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-emerald-600"
    >
      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-500">
          {car.make} · {car.year}
        </div>
        <div className="text-lg font-semibold text-white">{car.model}</div>
        <div className="mt-1 flex gap-2 text-xs text-zinc-500">
          <span className="rounded bg-zinc-800 px-1.5 py-0.5">{car.drivetrain}</span>
          <span className="rounded bg-zinc-800 px-1.5 py-0.5">{car.fuelType}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <StatBar label="Top-Speed" value={car.topSpeedKph} range={statRanges.topSpeedKph} unit=" km/h" />
        <StatBar label="0-100" value={car.accel0to100s} range={statRanges.accel0to100s} unit="s" lowerIsBetter />
        <StatBar label="Leistung" value={car.powerPs} range={statRanges.powerPs} unit=" PS" />
        <StatBar label="Drehmoment" value={car.torqueNm} range={statRanges.torqueNm} unit=" Nm" />
        <StatBar label="Gewicht" value={car.weightKg} range={statRanges.weightKg} unit=" kg" lowerIsBetter />
      </div>
    </Link>
  );
}
