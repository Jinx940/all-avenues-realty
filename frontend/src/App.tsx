import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ApiError, requestJson } from './lib/api';
import { formatMoney } from './lib/format';
import { buildAdvanceCashAlerts, type AdvanceCashAlert } from './lib/advanceCashAlerts';
import {
  buildInternalSectionValue,
  findMatchingStoryLabel,
  findMatchingUnitLabel,
  parseJobLocationValue,
} from './lib/jobLocation';
import type {
  AuthSessionPayload,
  AuthUser,
  BootstrapPayload,
  DashboardPayload,
  FlashMessage,
  GeneratedDocumentHistoryItem,
  HealthPayload,
  JobFileField,
  JobFileMap,
  JobRow,
  LoginPayload,
  ManagedUser,
  PropertySummary,
  TabId,
  WorkerHistoryRow,
  WorkerSummary,
} from './types';
import { DashboardView } from './components/DashboardView';
import { JobsView, type JobFormState } from './components/JobsView';
import { PropertiesView, type PropertyFormState } from './components/PropertiesView';
import { JobTrackerView } from './components/JobTrackerView';
import { InvoiceQuoteView } from './components/InvoiceQuoteView';
import { DocumentCenterView } from './components/DocumentCenterView';
import { WorkersView } from './components/WorkersView';
import { SettingsView } from './components/SettingsView';
import { UiIcon, type UiIconName } from './components/UiIcon';
import { ConfirmDialog } from './components/ConfirmDialog';
import { LoginView } from './components/LoginView';
import {
  buildPropertySpecificationSnapshotFromStories,
  createEmptyPropertyStoryForm,
  createEmptyPropertyUnitForm,
  createPropertyStoryFormFromSummary,
  storyHasAnyValue,
  unitHasAnyValue,
} from './propertySpecs';

const tabs: Array<{ id: TabId; label: string; icon: UiIconName }> = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'new-job', label: 'New Job', icon: 'plus' },
  { id: 'property-info', label: 'Property Info', icon: 'home' },
  { id: 'property-register', label: 'Property register', icon: 'settings' },
  { id: 'job-tracker', label: 'Job Tracker', icon: 'activity' },
  { id: 'generate-invoice-quote', label: 'Generate Invoice/Quote', icon: 'file' },
  { id: 'document-center', label: 'Document Center', icon: 'receipt' },
  { id: 'workers', label: 'Workers', icon: 'users' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const pageMeta: Record<TabId, { title: string; description: string }> = {
  dashboard: {
    title: 'Dashboard',
    description:
      'Overview of jobs, labor, payments and workload distribution across the properties in your database.',
  },
  'new-job': {
    title: 'New Job',
    description:
      'Create or edit a job and save it with workers, dates, payment status and supporting files.',
  },
  'property-info': {
    title: 'Property Information',
    description:
      'Browse a property, review its gallery and activity, and manage the portfolio in one place.',
  },
  'property-register': {
    title: 'Property register',
    description:
      'Create a new property or update the selected property details, specifications and main photo.',
  },
  'job-tracker': {
    title: 'Job Tracker',
    description: 'Central board for jobs, units, files and statuses in one table.',
  },
  'generate-invoice-quote': {
    title: 'Generate Invoice / Quote',
    description:
      'Prepare a simple invoice or quote preview using the jobs registered under a property.',
  },
  'document-center': {
    title: 'Document Center',
    description:
      'Search invoices, quotes and receipts, then open, print or download them from one place.',
  },
  workers: {
    title: 'Workers',
    description:
      'Add, enable, disable or remove workers while preserving the assignment history.',
  },
  settings: {
    title: 'Settings',
    description:
      'Protected tools for imports, system setup and administrative actions.',
  },
};

const roleTabs: Record<AuthUser['role'], TabId[]> = {
  ADMIN: [
    'dashboard',
    'new-job',
    'property-info',
    'property-register',
    'job-tracker',
    'generate-invoice-quote',
    'document-center',
    'workers',
    'settings',
  ],
  OFFICE: [
    'dashboard',
    'new-job',
    'property-info',
    'job-tracker',
    'generate-invoice-quote',
    'document-center',
  ],
  WORKER: ['dashboard', 'property-info', 'job-tracker', 'document-center'],
  VIEWER: ['dashboard', 'property-info', 'job-tracker', 'document-center'],
};

type ConfirmDialogState = {
  title: string;
  text: string;
  confirmLabel: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  onConfirm: () => Promise<void> | void;
};

type PropertyEditorMode = 'edit' | 'create';
type UserDraftState = {
  username: string;
  displayName: string;
  password: string;
  role: AuthUser['role'];
  workerId: string;
};

const emptyLocalFiles = (): Record<JobFileField, File[]> => ({
  before: [],
  progress: [],
  after: [],
  receipt: [],
  invoice: [],
  quote: [],
});

const emptyRemoteFiles = (): JobFileMap => ({
  before: [],
  progress: [],
  after: [],
  receipt: [],
  invoice: [],
  quote: [],
});

const createJobForm = (bootstrap?: BootstrapPayload | null): JobFormState => ({
  id: null,
  propertyId: bootstrap?.properties[0]?.id ?? '',
  story: '',
  section: '',
  unit: '',
  service: '',
  description: '',
  materialCost: '0',
  laborCost: '0',
  status: bootstrap?.statuses[0]?.value ?? 'PENDING',
  invoiceStatus: bootstrap?.invoiceStatuses.find((status) => status.value === 'NO')?.value ?? 'NO',
  paymentStatus: bootstrap?.paymentStatuses[0]?.value ?? 'UNPAID',
  advanceCashApp: '0',
  startDate: '',
  dueDate: '',
  workerIds: [],
  files: emptyLocalFiles(),
  currentFiles: emptyRemoteFiles(),
});

const createPropertyForm = (): PropertyFormState => ({
  name: '',
  address: '',
  cityLine: '',
  notes: '',
  coverImageUrl: '',
  stories: [],
});

const createPropertyFormFromSummary = (property: PropertySummary | null): PropertyFormState =>
  property
    ? {
        name: property.name,
        address: property.address ?? '',
        cityLine: property.cityLine ?? '',
        notes: property.notes ?? '',
        coverImageUrl: property.coverImageUrl ?? '',
        stories: property.stories.map(createPropertyStoryFormFromSummary),
      }
    : createPropertyForm();

const createPropertyPayload = (
  form: PropertyFormState,
  includeStories: boolean,
) => {
  const stories = form.stories
    .filter(storyHasAnyValue)
    .map((story, storyIndex) => ({
      id: story.id,
      label: story.label.trim() || `Story ${storyIndex + 1}`,
      units: story.units
        .filter(unitHasAnyValue)
        .map((unit, unitIndex) => ({
          id: unit.id,
          label: unit.label.trim() || `Unit ${unitIndex + 1}`,
          bedrooms: unit.bedrooms,
          bathrooms: unit.bathrooms,
          halfBathrooms: unit.halfBathrooms,
          livingRooms: unit.livingRooms,
          diningRooms: unit.diningRooms,
          kitchens: unit.kitchens,
          sunroom: unit.sunroom,
          garages: unit.garages,
          attic: unit.attic,
          frontPorch: unit.frontPorch,
          backPorch: unit.backPorch,
        })),
    }))
    .filter((story) => story.units.length > 0);
  const totals = buildPropertySpecificationSnapshotFromStories(form.stories);

  return {
    name: form.name,
    address: form.address,
    cityLine: form.cityLine,
    notes: form.notes,
    coverImageUrl: form.coverImageUrl,
    ...Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [key, value != null ? String(value) : '']),
    ),
    ...(includeStories ? { stories } : {}),
  };
};

