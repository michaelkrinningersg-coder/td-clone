import { cars, tracks } from "@/lib/data";
import { TrackPicker } from "@/components/TrackPicker";
import { MAX_RACERS } from "@/lib/race";

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">Schritt 1 von 2</p>
      <h1 className="mt-1 text-2xl font-bold text-white">Strecke wählen</h1>
      <p className="mt-1 text-sm text-zinc-400">
        {tracks.length} Strecken. Danach stellst du bis zu {MAX_RACERS} Autos aus {cars.length.toLocaleString("de-DE")}{" "}
        ins Startfeld und lässt sie hier gegeneinander fahren.
      </p>

      <TrackPicker />
    </div>
  );
}
