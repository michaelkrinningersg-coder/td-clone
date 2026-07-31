"use client";

import { useEffect, useRef, useState } from "react";
import { cars, getCar, getTrack, tracks } from "@/lib/data";
import { timeStore, type TimeEntryData } from "@/lib/time-store";
import {
  buildSave,
  mergeTimes,
  readSave,
  replaceTimes,
  saveFileName,
  type MergeReport,
  type SaveGame,
} from "@/lib/save-game";

/** Everything the game keeps in the browser besides the times. The keys belong
 * to the hooks that own them; this only moves them in and out. */
const SIDE_KEYS = { championship: "td-clone:championship", duel: "td-clone:duel", session: "td-clone:session" };

function readSide(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

function writeSide(key: string, value: unknown) {
  if (value == null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, JSON.stringify(value));
}

function runningNow(): string[] {
  return [
    readSide(SIDE_KEYS.championship) != null && "eine laufende Meisterschaft",
    readSide(SIDE_KEYS.duel) != null && "ein laufendes Duell",
  ].filter((x): x is string => typeof x === "string");
}

type Mode = "merge" | "replace";

/** Export the game to a file and read one back.
 *
 * The times are the point, but a save that dropped a half-finished
 * championship would be a save you cannot trust, so whatever is running goes
 * with it. */
export function SaveGamePanel() {
  const [entries, setEntries] = useState<TimeEntryData[] | null>(null);
  /** Which of the running things exist, read once alongside the times. Named
   * rather than promised: the summary should say what is actually in the file,
   * not that a championship travels with it "if there is one". */
  const [running, setRunning] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("merge");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ file: SaveGame; result: MergeReport } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all(tracks.map((t) => timeStore.getLeaderboard(t.id)))
      .then((perTrack) => {
        if (cancelled) return;
        setEntries(perTrack.flat());
        setRunning(runningNow());
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function exportSave() {
    const at = new Date();
    const save = buildSave(
      {
        times: entries ?? [],
        field: { cars: cars.length, tracks: tracks.length },
        championship: readSide(SIDE_KEYS.championship),
        duel: readSide(SIDE_KEYS.duel),
        session: readSide(SIDE_KEYS.session),
      },
      at,
    );
    const blob = new Blob([JSON.stringify(save, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = saveFileName(at);
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const parsed = readSave(await file.text());
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      const knows = (carId: string, trackId: string) =>
        getCar(carId) !== undefined && getTrack(trackId) !== undefined;
      const result =
        mode === "merge"
          ? mergeTimes(entries ?? [], parsed.save.times, knows)
          : replaceTimes(parsed.save.times, knows);

      // Replacing means the store must lose what the file does not carry;
      // merging already folded the old times into `result.entries`.
      await timeStore.clear();
      await timeStore.saveRuns(
        result.entries.map(([carId, trackId, timeMs]) => ({ carId, trackId, timeMs })),
      );

      // The running series only travel on a replace. Folding two half-finished
      // championships into one is not a thing that can be done sensibly.
      if (mode === "replace") {
        writeSide(SIDE_KEYS.championship, parsed.save.championship);
        writeSide(SIDE_KEYS.duel, parsed.save.duel);
        writeSide(SIDE_KEYS.session, parsed.save.session);
      }
      setEntries(result.entries.map(([carId, trackId, timeMs]) => ({
        id: `${trackId}:${carId}`,
        carId,
        trackId,
        timeMs,
        createdAt: new Date().toISOString(),
      })));
      setRunning(runningNow());
      setReport({ file: parsed.save, result });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Der Spielstand konnte nicht geladen werden.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const count = entries?.length ?? 0;
  const trackCount = new Set(entries?.map((e) => e.trackId) ?? []).size;
  const carCount = new Set(entries?.map((e) => e.carId) ?? []).size;

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h3 className="text-sm font-semibold text-white">Spielstand sichern</h3>
        <p className="mt-1 text-sm text-zinc-400">
          {entries === null
            ? "Lade Zeiten..."
            : `${count.toLocaleString("de-DE")} ${count === 1 ? "Zeit" : "Zeiten"} von ${carCount.toLocaleString("de-DE")} ${carCount === 1 ? "Auto" : "Autos"} auf ${trackCount} ${trackCount === 1 ? "Strecke" : "Strecken"}${running.length ? `, dazu ${running.join(" und ")}` : ""}.`}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Der Fortschritt liegt sonst nur im Speicher dieses Browsers — ein geleerter Cache oder ein
          anderes Gerät, und er ist weg. Die Datei ist lesbares JSON.
        </p>
        <button
          type="button"
          onClick={exportSave}
          disabled={entries === null}
          className="mt-4 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Spielstand herunterladen
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h3 className="text-sm font-semibold text-white">Spielstand laden</h3>

        <div className="mt-3 flex flex-col gap-2">
          {(
            [
              {
                id: "merge" as const,
                label: "Zusammenführen",
                hint: "Behält je Auto und Strecke die schnellere Zeit. Den eigenen Spielstand zurückzuladen ändert damit nichts.",
              },
              {
                id: "replace" as const,
                label: "Ersetzen",
                hint: "Wirft alles Vorhandene weg und übernimmt nur die Datei — samt laufender Meisterschaft und Duell.",
              },
            ]
          ).map((option) => (
            <label key={option.id} className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="radio"
                name="import-mode"
                checked={mode === option.id}
                onChange={() => setMode(option.id)}
                className="mt-1 h-3.5 w-3.5 shrink-0 accent-emerald-500"
              />
              <span>
                <span className={mode === option.id ? "text-white" : "text-zinc-400"}>{option.label}</span>
                <span className="block text-xs text-zinc-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {mode === "replace" && (
          <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Ersetzen löscht die {count.toLocaleString("de-DE")} vorhandenen Zeiten unwiderruflich. Vorher
            herunterladen, wenn sie noch gebraucht werden.
          </p>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          disabled={busy || entries === null}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
          }}
          aria-label="Spielstand-Datei wählen"
          className="mt-4 block w-full text-sm text-zinc-400 file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-zinc-100 file:px-5 file:py-2.5 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-white disabled:opacity-40"
        />

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        {report && (
          <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            <p>
              {report.file.times.length.toLocaleString("de-DE")} Zeiten gelesen
              {report.file.exportedAt ? ` (gesichert am ${report.file.exportedAt.slice(0, 10)})` : ""}:{" "}
              {report.result.added.toLocaleString("de-DE")} neu,{" "}
              {report.result.improved.toLocaleString("de-DE")} verbessert,{" "}
              {report.result.kept.toLocaleString("de-DE")} unverändert.
            </p>
            {report.result.unknown > 0 && (
              <p className="mt-1 text-xs text-emerald-300/80">
                {report.result.unknown.toLocaleString("de-DE")} Zeiten übersprungen — deren Auto oder
                Strecke gibt es in dieser Version nicht mehr.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
