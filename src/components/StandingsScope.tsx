"use client";

import { useMemo } from "react";
import { cars } from "@/lib/data";
import { carClasses, classRangeLabel } from "@/lib/classes";
import {
  carScopeIsEmpty,
  fuelTypesIn,
  TRACK_SCOPES,
  type CarScope,
  type TrackScope,
} from "@/lib/standings-filters";

const DRIVETRAINS = [
  { id: "FWD", label: "Frontantrieb" },
  { id: "RWD", label: "Heckantrieb" },
  { id: "AWD", label: "Allrad" },
];

/** German names for the fuel types the dataset spells in English. Anything not
 * listed falls back to the source's own word rather than being renamed. */
const FUEL_LABELS: Record<string, string> = {
  Gasoline: "Benzin",
  Diesel: "Diesel",
  Electric: "Elektro",
  Hybrid: "Hybrid",
  "Hybrid Gasoline": "Hybrid (Benzin)",
  "Hybrid Diesel": "Hybrid (Diesel)",
  "Mild Hybrid": "Mild-Hybrid",
  "Mild Hybrid Diesel": "Mild-Hybrid (Diesel)",
  "Plug-In Hybrid": "Plug-in-Hybrid",
  "Natural Gas": "Erdgas",
  Ethanol: "Ethanol",
};

const SELECT =
  "rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-emerald-600 focus:outline-none";

interface Props {
  trackScope: TrackScope;
  onTrackScope: (scope: TrackScope) => void;
  carScope: CarScope;
  onCarScope: (scope: CarScope) => void;
}

/** The controls that decide what a board is a board of: which tracks count, and
 * which cars are allowed in.
 *
 * Shared by the overall standings and the record table on purpose. They answer
 * different questions, but "best front-driven diesel on the circuits" has to
 * mean the same thing on both, or comparing them would be nonsense. */
export function StandingsScope({ trackScope, onTrackScope, carScope, onCarScope }: Props) {
  const fuels = useMemo(() => fuelTypesIn(cars), []);
  const narrowed = !carScopeIsEmpty(carScope);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
          {TRACK_SCOPES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onTrackScope(option.id)}
              aria-pressed={trackScope === option.id}
              title={option.hint}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                trackScope === option.id
                  ? "bg-sky-500 text-zinc-950"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="max-w-md text-xs text-zinc-500">
          {TRACK_SCOPES.find((s) => s.id === trackScope)!.hint}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={carScope.classId}
          onChange={(e) => onCarScope({ ...carScope, classId: e.target.value })}
          aria-label="Nach Klasse filtern"
          className={SELECT}
        >
          <option value="">Alle Klassen</option>
          {carClasses.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name} ({classRangeLabel(cls)})
            </option>
          ))}
        </select>

        <select
          value={carScope.drivetrain}
          onChange={(e) => onCarScope({ ...carScope, drivetrain: e.target.value })}
          aria-label="Nach Antrieb filtern"
          className={SELECT}
        >
          <option value="">Jeder Antrieb</option>
          {DRIVETRAINS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>

        <select
          value={carScope.fuelType}
          onChange={(e) => onCarScope({ ...carScope, fuelType: e.target.value })}
          aria-label="Nach Kraftstoff filtern"
          className={SELECT}
        >
          <option value="">Jeder Kraftstoff</option>
          {fuels.map((fuel) => (
            <option key={fuel} value={fuel}>
              {FUEL_LABELS[fuel] ?? fuel}
            </option>
          ))}
        </select>

        {narrowed && (
          <button
            type="button"
            onClick={() => onCarScope({ classId: "", drivetrain: "", fuelType: "" })}
            className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-400 transition hover:border-zinc-600 hover:text-white"
          >
            Filter zurücksetzen
          </button>
        )}
      </div>
    </div>
  );
}
