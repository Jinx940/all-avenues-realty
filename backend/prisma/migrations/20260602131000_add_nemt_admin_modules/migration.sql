-- CreateEnum
CREATE TYPE "NemtInvoiceStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "NemtIncidentType" AS ENUM ('COMPLAINT', 'ACCIDENT', 'PASSENGER_ISSUE', 'INTERNAL_NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "NemtIncidentStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NemtDocumentType" AS ENUM ('DRIVER_LICENSE', 'CPR_CERTIFICATION', 'INSURANCE', 'REGISTRATION', 'VEHICLE_INSPECTION', 'TRIP_SIGNATURE', 'TRIP_DOCUMENTATION', 'OTHER');

-- CreateEnum
CREATE TYPE "NemtDocumentStatus" AS ENUM ('VALID', 'EXPIRING_SOON', 'EXPIRED', 'MISSING');

-- CreateEnum
CREATE TYPE "NemtMaintenanceType" AS ENUM ('ROUTINE', 'REPAIR', 'INSPECTION', 'OTHER');

-- CreateTable
CREATE TABLE "NemtInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "status" "NemtInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "broker" "NemtBroker" NOT NULL DEFAULT 'MTM',
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NemtInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NemtInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mileage" DECIMAL(8,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NemtInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NemtDocument" (
    "id" TEXT NOT NULL,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "tripId" TEXT,
    "type" "NemtDocumentType" NOT NULL,
    "status" "NemtDocumentStatus" NOT NULL DEFAULT 'VALID',
    "title" TEXT NOT NULL,
    "documentNumber" TEXT,
    "fileUrl" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NemtDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NemtVehicleMaintenance" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "serviceType" "NemtMaintenanceType" NOT NULL DEFAULT 'ROUTINE',
    "serviceDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "odometer" INTEGER,
    "cost" DECIMAL(12,2),
    "vendor" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NemtVehicleMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NemtIncident" (
    "id" TEXT NOT NULL,
    "tripId" TEXT,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "type" "NemtIncidentType" NOT NULL,
    "status" "NemtIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reportedBy" TEXT,
    "resolutionNotes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NemtIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverScore" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "onTimePercentage" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "customerComplaints" INTEGER NOT NULL DEFAULT 0,
    "attendancePercentage" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "noShowResponsibility" INTEGER NOT NULL DEFAULT 0,
    "rideCompletionRate" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "monthlyScore" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NemtInvoice_invoiceNumber_key" ON "NemtInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "NemtInvoice_status_createdAt_idx" ON "NemtInvoice"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NemtInvoice_broker_createdAt_idx" ON "NemtInvoice"("broker", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NemtInvoiceLine_invoiceId_tripId_key" ON "NemtInvoiceLine"("invoiceId", "tripId");

-- CreateIndex
CREATE INDEX "NemtInvoiceLine_tripId_idx" ON "NemtInvoiceLine"("tripId");

-- CreateIndex
CREATE INDEX "NemtDocument_driverId_type_idx" ON "NemtDocument"("driverId", "type");

-- CreateIndex
CREATE INDEX "NemtDocument_vehicleId_type_idx" ON "NemtDocument"("vehicleId", "type");

-- CreateIndex
CREATE INDEX "NemtDocument_tripId_type_idx" ON "NemtDocument"("tripId", "type");

-- CreateIndex
CREATE INDEX "NemtDocument_status_expiresAt_idx" ON "NemtDocument"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "NemtVehicleMaintenance_vehicleId_dueDate_idx" ON "NemtVehicleMaintenance"("vehicleId", "dueDate");

-- CreateIndex
CREATE INDEX "NemtVehicleMaintenance_serviceType_dueDate_idx" ON "NemtVehicleMaintenance"("serviceType", "dueDate");

-- CreateIndex
CREATE INDEX "NemtIncident_status_occurredAt_idx" ON "NemtIncident"("status", "occurredAt");

-- CreateIndex
CREATE INDEX "NemtIncident_type_occurredAt_idx" ON "NemtIncident"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "NemtIncident_driverId_occurredAt_idx" ON "NemtIncident"("driverId", "occurredAt");

-- CreateIndex
CREATE INDEX "NemtIncident_vehicleId_occurredAt_idx" ON "NemtIncident"("vehicleId", "occurredAt");

-- CreateIndex
CREATE INDEX "NemtIncident_tripId_idx" ON "NemtIncident"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverScore_driverId_month_key" ON "DriverScore"("driverId", "month");

-- CreateIndex
CREATE INDEX "DriverScore_month_idx" ON "DriverScore"("month");

-- CreateIndex
CREATE INDEX "DriverScore_monthlyScore_idx" ON "DriverScore"("monthlyScore");

-- AddForeignKey
ALTER TABLE "NemtInvoiceLine" ADD CONSTRAINT "NemtInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "NemtInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NemtInvoiceLine" ADD CONSTRAINT "NemtInvoiceLine_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NemtDocument" ADD CONSTRAINT "NemtDocument_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NemtDocument" ADD CONSTRAINT "NemtDocument_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NemtDocument" ADD CONSTRAINT "NemtDocument_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NemtVehicleMaintenance" ADD CONSTRAINT "NemtVehicleMaintenance_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NemtIncident" ADD CONSTRAINT "NemtIncident_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NemtIncident" ADD CONSTRAINT "NemtIncident_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NemtIncident" ADD CONSTRAINT "NemtIncident_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverScore" ADD CONSTRAINT "DriverScore_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
