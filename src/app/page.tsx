import { cars } from "@/lib/data";
import { CarPicker } from "@/components/CarPicker";

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-bold text-white">Auto auswählen</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Alle Werte sind reale Fahrzeugdaten. Ein voller Balken heisst immer &quot;stark&quot;, gemessen am
        schwaechsten und staerksten Auto im Feld — auch bei 0-100 und Gewicht, wo der kleinere Wert der
        bessere ist.
      </p>

      {cars.length === 0 ? (
        <p className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
          Noch keine Autos vorhanden. Fuehre <code className="text-zinc-200">npm run import:cars</code> aus.
        </p>
      ) : (
        <CarPicker />
      )}
    </div>
  );
}