const messageFrom = (error: unknown) => (error instanceof Error ? error.message : 'Unexpected error');

const createJobFilters = () => ({
  search: '',
  propertyId: '',
  workerId: '',
  status: '',
  paymentStatus: '',
  timelineState: '',
});

  const createUserDraft = (): UserDraftState => ({
    username: '',
    displayName: '',
    password: '',
    role: 'WORKER',
    workerId: '',
  });

const timelineStateFor = (job: JobRow) => {
  if (job.status === 'DONE') return 'DONE';
  if (job.timeline.isLate || job.timeline.tone === 'danger') return 'OVERDUE';
  if (job.timeline.tone === 'warning') return 'NEAR_DUE';
  return 'IN_PROGRESS';
};

const canAdmin = (user: AuthUser | null) => user?.role === 'ADMIN';
const canManageJobs = (user: AuthUser | null) =>
  user?.role === 'ADMIN' || user?.role === 'OFFICE';

const advanceCashPriorityLabel = (alert: AdvanceCashAlert) => {
  if (alert.priority === 'overdue') {
    const days = Math.abs(alert.daysDelta ?? 0);
    return `${days} day${days === 1 ? '' : 's'} overdue`;
  }

  if (alert.priority === 'today') {
    return 'Due today';
  }

  if (alert.priority === 'upcoming') {
    const days = alert.daysDelta ?? 0;
    return `Due in ${days} day${days === 1 ? '' : 's'}`;
  }

  return 'Missing due date';
};

