"use client";

import { useState } from "react";
import { getCars, getTrack } from "@/lib/data";
import { lapsFor } from "@/lib/lap-race";
import { LapRaceRunner } from "@/components/LapRaceRunner";
import { LapRaceSetup } from "@/components/LapRaceSetup";

/** A race rather than a lap: 250 km of a circuit, tyres that go off, a stop or
 * two to change them, and a driver who is not perfect twice in a row.
 *
 * Nothing here is written to the leaderboards. Those hold one clean lap by a
 * machine and are repeatable to the millisecond; a race has luck in it, and
 * mixing the two would make the records meaningless. */
export default function RacePage() {
  const [started, setStarted] = useState<{ carIds: string[]; trackId: string } | null>(null);

  const track = started ? getTrack(started.trackId) : undefined;
  const cars = started ? getCars(started.carIds) : [];

  return (
    <div className="mx-auto w-full max-w-[100rem] flex-1 px-6 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-white">Rennen</h1>
        {started && (
          <button
            type="button"
            onClick={() => setStarted(null)}
            className="ml-auto rounded-full border border-zinc-700 px-4 py-1.5 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            Rennen abbrechen
          </button>
        )}
      </div>

      {started && track ? (
        <LapRaceRunner
          key={`${started.trackId}:${started.carIds.join(",")}`}
          cars={cars}
          track={track}
          laps={lapsFor(track.lengthM)}
          onRestart={() => setStarted(null)}
        />
      ) : (
        <>
          <p className="mt-1 text-sm text-zinc-400">
            250 km auf einem Rundkurs. Die Reifen bauen über das Rennen ab, jedes Auto kommt ein- oder zweimal
            an die Box, und Fahrfehler wie die Tagesform des Motors entscheiden mit. Die Zeiten gehen deshalb
            nicht in die Ranglisten.
          </p>
          <LapRaceSetup onStart={(carIds, trackId) => setStarted({ carIds, trackId })} />
        </>
      )}
    </div>
  );
}
