import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { cars, tracks } from "../src/lib/data";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const { id, ...car } of cars) {
    await prisma.car.upsert({
      where: { id },
      update: car,
      create: { id, ...car },
    });
  }
  console.log(`Seeded ${cars.length} cars.`);

  for (const track of tracks) {
    const row = {
      name: track.name,
      type: track.type,
      segmentsJson: JSON.stringify(track.segments),
      lengthM: track.lengthM,
    };
    await prisma.track.upsert({
      where: { id: track.id },
      update: row,
      create: { id: track.id, ...row },
    });
  }
  console.log(`Seeded ${tracks.length} tracks.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
