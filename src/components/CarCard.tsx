import Link from "next/link";
import type { CarData } from "@/lib/data";

interface StatBarProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  invert?: boolean; // for stats where lower is "better" (e.g. 0-100 time)
}

function StatBar({ label, value, max, unit, invert }: StatBarProps) {
  const ratio = max > 0 ? value / max : 0;
  const widthPercent = Math.max(4, Math.min(100, ratio * 100));
  const colorClass = invert ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-zinc-400">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${widthPercent}%` }} />
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
  statMax: {
    topSpeedKph: number;
    powerPs: number;
    weightKg: number;
    torqueNm: number;
    accel0to100s: number;
  };
  href: string;
}

export function CarCard({ car, statMax, href }: CarCardProps) {
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
        <StatBar label="Top-Speed" value={car.topSpeedKph} max={statMax.topSpeedKph} unit=" km/h" />
        <StatBar label="0-100" value={car.accel0to100s} max={statMax.accel0to100s} unit="s" invert />
        <StatBar label="Leistung" value={car.powerPs} max={statMax.powerPs} unit=" PS" />
        <StatBar label="Drehmoment" value={car.torqueNm} max={statMax.torqueNm} unit=" Nm" />
        <StatBar label="Gewicht" value={car.weightKg} max={statMax.weightKg} unit=" kg" invert />
      </div>
    </Link>
  );
}
