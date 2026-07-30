"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { cars, getCar, getTrack, tracks, type CarData } from "@/lib/data";
import { carClassOf, carClasses, classRangeLabel } from "@/lib/classes";
import { brandColor } from "@/lib/brand-colors";
import { CHAMPIONSHIP_SIZE } from "@/lib/championship";
import { fieldAround, pickRandom, randomGrid } from "@/lib/random-grid";
import { carsCoveringTracks, tracksPerCar } from "@/lib/standings";
import { timeStore } from "@/lib/time-store";
import { carMatches } from "@/components/CarList";

/** How many tracks a drawn calendar has. Every track there is would be a
 * season nobody finishes; ten is an evening. */
const CALENDAR_SIZE = 10;

/** Cars one marque may have on the grid when the field is drawn. */
const MAX_PER_MAKE = 6;

/** Building a championship: thirty cars and a calendar.
 *
 * It arrives ready to start - ten tracks drawn out of the seventy, then thirty
 * cars drawn against them - because the common case is wanting to race, not
 * wanting to plan. Everything is still editable underneath.
 *
 * Two ways to the field, because picking thirty by hand is a chore but a field
 * drawn entirely at random is not a field anyone cares about: search a car out
 * and fill the other 29 from its class, or add them one by one. */
export function ChampionshipSetup({ onStart }: { onStart: (carIds: string[], trackIds: string[]) => void }) {
  const [field, setField] = useState<string[]>([]);
  const [calendar, setCalendar] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [onlyUnfinished, setOnlyUnfinished] = useState(true);
  // A hundred cars drawn out of five thousand would otherwise let one marque
  // take fifteen places, which is a manufacturer test and not a championship.
  const [capPerMake, setCapPerMake] = useState(true);

  // Which tracks each car has already been round. Loaded once: a championship
  // is set up in one sitting, and nothing here writes times.
  const [racedTracks, setRacedTracks] = useState<Map<string, Set<string>> | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all(tracks.map((track) => timeStore.getLeaderboard(track.id)))
      .then((perTrack) => {
        if (!cancelled) setRacedTracks(tracksPerCar(perTrack.flat()));
      })
      .catch(() => {
        if (!cancelled) setRacedTracks(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Cars that have already done every track in a calendar, and so have nothing
   * left to prove on it. */
  const coveredBy = (trackIds: readonly string[]) =>
    racedTracks ? carsCoveringTracks(racedTracks, trackIds) : new Set<string>();
  const completeIds = useMemo(
    () => (racedTracks ? carsCoveringTracks(racedTracks, calendar) : new Set<string>()),
    [racedTracks, calendar],
  );

  /** Draws the whole thing: a calendar first, then a field measured against it.
   * That order matters - the field is drawn from the cars that have not already
   * done these ten tracks, which cannot be known before the ten are. */
  function drawEverything() {
    const drawn = pickRandom(tracks, CALENDAR_SIZE, Math.random).map((t) => t.id);
    setCalendar(drawn);
    setField(
      randomGrid(cars, {
        count: CHAMPIONSHIP_SIZE,
        excludeIds: coveredBy(drawn),
        maxPerMake: MAX_PER_MAKE,
      }).map((c) => c.id),
    );
  }

  // Once, when the boards are in: arriving on the page is the request.
  const drawn = useRef(false);
  useEffect(() => {
    if (drawn.current || racedTracks === null) return;
    drawn.current = true;
    drawEverything();
    // drawEverything closes over racedTracks, which is what the guard waits for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [racedTracks]);

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
    setField(fieldAround(car, cars, CHAMPIONSHIP_SIZE, {}).map((c) => c.id));
    setQuery("");
  }

  function fillRandom(classId?: string) {
    setField(
      randomGrid(cars, {
        count: CHAMPIONSHIP_SIZE,
        classId,
        excludeIds: onlyUnfinished ? completeIds : undefined,
        maxPerMake: capPerMake ? MAX_PER_MAKE : undefined,
      }).map((c) => c.id),
    );
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
          Ein Auto suchen und daraus ein Feld bauen, oder Auto für Auto hinzufügen. Das ganze Feld startet
          gemeinsam — der Sieger eines Laufs bekommt so viele Punkte, wie Autos im Feld stehen, der letzte
          einen.
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

        <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={capPerMake}
            onChange={(e) => setCapPerMake(e.target.checked)}
            className="h-3.5 w-3.5 accent-emerald-500"
          />
          Höchstens {MAX_PER_MAKE} Autos je Marke
          <span className="text-zinc-600">— sonst stellt eine große Marke halb allein das Feld</span>
        </label>

        <label className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={onlyUnfinished}
            onChange={(e) => setOnlyUnfinished(e.target.checked)}
            className="h-3.5 w-3.5 accent-emerald-500"
          />
          Nur Autos, die den Kalender noch nicht komplett gefahren sind
          <span className="text-zinc-600">
            {completeIds.size === 0
              ? "— derzeit betrifft das kein Auto"
              : `— ${completeIds.size} ${completeIds.size === 1 ? "Auto war" : "Autos waren"} schon auf allen ${
                  calendar.length
                } Strecken und ${completeIds.size === 1 ? "bliebe" : "blieben"} draußen`}
          </span>
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

      {/* Between the two sections rather than under them: the page arrives
          dealt, so the way out belongs where the reading stops being
          necessary - after the field, before the calendar anyone who is happy
          with it never has to look at. */}
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
              : `${field.length} Autos · ${calendar.length} ${calendar.length === 1 ? "Lauf" : "Läufe"}`}
        </p>
      </div>

      <section>
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-lg font-bold text-white">2. Kalender — {calendar.length} Läufe</h2>
          <button
            type="button"
            onClick={drawEverything}
            className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-emerald-600 hover:text-white"
          >
            Neu auslosen
          </button>
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          {CALENDAR_SIZE} von {tracks.length} Strecken sind ausgelost, dazu ein Feld, in dem kein Auto steht,
          das diese Strecken schon alle gefahren ist. Beides ist frei änderbar. Reihenfolge mit den Pfeilen;
          ab dem zweiten Lauf steht der Meisterschaftsführende auf Pole.
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

    </div>
  );
}
