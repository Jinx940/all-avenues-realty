import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { requestJson } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import type { AuthUser } from '../types';
import { UiIcon, type UiIconName } from './UiIcon';

type NemtOption = {
  value: string;
  label: string;
};

type NemtDriverRow = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  status: string;
  statusLabel: string;
  licenseExpiresAt: string | null;
  cprExpiresAt: string | null;
  activeTripCount: number;
};

type NemtVehicleRow = {
  id: string;
  name: string;
  status: string;
  statusLabel: string;
  plateNumber: string | null;
  plateState: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  capacityAmbulatory: number;
  capacityWheelchair: number;
  odometer: number | null;
  registrationExpiresAt: string | null;
  insuranceExpiresAt: string | null;
  inspectionDueAt: string | null;
};

type NemtFacilityRow = {
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
};

type NemtTripRow = {
  id: string;
  tripNumber: string | null;
  broker: string;
  status: string;
  statusLabel: string;
  passengerName: string;
  passengerPhone: string | null;
  memberId: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  scheduledPickupAt: string;
  appointmentAt: string | null;
  assignedDriver: { id: string; displayName: string; status: string } | null;
  vehicle: { id: string; name: string; status: string } | null;
  pickupFacility: { id: string; name: string } | null;
  dropoffFacility: { id: string; name: string } | null;
  requiresWheelchair: boolean;
  requiresEscort: boolean;
  estimatedMileage: number | null;
  actualMileage: number | null;
  billableMileage: number | null;
  fareAmount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type NemtInvoiceRow = {
  id: string;
  invoiceNumber: string | null;
  status: string;
  statusLabel: string;
  broker: string;
  totalAmount: number;
  submittedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  paidAt: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: Array<{
    id: string;
    amount: number;
    mileage: number | null;
    trip: {
      id: string;
      tripNumber: string | null;
      passengerName: string;
      scheduledPickupAt: string;
    };
  }>;
};

type NemtDocumentRow = {
  id: string;
  driverId: string | null;
  vehicleId: string | null;
  tripId: string | null;
  type: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  title: string;
  documentNumber: string | null;
  fileUrl: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  driver: { id: string; displayName: string } | null;
  vehicle: { id: string; name: string } | null;
  trip: { id: string; tripNumber: string | null; passengerName: string } | null;
  createdAt: string;
  updatedAt: string;
};

type NemtMaintenanceRow = {
  id: string;
  vehicleId: string;
  serviceType: string;
  serviceTypeLabel: string;
  serviceDate: string | null;
  dueDate: string | null;
  odometer: number | null;
  cost: number | null;
  vendor: string | null;
  notes: string | null;
  vehicle: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

type NemtIncidentRow = {
  id: string;
  tripId: string | null;
  driverId: string | null;
  vehicleId: string | null;
  type: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  title: string;
  description: string | null;
  reportedBy: string | null;
  resolutionNotes: string | null;
  occurredAt: string;
  resolvedAt: string | null;
  trip: { id: string; tripNumber: string | null; passengerName: string } | null;
  driver: { id: string; displayName: string } | null;
  vehicle: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

type NemtDriverScoreRow = {
  id: string;
  driverId: string;
  month: string;
  onTimePercentage: number;
  customerComplaints: number;
  attendancePercentage: number;
  noShowResponsibility: number;
  rideCompletionRate: number;
  monthlyScore: number;
  notes: string | null;
  driver: { id: string; displayName: string } | null;
  createdAt: string;
  updatedAt: string;
};

type NemtComplianceAlert = {
  id: string;
  label: string;
  entityType: string;
  entityName: string;
  dueAt: string | null;
  severity: 'danger' | 'warning' | 'info';
  source: string;
};

type NemtInvoiceValidation = {
  type: string;
  label: string;
  count: number;
  items: Array<{
    id: string;
    label: string;
    passengerName: string;
    scheduledPickupAt: string;
  }>;
};

type NemtAnalytics = {
  revenueByDriver: NemtAnalyticsRow[];
  revenueByVehicle: NemtAnalyticsRow[];
  revenueByFacility: NemtAnalyticsRow[];
  cancellationRate: number;
  mtmPerformance: {
    totalTrips: number;
    completedTrips: number;
    problemTrips: number;
    noShows: number;
    completionRate: number;
  };
};

type NemtAnalyticsRow = {
  id: string;
  label: string;
  revenue: number;
  tripCount: number;
};

type NemtOperationsPayload = {
  summary: {
    tripsToday: number;
    activeDrivers: number;
    activeVehicles: number;
    upcomingPickups: number;
    delayedTrips: number;
    problemTrips: number;
    noShows: number;
    revenueToday: number;
    pendingInvoices: number;
    vehicleAlerts: number;
    complianceAlerts: number;
  };
  trips: NemtTripRow[];
  drivers: NemtDriverRow[];
  vehicles: NemtVehicleRow[];
  facilities: NemtFacilityRow[];
  invoices: NemtInvoiceRow[];
  documents: NemtDocumentRow[];
  maintenance: NemtMaintenanceRow[];
  incidents: NemtIncidentRow[];
  driverScores: NemtDriverScoreRow[];
  complianceAlerts: NemtComplianceAlert[];
  invoiceValidations: NemtInvoiceValidation[];
  analytics: NemtAnalytics;
  options: {
    driverStatuses: NemtOption[];
    vehicleStatuses: NemtOption[];
    tripStatuses: NemtOption[];
    invoiceStatuses: NemtOption[];
    incidentTypes: NemtOption[];
    incidentStatuses: NemtOption[];
    documentTypes: NemtOption[];
    documentStatuses: NemtOption[];
    maintenanceTypes: NemtOption[];
    dispatchColumns: NemtOption[];
  };
};

type NemtViewTab =
  | 'overview'
  | 'dispatch'
  | 'trips'
  | 'drivers'
  | 'vehicles'
  | 'facilities'
  | 'billing'
  | 'compliance'
  | 'incidents'
  | 'scores'
  | 'analytics';

const createTripDraft = () => ({
  tripNumber: '',
  passengerName: '',
  passengerPhone: '',
  memberId: '',
  pickupAddress: '',
  dropoffAddress: '',
  pickupFacilityId: '',
  dropoffFacilityId: '',
  scheduledPickupAt: '',
  appointmentAt: '',
  assignedDriverId: '',
  vehicleId: '',
  estimatedMileage: '',
  fareAmount: '0',
  requiresWheelchair: false,
  requiresEscort: false,
  notes: '',
});

const createDriverDraft = () => ({
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  licenseExpiresAt: '',
  cprExpiresAt: '',
});

const createVehicleDraft = () => ({
  name: '',
  plateNumber: '',
  plateState: '',
  make: '',
  model: '',
  year: '',
  registrationExpiresAt: '',
  insuranceExpiresAt: '',
  inspectionDueAt: '',
});

const createFacilityDraft = () => ({
  name: '',
  mtmFacilityId: '',
  facilityType: '',
  phone: '',
  addressLine1: '',
  city: '',
  state: '',
  postalCode: '',
});

const createInvoiceDraft = () => ({
  invoiceNumber: '',
  tripIds: [] as string[],
  notes: '',
});

const createDocumentDraft = () => ({
  entityType: 'driver',
  entityId: '',
  type: 'DRIVER_LICENSE',
  status: 'VALID',
  title: '',
  documentNumber: '',
  fileUrl: '',
  issuedAt: '',
  expiresAt: '',
  notes: '',
});

const createMaintenanceDraft = () => ({
  vehicleId: '',
  serviceType: 'ROUTINE',
  serviceDate: '',
  dueDate: '',
  odometer: '',
  cost: '',
  vendor: '',
  notes: '',
});

const createIncidentDraft = () => ({
  type: 'COMPLAINT',
  title: '',
  tripId: '',
  driverId: '',
  vehicleId: '',
  occurredAt: '',
  reportedBy: '',
  description: '',
  resolutionNotes: '',
});

const createDriverScoreDraft = () => ({
  driverId: '',
  month: new Date().toISOString().slice(0, 7),
  onTimePercentage: '100',
  customerComplaints: '0',
  attendancePercentage: '100',
  noShowResponsibility: '0',
  rideCompletionRate: '100',
  monthlyScore: '100',
  notes: '',
});

const statusToneFor = (status: string) => {
  if (status === 'COMPLETED') return 'success';
  if (status === 'PROBLEM' || status === 'NO_SHOW' || status === 'CANCELED') return 'danger';
  if (status === 'PENDING_CONFIRMATION' || status === 'ASSIGNED' || status === 'IN_PROGRESS') return 'warning';
  return 'neutral';
};

const invoiceToneFor = (status: string) => {
  if (status === 'PAID' || status === 'ACCEPTED') return 'success';
  if (status === 'REJECTED') return 'danger';
  if (status === 'SUBMITTED') return 'warning';
  return 'neutral';
};

const alertToneFor = (severity: NemtComplianceAlert['severity']) =>
  severity === 'danger' ? 'danger' : severity === 'warning' ? 'warning' : 'neutral';

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const dateTimeLocalFrom = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const addressLineFor = (facility: NemtFacilityRow) =>
  [facility.addressLine1, facility.city, facility.state, facility.postalCode].filter(Boolean).join(', ');

export function NemtOperationsView({ currentUser }: { currentUser: AuthUser }) {
  const [payload, setPayload] = useState<NemtOperationsPayload | null>(null);
  const [activeView, setActiveView] = useState<NemtViewTab>('overview');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [tripDraft, setTripDraft] = useState(createTripDraft);
  const [driverDraft, setDriverDraft] = useState(createDriverDraft);
  const [vehicleDraft, setVehicleDraft] = useState(createVehicleDraft);
  const [facilityDraft, setFacilityDraft] = useState(createFacilityDraft);
  const [invoiceDraft, setInvoiceDraft] = useState(createInvoiceDraft);
  const [documentDraft, setDocumentDraft] = useState(createDocumentDraft);
  const [maintenanceDraft, setMaintenanceDraft] = useState(createMaintenanceDraft);
  const [incidentDraft, setIncidentDraft] = useState(createIncidentDraft);
  const [driverScoreDraft, setDriverScoreDraft] = useState(createDriverScoreDraft);
  const canManage = currentUser.role === 'ADMIN' || currentUser.role === 'OFFICE';

  const loadOperations = async () => {
    setIsLoading(true);
    try {
      setPayload(await requestJson<NemtOperationsPayload>('/api/nemt/operations'));
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not load NEMT operations.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadOperations();
  }, []);

  const tripsByDispatchColumn = useMemo(() => {
    const columns = new Map<string, NemtTripRow[]>();
    payload?.options.dispatchColumns.forEach((column) => columns.set(column.value, []));

    payload?.trips.forEach((trip) => {
      const targetColumn =
        trip.status === 'IN_PROGRESS'
          ? 'ASSIGNED'
          : trip.status === 'CANCELED' || trip.status === 'NO_SHOW'
            ? 'PROBLEM'
            : trip.status;
      const existing = columns.get(targetColumn) ?? [];
      existing.push(trip);
      columns.set(targetColumn, existing);
    });

    return columns;
  }, [payload]);

  const saveTrip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;

    setIsSaving(true);
    try {
      await requestJson<NemtTripRow>('/api/nemt/trips', {
        method: 'POST',
        body: JSON.stringify({
          ...tripDraft,
          estimatedMileage: tripDraft.estimatedMileage || undefined,
          fareAmount: tripDraft.fareAmount || '0',
        }),
      });
      setTripDraft(createTripDraft());
      setMessage({ type: 'success', text: 'NEMT trip created.' });
      await loadOperations();
      setActiveView('dispatch');
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not save trip.' });
    } finally {
      setIsSaving(false);
    }
  };

  const saveDriver = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;

    setIsSaving(true);
    try {
      await requestJson<NemtDriverRow>('/api/nemt/drivers', {
        method: 'POST',
        body: JSON.stringify(driverDraft),
      });
      setDriverDraft(createDriverDraft());
      setMessage({ type: 'success', text: 'Driver created.' });
      await loadOperations();
      setActiveView('drivers');
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not save driver.' });
    } finally {
      setIsSaving(false);
    }
  };

  const saveVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;

    setIsSaving(true);
    try {
      await requestJson<NemtVehicleRow>('/api/nemt/vehicles', {
        method: 'POST',
        body: JSON.stringify(vehicleDraft),
      });
      setVehicleDraft(createVehicleDraft());
      setMessage({ type: 'success', text: 'Vehicle created.' });
      await loadOperations();
      setActiveView('vehicles');
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not save vehicle.' });
    } finally {
      setIsSaving(false);
    }
  };

  const saveFacility = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;

    setIsSaving(true);
    try {
      await requestJson<NemtFacilityRow>('/api/nemt/facilities', {
        method: 'POST',
        body: JSON.stringify(facilityDraft),
      });
      setFacilityDraft(createFacilityDraft());
      setMessage({ type: 'success', text: 'Facility created.' });
      await loadOperations();
      setActiveView('facilities');
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not save facility.' });
    } finally {
      setIsSaving(false);
    }
  };

  const saveInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;

    setIsSaving(true);
    try {
      await requestJson<NemtInvoiceRow>('/api/nemt/invoices', {
        method: 'POST',
        body: JSON.stringify(invoiceDraft),
      });
      setInvoiceDraft(createInvoiceDraft());
      setMessage({ type: 'success', text: 'Invoice created.' });
      await loadOperations();
      setActiveView('billing');
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not save invoice.' });
    } finally {
      setIsSaving(false);
    }
  };

  const updateInvoiceStatus = async (invoiceId: string, status: string) => {
    if (!canManage) return;

    setIsSaving(true);
    try {
      await requestJson<NemtInvoiceRow>(`/api/nemt/invoices/${invoiceId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setMessage({ type: 'success', text: 'Invoice status updated.' });
      await loadOperations();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not update invoice.' });
    } finally {
      setIsSaving(false);
    }
  };

  const saveDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;

    setIsSaving(true);
    try {
      await requestJson<NemtDocumentRow>('/api/nemt/documents', {
        method: 'POST',
        body: JSON.stringify({
          ...documentDraft,
          driverId: documentDraft.entityType === 'driver' ? documentDraft.entityId : '',
          vehicleId: documentDraft.entityType === 'vehicle' ? documentDraft.entityId : '',
          tripId: documentDraft.entityType === 'trip' ? documentDraft.entityId : '',
        }),
      });
      setDocumentDraft(createDocumentDraft());
      setMessage({ type: 'success', text: 'Compliance document saved.' });
      await loadOperations();
      setActiveView('compliance');
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not save document.' });
    } finally {
      setIsSaving(false);
    }
  };

  const saveMaintenance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;

    setIsSaving(true);
    try {
      await requestJson<NemtMaintenanceRow>('/api/nemt/maintenance', {
        method: 'POST',
        body: JSON.stringify(maintenanceDraft),
      });
      setMaintenanceDraft(createMaintenanceDraft());
      setMessage({ type: 'success', text: 'Maintenance record saved.' });
      await loadOperations();
      setActiveView('compliance');
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not save maintenance.' });
    } finally {
      setIsSaving(false);
    }
  };

  const saveIncident = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;

    setIsSaving(true);
    try {
      await requestJson<NemtIncidentRow>('/api/nemt/incidents', {
        method: 'POST',
        body: JSON.stringify(incidentDraft),
      });
      setIncidentDraft(createIncidentDraft());
      setMessage({ type: 'success', text: 'Incident created.' });
      await loadOperations();
      setActiveView('incidents');
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not save incident.' });
    } finally {
      setIsSaving(false);
    }
  };

  const updateIncidentStatus = async (incidentId: string, status: string) => {
    if (!canManage) return;

    setIsSaving(true);
    try {
      await requestJson<NemtIncidentRow>(`/api/nemt/incidents/${incidentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setMessage({ type: 'success', text: 'Incident status updated.' });
      await loadOperations();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not update incident.' });
    } finally {
      setIsSaving(false);
    }
  };

  const saveDriverScore = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage) return;

    setIsSaving(true);
    try {
      await requestJson<NemtDriverScoreRow>('/api/nemt/driver-scores', {
        method: 'POST',
        body: JSON.stringify({
          ...driverScoreDraft,
          month: `${driverScoreDraft.month}-01`,
        }),
      });
      setDriverScoreDraft(createDriverScoreDraft());
      setMessage({ type: 'success', text: 'Driver score saved.' });
      await loadOperations();
      setActiveView('scores');
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not save driver score.' });
    } finally {
      setIsSaving(false);
    }
  };

  const updateTripStatus = async (tripId: string, status: string) => {
    if (!canManage) return;

    setIsSaving(true);
    try {
      await requestJson<NemtTripRow>(`/api/nemt/trips/${tripId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setMessage({ type: 'success', text: 'Trip status updated.' });
      await loadOperations();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not update trip.' });
    } finally {
      setIsSaving(false);
    }
  };

  const summary = payload?.summary;
  const viewTabs: Array<{ id: NemtViewTab; label: string; icon: UiIconName }> = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'dispatch', label: 'Dispatch', icon: 'activity' },
    { id: 'trips', label: 'Trips', icon: 'calendar' },
    { id: 'drivers', label: 'Drivers', icon: 'users' },
    { id: 'vehicles', label: 'Vehicles', icon: 'car' },
    { id: 'facilities', label: 'Facilities', icon: 'building' },
    { id: 'billing', label: 'Billing', icon: 'receipt' },
    { id: 'compliance', label: 'Compliance', icon: 'shield' },
    { id: 'incidents', label: 'Incidents', icon: 'bell' },
    { id: 'scores', label: 'Scores', icon: 'chart' },
    { id: 'analytics', label: 'Analytics', icon: 'chart' },
  ];

  return (
    <section className="tab-panel nemt-shell">
      <div className="panel nemt-hero">
        <div>
          <p className="page-kicker">NEMT Operations</p>
          <h2 className="title-with-icon">
            <UiIcon name="map" />
            <span>Transportation Command Center</span>
          </h2>
          <p>Trips, drivers, fleet, facilities and dispatch status in one operational layer.</p>
        </div>
        <div className="nemt-hero-actions">
          <button type="button" className="ghost-button" onClick={() => void loadOperations()} disabled={isLoading}>
            <UiIcon name="refresh" />
            Refresh
          </button>
          {canManage ? (
            <button type="button" onClick={() => setActiveView('trips')}>
              <UiIcon name="plus" />
              New trip
            </button>
          ) : null}
        </div>
      </div>

      {message ? <div className={`flash ${message.type}`}>{message.text}</div> : null}

      <div className="nemt-tab-bar">
        {viewTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeView === tab.id ? 'is-active' : ''}
            onClick={() => setActiveView(tab.id)}
          >
            <UiIcon name={tab.icon} size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {isLoading && !payload ? <div className="empty-box">Loading NEMT operations...</div> : null}

      {payload ? (
        <>
          {activeView === 'overview' ? (
            <div className="nemt-overview-grid">
              <Metric label="Trips today" value={summary?.tripsToday ?? 0} icon="calendar" />
              <Metric label="Active drivers" value={summary?.activeDrivers ?? 0} icon="users" />
              <Metric label="Active vehicles" value={summary?.activeVehicles ?? 0} icon="car" />
              <Metric label="Upcoming pickups" value={summary?.upcomingPickups ?? 0} icon="bell" />
              <Metric label="Delayed trips" value={summary?.delayedTrips ?? 0} icon="activity" />
              <Metric label="No shows" value={summary?.noShows ?? 0} icon="shield" />
              <Metric label="Problem trips" value={summary?.problemTrips ?? 0} icon="bell" />
              <Metric label="Revenue today" value={formatMoney(summary?.revenueToday ?? 0)} icon="dollar" />
              <Metric label="Pending invoices" value={summary?.pendingInvoices ?? 0} icon="receipt" />
              <Metric label="Vehicle alerts" value={summary?.vehicleAlerts ?? 0} icon="car" />
              <Metric label="Compliance alerts" value={summary?.complianceAlerts ?? 0} icon="shield" />
            </div>
          ) : null}

          {activeView === 'dispatch' ? (
            <div className="nemt-dispatch-board">
              {payload.options.dispatchColumns.map((column) => {
                const columnTrips = tripsByDispatchColumn.get(column.value) ?? [];
                return (
                  <section key={column.value} className="nemt-dispatch-column">
                    <div className="nemt-dispatch-column-head">
                      <strong>{column.label}</strong>
                      <span>{columnTrips.length}</span>
                    </div>
                    <div className="nemt-dispatch-card-list">
                      {columnTrips.length ? (
                        columnTrips.map((trip) => (
                          <TripCard
                            key={trip.id}
                            trip={trip}
                            canManage={canManage}
                            tripStatuses={payload.options.tripStatuses}
                            onStatusChange={updateTripStatus}
                          />
                        ))
                      ) : (
                        <div className="nemt-mini-empty">No trips</div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : null}

          {activeView === 'trips' ? (
            <div className="nemt-two-column">
              {canManage ? (
                <form className="panel nemt-form" onSubmit={saveTrip}>
                  <FormHead title="Create trip" icon="plus" />
                  <label>
                    Trip number
                    <input value={tripDraft.tripNumber} onChange={(event) => setTripDraft((current) => ({ ...current, tripNumber: event.target.value }))} />
                  </label>
                  <label>
                    Passenger *
                    <input required value={tripDraft.passengerName} onChange={(event) => setTripDraft((current) => ({ ...current, passengerName: event.target.value }))} />
                  </label>
                  <label>
                    Phone
                    <input value={tripDraft.passengerPhone} onChange={(event) => setTripDraft((current) => ({ ...current, passengerPhone: event.target.value }))} />
                  </label>
                  <label>
                    Member ID
                    <input value={tripDraft.memberId} onChange={(event) => setTripDraft((current) => ({ ...current, memberId: event.target.value }))} />
                  </label>
                  <label className="span-2">
                    Pickup address *
                    <input required value={tripDraft.pickupAddress} onChange={(event) => setTripDraft((current) => ({ ...current, pickupAddress: event.target.value }))} />
                  </label>
                  <label className="span-2">
                    Dropoff address *
                    <input required value={tripDraft.dropoffAddress} onChange={(event) => setTripDraft((current) => ({ ...current, dropoffAddress: event.target.value }))} />
                  </label>
                  <label>
                    Pickup facility
                    <select value={tripDraft.pickupFacilityId} onChange={(event) => setTripDraft((current) => ({ ...current, pickupFacilityId: event.target.value }))}>
                      <option value="">None</option>
                      {payload.facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Dropoff facility
                    <select value={tripDraft.dropoffFacilityId} onChange={(event) => setTripDraft((current) => ({ ...current, dropoffFacilityId: event.target.value }))}>
                      <option value="">None</option>
                      {payload.facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Scheduled pickup *
                    <input type="datetime-local" required value={tripDraft.scheduledPickupAt} onChange={(event) => setTripDraft((current) => ({ ...current, scheduledPickupAt: event.target.value }))} />
                  </label>
                  <label>
                    Appointment
                    <input type="datetime-local" value={tripDraft.appointmentAt} onChange={(event) => setTripDraft((current) => ({ ...current, appointmentAt: event.target.value }))} />
                  </label>
                  <label>
                    Driver
                    <select value={tripDraft.assignedDriverId} onChange={(event) => setTripDraft((current) => ({ ...current, assignedDriverId: event.target.value }))}>
                      <option value="">Unassigned</option>
                      {payload.drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.displayName}</option>)}
                    </select>
                  </label>
                  <label>
                    Vehicle
                    <select value={tripDraft.vehicleId} onChange={(event) => setTripDraft((current) => ({ ...current, vehicleId: event.target.value }))}>
                      <option value="">Unassigned</option>
                      {payload.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Est. mileage
                    <input type="number" min="0" step="0.1" value={tripDraft.estimatedMileage} onChange={(event) => setTripDraft((current) => ({ ...current, estimatedMileage: event.target.value }))} />
                  </label>
                  <label>
                    Fare amount
                    <input type="number" min="0" step="0.01" value={tripDraft.fareAmount} onChange={(event) => setTripDraft((current) => ({ ...current, fareAmount: event.target.value }))} />
                  </label>
                  <label className="nemt-checkbox">
                    <input type="checkbox" checked={tripDraft.requiresWheelchair} onChange={(event) => setTripDraft((current) => ({ ...current, requiresWheelchair: event.target.checked }))} />
                    Wheelchair
                  </label>
                  <label className="nemt-checkbox">
                    <input type="checkbox" checked={tripDraft.requiresEscort} onChange={(event) => setTripDraft((current) => ({ ...current, requiresEscort: event.target.checked }))} />
                    Escort
                  </label>
                  <label className="span-2">
                    Notes
                    <textarea rows={3} value={tripDraft.notes} onChange={(event) => setTripDraft((current) => ({ ...current, notes: event.target.value }))} />
                  </label>
                  <button type="submit" disabled={isSaving}>
                    <UiIcon name="plus" />
                    Save trip
                  </button>
                </form>
              ) : null}
              <RecordsPanel title="Recent trips" icon="calendar">
                {payload.trips.map((trip) => <TripListRow key={trip.id} trip={trip} />)}
              </RecordsPanel>
            </div>
          ) : null}

          {activeView === 'drivers' ? (
            <div className="nemt-two-column">
              {canManage ? (
                <form className="panel nemt-form" onSubmit={saveDriver}>
                  <FormHead title="Create driver" icon="users" />
                  <label>First name *<input required value={driverDraft.firstName} onChange={(event) => setDriverDraft((current) => ({ ...current, firstName: event.target.value }))} /></label>
                  <label>Last name *<input required value={driverDraft.lastName} onChange={(event) => setDriverDraft((current) => ({ ...current, lastName: event.target.value }))} /></label>
                  <label>Phone<input value={driverDraft.phone} onChange={(event) => setDriverDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
                  <label>Email<input type="email" value={driverDraft.email} onChange={(event) => setDriverDraft((current) => ({ ...current, email: event.target.value }))} /></label>
                  <label>License expires<input type="date" value={driverDraft.licenseExpiresAt} onChange={(event) => setDriverDraft((current) => ({ ...current, licenseExpiresAt: event.target.value }))} /></label>
                  <label>CPR expires<input type="date" value={driverDraft.cprExpiresAt} onChange={(event) => setDriverDraft((current) => ({ ...current, cprExpiresAt: event.target.value }))} /></label>
                  <button type="submit" disabled={isSaving}><UiIcon name="plus" />Save driver</button>
                </form>
              ) : null}
              <RecordsPanel title="Drivers" icon="users">
                {payload.drivers.map((driver) => (
                  <article key={driver.id} className="nemt-record-row">
                    <div><strong>{driver.displayName}</strong><small>{driver.phone || driver.email || 'No contact saved'}</small></div>
                    <span className="pill tone-neutral">{driver.statusLabel}</span>
                    <small>License {formatDate(driver.licenseExpiresAt)}</small>
                    <small>CPR {formatDate(driver.cprExpiresAt)}</small>
                  </article>
                ))}
              </RecordsPanel>
            </div>
          ) : null}

          {activeView === 'vehicles' ? (
            <div className="nemt-two-column">
              {canManage ? (
                <form className="panel nemt-form" onSubmit={saveVehicle}>
                  <FormHead title="Create vehicle" icon="car" />
                  <label>Name *<input required value={vehicleDraft.name} onChange={(event) => setVehicleDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label>Plate<input value={vehicleDraft.plateNumber} onChange={(event) => setVehicleDraft((current) => ({ ...current, plateNumber: event.target.value }))} /></label>
                  <label>State<input value={vehicleDraft.plateState} onChange={(event) => setVehicleDraft((current) => ({ ...current, plateState: event.target.value }))} /></label>
                  <label>Make<input value={vehicleDraft.make} onChange={(event) => setVehicleDraft((current) => ({ ...current, make: event.target.value }))} /></label>
                  <label>Model<input value={vehicleDraft.model} onChange={(event) => setVehicleDraft((current) => ({ ...current, model: event.target.value }))} /></label>
                  <label>Year<input type="number" value={vehicleDraft.year} onChange={(event) => setVehicleDraft((current) => ({ ...current, year: event.target.value }))} /></label>
                  <label>Registration expires<input type="date" value={vehicleDraft.registrationExpiresAt} onChange={(event) => setVehicleDraft((current) => ({ ...current, registrationExpiresAt: event.target.value }))} /></label>
                  <label>Insurance expires<input type="date" value={vehicleDraft.insuranceExpiresAt} onChange={(event) => setVehicleDraft((current) => ({ ...current, insuranceExpiresAt: event.target.value }))} /></label>
                  <label>Inspection due<input type="date" value={vehicleDraft.inspectionDueAt} onChange={(event) => setVehicleDraft((current) => ({ ...current, inspectionDueAt: event.target.value }))} /></label>
                  <button type="submit" disabled={isSaving}><UiIcon name="plus" />Save vehicle</button>
                </form>
              ) : null}
              <RecordsPanel title="Vehicles" icon="car">
                {payload.vehicles.map((vehicle) => (
                  <article key={vehicle.id} className="nemt-record-row">
                    <div><strong>{vehicle.name}</strong><small>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Fleet vehicle'}</small></div>
                    <span className="pill tone-neutral">{vehicle.statusLabel}</span>
                    <small>{[vehicle.plateState, vehicle.plateNumber].filter(Boolean).join(' ') || 'No plate'}</small>
                    <small>Insurance {formatDate(vehicle.insuranceExpiresAt)}</small>
                  </article>
                ))}
              </RecordsPanel>
            </div>
          ) : null}

          {activeView === 'facilities' ? (
            <div className="nemt-two-column">
              {canManage ? (
                <form className="panel nemt-form" onSubmit={saveFacility}>
                  <FormHead title="Create facility" icon="building" />
                  <label>Name *<input required value={facilityDraft.name} onChange={(event) => setFacilityDraft((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label>MTM ID<input value={facilityDraft.mtmFacilityId} onChange={(event) => setFacilityDraft((current) => ({ ...current, mtmFacilityId: event.target.value }))} /></label>
                  <label>Type<input value={facilityDraft.facilityType} onChange={(event) => setFacilityDraft((current) => ({ ...current, facilityType: event.target.value }))} /></label>
                  <label>Phone<input value={facilityDraft.phone} onChange={(event) => setFacilityDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
                  <label className="span-2">Address<input value={facilityDraft.addressLine1} onChange={(event) => setFacilityDraft((current) => ({ ...current, addressLine1: event.target.value }))} /></label>
                  <label>City<input value={facilityDraft.city} onChange={(event) => setFacilityDraft((current) => ({ ...current, city: event.target.value }))} /></label>
                  <label>State<input value={facilityDraft.state} onChange={(event) => setFacilityDraft((current) => ({ ...current, state: event.target.value }))} /></label>
                  <label>Postal code<input value={facilityDraft.postalCode} onChange={(event) => setFacilityDraft((current) => ({ ...current, postalCode: event.target.value }))} /></label>
                  <button type="submit" disabled={isSaving}><UiIcon name="plus" />Save facility</button>
                </form>
              ) : null}
              <RecordsPanel title="Facilities" icon="building">
                {payload.facilities.map((facility) => (
                  <article key={facility.id} className="nemt-record-row">
                    <div><strong>{facility.name}</strong><small>{addressLineFor(facility) || facility.phone || 'No address saved'}</small></div>
                    <span className="pill tone-neutral">{facility.facilityType || 'Facility'}</span>
                    <small>{facility.mtmFacilityId ? `MTM ${facility.mtmFacilityId}` : 'No MTM ID'}</small>
                  </article>
                ))}
              </RecordsPanel>
            </div>
          ) : null}

          {activeView === 'billing' ? (
            <div className="nemt-two-column">
              {canManage ? (
                <form className="panel nemt-form" onSubmit={saveInvoice}>
                  <FormHead title="Create invoice" icon="receipt" />
                  <label>
                    Invoice number
                    <input value={invoiceDraft.invoiceNumber} onChange={(event) => setInvoiceDraft((current) => ({ ...current, invoiceNumber: event.target.value }))} />
                  </label>
                  <label>
                    Add completed trip
                    <select
                      value=""
                      onChange={(event) => {
                        const tripId = event.target.value;
                        if (!tripId) return;
                        setInvoiceDraft((current) => ({
                          ...current,
                          tripIds: current.tripIds.includes(tripId) ? current.tripIds : [...current.tripIds, tripId],
                        }));
                      }}
                    >
                      <option value="">Select trip</option>
                      {payload.trips
                        .filter((trip) => trip.status === 'COMPLETED')
                        .map((trip) => <option key={trip.id} value={trip.id}>{trip.tripNumber || trip.passengerName} - {formatMoney(trip.fareAmount)}</option>)}
                    </select>
                  </label>
                  <div className="nemt-chip-list span-2">
                    {invoiceDraft.tripIds.length ? (
                      invoiceDraft.tripIds.map((tripId) => {
                        const trip = payload.trips.find((item) => item.id === tripId);
                        return (
                          <button
                            key={tripId}
                            type="button"
                            className="ghost-button"
                            onClick={() => setInvoiceDraft((current) => ({ ...current, tripIds: current.tripIds.filter((item) => item !== tripId) }))}
                          >
                            <UiIcon name="close" size={14} />
                            {trip?.tripNumber || trip?.passengerName || tripId}
                          </button>
                        );
                      })
                    ) : (
                      <small>No trips selected</small>
                    )}
                  </div>
                  <label className="span-2">
                    Notes
                    <textarea rows={3} value={invoiceDraft.notes} onChange={(event) => setInvoiceDraft((current) => ({ ...current, notes: event.target.value }))} />
                  </label>
                  <button type="submit" disabled={isSaving}>
                    <UiIcon name="plus" />
                    Save invoice
                  </button>
                </form>
              ) : null}
              <RecordsPanel title="Invoices" icon="receipt">
                {payload.invoices.map((invoice) => (
                  <article key={invoice.id} className="nemt-record-row">
                    <div>
                      <strong>{invoice.invoiceNumber || invoice.id}</strong>
                      <small>{invoice.lineItems.length} trips - {formatDate(invoice.createdAt)}</small>
                    </div>
                    {canManage ? (
                      <select value={invoice.status} onChange={(event) => updateInvoiceStatus(invoice.id, event.target.value)}>
                        {payload.options.invoiceStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                      </select>
                    ) : (
                      <span className={`pill tone-${invoiceToneFor(invoice.status)}`}>{invoice.statusLabel}</span>
                    )}
                    <small>{invoice.statusLabel}</small>
                    <small>{formatMoney(invoice.totalAmount)}</small>
                  </article>
                ))}
              </RecordsPanel>
              <RecordsPanel title="Invoice validations" icon="shield">
                {payload.invoiceValidations.map((validation) => (
                  <article key={validation.type} className="nemt-record-row">
                    <div>
                      <strong>{validation.label}</strong>
                      <small>{validation.items.map((item) => item.label).join(', ') || 'No current issues'}</small>
                    </div>
                    <span className={`pill tone-${validation.count ? 'warning' : 'success'}`}>{validation.count}</span>
                    <small>{validation.type.replace(/_/g, ' ')}</small>
                  </article>
                ))}
              </RecordsPanel>
            </div>
          ) : null}

          {activeView === 'compliance' ? (
            <div className="nemt-two-column">
              {canManage ? (
                <div className="nemt-form-stack">
                  <form className="panel nemt-form" onSubmit={saveDocument}>
                    <FormHead title="Add document" icon="shield" />
                    <label>
                      Entity
                      <select value={documentDraft.entityType} onChange={(event) => setDocumentDraft((current) => ({ ...current, entityType: event.target.value, entityId: '' }))}>
                        <option value="driver">Driver</option>
                        <option value="vehicle">Vehicle</option>
                        <option value="trip">Trip</option>
                      </select>
                    </label>
                    <label>
                      Record *
                      <select required value={documentDraft.entityId} onChange={(event) => setDocumentDraft((current) => ({ ...current, entityId: event.target.value }))}>
                        <option value="">Select record</option>
                        {(documentDraft.entityType === 'driver'
                          ? payload.drivers.map((driver) => ({ id: driver.id, label: driver.displayName }))
                          : documentDraft.entityType === 'vehicle'
                            ? payload.vehicles.map((vehicle) => ({ id: vehicle.id, label: vehicle.name }))
                            : payload.trips.map((trip) => ({ id: trip.id, label: trip.tripNumber || trip.passengerName }))
                        ).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                      </select>
                    </label>
                    <label>
                      Type
                      <select value={documentDraft.type} onChange={(event) => setDocumentDraft((current) => ({ ...current, type: event.target.value }))}>
                        {payload.options.documentTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </label>
                    <label>
                      Status
                      <select value={documentDraft.status} onChange={(event) => setDocumentDraft((current) => ({ ...current, status: event.target.value }))}>
                        {payload.options.documentStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                      </select>
                    </label>
                    <label className="span-2">
                      Title *
                      <input required value={documentDraft.title} onChange={(event) => setDocumentDraft((current) => ({ ...current, title: event.target.value }))} />
                    </label>
                    <label>Document number<input value={documentDraft.documentNumber} onChange={(event) => setDocumentDraft((current) => ({ ...current, documentNumber: event.target.value }))} /></label>
                    <label>File URL<input value={documentDraft.fileUrl} onChange={(event) => setDocumentDraft((current) => ({ ...current, fileUrl: event.target.value }))} /></label>
                    <label>Issued<input type="date" value={documentDraft.issuedAt} onChange={(event) => setDocumentDraft((current) => ({ ...current, issuedAt: event.target.value }))} /></label>
                    <label>Expires<input type="date" value={documentDraft.expiresAt} onChange={(event) => setDocumentDraft((current) => ({ ...current, expiresAt: event.target.value }))} /></label>
                    <button type="submit" disabled={isSaving}><UiIcon name="plus" />Save document</button>
                  </form>

                  <form className="panel nemt-form" onSubmit={saveMaintenance}>
                    <FormHead title="Add maintenance" icon="car" />
                    <label>
                      Vehicle *
                      <select required value={maintenanceDraft.vehicleId} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, vehicleId: event.target.value }))}>
                        <option value="">Select vehicle</option>
                        {payload.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}
                      </select>
                    </label>
                    <label>
                      Type
                      <select value={maintenanceDraft.serviceType} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, serviceType: event.target.value }))}>
                        {payload.options.maintenanceTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                      </select>
                    </label>
                    <label>Service date<input type="date" value={maintenanceDraft.serviceDate} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, serviceDate: event.target.value }))} /></label>
                    <label>Due date<input type="date" value={maintenanceDraft.dueDate} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, dueDate: event.target.value }))} /></label>
                    <label>Odometer<input type="number" min="0" value={maintenanceDraft.odometer} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, odometer: event.target.value }))} /></label>
                    <label>Cost<input type="number" min="0" step="0.01" value={maintenanceDraft.cost} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, cost: event.target.value }))} /></label>
                    <label className="span-2">Vendor<input value={maintenanceDraft.vendor} onChange={(event) => setMaintenanceDraft((current) => ({ ...current, vendor: event.target.value }))} /></label>
                    <button type="submit" disabled={isSaving}><UiIcon name="plus" />Save maintenance</button>
                  </form>
                </div>
              ) : null}
              <div className="nemt-form-stack">
                <RecordsPanel title="Compliance alerts" icon="shield">
                  {payload.complianceAlerts.map((alert) => (
                    <article key={alert.id} className="nemt-record-row">
                      <div><strong>{alert.label}</strong><small>{alert.entityType} - {alert.entityName}</small></div>
                      <span className={`pill tone-${alertToneFor(alert.severity)}`}>{alert.severity}</span>
                      <small>{formatDate(alert.dueAt)}</small>
                      <small>{alert.source}</small>
                    </article>
                  ))}
                </RecordsPanel>
                <RecordsPanel title="Documents" icon="file">
                  {payload.documents.map((document) => (
                    <article key={document.id} className="nemt-record-row">
                      <div><strong>{document.title}</strong><small>{document.driver?.displayName || document.vehicle?.name || document.trip?.tripNumber || document.trip?.passengerName || 'NEMT record'}</small></div>
                      <span className={`pill tone-${document.status === 'VALID' ? 'success' : 'warning'}`}>{document.statusLabel}</span>
                      <small>{document.typeLabel}</small>
                      <small>{formatDate(document.expiresAt)}</small>
                    </article>
                  ))}
                </RecordsPanel>
                <RecordsPanel title="Maintenance" icon="car">
                  {payload.maintenance.map((maintenance) => (
                    <article key={maintenance.id} className="nemt-record-row">
                      <div><strong>{maintenance.vehicle?.name ?? 'Vehicle'}</strong><small>{maintenance.vendor || maintenance.notes || 'Maintenance record'}</small></div>
                      <span className="pill tone-neutral">{maintenance.serviceTypeLabel}</span>
                      <small>Due {formatDate(maintenance.dueDate)}</small>
                      <small>{maintenance.cost == null ? 'No cost' : formatMoney(maintenance.cost)}</small>
                    </article>
                  ))}
                </RecordsPanel>
              </div>
            </div>
          ) : null}

          {activeView === 'incidents' ? (
            <div className="nemt-two-column">
              {canManage ? (
                <form className="panel nemt-form" onSubmit={saveIncident}>
                  <FormHead title="Create incident" icon="bell" />
                  <label>
                    Type
                    <select value={incidentDraft.type} onChange={(event) => setIncidentDraft((current) => ({ ...current, type: event.target.value }))}>
                      {payload.options.incidentTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                  </label>
                  <label>Occurred<input type="datetime-local" value={incidentDraft.occurredAt} onChange={(event) => setIncidentDraft((current) => ({ ...current, occurredAt: event.target.value }))} /></label>
                  <label className="span-2">Title *<input required value={incidentDraft.title} onChange={(event) => setIncidentDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                  <label>
                    Trip
                    <select value={incidentDraft.tripId} onChange={(event) => setIncidentDraft((current) => ({ ...current, tripId: event.target.value }))}>
                      <option value="">None</option>
                      {payload.trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.tripNumber || trip.passengerName}</option>)}
                    </select>
                  </label>
                  <label>
                    Driver
                    <select value={incidentDraft.driverId} onChange={(event) => setIncidentDraft((current) => ({ ...current, driverId: event.target.value }))}>
                      <option value="">None</option>
                      {payload.drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.displayName}</option>)}
                    </select>
                  </label>
                  <label>
                    Vehicle
                    <select value={incidentDraft.vehicleId} onChange={(event) => setIncidentDraft((current) => ({ ...current, vehicleId: event.target.value }))}>
                      <option value="">None</option>
                      {payload.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}
                    </select>
                  </label>
                  <label>Reported by<input value={incidentDraft.reportedBy} onChange={(event) => setIncidentDraft((current) => ({ ...current, reportedBy: event.target.value }))} /></label>
                  <label className="span-2">Description<textarea rows={4} value={incidentDraft.description} onChange={(event) => setIncidentDraft((current) => ({ ...current, description: event.target.value }))} /></label>
                  <button type="submit" disabled={isSaving}><UiIcon name="plus" />Save incident</button>
                </form>
              ) : null}
              <RecordsPanel title="Incidents" icon="bell">
                {payload.incidents.map((incident) => (
                  <article key={incident.id} className="nemt-record-row">
                    <div>
                      <strong>{incident.title}</strong>
                      <small>{incident.driver?.displayName || incident.vehicle?.name || incident.trip?.tripNumber || incident.trip?.passengerName || incident.typeLabel}</small>
                    </div>
                    {canManage ? (
                      <select value={incident.status} onChange={(event) => updateIncidentStatus(incident.id, event.target.value)}>
                        {payload.options.incidentStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                      </select>
                    ) : (
                      <span className="pill tone-warning">{incident.statusLabel}</span>
                    )}
                    <small>{incident.typeLabel}</small>
                    <small>{formatDate(incident.occurredAt)}</small>
                  </article>
                ))}
              </RecordsPanel>
            </div>
          ) : null}

          {activeView === 'scores' ? (
            <div className="nemt-two-column">
              {canManage ? (
                <form className="panel nemt-form" onSubmit={saveDriverScore}>
                  <FormHead title="Driver score" icon="chart" />
                  <label>
                    Driver *
                    <select required value={driverScoreDraft.driverId} onChange={(event) => setDriverScoreDraft((current) => ({ ...current, driverId: event.target.value }))}>
                      <option value="">Select driver</option>
                      {payload.drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.displayName}</option>)}
                    </select>
                  </label>
                  <label>Month<input type="month" required value={driverScoreDraft.month} onChange={(event) => setDriverScoreDraft((current) => ({ ...current, month: event.target.value }))} /></label>
                  <label>On-time %<input type="number" min="0" max="100" step="0.1" value={driverScoreDraft.onTimePercentage} onChange={(event) => setDriverScoreDraft((current) => ({ ...current, onTimePercentage: event.target.value }))} /></label>
                  <label>Attendance %<input type="number" min="0" max="100" step="0.1" value={driverScoreDraft.attendancePercentage} onChange={(event) => setDriverScoreDraft((current) => ({ ...current, attendancePercentage: event.target.value }))} /></label>
                  <label>Complaints<input type="number" min="0" value={driverScoreDraft.customerComplaints} onChange={(event) => setDriverScoreDraft((current) => ({ ...current, customerComplaints: event.target.value }))} /></label>
                  <label>No-show responsibility<input type="number" min="0" value={driverScoreDraft.noShowResponsibility} onChange={(event) => setDriverScoreDraft((current) => ({ ...current, noShowResponsibility: event.target.value }))} /></label>
                  <label>Completion rate %<input type="number" min="0" max="100" step="0.1" value={driverScoreDraft.rideCompletionRate} onChange={(event) => setDriverScoreDraft((current) => ({ ...current, rideCompletionRate: event.target.value }))} /></label>
                  <label>Monthly score<input type="number" min="0" max="100" step="0.1" value={driverScoreDraft.monthlyScore} onChange={(event) => setDriverScoreDraft((current) => ({ ...current, monthlyScore: event.target.value }))} /></label>
                  <label className="span-2">Notes<textarea rows={3} value={driverScoreDraft.notes} onChange={(event) => setDriverScoreDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
                  <button type="submit" disabled={isSaving}><UiIcon name="plus" />Save score</button>
                </form>
              ) : null}
              <RecordsPanel title="Driver scores" icon="chart">
                {payload.driverScores.map((score) => (
                  <article key={score.id} className="nemt-record-row">
                    <div><strong>{score.driver?.displayName ?? 'Driver'}</strong><small>{formatDate(score.month)}</small></div>
                    <span className={`pill tone-${score.monthlyScore >= 85 ? 'success' : score.monthlyScore >= 70 ? 'warning' : 'danger'}`}>{formatPercent(score.monthlyScore)}</span>
                    <small>On-time {formatPercent(score.onTimePercentage)}</small>
                    <small>Completion {formatPercent(score.rideCompletionRate)}</small>
                  </article>
                ))}
              </RecordsPanel>
            </div>
          ) : null}

          {activeView === 'analytics' ? (
            <div className="nemt-form-stack">
              <div className="nemt-overview-grid">
                <Metric label="Cancellation rate" value={formatPercent(payload.analytics.cancellationRate)} icon="activity" />
                <Metric label="MTM completion" value={formatPercent(payload.analytics.mtmPerformance.completionRate)} icon="shield" />
                <Metric label="MTM trips" value={payload.analytics.mtmPerformance.totalTrips} icon="map" />
                <Metric label="MTM problem trips" value={payload.analytics.mtmPerformance.problemTrips} icon="bell" />
              </div>
              <div className="nemt-two-column">
                <AnalyticsPanel title="Revenue by driver" rows={payload.analytics.revenueByDriver} />
                <AnalyticsPanel title="Revenue by vehicle" rows={payload.analytics.revenueByVehicle} />
                <AnalyticsPanel title="Revenue by facility" rows={payload.analytics.revenueByFacility} />
                <RecordsPanel title="MTM performance" icon="chart">
                  <article className="nemt-record-row">
                    <div><strong>Completed</strong><small>{payload.analytics.mtmPerformance.completedTrips} of {payload.analytics.mtmPerformance.totalTrips}</small></div>
                    <span className="pill tone-success">{formatPercent(payload.analytics.mtmPerformance.completionRate)}</span>
                    <small>No shows {payload.analytics.mtmPerformance.noShows}</small>
                    <small>Problems {payload.analytics.mtmPerformance.problemTrips}</small>
                  </article>
                </RecordsPanel>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value, icon }: { label: string; value: string | number; icon: UiIconName }) {
  return (
    <article className="metric-card nemt-metric-card">
      <span className="field-label-inline"><UiIcon name={icon} size={15} /><span>{label}</span></span>
      <strong>{value}</strong>
    </article>
  );
}

function FormHead({ title, icon }: { title: string; icon: UiIconName }) {
  return (
    <div className="panel-head span-2">
      <div>
        <p className="eyebrow">NEMT</p>
        <h3 className="title-with-icon title-with-icon--sm"><UiIcon name={icon} /><span>{title}</span></h3>
      </div>
    </div>
  );
}

function RecordsPanel({ title, icon, children }: { title: string; icon: UiIconName; children: ReactNode }) {
  return (
    <section className="panel nemt-record-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Records</p>
          <h3 className="title-with-icon title-with-icon--sm"><UiIcon name={icon} /><span>{title}</span></h3>
        </div>
      </div>
      <div className="nemt-record-list">{children}</div>
    </section>
  );
}

function AnalyticsPanel({ title, rows }: { title: string; rows: NemtAnalyticsRow[] }) {
  return (
    <RecordsPanel title={title} icon="chart">
      {rows.length ? (
        rows.map((row) => (
          <article key={row.id} className="nemt-record-row">
            <div><strong>{row.label}</strong><small>{row.tripCount} completed trips</small></div>
            <span className="pill tone-success">{formatMoney(row.revenue)}</span>
            <small>Revenue</small>
          </article>
        ))
      ) : (
        <div className="nemt-mini-empty">No completed trips</div>
      )}
    </RecordsPanel>
  );
}

function TripListRow({ trip }: { trip: NemtTripRow }) {
  return (
    <article className="nemt-record-row">
      <div>
        <strong>{trip.tripNumber || trip.passengerName}</strong>
        <small>{trip.passengerName} - {formatDate(trip.scheduledPickupAt)}</small>
      </div>
      <span className={`pill tone-${statusToneFor(trip.status)}`}>{trip.statusLabel}</span>
      <small>{trip.assignedDriver?.displayName ?? 'Unassigned driver'}</small>
      <small>{formatMoney(trip.fareAmount)}</small>
    </article>
  );
}

function TripCard({
  trip,
  canManage,
  tripStatuses,
  onStatusChange,
}: {
  trip: NemtTripRow;
  canManage: boolean;
  tripStatuses: NemtOption[];
  onStatusChange: (tripId: string, status: string) => void;
}) {
  return (
    <article className="nemt-trip-card">
      <div className="nemt-trip-card-head">
        <strong>{trip.tripNumber || trip.passengerName}</strong>
        <span className={`pill tone-${statusToneFor(trip.status)}`}>{trip.statusLabel}</span>
      </div>
      <p>{trip.passengerName}</p>
      <small>{dateTimeLocalFrom(trip.scheduledPickupAt)}</small>
      <div className="nemt-trip-route">
        <span>{trip.pickupFacility?.name ?? trip.pickupAddress}</span>
        <span>{trip.dropoffFacility?.name ?? trip.dropoffAddress}</span>
      </div>
      <div className="nemt-trip-meta">
        <span>{trip.assignedDriver?.displayName ?? 'No driver'}</span>
        <span>{trip.vehicle?.name ?? 'No vehicle'}</span>
      </div>
      {canManage ? (
        <select value={trip.status} onChange={(event) => onStatusChange(trip.id, event.target.value)}>
          {tripStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
        </select>
      ) : null}
    </article>
  );
}
