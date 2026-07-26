"use client";

import Link from "next/link";
import { getCar } from "@/lib/data";
import { CarList } from "@/components/CarList";
import { ResetButton } from "@/components/ResetButton";
import { useSession } from "@/lib/selection";

/** The shortlist. Starring a car keeps it findable without it having to be on
 * the grid, which matters in a field of several thousand. */
export default function GaragePage() {
  const { garageIds, clearGarage, ready } = useSession();

  // Ids of cars dropped by a later import simply disappear from the list.
  const starred = garageIds.map((id) => getCar(id)).filter((car) => car !== undefined);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-white">Garage</h1>
        {starred.length > 0 && (
          <span className="ml-auto">
            <ResetButton
              label="Garage leeren"
              question={`Alle ${starred.length} ${starred.length === 1 ? "Auto" : "Autos"} aus der Garage nehmen?`}
              confirmLabel="Leeren"
              onConfirm={async () => clearGarage()}
            />
          </span>
        )}
      </div>

      {!ready ? (
        <p className="mt-8 text-zinc-400">Lade...</p>
      ) : starred.length === 0 ? (
        <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-zinc-400">
            Noch kein Auto gemerkt. Der Stern ☆ oben rechts auf jeder Autokarte legt es hier ab.
          </p>
          <Link href="/cars" className="mt-3 inline-block text-emerald-400 hover:text-emerald-300">
            Autos durchsehen →
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-zinc-400">
            {starred.length} {starred.length === 1 ? "gemerktes Auto" : "gemerkte Autos"}. Antippen stellt
            eines ins Startfeld, der Stern nimmt es wieder heraus.
          </p>
          <CarList cars={starred} searchPlaceholder="In der Garage suchen..." />
        </>
      )}
    </div>
  );
}
