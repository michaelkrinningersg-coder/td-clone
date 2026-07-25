"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getCar, getTrack } from "@/lib/data";
import { RaceRunner } from "@/components/RaceRunner";

function Race() {
  const params = useSearchParams();
  const car = getCar(params.get("carId") ?? "");
  const track = getTrack(params.get("trackId") ?? "");

  if (!car || !track) {
    return (
      <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <p className="text-zinc-400">Auto oder Strecke nicht gefunden.</p>
        <Link href="/" className="mt-4 inline-block text-emerald-400 hover:text-emerald-300">
          ← Zur Autoauswahl
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <p className="text-sm text-zinc-400">
        {car.make} {car.model} ({car.year}) auf <span className="text-white">{track.name}</span>
      </p>
      <h1 className="mt-1 text-2xl font-bold text-white">Fahrt starten</h1>

      <RaceRunner car={car} track={track} />
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
