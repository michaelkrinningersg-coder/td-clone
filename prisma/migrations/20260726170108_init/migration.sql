-- CreateTable
CREATE TABLE "Car" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "topSpeedKph" REAL NOT NULL,
    "accel0to100s" REAL NOT NULL,
    "powerPs" REAL NOT NULL,
    "weightKg" REAL NOT NULL,
    "torqueNm" REAL NOT NULL,
    "drivetrain" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "dragCoefficient" REAL NOT NULL,
    "widthMm" REAL NOT NULL,
    "heightMm" REAL NOT NULL,
    "brakeFront" TEXT NOT NULL,
    "brakeRear" TEXT NOT NULL,
    "tyreWidthMm" REAL NOT NULL,
    "gearCount" INTEGER NOT NULL,
    "manualGearbox" BOOLEAN NOT NULL
);

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "segmentsJson" TEXT NOT NULL,
    "lengthM" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "timeMs" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimeEntry_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Car_make_model_year_variant_key" ON "Car"("make", "model", "year", "variant");

-- CreateIndex
CREATE UNIQUE INDEX "Track_name_key" ON "Track"("name");

-- CreateIndex
CREATE INDEX "TimeEntry_trackId_timeMs_idx" ON "TimeEntry"("trackId", "timeMs");

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntry_carId_trackId_key" ON "TimeEntry"("carId", "trackId");
