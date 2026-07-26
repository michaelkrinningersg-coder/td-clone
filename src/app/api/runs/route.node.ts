import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCar, getTrack } from "@/lib/data";
import { isImprovement } from "@/lib/time-store";

/** Local-dev only: persists a lap time to SQLite and reports where it ranks.
 * Excluded from the static Pages build via `pageExtensions` in next.config.ts,
 * where localStorage takes over instead (see src/lib/time-store.ts).
 *
 * The run is simulated in the browser and the time posted here rather than
 * recomputed server-side, so the stored time is exactly the one the animation
 * showed. The physics is deterministic and this is a single-user local tool. */
export async function POST(req: Request) {
  const { carId, trackId, timeMs } = (await req.json()) as {
    carId?: string;
    trackId?: string;
    timeMs?: number;
  };

  if (!carId || !trackId || typeof timeMs !== "number" || !Number.isFinite(timeMs) || timeMs <= 0) {
    return NextResponse.json(
      { error: "carId, trackId und eine positive timeMs sind erforderlich" },
      { status: 400 },
    );
  }
  if (!getCar(carId)) return NextResponse.json({ error: "Auto nicht gefunden" }, { status: 404 });
  if (!getTrack(trackId)) return NextResponse.json({ error: "Strecke nicht gefunden" }, { status: 404 });

  const rounded = Math.round(timeMs);
  const previous = await prisma.timeEntry.findUnique({ where: { carId_trackId: { carId, trackId } } });

  // A car keeps one time per track - its best - so a repeat run replaces the
  // stored time only when it is genuinely quicker.
  let entry = previous;
  let improved = false;
  if (!previous) {
    entry = await prisma.timeEntry.create({ data: { carId, trackId, timeMs: rounded } });
  } else if (isImprovement(previous.timeMs, rounded)) {
    entry = await prisma.timeEntry.update({
      where: { carId_trackId: { carId, trackId } },
      data: { timeMs: rounded, createdAt: new Date() },
    });
    improved = true;
  }

  const [fasterCount, totalEntries] = await Promise.all([
    prisma.timeEntry.count({ where: { trackId, timeMs: { lt: entry!.timeMs } } }),
    prisma.timeEntry.count({ where: { trackId } }),
  ]);

  return NextResponse.json({
    entry: {
      id: entry!.id,
      carId: entry!.carId,
      trackId: entry!.trackId,
      timeMs: entry!.timeMs,
      createdAt: entry!.createdAt.toISOString(),
    },
    rank: fasterCount + 1,
    totalEntries,
    improved,
  });
}

/** Local-dev only, see the POST handler above. */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id ist erforderlich" }, { status: 400 });

  const deleted = await prisma.timeEntry.deleteMany({ where: { id } });
  if (deleted.count === 0) return NextResponse.json({ error: "Eintrag nicht gefunden" }, { status: 404 });

  return NextResponse.json({ deleted: deleted.count });
}
