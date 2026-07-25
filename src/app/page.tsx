import { cars, statMax } from "@/lib/data";
import { CarCard } from "@/components/CarCard";

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-bold text-white">Auto auswählen</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Alle Werte sind reale Fahrzeugdaten. Balken sind relativ zum staerksten Auto im aktuellen Bestand skaliert.
      </p>

      {cars.length === 0 ? (
        <p className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
          Noch keine Autos vorhanden. Fuehre <code className="text-zinc-200">npm run import:cars</code> aus.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cars.map((car) => (
            <CarCard key={car.id} car={car} statMax={statMax} href={`/tracks?carId=${car.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
