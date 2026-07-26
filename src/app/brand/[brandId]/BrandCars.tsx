"use client";

import { useMemo } from "react";
import Link from "next/link";
import { fuelTypes, getBrand, getTrack } from "@/lib/data";
import { CarList } from "@/components/CarList";
import { CarFilters } from "@/components/CarFilters";
import { matchesFilter } from "@/lib/filters";
import { useSession } from "@/lib/selection";
import { useTrackTimes } from "@/lib/use-track-times";

/** The same filter as on the marque index applies here, so narrowing down
 * before picking a brand carries into the brand. */
export function BrandCars({ brandId }: { brandId: string }) {
  const { trackId, filter, setFilter, resetFilter } = useSession();
  const track = getTrack(trackId ?? "");
  const { timedCarIds } = useTrackTimes(trackId);
  const brand = getBrand(brandId);

  const filtered = useMemo(
    () => (brand ? brand.cars.filter((car) => matchesFilter(car, filter, timedCarIds)) : []),
    [brand, filter, timedCarIds],
  );

  if (!brand) {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <p className="text-zinc-400">Marke nicht gefunden.</p>
        <Link href="/cars" className="mt-4 inline-block text-emerald-400 hover:text-emerald-300">
          ← Alle Marken
        </Link>
      </div>
    );
  }

  const resultLabel =
    filtered.length === brand.cars.length
      ? `${brand.cars.length} Autos`
      : `${filtered.length} von ${brand.cars.length} Autos`;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <Link href="/cars" className="text-sm text-emerald-400 hover:text-emerald-300">
        ← Alle Marken
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-white">{brand.name}</h1>
      <p className="mt-1 text-sm text-zinc-400">
        {brand.yearFrom}–{brand.yearTo} · bis {brand.maxPowerPs} PS
        {track && <> · Strecke: {track.name}</>}
      </p>

      <CarFilters
        filter={filter}
        onChange={setFilter}
        onReset={resetFilter}
        fuelTypes={fuelTypes}
        trackName={track?.name}
        resultLabel={resultLabel}
      />

      {filtered.length === 0 ? (
        <p className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
          Kein Auto dieser Marke passt zu den Filtern.
        </p>
      ) : (
        <CarList cars={filtered} searchPlaceholder={`${brand.name} durchsuchen...`} totalCount={filtered.length} />
      )}
    </div>
  );
}
