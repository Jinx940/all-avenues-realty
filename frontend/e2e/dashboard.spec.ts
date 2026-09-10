import { expect, test, type Page } from '@playwright/test';
import type { AuthUser, BootstrapPayload, JobRow, PropertySummary } from '../src/types';

const property = (id: string, name: string, address: string): PropertySummary => ({
  id, name, address, cityLine: 'Cleveland, OH', notes: null, coverImageUrl: null, stories: [],
  totalJobs: 0, openJobs: 0, lateJobs: 0, floors: null, bedrooms: null, bathrooms: null,
  halfBathrooms: null, livingRooms: null, diningRooms: null, kitchens: null, sunroom: null,
  garages: null, attic: null, frontPorch: null, backPorch: null,
});
const bootstrap: BootstrapPayload = {
  properties: [property('glynn', 'Glynn', '4256 E 119th St'), property('saranac', 'Saranac Rd', '5504 Linton Ave')],
  workers: [{ id: 'ryan', name: 'Ryan Goertler', status: 'ACTIVE', statusLabel: 'Active', totalJobCount: 3, linkedUserCount: 0, canDelete: false }],
  inactiveWorkers: [],
  statuses: [{ value: 'PENDING', label: 'Not started' }, { value: 'IN_PROGRESS', label: 'Working on it' }, { value: 'DONE', label: 'Done' }],
  invoiceStatuses: [{ value: 'NO', label: 'No' }, { value: 'YES', label: 'Yes' }],
  paymentStatuses: [{ value: 'UNPAID', label: 'Unpaid' }, { value: 'PAID', label: 'Paid' }],
  trackerLabels: [{ kind: 'status', value: 'DONE', label: 'Finished', color: '#008c60' }],
};
const job = (id: string, service: string, overrides: Partial<JobRow> = {}): JobRow => ({
  id, propertyId: 'glynn', propertyName: 'Glynn', story: '', unit: '', section: '', area: 'House', service, description: 'Inspect and complete the repair.',
  materialCost: 450, laborCost: 2650, totalCost: 3100, status: 'IN_PROGRESS', statusLabel: 'Working on it',
  invoiceStatus: 'NO', invoiceStatusLabel: 'No', paymentStatus: 'UNPAID', paymentStatusLabel: 'Unpaid', advanceCashApp: 0,
  startDate: '2026-09-10T00:00:00Z', dueDate: '2026-09-12T00:00:00Z', completedAt: null,
  timeline: { label: 'On track', tone: 'neutral', isLate: false },
  workers: [{ id: 'ryan', name: 'Ryan Goertler', status: 'ACTIVE', statusLabel: 'Active' }], workerIds: ['ryan'],
  files: { before: [], after: [], progress: [], receipt: [], invoice: [], quote: [] },
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-10T14:00:00Z', ...overrides,
});
const jobs = [
  job('roof', 'Roof repair'),
  job('drywall', 'Drywall patches', { propertyId: 'saranac', propertyName: 'Saranac Rd', startDate: '2026-09-09T00:00:00Z', dueDate: '2026-09-10T00:00:00Z' }),
  job('plumbing', 'Plumbing – Water heater', { area: 'Basement', status: 'PENDING' }),
  job('cleaning', 'Property cleaning', { status: 'PLANNING', startDate: '2026-09-10', dueDate: '2026-09-18' }),
  job('deck', 'Deck repair', { status: 'STUCK', area: 'Deck', startDate: '2026-09-08', dueDate: '2026-09-10' }),
  job('done', 'Final inspection', { status: 'DONE', startDate: '2026-09-03', dueDate: '2026-09-05', completedAt: '2026-09-04' }),
  job('overdue', 'Window repair', { dueDate: '2026-09-09', startDate: '2026-09-07' }),
  job('undated', 'Unscheduled electrical', { startDate: null, dueDate: null }),
  job('old', 'Previous year job', { startDate: '2025-12-01', dueDate: '2025-12-02', status: 'DONE', completedAt: '2025-12-02' }),
];

