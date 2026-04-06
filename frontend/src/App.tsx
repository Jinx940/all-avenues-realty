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
import { ApiError, requestJson } from './lib/api';
import { formatMoney } from './lib/format';
import { buildAdvanceCashAlerts } from './lib/advanceCashAlerts';
import {
  buildInternalSectionValue,
  formatStoryDisplayLabel,
  findMatchingStoryLabel,
  findMatchingUnitLabel,
  normalizeStoryInput,
  parseJobLocationValue,
} from './lib/jobLocation';
import type {
  AuditLogRow,
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
  PhotoStorageAuditPayload,
  PropertySummary,
  StorageBackupSyncPayload,
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
import { AdvanceCashAlertsBell } from './components/AdvanceCashAlertsBell';
import { UiIcon } from './components/UiIcon';
import { ConfirmDialog } from './components/ConfirmDialog';
import { LoginView } from './components/LoginView';
import {
  createEditableJobFormState,
  serializeJobFormDraft,
  serializePropertyFormDraft,
  serializeUserDraft,
} from './lib/formDrafts';
import {
  buildPropertySpecificationSnapshotFromStories,
  createEmptyPropertyStoryForm,
  createEmptyPropertyUnitForm,
  createPropertyStoryFormFromSummary,
  storyHasAnyValue,
  unitHasAnyValue,
} from './propertySpecs';
import { pageMeta, readStoredSidebarPreference, roleTabs, sidebarPreferenceKey, tabs } from './lib/navigation';

type ConfirmDialogState = {
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  onConfirm: () => Promise<void> | void;
  onCancel?: () => void;
};

type PropertyEditorMode = 'edit' | 'create';
type UserDraftState = {
  username: string;
  displayName: string;
  password: string;
  role: AuthUser['role'];
  workerId: string;
};
type PasswordChangeState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
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
  area: '',
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
      label: normalizeStoryInput(story.label) || `Floor ${storyIndex + 1}`,
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
  story: '',
  unit: '',
  area: '',
  service: '',
});

const createUserDraft = (): UserDraftState => ({
  username: '',
  displayName: '',
  password: '',
  role: 'WORKER',
  workerId: '',
});

