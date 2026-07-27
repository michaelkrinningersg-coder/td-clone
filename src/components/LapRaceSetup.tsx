"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { cars, fuelTypes, getCar, getTrack, tracks, type CarData } from "@/lib/data";
import { brandColor } from "@/lib/brand-colors";
import { carClasses, classRangeLabel } from "@/lib/classes";
import { EMPTY_FILTER, matchesFilter, type CarFilter } from "@/lib/filters";
import { MAX_RACE_CARS, cornerShare, lapsFor } from "@/lib/lap-race";
import { randomGrid } from "@/lib/random-grid";
import { carMatches } from "@/components/CarList";
import { CarFilters } from "@/components/CarFilters";

const MAX_PER_MAKE = 2;

/** Setting up a race: one circuit, a field of up to twenty-eight, and the
 * filters from the car list to draw it out of.
 *
 * Only closed laps are offered - a race is laps, and a hillclimb or a standing
 * kilometre has none. */
export function LapRaceSetup({ onStart }: { onStart: (carIds: string[], trackId: string) => void }) {
  const circuits = useMemo(() => tracks.filter((t) => t.outline !== undefined), []);
  const [trackId, setTrackId] = useState(
    () => circuits.find((t) => t.name === "Monza")?.id ?? circuits[0].id,
  );
  const [field, setField] = useState<string[]>([]);
  const [filter, setFilter] = useState<CarFilter>(EMPTY_FILTER);
  const [query, setQuery] = useState("");
  const [twoPerMake, setTwoPerMake] = useState(true);
  const deferredQuery = useDeferredValue(query);

  const track = getTrack(trackId)!;
  const laps = lapsFor(track.lengthM);

  /** The cars the filters leave standing - the pool everything is drawn from. */
  const pool = useMemo(() => cars.filter((car) => matchesFilter(car, filter)), [filter]);

  const results = useMemo(() => {
    const words = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return pool.filter((car) => carMatches(car, words)).slice(0, 12);
  }, [pool, deferredQuery]);

  const fieldCars = field.map((id) => getCar(id)).filter((c) => c !== undefined);
  const full = field.length >= MAX_RACE_CARS;

  function add(car: CarData) {
    if (full || field.includes(car.id)) return;
    setField([...field, car.id]);
  }

  function fillRandom(classId?: string) {
    setField(
      randomGrid(pool, {
        count: MAX_RACE_CARS,
        classId,
        maxPerMake: twoPerMake ? MAX_PER_MAKE : undefined,
      }).map((c) => c.id),
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      <section>
        <h2 className="text-lg font-bold text-white">1. Strecke — {circuits.length} Rundkurse</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Jedes Rennen geht über 250 km, aufgerundet auf ganze Runden. Sprints und das Bergrennen sind hier
          nicht dabei — ein Rennen braucht Runden.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            value={trackId}
            onChange={(e) => setTrackId(e.target.value)}
            aria-label="Strecke für das Rennen"
            className="min-w-64 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-white focus:border-emerald-600 focus:outline-none"
          >
            {[...circuits]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {(t.lengthM / 1000).toFixed(2)} km
                </option>
              ))}
          </select>
          <p className="text-sm text-zinc-400">
            <span className="font-mono text-white">{laps} Runden</span> ={" "}
            {((laps * track.lengthM) / 1000).toFixed(0)} km · Kurvenanteil{" "}
            {(cornerShare(track) * 100).toFixed(0)} % — je mehr Kurven, desto kürzer halten die Reifen.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white">
          2. Startfeld — {field.length} von {MAX_RACE_CARS} Autos
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Erst filtern, dann ziehen oder suchen. Gezogen wird nur aus dem, was der Filter übrig lässt.
        </p>

        <CarFilters
          filter={filter}
          onChange={setFilter}
          onReset={() => setFilter(EMPTY_FILTER)}
          fuelTypes={fuelTypes}
          resultLabel={`${pool.length.toLocaleString("de-DE")} Autos zur Auswahl`}
        />

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Auto suchen, z. B. „911 gt3“..."
          aria-label="Auto für das Rennen suchen"
          className="mt-4 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
        />

        {results.length > 0 && (
          <ul className="mt-2 flex flex-col gap-px overflow-hidden rounded-xl bg-zinc-800">
            {results.map((car) => {
              const inField = field.includes(car.id);
              return (
                <li key={car.id} className="flex items-center gap-3 bg-zinc-900 px-4 py-2 text-sm">
                  <span
                    className="w-28 shrink-0 truncate text-xs font-medium uppercase tracking-wide"
                    style={{ color: brandColor(car.make) }}
                  >
                    {car.make}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-white">
                    {car.model} <span className="text-zinc-600">’{String(car.year).slice(2)}</span>
                  </span>
                  <span className="hidden shrink-0 text-xs text-zinc-500 sm:block">
                    {car.powerPs} PS · {car.weightKg} kg · {car.tyreWidthMm} mm
                  </span>
                  <button
                    type="button"
                    onClick={() => add(car)}
                    disabled={full || inField}
                    className="shrink-0 rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-emerald-600 hover:text-white disabled:opacity-40"
                  >
                    {inField ? "im Feld" : "+ hinzufügen"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-zinc-500">Zufällig füllen:</span>
          <button
            type="button"
            onClick={() => fillRandom()}
            className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-emerald-600 hover:text-white"
          >
            quer durch alle Klassen
          </button>
          {carClasses.map((cls) => (
            <button
              key={cls.id}
              type="button"
              onClick={() => fillRandom(cls.id)}
              title={classRangeLabel(cls)}
              className={`rounded-full border border-zinc-700 px-3 py-1 text-xs hover:border-emerald-600 ${cls.color}`}
            >
              {cls.name}
            </button>
          ))}
        </div>

        <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={twoPerMake}
            onChange={(e) => setTwoPerMake(e.target.checked)}
            className="h-3.5 w-3.5 accent-emerald-500"
          />
          Höchstens {MAX_PER_MAKE} Autos je Marke
          <span className="text-zinc-600">— sonst stellt eine große Marke halb allein das Feld</span>
        </label>

        {fieldCars.length > 0 && (
          <>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {fieldCars.map((car) => (
                <button
                  key={car.id}
                  type="button"
                  onClick={() => setField(field.filter((id) => id !== car.id))}
                  title="Aus dem Feld nehmen"
                  className="flex items-center gap-1.5 rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-red-800 hover:text-red-300"
                >
                  <span style={{ color: brandColor(car.make) }}>{car.make}</span>
                  {car.model}
                  <span className="text-zinc-600">×</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setField([])}
              className="mt-2 text-xs text-zinc-500 hover:text-white"
            >
              Feld leeren
            </button>
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onStart(field, trackId)}
          disabled={field.length < 2}
          className="rounded-full bg-emerald-500 px-6 py-3 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Rennen starten
        </button>
        <p className="text-sm text-zinc-500">
          {field.length < 2
            ? "Mindestens zwei Autos ins Feld."
            : `${field.length} Autos · ${track.name} · ${laps} Runden`}
        </p>
      </div>
    </div>
  );
}
