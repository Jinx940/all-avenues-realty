-- CreateEnum
CREATE TYPE "NemtDriverStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "NemtVehicleStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "NemtTripStatus" AS ENUM ('NEW', 'PENDING_CONFIRMATION', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'PROBLEM', 'COMPLETED', 'CANCELED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "NemtBroker" AS ENUM ('MTM', 'OTHER');

-- CreateEnum
CREATE TYPE "NemtExternalSystem" AS ENUM ('MTM', 'ROUTINGBOX', 'MANUAL', 'OTHER');

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "workerId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "status" "NemtDriverStatus" NOT NULL DEFAULT 'ACTIVE',
    "licenseNumber" TEXT,
    "licenseState" TEXT,
    "licenseExpiresAt" TIMESTAMP(3),
    "cprExpiresAt" TIMESTAMP(3),
    "hireDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "NemtVehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "vin" TEXT,
    "plateNumber" TEXT,
    "plateState" TEXT,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "capacityAmbulatory" INTEGER NOT NULL DEFAULT 0,
    "capacityWheelchair" INTEGER NOT NULL DEFAULT 0,
    "odometer" INTEGER,
    "registrationExpiresAt" TIMESTAMP(3),
    "insuranceExpiresAt" TIMESTAMP(3),
    "inspectionDueAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mtmFacilityId" TEXT,
    "facilityType" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "tripNumber" TEXT,
    "broker" "NemtBroker" NOT NULL DEFAULT 'MTM',
    "status" "NemtTripStatus" NOT NULL DEFAULT 'NEW',
    "passengerName" TEXT NOT NULL,
    "passengerPhone" TEXT,
    "memberId" TEXT,
    "pickupFacilityId" TEXT,
    "dropoffFacilityId" TEXT,
    "pickupAddress" TEXT NOT NULL,
    "pickupLatitude" DECIMAL(10,7),
    "pickupLongitude" DECIMAL(10,7),
    "dropoffAddress" TEXT NOT NULL,
    "dropoffLatitude" DECIMAL(10,7),
    "dropoffLongitude" DECIMAL(10,7),
    "scheduledPickupAt" TIMESTAMP(3) NOT NULL,
    "appointmentAt" TIMESTAMP(3),
    "estimatedDropoffAt" TIMESTAMP(3),
    "actualPickupAt" TIMESTAMP(3),
    "actualDropoffAt" TIMESTAMP(3),
    "assignedDriverId" TEXT,
    "vehicleId" TEXT,
    "requiresWheelchair" BOOLEAN NOT NULL DEFAULT false,
    "requiresEscort" BOOLEAN NOT NULL DEFAULT false,
    "estimatedMileage" DECIMAL(8,2),
    "actualMileage" DECIMAL(8,2),
    "billableMileage" DECIMAL(8,2),
    "fareAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "cancellationReason" TEXT,
    "noShowReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalTripReference" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "source" "NemtExternalSystem" NOT NULL,
    "externalId" TEXT NOT NULL,
    "rawPayload" JSONB,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalTripReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Driver_workerId_key" ON "Driver"("workerId");

-- CreateIndex
CREATE INDEX "Driver_status_idx" ON "Driver"("status");

-- CreateIndex
CREATE INDEX "Driver_licenseExpiresAt_idx" ON "Driver"("licenseExpiresAt");

-- CreateIndex
CREATE INDEX "Driver_cprExpiresAt_idx" ON "Driver"("cprExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vin_key" ON "Vehicle"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plateState_plateNumber_key" ON "Vehicle"("plateState", "plateNumber");

-- CreateIndex
CREATE INDEX "Vehicle_status_idx" ON "Vehicle"("status");

-- CreateIndex
CREATE INDEX "Vehicle_registrationExpiresAt_idx" ON "Vehicle"("registrationExpiresAt");

-- CreateIndex
CREATE INDEX "Vehicle_insuranceExpiresAt_idx" ON "Vehicle"("insuranceExpiresAt");

-- CreateIndex
CREATE INDEX "Vehicle_inspectionDueAt_idx" ON "Vehicle"("inspectionDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Facility_mtmFacilityId_key" ON "Facility"("mtmFacilityId");

-- CreateIndex
CREATE INDEX "Facility_name_idx" ON "Facility"("name");

-- CreateIndex
CREATE INDEX "Facility_isActive_idx" ON "Facility"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_tripNumber_key" ON "Trip"("tripNumber");

-- CreateIndex
CREATE INDEX "Trip_broker_scheduledPickupAt_idx" ON "Trip"("broker", "scheduledPickupAt");

-- CreateIndex
CREATE INDEX "Trip_status_scheduledPickupAt_idx" ON "Trip"("status", "scheduledPickupAt");

-- CreateIndex
CREATE INDEX "Trip_assignedDriverId_scheduledPickupAt_idx" ON "Trip"("assignedDriverId", "scheduledPickupAt");

-- CreateIndex
CREATE INDEX "Trip_vehicleId_scheduledPickupAt_idx" ON "Trip"("vehicleId", "scheduledPickupAt");

-- CreateIndex
CREATE INDEX "Trip_pickupFacilityId_idx" ON "Trip"("pickupFacilityId");

-- CreateIndex
CREATE INDEX "Trip_dropoffFacilityId_idx" ON "Trip"("dropoffFacilityId");

-- CreateIndex
CREATE INDEX "Trip_memberId_scheduledPickupAt_idx" ON "Trip"("memberId", "scheduledPickupAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalTripReference_source_externalId_key" ON "ExternalTripReference"("source", "externalId");

-- CreateIndex
CREATE INDEX "ExternalTripReference_tripId_idx" ON "ExternalTripReference"("tripId");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_pickupFacilityId_fkey" FOREIGN KEY ("pickupFacilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_dropoffFacilityId_fkey" FOREIGN KEY ("dropoffFacilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalTripReference" ADD CONSTRAINT "ExternalTripReference_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