const createPasswordChangeForm = (): PasswordChangeState => ({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const createUserDraftFromManagedUser = (user: ManagedUser): UserDraftState => ({
  username: user.username,
  displayName: user.displayName,
  password: '',
  role: user.role,
  workerId: user.linkedWorker?.id ?? '',
});

const serializePasswordChangeDraft = (draft: PasswordChangeState) =>
  JSON.stringify({
    currentPassword: draft.currentPassword,
    newPassword: draft.newPassword,
    confirmPassword: draft.confirmPassword,
  });

const canAdmin = (user: AuthUser | null) => user?.role === 'ADMIN';
const canManageJobs = (user: AuthUser | null) =>
  user?.role === 'ADMIN' || user?.role === 'OFFICE';
const documentDataTabs = new Set<TabId>(['generate-invoice-quote', 'document-center']);
const adminDataTabs = new Set<TabId>(['workers', 'settings']);

const tabNeedsDocuments = (tab: TabId) => documentDataTabs.has(tab);
const tabNeedsAdminData = (tab: TabId) => adminDataTabs.has(tab);

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [isDesktopSidebarExpanded, setIsDesktopSidebarExpanded] = useState(readStoredSidebarPreference);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
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
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [workerHistory, setWorkerHistory] = useState<WorkerHistoryRow[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [photoAudit, setPhotoAudit] = useState<PhotoStorageAuditPayload | null>(null);
  const [storageBackupResult, setStorageBackupResult] = useState<StorageBackupSyncPayload | null>(null);
  const [adminDataLoaded, setAdminDataLoaded] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [jobForm, setJobForm] = useState<JobFormState>(createJobForm());
  const [propertyForm, setPropertyForm] = useState<PropertyFormState>(createPropertyForm());
  const [propertyEditorMode, setPropertyEditorMode] = useState<PropertyEditorMode>('edit');
  const [workerName, setWorkerName] = useState('');
  const [userDraft, setUserDraft] = useState<UserDraftState>(createUserDraft());
  const [userDraftBaseline, setUserDraftBaseline] = useState(() => serializeUserDraft(createUserDraft()));
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [passwordChangeDraft, setPasswordChangeDraft] = useState<PasswordChangeState>(createPasswordChangeForm());
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
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isRunningPhotoAudit, setIsRunningPhotoAudit] = useState(false);
  const [isSyncingStorageBackups, setIsSyncingStorageBackups] = useState(false);
  const [jobFilters, setJobFilters] = useState(createJobFilters());
  const activeTabRef = useRef(activeTab);
  const documentsLoadedRef = useRef(documentsLoaded);
  const adminDataLoadedRef = useRef(adminDataLoaded);
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
  const isSidebarVisible = isCompactViewport ? isMobileSidebarOpen : isDesktopSidebarExpanded;

  const allWorkers = useMemo(
    () => (bootstrap ? [...bootstrap.workers, ...bootstrap.inactiveWorkers] : []),
    [bootstrap],
  );
  const availableUserWorkers = useMemo(() => {
    const linkedWorkerIds = new Set(
      users
        .filter((user) => user.id !== editingUserId)
        .map((user) => user.linkedWorker?.id)
        .filter((value): value is string => Boolean(value)),
    );

    return allWorkers
      .filter((worker) => !linkedWorkerIds.has(worker.id))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [allWorkers, editingUserId, users]);
  const selectedProperty =
    bootstrap?.properties.find((property) => property.id === selectedPropertyId) ?? null;
  const filteredJobs = jobs.filter((job) => {
    if (jobFilters.propertyId && job.propertyId !== jobFilters.propertyId) return false;
    if (jobFilters.story && job.story !== jobFilters.story) return false;
    if (jobFilters.unit && job.unit !== jobFilters.unit) return false;
    if (jobFilters.area && job.area !== jobFilters.area) return false;
    if (jobFilters.service && job.service !== jobFilters.service) return false;
    if (!deferredSearch.trim()) return true;
    const haystack = [
      job.propertyName,
      job.story,
      formatStoryDisplayLabel(job.story),
      job.unit,
      job.area,
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
  const currentJobDraftSignature = useMemo(() => serializeJobFormDraft(jobForm), [jobForm]);
  const cleanJobDraftSignature = useMemo(() => {
    if (jobForm.id) {
      const savedJob = jobs.find((job) => job.id === jobForm.id);
      return savedJob
        ? serializeJobFormDraft(createEditableJobFormState(savedJob, bootstrap?.properties ?? []))
        : serializeJobFormDraft(jobForm);
    }

    return serializeJobFormDraft(createJobForm(bootstrap));
  }, [bootstrap, jobForm, jobs]);
  const currentPropertyDraftSignature = useMemo(
    () => serializePropertyFormDraft(propertyForm),
    [propertyForm],
  );
  const cleanPropertyDraftSignature = useMemo(
    () =>
      serializePropertyFormDraft(
        propertyEditorMode === 'edit'
          ? createPropertyFormFromSummary(selectedProperty)
          : createPropertyForm(),
      ),
    [propertyEditorMode, selectedProperty],
  );
  const currentUserDraftSignature = useMemo(() => serializeUserDraft(userDraft), [userDraft]);
  const emptyPasswordChangeSignature = useMemo(
    () => serializePasswordChangeDraft(createPasswordChangeForm()),
    [],
  );
  const currentPasswordChangeSignature = useMemo(
    () => serializePasswordChangeDraft(passwordChangeDraft),
    [passwordChangeDraft],
  );
  const hasUnsavedJobChanges =
    activeTab === 'new-job' && currentJobDraftSignature !== cleanJobDraftSignature;
  const hasUnsavedPropertyChanges =
    (activeTab === 'property-info' || activeTab === 'property-register') &&
    currentPropertyDraftSignature !== cleanPropertyDraftSignature;
  const hasUnsavedUserChanges =
    activeTab === 'settings' &&
    (currentUserDraftSignature !== userDraftBaseline ||
      currentPasswordChangeSignature !== emptyPasswordChangeSignature);
  const unsavedChangesContext = hasUnsavedJobChanges
    ? 'job form'
    : hasUnsavedPropertyChanges
      ? 'property form'
      : hasUnsavedUserChanges
        ? 'user form'
        : '';
  const hasUnsavedChanges = Boolean(unsavedChangesContext);

  const resetWorkspaceState = useCallback((loginErrorText = '') => {
    const freshUserDraft = createUserDraft();
    const freshPasswordDraft = createPasswordChangeForm();
    setCurrentUser(null);
    setBootstrap(null);
    setDashboard(null);
    setJobs([]);
    setGeneratedDocuments([]);
    setDocumentsLoaded(false);
    setWorkerHistory([]);
    setUsers([]);
    setAuditLogs([]);
    setPhotoAudit(null);
    setStorageBackupResult(null);
    setAdminDataLoaded(false);
    setLoginUsername('');
    setLoginPassword('');
    setLoginError(loginErrorText);
    setEditingUserId(null);
    setUserDraft(freshUserDraft);
    setUserDraftBaseline(serializeUserDraft(freshUserDraft));
    setPasswordChangeDraft(freshPasswordDraft);
  }, []);

  const refreshAll = useCallback(async (
    successMessage?: FlashMessage,
    options?: {
      includeDocuments?: boolean;
      includeAdminData?: boolean;
    },
  ) => {
    if (!currentUser) return;

    const activeTabValue = activeTabRef.current;
    const includeDocuments =
      options?.includeDocuments ??
      (documentsLoadedRef.current || tabNeedsDocuments(activeTabValue));
    const includeAdminData =
      options?.includeAdminData ??
      (canAdmin(currentUser) &&
        (adminDataLoadedRef.current || tabNeedsAdminData(activeTabValue)));

    setIsRefreshing(true);
    try {
      const [healthData, bootstrapData, dashboardData, jobsData, documentsData, historyData, usersData, auditLogData] =
        await Promise.all([
          requestJson<HealthPayload>('/api/health'),
          requestJson<BootstrapPayload>('/api/bootstrap'),
          requestJson<DashboardPayload>('/api/dashboard'),
          requestJson<JobRow[]>('/api/jobs'),
          includeDocuments
            ? requestJson<GeneratedDocumentHistoryItem[]>('/api/generated-documents')
            : Promise.resolve(null),
          includeAdminData
            ? requestJson<WorkerHistoryRow[]>('/api/workers/history')
            : Promise.resolve(null),
          includeAdminData
            ? requestJson<ManagedUser[]>('/api/users')
            : Promise.resolve(null),
          includeAdminData
            ? requestJson<AuditLogRow[]>('/api/audit-logs?limit=80')
            : Promise.resolve(null),
        ]);

      startTransition(() => {
        setHealth(healthData);
        setBootstrap(bootstrapData);
        setDashboard(dashboardData);
        setJobs(jobsData);
        if (documentsData) {
          setGeneratedDocuments(documentsData);
          setDocumentsLoaded(true);
        }
        if (historyData && usersData && auditLogData) {
          setWorkerHistory(historyData);
          setUsers(usersData);
          setAuditLogs(auditLogData);
          setAdminDataLoaded(true);
        }
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
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    documentsLoadedRef.current = documentsLoaded;
  }, [documentsLoaded]);

  useEffect(() => {
    adminDataLoadedRef.current = adminDataLoaded;
  }, [adminDataLoaded]);

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
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const syncSidebarViewport = () => {
      setIsCompactViewport(mediaQuery.matches);
      if (!mediaQuery.matches) {
        setIsMobileSidebarOpen(false);
      }
    };

    syncSidebarViewport();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncSidebarViewport);
      return () => mediaQuery.removeEventListener('change', syncSidebarViewport);
    }

    mediaQuery.addListener(syncSidebarViewport);
    return () => mediaQuery.removeListener(syncSidebarViewport);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(sidebarPreferenceKey, String(isDesktopSidebarExpanded));
  }, [isDesktopSidebarExpanded]);

  useEffect(() => {
    if (!isCompactViewport || !isMobileSidebarOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCompactViewport, isMobileSidebarOpen]);

  useEffect(() => {
    if (!currentUser) return;
    void refreshAll(undefined, {
      includeDocuments: false,
      includeAdminData: false,
    });
  }, [currentUser, refreshAll]);

  useEffect(() => {
    if (!currentUser) return;

    const shouldLoadDocuments = tabNeedsDocuments(activeTab) && !documentsLoaded;
    const shouldLoadAdminData =
      canAdmin(currentUser) && tabNeedsAdminData(activeTab) && !adminDataLoaded;

    if (!shouldLoadDocuments && !shouldLoadAdminData) {
      return;
    }

    void refreshAll(undefined, {
      includeDocuments: shouldLoadDocuments,
      includeAdminData: shouldLoadAdminData,
    });
  }, [activeTab, adminDataLoaded, currentUser, documentsLoaded, refreshAll]);

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

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const requireRole = (predicate: (user: AuthUser) => boolean, text: string) => {
    if (currentUser && predicate(currentUser)) {
      return true;
    }

    setMessage({ type: 'error', text });
    return false;
  };

  const confirmDiscardUnsavedChanges = useCallback(
    (destinationLabel: string) => {
      if (!hasUnsavedChanges) {
        return Promise.resolve(true);
      }

      return new Promise<boolean>((resolve) => {
        setConfirmDialog({
          title: 'Unsaved Changes',
          text: `You have unsaved changes in the ${unsavedChangesContext}. Continue to ${destinationLabel} and lose those changes?`,
          confirmLabel: 'Discard changes',
          cancelLabel: 'Keep editing',
          tone: 'warning',
          onConfirm: () => {
            resolve(true);
          },
          onCancel: () => {
            resolve(false);
          },
        });
      });
    },
    [hasUnsavedChanges, unsavedChangesContext],
  );

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

  const toggleSidebar = () => {
    if (isCompactViewport) {
      setIsMobileSidebarOpen((current) => !current);
      return;
    }

    setIsDesktopSidebarExpanded((current) => !current);
  };

  const closeSidebar = () => {
    if (isCompactViewport) {
      setIsMobileSidebarOpen(false);
      return;
    }

    setIsDesktopSidebarExpanded(false);
  };

  const syncPropertyTabMode = (tabId: TabId) => {
    if (tabId === 'property-register') {
      setPropertyEditorMode('create');
      setPropertyForm(createPropertyForm());
      return;
    }

    if (tabId === 'property-info') {
      setPropertyEditorMode('edit');
      setPropertyForm(createPropertyFormFromSummary(selectedProperty));
    }
  };

  const handleTabSelection = async (tabId: TabId) => {
    if (tabId !== activeTab && !(await confirmDiscardUnsavedChanges(pageMeta[tabId].title))) {
      return;
    }

    if (tabId !== activeTab) {
      syncPropertyTabMode(tabId);
    }

    setActiveTab(tabId);
    if (isCompactViewport) {
      setIsMobileSidebarOpen(false);
    }
  };

  const logout = async () => {
    if (!(await confirmDiscardUnsavedChanges('sign out'))) {
      return;
    }

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
    confirmDialog?.onCancel?.();
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

  const applyResetJobForm = () => {
    setJobForm(createJobForm(bootstrap));
  };

  const resetJobForm = async () => {
    if (!(await confirmDiscardUnsavedChanges('reset the job form'))) {
      return;
    }

    applyResetJobForm();
  };

  const updateJobTrackerFilter = (
    field: 'search' | 'propertyId' | 'story' | 'unit' | 'area' | 'service',
    value: string,
  ) => {
    setJobFilters((current) =>
      field === 'propertyId'
        ? {
            ...current,
            propertyId: value,
            story: '',
            unit: '',
            area: '',
            service: '',
          }
        : field === 'story'
          ? {
              ...current,
              story: value,
              unit: '',
              area: '',
              service: '',
            }
        : field === 'unit'
          ? {
              ...current,
              unit: value,
              area: '',
              service: '',
            }
        : field === 'area'
          ? {
              ...current,
              area: value,
              service: '',
            }
        : {
            ...current,
            [field]: value,
          },
    );
  };

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
            area: overrides?.area ?? job.area,
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
    formData.append('section', buildInternalSectionValue(job.story, job.unit, job.area || job.section || job.service));
    formData.append('area', job.area || '');
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

  const handleEditJob = async (job: JobRow) => {
    if (!requireRole(canManageJobs, 'Only admins and office users can edit jobs.')) return;
    if (!(await confirmDiscardUnsavedChanges('open another job'))) {
      return;
    }

    setActiveTab('new-job');
    setJobForm(createEditableJobFormState(job, bootstrap?.properties ?? []));
  };

  const openAdvanceCashAlertJob = (jobId: string) => {
    const targetJob = jobs.find((job) => job.id === jobId);
    if (!targetJob) return;
    void handleEditJob(targetJob);
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
      formData.append('section', buildInternalSectionValue(jobForm.story, jobForm.unit, jobForm.area || jobForm.service));
      formData.append('area', jobForm.area);
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
      applyResetJobForm();
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
          if (jobForm.id === jobId) applyResetJobForm();
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
        createEmptyPropertyStoryForm(`Floor ${current.stories.length + 1}`),
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

  const startCreateProperty = async () => {
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can register properties.')) return;
    if (!(await confirmDiscardUnsavedChanges('start a new property'))) {
      return;
    }

    setPropertyEditorMode('create');
    setPropertyForm(createPropertyForm());
  };

  const startEditSelectedProperty = async () => {
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can edit property details.')) return;
    if (!(await confirmDiscardUnsavedChanges('reload the saved property details'))) {
      return;
    }

    setPropertyEditorMode('edit');
    setPropertyForm(createPropertyFormFromSummary(selectedProperty));
  };

  const handlePropertySelection = async (propertyId: string) => {
    if (propertyId === selectedPropertyId) {
      return;
    }

    if (hasUnsavedPropertyChanges && !(await confirmDiscardUnsavedChanges('open another property'))) {
      return;
    }

    setSelectedPropertyId(propertyId);
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

  const resetUserDraftState = useCallback(() => {
    const freshUserDraft = createUserDraft();
    setEditingUserId(null);
    setUserDraft(freshUserDraft);
    setUserDraftBaseline(serializeUserDraft(freshUserDraft));
  }, []);

  const resetPasswordChangeState = useCallback(() => {
    setPasswordChangeDraft(createPasswordChangeForm());
  }, []);

  const startUserEdit = useCallback((userId: string) => {
    const user = users.find((item) => item.id === userId);
    if (!user) return;

    const nextDraft = createUserDraftFromManagedUser(user);
    setEditingUserId(user.id);
    setUserDraft(nextDraft);
    setUserDraftBaseline(serializeUserDraft(nextDraft));
  }, [users]);

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can manage users.')) return;

    setIsSavingUser(true);
    try {
      const isEditingUser = Boolean(editingUserId);
      const payload = isEditingUser
        ? {
            displayName: userDraft.displayName,
            password: userDraft.password,
            role: userDraft.role,
            workerId: userDraft.role === 'WORKER' ? userDraft.workerId : '',
          }
        : {
            ...userDraft,
            workerId: userDraft.role === 'WORKER' ? userDraft.workerId : '',
          };

      await requestJson<ManagedUser>(isEditingUser ? `/api/users/${editingUserId}` : '/api/users', {
        method: isEditingUser ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      resetUserDraftState();
      await refreshAll({ type: 'success', text: isEditingUser ? 'User updated.' : 'User created.' });
    } catch (error) {
      setMessage({ type: 'error', text: messageFrom(error) });
    } finally {
      setIsSavingUser(false);
    }
  };

  const submitPasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser) return;

    setIsChangingPassword(true);
    try {
      await requestJson<{ ok: boolean }>('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passwordChangeDraft),
      });
      resetPasswordChangeState();
      setMessage({ type: 'success', text: 'Password updated successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: messageFrom(error) });
    } finally {
      setIsChangingPassword(false);
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
          if (editingUserId === userId) {
            resetUserDraftState();
          }
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

  const runPhotoAudit = async () => {
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can run the photo audit.')) return;

    setIsRunningPhotoAudit(true);
    try {
      const payload = await requestJson<PhotoStorageAuditPayload>('/api/admin/storage-audit/photos');
      setPhotoAudit(payload);
      setMessage({
        type: payload.summary.missingPhotos ? 'info' : 'success',
        text: payload.summary.missingPhotos
          ? `Photo audit finished. ${payload.summary.missingPhotos} missing file(s) detected.`
          : 'Photo audit finished. No missing managed photos were detected.',
      });
    } catch (error) {
      setMessage({ type: 'error', text: messageFrom(error) });
    } finally {
      setIsRunningPhotoAudit(false);
    }
  };

  const syncStorageBackups = async () => {
    if (!requireRole((user) => user.role === 'ADMIN', 'Only admins can create storage backups.')) return;

    setIsSyncingStorageBackups(true);
    try {
      const payload = await requestJson<StorageBackupSyncPayload>('/api/admin/storage-backups/sync', {
        method: 'POST',
      });
      setStorageBackupResult(payload);
      setMessage({
        type: payload.summary.createdBackups || payload.summary.alreadyBackedUp ? 'success' : 'info',
        text: payload.summary.createdBackups
          ? `Storage backup finished. ${payload.summary.createdBackups} new backup copy(s) were created.`
          : 'Storage backup finished. No new copies were created.',
      });
    } catch (error) {
      setMessage({ type: 'error', text: messageFrom(error) });
    } finally {
      setIsSyncingStorageBackups(false);
    }
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
    <main
      className={`app-shell ${isSidebarVisible ? 'app-shell--sidebar-open' : 'app-shell--sidebar-hidden'} ${
        isCompactViewport ? 'app-shell--compact' : ''
      }`.trim()}
    >
      {isCompactViewport && isSidebarVisible ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={closeSidebar}
        />
      ) : null}

      <aside
        id="workspace-sidebar"
        className={`sidebar ${isSidebarVisible ? 'is-open' : 'is-hidden'} ${isCompactViewport ? 'is-compact' : ''}`.trim()}
        aria-hidden={isCompactViewport && !isSidebarVisible}
      >
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
            <button
              key={tab.id}
              type="button"
              className={`nav-button ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => void handleTabSelection(tab.id)}
            >
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
        <div className="content-shell-head">
          <button
            type="button"
            className={`sidebar-toggle ${isSidebarVisible ? 'is-open' : 'is-closed'}`}
            onClick={toggleSidebar}
            aria-controls="workspace-sidebar"
            aria-expanded={isSidebarVisible}
          >
            <UiIcon name={isSidebarVisible ? 'close' : 'menu'} size={18} />
            <span>{isSidebarVisible ? 'Hide menu' : 'Show menu'}</span>
          </button>
        </div>

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
            onCreateJob={() => void handleTabSelection('new-job')}
            onOpenSettings={() => void handleTabSelection('settings')}
            canCreateJob={canManageJobs(currentUser)}
            canOpenSettings={Boolean(currentUser)}
          />
        ) : null}

        {activeTab === 'new-job' ? (
          <JobsView
            bootstrap={bootstrap}
            workers={allWorkers}
            form={jobForm}
            isSaving={isSavingJob}
            onSubmit={submitJob}
            onReset={() => void resetJobForm()}
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
            onSelect={(propertyId) => void handlePropertySelection(propertyId)}
            onFieldChange={(field, value) => setPropertyForm((current) => ({ ...current, [field]: value }))}
            onAddStory={addPropertyStory}
            onStoryChange={updatePropertyStory}
            onRemoveStory={removePropertyStory}
            onAddUnit={addPropertyUnit}
            onUnitChange={updatePropertyUnit}
            onRemoveUnit={removePropertyUnit}
            onStartCreate={() => void startCreateProperty()}
            onStartEditSelected={() => void startEditSelectedProperty()}
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
            onSelect={(propertyId) => void handlePropertySelection(propertyId)}
            onFieldChange={(field, value) => setPropertyForm((current) => ({ ...current, [field]: value }))}
            onAddStory={addPropertyStory}
            onStoryChange={updatePropertyStory}
            onRemoveStory={removePropertyStory}
            onAddUnit={addPropertyUnit}
            onUnitChange={updatePropertyUnit}
            onRemoveUnit={removePropertyUnit}
            onStartCreate={() => void startCreateProperty()}
            onStartEditSelected={() => void startEditSelectedProperty()}
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
            onFilterChange={updateJobTrackerFilter}
            canManage={canManageJobs(currentUser)}
            onEdit={(job) => void handleEditJob(job)}
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
            workers={availableUserWorkers}
            auditLogs={auditLogs}
            photoAudit={photoAudit}
            storageBackupResult={storageBackupResult}
            draft={userDraft}
            editingUserId={editingUserId}
            isSavingUser={isSavingUser}
            passwordDraft={passwordChangeDraft}
            isChangingPassword={isChangingPassword}
            isRunningPhotoAudit={isRunningPhotoAudit}
            isSyncingStorageBackups={isSyncingStorageBackups}
            onSubmit={submitUser}
            onPasswordSubmit={submitPasswordChange}
            onRunPhotoAudit={() => void runPhotoAudit()}
            onSyncStorageBackups={() => void syncStorageBackups()}
            onFieldChange={(field, value) =>
              setUserDraft((current) => ({
                ...current,
                [field]: value,
                ...(field === 'role' && value !== 'WORKER' ? { workerId: '' } : {}),
              }))
            }
            onPasswordFieldChange={(field, value) =>
              setPasswordChangeDraft((current) => ({
                ...current,
                [field]: value,
              }))
            }
            onStartEdit={startUserEdit}
            onCancelEdit={resetUserDraftState}
            onCancelPasswordEdit={resetPasswordChangeState}
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
          cancelLabel={confirmDialog?.cancelLabel}
          tone={confirmDialog?.tone}
          busy={isConfirmingAction}
          onConfirm={() => void runConfirmAction()}
          onCancel={closeConfirmDialog}
        />
      </section>

      {showAdvanceCashAlerts ? (
        <AdvanceCashAlertsBell
          alerts={advanceCashAlerts}
          onOpenJob={openAdvanceCashAlertJob}
        />
      ) : null}
    </main>
  );
}
