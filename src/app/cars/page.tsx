"use client";

import Link from "next/link";
import { getTrack } from "@/lib/data";
import { BrandBrowser } from "@/components/BrandBrowser";
import { MAX_RACERS } from "@/lib/race";
import { useSession } from "@/lib/selection";

export default function CarsPage() {
  const { trackId, ready } = useSession();
  const track = getTrack(trackId ?? "");

  if (!ready) {
    return <div className="mx-auto w-full max-w-5xl px-6 py-10 text-zinc-400">Lade...</div>;
  }

  if (!track) {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-bold text-white">Autos wählen</h1>
        <p className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
          Waehle zuerst eine Strecke — sie entscheidet, welche Autos sich lohnen.
        </p>
        <Link href="/" className="mt-4 inline-block text-emerald-400 hover:text-emerald-300">
          ← Zur Streckenauswahl
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300">
        ← Strecke ändern
      </Link>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-emerald-500">Schritt 2 von 2</p>
      <h1 className="mt-1 text-2xl font-bold text-white">
        Autos für {track.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-400">
        Bis zu {MAX_RACERS} Autos, auch quer über die Marken. Antippen stellt ein Auto ins Startfeld.
      </p>

      <BrandBrowser />
    </div>
  );
}
