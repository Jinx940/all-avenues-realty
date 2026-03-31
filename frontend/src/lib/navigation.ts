import type { UiIconName } from '../components/UiIcon';
import type { AuthUser, TabId } from '../types';

export const tabs: Array<{ id: TabId; label: string; icon: UiIconName }> = [
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

export const pageMeta: Record<TabId, { title: string; description: string }> = {
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
      'Change your password and, if you are an admin, manage users and system controls.',
  },
};

export const roleTabs: Record<AuthUser['role'], TabId[]> = {
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
    'settings',
  ],
  WORKER: ['dashboard', 'property-info', 'job-tracker', 'document-center', 'settings'],
  VIEWER: ['dashboard', 'property-info', 'job-tracker', 'document-center', 'settings'],
};

export const sidebarPreferenceKey = 'aar-sidebar-expanded';

export function readStoredSidebarPreference() {
  if (typeof window === 'undefined') return true;

  const storedValue = window.localStorage.getItem(sidebarPreferenceKey);
  if (storedValue == null) return true;
  return storedValue === 'true';
}
