"use client";

import { useState } from "react";
import { OverallStandings } from "@/components/OverallStandings";
import { TrackRecords } from "@/components/TrackRecords";

type Tab = "overall" | "records";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "overall", label: "Gesamtwertung", hint: "Jedes Auto über alle Strecken, dazu die Markenwertung." },
  { id: "records", label: "Streckenrekorde", hint: "Je Strecke die Bestzeit und wer sie hält." },
];

/** The two ways of reading the same times: down the cars, or down the tracks.
 *
 * Tabs rather than one page under the other, because they are alternatives and
 * not a sequence - the record board answers "where have I been", the standings
 * answer "which car is best", and neither is a footnote to the other. */
export function StandingsTabs() {
  const [tab, setTab] = useState<Tab>("overall");

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
          {TABS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTab(option.id)}
              aria-pressed={tab === option.id}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === option.id ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">{TABS.find((t) => t.id === tab)!.hint}</p>
      </div>

      {tab === "overall" ? <OverallStandings /> : <TrackRecords />}
    </>
  );
}
