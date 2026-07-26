"use client";

import { useDuel } from "@/lib/use-duel";
import { DuelRunner } from "@/components/DuelRunner";
import { DuelSetup } from "@/components/DuelSetup";
import { ResetButton } from "@/components/ResetButton";

/** Marque against marque. The championship asks which car holds up over a
 * season; this asks which badge does. */
export default function DuelPage() {
  const { state, ready, start, finishRound, abandon } = useDuel();
  const done = state !== null && state.rounds.length >= state.trackIds.length;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-white">Herstellerduell</h1>
        {state && (
          <span className="ml-auto">
            <ResetButton
              label={done ? "Neues Duell" : "Duell abbrechen"}
              question={
                done
                  ? "Ergebnis verwerfen und neu aufsetzen?"
                  : `Das laufende Duell nach ${state.rounds.length} von ${state.trackIds.length} Runden abbrechen?`
              }
              confirmLabel={done ? "Neu aufsetzen" : "Abbrechen"}
              onConfirm={async () => abandon()}
            />
          </span>
        )}
      </div>

      {!ready ? (
        <p className="mt-8 text-zinc-400">Lade...</p>
      ) : state ? (
        <DuelRunner state={state} onRoundFinished={finishRound} />
      ) : (
        <DuelSetup onStart={start} />
      )}
    </div>
  );
}