const formatAdvanceCashDueDate = (value: string | null) => {
  if (!value) return 'No due date';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No due date';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

function AdvanceCashAlertsBell({
  alerts,
  onOpenJob,
}: {
  alerts: AdvanceCashAlert[];
  onOpenJob: (jobId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelStyle, setPanelStyle] = useState({ top: 0, left: 0, width: 460 });
  const overdueCount = alerts.filter((alert) => alert.priority === 'overdue').length;
  const totalAmount = alerts.reduce((sum, alert) => sum + alert.advanceCashApp, 0);
  const headlineAlert = alerts[0] ?? null;
  const headlineTone = headlineAlert?.priority ?? 'upcoming';

  useEffect(() => {
    if (!isOpen) return undefined;

    const updatePanelPosition = () => {
      if (!buttonRef.current) return;

      const rect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const width = Math.min(460, Math.max(320, viewportWidth - 28));
      const left = Math.min(
        Math.max(14, rect.right - width),
        Math.max(14, viewportWidth - width - 14),
      );

      setPanelStyle({
        top: rect.bottom + 12,
        left,
        width,
      });
    };

    updatePanelPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={`advance-cash-bell ${isOpen ? 'is-open' : ''}`.trim()}>
      <button
        ref={buttonRef}
        type="button"
        className={`advance-cash-bell-button ${overdueCount ? 'has-overdue' : ''}`.trim()}
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <span className="advance-cash-bell-icon">
          <UiIcon name="bell" size={18} />
        </span>
        <span className="advance-cash-bell-copy">
          <strong>Advance Cash App</strong>
          <small>
            {alerts.length
              ? `${overdueCount ? `${overdueCount} overdue` : `${alerts.length} pending`} follow-up${alerts.length === 1 ? '' : 's'}`
              : 'No pending follow-ups'}
          </small>
        </span>
        <span className={`advance-cash-bell-badge ${alerts.length ? 'is-visible' : ''}`.trim()}>
          {alerts.length}
        </span>
      </button>

      {isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              className="advance-cash-panel"
              role="dialog"
              aria-label="Advance Cash App alerts"
              style={{
                top: `${panelStyle.top}px`,
                left: `${panelStyle.left}px`,
                width: `${panelStyle.width}px`,
              }}
            >
              <div className="advance-cash-panel-hero">
                <div className="advance-cash-panel-hero-head">
                  <div className="advance-cash-panel-hero-title">
                    <p className="eyebrow">Advance Cash App</p>
                    <h3>Payment watchlist</h3>
                  </div>
                  <span
                    className={`pill advance-cash-priority-pill advance-cash-priority-pill--${headlineTone}`}
                  >
                    {headlineAlert ? advanceCashPriorityLabel(headlineAlert) : 'All clear'}
                  </span>
                </div>

                <div className="advance-cash-panel-hero-metrics">
                  <span className="advance-cash-panel-metric">
                    <strong>{overdueCount}</strong>
                    <small>overdue</small>
                  </span>
                  <span className="advance-cash-panel-metric">
                    <strong>{alerts.length}</strong>
                    <small>alerts</small>
                  </span>
                  <span className="advance-cash-panel-metric advance-cash-panel-metric--money">
                    <strong>{formatMoney(totalAmount)}</strong>
                    <small>pending</small>
                  </span>
                </div>

                {headlineAlert ? (
                  <div className="advance-cash-panel-focus">
                    <strong>{headlineAlert.service}</strong>
                    <span>{headlineAlert.propertyName}</span>
                  </div>
                ) : null}
              </div>

              <div className="advance-cash-panel-list">
                {alerts.length ? (
                  alerts.map((alert) => (
                    <article
                      key={alert.id}
                      className={`advance-cash-card advance-cash-card--${alert.priority}`.trim()}
                    >
                      <div className="advance-cash-card-head">
                        <div>
                          <strong>{alert.service}</strong>
                          <p>{alert.propertyName}</p>
                        </div>
                        <span
                          className={`pill advance-cash-priority-pill advance-cash-priority-pill--${alert.priority}`}
                        >
                          {advanceCashPriorityLabel(alert)}
                        </span>
                      </div>

                      <div className="advance-cash-card-meta">
                        <span>{[alert.story, alert.unit].filter(Boolean).join(' / ') || 'Whole property'}</span>
                        <span>{formatAdvanceCashDueDate(alert.dueDate)}</span>
                        <span>{formatMoney(alert.advanceCashApp)}</span>
                      </div>

                      <button
                        type="button"
                        className="ghost-button advance-cash-card-button"
                        onClick={() => {
                          setIsOpen(false);
                          onOpenJob(alert.jobId);
                        }}
                      >
                        <UiIcon name="clipboard" size={15} />
                        Open job
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="advance-cash-empty">
                    <strong>Everything is under control</strong>
                    <span>No partial payments with Advance Cash App are waiting for follow-up.</span>
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [generatedDocuments, setGeneratedDocuments] = useState<GeneratedDocumentHistoryItem[]>([]);
  const [workerHistory, setWorkerHistory] = useState<WorkerHistoryRow[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [jobForm, setJobForm] = useState<JobFormState>(createJobForm());
  const [propertyForm, setPropertyForm] = useState<PropertyFormState>(createPropertyForm());
  const [propertyEditorMode, setPropertyEditorMode] = useState<PropertyEditorMode>('edit');
  const [workerName, setWorkerName] = useState('');
  const [userDraft, setUserDraft] = useState<UserDraftState>(createUserDraft());
  const [message, setMessage] = useState<FlashMessage | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const [, setIsRefreshing] = useState(false);
  const [isSavingJob, setIsSavingJob] = useState(false);
  const [isSavingProperty, setIsSavingProperty] = useState(false);
  const [isUploadingPropertyCover, setIsUploadingPropertyCover] = useState(false);
  const [isClearingPropertyCover, setIsClearingPropertyCover] = useState(false);
  const [isSavingWorker, setIsSavingWorker] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [jobFilters, setJobFilters] = useState(createJobFilters());
  const deferredSearch = useDeferredValue(jobFilters.search);
  const availableTabs = currentUser ? tabs.filter((tab) => roleTabs[currentUser.role].includes(tab.id)) : [];
  const currentPage = pageMeta[activeTab];
  const tabsWithoutHeader: TabId[] = [
    'dashboard',
    'new-job',
    'property-info',
    'property-register',
    'job-tracker',
    'generate-invoice-quote',
    'document-center',
    'workers',
    'settings',
  ];
  const showPageHeader = !tabsWithoutHeader.includes(activeTab);
  const showPageBadges = showPageHeader && Boolean(currentUser);

  const allWorkers = bootstrap ? [...bootstrap.workers, ...bootstrap.inactiveWorkers] : [];
  const selectedProperty =
    bootstrap?.properties.find((property) => property.id === selectedPropertyId) ?? null;
  const filteredJobs = jobs.filter((job) => {
    if (jobFilters.propertyId && job.propertyId !== jobFilters.propertyId) return false;
    if (jobFilters.workerId && !job.workers.some((worker) => worker.id === jobFilters.workerId)) return false;
    if (jobFilters.status && job.status !== jobFilters.status) return false;
    if (jobFilters.paymentStatus && job.paymentStatus !== jobFilters.paymentStatus) return false;
    if (jobFilters.timelineState && timelineStateFor(job) !== jobFilters.timelineState) return false;
    if (!deferredSearch.trim()) return true;
    const haystack = [
      job.propertyName,
      job.story,
      job.unit,
      job.service,
      job.description,
      job.workers.map((worker) => worker.name).join(' '),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(deferredSearch.trim().toLowerCase());
  });
  const propertyJobs = selectedPropertyId ? jobs.filter((job) => job.propertyId === selectedPropertyId) : [];
  const advanceCashAlerts = useMemo(() => buildAdvanceCashAlerts(jobs), [jobs]);
  const showAdvanceCashAlerts = canManageJobs(currentUser);

  const resetWorkspaceState = useCallback((loginErrorText = '') => {
    setCurrentUser(null);
    setBootstrap(null);
    setDashboard(null);
    setJobs([]);
    setGeneratedDocuments([]);
    setWorkerHistory([]);
    setUsers([]);
    setLoginUsername('');
    setLoginPassword('');
    setLoginError(loginErrorText);
  }, []);

  const refreshAll = useCallback(async (successMessage?: FlashMessage) => {
    if (!currentUser) return;
    setIsRefreshing(true);
    try {
      const [healthData, bootstrapData, dashboardData, jobsData, documentsData, historyData, usersData] =
        await Promise.all([
          requestJson<HealthPayload>('/api/health'),
          requestJson<BootstrapPayload>('/api/bootstrap'),
          requestJson<DashboardPayload>('/api/dashboard'),
          requestJson<JobRow[]>('/api/jobs'),
          requestJson<GeneratedDocumentHistoryItem[]>('/api/generated-documents'),
          canAdmin(currentUser) ? requestJson<WorkerHistoryRow[]>('/api/workers/history') : Promise.resolve([]),
          canAdmin(currentUser) ? requestJson<ManagedUser[]>('/api/users') : Promise.resolve([]),
        ]);

      startTransition(() => {
        setHealth(healthData);
        setBootstrap(bootstrapData);
        setDashboard(dashboardData);
        setJobs(jobsData);
        setGeneratedDocuments(documentsData);
        setWorkerHistory(historyData);
        setUsers(usersData);
        if (successMessage) setMessage(successMessage);
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        resetWorkspaceState('Your session expired. Sign in again.');
        return;
      }
      setMessage({ type: 'error', text: messageFrom(error) });
    } finally {
      setIsRefreshing(false);
    }
  }, [currentUser, resetWorkspaceState]);

  useEffect(() => {
    const hydrateSession = async () => {
      try {
        const session = await requestJson<AuthSessionPayload>('/api/auth/session');
        setCurrentUser(session.user);
      } catch {
        resetWorkspaceState();
      } finally {
        setAuthReady(true);
      }
    };

    void hydrateSession();
  }, [resetWorkspaceState]);

  useEffect(() => {
    if (!currentUser) return;
    void refreshAll();
  }, [currentUser, refreshAll]);

  useEffect(() => {
    if (!currentUser) return;
    const allowedTabs = roleTabs[currentUser.role];
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]);
    }
  }, [activeTab, currentUser]);

  useEffect(() => {
    if (!bootstrap) return;
    setSelectedPropertyId((current) =>
      current && bootstrap.properties.some((property) => property.id === current)
        ? current
        : bootstrap.properties[0]?.id ?? '',
    );
    setJobForm((current) => (current.id ? current : createJobForm(bootstrap)));
  }, [bootstrap]);

  useEffect(() => {
    if (propertyEditorMode === 'edit') {
      setPropertyForm(createPropertyFormFromSummary(selectedProperty));
    }
  }, [selectedProperty, propertyEditorMode]);

  useEffect(() => {
    if (!jobForm.id) return;
    const freshJob = jobs.find((job) => job.id === jobForm.id);
    if (!freshJob) return;

    setJobForm((current) => ({
      ...current,
      currentFiles: freshJob.files,
      invoiceStatus: freshJob.invoiceStatus,
    }));
  }, [jobs, jobForm.id]);

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage(null);
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const requireRole = (predicate: (user: AuthUser) => boolean, text: string) => {
    if (currentUser && predicate(currentUser)) {
      return true;
    }

    setMessage({ type: 'error', text });
    return false;
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setLoginError('');

    try {
      const payload = await requestJson<LoginPayload>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
        }),
      });

      setCurrentUser(payload.user);
      setLoginPassword('');
      setMessage({ type: 'success', text: `Welcome back, ${payload.user.displayName}.` });
    } catch (error) {
      setLoginError(messageFrom(error));
    } finally {
      setAuthBusy(false);
      setAuthReady(true);
    }
  };

  const logout = async () => {
    try {
      await requestJson<{ ok: boolean }>('/api/auth/logout', {
        method: 'POST',
      });
    } catch {
      // ignore logout transport errors and clear local session anyway
    } finally {
      resetWorkspaceState();
    }
  };

  const openConfirmDialog = (config: ConfirmDialogState) => {
    setConfirmDialog(config);
  };

  const closeConfirmDialog = () => {
    if (isConfirmingAction) return;
    setConfirmDialog(null);
  };

  const runConfirmAction = async () => {
    if (!confirmDialog) return;
    setIsConfirmingAction(true);

    try {
      await confirmDialog.onConfirm();
    } catch (error) {
      setMessage({ type: 'error', text: messageFrom(error) });
    } finally {
      setIsConfirmingAction(false);
      setConfirmDialog(null);
    }
  };

  const resetJobForm = () => setJobForm(createJobForm(bootstrap));

  const syncOpenJobForm = (job: JobRow, overrides?: Partial<JobRow>) => {
    const property =
      bootstrap?.properties.find((propertyItem) => propertyItem.id === (overrides?.propertyId ?? job.propertyId)) ??
      null;
    const location =
      overrides?.story !== undefined || job.story
        ? { story: overrides?.story ?? job.story, unit: overrides?.unit ?? job.unit }
        : parseJobLocationValue(overrides?.unit ?? job.unit, property);

    setJobForm((current) =>
      current.id !== job.id
        ? current
        : {
            ...current,
            propertyId: overrides?.propertyId ?? job.propertyId,
            story: location.story,
            unit: location.unit,
            section: overrides?.section ?? job.section,
            service: overrides?.service ?? job.service,
            description: overrides?.description ?? job.description,
            materialCost: String(overrides?.materialCost ?? job.materialCost),
            laborCost: String(overrides?.laborCost ?? job.laborCost),
            status: overrides?.status ?? job.status,
            invoiceStatus: overrides?.invoiceStatus ?? job.invoiceStatus,
            paymentStatus: overrides?.paymentStatus ?? job.paymentStatus,
            advanceCashApp: String(overrides?.advanceCashApp ?? job.advanceCashApp),
            startDate: (overrides?.startDate ?? job.startDate)?.slice(0, 10) ?? '',
            dueDate: (overrides?.dueDate ?? job.dueDate)?.slice(0, 10) ?? '',
            workerIds: overrides?.workerIds ?? job.workerIds,
          },
    );
  };

  const updateJobQuick = async (
    job: JobRow,
    overrides: Partial<Pick<JobRow, 'status' | 'invoiceStatus' | 'paymentStatus' | 'advanceCashApp'>>,
    successText: string,
  ) => {
    const formData = new FormData();
    formData.append('propertyId', job.propertyId);
    formData.append('story', job.story || '');
    formData.append('unit', job.unit || '');
    formData.append('section', buildInternalSectionValue(job.story, job.unit, job.section));
    formData.append('service', job.service);
    formData.append('description', job.description || '');
    formData.append('materialCost', String(job.materialCost));
    formData.append('laborCost', String(job.laborCost));
    formData.append('status', overrides.status ?? job.status);
    formData.append('invoiceStatus', overrides.invoiceStatus ?? job.invoiceStatus);
    formData.append('paymentStatus', overrides.paymentStatus ?? job.paymentStatus);
    formData.append('advanceCashApp', String(overrides.advanceCashApp ?? job.advanceCashApp));
    formData.append('startDate', job.startDate ? job.startDate.slice(0, 10) : '');
    formData.append('dueDate', job.dueDate ? job.dueDate.slice(0, 10) : '');
    formData.append('workerIds', JSON.stringify(job.workerIds));

    const updated = await requestJson<JobRow>(`/api/jobs/${job.id}`, {
      method: 'PUT',
      body: formData,
    });

    syncOpenJobForm(updated);
    await refreshAll({ type: 'success', text: successText });
    return updated;
  };

  const requestMarkJobDone = (job: JobRow) => {
    if (!requireRole(canManageJobs, 'Only admins and office users can update job status.')) return;
    if (job.status === 'DONE') return;
    const doneDateLabel = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date());

    openConfirmDialog({
      title: 'Change Work Status',
      text: `The current status is ${job.statusLabel}. Mark this job as Done and save ${doneDateLabel} as the completion date?`,
      confirmLabel: 'Mark Done',
      tone: 'success',
      onConfirm: async () => {
        try {
          await updateJobQuick(job, { status: 'DONE' }, 'Work status updated to Done.');
        } catch (error) {
          setMessage({ type: 'error', text: messageFrom(error) });
        }
      },
    });
  };

  const requestMarkPaymentPaid = (job: JobRow) => {
    if (!requireRole(canManageJobs, 'Only admins and office users can update payment status.')) return;
    if (job.paymentStatus === 'PAID') return;

    const detailNotes = [
      `The current payment status is ${job.paymentStatusLabel}.`,
      job.advanceCashApp > 0 ? `Advance Cash App recorded: ${formatMoney(job.advanceCashApp)}.` : '',
      job.invoiceStatus !== 'YES' ? 'Invoice Status is still No.' : '',
    ]
      .filter(Boolean)
      .join(' ');

    openConfirmDialog({
      title: 'Change Payment Status',
      text: `${detailNotes} Mark this job as Paid now?`,
      confirmLabel: 'Mark Paid',
      tone: 'success',
      onConfirm: async () => {
        try {
          await updateJobQuick(job, { paymentStatus: 'PAID' }, 'Payment status updated to Paid.');
        } catch (error) {
          setMessage({ type: 'error', text: messageFrom(error) });
        }
      },
    });
  };

  const handleEditJob = (job: JobRow) => {
    if (!requireRole(canManageJobs, 'Only admins and office users can edit jobs.')) return;
    const property = bootstrap?.properties.find((propertyItem) => propertyItem.id === job.propertyId) ?? null;
    const location =
      job.story || job.unit
        ? { story: job.story || parseJobLocationValue(job.unit, property).story, unit: job.unit }
        : parseJobLocationValue(job.unit, property);
    setActiveTab('new-job');
    setJobForm({
      id: job.id,
      propertyId: job.propertyId,
      story: location.story,
      unit: location.unit,
      section: job.section,
      service: job.service,
      description: job.description,
      materialCost: String(job.materialCost),
      laborCost: String(job.laborCost),
      status: job.status,
      invoiceStatus: job.invoiceStatus,
      paymentStatus: job.paymentStatus,
      advanceCashApp: String(job.advanceCashApp),
      startDate: job.startDate ? job.startDate.slice(0, 10) : '',
      dueDate: job.dueDate ? job.dueDate.slice(0, 10) : '',
      workerIds: job.workerIds,
      files: emptyLocalFiles(),
      currentFiles: job.files,
    });
  };

  const openAdvanceCashAlertJob = (jobId: string) => {
    const targetJob = jobs.find((job) => job.id === jobId);
    if (!targetJob) return;
    handleEditJob(targetJob);
  };

  const submitJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireRole(canManageJobs, 'Only admins and office users can save jobs.')) return;
    if (jobForm.paymentStatus === 'PARTIAL_PAYMENT' && Number(jobForm.advanceCashApp || '0') <= 0) {
      setMessage({ type: 'error', text: 'Advance Cash App ($) is required when payment status is Partial Payment.' });
      return;
    }
    setIsSavingJob(true);
    try {
      const selectedProperty =
        bootstrap?.properties.find((property) => property.id === jobForm.propertyId) ?? null;
      const matchedStory = findMatchingStoryLabel(jobForm.story, selectedProperty);
      const matchedUnit = findMatchingUnitLabel(jobForm.story, jobForm.unit, selectedProperty);
      const formData = new FormData();
      formData.append('propertyId', jobForm.propertyId);
      formData.append('story', matchedStory);
      formData.append('unit', matchedUnit);
      formData.append('section', buildInternalSectionValue(jobForm.story, jobForm.unit, jobForm.service));
      formData.append('service', jobForm.service);
      formData.append('description', jobForm.description);
      formData.append('materialCost', jobForm.materialCost);
      formData.append('laborCost', jobForm.laborCost);
      formData.append('status', jobForm.status);
      formData.append('invoiceStatus', jobForm.invoiceStatus);
      formData.append('paymentStatus', jobForm.paymentStatus);
      formData.append('advanceCashApp', jobForm.advanceCashApp);
      formData.append('startDate', jobForm.startDate);
      formData.append('dueDate', jobForm.dueDate);
      formData.append('workerIds', JSON.stringify(jobForm.workerIds));
      (Object.keys(jobForm.files) as JobFileField[]).forEach((field) => {
        jobForm.files[field].forEach((file) => formData.append(field, file));
      });
      await requestJson<JobRow>(jobForm.id ? `/api/jobs/${jobForm.id}` : '/api/jobs', {
        method: jobForm.id ? 'PUT' : 'POST',
        body: formData,
      });
      resetJobForm();
      await refreshAll({ type: 'success', text: jobForm.id ? 'Job updated.' : 'Job created.' });
    } catch (error) {
      setMessage({ type: 'error', text: messageFrom(error) });
    } finally {
      setIsSavingJob(false);
    }
  };

  const deleteJob = (jobId: string) => {
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can delete jobs.')) return;
    openConfirmDialog({
      title: 'Delete Job',
      text: 'Delete this job permanently?',
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await requestJson<{ message: string }>(`/api/jobs/${jobId}`, { method: 'DELETE' });
          if (jobForm.id === jobId) resetJobForm();
          await refreshAll({ type: 'success', text: 'Job deleted.' });
        } catch (error) {
          setMessage({ type: 'error', text: messageFrom(error) });
        }
      },
    });
  };

  const deleteJobFile = (jobId: string, fileId: string) => {
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can delete attached files.')) return;
    openConfirmDialog({
      title: 'Delete File',
      text: 'Remove this file from the job?',
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await requestJson<{ message: string }>(`/api/jobs/${jobId}/files/${fileId}`, {
            method: 'DELETE',
          });
          await refreshAll({ type: 'success', text: 'File removed from the job.' });
        } catch (error) {
          setMessage({ type: 'error', text: messageFrom(error) });
        }
      },
    });
  };

  const addPropertyStory = () => {
    setPropertyForm((current) => ({
      ...current,
      stories: [
        ...current.stories,
        createEmptyPropertyStoryForm(`Story ${current.stories.length + 1}`),
      ],
    }));
  };

  const updatePropertyStory = (
    storyId: string,
    field: keyof PropertyFormState['stories'][number],
    value: string,
  ) => {
    setPropertyForm((current) => ({
      ...current,
      stories: current.stories.map((story) =>
        story.id === storyId ? { ...story, [field]: value } : story,
      ),
    }));
  };

  const removePropertyStory = (storyId: string) => {
    setPropertyForm((current) => ({
      ...current,
      stories: current.stories.filter((story) => story.id !== storyId),
    }));
  };

  const addPropertyUnit = (storyId: string) => {
    setPropertyForm((current) => ({
      ...current,
      stories: current.stories.map((story) =>
        story.id === storyId
          ? {
              ...story,
              units: [...story.units, createEmptyPropertyUnitForm(`Unit ${story.units.length + 1}`)],
            }
          : story,
      ),
    }));
  };

  const updatePropertyUnit = (
    storyId: string,
    unitId: string,
    field: keyof PropertyFormState['stories'][number]['units'][number],
    value: string,
  ) => {
    setPropertyForm((current) => ({
      ...current,
      stories: current.stories.map((story) =>
        story.id === storyId
          ? {
              ...story,
              units: story.units.map((unit) =>
                unit.id === unitId ? { ...unit, [field]: value } : unit,
              ),
            }
          : story,
      ),
    }));
  };

  const removePropertyUnit = (storyId: string, unitId: string) => {
    setPropertyForm((current) => ({
      ...current,
      stories: current.stories.map((story) =>
        story.id === storyId
          ? {
              ...story,
              units: story.units.filter((unit) => unit.id !== unitId),
            }
          : story,
      ),
    }));
  };

  const submitProperty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can save property details.')) return;
    setIsSavingProperty(true);
    try {
      const shouldIncludeStories =
        propertyForm.stories.some(storyHasAnyValue) ||
        (propertyEditorMode === 'edit' && Boolean(selectedProperty?.stories.length));
      const propertyPayload = createPropertyPayload(propertyForm, shouldIncludeStories);
      if (propertyEditorMode === 'create') {
        const createdProperty = await requestJson<PropertySummary>('/api/properties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(propertyPayload),
        });
        setSelectedPropertyId(createdProperty.id);
        setPropertyEditorMode('edit');
        setPropertyForm(createPropertyFormFromSummary(createdProperty));
        await refreshAll({ type: 'success', text: 'Property created successfully.' });
      } else {
        if (!selectedPropertyId) {
          setMessage({ type: 'error', text: 'Select a property first.' });
          return;
        }

        const updatedProperty = await requestJson<PropertySummary>(`/api/properties/${selectedPropertyId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(propertyPayload),
        });
        setPropertyForm(createPropertyFormFromSummary(updatedProperty));
        await refreshAll({ type: 'success', text: 'Property details updated.' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: messageFrom(error) });
    } finally {
      setIsSavingProperty(false);
    }
  };

  const startCreateProperty = () => {
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can register properties.')) return;
    setPropertyEditorMode('create');
    setPropertyForm(createPropertyForm());
  };

  const startEditSelectedProperty = () => {
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can edit property details.')) return;
    setPropertyEditorMode('edit');
    setPropertyForm(createPropertyFormFromSummary(selectedProperty));
  };

  const uploadPropertyCover = async (file: File) => {
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can upload property cover photos.')) return;
    if (!selectedPropertyId || propertyEditorMode !== 'edit') {
      setMessage({ type: 'error', text: 'Save the property first before uploading a cover image.' });
      return;
    }

    setIsUploadingPropertyCover(true);
    try {
      const formData = new FormData();
      formData.append('coverImage', file);
      const updatedProperty = await requestJson<PropertySummary>(
        `/api/properties/${selectedPropertyId}/cover-image`,
        {
          method: 'POST',
          body: formData,
        },
      );
      setPropertyForm(createPropertyFormFromSummary(updatedProperty));
      await refreshAll({ type: 'success', text: 'Main property photo updated.' });
    } catch (error) {
      setMessage({ type: 'error', text: messageFrom(error) });
    } finally {
      setIsUploadingPropertyCover(false);
    }
  };

  const clearPropertyCover = async () => {
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can clear property photos.')) return;
    if (!selectedPropertyId || propertyEditorMode !== 'edit') {
      setMessage({ type: 'error', text: 'Select a saved property first.' });
      return;
    }

    setIsClearingPropertyCover(true);
    try {
      const updatedProperty = await requestJson<PropertySummary>(`/api/properties/${selectedPropertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverImageUrl: '' }),
      });
      setPropertyForm(createPropertyFormFromSummary(updatedProperty));
      await refreshAll({ type: 'success', text: 'Main property photo removed.' });
    } catch (error) {
      setMessage({ type: 'error', text: messageFrom(error) });
    } finally {
      setIsClearingPropertyCover(false);
    }
  };

  const deleteProperty = (propertyId: string) => {
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can delete properties.')) return;
    openConfirmDialog({
      title: 'Delete Property',
      text: 'Delete this property and all related jobs?',
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await requestJson<{ message: string }>(`/api/properties/${propertyId}`, { method: 'DELETE' });
          await refreshAll({ type: 'success', text: 'Property deleted.' });
        } catch (error) {
          setMessage({ type: 'error', text: messageFrom(error) });
        }
      },
    });
  };

  const submitWorker = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can register workers.')) return;
    const trimmedName = workerName.trim();
    if (!trimmedName) {
      setMessage({ type: 'error', text: 'Worker name is required.' });
      return;
    }

    openConfirmDialog({
      title: 'Add Worker',
      text: `Add worker "${trimmedName}"?`,
      confirmLabel: 'Accept',
      tone: 'success',
      onConfirm: async () => {
        setIsSavingWorker(true);
        try {
          await requestJson<WorkerSummary>('/api/workers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: trimmedName }),
          });
          setWorkerName('');
          await refreshAll({ type: 'success', text: 'Worker added.' });
        } catch (error) {
          setMessage({ type: 'error', text: messageFrom(error) });
        } finally {
          setIsSavingWorker(false);
        }
      },
    });
  };

  const setWorkerStatus = (workerId: string, status: 'ACTIVE' | 'INACTIVE') => {
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can change worker status.')) return;
    const workerLabel = allWorkers.find((worker) => worker.id === workerId)?.name ?? 'this worker';
    const isEnable = status === 'ACTIVE';

    openConfirmDialog({
      title: isEnable ? 'Enable Worker' : 'Disable Worker',
      text: `${isEnable ? 'Enable' : 'Disable'} worker "${workerLabel}"?`,
      confirmLabel: isEnable ? 'Enable' : 'Disable',
      tone: isEnable ? 'success' : 'warning',
      onConfirm: async () => {
        try {
          await requestJson<WorkerSummary>(`/api/workers/${workerId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          });
          await refreshAll({ type: 'success', text: isEnable ? 'Worker enabled.' : 'Worker disabled.' });
        } catch (error) {
          setMessage({ type: 'error', text: messageFrom(error) });
        }
      },
    });
  };

  const deleteWorker = (workerId: string) => {
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can delete workers.')) return;
    const workerLabel = allWorkers.find((worker) => worker.id === workerId)?.name ?? 'this worker';

    openConfirmDialog({
      title: 'Delete Worker',
      text: `Delete worker "${workerLabel}" permanently?`,
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await requestJson<{ message: string }>(`/api/workers/${workerId}`, { method: 'DELETE' });
          await refreshAll({ type: 'success', text: 'Worker deleted.' });
        } catch (error) {
          setMessage({ type: 'error', text: messageFrom(error) });
        }
      },
    });
  };

  const clearWorkerHistory = () => {
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can delete worker history.')) return;

    openConfirmDialog({
      title: 'Delete Worker History',
      text: 'Delete the complete worker history log? This action cannot be undone.',
      confirmLabel: 'Delete history',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await requestJson<{ message: string }>('/api/workers/history', { method: 'DELETE' });
          await refreshAll({ type: 'success', text: 'Worker history deleted.' });
        } catch (error) {
          setMessage({ type: 'error', text: messageFrom(error) });
        }
      },
    });
  };

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can create users.')) return;

    setIsSavingUser(true);
    try {
      await requestJson<ManagedUser>('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userDraft),
      });
      setUserDraft(createUserDraft());
      await refreshAll({ type: 'success', text: 'User created.' });
    } catch (error) {
      setMessage({ type: 'error', text: messageFrom(error) });
    } finally {
      setIsSavingUser(false);
    }
  };

  const toggleUserStatus = (userId: string, status: 'ACTIVE' | 'INACTIVE') => {
    const label = users.find((user) => user.id === userId)?.displayName ?? 'this user';
    const enable = status === 'ACTIVE';

    openConfirmDialog({
      title: enable ? 'Enable User' : 'Disable User',
      text: `${enable ? 'Enable' : 'Disable'} "${label}"?`,
      confirmLabel: enable ? 'Enable' : 'Disable',
      tone: enable ? 'success' : 'warning',
      onConfirm: async () => {
        try {
          await requestJson<ManagedUser>(`/api/users/${userId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          });
          await refreshAll({ type: 'success', text: enable ? 'User enabled.' : 'User disabled.' });
        } catch (error) {
          setMessage({ type: 'error', text: messageFrom(error) });
        }
      },
    });
  };

  const deleteUser = (userId: string) => {
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can delete users.')) return;
    const label = users.find((user) => user.id === userId)?.displayName ?? 'this user';

    openConfirmDialog({
      title: 'Delete User',
      text: `Delete "${label}" permanently?`,
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await requestJson<{ ok: boolean }>(`/api/users/${userId}`, {
            method: 'DELETE',
          });
          await refreshAll({ type: 'success', text: 'User deleted.' });
        } catch (error) {
          setMessage({ type: 'error', text: messageFrom(error) });
        }
      },
    });
  };

  if (!authReady) {
    return <main className="login-shell login-shell--loading">Loading workspace...</main>;
  }

  if (!currentUser) {
    return (
      <LoginView
        username={loginUsername}
        password={loginPassword}
        error={loginError}
        busy={authBusy}
        onUsernameChange={setLoginUsername}
        onPasswordChange={setLoginPassword}
        onSubmit={submitLogin}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand-card">
            <div className="brand-title">
              <span className="brand-icon">
                <UiIcon name="database" size={24} />
              </span>
              <h1>All Avenues Realty</h1>
            </div>
          </div>

          <div className="sidebar-account-card">
            <div className="sidebar-account-head">
              <span className="sidebar-account-icon">
                <UiIcon name="users" size={17} />
              </span>
              <div className="sidebar-account-copy">
                <strong>{currentUser.displayName}</strong>
                <span>{currentUser.role}</span>
              </div>
            </div>
          </div>
        </div>

        <nav className="nav-stack">
          {availableTabs.map((tab) => (
            <button key={tab.id} type="button" className={`nav-button ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
              <span className="nav-icon">
                <UiIcon name={tab.icon} size={18} />
              </span>
              <span className="nav-label">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="sidebar-signout-button" onClick={() => void logout()}>
            <UiIcon name="logout" size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <section className="content">
        {showPageHeader ? (
          <header className="page-header">
            <div>
              <p className="page-kicker">Workspace</p>
              <h2>{currentPage.title}</h2>
              <p>{currentPage.description}</p>
            </div>
            {showPageBadges ? (
              <div className="page-actions">
                <span className={`pill ${health?.status === 'ok' ? 'tone-success' : 'tone-danger'}`}>
                  Backend {health?.status === 'ok' ? 'Online' : 'Offline'}
                </span>
                <span className={`pill ${health?.database === 'up' ? 'tone-success' : 'tone-warning'}`}>
                  Database {health?.database === 'up' ? 'Connected' : 'Pending'}
                </span>
                <span className="pill tone-lilac">
                  {currentUser.role}
                </span>
              </div>
            ) : null}
          </header>
        ) : null}

        {message ? <div className={`flash ${message.type}`}>{message.text}</div> : null}
        {health?.database === 'down' ? <div className="flash info">The UI is ready, but PostgreSQL is not connected yet.</div> : null}

        {activeTab === 'dashboard' ? (
          <DashboardView
            dashboard={dashboard}
            jobs={jobs}
            onCreateJob={() => setActiveTab('new-job')}
            onOpenSettings={() => setActiveTab('settings')}
            canCreateJob={canManageJobs(currentUser)}
            canOpenSettings={canAdmin(currentUser)}
            advanceCashAlertsSlot={
              showAdvanceCashAlerts ? (
                <AdvanceCashAlertsBell
                  alerts={advanceCashAlerts}
                  onOpenJob={openAdvanceCashAlertJob}
                />
              ) : null
            }
          />
        ) : null}

        {activeTab === 'new-job' ? (
          <JobsView
            bootstrap={bootstrap}
            workers={allWorkers}
            form={jobForm}
            isSaving={isSavingJob}
            onSubmit={submitJob}
            onReset={resetJobForm}
            onFieldChange={(field, value) =>
              setJobForm((current) => ({
                ...current,
                [field]: value,
                ...(field === 'propertyId' ? { story: '', unit: '' } : {}),
                ...(field === 'story' ? { unit: '' } : {}),
                ...(field === 'paymentStatus'
                  ? {
                      advanceCashApp:
                        value === 'PARTIAL_PAYMENT'
                          ? current.paymentStatus === 'PARTIAL_PAYMENT'
                            ? current.advanceCashApp
                            : current.advanceCashApp === '0'
                              ? ''
                              : current.advanceCashApp
                          : '0',
                    }
                  : {}),
              }))
            }
            onFilesChange={(field, files) => setJobForm((current) => ({ ...current, files: { ...current.files, [field]: files } }))}
            onDeleteCurrentFile={(jobId, fileId) => void deleteJobFile(jobId, fileId)}
            onToggleWorker={(workerId) =>
              setJobForm((current) => ({
                ...current,
                workerIds: current.workerIds.includes(workerId)
                  ? current.workerIds.filter((item) => item !== workerId)
                  : [...current.workerIds, workerId],
              }))
            }
          />
        ) : null}

        {activeTab === 'property-info' ? (
          <PropertiesView
            focusMode="overview"
            form={propertyForm}
            properties={bootstrap?.properties ?? []}
            selectedPropertyId={selectedPropertyId}
            selectedProperty={selectedProperty}
            propertyJobs={propertyJobs}
            isSaving={isSavingProperty}
            isUploadingCover={isUploadingPropertyCover}
            isClearingCover={isClearingPropertyCover}
            editorMode={propertyEditorMode}
            onSubmit={submitProperty}
            onUploadCover={(file) => void uploadPropertyCover(file)}
            onClearCover={() => void clearPropertyCover()}
            onDelete={(propertyId) => void deleteProperty(propertyId)}
            onSelect={setSelectedPropertyId}
            onFieldChange={(field, value) => setPropertyForm((current) => ({ ...current, [field]: value }))}
            onAddStory={addPropertyStory}
            onStoryChange={updatePropertyStory}
            onRemoveStory={removePropertyStory}
            onAddUnit={addPropertyUnit}
            onUnitChange={updatePropertyUnit}
            onRemoveUnit={removePropertyUnit}
            onStartCreate={startCreateProperty}
            onStartEditSelected={startEditSelectedProperty}
          />
        ) : null}

        {activeTab === 'property-register' ? (
          <PropertiesView
            focusMode="register"
            form={propertyForm}
            properties={bootstrap?.properties ?? []}
            selectedPropertyId={selectedPropertyId}
            selectedProperty={selectedProperty}
            propertyJobs={propertyJobs}
            isSaving={isSavingProperty}
            isUploadingCover={isUploadingPropertyCover}
            isClearingCover={isClearingPropertyCover}
            editorMode={propertyEditorMode}
            onSubmit={submitProperty}
            onUploadCover={(file) => void uploadPropertyCover(file)}
            onClearCover={() => void clearPropertyCover()}
            onDelete={(propertyId) => void deleteProperty(propertyId)}
            onSelect={setSelectedPropertyId}
            onFieldChange={(field, value) => setPropertyForm((current) => ({ ...current, [field]: value }))}
            onAddStory={addPropertyStory}
            onStoryChange={updatePropertyStory}
            onRemoveStory={removePropertyStory}
            onAddUnit={addPropertyUnit}
            onUnitChange={updatePropertyUnit}
            onRemoveUnit={removePropertyUnit}
            onStartCreate={startCreateProperty}
            onStartEditSelected={startEditSelectedProperty}
          />
        ) : null}

        {activeTab === 'job-tracker' ? (
          <JobTrackerView
            bootstrap={bootstrap}
            allJobs={jobs}
            jobs={filteredJobs}
            filters={jobFilters}
            onRefresh={() => void refreshAll()}
            onResetFilters={() => setJobFilters(createJobFilters())}
            onFilterChange={(field, value) => setJobFilters((current) => ({ ...current, [field]: value }))}
            canManage={canManageJobs(currentUser)}
            onEdit={handleEditJob}
            onDelete={(jobId) => void deleteJob(jobId)}
            onWorkStatusAction={requestMarkJobDone}
            onPaymentStatusAction={requestMarkPaymentPaid}
          />
        ) : null}

        {activeTab === 'generate-invoice-quote' ? (
          <InvoiceQuoteView
            properties={bootstrap?.properties ?? []}
            jobs={jobs}
            documents={generatedDocuments}
            onDocumentSaved={(text) => void refreshAll({ type: 'success', text })}
            onDocumentError={(text) => setMessage({ type: 'error', text })}
          />
        ) : null}

        {activeTab === 'document-center' ? (
          <DocumentCenterView
            properties={bootstrap?.properties ?? []}
            jobs={jobs}
            documents={generatedDocuments}
          />
        ) : null}

        {activeTab === 'workers' ? (
          <WorkersView
            activeWorkers={bootstrap?.workers ?? []}
            inactiveWorkers={bootstrap?.inactiveWorkers ?? []}
            availableUsernames={users
              .filter((user) => !user.linkedWorker)
              .map((user) => user.username)
              .sort((left, right) => left.localeCompare(right))}
            workerHistory={workerHistory}
            workerName={workerName}
            isSaving={isSavingWorker}
            onSubmit={submitWorker}
            onWorkerNameChange={setWorkerName}
            onSetStatus={(workerId, status) => void setWorkerStatus(workerId, status)}
            onDelete={(workerId) => void deleteWorker(workerId)}
            onClearHistory={() => void clearWorkerHistory()}
          />
        ) : null}

        {activeTab === 'settings' ? (
          <SettingsView
            currentUser={currentUser}
            users={users}
            draft={userDraft}
            isSavingUser={isSavingUser}
            onSubmit={submitUser}
            onFieldChange={(field, value) => setUserDraft((current) => ({ ...current, [field]: value }))}
            onToggleUserStatus={toggleUserStatus}
            onDeleteUser={deleteUser}
            onLogout={() => void logout()}
          />
        ) : null}

        <ConfirmDialog
          open={Boolean(confirmDialog)}
          title={confirmDialog?.title ?? ''}
          text={confirmDialog?.text ?? ''}
          confirmLabel={confirmDialog?.confirmLabel}
          tone={confirmDialog?.tone}
          busy={isConfirmingAction}
          onConfirm={() => void runConfirmAction()}
          onCancel={closeConfirmDialog}
        />
      </section>
    </main>
  );
}
