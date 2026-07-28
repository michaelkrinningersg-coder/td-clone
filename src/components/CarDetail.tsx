"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { slugify } from "@/lib/slug";
import { tracks, type CarData } from "@/lib/data";
import { brandColor } from "@/lib/brand-colors";
import { carClassOf, classRangeLabel, powerToWeight } from "@/lib/classes";
import { formatTimeMs } from "@/lib/format";
import { heatColor, lapScore, positionScore, readableOn } from "@/lib/heat";
import { timeStore, type TimeEntryData } from "@/lib/time-store";
import {
  buildGearbox,
  dragForceN,
  effectiveTopSpeedMps,
  frontalAreaM2,
  gearTopSpeedsMps,
  powerLimitedTopSpeedMps,
  ratedSpeedRadS,
  shiftTimeS,
  solveLaunchGrip,
  simulateTrack,
  torqueFactor,
  wheelPowerW,
} from "@/lib/physics";
import { useSession } from "@/lib/selection";

const BRAKE_LABEL: Record<string, string> = {
  "ventilated-disc": "Scheibe, belüftet",
  disc: "Scheibe",
  drum: "Trommel",
};

const GEARBOX_LABEL: Record<string, string> = {
  manual: "Handschaltung",
  automatic: "Wandlerautomatik",
  "dual-clutch": "Doppelkupplung",
  sequential: "automatisiertes Schaltgetriebe",
  cvt: "stufenlos",
};

const CHART_W = 460;
const CHART_H = 130;

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800 py-1.5 last:border-0">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="text-right font-mono text-sm text-white">
        {value}
        {hint && <span className="block text-xs font-sans text-zinc-600">{hint}</span>}
      </span>
    </div>
  );
}

/** One reading off the green-to-red scale, as a chip rather than as coloured
 * text: the dark ends of the scale are unreadable as text on a dark page. */
function Chip({ score, title, children }: { score: number; title: string; children: React.ReactNode }) {
  const background = heatColor(score);
  return (
    <span
      title={title}
      className="inline-block rounded px-2 py-0.5 font-mono text-sm font-bold tabular-nums"
      style={{ backgroundColor: background, color: readableOn(background) }}
    >
      {children}
    </span>
  );
}

function HeatLegend() {
  return (
    <span className="flex items-center gap-2 text-xs text-zinc-500">
      besser
      <span className="flex overflow-hidden rounded">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="h-2.5 w-4" style={{ backgroundColor: heatColor(i / 11) }} />
        ))}
      </span>
      schlechter
    </span>
  );
}

/** Everything the game knows about one car, and everything it derives from it.
 *
 * The list view has room for five bars; this is where the other fourteen
 * figures live, together with what the physics makes of them - which is the
 * only place the torque curve and the gearing are visible at all. */
