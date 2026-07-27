"use client";

import { CHAMPIONSHIP_SIZE, isFinished } from "@/lib/championship";
import { useChampionship } from "@/lib/use-championship";
import { ChampionshipRunner } from "@/components/ChampionshipRunner";
import { ChampionshipSetup } from "@/components/ChampionshipSetup";
import { ResetButton } from "@/components/ResetButton";

/** A series over a calendar of tracks. The single race answers
 * "which of these four is quickest here"; a championship asks which car holds
 * up across a season. */
export default function ChampionshipPage() {
  const { state, ready, start, finishRound, abandon } = useChampionship();

  return (
    <div className="mx-auto w-full max-w-[100rem] flex-1 px-6 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-white">Meisterschaft</h1>
        {state && (
          <span className="ml-auto">
            <ResetButton
              label={isFinished(state) ? "Neue Meisterschaft" : "Meisterschaft abbrechen"}
              question={
                isFinished(state)
                  ? "Ergebnis verwerfen und neu aufsetzen?"
                  : `Die laufende Meisterschaft nach ${state.rounds.length} von ${state.trackIds.length} Läufen abbrechen?`
              }
              confirmLabel={isFinished(state) ? "Neu aufsetzen" : "Abbrechen"}
              onConfirm={async () => abandon()}
            />
          </span>
        )}
      </div>

      {!ready ? (
        <p className="mt-8 text-zinc-400">Lade...</p>
      ) : state ? (
        <ChampionshipRunner state={state} onRoundFinished={finishRound} />
      ) : (
        <>
          <p className="mt-1 text-sm text-zinc-400">
            Bis zu {CHAMPIONSHIP_SIZE} Autos über eine selbst gewählte Streckenfolge. Die gefahrenen Zeiten
            zählen auch für die normalen Ranglisten.
          </p>
          <ChampionshipSetup onStart={start} />
        </>
      )}
    </div>
  );
}
