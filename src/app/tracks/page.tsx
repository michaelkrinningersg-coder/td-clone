"use client";

import Link from "next/link";
import { getCars, tracks } from "@/lib/data";
import { TrackCard } from "@/components/TrackCard";
import { raceColor } from "@/lib/race";
import { useSelection } from "@/lib/selection";

export default function TracksPage() {
  const { selectedIds, ready } = useSelection();
  const selected = getCars(selectedIds);

  if (!ready) {
    return <div className="mx-auto w-full max-w-5xl px-6 py-10 text-zinc-400">Lade...</div>;
  }

  if (selected.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-bold text-white">Strecke wählen</h1>
        <p className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
          Waehle zuerst mindestens ein Auto aus.
        </p>
        <Link href="/" className="mt-4 inline-block text-emerald-400 hover:text-emerald-300">
          ← Zur Markenauswahl
        </Link>
      </div>
    );
  }

  const sprints = tracks.filter((t) => t.type === "SPRINT");
  const circuits = tracks.filter((t) => t.type === "CIRCUIT");
  const raceHref = (trackId: string) => `/race?cars=${selectedIds.join(",")}&trackId=${trackId}`;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-bold text-white">Strecke wählen</h1>
      <ul className="mt-2 flex flex-wrap gap-2 text-sm">
        {selected.map((car, i) => (
          <li key={car.id} className="flex items-center gap-2 text-zinc-300">
            <span className={`h-2.5 w-2.5 rounded-full ${raceColor(i).bg}`} aria-hidden />
            {car.make} {car.model} ({car.year})
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">Sprints</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {sprints.map((track) => (
          <TrackCard key={track.id} track={track} href={raceHref(track.id)} />
        ))}
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">Rundstrecken</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {circuits.map((track) => (
          <TrackCard key={track.id} track={track} href={raceHref(track.id)} />
        ))}
      </div>
    </div>
  );
}
