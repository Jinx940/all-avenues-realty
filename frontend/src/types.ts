export type TabId =
  | 'dashboard'
  | 'new-job'
  | 'property-info'
  | 'property-register'
  | 'job-tracker'
  | 'generate-invoice-quote'
  | 'document-center'
  | 'workers'
  | 'settings';

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'orange' | 'sky';
export type UserRole = 'ADMIN' | 'OFFICE' | 'WORKER' | 'VIEWER';
export type UserStatus = 'ACTIVE' | 'INACTIVE';

export type Option = {
  value: string;
  label: string;
};

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  workerId: string | null;
};

export type AuthSessionPayload = {
  user: AuthUser;
};

export type LoginPayload = {
  expiresAt: string;
  user: AuthUser;
};

export type ManagedUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  linkedWorker: {
    id: string;
    name: string;
    status: 'ACTIVE' | 'INACTIVE';
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogRow = {
  id: string;
  date: string;
  entityType: string;
  entityLabel: string | null;
  action: string;
  summary: string;
  performedBy: string;
};

export type HealthPayload = {
  status: string;
  database: 'up' | 'down';
  timestamp: string;
};

export type ChartDatum = {
  label: string;
  value: number;
};

export type DashboardPayload = {
  stats: {
    totalJobs: number;
    doneJobs: number;
    inProgressJobs: number;
    pendingJobs: number;
    lateJobs: number;
    unpaidOrPartial: number;
    materialTotal: number;
    laborTotal: number;
  };
  charts: {
    status: ChartDatum[];
    payment: ChartDatum[];
    workers: ChartDatum[];
    timeline: ChartDatum[];
    properties: ChartDatum[];
  };
};

export type WorkerSummary = {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  statusLabel: string;
  totalJobCount: number;
  linkedUserCount: number;
  canDelete: boolean;
};

export type PropertySpecificationSnapshot = {
  floors: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  halfBathrooms: number | null;
  livingRooms: number | null;
  diningRooms: number | null;
  kitchens: number | null;
  sunroom: number | null;
  garages: number | null;
  attic: number | null;
  frontPorch: number | null;
  backPorch: number | null;
};

export type PropertyUnitSpecificationSnapshot = Omit<PropertySpecificationSnapshot, 'floors'>;

export type PropertyUnit = PropertyUnitSpecificationSnapshot & {
  id: string;
  label: string;
};

export type PropertyStory = {
  id: string;
  label: string;
  units: PropertyUnit[];
};

export type PropertySummary = {
  id: string;
  name: string;
  address: string | null;
  cityLine: string | null;
  notes: string | null;
  coverImageUrl: string | null;
  stories: PropertyStory[];
  totalJobs: number;
  openJobs: number;
  lateJobs: number;
} & PropertySpecificationSnapshot;

export type JobFileField = 'before' | 'progress' | 'after' | 'receipt' | 'invoice' | 'quote';

export type JobFile = {
  id: string;
  category: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  documentNumber?: string | null;
  createdAt: string;
};

export type JobFileMap = Record<JobFileField, JobFile[]>;

export type JobRow = {
  id: string;
  propertyId: string;
  propertyName: string;
  story: string;
  unit: string;
  section: string;
  area: string;
  service: string;
  description: string;
  materialCost: number;
  laborCost: number;
  totalCost: number;
  status: string;
  statusLabel: string;
  invoiceStatus: string;
  invoiceStatusLabel: string;
  paymentStatus: string;
  paymentStatusLabel: string;
  advanceCashApp: number;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  timeline: {
    label: string;
    tone: Tone;
    isLate: boolean;
  };
  workers: Array<{
    id: string;
    name: string;
    status: string;
    statusLabel: string;
  }>;
  workerIds: string[];
  files: JobFileMap;
  createdAt: string;
  updatedAt: string;
};

export type WorkerHistoryRow = {
  id: string;
  date: string;
  worker: string;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  performedBy: string;
  notes: string | null;
};

export type GeneratedDocumentHistoryItem = {
  id: string;
  documentType: 'INVOICE' | 'QUOTE';
  documentTypeLabel: 'Invoice' | 'Quote';
  owner: 'AZE' | 'RYAN';
  ownerLabel: 'AZE' | 'Ryan';
  documentNumber: string;
  fileName: string;
  propertyId: string;
  propertyName: string;
  issueDate: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
  printUrl: string;
  linkedJobCount: number;
  linkedJobs: Array<{
    id: string;
    story: string;
    unit: string;
    section: string;
    area: string;
    service: string;
  }>;
};

export type BootstrapPayload = {
  statuses: Option[];
  invoiceStatuses: Option[];
  paymentStatuses: Option[];
  properties: PropertySummary[];
  workers: WorkerSummary[];
  inactiveWorkers: WorkerSummary[];
};

export type FlashMessage = {
  type: 'info' | 'success' | 'error';
  text: string;
};
