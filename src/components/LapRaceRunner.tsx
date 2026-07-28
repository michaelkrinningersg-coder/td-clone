"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { buildTrackPath, outlinePath, pointAtDistance, toSvgPath } from "@/lib/track-geometry";
import { raceHex } from "@/lib/race";
import { formatDurationMs, formatTimeMs } from "@/lib/format";
import { brandColor } from "@/lib/brand-colors";
import {
  carPace,
  progressAt,
  racePlaybackMs,
  rankRace,
  simulateRace,
  trackTraits,
  type RaceResult,
} from "@/lib/lap-race";
import type { CarData, TrackData } from "@/lib/data";

const PADDING = 20;

type Phase = "counting" | "running" | "finished";

/** A race over the distance: the map, the order, and what the tyres are doing.
 *
 * The whole race is worked out before the first dot moves - as with a single
 * lap, the animation is a replay of a result that already exists. That is what
 * lets the board show a gap in laps and a set of tyres going off rather than
 * guessing at them frame by frame. */
export function LapRaceRunner({
  cars,
  track,
  laps,
  onRestart,
}: {
  cars: CarData[];
  track: TrackData;
  laps: number;
  onRestart: () => void;
}) {
  const path = useMemo(
    () =>
      track.outline
        ? outlinePath(track.outline)
        : buildTrackPath(track.segments, Math.max(5, track.lengthM / 600)),
    [track],
  );
  const viewBox = `${path.minX - PADDING} ${path.minY - PADDING} ${path.maxX - path.minX + PADDING * 2} ${
    path.maxY - path.minY + PADDING * 2
  }`;
  const strokeWidth = Math.max(path.maxX - path.minX, path.maxY - path.minY, 1) / 120;

  const [race, setRace] = useState<RaceResult | null>(null);
  const [phase, setPhase] = useState<Phase>("counting");
  const [atMs, setAtMs] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Worked out off the main paint, so the page can say what it is doing while
  // twenty-eight cars are being put through three runs each.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const paces = cars.map((car) => carPace(car, track));
      const result = simulateRace(paces, { laps, traits: trackTraits(track) });
      if (!cancelled) {
        setRace(result);
        setPhase("running");
      }
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cars, track, laps]);

  const slowestMs = race ? Math.max(...race.entries.map((e) => e.totalTimeMs)) : 0;

  useEffect(() => {
    if (phase !== "running" || race === null) return;
    const durationMs = racePlaybackMs(slowestMs);
    let start: number | null = null;

    function frame(now: number) {
      start ??= now;
      const p = Math.min(1, (now - start) / durationMs);
      setAtMs(p * slowestMs);
      if (p < 1) rafRef.current = requestAnimationFrame(frame);
      else setPhase("finished");
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, race, slowestMs]);

  const carsById = useMemo(() => new Map(cars.map((c) => [c.id, c])), [cars]);
  const ranked = useMemo(
    () => (race ? rankRace(race.entries.map((e) => progressAt(e, atMs, laps))) : []),
    [race, atMs, laps],
  );
  const leader = ranked[0];
  const traits = useMemo(() => trackTraits(track), [track]);
  const currentLap = Math.min(laps, (leader?.lapsDone ?? 0) + 1);
  const underSafetyCar = race?.safetyCarLaps.includes(currentLap) ?? false;
  // A gap in laps is only readable once it is a whole lap; below that the
  // useful number is how many seconds behind the car is, which is the fraction
  // of a lap it is down times how long the leader's laps are taking.
  const leaderLapMs = leader && leader.distanceLaps > 0 ? leader.elapsedMs / leader.distanceLaps : 0;

  if (race === null) {
    return (
      <p className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-6 text-zinc-400">
        Das Rennen wird gerechnet — {cars.length} Autos über {laps} Runden...
      </p>
    );
  }

  const winner = phase === "finished" ? carsById.get(ranked[0]?.carId ?? "") : undefined;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <header className="sticky top-0 z-30 -mx-6 flex h-[4.75rem] items-center gap-4 border-b border-zinc-800 bg-zinc-950/95 px-6 backdrop-blur">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-white">
            {track.name} · {laps} Runden
          </h2>
          <p className="truncate text-xs text-zinc-400">
            {((laps * track.lengthM) / 1000).toFixed(0)} km · {cars.length} Autos ·{" "}
            {underSafetyCar ? (
              <span className="font-semibold text-amber-300">Safety Car</span>
            ) : (
              <>Überholen kostet hier {(traits.overtakeThreshold * 100).toFixed(1)} % Vorsprung</>
            )}
          </p>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-4">
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-zinc-500">
              {phase === "finished" ? "Sieger" : `Runde ${Math.min(laps, (leader?.lapsDone ?? 0) + 1)} / ${laps}`}
            </div>
            <div className="truncate font-semibold text-white">
              {winner
                ? `${winner.make} ${winner.model}`
                : leader
                  ? carsById.get(leader.carId)?.model ?? "—"
                  : "—"}
            </div>
          </div>
          {phase === "finished" ? (
            <>
              <div className="font-mono text-xl text-emerald-400">
                {formatDurationMs(ranked[0]?.totalTimeMs ?? 0)}
              </div>
              <button
                type="button"
                onClick={onRestart}
                className="whitespace-nowrap rounded-full bg-emerald-500 px-5 py-2 font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                Neues Rennen
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
                setAtMs(slowestMs);
                setPhase("finished");
              }}
              className="whitespace-nowrap rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
            >
              Zum Ziel springen
            </button>
          )}
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_34rem]">
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <svg viewBox={viewBox} className="h-96 w-full text-zinc-700">
            <path
              d={toSvgPath(path)}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {ranked.map((racer) => {
              const pos = pointAtDistance(path, racer.lapFraction * track.lengthM);
              return (
                <circle
                  key={racer.carId}
                  cx={pos.x}
                  cy={pos.y}
                  r={strokeWidth * 3}
                  fill={raceHex(racer.gridIndex, cars.length)}
                  stroke="#09090b"
                  strokeWidth={strokeWidth * 0.6}
                  opacity={racer.finished ? 0.35 : 1}
                />
              );
            })}
          </svg>
        </div>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 xl:sticky xl:top-[5.5rem] xl:self-start">
          <header className="flex items-baseline justify-between gap-3 border-b border-zinc-800 px-4 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Rennstand</h3>
            <span className="text-xs text-zinc-500">Reifen · Stopps · Rückstand</span>
          </header>
          <div className="max-h-[calc(100vh-9rem)] overflow-y-auto">
            <ol className="flex flex-col gap-px bg-zinc-800">
              {ranked.map((racer) => {
                const car = carsById.get(racer.carId);
                const hex = raceHex(racer.gridIndex, cars.length);
                // What is left of the set, not what is used: a full bar is a
                // fresh set and an empty one is a car that should be in.
                const left = Math.max(0, Math.min(1, 1 - racer.tyreUsed));
                return (
                  <li
                    key={racer.carId}
                    className="flex items-center gap-2 bg-zinc-900 px-3 py-2 text-sm"
                    style={{ borderLeft: `4px solid ${hex}` }}
                  >
                    <span className="w-7 shrink-0 text-right font-mono font-bold text-zinc-400">
                      {racer.position}.
                    </span>
                    {/* Where it started, so a race can be read as movement. */}
                    <span
                      className={`w-8 shrink-0 text-right font-mono text-[11px] ${
                        racer.gridIndex + 1 > racer.position
                          ? "text-emerald-400"
                          : racer.gridIndex + 1 < racer.position
                            ? "text-red-400"
                            : "text-zinc-600"
                      }`}
                      title={`Startplatz ${racer.gridIndex + 1}`}
                    >
                      {racer.gridIndex + 1 === racer.position
                        ? "·"
                        : racer.gridIndex + 1 > racer.position
                          ? `▲${racer.gridIndex + 1 - racer.position}`
                          : `▼${racer.position - racer.gridIndex - 1}`}
                    </span>
                    <span
                      className="w-20 shrink-0 truncate text-[11px] font-medium uppercase tracking-wide"
                      style={{ color: car ? brandColor(car.make) : undefined }}
                    >
                      {car?.make ?? "—"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                      {car?.model ?? racer.carId}
                    </span>

                    {/* What is left of the tyres: full and green off the stop,
                        short and red when the car is due. */}
                    <span className="hidden h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-800 sm:block">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.max(4, left * 100)}%`,
                          backgroundColor: left > 0.5 ? "#4ade80" : left > 0.25 ? "#facc15" : "#ef4444",
                        }}
                      />
                    </span>
                    <span className="w-6 shrink-0 text-center font-mono text-xs text-zinc-500">
                      {racer.stops}×
                    </span>
                    <span className="w-20 shrink-0 text-right font-mono text-xs text-zinc-400">
                      {racer.finished
                        ? racer.gapMs === 0
                          ? "Sieger"
                          : `+${formatTimeMs(racer.gapMs ?? 0)}`
                        : racer.gapLaps === null || racer.gapLaps === 0
                          ? "Führung"
                          : racer.gapLaps >= 1
                            ? `+${Math.floor(racer.gapLaps)} Rd.`
                            : `+${((racer.gapLaps * leaderLapMs) / 1000).toFixed(1)}s`}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </div>

      {phase === "finished" && (
        <section className="overflow-hidden rounded-xl border border-zinc-800">
          <header className="border-b border-zinc-800 bg-zinc-900 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Ergebnis
            <span className="ml-2 font-normal normal-case tracking-normal text-zinc-600">
              Startplatz, schnellste Runde, Stopps (✕ = verpatzt), Runden im Stau, Fehler und die
            Tagesform
            </span>
          </header>
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2 text-right font-medium">#</th>
                <th className="px-3 py-2 text-right font-medium">Start</th>
                <th className="px-3 py-2 text-left font-medium">Auto</th>
                <th className="px-3 py-2 text-right font-medium">Zeit</th>
                <th className="px-3 py-2 text-right font-medium">Rückstand</th>
                <th className="px-3 py-2 text-right font-medium">Schnellste</th>
                <th className="px-3 py-2 text-right font-medium">Stopps</th>
                <th className="px-3 py-2 text-right font-medium">Verkehr</th>
                <th className="px-3 py-2 text-right font-medium">Fehler</th>
                <th className="px-3 py-2 text-right font-medium">Form</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((racer) => {
                const entry = race.entries.find((e) => e.carId === racer.carId)!;
                const car = carsById.get(racer.carId);
                const fastest = Math.min(...entry.laps.filter((l) => !l.pitted).map((l) => l.lapTimeMs));
                return (
                  <tr key={racer.carId} className="border-t border-zinc-800 bg-zinc-900/50">
                    <td className="px-3 py-2 text-right font-mono font-bold text-zinc-400">
                      {racer.position}.
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-500">
                      {racer.gridIndex + 1}.
                    </td>
                    <td className="px-3 py-2 text-white">
                      <span
                        className="mr-2 text-xs font-medium uppercase tracking-wide"
                        style={{ color: car ? brandColor(car.make) : undefined }}
                      >
                        {car?.make}
                      </span>
                      {car?.model}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-white">
                      {formatDurationMs(racer.totalTimeMs)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">
                      {racer.gapMs === 0 ? "—" : `+${formatTimeMs(racer.gapMs ?? 0)}`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">
                      {formatTimeMs(fastest)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">
                      {entry.stops}
                      {entry.botchedStops > 0 && <span className="text-amber-400"> ✕</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">
                      {entry.laps.filter((l) => l.heldUp).length}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">
                      {entry.laps.filter((l) => l.error).length}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-500">
                      −{(entry.formLoss * 100).toFixed(1)} %
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-xs text-zinc-500">
        Ein Rennen hat Zufall: Qualifying, Fahrfehler, die Tagesform des Motors, den Verschleiß der Reifen —
        und Verkehr. Die Zeiten gehen deshalb <strong>nicht</strong> in die Streckenranglisten — die versprechen eine saubere,
        wiederholbare Runde.{" "}
        <Link href="/" className="text-emerald-400 hover:text-emerald-300">
          Zu den Strecken
        </Link>
      </p>
    </div>
  );
}
