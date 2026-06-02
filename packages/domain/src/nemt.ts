export const nemtDriverStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ON_LEAVE'] as const;
export type NemtDriverStatus = (typeof nemtDriverStatuses)[number];

export const nemtVehicleStatuses = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED'] as const;
export type NemtVehicleStatus = (typeof nemtVehicleStatuses)[number];

export const nemtTripStatuses = [
  'NEW',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'ASSIGNED',
  'IN_PROGRESS',
  'PROBLEM',
  'COMPLETED',
  'CANCELED',
  'NO_SHOW',
] as const;
export type NemtTripStatus = (typeof nemtTripStatuses)[number];

export const nemtBrokers = ['MTM', 'OTHER'] as const;
export type NemtBroker = (typeof nemtBrokers)[number];

export const nemtExternalSystems = ['MTM', 'ROUTINGBOX', 'MANUAL', 'OTHER'] as const;
export type NemtExternalSystem = (typeof nemtExternalSystems)[number];

export const dispatchColumns = [
  'NEW',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'ASSIGNED',
  'PROBLEM',
  'COMPLETED',
] as const;
export type DispatchColumn = (typeof dispatchColumns)[number];

export const nemtTripStatusLabels: Record<NemtTripStatus, string> = {
  NEW: 'New',
  PENDING_CONFIRMATION: 'Pending confirmation',
  CONFIRMED: 'Confirmed',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  PROBLEM: 'Problem trip',
  COMPLETED: 'Completed',
  CANCELED: 'Canceled',
  NO_SHOW: 'No show',
};

export const nemtDriverStatusLabels: Record<NemtDriverStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
  ON_LEAVE: 'On leave',
};

export const nemtVehicleStatusLabels: Record<NemtVehicleStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  MAINTENANCE: 'Maintenance',
  RETIRED: 'Retired',
};

export const terminalTripStatuses = ['COMPLETED', 'CANCELED', 'NO_SHOW'] as const;
export type TerminalTripStatus = (typeof terminalTripStatuses)[number];

export const isTerminalTripStatus = (
  status: NemtTripStatus,
): status is TerminalTripStatus =>
  terminalTripStatuses.includes(status as TerminalTripStatus);

export const dispatchColumnForTripStatus = (status: NemtTripStatus): DispatchColumn => {
  if (status === 'IN_PROGRESS') return 'ASSIGNED';
  if (status === 'CANCELED' || status === 'NO_SHOW') return 'PROBLEM';
  return dispatchColumns.includes(status as DispatchColumn) ? (status as DispatchColumn) : 'NEW';
};

export type DriverScoreInput = {
  onTimePercentage: number;
  attendancePercentage: number;
  rideCompletionRate: number;
  complaintCount: number;
  noShowResponsibilityCount: number;
};

export type DriverScoreBreakdown = DriverScoreInput & {
  monthlyScore: number;
};

const clampPercent = (value: number) =>
  Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 100);

export const calculateDriverMonthlyScore = ({
  onTimePercentage,
  attendancePercentage,
  rideCompletionRate,
  complaintCount,
  noShowResponsibilityCount,
}: DriverScoreInput): DriverScoreBreakdown => {
  const normalizedOnTime = clampPercent(onTimePercentage);
  const normalizedAttendance = clampPercent(attendancePercentage);
  const normalizedCompletion = clampPercent(rideCompletionRate);
  const complaintPenalty = Math.min(Math.max(complaintCount, 0) * 4, 20);
  const noShowPenalty = Math.min(Math.max(noShowResponsibilityCount, 0) * 6, 24);

  const monthlyScore = Math.round(
    normalizedOnTime * 0.4 +
      normalizedAttendance * 0.25 +
      normalizedCompletion * 0.25 +
      Math.max(100 - complaintPenalty - noShowPenalty, 0) * 0.1,
  );

  return {
    onTimePercentage: normalizedOnTime,
    attendancePercentage: normalizedAttendance,
    rideCompletionRate: normalizedCompletion,
    complaintCount: Math.max(complaintCount, 0),
    noShowResponsibilityCount: Math.max(noShowResponsibilityCount, 0),
    monthlyScore: clampPercent(monthlyScore),
  };
};
