"use client";

import { useDeferredValue, useMemo, useState } from "react";
import type { CarData } from "@/lib/data";
import { CarCard } from "@/components/CarCard";
import { carClassOf, carClasses, powerToWeight } from "@/lib/classes";

/** How many cards to render at once. A single marque can hold hundreds of cars
 * and the global search spans thousands, so the list grows on demand. */
const PAGE_SIZE = 60;

const SORTS = {
  powerToWeight: { label: "kg/PS", compare: (a: CarData, b: CarData) => powerToWeight(a) - powerToWeight(b) },
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
  searchPlaceholder = "Suchen — „porsche 911 turbo“",
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
  const [sortKey, setSortKey] = useState<SortKey>("powerToWeight");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Keeps typing responsive while a large list re-filters.
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(() => {
    const words = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return cars
      .filter((car) => carMatches(car, words))
      .filter((car) => classIds.length === 0 || classIds.includes(carClassOf(car).id))
      .sort(SORTS[sortKey].compare);
  }, [cars, deferredQuery, classIds, sortKey]);

  function toggleClass(id: string) {
    setClassIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    setVisible(PAGE_SIZE);
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
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
            className="h-[38px] min-w-64 flex-1 border border-[#2e2721] bg-[#1a1512] px-3.5 text-[13px] text-[#f5efe6] placeholder:text-[#6d6459] focus:border-[#e2492f] focus:outline-none"
          />
        )}

        {/* The class filter is the one filter that changes what the deck means,
         * so it sits in the open instead of behind a panel. */}
        {carClasses.map((cls) => {
          const on = classIds.includes(cls.id);
          return (
            <button
              key={cls.id}
              type="button"
              onClick={() => toggleClass(cls.id)}
              aria-pressed={on}
              className={`label h-[38px] border px-3 text-[11px] tracking-[0.13em] transition-colors ${
                on
                  ? "border-[#e2492f88] bg-[#e2492f22] text-[#f0a08c]"
                  : "border-[#2e2721] text-[#7d7266] hover:text-[#f5efe6]"
              }`}
            >
              {cls.name}
            </button>
          );
        })}

        <label className="label flex h-[38px] items-center gap-2 border border-[#2e2721] px-3 text-[11px] tracking-[0.13em] text-[#7d7266]">
          Sortiert
          <select
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as SortKey);
              setVisible(PAGE_SIZE);
            }}
            aria-label="Sortierung"
            className="label bg-transparent text-[11px] tracking-[0.13em] text-[#f5efe6] focus:outline-none"
          >
            {Object.entries(SORTS).map(([key, { label }]) => (
              <option key={key} value={key} className="bg-[#1a1512]">
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 font-[family-name:var(--font-mono)] text-[11px] text-[#6d6459]">
        {results.length === total
          ? `${total.toLocaleString("de-DE")} Autos`
          : `${results.length.toLocaleString("de-DE")} von ${total.toLocaleString("de-DE")} Autos`}
        {" · Karte antippen setzt das Auto ins Startfeld"}
      </p>

      {results.length === 0 ? (
        <p className="mt-8 border border-[#2e2721] bg-[#1a1512] p-6 text-[#7d7266]">
          Kein Auto gefunden. Andere Suche versuchen?
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {results.slice(0, visible).map((car) => (
              <CarCard key={car.id} car={car} />
            ))}
          </div>

          {visible < results.length && (
            <button
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="label mx-auto mt-6 block border border-[#2e2721] px-6 py-3 text-[12px] tracking-[0.14em] text-[#7d7266] transition-colors hover:border-[#e2492f] hover:text-[#f5efe6]"
            >
              Weitere {Math.min(PAGE_SIZE, results.length - visible)} anzeigen
            </button>
          )}
        </>
      )}
    </>
  );
}