async function openDashboard(page: Page, role: AuthUser['role'] = 'ADMIN', sampleJobs = jobs) {
  await page.clock.setFixedTime(new Date('2026-09-10T14:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('aar-sidebar-expanded', 'false'));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${path}`);
    const json = path === '/api/auth/session' ? { user: { id: 'test', username: 'test', displayName: 'Preview User', role, status: 'ACTIVE', workerId: null } }
      : path === '/api/bootstrap' ? bootstrap
      : path === '/api/jobs' ? sampleJobs
      : path === '/api/health' ? { status: 'ok', database: 'up', timestamp: '2026-09-10T14:00:00Z' } : [];
    await route.fulfill({ json });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-busy', 'false');
}

test('calendar follows actual ranges, shows selected-day jobs and switches views', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1040 });
  await openDashboard(page);
  const calendar = page.getByRole('region', { name: 'Job calendar', exact: true });
  await expect(calendar.getByRole('heading', { name: 'September 2026' })).toBeVisible();
  await expect(page.getByRole('region', { name: "Today's Jobs", exact: true }).locator('.db-job-card')).toHaveCount(5);
  await expect(page.getByRole('region', { name: 'Upcoming Deadlines', exact: true })).not.toContainText('Final inspection');
  await expect(page.getByRole('region', { name: 'Upcoming Deadlines', exact: true })).toContainText('1 overdue job');
  await expect(calendar).toContainText('1 unscheduled');
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await calendar.getByRole('button', { name: 'September 12, 2026, 3 jobs', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Sep 12 Jobs', exact: true }).locator('.db-job-card')).toHaveCount(3);
  await calendar.getByRole('button', { name: 'Day', exact: true }).click();
  await expect(calendar.getByLabel('Day agenda')).toContainText('$3,100.00');
  await expect(calendar.getByLabel('Day agenda')).toContainText('Ryan Goertler');
  await calendar.getByRole('button', { name: 'Week', exact: true }).click();
  await expect(calendar.locator('.db-calendar-cell')).toHaveCount(7);
  await calendar.getByRole('button', { name: 'Month', exact: true }).click();
  await calendar.getByRole('button', { name: 'Next month' }).click();
  await expect(calendar.getByRole('heading', { name: 'October 2026' })).toBeVisible();
  await calendar.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(calendar.getByRole('heading', { name: 'September 2026' })).toBeVisible();
});

test('property, search and chart filters use real jobs and custom board labels', async ({ page }) => {
  await openDashboard(page);
  const chart = page.getByRole('region', { name: 'Jobs by Status', exact: true });
  await expect(chart.getByRole('img')).toHaveAttribute('aria-label', /^9 total jobs/);
  await expect(chart).toContainText('Finished');
  await chart.getByLabel('Status date range').selectOption('year');
  await expect(chart.getByRole('img')).toHaveAttribute('aria-label', /^8 total jobs/);
  await page.getByLabel('Dashboard property').selectOption('saranac');
  await expect(page.locator('.db-today-list .db-job-card')).toHaveCount(1);
  await expect(chart.getByRole('img')).toHaveAttribute('aria-label', /^1 total jobs/);
  await page.getByLabel('Dashboard property').selectOption('');
  await page.getByLabel('Search dashboard').fill('water heater');
  await expect(page.locator('.db-search-results')).toContainText('1 matching job');
  await expect(page.locator('.db-today-list .db-job-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear dashboard search' }).click();
  await chart.getByRole('button', { name: /Stuck/ }).click();
  await expect(page.locator('.db-today-list .db-job-card')).toHaveCount(1);
  await expect(page.locator('.db-active-filter')).toContainText('Showing Stuck');
  await page.getByRole('button', { name: 'Clear status' }).click();
  await expect(page.locator('.db-today-list .db-job-card')).toHaveCount(5);
});

test('job cards open the real editor and scheduling prefills the selected date', async ({ page }) => {
  await openDashboard(page);
  await page.locator('.db-today-list').getByRole('button', { name: /Roof repair/ }).click();
  await expect(page.getByRole('combobox', { name: 'Property *', exact: true })).toHaveValue('glynn');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'September 18, 2026, 1 job', exact: true }).click();
  await page.getByRole('button', { name: 'Schedule Job', exact: true }).click();
  await expect(page.locator('input[type="date"]').first()).toHaveValue('2026-09-18');
  await expect(page.locator('input[type="date"]').nth(1)).toHaveValue('2026-09-18');
});

test('invoice and estimate shortcuts choose the correct document type', async ({ page }) => {
  await openDashboard(page);
  await page.getByRole('button', { name: 'New Estimate', exact: true }).click();
  await expect(page.locator('select').filter({ has: page.locator('option[value="Quote"]') })).toHaveValue('Quote');
  await page.goto('/');
  await page.getByRole('button', { name: 'Create Invoice', exact: true }).click();
  await expect(page.locator('select').filter({ has: page.locator('option[value="Quote"]') })).toHaveValue('Invoice');
});

test('empty dashboard fits mobile and viewer cannot see creation actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page, 'VIEWER', []);
  await expect(page.getByRole('button', { name: 'Add Job', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create Invoice', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add Property', exact: true })).toHaveCount(0);
  await expect(page.locator('.db-today-list')).toContainText('A clear schedule');
  await expect(page.locator('.db-donut svg')).toHaveAttribute('aria-label', /^0 total jobs/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'View Schedule', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Operations Calendar' })).toBeVisible();
});
