"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { cars, getCar, getTrack, tracks, type CarData } from "@/lib/data";
import { carClassOf, carClasses, classRangeLabel } from "@/lib/classes";
import { brandColor } from "@/lib/brand-colors";
import { CHAMPIONSHIP_SIZE, HEAT_SIZE } from "@/lib/championship";
import { fieldAround, randomGrid } from "@/lib/random-grid";
import { carMatches } from "@/components/CarList";

/** Building a championship: thirty cars and a calendar.
 *
 * Two ways to the field, because picking thirty by hand is a chore but a field
 * drawn entirely at random is not a field anyone cares about: search a car out
 * and fill the other 29 from its class, or add them one by one. */
export function ChampionshipSetup({ onStart }: { onStart: (carIds: string[], trackIds: string[]) => void }) {
  const [field, setField] = useState<string[]>([]);
  const [calendar, setCalendar] = useState<string[]>(tracks.map((t) => t.id));
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(() => {
    const words = deferredQuery.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return cars.filter((car) => carMatches(car, words)).slice(0, 12);
  }, [deferredQuery]);

  const fieldCars = field.map((id) => getCar(id)).filter((c) => c !== undefined);
  const full = field.length >= CHAMPIONSHIP_SIZE;

  function add(car: CarData) {
    if (full || field.includes(car.id)) return;
    setField([...field, car.id]);
  }

  function fillFrom(car: CarData) {
    setField(fieldAround(car, cars, CHAMPIONSHIP_SIZE, { onePerMake: false }).map((c) => c.id));
    setQuery("");
  }

  function fillRandom(classId?: string) {
    setField(randomGrid(cars, { count: CHAMPIONSHIP_SIZE, classId }).map((c) => c.id));
  }

  function toggleTrack(id: string) {
    setCalendar(calendar.includes(id) ? calendar.filter((t) => t !== id) : [...calendar, id]);
  }

  function moveTrack(id: string, by: number) {
    const index = calendar.indexOf(id);
    const target = index + by;
    if (index < 0 || target < 0 || target >= calendar.length) return;
    const next = [...calendar];
    [next[index], next[target]] = [next[target], next[index]];
    setCalendar(next);
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      <section>
        <h2 className="text-lg font-bold text-white">
          1. Feld — {field.length} von {CHAMPIONSHIP_SIZE} Autos
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Ein Auto suchen und daraus ein Feld bauen, oder Auto für Auto hinzufügen. Gefahren wird in Läufen zu
          je {HEAT_SIZE} Autos; gewertet wird danach über das ganze Feld.
        </p>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Auto suchen, z. B. „golf gti“ oder „911“..."
          aria-label="Auto für die Meisterschaft suchen"
          className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-emerald-600 focus:outline-none"
        />

        {results.length > 0 && (
          <ul className="mt-3 flex flex-col gap-px overflow-hidden rounded-xl bg-zinc-800">
            {results.map((car) => {
              const cls = carClassOf(car);
              const inField = field.includes(car.id);
              return (
                <li key={car.id} className="flex flex-wrap items-center gap-3 bg-zinc-900 px-4 py-2 text-sm">
                  <span
                    className="w-28 shrink-0 truncate text-xs font-medium uppercase tracking-wide"
                    style={{ color: brandColor(car.make) }}
                  >
                    {car.make}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-white">
                    {car.model} <span className="text-zinc-600">’{String(car.year).slice(2)}</span>{" "}
                    <span className="text-xs text-zinc-500">{car.variant}</span>
                  </span>
                  <span className={`shrink-0 text-xs ${cls.color}`} title={classRangeLabel(cls)}>
                    {cls.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => fillFrom(car)}
                    className="shrink-0 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
                  >
                    Feld daraus bauen
                  </button>
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

      <section>
        <h2 className="text-lg font-bold text-white">2. Kalender — {calendar.length} Läufe</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Reihenfolge mit den Pfeilen ändern. Nach jedem Lauf werden die Punkte vergeben, ab dem zweiten
          fahren die Führenden gemeinsam.
        </p>

        <ol className="mt-3 flex flex-col gap-px overflow-hidden rounded-xl bg-zinc-800">
          {[...calendar, ...tracks.filter((t) => !calendar.includes(t.id)).map((t) => t.id)].map((id) => {
            const track = getTrack(id)!;
            const position = calendar.indexOf(id);
            const active = position >= 0;
            return (
              <li key={id} className="flex items-center gap-3 bg-zinc-900 px-4 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleTrack(id)}
                  aria-label={`${track.name} in den Kalender aufnehmen`}
                  className="h-4 w-4 accent-emerald-500"
                />
                <span className="w-6 shrink-0 text-right font-mono text-zinc-500">
                  {active ? `${position + 1}.` : "–"}
                </span>
                <span className={active ? "text-white" : "text-zinc-600"}>{track.name}</span>
                <span className="text-xs text-zinc-600">
                  {track.type === "SPRINT" ? "Sprint" : "Rundstrecke"} · {(track.lengthM / 1000).toFixed(2)} km
                </span>
                {active && (
                  <span className="ml-auto flex gap-1">
                    <button
                      type="button"
                      onClick={() => moveTrack(id, -1)}
                      disabled={position === 0}
                      aria-label={`${track.name} nach vorn`}
                      className="rounded px-2 text-zinc-500 hover:text-white disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveTrack(id, 1)}
                      disabled={position === calendar.length - 1}
                      aria-label={`${track.name} nach hinten`}
                      className="rounded px-2 text-zinc-500 hover:text-white disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onStart(field, calendar)}
          disabled={field.length < 2 || calendar.length === 0}
          className="rounded-full bg-emerald-500 px-6 py-3 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Meisterschaft starten
        </button>
        <p className="text-sm text-zinc-500">
          {field.length < 2
            ? "Mindestens zwei Autos ins Feld."
            : calendar.length === 0
              ? "Mindestens eine Strecke in den Kalender."
              : `${field.length} Autos · ${calendar.length} Läufe · ${
                  Math.ceil(field.length / HEAT_SIZE) * calendar.length
                } Rennen`}
        </p>
      </div>
    </div>
  );
}
