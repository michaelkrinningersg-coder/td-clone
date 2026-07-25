import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Local-dev only, see src/app/api/runs/route.node.ts. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entries = await prisma.timeEntry.findMany({
    where: { trackId: id },
    orderBy: { timeMs: "asc" },
  });

  return NextResponse.json(
    entries.map((entry) => ({
      id: entry.id,
      carId: entry.carId,
      trackId: entry.trackId,
      timeMs: entry.timeMs,
      createdAt: entry.createdAt.toISOString(),
    })),
  );
}
