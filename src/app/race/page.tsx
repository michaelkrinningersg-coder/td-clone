"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getCars, getTrack } from "@/lib/data";
import { MAX_RACERS } from "@/lib/race";
import { RaceRunner } from "@/components/RaceRunner";

function Race() {
  const params = useSearchParams();
  // The grid lives in the URL so a race can be linked to and reloaded.
  const carIds = (params.get("cars") ?? "").split(",").filter(Boolean).slice(0, MAX_RACERS);
  const cars = getCars(carIds);
  const track = getTrack(params.get("trackId") ?? "");

  if (cars.length === 0 || !track) {
    return (
      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <p className="text-zinc-400">Auto oder Strecke nicht gefunden.</p>
        <Link href="/" className="mt-4 inline-block text-emerald-400 hover:text-emerald-300">
          ← Zur Autoauswahl
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">{track.name}</h1>
        <span className="text-sm text-zinc-500">
          {track.type === "SPRINT" ? "Sprint" : "Rundstrecke"} · {(track.lengthM / 1000).toFixed(2)} km
        </span>
      </div>

      {/* No list of the field above the track: the board beside the map names
          every car and is the thing that keeps changing. */}
      <RaceRunner cars={cars} track={track} />
    </div>
  );
}

export default function RacePage() {
  return (
    <Suspense fallback={<div className="px-6 py-10 text-zinc-400">Lade...</div>}>
      <Race />
    </Suspense>
  );
}
