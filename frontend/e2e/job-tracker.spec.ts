import { expect, test, type Page } from '@playwright/test';
import type { AuthUser, BootstrapPayload, JobRow, PropertySummary } from '../src/types';

const property = (id: string, name: string): PropertySummary => ({
  id, name, address: null, cityLine: null, notes: null, coverImageUrl: null, stories: [],
  totalJobs: 0, openJobs: 0, lateJobs: 0, floors: null, bedrooms: null, bathrooms: null,
  halfBathrooms: null, livingRooms: null, diningRooms: null, kitchens: null, sunroom: null,
  garages: null, attic: null, frontPorch: null, backPorch: null,
});
const bootstrap: BootstrapPayload = {
  properties: [property('glynn', 'Glynn'), property('saranac', 'Saranac Rd')],
  workers: [{ id: 'ryan', name: 'Ryan Goertler', status: 'ACTIVE', statusLabel: 'Active', totalJobCount: 3, linkedUserCount: 0, canDelete: false }],
  inactiveWorkers: [],
  statuses: [{ value: 'PENDING', label: 'Pending' }, { value: 'IN_PROGRESS', label: 'In Progress' }, { value: 'DONE', label: 'Done' }],
  invoiceStatuses: [{ value: 'NO', label: 'No' }, { value: 'YES', label: 'Yes' }],
  paymentStatuses: [{ value: 'UNPAID', label: 'Unpaid' }, { value: 'PAID', label: 'Paid' }, { value: 'PARTIAL_PAYMENT', label: 'Partial Payment' }],
};
const job = (id: string, overrides: Partial<JobRow> = {}): JobRow => ({
  id, propertyId: 'glynn', propertyName: 'Glynn', story: 'Floor 1', unit: 'Unit 1', section: '',
  area: 'Kitchen', service: 'Plumbing', description: 'Replace supply lines and inspect fixtures.',
  materialCost: 1700, laborCost: 2650, totalCost: 4350, status: 'DONE', statusLabel: 'Done',
  invoiceStatus: 'YES', invoiceStatusLabel: 'Yes', paymentStatus: 'PAID', paymentStatusLabel: 'Paid',
  advanceCashApp: 0, startDate: '2026-08-27T00:00:00.000Z', dueDate: '2026-08-31T00:00:00.000Z',
  completedAt: '2026-08-29T00:00:00.000Z', timeline: { label: 'Completed', tone: 'success', isLate: false },
  workers: [{ id: 'ryan', name: 'Ryan Goertler', status: 'ACTIVE', statusLabel: 'Active' }],
  workerIds: ['ryan'], files: { before: [], after: [], progress: [], receipt: [], invoice: [], quote: [] },
  createdAt: '2026-08-27T00:00:00.000Z', updatedAt: '2026-09-10T14:00:00.000Z', ...overrides,
});
const sampleJobs = [
  job('plumbing', { files: { before: Array.from({ length: 4 }, (_, index) => ({ id: `file-${index}`, category: 'BEFORE', name: `Inspection ${index + 1}.pdf`, url: '/api/test-file.pdf', mimeType: 'application/pdf', size: 100, createdAt: '2026-08-27T00:00:00Z' })), after: [], progress: [], receipt: [], invoice: [], quote: [] } }),
  job('drywall', { service: 'Drywall', description: 'Finish walls in the living room.', area: 'Living room', laborCost: 450, materialCost: 0, totalCost: 450, status: 'IN_PROGRESS', statusLabel: 'In Progress', completedAt: null, paymentStatus: 'UNPAID', paymentStatusLabel: 'Unpaid', startDate: '2026-09-09T00:00:00Z', dueDate: '2026-09-19T00:00:00Z', timeline: { label: 'In Progress', tone: 'neutral', isLate: false } }),
  job('cleaning', { service: 'Cleaning', description: 'Final cleaning before the walkthrough.', area: 'House', laborCost: 750, materialCost: 0, totalCost: 750, workers: [], workerIds: [] }),
  job('electrical', { propertyId: 'saranac', propertyName: 'Saranac Rd', service: 'Electrical', area: 'Basement', laborCost: 300, materialCost: 93.83, totalCost: 393.83, status: 'PENDING', statusLabel: 'Pending', completedAt: null, paymentStatus: 'PARTIAL_PAYMENT', paymentStatusLabel: 'Partial Payment', advanceCashApp: 50, startDate: '2026-09-01T00:00:00Z', dueDate: '2026-09-08T00:00:00Z', timeline: { label: 'Overdue', tone: 'danger', isLate: true } }),
];

