import type { Express, Response } from 'express';
import {
  NemtBroker,
  NemtDocumentStatus,
  NemtDocumentType,
  NemtDriverStatus,
  NemtExternalSystem,
  NemtIncidentStatus,
  NemtIncidentType,
  NemtInvoiceStatus,
  NemtMaintenanceType,
  NemtTripStatus,
  NemtVehicleStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { z } from 'zod';
import { requireJobManager } from '../lib/access.js';
import { recordAuditLog } from '../lib/audit.js';
import { asyncRoute, type AuthenticatedRequest } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';

const optionFromLabels = <T extends string>(labels: Record<T, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

const driverStatusLabels: Record<NemtDriverStatus, string> = {
  [NemtDriverStatus.ACTIVE]: 'Active',
  [NemtDriverStatus.INACTIVE]: 'Inactive',
  [NemtDriverStatus.SUSPENDED]: 'Suspended',
  [NemtDriverStatus.ON_LEAVE]: 'On leave',
};

const vehicleStatusLabels: Record<NemtVehicleStatus, string> = {
  [NemtVehicleStatus.ACTIVE]: 'Active',
  [NemtVehicleStatus.INACTIVE]: 'Inactive',
  [NemtVehicleStatus.MAINTENANCE]: 'Maintenance',
  [NemtVehicleStatus.RETIRED]: 'Retired',
};

const tripStatusLabels: Record<NemtTripStatus, string> = {
  [NemtTripStatus.NEW]: 'New',
  [NemtTripStatus.PENDING_CONFIRMATION]: 'Pending confirmation',
  [NemtTripStatus.CONFIRMED]: 'Confirmed',
  [NemtTripStatus.ASSIGNED]: 'Assigned',
  [NemtTripStatus.IN_PROGRESS]: 'In progress',
  [NemtTripStatus.PROBLEM]: 'Problem trip',
  [NemtTripStatus.COMPLETED]: 'Completed',
  [NemtTripStatus.CANCELED]: 'Canceled',
  [NemtTripStatus.NO_SHOW]: 'No show',
};

const invoiceStatusLabels: Record<NemtInvoiceStatus, string> = {
  [NemtInvoiceStatus.DRAFT]: 'Draft',
  [NemtInvoiceStatus.SUBMITTED]: 'Submitted',
  [NemtInvoiceStatus.ACCEPTED]: 'Accepted',
  [NemtInvoiceStatus.REJECTED]: 'Rejected',
  [NemtInvoiceStatus.PAID]: 'Paid',
};

const incidentTypeLabels: Record<NemtIncidentType, string> = {
  [NemtIncidentType.COMPLAINT]: 'Complaint',
  [NemtIncidentType.ACCIDENT]: 'Accident',
  [NemtIncidentType.PASSENGER_ISSUE]: 'Passenger issue',
  [NemtIncidentType.INTERNAL_NOTE]: 'Internal note',
  [NemtIncidentType.OTHER]: 'Other',
};

const incidentStatusLabels: Record<NemtIncidentStatus, string> = {
  [NemtIncidentStatus.OPEN]: 'Open',
  [NemtIncidentStatus.IN_REVIEW]: 'In review',
  [NemtIncidentStatus.RESOLVED]: 'Resolved',
  [NemtIncidentStatus.CLOSED]: 'Closed',
};

const documentTypeLabels: Record<NemtDocumentType, string> = {
  [NemtDocumentType.DRIVER_LICENSE]: 'Driver license',
  [NemtDocumentType.CPR_CERTIFICATION]: 'CPR certification',
  [NemtDocumentType.INSURANCE]: 'Insurance',
  [NemtDocumentType.REGISTRATION]: 'Registration',
  [NemtDocumentType.VEHICLE_INSPECTION]: 'Vehicle inspection',
  [NemtDocumentType.TRIP_SIGNATURE]: 'Trip signature',
  [NemtDocumentType.TRIP_DOCUMENTATION]: 'Trip documentation',
  [NemtDocumentType.OTHER]: 'Other',
};

const documentStatusLabels: Record<NemtDocumentStatus, string> = {
  [NemtDocumentStatus.VALID]: 'Valid',
  [NemtDocumentStatus.EXPIRING_SOON]: 'Expiring soon',
  [NemtDocumentStatus.EXPIRED]: 'Expired',
  [NemtDocumentStatus.MISSING]: 'Missing',
};

const maintenanceTypeLabels: Record<NemtMaintenanceType, string> = {
  [NemtMaintenanceType.ROUTINE]: 'Routine',
  [NemtMaintenanceType.REPAIR]: 'Repair',
  [NemtMaintenanceType.INSPECTION]: 'Inspection',
  [NemtMaintenanceType.OTHER]: 'Other',
};

const dispatchColumnOrder = [
  NemtTripStatus.NEW,
  NemtTripStatus.PENDING_CONFIRMATION,
  NemtTripStatus.CONFIRMED,
  NemtTripStatus.ASSIGNED,
  NemtTripStatus.PROBLEM,
  NemtTripStatus.COMPLETED,
] as const;

const optionalString = z.string().trim().max(240).optional().or(z.literal(''));
const optionalLongString = z.string().trim().max(2000).optional().or(z.literal(''));
const optionalDate = z.string().trim().optional().or(z.literal(''));
const optionalMoney = z.coerce.number().min(0).optional();

const nullableDateFrom = (value: string | undefined) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date "${raw}".`);
  }
  return date;
};

const optionalDecimalFrom = (value: number | undefined) =>
  value == null ? undefined : new Prisma.Decimal(value);

const driverCreateSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  displayName: optionalString,
  phone: optionalString,
  email: optionalString,
  status: z.nativeEnum(NemtDriverStatus).default(NemtDriverStatus.ACTIVE),
  licenseNumber: optionalString,
  licenseState: optionalString,
  licenseExpiresAt: optionalDate,
  cprExpiresAt: optionalDate,
  hireDate: optionalDate,
  notes: optionalLongString,
});

const vehicleCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  status: z.nativeEnum(NemtVehicleStatus).default(NemtVehicleStatus.ACTIVE),
  vin: optionalString,
  plateNumber: optionalString,
  plateState: optionalString,
  make: optionalString,
  model: optionalString,
  year: z.coerce.number().int().min(1900).max(2200).optional().or(z.literal('')),
  capacityAmbulatory: z.coerce.number().int().min(0).default(0),
  capacityWheelchair: z.coerce.number().int().min(0).default(0),
  odometer: z.coerce.number().int().min(0).optional().or(z.literal('')),
  registrationExpiresAt: optionalDate,
  insuranceExpiresAt: optionalDate,
  inspectionDueAt: optionalDate,
  notes: optionalLongString,
});

const facilityCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  mtmFacilityId: optionalString,
  facilityType: optionalString,
  phone: optionalString,
  addressLine1: optionalString,
  addressLine2: optionalString,
  city: optionalString,
  state: optionalString,
  postalCode: optionalString,
  latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal('')),
  longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal('')),
  notes: optionalLongString,
  isActive: z.coerce.boolean().default(true),
});

const tripCreateSchema = z.object({
  tripNumber: optionalString,
  broker: z.nativeEnum(NemtBroker).default(NemtBroker.MTM),
  externalSource: z.nativeEnum(NemtExternalSystem).optional(),
  externalId: optionalString,
  passengerName: z.string().trim().min(1).max(160),
  passengerPhone: optionalString,
  memberId: optionalString,
  pickupFacilityId: optionalString,
  dropoffFacilityId: optionalString,
  pickupAddress: z.string().trim().min(1).max(240),
  dropoffAddress: z.string().trim().min(1).max(240),
  scheduledPickupAt: z.string().trim().min(1),
  appointmentAt: optionalDate,
  assignedDriverId: optionalString,
  vehicleId: optionalString,
  requiresWheelchair: z.coerce.boolean().default(false),
  requiresEscort: z.coerce.boolean().default(false),
  estimatedMileage: optionalMoney,
  fareAmount: z.coerce.number().min(0).default(0),
  notes: optionalLongString,
});

const tripStatusSchema = z.object({
  status: z.nativeEnum(NemtTripStatus),
  cancellationReason: optionalLongString,
  noShowReason: optionalLongString,
});

const invoiceCreateSchema = z.object({
  invoiceNumber: optionalString,
  status: z.nativeEnum(NemtInvoiceStatus).default(NemtInvoiceStatus.DRAFT),
  broker: z.nativeEnum(NemtBroker).default(NemtBroker.MTM),
  tripIds: z.array(z.string().trim().min(1)).default([]),
  notes: optionalLongString,
});

const invoiceStatusSchema = z.object({
  status: z.nativeEnum(NemtInvoiceStatus),
  rejectionReason: optionalLongString,
});

const documentCreateSchema = z.object({
  driverId: optionalString,
  vehicleId: optionalString,
  tripId: optionalString,
  type: z.nativeEnum(NemtDocumentType),
  status: z.nativeEnum(NemtDocumentStatus).default(NemtDocumentStatus.VALID),
  title: z.string().trim().min(1).max(180),
  documentNumber: optionalString,
  fileUrl: optionalString,
  issuedAt: optionalDate,
  expiresAt: optionalDate,
  notes: optionalLongString,
});

const maintenanceCreateSchema = z.object({
  vehicleId: z.string().trim().min(1),
  serviceType: z.nativeEnum(NemtMaintenanceType).default(NemtMaintenanceType.ROUTINE),
  serviceDate: optionalDate,
  dueDate: optionalDate,
  odometer: z.coerce.number().int().min(0).optional().or(z.literal('')),
  cost: optionalMoney,
  vendor: optionalString,
  notes: optionalLongString,
});

const incidentCreateSchema = z.object({
  tripId: optionalString,
  driverId: optionalString,
  vehicleId: optionalString,
  type: z.nativeEnum(NemtIncidentType),
  status: z.nativeEnum(NemtIncidentStatus).default(NemtIncidentStatus.OPEN),
  title: z.string().trim().min(1).max(180),
  description: optionalLongString,
  reportedBy: optionalString,
  occurredAt: optionalDate,
  resolutionNotes: optionalLongString,
});

const incidentStatusSchema = z.object({
  status: z.nativeEnum(NemtIncidentStatus),
  resolutionNotes: optionalLongString,
});

const driverScoreSchema = z.object({
  driverId: z.string().trim().min(1),
  month: z.string().trim().min(1),
  onTimePercentage: z.coerce.number().min(0).max(100),
  customerComplaints: z.coerce.number().int().min(0).default(0),
  attendancePercentage: z.coerce.number().min(0).max(100),
  noShowResponsibility: z.coerce.number().int().min(0).default(0),
  rideCompletionRate: z.coerce.number().min(0).max(100),
  monthlyScore: z.coerce.number().min(0).max(100),
  notes: optionalLongString,
});

const canManageNemt = (request: AuthenticatedRequest, response: Response) =>
  requireJobManager(request, response, 'You do not have permission to manage NEMT operations.');

const stringOrNull = (value: string | null | undefined) => {
  const raw = String(value ?? '').trim();
  return raw || null;
};

const numberOrNull = (value: number | string | null | undefined) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const serializeDriver = (driver: {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  status: NemtDriverStatus;
  licenseExpiresAt: Date | null;
  cprExpiresAt: Date | null;
  trips?: Array<{ id: string; status: NemtTripStatus }>;
}) => ({
  id: driver.id,
  firstName: driver.firstName,
  lastName: driver.lastName,
  displayName: driver.displayName,
  phone: driver.phone,
  email: driver.email,
  status: driver.status,
  statusLabel: driverStatusLabels[driver.status],
  licenseExpiresAt: driver.licenseExpiresAt?.toISOString() ?? null,
  cprExpiresAt: driver.cprExpiresAt?.toISOString() ?? null,
  activeTripCount: driver.trips?.filter((trip) => !['COMPLETED', 'CANCELED', 'NO_SHOW'].includes(trip.status)).length ?? 0,
});

const serializeVehicle = (vehicle: {
  id: string;
  name: string;
  status: NemtVehicleStatus;
  plateNumber: string | null;
  plateState: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  capacityAmbulatory: number;
  capacityWheelchair: number;
  odometer: number | null;
  registrationExpiresAt: Date | null;
  insuranceExpiresAt: Date | null;
  inspectionDueAt: Date | null;
}) => ({
  ...vehicle,
  statusLabel: vehicleStatusLabels[vehicle.status],
  registrationExpiresAt: vehicle.registrationExpiresAt?.toISOString() ?? null,
  insuranceExpiresAt: vehicle.insuranceExpiresAt?.toISOString() ?? null,
  inspectionDueAt: vehicle.inspectionDueAt?.toISOString() ?? null,
});

const serializeFacility = (facility: {
  id: string;
  name: string;
  mtmFacilityId: string | null;
  facilityType: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  isActive: boolean;
}) => facility;

const serializeTrip = (trip: {
  id: string;
  tripNumber: string | null;
  broker: NemtBroker;
  status: NemtTripStatus;
  passengerName: string;
  passengerPhone: string | null;
  memberId: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledPickupAt: Date;
  appointmentAt: Date | null;
  assignedDriver: { id: string; displayName: string; status: NemtDriverStatus } | null;
  vehicle: { id: string; name: string; status: NemtVehicleStatus } | null;
  pickupFacility: { id: string; name: string } | null;
  dropoffFacility: { id: string; name: string } | null;
  requiresWheelchair: boolean;
  requiresEscort: boolean;
  estimatedMileage: Prisma.Decimal | null;
  actualMileage: Prisma.Decimal | null;
  billableMileage: Prisma.Decimal | null;
  fareAmount: Prisma.Decimal;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: trip.id,
  tripNumber: trip.tripNumber,
  broker: trip.broker,
  status: trip.status,
  statusLabel: tripStatusLabels[trip.status],
  passengerName: trip.passengerName,
  passengerPhone: trip.passengerPhone,
  memberId: trip.memberId,
  pickupAddress: trip.pickupAddress,
  dropoffAddress: trip.dropoffAddress,
  scheduledPickupAt: trip.scheduledPickupAt.toISOString(),
  appointmentAt: trip.appointmentAt?.toISOString() ?? null,
  assignedDriver: trip.assignedDriver,
  vehicle: trip.vehicle,
  pickupFacility: trip.pickupFacility,
  dropoffFacility: trip.dropoffFacility,
  requiresWheelchair: trip.requiresWheelchair,
  requiresEscort: trip.requiresEscort,
  estimatedMileage: trip.estimatedMileage?.toNumber() ?? null,
  actualMileage: trip.actualMileage?.toNumber() ?? null,
  billableMileage: trip.billableMileage?.toNumber() ?? null,
  fareAmount: trip.fareAmount.toNumber(),
  notes: trip.notes,
  createdAt: trip.createdAt.toISOString(),
  updatedAt: trip.updatedAt.toISOString(),
});

const serializeInvoice = (invoice: {
  id: string;
  invoiceNumber: string | null;
  status: NemtInvoiceStatus;
  broker: NemtBroker;
  totalAmount: Prisma.Decimal;
  submittedAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  paidAt: Date | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  lineItems?: Array<{
    id: string;
    amount: Prisma.Decimal;
    mileage: Prisma.Decimal | null;
    trip: {
      id: string;
      tripNumber: string | null;
      passengerName: string;
      scheduledPickupAt: Date;
    };
  }>;
}) => ({
  id: invoice.id,
  invoiceNumber: invoice.invoiceNumber,
  status: invoice.status,
  statusLabel: invoiceStatusLabels[invoice.status],
  broker: invoice.broker,
  totalAmount: invoice.totalAmount.toNumber(),
  submittedAt: invoice.submittedAt?.toISOString() ?? null,
  acceptedAt: invoice.acceptedAt?.toISOString() ?? null,
  rejectedAt: invoice.rejectedAt?.toISOString() ?? null,
  paidAt: invoice.paidAt?.toISOString() ?? null,
  rejectionReason: invoice.rejectionReason,
  notes: invoice.notes,
  createdAt: invoice.createdAt.toISOString(),
  updatedAt: invoice.updatedAt.toISOString(),
  lineItems:
    invoice.lineItems?.map((lineItem) => ({
      id: lineItem.id,
      amount: lineItem.amount.toNumber(),
      mileage: lineItem.mileage?.toNumber() ?? null,
      trip: {
        id: lineItem.trip.id,
        tripNumber: lineItem.trip.tripNumber,
        passengerName: lineItem.trip.passengerName,
        scheduledPickupAt: lineItem.trip.scheduledPickupAt.toISOString(),
      },
    })) ?? [],
});

const serializeDocument = (document: {
  id: string;
  driverId: string | null;
  vehicleId: string | null;
  tripId: string | null;
  type: NemtDocumentType;
  status: NemtDocumentStatus;
  title: string;
  documentNumber: string | null;
  fileUrl: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  driver?: { id: string; displayName: string } | null;
  vehicle?: { id: string; name: string } | null;
  trip?: { id: string; tripNumber: string | null; passengerName: string } | null;
}) => ({
  id: document.id,
  driverId: document.driverId,
  vehicleId: document.vehicleId,
  tripId: document.tripId,
  type: document.type,
  typeLabel: documentTypeLabels[document.type],
  status: document.status,
  statusLabel: documentStatusLabels[document.status],
  title: document.title,
  documentNumber: document.documentNumber,
  fileUrl: document.fileUrl,
  issuedAt: document.issuedAt?.toISOString() ?? null,
  expiresAt: document.expiresAt?.toISOString() ?? null,
  notes: document.notes,
  driver: document.driver ?? null,
  vehicle: document.vehicle ?? null,
  trip: document.trip ?? null,
  createdAt: document.createdAt.toISOString(),
  updatedAt: document.updatedAt.toISOString(),
});

const serializeMaintenance = (maintenance: {
  id: string;
  vehicleId: string;
  serviceType: NemtMaintenanceType;
  serviceDate: Date | null;
  dueDate: Date | null;
  odometer: number | null;
  cost: Prisma.Decimal | null;
  vendor: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  vehicle?: { id: string; name: string } | null;
}) => ({
  id: maintenance.id,
  vehicleId: maintenance.vehicleId,
  serviceType: maintenance.serviceType,
  serviceTypeLabel: maintenanceTypeLabels[maintenance.serviceType],
  serviceDate: maintenance.serviceDate?.toISOString() ?? null,
  dueDate: maintenance.dueDate?.toISOString() ?? null,
  odometer: maintenance.odometer,
  cost: maintenance.cost?.toNumber() ?? null,
  vendor: maintenance.vendor,
  notes: maintenance.notes,
  vehicle: maintenance.vehicle ?? null,
  createdAt: maintenance.createdAt.toISOString(),
  updatedAt: maintenance.updatedAt.toISOString(),
});

const serializeIncident = (incident: {
  id: string;
  tripId: string | null;
  driverId: string | null;
  vehicleId: string | null;
  type: NemtIncidentType;
  status: NemtIncidentStatus;
  title: string;
  description: string | null;
  reportedBy: string | null;
  resolutionNotes: string | null;
  occurredAt: Date;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  trip?: { id: string; tripNumber: string | null; passengerName: string } | null;
  driver?: { id: string; displayName: string } | null;
  vehicle?: { id: string; name: string } | null;
}) => ({
  id: incident.id,
  tripId: incident.tripId,
  driverId: incident.driverId,
  vehicleId: incident.vehicleId,
  type: incident.type,
  typeLabel: incidentTypeLabels[incident.type],
  status: incident.status,
  statusLabel: incidentStatusLabels[incident.status],
  title: incident.title,
  description: incident.description,
  reportedBy: incident.reportedBy,
  resolutionNotes: incident.resolutionNotes,
  occurredAt: incident.occurredAt.toISOString(),
  resolvedAt: incident.resolvedAt?.toISOString() ?? null,
  trip: incident.trip ?? null,
  driver: incident.driver ?? null,
  vehicle: incident.vehicle ?? null,
  createdAt: incident.createdAt.toISOString(),
  updatedAt: incident.updatedAt.toISOString(),
});

const serializeDriverScore = (score: {
  id: string;
  driverId: string;
  month: Date;
  onTimePercentage: Prisma.Decimal;
  customerComplaints: number;
  attendancePercentage: Prisma.Decimal;
  noShowResponsibility: number;
  rideCompletionRate: Prisma.Decimal;
  monthlyScore: Prisma.Decimal;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  driver?: { id: string; displayName: string } | null;
}) => ({
  id: score.id,
  driverId: score.driverId,
  month: score.month.toISOString(),
  onTimePercentage: score.onTimePercentage.toNumber(),
  customerComplaints: score.customerComplaints,
  attendancePercentage: score.attendancePercentage.toNumber(),
  noShowResponsibility: score.noShowResponsibility,
  rideCompletionRate: score.rideCompletionRate.toNumber(),
  monthlyScore: score.monthlyScore.toNumber(),
  notes: score.notes,
  driver: score.driver ?? null,
  createdAt: score.createdAt.toISOString(),
  updatedAt: score.updatedAt.toISOString(),
});

const driverScopeFor = async (request: AuthenticatedRequest): Promise<Prisma.TripWhereInput> => {
  const auth = request.auth;
  if (!auth || auth.role !== UserRole.WORKER) return {};
  if (!auth.workerId) return { id: '__no-trip__' };

  const driver = await prisma.driver.findUnique({
    where: { workerId: auth.workerId },
    select: { id: true },
  });

  return driver ? { assignedDriverId: driver.id } : { id: '__no-trip__' };
};

const buildSummary = async (where: Prisma.TripWhereInput) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const warningCutoff = new Date();
  warningCutoff.setDate(warningCutoff.getDate() + 30);

  const [
    tripsToday,
    activeDrivers,
    activeVehicles,
    upcomingPickups,
    delayedTrips,
    problemTrips,
    noShows,
    revenueToday,
    pendingInvoices,
    vehicleAlerts,
    driverComplianceAlerts,
    documentComplianceAlerts,
  ] = await Promise.all([
      prisma.trip.count({
        where: {
          ...where,
          scheduledPickupAt: { gte: todayStart, lt: tomorrowStart },
        },
      }),
      prisma.driver.count({ where: { status: NemtDriverStatus.ACTIVE } }),
      prisma.vehicle.count({ where: { status: NemtVehicleStatus.ACTIVE } }),
      prisma.trip.count({
        where: {
          ...where,
          status: { in: [NemtTripStatus.CONFIRMED, NemtTripStatus.ASSIGNED] },
          scheduledPickupAt: { gte: new Date() },
        },
      }),
      prisma.trip.count({
        where: {
          ...where,
          status: { in: [NemtTripStatus.NEW, NemtTripStatus.PENDING_CONFIRMATION, NemtTripStatus.CONFIRMED, NemtTripStatus.ASSIGNED] },
          scheduledPickupAt: { lt: new Date() },
        },
      }),
      prisma.trip.count({ where: { ...where, status: NemtTripStatus.PROBLEM } }),
      prisma.trip.count({ where: { ...where, status: NemtTripStatus.NO_SHOW } }),
      prisma.trip.aggregate({
        where: {
          ...where,
          status: NemtTripStatus.COMPLETED,
          scheduledPickupAt: { gte: todayStart, lt: tomorrowStart },
        },
        _sum: { fareAmount: true },
      }),
      prisma.nemtInvoice.count({
        where: { status: { in: [NemtInvoiceStatus.DRAFT, NemtInvoiceStatus.SUBMITTED, NemtInvoiceStatus.REJECTED] } },
      }),
      prisma.vehicle.count({
        where: {
          OR: [
            { status: NemtVehicleStatus.MAINTENANCE },
            { registrationExpiresAt: { lte: warningCutoff } },
            { insuranceExpiresAt: { lte: warningCutoff } },
            { inspectionDueAt: { lte: warningCutoff } },
          ],
        },
      }),
      prisma.driver.count({
        where: {
          OR: [
            { licenseExpiresAt: { lte: warningCutoff } },
            { cprExpiresAt: { lte: warningCutoff } },
          ],
        },
      }),
      prisma.nemtDocument.count({
        where: {
          OR: [
            { status: { in: [NemtDocumentStatus.EXPIRED, NemtDocumentStatus.EXPIRING_SOON, NemtDocumentStatus.MISSING] } },
            { expiresAt: { lte: warningCutoff } },
          ],
        },
      }),
    ]);

  return {
    tripsToday,
    activeDrivers,
    activeVehicles,
    upcomingPickups,
    delayedTrips,
    problemTrips,
    noShows,
    revenueToday: revenueToday._sum.fareAmount?.toNumber() ?? 0,
    pendingInvoices,
    vehicleAlerts,
    complianceAlerts: driverComplianceAlerts + vehicleAlerts + documentComplianceAlerts,
  };
};

const expirationSeverityFor = (value: Date | null) => {
  if (!value) return 'danger';
  const now = Date.now();
  const time = value.getTime();
  if (time < now) return 'danger';
  const daysAway = (time - now) / 86_400_000;
  return daysAway <= 14 ? 'warning' : 'info';
};

const complianceAlertFrom = ({
  id,
  label,
  entityType,
  entityName,
  dueAt,
  source,
}: {
  id: string;
  label: string;
  entityType: string;
  entityName: string;
  dueAt: Date | null;
  source: string;
}) => ({
  id,
  label,
  entityType,
  entityName,
  dueAt: dueAt?.toISOString() ?? null,
  severity: expirationSeverityFor(dueAt),
  source,
});

const buildComplianceAlerts = async () => {
  const warningCutoff = new Date();
  warningCutoff.setDate(warningCutoff.getDate() + 30);

  const [drivers, vehicles, documents, maintenance] = await Promise.all([
    prisma.driver.findMany({
      where: {
        OR: [{ licenseExpiresAt: { lte: warningCutoff } }, { cprExpiresAt: { lte: warningCutoff } }],
      },
      orderBy: { displayName: 'asc' },
      take: 80,
    }),
    prisma.vehicle.findMany({
      where: {
        OR: [
          { registrationExpiresAt: { lte: warningCutoff } },
          { insuranceExpiresAt: { lte: warningCutoff } },
          { inspectionDueAt: { lte: warningCutoff } },
          { status: NemtVehicleStatus.MAINTENANCE },
        ],
      },
      orderBy: { name: 'asc' },
      take: 80,
    }),
    prisma.nemtDocument.findMany({
      where: {
        OR: [
          { status: { in: [NemtDocumentStatus.EXPIRED, NemtDocumentStatus.EXPIRING_SOON, NemtDocumentStatus.MISSING] } },
          { expiresAt: { lte: warningCutoff } },
        ],
      },
      include: {
        driver: { select: { id: true, displayName: true } },
        vehicle: { select: { id: true, name: true } },
        trip: { select: { id: true, tripNumber: true, passengerName: true } },
      },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'desc' }],
      take: 80,
    }),
    prisma.nemtVehicleMaintenance.findMany({
      where: { dueDate: { lte: warningCutoff } },
      include: { vehicle: { select: { id: true, name: true } } },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 80,
    }),
  ]);

  const alerts = [
    ...drivers.flatMap((driver) => [
      ...(driver.licenseExpiresAt
        ? [
            complianceAlertFrom({
              id: `driver-license:${driver.id}`,
              label: 'Driver license expiration',
              entityType: 'Driver',
              entityName: driver.displayName,
              dueAt: driver.licenseExpiresAt,
              source: 'driver',
            }),
          ]
        : []),
      ...(driver.cprExpiresAt
        ? [
            complianceAlertFrom({
              id: `driver-cpr:${driver.id}`,
              label: 'CPR expiration',
              entityType: 'Driver',
              entityName: driver.displayName,
              dueAt: driver.cprExpiresAt,
              source: 'driver',
            }),
          ]
        : []),
    ]),
    ...vehicles.flatMap((vehicle) => [
      ...(vehicle.registrationExpiresAt
        ? [
            complianceAlertFrom({
              id: `vehicle-registration:${vehicle.id}`,
              label: 'Registration expiration',
              entityType: 'Vehicle',
              entityName: vehicle.name,
              dueAt: vehicle.registrationExpiresAt,
              source: 'vehicle',
            }),
          ]
        : []),
      ...(vehicle.insuranceExpiresAt
        ? [
            complianceAlertFrom({
              id: `vehicle-insurance:${vehicle.id}`,
              label: 'Insurance expiration',
              entityType: 'Vehicle',
              entityName: vehicle.name,
              dueAt: vehicle.insuranceExpiresAt,
              source: 'vehicle',
            }),
          ]
        : []),
      ...(vehicle.inspectionDueAt
        ? [
            complianceAlertFrom({
              id: `vehicle-inspection:${vehicle.id}`,
              label: 'Vehicle inspection due',
              entityType: 'Vehicle',
              entityName: vehicle.name,
              dueAt: vehicle.inspectionDueAt,
              source: 'vehicle',
            }),
          ]
        : []),
      ...(vehicle.status === NemtVehicleStatus.MAINTENANCE
        ? [
            complianceAlertFrom({
              id: `vehicle-maintenance:${vehicle.id}`,
              label: 'Vehicle in maintenance',
              entityType: 'Vehicle',
              entityName: vehicle.name,
              dueAt: null,
              source: 'vehicle',
            }),
          ]
        : []),
    ]),
    ...documents.map((document) =>
      complianceAlertFrom({
        id: `document:${document.id}`,
        label: documentTypeLabels[document.type],
        entityType: document.driver ? 'Driver' : document.vehicle ? 'Vehicle' : 'Trip',
        entityName:
          document.driver?.displayName ??
          document.vehicle?.name ??
          document.trip?.tripNumber ??
          document.trip?.passengerName ??
          document.title,
        dueAt: document.expiresAt,
        source: 'document',
      }),
    ),
    ...maintenance.map((item) =>
      complianceAlertFrom({
        id: `maintenance:${item.id}`,
        label: maintenanceTypeLabels[item.serviceType],
        entityType: 'Vehicle',
        entityName: item.vehicle.name,
        dueAt: item.dueDate,
        source: 'maintenance',
      }),
    ),
  ];

  return alerts
    .sort((left, right) => {
      if (!left.dueAt && !right.dueAt) return 0;
      if (!left.dueAt) return -1;
      if (!right.dueAt) return 1;
      return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
    })
    .slice(0, 80);
};

const buildInvoiceValidations = async (where: Prisma.TripWhereInput) => {
  const trips = await prisma.trip.findMany({
    where: { ...where, status: NemtTripStatus.COMPLETED },
    orderBy: { scheduledPickupAt: 'desc' },
    take: 250,
    select: {
      id: true,
      tripNumber: true,
      passengerName: true,
      memberId: true,
      scheduledPickupAt: true,
      estimatedMileage: true,
      actualMileage: true,
      billableMileage: true,
      documents: { select: { type: true } },
    },
  });

  const toTripLabel = (trip: (typeof trips)[number]) => ({
    id: trip.id,
    label: trip.tripNumber ?? trip.passengerName,
    passengerName: trip.passengerName,
    scheduledPickupAt: trip.scheduledPickupAt.toISOString(),
  });

  const duplicateGroups = new Map<string, typeof trips>();
  trips.forEach((trip) => {
    const key = `${trip.memberId ?? trip.passengerName.toLowerCase()}|${trip.scheduledPickupAt.toISOString()}`;
    duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), trip]);
  });

  const validations = [
    {
      type: 'MISSING_MILEAGE',
      label: 'Missing mileage',
      count: trips.filter((trip) => !trip.estimatedMileage && !trip.actualMileage && !trip.billableMileage).length,
      items: trips
        .filter((trip) => !trip.estimatedMileage && !trip.actualMileage && !trip.billableMileage)
        .slice(0, 10)
        .map(toTripLabel),
    },
    {
      type: 'MISSING_SIGNATURE',
      label: 'Missing signature',
      count: trips.filter((trip) => !trip.documents.some((document) => document.type === NemtDocumentType.TRIP_SIGNATURE)).length,
      items: trips
        .filter((trip) => !trip.documents.some((document) => document.type === NemtDocumentType.TRIP_SIGNATURE))
        .slice(0, 10)
        .map(toTripLabel),
    },
    {
      type: 'MISSING_DOCUMENTATION',
      label: 'Missing documentation',
      count: trips.filter((trip) => !trip.documents.some((document) => document.type === NemtDocumentType.TRIP_DOCUMENTATION)).length,
      items: trips
        .filter((trip) => !trip.documents.some((document) => document.type === NemtDocumentType.TRIP_DOCUMENTATION))
        .slice(0, 10)
        .map(toTripLabel),
    },
    {
      type: 'DUPLICATE_TRIP_DETECTION',
      label: 'Duplicate trip detection',
      count: [...duplicateGroups.values()].filter((group) => group.length > 1).length,
      items: [...duplicateGroups.values()]
        .filter((group) => group.length > 1)
        .flatMap((group) => group.map(toTripLabel))
        .slice(0, 10),
    },
  ];

  return validations;
};

const buildAnalytics = async (where: Prisma.TripWhereInput) => {
  const trips = await prisma.trip.findMany({
    where,
    take: 5000,
    select: {
      status: true,
      broker: true,
      fareAmount: true,
      assignedDriver: { select: { id: true, displayName: true } },
      vehicle: { select: { id: true, name: true } },
      pickupFacility: { select: { id: true, name: true } },
    },
  });

  const aggregateBy = <T extends { id: string; name: string } | null>(
    pick: (trip: (typeof trips)[number]) => T,
  ) => {
    const rows = new Map<string, { id: string; label: string; revenue: number; tripCount: number }>();
    trips
      .filter((trip) => trip.status === NemtTripStatus.COMPLETED)
      .forEach((trip) => {
        const entity = pick(trip);
        if (!entity) return;
        const current = rows.get(entity.id) ?? { id: entity.id, label: entity.name, revenue: 0, tripCount: 0 };
        current.revenue += trip.fareAmount.toNumber();
        current.tripCount += 1;
        rows.set(entity.id, current);
      });
    return [...rows.values()].sort((left, right) => right.revenue - left.revenue).slice(0, 10);
  };

  const totalTrips = trips.length;
  const canceledTrips = trips.filter((trip) => trip.status === NemtTripStatus.CANCELED || trip.status === NemtTripStatus.NO_SHOW).length;
  const mtmTrips = trips.filter((trip) => trip.broker === NemtBroker.MTM);
  const mtmCompleted = mtmTrips.filter((trip) => trip.status === NemtTripStatus.COMPLETED).length;
  const mtmProblem = mtmTrips.filter((trip) => trip.status === NemtTripStatus.PROBLEM).length;
  const mtmNoShows = mtmTrips.filter((trip) => trip.status === NemtTripStatus.NO_SHOW).length;

  return {
    revenueByDriver: aggregateBy((trip) =>
      trip.assignedDriver ? { id: trip.assignedDriver.id, name: trip.assignedDriver.displayName } : null,
    ),
    revenueByVehicle: aggregateBy((trip) =>
      trip.vehicle ? { id: trip.vehicle.id, name: trip.vehicle.name } : null,
    ),
    revenueByFacility: aggregateBy((trip) =>
      trip.pickupFacility ? { id: trip.pickupFacility.id, name: trip.pickupFacility.name } : null,
    ),
    cancellationRate: totalTrips ? (canceledTrips / totalTrips) * 100 : 0,
    mtmPerformance: {
      totalTrips: mtmTrips.length,
      completedTrips: mtmCompleted,
      problemTrips: mtmProblem,
      noShows: mtmNoShows,
      completionRate: mtmTrips.length ? (mtmCompleted / mtmTrips.length) * 100 : 0,
    },
  };
};

export const registerNemtRoutes = (app: Express) => {
  app.get(
    '/api/nemt/operations',
    asyncRoute(async (request, response) => {
      const tripWhere = await driverScopeFor(request as AuthenticatedRequest);
      const [
        summary,
        trips,
        drivers,
        vehicles,
        facilities,
        invoices,
        documents,
        maintenance,
        incidents,
        driverScores,
        complianceAlerts,
        invoiceValidations,
        analytics,
      ] = await Promise.all([
        buildSummary(tripWhere),
        prisma.trip.findMany({
          where: tripWhere,
          orderBy: [{ scheduledPickupAt: 'asc' }, { createdAt: 'desc' }],
          take: 80,
          include: {
            assignedDriver: { select: { id: true, displayName: true, status: true } },
            vehicle: { select: { id: true, name: true, status: true } },
            pickupFacility: { select: { id: true, name: true } },
            dropoffFacility: { select: { id: true, name: true } },
          },
        }),
        prisma.driver.findMany({
          orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
          include: {
            trips: {
              select: { id: true, status: true },
              where: { status: { notIn: [NemtTripStatus.COMPLETED, NemtTripStatus.CANCELED, NemtTripStatus.NO_SHOW] } },
            },
          },
        }),
        prisma.vehicle.findMany({ orderBy: [{ status: 'asc' }, { name: 'asc' }] }),
        prisma.facility.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, take: 100 }),
        prisma.nemtInvoice.findMany({
          orderBy: [{ createdAt: 'desc' }],
          take: 80,
          include: {
            lineItems: {
              include: {
                trip: {
                  select: {
                    id: true,
                    tripNumber: true,
                    passengerName: true,
                    scheduledPickupAt: true,
                  },
                },
              },
            },
          },
        }),
        prisma.nemtDocument.findMany({
          orderBy: [{ expiresAt: 'asc' }, { createdAt: 'desc' }],
          take: 100,
          include: {
            driver: { select: { id: true, displayName: true } },
            vehicle: { select: { id: true, name: true } },
            trip: { select: { id: true, tripNumber: true, passengerName: true } },
          },
        }),
        prisma.nemtVehicleMaintenance.findMany({
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
          take: 80,
          include: { vehicle: { select: { id: true, name: true } } },
        }),
        prisma.nemtIncident.findMany({
          orderBy: [{ occurredAt: 'desc' }],
          take: 80,
          include: {
            trip: { select: { id: true, tripNumber: true, passengerName: true } },
            driver: { select: { id: true, displayName: true } },
            vehicle: { select: { id: true, name: true } },
          },
        }),
        prisma.driverScore.findMany({
          orderBy: [{ month: 'desc' }, { monthlyScore: 'asc' }],
          take: 80,
          include: { driver: { select: { id: true, displayName: true } } },
        }),
        buildComplianceAlerts(),
        buildInvoiceValidations(tripWhere),
        buildAnalytics(tripWhere),
      ]);

      response.json({
        summary,
        trips: trips.map(serializeTrip),
        drivers: drivers.map(serializeDriver),
        vehicles: vehicles.map(serializeVehicle),
        facilities: facilities.map(serializeFacility),
        invoices: invoices.map(serializeInvoice),
        documents: documents.map(serializeDocument),
        maintenance: maintenance.map(serializeMaintenance),
        incidents: incidents.map(serializeIncident),
        driverScores: driverScores.map(serializeDriverScore),
        complianceAlerts,
        invoiceValidations,
        analytics,
        options: {
          driverStatuses: optionFromLabels(driverStatusLabels),
          vehicleStatuses: optionFromLabels(vehicleStatusLabels),
          tripStatuses: optionFromLabels(tripStatusLabels),
          invoiceStatuses: optionFromLabels(invoiceStatusLabels),
          incidentTypes: optionFromLabels(incidentTypeLabels),
          incidentStatuses: optionFromLabels(incidentStatusLabels),
          documentTypes: optionFromLabels(documentTypeLabels),
          documentStatuses: optionFromLabels(documentStatusLabels),
          maintenanceTypes: optionFromLabels(maintenanceTypeLabels),
          dispatchColumns: dispatchColumnOrder.map((status) => ({
            value: status,
            label: tripStatusLabels[status],
          })),
        },
      });
    }),
  );

  app.post(
    '/api/nemt/drivers',
    asyncRoute(async (request, response) => {
      if (!canManageNemt(request as AuthenticatedRequest, response)) return;

      const payload = driverCreateSchema.parse(request.body);
      const displayName =
        stringOrNull(payload.displayName) ?? `${payload.firstName} ${payload.lastName}`.trim();
      const driver = await prisma.driver.create({
        data: {
          firstName: payload.firstName,
          lastName: payload.lastName,
          displayName,
          phone: stringOrNull(payload.phone),
          email: stringOrNull(payload.email),
          status: payload.status,
          licenseNumber: stringOrNull(payload.licenseNumber),
          licenseState: stringOrNull(payload.licenseState),
          licenseExpiresAt: nullableDateFrom(payload.licenseExpiresAt),
          cprExpiresAt: nullableDateFrom(payload.cprExpiresAt),
          hireDate: nullableDateFrom(payload.hireDate),
          notes: stringOrNull(payload.notes),
        },
      });

      await recordAuditLog(prisma, request, {
        entityType: 'NEMT Driver',
        entityId: driver.id,
        entityLabel: driver.displayName,
        action: 'Created',
        summary: `Created NEMT driver "${driver.displayName}".`,
      });

      response.status(201).json(serializeDriver(driver));
    }),
  );

  app.post(
    '/api/nemt/vehicles',
    asyncRoute(async (request, response) => {
      if (!canManageNemt(request as AuthenticatedRequest, response)) return;

      const payload = vehicleCreateSchema.parse(request.body);
      const vehicle = await prisma.vehicle.create({
        data: {
          name: payload.name,
          status: payload.status,
          vin: stringOrNull(payload.vin),
          plateNumber: stringOrNull(payload.plateNumber),
          plateState: stringOrNull(payload.plateState),
          make: stringOrNull(payload.make),
          model: stringOrNull(payload.model),
          year: numberOrNull(payload.year),
          capacityAmbulatory: payload.capacityAmbulatory,
          capacityWheelchair: payload.capacityWheelchair,
          odometer: numberOrNull(payload.odometer),
          registrationExpiresAt: nullableDateFrom(payload.registrationExpiresAt),
          insuranceExpiresAt: nullableDateFrom(payload.insuranceExpiresAt),
          inspectionDueAt: nullableDateFrom(payload.inspectionDueAt),
          notes: stringOrNull(payload.notes),
        },
      });

      await recordAuditLog(prisma, request, {
        entityType: 'NEMT Vehicle',
        entityId: vehicle.id,
        entityLabel: vehicle.name,
        action: 'Created',
        summary: `Created NEMT vehicle "${vehicle.name}".`,
      });

      response.status(201).json(serializeVehicle(vehicle));
    }),
  );

  app.post(
    '/api/nemt/facilities',
    asyncRoute(async (request, response) => {
      if (!canManageNemt(request as AuthenticatedRequest, response)) return;

      const payload = facilityCreateSchema.parse(request.body);
      const facility = await prisma.facility.create({
        data: {
          name: payload.name,
          mtmFacilityId: stringOrNull(payload.mtmFacilityId),
          facilityType: stringOrNull(payload.facilityType),
          phone: stringOrNull(payload.phone),
          addressLine1: stringOrNull(payload.addressLine1),
          addressLine2: stringOrNull(payload.addressLine2),
          city: stringOrNull(payload.city),
          state: stringOrNull(payload.state),
          postalCode: stringOrNull(payload.postalCode),
          latitude: optionalDecimalFrom(numberOrNull(payload.latitude) ?? undefined),
          longitude: optionalDecimalFrom(numberOrNull(payload.longitude) ?? undefined),
          notes: stringOrNull(payload.notes),
          isActive: payload.isActive,
        },
      });

      await recordAuditLog(prisma, request, {
        entityType: 'NEMT Facility',
        entityId: facility.id,
        entityLabel: facility.name,
        action: 'Created',
        summary: `Created NEMT facility "${facility.name}".`,
      });

      response.status(201).json(serializeFacility(facility));
    }),
  );

  app.post(
    '/api/nemt/trips',
    asyncRoute(async (request, response) => {
      if (!canManageNemt(request as AuthenticatedRequest, response)) return;

      const payload = tripCreateSchema.parse(request.body);
      const scheduledPickupAt = nullableDateFrom(payload.scheduledPickupAt);
      if (!scheduledPickupAt) {
        response.status(400).json({ message: 'Scheduled pickup time is required.' });
        return;
      }

      const trip = await prisma.$transaction(async (transaction) => {
        const createdTrip = await transaction.trip.create({
          data: {
            tripNumber: stringOrNull(payload.tripNumber),
            broker: payload.broker,
            passengerName: payload.passengerName,
            passengerPhone: stringOrNull(payload.passengerPhone),
            memberId: stringOrNull(payload.memberId),
            pickupFacilityId: stringOrNull(payload.pickupFacilityId),
            dropoffFacilityId: stringOrNull(payload.dropoffFacilityId),
            pickupAddress: payload.pickupAddress,
            dropoffAddress: payload.dropoffAddress,
            scheduledPickupAt,
            appointmentAt: nullableDateFrom(payload.appointmentAt),
            assignedDriverId: stringOrNull(payload.assignedDriverId),
            vehicleId: stringOrNull(payload.vehicleId),
            requiresWheelchair: payload.requiresWheelchair,
            requiresEscort: payload.requiresEscort,
            estimatedMileage: optionalDecimalFrom(payload.estimatedMileage),
            fareAmount: new Prisma.Decimal(payload.fareAmount),
            notes: stringOrNull(payload.notes),
            status: payload.assignedDriverId ? NemtTripStatus.ASSIGNED : NemtTripStatus.NEW,
          },
        });

        const externalId = stringOrNull(payload.externalId);
        if (externalId) {
          await transaction.externalTripReference.create({
            data: {
              tripId: createdTrip.id,
              source: payload.externalSource ?? NemtExternalSystem.MANUAL,
              externalId,
              importedAt: new Date(),
            },
          });
        }

        return createdTrip;
      });

      const hydratedTrip = await prisma.trip.findUniqueOrThrow({
        where: { id: trip.id },
        include: {
          assignedDriver: { select: { id: true, displayName: true, status: true } },
          vehicle: { select: { id: true, name: true, status: true } },
          pickupFacility: { select: { id: true, name: true } },
          dropoffFacility: { select: { id: true, name: true } },
        },
      });

      await recordAuditLog(prisma, request, {
        entityType: 'NEMT Trip',
        entityId: hydratedTrip.id,
        entityLabel: hydratedTrip.tripNumber ?? hydratedTrip.passengerName,
        action: 'Created',
        summary: `Created NEMT trip for "${hydratedTrip.passengerName}".`,
        metadata: {
          status: hydratedTrip.status,
          broker: hydratedTrip.broker,
        },
      });

      response.status(201).json(serializeTrip(hydratedTrip));
    }),
  );

  app.patch(
    '/api/nemt/trips/:tripId/status',
    asyncRoute(async (request, response) => {
      if (!canManageNemt(request as AuthenticatedRequest, response)) return;

      const tripId = String(request.params.tripId);
      const payload = tripStatusSchema.parse(request.body);
      const statusDate =
        payload.status === NemtTripStatus.COMPLETED
          ? { actualDropoffAt: new Date() }
          : payload.status === NemtTripStatus.IN_PROGRESS
            ? { actualPickupAt: new Date() }
            : {};

      const trip = await prisma.trip.update({
        where: { id: tripId },
        data: {
          status: payload.status,
          ...statusDate,
          cancellationReason: stringOrNull(payload.cancellationReason),
          noShowReason: stringOrNull(payload.noShowReason),
        },
        include: {
          assignedDriver: { select: { id: true, displayName: true, status: true } },
          vehicle: { select: { id: true, name: true, status: true } },
          pickupFacility: { select: { id: true, name: true } },
          dropoffFacility: { select: { id: true, name: true } },
        },
      });

      await recordAuditLog(prisma, request, {
        entityType: 'NEMT Trip',
        entityId: trip.id,
        entityLabel: trip.tripNumber ?? trip.passengerName,
        action: 'Updated status',
        summary: `Updated NEMT trip "${trip.tripNumber ?? trip.passengerName}" to ${tripStatusLabels[trip.status]}.`,
        metadata: {
          status: trip.status,
        },
      });

      response.json(serializeTrip(trip));
    }),
  );

  app.post(
    '/api/nemt/invoices',
    asyncRoute(async (request, response) => {
      if (!canManageNemt(request as AuthenticatedRequest, response)) return;

      const payload = invoiceCreateSchema.parse(request.body);
      const uniqueTripIds = [...new Set(payload.tripIds)];
      const trips = uniqueTripIds.length
        ? await prisma.trip.findMany({
            where: { id: { in: uniqueTripIds } },
            select: {
              id: true,
              fareAmount: true,
              estimatedMileage: true,
              actualMileage: true,
              billableMileage: true,
            },
          })
        : [];

      if (trips.length !== uniqueTripIds.length) {
        response.status(400).json({ message: 'One or more selected trips do not exist.' });
        return;
      }

      const totalAmount = trips.reduce((total, trip) => total + trip.fareAmount.toNumber(), 0);
      const invoice = await prisma.nemtInvoice.create({
        data: {
          invoiceNumber: stringOrNull(payload.invoiceNumber),
          status: payload.status,
          broker: payload.broker,
          totalAmount: new Prisma.Decimal(totalAmount),
          notes: stringOrNull(payload.notes),
          submittedAt: payload.status === NemtInvoiceStatus.SUBMITTED ? new Date() : null,
          lineItems: {
            create: trips.map((trip) => ({
              tripId: trip.id,
              amount: trip.fareAmount,
              mileage: trip.billableMileage ?? trip.actualMileage ?? trip.estimatedMileage,
            })),
          },
        },
        include: {
          lineItems: {
            include: {
              trip: {
                select: {
                  id: true,
                  tripNumber: true,
                  passengerName: true,
                  scheduledPickupAt: true,
                },
              },
            },
          },
        },
      });

      await recordAuditLog(prisma, request, {
        entityType: 'NEMT Invoice',
        entityId: invoice.id,
        entityLabel: invoice.invoiceNumber ?? invoice.id,
        action: 'Created',
        summary: `Created NEMT invoice "${invoice.invoiceNumber ?? invoice.id}".`,
        metadata: { status: invoice.status, tripCount: invoice.lineItems.length },
      });

      response.status(201).json(serializeInvoice(invoice));
    }),
  );

  app.patch(
    '/api/nemt/invoices/:invoiceId/status',
    asyncRoute(async (request, response) => {
      if (!canManageNemt(request as AuthenticatedRequest, response)) return;

      const invoiceId = String(request.params.invoiceId);
      const payload = invoiceStatusSchema.parse(request.body);
      const statusDates =
        payload.status === NemtInvoiceStatus.SUBMITTED
          ? { submittedAt: new Date() }
          : payload.status === NemtInvoiceStatus.ACCEPTED
            ? { acceptedAt: new Date() }
            : payload.status === NemtInvoiceStatus.REJECTED
              ? { rejectedAt: new Date() }
              : payload.status === NemtInvoiceStatus.PAID
                ? { paidAt: new Date() }
                : {};

      const invoice = await prisma.nemtInvoice.update({
        where: { id: invoiceId },
        data: {
          status: payload.status,
          ...statusDates,
          rejectionReason: stringOrNull(payload.rejectionReason),
        },
        include: {
          lineItems: {
            include: {
              trip: {
                select: {
                  id: true,
                  tripNumber: true,
                  passengerName: true,
                  scheduledPickupAt: true,
                },
              },
            },
          },
        },
      });

      await recordAuditLog(prisma, request, {
        entityType: 'NEMT Invoice',
        entityId: invoice.id,
        entityLabel: invoice.invoiceNumber ?? invoice.id,
        action: 'Updated status',
        summary: `Updated NEMT invoice "${invoice.invoiceNumber ?? invoice.id}" to ${invoiceStatusLabels[invoice.status]}.`,
        metadata: { status: invoice.status },
      });

      response.json(serializeInvoice(invoice));
    }),
  );

  app.post(
    '/api/nemt/documents',
    asyncRoute(async (request, response) => {
      if (!canManageNemt(request as AuthenticatedRequest, response)) return;

      const payload = documentCreateSchema.parse(request.body);
      const driverId = stringOrNull(payload.driverId);
      const vehicleId = stringOrNull(payload.vehicleId);
      const tripId = stringOrNull(payload.tripId);
      if (!driverId && !vehicleId && !tripId) {
        response.status(400).json({ message: 'Attach the document to a driver, vehicle or trip.' });
        return;
      }

      const document = await prisma.nemtDocument.create({
        data: {
          driverId,
          vehicleId,
          tripId,
          type: payload.type,
          status: payload.status,
          title: payload.title,
          documentNumber: stringOrNull(payload.documentNumber),
          fileUrl: stringOrNull(payload.fileUrl),
          issuedAt: nullableDateFrom(payload.issuedAt),
          expiresAt: nullableDateFrom(payload.expiresAt),
          notes: stringOrNull(payload.notes),
        },
        include: {
          driver: { select: { id: true, displayName: true } },
          vehicle: { select: { id: true, name: true } },
          trip: { select: { id: true, tripNumber: true, passengerName: true } },
        },
      });

      await recordAuditLog(prisma, request, {
        entityType: 'NEMT Document',
        entityId: document.id,
        entityLabel: document.title,
        action: 'Created',
        summary: `Created NEMT document "${document.title}".`,
      });

      response.status(201).json(serializeDocument(document));
    }),
  );

  app.post(
    '/api/nemt/maintenance',
    asyncRoute(async (request, response) => {
      if (!canManageNemt(request as AuthenticatedRequest, response)) return;

      const payload = maintenanceCreateSchema.parse(request.body);
      const maintenance = await prisma.nemtVehicleMaintenance.create({
        data: {
          vehicleId: payload.vehicleId,
          serviceType: payload.serviceType,
          serviceDate: nullableDateFrom(payload.serviceDate),
          dueDate: nullableDateFrom(payload.dueDate),
          odometer: numberOrNull(payload.odometer),
          cost: optionalDecimalFrom(payload.cost),
          vendor: stringOrNull(payload.vendor),
          notes: stringOrNull(payload.notes),
        },
        include: { vehicle: { select: { id: true, name: true } } },
      });

      await recordAuditLog(prisma, request, {
        entityType: 'NEMT Maintenance',
        entityId: maintenance.id,
        entityLabel: maintenance.vehicle.name,
        action: 'Created',
        summary: `Created ${maintenanceTypeLabels[maintenance.serviceType]} maintenance record for "${maintenance.vehicle.name}".`,
      });

      response.status(201).json(serializeMaintenance(maintenance));
    }),
  );

  app.post(
    '/api/nemt/incidents',
    asyncRoute(async (request, response) => {
      if (!canManageNemt(request as AuthenticatedRequest, response)) return;

      const payload = incidentCreateSchema.parse(request.body);
      const incident = await prisma.nemtIncident.create({
        data: {
          tripId: stringOrNull(payload.tripId),
          driverId: stringOrNull(payload.driverId),
          vehicleId: stringOrNull(payload.vehicleId),
          type: payload.type,
          status: payload.status,
          title: payload.title,
          description: stringOrNull(payload.description),
          reportedBy: stringOrNull(payload.reportedBy),
          occurredAt: nullableDateFrom(payload.occurredAt) ?? new Date(),
          resolutionNotes: stringOrNull(payload.resolutionNotes),
        },
        include: {
          trip: { select: { id: true, tripNumber: true, passengerName: true } },
          driver: { select: { id: true, displayName: true } },
          vehicle: { select: { id: true, name: true } },
        },
      });

      await recordAuditLog(prisma, request, {
        entityType: 'NEMT Incident',
        entityId: incident.id,
        entityLabel: incident.title,
        action: 'Created',
        summary: `Created NEMT incident "${incident.title}".`,
        metadata: { type: incident.type, status: incident.status },
      });

      response.status(201).json(serializeIncident(incident));
    }),
  );

  app.patch(
    '/api/nemt/incidents/:incidentId/status',
    asyncRoute(async (request, response) => {
      if (!canManageNemt(request as AuthenticatedRequest, response)) return;

      const incidentId = String(request.params.incidentId);
      const payload = incidentStatusSchema.parse(request.body);
      const incident = await prisma.nemtIncident.update({
        where: { id: incidentId },
        data: {
          status: payload.status,
          resolutionNotes: stringOrNull(payload.resolutionNotes),
          resolvedAt:
            payload.status === NemtIncidentStatus.RESOLVED || payload.status === NemtIncidentStatus.CLOSED
              ? new Date()
              : null,
        },
        include: {
          trip: { select: { id: true, tripNumber: true, passengerName: true } },
          driver: { select: { id: true, displayName: true } },
          vehicle: { select: { id: true, name: true } },
        },
      });

      await recordAuditLog(prisma, request, {
        entityType: 'NEMT Incident',
        entityId: incident.id,
        entityLabel: incident.title,
        action: 'Updated status',
        summary: `Updated NEMT incident "${incident.title}" to ${incidentStatusLabels[incident.status]}.`,
        metadata: { status: incident.status },
      });

      response.json(serializeIncident(incident));
    }),
  );

  app.post(
    '/api/nemt/driver-scores',
    asyncRoute(async (request, response) => {
      if (!canManageNemt(request as AuthenticatedRequest, response)) return;

      const payload = driverScoreSchema.parse(request.body);
      const month = nullableDateFrom(payload.month);
      if (!month) {
        response.status(400).json({ message: 'Score month is required.' });
        return;
      }
      month.setUTCDate(1);
      month.setUTCHours(0, 0, 0, 0);

      const score = await prisma.driverScore.upsert({
        where: { driverId_month: { driverId: payload.driverId, month } },
        create: {
          driverId: payload.driverId,
          month,
          onTimePercentage: new Prisma.Decimal(payload.onTimePercentage),
          customerComplaints: payload.customerComplaints,
          attendancePercentage: new Prisma.Decimal(payload.attendancePercentage),
          noShowResponsibility: payload.noShowResponsibility,
          rideCompletionRate: new Prisma.Decimal(payload.rideCompletionRate),
          monthlyScore: new Prisma.Decimal(payload.monthlyScore),
          notes: stringOrNull(payload.notes),
        },
        update: {
          onTimePercentage: new Prisma.Decimal(payload.onTimePercentage),
          customerComplaints: payload.customerComplaints,
          attendancePercentage: new Prisma.Decimal(payload.attendancePercentage),
          noShowResponsibility: payload.noShowResponsibility,
          rideCompletionRate: new Prisma.Decimal(payload.rideCompletionRate),
          monthlyScore: new Prisma.Decimal(payload.monthlyScore),
          notes: stringOrNull(payload.notes),
        },
        include: { driver: { select: { id: true, displayName: true } } },
      });

      await recordAuditLog(prisma, request, {
        entityType: 'NEMT Driver Score',
        entityId: score.id,
        entityLabel: score.driver.displayName,
        action: 'Saved',
        summary: `Saved NEMT monthly score for "${score.driver.displayName}".`,
        metadata: { month: score.month.toISOString(), monthlyScore: score.monthlyScore.toNumber() },
      });

      response.status(201).json(serializeDriverScore(score));
    }),
  );
};
