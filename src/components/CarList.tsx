"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { statRanges, type CarData } from "@/lib/data";
import { CarCard } from "@/components/CarCard";

/** How many cards to render at once. A single marque can hold hundreds of cars
 * and the global search spans thousands, so the list grows on demand. */
const PAGE_SIZE = 60;

const SORTS = {
  powerPs: { label: "Leistung", compare: (a: CarData, b: CarData) => b.powerPs - a.powerPs },
  topSpeedKph: { label: "Top-Speed", compare: (a: CarData, b: CarData) => b.topSpeedKph - a.topSpeedKph },
  accel0to100s: { label: "0-100", compare: (a: CarData, b: CarData) => a.accel0to100s - b.accel0to100s },
  weightKg: { label: "Gewicht", compare: (a: CarData, b: CarData) => a.weightKg - b.weightKg },
  year: { label: "Baujahr", compare: (a: CarData, b: CarData) => b.year - a.year },
  name: {
    label: "Name",
    compare: (a: CarData, b: CarData) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model),
  },
} as const;

type SortKey = keyof typeof SORTS;

/** Every word in the query must appear somewhere in the car's description, so
 * "porsche 911 turbo" narrows down regardless of word order. */
export function carMatches(car: CarData, words: string[]): boolean {
  if (words.length === 0) return true;
  const haystack = `${car.make} ${car.model} ${car.year} ${car.drivetrain} ${car.fuelType}`.toLowerCase();
  return words.every((w) => haystack.includes(w));
}

export function CarList({
  cars,
  searchPlaceholder = "Suche nach Marke, Modell, Baujahr...",
  /** Off when the caller already has a search box, so the two don't stack. */
  showSearch = true,
  /** What the result count is measured against - lets a pre-filtered list still
   * say "3 von 5100" rather than losing that context. */
  totalCount,
}: {
  cars: CarData[];
  searchPlaceholder?: string;
  showSearch?: boolean;
  totalCount?: number;
}) {
  const total = totalCount ?? cars.length;
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("powerPs");
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Keeps typing responsive while a large list re-filters.
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(() => {
    const words = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return cars.filter((car) => carMatches(car, words)).sort(SORTS[sortKey].compare);
  }, [cars, deferredQuery, sortKey]);

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {showSearch && (
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            placeholder={searchPlaceholder}
            aria-label="Autos durchsuchen"
            className="min-w-64 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
          />
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-zinc-400">
          Sortieren:
          <select
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as SortKey);
              setVisible(PAGE_SIZE);
            }}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-white focus:border-emerald-600 focus:outline-none"
          >
            {Object.entries(SORTS).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 text-sm text-zinc-500">
        {results.length === total ? `${total} Autos` : `${results.length} von ${total} Autos`}
        {" · "}
        <span className="text-zinc-600">Antippen wählt ein Auto ins Startfeld</span>
      </p>

      {results.length === 0 ? (
        <p className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
          Kein Auto gefunden. Andere Suche versuchen?
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.slice(0, visible).map((car) => (
              <CarCard key={car.id} car={car} statRanges={statRanges} />
            ))}
          </div>

          {visible < results.length && (
            <button
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="mx-auto mt-6 block rounded-full border border-zinc-700 px-6 py-3 font-semibold text-zinc-300 hover:border-emerald-600 hover:text-white"
            >
              Weitere {Math.min(PAGE_SIZE, results.length - visible)} anzeigen
            </button>
          )}
        </>
      )}
    </>
  );
}
