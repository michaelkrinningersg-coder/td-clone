"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getCar, tracks } from "@/lib/data";
import { TrackCard } from "@/components/TrackCard";

function TrackPicker() {
  const carId = useSearchParams().get("carId") ?? "";
  const car = getCar(carId);

  if (!car) {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <p className="text-zinc-400">Kein gueltiges Auto ausgewaehlt.</p>
        <Link href="/" className="mt-4 inline-block text-emerald-400 hover:text-emerald-300">
          ← Zur Autoauswahl
        </Link>
      </div>
    );
  }

  const sprints = tracks.filter((t) => t.type === "SPRINT");
  const circuits = tracks.filter((t) => t.type === "CIRCUIT");

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <p className="text-sm text-zinc-400">
        Ausgewaehltes Auto:{" "}
        <span className="text-white">
          {car.make} {car.model} ({car.year})
        </span>
      </p>
      <h1 className="mt-1 text-2xl font-bold text-white">Strecke auswählen</h1>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">Sprints</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {sprints.map((track) => (
          <TrackCard key={track.id} track={track} href={`/race?carId=${car.id}&trackId=${track.id}`} />
        ))}
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">Rundstrecken</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {circuits.map((track) => (
          <TrackCard key={track.id} track={track} href={`/race?carId=${car.id}&trackId=${track.id}`} />
        ))}
      </div>
    </div>
  );
}

export default function TracksPage() {
  return (
    <Suspense fallback={<div className="px-6 py-10 text-zinc-400">Lade...</div>}>
      <TrackPicker />
    </Suspense>
  );
}
