"use client";

import Link from "next/link";
import type { CarData } from "@/lib/data";
import { raceHex } from "@/lib/race";
import { brandColor } from "@/lib/brand-colors";
import { useSession } from "@/lib/selection";
import { carClassOf, classRangeLabel, powerToWeight } from "@/lib/classes";

/** A trading card, because the app is a game. One card carries one headline
 * number - kg/PS, the figure that actually predicts the lap - and everything
 * else is small print underneath. The class is a colour field down the spine
 * rather than a pill competing with the marque, and a selected card wears its
 * grid number as a cut corner.
 *
 * The star and the info link are buttons of their own, so they cannot sit inside
 * the card button - nested buttons are invalid markup and the inner click would
 * never fire. They are laid over the card instead. */

const SPEC_LABELS = ["PS", "NM", "0–100", "VMAX"] as const;

export function CarCard({ car }: { car: CarData }) {
  const { selectedIds, isSelected, toggleCar, isFull, isInGarage, toggleGarage } = useSession();
  const selected = isSelected(car.id);
  const gridPosition = selectedIds.indexOf(car.id);
  const gridHex = selected ? raceHex(gridPosition, selectedIds.length) : null;
  const blocked = isFull && !selected;
  const cls = carClassOf(car);
  const starred = isInGarage(car.id);
  const kgPerPs = (Math.round(powerToWeight(car) * 10) / 10).toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const specs = [
    car.powerPs.toLocaleString("de-DE"),
    car.torqueNm.toLocaleString("de-DE"),
    car.accel0to100s.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    car.topSpeedKph.toLocaleString("de-DE"),
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => toggleCar(car.id)}
        disabled={blocked}
        aria-pressed={selected}
        // The notch is what makes it a card rather than a box; it stays even
        // when nothing is selected, so the corner tag drops into a shape that
        // was already there.
        style={{
          clipPath: "polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%)",
          borderColor: gridHex ?? undefined,
        }}
        className={`flex w-full bg-[#1a1512] text-left transition-colors ${
          selected
            ? "border"
            : blocked
              ? "cursor-not-allowed border border-[#2e2721] opacity-40"
              : "border border-[#2e2721] hover:border-[#e2492f]"
        }`}
      >
        {/* Class spine. */}
        <div
          className="flex w-[34px] shrink-0 items-end justify-center border-r py-2.5"
          style={{ backgroundColor: `${cls.hex}22`, borderColor: `${cls.hex}44` }}
          title={classRangeLabel(cls)}
        >
          <span
            className="label text-[11px] tracking-[0.22em]"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", color: cls.hex }}
          >
            {cls.name}
          </span>
        </div>

        <div className="min-w-0 flex-1 px-3.5 pb-3 pt-3.5">
          <div className="flex items-start gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="label text-[11px] tracking-[0.16em]" style={{ color: brandColor(car.make) }}>
                {car.make}
              </div>
              <div className="mt-px truncate font-[family-name:var(--font-anton)] text-[24px] uppercase leading-[0.95] tracking-[0.01em] text-[#f5efe6]">
                {car.model}
              </div>
              <div className="mt-[3px] truncate text-[11px] text-[#7d7266]" title={car.variant}>
                {car.year} · {car.variant}
              </div>
            </div>
            {/* Sits below the cut corner so the grid tag never covers the figure. */}
            <div className="mt-[26px] shrink-0 text-right">
              <div className="font-[family-name:var(--font-anton)] text-[30px] leading-none text-[#f5efe6]">
                {kgPerPs}
              </div>
              <div className="label text-[9px] tracking-[0.14em] text-[#7d7266]">kg / PS</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-px bg-[#2e2721]">
            {SPEC_LABELS.map((label, i) => (
              <span key={label} className="bg-[#15110e] px-2 py-[7px]">
                <span className="label block text-[8.5px] tracking-[0.14em] text-[#6d6459]">{label}</span>
                <span className="mt-px block font-[family-name:var(--font-mono)] text-[13px] font-medium text-[#e8e0d4]">
                  {specs[i]}
                </span>
              </span>
            ))}
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2.5">
            <span className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[11px] text-[#7d7266]">
              {car.drivetrain} · {car.fuelType}
            </span>
            <span className="whitespace-nowrap font-[family-name:var(--font-mono)] text-[11px] text-[#6d6459]">
              {car.weightKg.toLocaleString("de-DE")} kg
            </span>
          </div>
        </div>
      </button>

      {/* Grid number as a cut corner, dropped into the notch. */}
      {selected && gridHex && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 flex h-8 w-[60px] items-center justify-end pr-2.5 font-[family-name:var(--font-anton)] text-[17px] text-[#100e0c]"
          style={{ backgroundColor: gridHex, clipPath: "polygon(18px 0, 100% 0, 100% 100%, 0 100%)" }}
        >
          {gridPosition + 1}
        </span>
      )}

      <div className="absolute bottom-2 right-3 flex items-center gap-2">
        <Link
          href={`/car?id=${encodeURIComponent(car.id)}`}
          aria-label={`Alle Daten zum ${car.make} ${car.model}`}
          title="Alle Daten und simulierte Zeiten"
          className="font-[family-name:var(--font-mono)] text-[12px] leading-none text-[#4a4239] transition-colors hover:text-[#e2492f]"
        >
          Daten →
        </Link>
        <button
          type="button"
          onClick={() => toggleGarage(car.id)}
          aria-pressed={starred}
          aria-label={starred ? `${car.model} aus der Garage nehmen` : `${car.model} in die Garage legen`}
          title={starred ? "Aus der Garage nehmen" : "In die Garage legen"}
          className={`text-[15px] leading-none transition-colors ${
            starred ? "text-[#f0b429] hover:text-[#f6c95c]" : "text-[#4a4239] hover:text-[#7d7266]"
          }`}
        >
          {starred ? "★" : "☆"}
        </button>
      </div>
    </div>
  );
}
