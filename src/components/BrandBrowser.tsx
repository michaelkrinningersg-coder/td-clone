"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { brands, cars, fuelTypes, getTrack } from "@/lib/data";
import { CarList, carMatches } from "@/components/CarList";
import { CarFilters } from "@/components/CarFilters";
import { matchesFilter } from "@/lib/filters";
import { useSession } from "@/lib/selection";
import { useTrackTimes } from "@/lib/use-track-times";

/** Second step: which cars go on the grid. The marque index is the main way in,
 * but the filter and the search both cut across brands, so a criterion set here
 * still applies once inside a marque. */
export function BrandBrowser() {
  const { trackId, filter, setFilter, resetFilter } = useSession();
  const track = getTrack(trackId ?? "");
  const { timedCarIds } = useTrackTimes(trackId);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searching = deferredQuery.trim().length > 0;

  const filtered = useMemo(
    () => cars.filter((car) => matchesFilter(car, filter, timedCarIds)),
    [filter, timedCarIds],
  );

  const searchResults = useMemo(() => {
    if (!searching) return [];
    const words = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return filtered.filter((car) => carMatches(car, words));
  }, [filtered, deferredQuery, searching]);

  // Brands are counted against the filter and drop out entirely when nothing of
  // theirs survives - a tile promising cars that are all filtered away is a
  // dead end.
  const visibleBrands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const car of filtered) counts.set(car.make, (counts.get(car.make) ?? 0) + 1);
    return brands
      .map((brand) => ({ ...brand, matching: counts.get(brand.name) ?? 0 }))
      .filter((brand) => brand.matching > 0);
  }, [filtered]);

  const resultLabel =
    filtered.length === cars.length
      ? `${cars.length.toLocaleString("de-DE")} Autos`
      : `${filtered.length.toLocaleString("de-DE")} von ${cars.length.toLocaleString("de-DE")} Autos`;

  return (
    <>
      <CarFilters
        filter={filter}
        onChange={setFilter}
        onReset={resetFilter}
        fuelTypes={fuelTypes}
        trackName={track?.name}
        resultLabel={resultLabel}
      />

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Direkt nach einem Auto suchen, z. B. „chiron“ oder „golf gti“..."
        aria-label="Alle Autos durchsuchen"
        className="mt-4 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
      />

      {searching ? (
        searchResults.length === 0 ? (
          <p className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
            Kein Auto gefunden. Andere Suche oder weniger Filter?
          </p>
        ) : (
          <CarList cars={searchResults} showSearch={false} totalCount={filtered.length} />
        )
      ) : visibleBrands.length === 0 ? (
        <p className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
          Kein Auto passt zu den Filtern.
        </p>
      ) : (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {visibleBrands.length} {visibleBrands.length === 1 ? "Marke" : "Marken"}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleBrands.map((brand) => (
              <Link
                key={brand.id}
                href={`/brand/${brand.id}`}
                className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-emerald-600"
              >
                <span className="text-base font-semibold text-white">{brand.name}</span>
                <span className="mt-2 text-xs text-zinc-500">
                  {brand.matching} {brand.matching === 1 ? "Auto" : "Autos"}
                  {brand.matching !== brand.cars.length && (
                    <span className="text-zinc-600"> von {brand.cars.length}</span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