export function CarDetail({ car }: { car: CarData }) {
  const { isSelected, toggleCar, isFull, isInGarage, toggleGarage } = useSession();
  const cls = carClassOf(car);
  const ratedRpm = Math.round((ratedSpeedRadS(car) * 60) / (2 * Math.PI));
  const launchGrip = solveLaunchGrip(car);
  const shiftCostS = shiftTimeS(car);
  const gearSpeeds = gearTopSpeedsMps(car);
  const gearbox = useMemo(() => buildGearbox(car), [car]);
  const topSpeed = Math.round(effectiveTopSpeedMps(car) * 3.6);
  const potential = Math.round(powerLimitedTopSpeedMps(car) * 3.6);

  const laps = useMemo(
    () =>
      tracks.map((track) => {
        const sim = simulateTrack(car, track);
        return { track, timeMs: sim.totalTimeMs, distanceM: sim.distanceM };
      }),
    [car],
  );

  // Every track's board, so each lap can be put next to the record and the
  // field it would be joining.
  const [boards, setBoards] = useState<Map<string, TimeEntryData[]> | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all(tracks.map((track) => timeStore.getLeaderboard(track.id)))
      .then((perTrack) => {
        if (!cancelled) setBoards(new Map(tracks.map((t, i) => [t.id, perTrack[i]])));
      })
      .catch(() => {
        if (!cancelled) setBoards(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** What this car's lap on a track is worth: where it stands and how far off
   * the record it is. A track it has not driven still gets a placing - the one
   * its simulated lap would take - marked as the hypothetical it is. */
  const standingOn = (trackId: string, timeMs: number) => {
    const entries = boards?.get(trackId);
    if (!entries || entries.length === 0) return null;
    const own = entries.findIndex((e) => e.carId === car.id);
    const driven = own >= 0;
    const position = driven ? own + 1 : entries.filter((e) => e.timeMs < timeMs).length + 1;
    const fieldSize = driven ? entries.length : entries.length + 1;
    return { driven, position, fieldSize, bestMs: entries[0].timeMs };
  };

  // One point every 2% of the rev range, from idle to the redline.
  const curve = Array.from({ length: 56 }, (_, i) => {
    const x = i / 50;
    return { x, torque: torqueFactor(car, ratedSpeedRadS(car) * x) };
  });
  const power = curve.map((p) => ({ x: p.x, value: p.torque * p.x }));
  const maxPower = Math.max(...power.map((p) => p.value));

  const selected = isSelected(car.id);
  const starred = isInGarage(car.id);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <Link href={`/brand/${slugify(car.make)}`} className="text-sm text-emerald-400 hover:text-emerald-300">
        ← Alle {car.make}
      </Link>

      <header className="mt-2 flex flex-wrap items-start gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium uppercase tracking-wide" style={{ color: brandColor(car.make) }}>
            {car.make}
          </div>
          <h1 className="text-3xl font-bold text-white">
            {car.model} <span className="text-zinc-600">{car.year}</span>
          </h1>
          <p className="mt-1 text-zinc-400">{car.variant}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span
              className={`rounded bg-zinc-800 px-2 py-0.5 font-medium ${cls.color}`}
              title={classRangeLabel(cls)}
            >
              {cls.name} · {classRangeLabel(cls)}
            </span>
            <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">{car.drivetrain}</span>
            <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">{car.fuelType}</span>
          </div>
        </div>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => toggleGarage(car.id)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              starred
                ? "border-amber-500 text-amber-300 hover:border-amber-400"
                : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
            }`}
          >
            {starred ? "★ In der Garage" : "☆ Merken"}
          </button>
          <button
            type="button"
            onClick={() => toggleCar(car.id)}
            disabled={isFull && !selected}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              selected
                ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                : "border border-zinc-700 text-zinc-300 hover:border-emerald-600 hover:text-white"
            }`}
          >
            {selected ? "Im Startfeld ✓" : "Ins Startfeld"}
          </button>
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Aus dem Datensatz</h2>
          <div className="mt-2">
            <Row label="Leistung" value={`${car.powerPs} PS`} hint={`${Math.round(car.powerPs * 0.7355)} kW`} />
            <Row label="Drehmoment" value={`${car.torqueNm} Nm`} />
            <Row label="Gewicht" value={`${car.weightKg} kg`} />
            <Row label="Höchstgeschwindigkeit" value={`${car.topSpeedKph} km/h`} />
            <Row label="0–100 km/h" value={`${car.accel0to100s} s`} />
            <Row label="cw-Wert" value={car.dragCoefficient.toFixed(2)} />
            <Row label="Breite × Höhe" value={`${car.widthMm} × ${car.heightMm} mm`} />
            <Row label="Radstand" value={`${car.wheelbaseMm} mm`} />
            <Row label="Bremse vorn" value={BRAKE_LABEL[car.brakeFront] ?? car.brakeFront} />
            <Row label="Bremse hinten" value={BRAKE_LABEL[car.brakeRear] ?? car.brakeRear} />
            <Row label="Reifenbreite" value={`${car.tyreWidthMm} mm`} />
            <Row
              label="Getriebe"
              value={`${car.gearCount} Gänge`}
              hint={GEARBOX_LABEL[car.gearboxKind] ?? car.gearboxKind}
            />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Daraus gerechnet</h2>
          <div className="mt-2">
            <Row label="Leistungsgewicht" value={`${powerToWeight(car).toFixed(1)} kg/PS`} />
            <Row label="Stirnfläche" value={`${frontalAreaM2(car).toFixed(2)} m²`} hint="0,85 × Breite × Höhe" />
            <Row label="Leistung am Rad" value={`${Math.round(wheelPowerW(car) / 1000)} kW`} hint="85 % Antriebsstrang" />
            <Row label="Nenndrehzahl" value={`${ratedRpm.toLocaleString("de-DE")} /min`} hint="aus Leistung und Drehmoment" />
            <Row
              label="Reifengrip"
              value={launchGrip.toFixed(2)}
              hint="auf die reale 0-100-Zeit gelöst"
            />
            <Row
              label="Schaltzeit"
              value={`${shiftCostS.toFixed(2)} s`}
              hint={`je Gangwechsel, ${GEARBOX_LABEL[car.gearboxKind] ?? car.gearboxKind}`}
            />
            <Row
              label="Luftwiderstand bei 100"
              value={`${Math.round(dragForceN(car, 100 / 3.6))} N`}
            />
            <Row
              label="Ohne Abriegelung"
              value={`${potential} km/h`}
              hint={potential > car.topSpeedKph + 2 ? "Limiter greift vorher" : "vom Luftwiderstand begrenzt"}
            />
            <Row label="Erreichte Spitze" value={`${topSpeed} km/h`} />
            <Row
              label="Gangstufen"
              value={gearSpeeds.map((v) => Math.round(v * 3.6)).join(" · ")}
              hint="km/h bei Nenndrehzahl"
            />
            <Row
              label="Schaltpunkte"
              value={gearbox.shiftSpeeds.map((v) => Math.round(v * 3.6)).join(" · ") || "einstufig"}
              hint="km/h"
            />
          </div>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Drehmoment und Leistung über die Drehzahl
        </h2>
        <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          {/* Without preserveAspectRatio the box is letterboxed and the curve
              sits in the middle of a mostly empty panel; the non-scaling stroke
              keeps the lines even width despite the horizontal stretch. */}
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            preserveAspectRatio="none"
            className="h-40 w-full"
          >
            <line
              x1={(1 / 1.12) * CHART_W}
              x2={(1 / 1.12) * CHART_W}
              y1={0}
              y2={CHART_H}
              stroke="#3f3f46"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={curve
                .map((p) => `${((p.x / 1.12) * CHART_W).toFixed(1)},${(CHART_H - p.torque * CHART_H * 0.9).toFixed(1)}`)
                .join(" ")}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={power
                .map(
                  (p) =>
                    `${((p.x / 1.12) * CHART_W).toFixed(1)},${(CHART_H - (p.value / maxPower) * CHART_H * 0.9).toFixed(1)}`,
                )
                .join(" ")}
              fill="none"
              stroke="#10b981"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-400">
            <span className="text-amber-500">— Drehmoment</span>
            <span className="text-emerald-500">— Leistung</span>
            <span className="text-zinc-600">
              gestrichelt: Nenndrehzahl {ratedRpm.toLocaleString("de-DE")} /min · Drehzahlgrenze{" "}
              {Math.round(ratedRpm * 1.1).toLocaleString("de-DE")} /min
            </span>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Zeiten und Platzierungen auf allen Strecken
          </h2>
          <HeatLegend />
        </div>
        <div className="mt-2 overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Strecke</th>
                <th className="px-3 py-2 text-right font-medium">Länge</th>
                <th className="px-3 py-2 text-right font-medium">⌀ Tempo</th>
                <th className="px-3 py-2 text-right font-medium">Rückstand</th>
                <th className="px-3 py-2 text-right font-medium">Platz</th>
                <th className="px-3 py-2 text-right font-medium">Zeit</th>
              </tr>
            </thead>
            <tbody>
              {laps.map(({ track, timeMs, distanceM }) => {
                const standing = standingOn(track.id, timeMs);
                const gap = standing ? timeMs - standing.bestMs : null;
                return (
                  <tr key={track.id} className="border-t border-zinc-800 bg-zinc-900/50">
                    <td className="px-3 py-2">
                      <Link href={`/leaderboard/${track.id}`} className="text-white hover:text-emerald-400">
                        {track.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-500">
                      {(track.lengthM / 1000).toFixed(2)} km
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-400">
                      {Math.round((distanceM / (timeMs / 1000)) * 3.6)} km/h
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-500">
                      {gap === null ? "—" : gap === 0 ? "Bestzeit" : `+${(gap / 1000).toFixed(2)}s`}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {standing === null ? (
                        <span className="font-mono text-zinc-700">—</span>
                      ) : (
                        <Chip
                          score={positionScore(standing.position, standing.fieldSize)}
                          title={`Platz ${standing.position} von ${standing.fieldSize}${
                            standing.driven ? "" : ", noch nicht gefahren"
                          }`}
                        >
                          {standing.driven ? `${standing.position}.` : `(${standing.position}.)`}
                        </Chip>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {standing === null ? (
                        // Deliberately not green: on this table green is a
                        // verdict, and there is nothing to judge it against yet.
                        <span className="font-mono font-bold text-zinc-300">{formatTimeMs(timeMs)}</span>
                      ) : (
                        <Chip
                          score={lapScore(timeMs, standing.bestMs)}
                          title={`${((timeMs / standing.bestMs - 1) * 100).toFixed(1)} % über der Bestzeit`}
                        >
                          {formatTimeMs(timeMs)}
                        </Chip>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Platz und Zeit sind eingefärbt: dunkelgrün ist die Bestzeit, dunkelrot ein Drittel darüber oder das
          Ende des Feldes. Eine Platzierung in Klammern ist noch nicht gefahren — es ist der Platz, den diese
          Zeit belegen würde. Ohne Farbe heißt: auf dieser Strecke ist noch keine Zeit gesetzt.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Die Simulation ist deterministisch: ein gefahrenes Rennen ergibt genau diese Zeiten, das Ansehen
          allein trägt aber keine Zeit in die Rangliste ein.
        </p>
      </section>
    </div>
  );
}
