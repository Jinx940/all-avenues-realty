# NEMT Architecture Report

## Objective

Evolve the existing All Avenues system into an administrative and operational NEMT layer above RoutingBox/MTM, without replacing current property, job, worker, document, billing, auth, audit, and dashboard functionality.

## Reused System

- Existing React/Vite application shell, sidebar, lazy-loaded views, shared API client, formatting helpers, auth/session model, role tabs, audit logs, worker records, and Prisma/PostgreSQL stack.
- Existing `Worker` model is linked to the new `Driver` model through `Driver.workerId`, so field users can be scoped to assigned trips later.
- Existing document and audit patterns are preserved; new NEMT actions write audit logs instead of creating a separate audit system.

## Module Map

```text
NEMT Operations
  Dashboard
    trips today, active drivers, active vehicles, upcoming pickups, delayed trips,
    no-shows, revenue today, pending invoices, vehicle alerts, compliance alerts
  Dispatch
    New, Pending Confirmation, Confirmed, Assigned, Problem, Completed
  Trips
    MTM/manual trip intake, driver assignment, vehicle assignment, fare/mileage basics
  Drivers
    profile, active/inactive status, license/CPR expirations, trip history linkage
  Vehicles
    fleet record, plate/VIN fields, registration, insurance, inspection dates
  Facilities
    MTM facility id, type, address, phone
  Billing
    invoice statuses, invoice lines from trips, validation alerts
  Compliance
    driver documents, vehicle documents, trip documents, maintenance due dates
  Incidents
    complaints, accidents, passenger issues, internal notes, resolution tracking
  Driver Scores
    on-time, complaints, attendance, no-show responsibility, completion, monthly score
  Analytics
    revenue by driver, vehicle, facility, cancellation rate, MTM performance
```

## Folder Structure

```text
backend/
  prisma/schema.prisma
  prisma/migrations/
    20260602123000_add_nemt_core/
    20260602131000_add_nemt_admin_modules/
  src/routes/nemt.ts
frontend/
  src/components/NemtOperationsView.tsx
  src/lib/navigation.ts
  src/App.tsx
packages/domain/
  src/nemt.ts
```

## Data Model

Core tables:

- `Driver`
- `Vehicle`
- `Facility`
- `Trip`
- `ExternalTripReference`

Administrative tables:

- `NemtInvoice`
- `NemtInvoiceLine`
- `NemtDocument`
- `NemtVehicleMaintenance`
- `NemtIncident`
- `DriverScore`

Important relationships:

- `Worker` 1:1 optional `Driver`
- `Driver` 1:N `Trip`
- `Vehicle` 1:N `Trip`
- `Facility` 1:N pickup/dropoff `Trip`
- `Trip` 1:N external references, invoice lines, documents, incidents
- `Driver` 1:N documents, incidents, scores
- `Vehicle` 1:N documents, maintenance, incidents

## API Surface

Read:

- `GET /api/nemt/operations`

Write:

- `POST /api/nemt/drivers`
- `POST /api/nemt/vehicles`
- `POST /api/nemt/facilities`
- `POST /api/nemt/trips`
- `PATCH /api/nemt/trips/:tripId/status`
- `POST /api/nemt/invoices`
- `PATCH /api/nemt/invoices/:invoiceId/status`
- `POST /api/nemt/documents`
- `POST /api/nemt/maintenance`
- `POST /api/nemt/incidents`
- `PATCH /api/nemt/incidents/:incidentId/status`
- `POST /api/nemt/driver-scores`

## Roles

- `ADMIN`: full NEMT read/write.
- `OFFICE`: full NEMT read/write for dispatch, billing, compliance, incidents, and admin work.
- `WORKER`: NEMT tab visible; trip scope is prepared through linked driver/worker records.
- `VIEWER`: read-focused access through the NEMT tab.

## Business Impact

- Reduces manual dispatch tracking by centralizing trips, statuses, driver/vehicle assignment, and problem trips.
- Reduces billing errors through invoice validation alerts for missing mileage, missing signatures, missing documentation, and duplicate trip detection.
- Reduces compliance risk through expiration and maintenance alerts.
- Gives ownership a daily operational snapshot without replacing RoutingBox.

## Risks

- RoutingBox/MTM imports are not automated yet; current trip creation supports manual/admin entry and external references.
- Compliance document upload stores URLs/metadata; full file upload integration should reuse the existing managed-file storage pattern next.
- Driver score values are currently saved/admin-maintained; automated score calculation should be added once actual pickup/dropoff timestamps and incident classification rules are stable.

## Roadmap

1. Apply migrations to the production/staging PostgreSQL database.
2. Seed or import current drivers, vehicles, facilities, and today's MTM trips.
3. Add RoutingBox/MTM import adapter and duplicate reconciliation.
4. Add Google Maps routing/mileage calculation.
5. Add Twilio driver/passenger notifications.
6. Add invoice export/submission workflow.
7. Add automated driver score calculation from trips, incidents, no-shows, and attendance.
8. Add dedicated file upload controls for NEMT documents/signatures.
9. Add granular role permissions per module.
