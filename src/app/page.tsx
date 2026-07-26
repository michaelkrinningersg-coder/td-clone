import { brands, cars } from "@/lib/data";
import { BrandBrowser } from "@/components/BrandBrowser";
import { MAX_RACERS } from "@/lib/race";

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-bold text-white">Marke wählen</h1>
      <p className="mt-1 text-sm text-zinc-400">
        {cars.length} Autos aus {brands.length} Marken, alle Werte real. Stell dir bis zu {MAX_RACERS} Autos
        ins Startfeld — auch quer über die Marken — und lass sie gegeneinander fahren.
      </p>

      {cars.length === 0 ? (
        <p className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
          Noch keine Autos vorhanden. Fuehre <code className="text-zinc-200">npm run import:cars</code> aus.
        </p>
      ) : (
        <BrandBrowser />
      )}
    </div>
  );
}