async function openTracker(page: Page, jobs = sampleJobs, role: AuthUser['role'] = 'OFFICE') {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${path}`);
    const payload = path === '/api/auth/session' ? { user: { id: 'test', username: 'test', displayName: 'Preview User', role, status: 'ACTIVE', workerId: null } }
      : path === '/api/bootstrap' ? bootstrap
      : path === '/api/jobs' ? jobs
      : path === '/api/health' ? { status: 'ok', database: 'up', timestamp: '2026-09-10T14:00:00Z' }
      : [];
    await route.fulfill({ json: payload });
  });
  await page.goto('/');
  if ((page.viewportSize()?.width ?? 1920) < 650) {
    await page.getByRole('button', { name: 'Show menu', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Job Tracker', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Job Tracker', exact: true })).toBeVisible();
}

test('groups, filtered totals, monthly filtering, selection and empty state', async ({ page }) => {
  await openTracker(page);
  const glynn = page.getByRole('table', { name: 'Trabajos de Glynn', exact: true });
  await expect(glynn.locator('tfoot')).toContainText('$5,550.00');
  await page.getByRole('checkbox', { name: 'Seleccionar trabajos de Glynn', exact: true }).check();
  await expect(page.getByRole('status').filter({ hasText: '3 seleccionados' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar selección' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('Plumbing');
  expect(csv).not.toContain('Electrical');
  await page.getByRole('button', { name: 'Glynn', exact: true }).click();
  await expect(glynn).toBeHidden();
  await page.getByRole('button', { name: 'Glynn', exact: true }).click();
  await expect(glynn).toBeVisible();
  await page.getByLabel('Mes', { exact: true }).fill('2026-09');
  await expect(glynn.locator('tfoot')).toContainText('$450.00');
  await expect(page.getByRole('button', { name: 'Exportar selección' })).toHaveCount(0);
  await page.getByPlaceholder('Propiedad, servicio o trabajador...').fill('no-matching-job');
  await expect(page.getByText('No hay trabajos que coincidan con los filtros activos.')).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await expect(glynn.locator('tfoot')).toContainText('$5,550.00');
});

test('keeps totals for the full group when revealing more jobs', async ({ page }) => {
  await openTracker(page, Array.from({ length: 12 }, (_, index) => job(`job-${index}`, { service: `Task ${index + 1}`, materialCost: 0, laborCost: 10, totalCost: 10 })));
  const table = page.getByRole('table', { name: 'Trabajos de Glynn', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(11);
  await expect(table.locator('tfoot')).toContainText('$120.00');
  await page.getByRole('button', { name: 'Mostrar 2 más' }).click();
  await expect(table.locator('tbody tr')).toHaveCount(13);
  await expect(table.locator('tfoot')).toContainText('$120.00');
});

test('opens all attachments and preserves existing status and create flows', async ({ page }) => {
  await openTracker(page);
  await page.getByRole('button', { name: 'Antes de Plumbing: 4 archivos', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Inspection 4.pdf');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Marcar como completado: Drywall', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Change Work Status');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Marcar como pagado: Drywall', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Change Payment Status');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('table', { name: 'Trabajos de Saranac Rd', exact: true }).getByRole('button', { name: 'Añadir trabajo' }).click();
  await expect(page.getByRole('combobox', { name: 'Property *', exact: true })).toHaveValue('saranac');
});

test('viewer has read-only actions and the mobile board scrolls within the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTracker(page, sampleJobs, 'VIEWER');
  await expect(page.getByRole('button', { name: 'Nuevo trabajo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Añadir trabajo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar Plumbing', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Marcar como completado: Drywall' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const scroll = page.getByRole('region', { name: 'Trabajos de Glynn', exact: true });
  expect(await scroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/job-tracker-mobile.png', fullPage: true });
});

test('desktop design preview', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openTracker(page);
  await page.getByRole('button', { name: 'Hide menu', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Seleccionar Plumbing', exact: true }).check();
  await page.screenshot({ path: 'test-results/job-tracker-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});
