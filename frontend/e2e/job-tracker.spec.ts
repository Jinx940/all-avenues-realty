import { expect, test, type Page } from '@playwright/test';
import type { AuthUser, BootstrapPayload, JobRow, PropertySummary, TrackerLabel } from '../src/types';

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
  jobs = structuredClone(jobs);
  let trackerLabels: TrackerLabel[] = [];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST' && path.endsWith('/tracker/files')) {
      const item = jobs.find((job) => job.id === path.split('/')[3])!;
      const body = route.request().postDataBuffer()!.toString();
      const category = body.includes('name="before"') ? 'before' : 'after';
      expect(body).toContain('filename="repair.png"');
      item.files[category].push({ id: 'uploaded-photo', category: category.toUpperCase(), name: 'repair.png', url: '/api/uploaded-photo.png', mimeType: 'image/png', size: 68, createdAt: '2026-09-10T14:00:00Z' });
      await route.fulfill({ json: item });
      return;
    }
    if (path === '/api/uploaded-photo.png') {
      await route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64') });
      return;
    }
    if (route.request().method() === 'PATCH' && path.endsWith('/tracker')) {
      const id = path.split('/')[3];
      const job = jobs.find((item) => item.id === id)!;
      const changes = route.request().postDataJSON();
      Object.assign(job, changes);
      job.totalCost = job.laborCost + job.materialCost;
      if (changes.workerIds) job.workers = bootstrap.workers.filter((worker) => changes.workerIds.includes(worker.id));
      if (changes.status) job.completedAt = changes.status === 'DONE' ? '2026-09-10T14:00:00Z' : null;
      await route.fulfill({ json: job });
      return;
    }
    if (route.request().method() === 'PUT' && path === '/api/job-tracker/labels') {
      const changes: TrackerLabel[] = route.request().postDataJSON();
      trackerLabels = [...trackerLabels.filter((item) => !changes.some((label) => item.kind === label.kind && item.value === label.value)), ...changes];
      await route.fulfill({ json: trackerLabels });
      return;
    }
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${path}`);
    const payload = path === '/api/auth/session' ? { user: { id: 'test', username: 'test', displayName: 'Preview User', role, status: 'ACTIVE', workerId: null } }
      : path === '/api/bootstrap' ? { ...bootstrap, trackerLabels }
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
  await page.getByRole('button', { name: 'Cambiar estado: Drywall', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Bloqueado');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Editar pago: Drywall', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Pago parcial');
  await page.keyboard.press('Escape');
  await page.getByRole('table', { name: 'Trabajos de Saranac Rd', exact: true }).getByRole('button', { name: 'Añadir trabajo' }).click();
  await expect(page.getByRole('combobox', { name: 'Property *', exact: true })).toHaveValue('saranac');
});

test('viewer has read-only actions and the mobile board scrolls within the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTracker(page, sampleJobs, 'VIEWER');
  await expect(page.getByRole('button', { name: 'Nuevo trabajo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Añadir trabajo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar Plumbing', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cambiar estado: Drywall' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cambiar prioridad: Drywall' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Editar cronograma: Drywall' })).toHaveCount(0);
  for (const field of ['responsables', 'vencimiento', 'notas', 'pago', 'mano de obra', 'material']) {
    await expect(page.getByRole('button', { name: `Editar ${field}: Drywall`, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: 'Después de Drywall: 0 archivos' })).toHaveCount(0);
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

test('edits status and priority, renames labels and retains changes after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openTracker(page);
  await page.getByRole('button', { name: 'Hide menu', exact: true }).click();
  const state = page.getByRole('button', { name: 'Cambiar estado: Plumbing', exact: true });
  await state.click();
  await page.screenshot({ path: 'test-results/tracker-status-menu.png' });
  await page.getByRole('dialog').getByRole('button', { name: 'Bloqueado', exact: true }).click();
  await expect(state).toHaveText('Bloqueado');
  await state.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Completado', exact: true }).click();
  await expect(state).toHaveText('Completado');
  const priority = page.getByRole('button', { name: 'Cambiar prioridad: Plumbing', exact: true });
  await priority.click();
  await page.screenshot({ path: 'test-results/tracker-priority-menu.png' });
  await page.getByRole('dialog').getByRole('button', { name: 'Alta', exact: true }).click();
  await expect(priority).toHaveText('Alta');
  await priority.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Editar etiquetas' }).click();
  await page.getByRole('textbox', { name: 'Nombre de HIGH' }).fill('Urgente');
  await page.getByLabel('Color de HIGH', { exact: true }).fill('#542090');
  await page.getByRole('button', { name: 'Guardar etiquetas' }).click();
  await expect(priority).toHaveText('Urgente');
  await page.reload();
  await page.getByRole('button', { name: 'Show menu', exact: true }).click();
  await page.getByRole('button', { name: 'Job Tracker', exact: true }).click();
  await expect(priority).toHaveText('Urgente');
  await expect(state).toHaveText('Completado');
  await priority.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sin prioridad', exact: true }).click();
  await expect(priority).toHaveText('Sin prioridad');
});

test('calendar selects a range, validates input and persists dates', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openTracker(page);
  await page.getByRole('button', { name: 'Hide menu', exact: true }).click();
  const timeline = page.getByRole('button', { name: 'Editar cronograma: Plumbing', exact: true });
  await timeline.click();
  await page.getByRole('button', { name: '2026-08-27', exact: true }).click();
  await page.getByRole('button', { name: '2026-08-29', exact: true }).click();
  await expect(page.getByText('3 días seleccionados', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/tracker-calendar.png' });
  await page.getByRole('button', { name: 'Guardar fechas' }).click();
  await expect(timeline.locator('.jt-timeline-dates')).toHaveText('Aug 27 – Aug 29');
  await timeline.click();
  await page.getByLabel('Fecha final', { exact: true }).fill('2026-08-20');
  await expect(page.getByRole('button', { name: 'Guardar fechas' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(timeline.locator('.jt-timeline-dates')).toHaveText('Aug 27 – Aug 29');
  await timeline.click();
  await page.getByRole('button', { name: 'Quitar fechas' }).click();
  await page.getByRole('button', { name: 'Guardar fechas' }).click();
  await expect(timeline).toHaveText('Sin fechas');
});

test('summary menu switches modes without filtering out jobs', async ({ page }) => {
  await openTracker(page);
  const summary = page.getByRole('button', { name: 'Resumen de estado de Glynn', exact: true });
  await summary.click();
  await expect(page.getByRole('dialog')).toHaveText("All LabelsWhat's Done");
  await page.getByRole('radio', { name: "What's Done", exact: true }).check();
  await expect(summary.getByRole('img')).toHaveAttribute('aria-label', '2 Completado, 1 Sin completar');
  await expect(page.getByRole('button', { name: 'Cambiar estado: Drywall', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Resumen de prioridad de Glynn', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveText("All LabelsWhat's Done");
  await page.getByRole('radio', { name: "What's Done", exact: true }).check();
  await page.getByRole('button', { name: 'Resumen de prioridad de Glynn', exact: true }).click();
  await expect(page.getByRole('radio', { name: "What's Done", exact: true })).toBeChecked();
  await page.getByRole('radio', { name: 'All Labels', exact: true }).check();
  await page.getByRole('dialog').screenshot({ path: 'test-results/tracker-summary-menu.png' });
  await page.getByRole('heading', { name: 'Job Tracker', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('failed inline saves keep the original value and allow retry', async ({ page }) => {
  await openTracker(page);
  let fail = true;
  await page.route('**/api/jobs/drywall/tracker', async (route) => {
    if (fail) { fail = false; await route.fulfill({ status: 500, json: { message: 'No se pudo guardar. Reintenta.' } }); }
    else await route.fallback();
  });
  const state = page.getByRole('button', { name: 'Cambiar estado: Drywall', exact: true });
  await state.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Bloqueado', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('No se pudo guardar. Reintenta.');
  await expect(state).toHaveText('En proceso');
  await page.getByRole('dialog').getByRole('button', { name: 'Bloqueado', exact: true }).click();
  await expect(state).toHaveText('Bloqueado');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('inline editors remain usable inside the horizontally scrolling mobile board', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTracker(page);
  await page.getByRole('button', { name: 'Cambiar prioridad: Plumbing', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await dialog.getByRole('button', { name: 'Alta', exact: true }).click();
  await page.getByRole('button', { name: 'Editar cronograma: Plumbing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Guardar fechas' })).toBeVisible();
  await page.screenshot({ path: 'test-results/tracker-mobile-calendar.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('edits notes and USD amounts in the full cell, recalculates totals and retains values', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openTracker(page);
  await page.getByRole('button', { name: 'Hide menu', exact: true }).click();
  const notes = page.getByRole('button', { name: 'Editar notas: Plumbing', exact: true });
  const cell = await notes.locator('..').boundingBox();
  const button = await notes.boundingBox();
  expect(button!.width).toBeGreaterThanOrEqual(cell!.width - 2);
  expect(button!.height).toBeGreaterThanOrEqual(cell!.height - 2);
  await notes.click();
  await page.getByRole('textbox', { name: 'Notas', exact: true }).fill('First line\nSecond line');
  await page.screenshot({ path: 'test-results/tracker-inline-notes.png' });
  await page.getByRole('textbox', { name: 'Notas', exact: true }).press('Enter');
  await expect(notes).toHaveText('First line Second line');
  const material = page.getByRole('button', { name: 'Editar material: Plumbing', exact: true });
  await material.click();
  const input = page.getByRole('textbox', { name: 'Material', exact: true });
  await input.fill('$1,234.56');
  const saved = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().endsWith('/plumbing/tracker'));
  await input.press('Enter');
  expect((await saved).postDataJSON()).toEqual({ materialCost: 1234.56 });
  await expect(material).toHaveText('$1,234.56');
  await expect(page.getByRole('table', { name: 'Trabajos de Glynn', exact: true }).locator('tfoot')).toContainText('$5,084.56');
  await material.click();
  await input.fill('999');
  await input.press('Escape');
  await expect(material).toHaveText('$1,234.56');
  await page.reload();
  await page.getByRole('button', { name: 'Show menu', exact: true }).click();
  await page.getByRole('button', { name: 'Job Tracker', exact: true }).click();
  await expect(material).toHaveText('$1,234.56');
  await notes.click();
  await expect(page.getByRole('textbox', { name: 'Notas', exact: true })).toHaveValue('First line\nSecond line');
  await page.getByRole('textbox', { name: 'Notas', exact: true }).fill('');
  await page.getByRole('heading', { name: 'Job Tracker', exact: true }).click();
  await expect(notes).toHaveText('—');
});

test('invalid amounts and failed saves keep the draft available for correction', async ({ page }) => {
  await openTracker(page);
  const labor = page.getByRole('button', { name: 'Editar mano de obra: Drywall', exact: true });
  await labor.click();
  const input = page.getByRole('textbox', { name: 'Mano de obra', exact: true });
  await input.fill('-5');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Use USD');
  let fail = true;
  await page.route('**/api/jobs/drywall/tracker', async (route) => {
    if (fail) { fail = false; await route.fulfill({ status: 500, json: { message: 'Try again' } }); }
    else await route.fallback();
  });
  await input.fill('100.25');
  await input.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Try again');
  await expect(input).toHaveValue('100.25');
  await input.press('Enter');
  await expect(labor).toHaveText('$100.25');
});

test('changes owners and any payment status without opening the job form', async ({ page }) => {
  await openTracker(page);
  const owner = page.getByRole('button', { name: 'Editar responsables: Cleaning', exact: true });
  await owner.click();
  await page.getByRole('checkbox', { name: 'Ryan Goertler', exact: true }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(owner.getByLabel('Ryan Goertler', { exact: true })).toBeVisible();
  const payment = page.getByRole('button', { name: 'Editar pago: Plumbing', exact: true });
  await payment.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Pendiente', exact: true }).click();
  await expect(payment).toHaveText('Pendiente');
  await payment.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Pago parcial', exact: true }).click();
  await page.getByRole('textbox', { name: 'Adelanto (USD $)', exact: true }).fill('25.50');
  const saved = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().endsWith('/plumbing/tracker'));
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click();
  expect((await saved).postDataJSON()).toEqual({ paymentStatus: 'PARTIAL_PAYMENT', advanceCashApp: 25.5 });
  await expect(payment).toHaveText('Pago parcial');
  await page.reload();
  await page.getByRole('button', { name: 'Job Tracker', exact: true }).click();
  await expect(owner.getByLabel('Ryan Goertler', { exact: true })).toBeVisible();
  await expect(payment).toHaveText('Pago parcial');
  await owner.click();
  await page.getByRole('button', { name: 'Sin asignar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(owner.getByLabel('Sin asignar', { exact: true })).toBeVisible();
});

test('due dates update timeline duration on hover and can be cleared independently', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openTracker(page);
  await page.getByRole('button', { name: 'Hide menu', exact: true }).click();
  const timeline = page.getByRole('button', { name: 'Editar cronograma: Plumbing', exact: true });
  await timeline.hover();
  await expect(timeline.locator('.jt-timeline-days')).toBeVisible();
  await expect(timeline.locator('.jt-timeline-days')).toHaveText('5d');
  const due = page.getByRole('button', { name: 'Editar vencimiento: Plumbing', exact: true });
  await due.click();
  await page.getByLabel('Fecha de vencimiento', { exact: true }).fill('2026-08-30');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(due).toHaveText('Aug 30');
  await timeline.hover();
  await expect(timeline.locator('.jt-timeline-days')).toHaveText('4d');
  await page.screenshot({ path: 'test-results/tracker-editable-duration.png' });
  await page.getByRole('heading', { name: 'Job Tracker', exact: true }).hover();
  await expect(timeline.locator('.jt-timeline-dates')).toBeVisible();
  await due.click();
  const saved = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().endsWith('/plumbing/tracker'));
  await page.getByRole('button', { name: 'Quitar fecha', exact: true }).click();
  expect((await saved).postDataJSON()).toEqual({ dueDate: null });
  await expect(due).toHaveText('—');
  await expect(timeline.locator('.jt-timeline-dates')).toContainText('Aug 27');
  await expect(timeline.locator('.jt-timeline-days')).toHaveCount(0);
});

test('adds photos from an empty cell and keeps them after reload', async ({ page }) => {
  await openTracker(page);
  await page.getByRole('button', { name: 'Después de Drywall: 0 archivos', exact: true }).click();
  await page.getByLabel('Añadir fotos', { exact: true }).setInputFiles({ name: 'repair.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64') });
  await expect(page.getByRole('dialog')).toContainText('repair.png');
  await expect(page.getByRole('button', { name: 'Eliminar archivo repair.png' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar archivos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Después de Drywall: 1 archivos', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Job Tracker', exact: true }).click();
  await page.getByRole('button', { name: 'Después de Drywall: 1 archivos', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('repair.png');
});
