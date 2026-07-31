"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { buildTrackPath, outlinePath, pointAtDistance, toSvgPath } from "@/lib/track-geometry";
import { interpolateTraceAtTime } from "@/lib/physics";
import { useSimulatedField } from "@/lib/use-simulated-field";
import { playbackDurationMs, raceHex, rankRacers, type RacerProgress } from "@/lib/race";
import { timeStore } from "@/lib/time-store";
import { formatTimeMs } from "@/lib/format";
import { OverallBoard, RaceBoard, useTrackLeaderboard } from "@/components/RaceBoards";
import { SectorTimes } from "@/components/SectorTimes";
import type { CarData, TrackData } from "@/lib/data";

const PADDING = 20;
const CHART_WIDTH = 600;
const CHART_HEIGHT = 110;

type Phase = "idle" | "running" | "finished";

export function RaceRunner({
  cars,
  track,
  saveTimes = true,
  showResult = true,
  autoStart = false,
  onFinish,
  outro,
}: {
  cars: CarData[];
  track: TrackData;
  /** Off for a run that should not touch the leaderboard. */
  saveTimes?: boolean;
  /** Starts the replay as soon as the runner appears, for a caller that has
   * already asked - the championship's "score it and on we go" is the go. */
  autoStart?: boolean;
  /** Off for a caller that shows the result itself - the championship carries
   * it in its own header, and a second panel appearing under the map would
   * push the whole page down at the moment the field comes home. */
  showResult?: boolean;
  /** Called once with every car's time when the replay has run out. */
  onFinish?: (results: { carId: string; timeMs: number }[]) => void;
  /** Replaces the links under the result. Pass null to leave the panel bare,
   * for a caller that carries the next step somewhere else. */
  outro?: React.ReactNode;
}) {
  const path = useMemo(
    () => (track.outline ? outlinePath(track.outline) : buildTrackPath(track.segments, Math.max(5, track.lengthM / 600))),
    [track],
  );
  const viewBox = `${path.minX - PADDING} ${path.minY - PADDING} ${path.maxX - path.minX + PADDING * 2} ${
    path.maxY - path.minY + PADDING * 2
  }`;
  const strokeWidth = Math.max(path.maxX - path.minX, path.maxY - path.minY, 1) / 120;

  /** Every car is simulated up front; the animation is only a replay of results
   * that already exist, which is what lets the ranking know each final time.
   * Off the main thread, because a hundred cars is two seconds of arithmetic
   * and the page should not go dead while it happens. */
  const field = useSimulatedField(cars, track);
  const sims = useMemo(() => field.sims ?? [], [field.sims]);
  const slowestMs = sims.length ? Math.max(...sims.map((s) => s.sim.totalTimeMs)) : 1;

  const [phase, setPhase] = useState<Phase>("idle");
  const [simTimeS, setSimTimeS] = useState(0);
  const [savedAt, setSavedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Kept in a ref so the auto-start effect does not have to depend on a
  // function that is new on every render - the runner is mounted afresh per
  // round, so this fires once and only once.
  const startRef = useRef<() => void>(() => {});
  useEffect(() => {
    startRef.current = handleStart;
  });
  useEffect(() => {
    if (autoStart) startRef.current();
  }, [autoStart]);

  // All cars share one clock, so a faster car visibly pulls away and crosses
  // the line first instead of every car finishing together.
  const progress: RacerProgress[] = sims.map(({ car, sim }, i) => {
    const carTimeS = sim.totalTimeMs / 1000;
    const finished = simTimeS >= carTimeS;
    const tp = interpolateTraceAtTime(sim.trace, Math.min(simTimeS, carTimeS));
    return {
      carId: car.id,
      gridIndex: i,
      distanceM: tp.distanceM,
      speedKph: finished ? 0 : tp.speedKph,
      totalTimeMs: sim.totalTimeMs,
      // The car's own clock: ticking while it drives, stopped at its lap time
      // the moment it crosses the line.
      elapsedMs: finished ? sim.totalTimeMs : simTimeS * 1000,
      finished,
    };
  });
  const ranked = rankRacers(progress);

  function handleStart() {
    setError(null);
    setPhase("running");
    const durationMs = playbackDurationMs(slowestMs);
    let start: number | null = null;

    function frame(now: number) {
      start ??= now;
      const p = Math.min(1, (now - start) / durationMs);
      setSimTimeS((p * slowestMs) / 1000);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        void persist();
      }
    }
    rafRef.current = requestAnimationFrame(frame);
  }

  async function persist() {
    try {
      if (saveTimes) {
        // One write for the whole grid: a championship round is a hundred
        // cars, and a save each meant re-reading and re-writing the entire
        // store a hundred times.
        await timeStore.saveRuns(
          sims.map(({ car, sim }) => ({ carId: car.id, trackId: track.id, timeMs: sim.totalTimeMs })),
        );
        setSavedAt(Date.now());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zeiten konnten nicht gespeichert werden.");
    } finally {
      setPhase("finished");
      onFinish?.(sims.map(({ car, sim }) => ({ carId: car.id, timeMs: sim.totalTimeMs })));
    }
  }

  const maxTraceSpeed = Math.max(1, ...sims.flatMap(({ sim }) => sim.trace.map((p) => p.speedKph)));
  // Loaded once for both boards: the overall column lists them, and the race
  // column reads a finished car's place on the board out of the same rows.
  const entries = useTrackLeaderboard(track.id, savedAt);

  return (
    <div className="mt-6 flex flex-col gap-4">
      {phase === "idle" && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleStart}
            disabled={field.sims === null}
            className="self-start rounded-full bg-emerald-500 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Rennen starten
          </button>
          {/* The wait is only visible on a big grid; a handful of cars is done
              before the button has finished drawing. */}
          {field.sims === null && (
            <span className="text-sm text-zinc-400">
              Simuliere {field.done} von {field.total}
              {field.total > 1 ? " Autos" : " Auto"}...
            </span>
          )}
          {field.error && <span className="text-sm text-amber-400">{field.error}</span>}
        </div>
      )}

      {error && !showResult && <p className="text-amber-400">{error}</p>}

      {/* The result goes to the top, where the eye already is when the last car
          comes home, rather than below every panel on the page. */}
      {phase === "finished" && showResult && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-emerald-700 bg-emerald-950/40 px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-400">Zieleinlauf</div>
            <div className="mt-0.5 text-xl font-bold text-white">
              {(() => {
                const winner = cars.find((c) => c.id === ranked[0]?.carId);
                return winner ? `${winner.make} ${winner.model}` : "\u2014";
              })()}
            </div>
          </div>
          <div className="font-mono text-2xl text-emerald-400">{formatTimeMs(ranked[0]?.totalTimeMs ?? 0)}</div>
          {error && <p className="w-full text-amber-400">{error}</p>}
          <div className="ml-auto">
            {outro !== undefined ? (
              outro
            ) : (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/leaderboard/${track.id}`}
                  className="rounded-full bg-emerald-500 px-5 py-2 font-semibold text-zinc-950 hover:bg-emerald-400"
                >
                  Rangliste
                </Link>
                <Link
                  href="/"
                  className="rounded-full border border-zinc-700 px-5 py-2 font-semibold text-zinc-300 hover:border-zinc-500"
                >
                  Andere Strecke
                </Link>
                <Link
                  href="/cars"
                  className="rounded-full border border-zinc-700 px-5 py-2 font-semibold text-zinc-300 hover:border-zinc-500"
                >
                  Autos ändern
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* The track and the race down the middle, the whole board of this track
          as a column of its own on the right. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_32rem] 2xl:grid-cols-[minmax(0,1fr)_36rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <svg viewBox={viewBox} className="h-80 w-full text-zinc-700">
              <path
                d={toSvgPath(path)}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {progress.map((racer) => {
                const pos = pointAtDistance(path, racer.distanceM);
                return (
                  <circle
                    key={racer.carId}
                    cx={pos.x}
                    cy={pos.y}
                    r={strokeWidth * 3}
                    fill={raceHex(racer.gridIndex, cars.length)}
                    stroke="#09090b"
                    strokeWidth={strokeWidth * 0.6}
                  />
                );
              })}
            </svg>
          </div>

          {/* Directly under the simulation, so the order on screen matches the
              order on track. */}
          <RaceBoard ranked={ranked} cars={cars} track={track} entries={entries} />

          <InfoPanel title="Geschwindigkeit über die Strecke" hint="jede Linie ein Auto">
            <div className="p-4">
              <div className="mb-2 text-right font-mono text-xs text-zinc-400">
                {formatTimeMs(simTimeS * 1000)}
              </div>
              <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-28 w-full">
                {sims.map(({ car, sim }, i) => (
                  <polyline
                    key={car.id}
                    points={sim.trace
                      .map(
                        (p) =>
                          `${((p.distanceM / track.lengthM) * CHART_WIDTH).toFixed(1)},${(
                            CHART_HEIGHT -
                            (p.speedKph / maxTraceSpeed) * CHART_HEIGHT
                          ).toFixed(1)}`,
                      )
                      .join(" ")}
                    fill="none"
                    stroke={raceHex(i, cars.length)}
                    strokeWidth={1.5}
                    opacity={0.9}
                  />
                ))}
                {phase !== "idle" &&
                  ranked.map((racer) => {
                    const x = (racer.distanceM / track.lengthM) * CHART_WIDTH;
                    return (
                      <line
                        key={racer.carId}
                        x1={x}
                        x2={x}
                        y1={0}
                        y2={CHART_HEIGHT}
                        stroke={raceHex(racer.gridIndex, cars.length)}
                        strokeWidth={1}
                        opacity={0.35}
                      />
                    );
                  })}
              </svg>
            </div>
          </InfoPanel>

          {phase === "finished" && (
            <InfoPanel title="Sektorzeiten" hint="Bestzeit je Sektor hervorgehoben">
              <SectorTimes runs={sims} />
            </InfoPanel>
          )}
        </div>

        {/* Sticks below whatever fixed header the page above has - the
            championship sets --board-top to the height of its own. */}
        <div className="min-w-0 xl:sticky xl:top-[var(--board-top,1rem)] xl:self-start">
          <OverallBoard
            ranked={ranked}
            entries={entries}
            track={track}
            fieldSize={cars.length}
            bodyClassName="max-h-[calc(100vh-7rem)]"
          />
        </div>
      </div>
    </div>
  );
}

/** A panel that stays shut until it is asked for. The map, the board and the
 * result are what a race is about; the traces and the splits are for whoever
 * wants to know why, so they wait behind their own title. */
function InfoPanel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-400 hover:text-zinc-200 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-600 font-serif text-[10px] leading-none text-zinc-400 group-open:border-emerald-500 group-open:text-emerald-400"
        >
          i
        </span>
        {title}
        {hint && <span className="truncate font-normal normal-case tracking-normal text-zinc-600">{hint}</span>}
        <span className="ml-auto shrink-0 font-normal normal-case tracking-normal text-zinc-600 group-open:hidden">
          einblenden
        </span>
        <span className="ml-auto hidden shrink-0 font-normal normal-case tracking-normal text-zinc-600 group-open:inline">
          ausblenden
        </span>
      </summary>
      <div className="border-t border-zinc-800">{children}</div>
    </details>
  );
}
