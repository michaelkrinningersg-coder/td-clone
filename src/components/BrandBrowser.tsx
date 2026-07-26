"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { brands, cars } from "@/lib/data";
import { CarList, carMatches } from "@/components/CarList";

/** The start screen is a marque index, but hunting for one specific car through
 * 107 brands would be tedious - so typing switches the whole view to a direct
 * search across every car. */
export function BrandBrowser() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searching = deferredQuery.trim().length > 0;

  const matchingCars = useMemo(() => {
    if (!searching) return [];
    const words = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return cars.filter((car) => carMatches(car, words));
  }, [deferredQuery, searching]);

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Direkt nach einem Auto suchen, z. B. „chiron“ oder „golf gti“..."
        aria-label="Alle Autos durchsuchen"
        className="mt-6 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
      />

      {searching ? (
        <SearchResults cars={matchingCars} />
      ) : (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            {brands.length} Marken
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {brands.map((brand) => (
              <Link
                key={brand.id}
                href={`/brand/${brand.id}`}
                className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-emerald-600"
              >
                <span className="text-base font-semibold text-white">{brand.name}</span>
                <span className="mt-2 text-xs text-zinc-500">
                  {brand.cars.length} {brand.cars.length === 1 ? "Auto" : "Autos"} · bis {brand.maxPowerPs} PS
                  <br />
                  {brand.yearFrom}–{brand.yearTo}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** Reuses the shared list, minus its own search box - the one above already
 * filtered the set, and two stacked search fields only confuse. */
function SearchResults({ cars: results }: { cars: (typeof cars)[number][] }) {
  if (results.length === 0) {
    return (
      <p className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
        Kein Auto gefunden. Andere Suche versuchen?
      </p>
    );
  }
  return <CarList cars={results} showSearch={false} totalCount={cars.length} />;
}
