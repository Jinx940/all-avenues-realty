import { expect, test, type Page } from '@playwright/test';
import type { AuthUser, BootstrapPayload, JobRow, PropertySummary, TrackerLabel, TrackerColumn } from '../src/types';

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
  for (const item of jobs) item.subitems ??= item.description.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean).map((description, index) => ({
    id: `${item.id}-subitem-${index}`, description, status: item.status, dueDate: item.dueDate, workerIds: [...item.workerIds], workers: structuredClone(item.workers),
  }));
  let trackerLabels: TrackerLabel[] = [];
  let trackerColumns: TrackerColumn[] = [];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'PATCH' && path.startsWith('/api/job-tracker/columns/')) {
      const column = { key: path.split('/').at(-1) as TrackerColumn['key'], label: route.request().postDataJSON().label };
      trackerColumns = [...trackerColumns.filter((item) => item.key !== column.key), column];
      await route.fulfill({ json: column });
      return;
    }
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
      if (changes.subitem) {
        const { action, id, ...fields } = changes.subitem;
        if (action === 'create') job.subitems!.push({ id: `new-${job.subitems!.length}`, status: 'PENDING', dueDate: null, workerIds: [], workers: [], ...fields });
        if (action === 'update') {
          const item = job.subitems!.find((subitem) => subitem.id === id)!;
          Object.assign(item, fields);
          if (fields.workerIds) item.workers = bootstrap.workers.filter((worker) => fields.workerIds.includes(worker.id));
        }
        if (action === 'delete') job.subitems = job.subitems!.filter((subitem) => subitem.id !== id);
        await route.fulfill({ json: job });
        return;
      }
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
      : path === '/api/bootstrap' ? { ...bootstrap, trackerLabels, trackerColumns }
      : path === '/api/jobs' ? jobs
      : path === '/api/health' ? { status: 'ok', database: 'up', timestamp: '2026-09-10T14:00:00Z' }
      : [];
    await route.fulfill({ json: payload });
  });
  await page.goto('/');
  if ((page.viewportSize()?.width ?? 1920) < 650) {
    await page.getByRole('button', { name: 'Show menu', exact: true }).click();
  }
  await page.getByLabel('Workspace sections').getByRole('button', { name: 'Job Tracker', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Job Tracker', exact: true })).toBeVisible();
}

async function expandSubitems(page: Page, service: string) {
  await page.getByRole('button', { name: `Expand subitems: ${service}`, exact: true }).click();
  return page.getByRole('table', { name: `Subitems for ${service}`, exact: true });
}

test('job details use current subitems, board labels and dates while keeping totals and edit actions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openTracker(page, [job('plumbing', { priority: 'HIGH' })]);
  await page.getByRole('button', { name: 'Hide menu', exact: true }).click();
  const subitems = await expandSubitems(page, 'Plumbing');
  await expect(page.locator('.jt-subitems-heading')).toHaveCount(0);
  await expect(page.locator('tfoot')).not.toContainText('sum');
  await expect(page.locator('.jt-board')).not.toContainText('of 1 completed');
  await subitems.getByRole('button', { name: /^Edit notes:/ }).click();
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Inspect the new water meter.\nCheck supply pressure.');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await page.getByRole('button', { name: 'Change status: Plumbing', exact: true }).click();
  await page.getByRole('button', { name: 'Edit labels', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name for DONE', exact: true }).fill('Finished');
  await page.getByLabel('Color for DONE', { exact: true }).fill('#405080');
  await page.getByRole('button', { name: 'Save labels', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'View details for Plumbing', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Plumbing', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Plumbing', exact: true })).toBeFocused();
  await expect(dialog.locator('.jt-details-summary')).toContainText('Finished');
  await expect(dialog.locator('.jt-details-summary')).toContainText('High');
  await expect(dialog.locator('.jt-details-subitems')).toContainText('Inspect the new water meter.');
  await expect(dialog).not.toContainText('Replace supply lines and inspect fixtures.');
  await expect(dialog.locator('.jt-details-range')).toContainText('Aug 31, 2026');
  await expect(dialog.locator('.jt-details-range')).toContainText('5 days');
  await expect(dialog.locator('.jt-details-total')).toHaveText('Total$4,350.00');
  await expect(dialog).toContainText('No files attached.');
  await page.screenshot({ path: 'test-results/tracker-job-details-desktop.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('button', { name: 'Edit job', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Property *', exact: true })).toHaveValue('glynn');
});

test('job details include invoice attachments and open their existing preview', async ({ page }) => {
  const item = job('plumbing', { description: '', subitems: [] });
  item.files.invoice.push({ id: 'invoice-1', category: 'INVOICE', name: 'Invoice 4012.pdf', url: '/api/invoice.pdf', mimeType: 'application/pdf', size: 200, createdAt: item.createdAt });
  await openTracker(page, [item]);
  await page.getByRole('button', { name: 'View details for Plumbing', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Plumbing', exact: true });
  await expect(dialog).toContainText('No subitems yet.');
  await expect(dialog).not.toContainText('No files attached.');
  await dialog.getByRole('button', { name: 'Open file: Invoice 4012.pdf', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Invoice 4012.pdf', exact: true })).toBeVisible();
});

test('job details fit mobile screens and keep viewer focus and long content inside the dialog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const description = Array.from({ length: 16 }, (_, i) => `Inspection ${i + 1}: Check every connection and verify the pressure before completing the repair.`).join('\n');
  await openTracker(page, [job('plumbing', { description })], 'VIEWER');
  const trigger = page.getByRole('button', { name: 'View details for Plumbing', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Plumbing', exact: true });
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Edit job', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await close.focus();
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: 'test-results/tracker-job-details-mobile.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Close job details', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('groups, filtered totals, monthly filtering, selection and empty state', async ({ page }) => {
  await openTracker(page);
  const glynn = page.getByRole('table', { name: 'Jobs at Glynn', exact: true });
  await expect(glynn.locator('tfoot')).toContainText('$5,550.00');
  await page.getByRole('checkbox', { name: 'Select jobs at Glynn', exact: true }).check();
  await expect(page.getByRole('status').filter({ hasText: '3 selected' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export selection' }).click();
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
  await page.getByLabel('Month', { exact: true }).fill('2026-09');
  await expect(glynn.locator('tfoot')).toContainText('$450.00');
  await expect(glynn.locator('.jt-date-summary-dates')).toHaveText('Sep 19');
  await expect(page.getByRole('button', { name: 'Export selection' })).toHaveCount(0);
  await page.getByPlaceholder('Property, service or worker...').fill('no-matching-job');
  await expect(page.getByText('No jobs match the current filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(glynn.locator('tfoot')).toContainText('$5,550.00');
});

test('keeps totals for the full group when revealing more jobs', async ({ page }) => {
  await openTracker(page, Array.from({ length: 12 }, (_, index) => job(`job-${index}`, { service: `Task ${index + 1}`, dueDate: index === 11 ? '2026-09-19T00:00:00Z' : '2026-08-31T00:00:00Z', materialCost: 0, laborCost: 10, totalCost: 10 })));
  const table = page.getByRole('table', { name: 'Jobs at Glynn', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(11);
  await expect(table.locator('tfoot')).toContainText('$120.00');
  await expect(table.locator('.jt-date-summary-dates')).toHaveText('Aug 31 – Sep 19');
  await page.getByRole('button', { name: 'Show 2 more' }).click();
  await expect(table.locator('tbody tr')).toHaveCount(13);
  await expect(table.locator('tfoot')).toContainText('$120.00');
  await expect(table.locator('.jt-date-summary-dates')).toHaveText('Aug 31 – Sep 19');
});

test('opens all attachments and preserves existing status and create flows', async ({ page }) => {
  await openTracker(page);
  await page.getByRole('button', { name: 'Before Plumbing: 4 files', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Inspection 4.pdf');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Change status: Drywall', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Stuck');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Edit payment: Drywall', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Partial payment');
  await page.keyboard.press('Escape');
  await page.getByRole('table', { name: 'Jobs at Saranac Rd', exact: true }).getByRole('button', { name: 'Add job' }).click();
  await expect(page.getByRole('combobox', { name: 'Property *', exact: true })).toHaveValue('saranac');
});

test('viewer has read-only actions and the mobile board scrolls within the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTracker(page, sampleJobs, 'VIEWER');
  await expect(page.getByRole('button', { name: 'New job' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add job' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Plumbing', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change status: Drywall' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change priority: Drywall' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit timeline: Drywall' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Rename column:/ })).toHaveCount(0);
  for (const field of ['owners', 'due date', 'notes', 'payment', 'labor', 'materials']) {
    await expect(page.getByRole('button', { name: `Edit ${field}: Drywall`, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: 'After Drywall: 0 files' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const scroll = page.getByRole('region', { name: 'Jobs at Glynn', exact: true });
  expect(await scroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/job-tracker-mobile.png', fullPage: true });
});

test('desktop design preview', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openTracker(page);
  await page.getByRole('button', { name: 'Hide menu', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select Plumbing', exact: true }).check();
  await expandSubitems(page, 'Plumbing');
  await page.screenshot({ path: 'test-results/job-tracker-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('edits status and priority, renames labels and retains changes after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openTracker(page);
  await page.getByRole('button', { name: 'Hide menu', exact: true }).click();
  const state = page.getByRole('button', { name: 'Change status: Plumbing', exact: true });
  await state.click();
  await page.screenshot({ path: 'test-results/tracker-status-menu.png' });
  await page.getByRole('dialog').getByRole('button', { name: 'Stuck', exact: true }).click();
  await expect(state).toHaveText('Stuck');
  await state.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await expect(state).toHaveText('Done');
  const priority = page.getByRole('button', { name: 'Change priority: Plumbing', exact: true });
  await priority.click();
  await page.screenshot({ path: 'test-results/tracker-priority-menu.png' });
  await page.getByRole('dialog').getByRole('button', { name: 'High', exact: true }).click();
  await expect(priority).toHaveText('High');
  await priority.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Edit labels' }).click();
  await page.getByRole('textbox', { name: 'Name for HIGH' }).fill('Urgent');
  await page.getByLabel('Color for HIGH', { exact: true }).fill('#542090');
  await page.getByRole('button', { name: 'Save labels' }).click();
  await expect(priority).toHaveText('Urgent');
  await page.reload();
  await page.getByRole('button', { name: 'Show menu', exact: true }).click();
  await page.getByLabel('Workspace sections').getByRole('button', { name: 'Job Tracker', exact: true }).click();
  await expect(priority).toHaveText('Urgent');
  await expect(state).toHaveText('Done');
  await priority.click();
  await page.getByRole('dialog').getByRole('button', { name: 'No priority', exact: true }).click();
  await expect(priority).toHaveText('No priority');
});

test('calendar selects a range, validates input and persists dates', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openTracker(page);
  await page.getByRole('button', { name: 'Hide menu', exact: true }).click();
  const timeline = page.getByRole('button', { name: 'Edit timeline: Plumbing', exact: true });
  await timeline.click();
  await page.getByRole('button', { name: '2026-08-27', exact: true }).click();
  await page.getByRole('button', { name: '2026-08-29', exact: true }).click();
  await expect(page.getByText('3 days selected', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/tracker-calendar.png' });
  await page.getByRole('button', { name: 'Save dates' }).click();
  await expect(timeline.locator('.jt-timeline-dates')).toHaveText('Aug 27 – Aug 29');
  await timeline.click();
  await page.getByLabel('End date', { exact: true }).fill('2026-08-20');
  await expect(page.getByRole('button', { name: 'Save dates' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(timeline.locator('.jt-timeline-dates')).toHaveText('Aug 27 – Aug 29');
  await timeline.click();
  await page.getByRole('button', { name: 'Clear dates' }).click();
  await page.getByRole('button', { name: 'Save dates' }).click();
  await expect(timeline).toHaveText('No dates');
});

test('summary menu switches modes without filtering out jobs', async ({ page }) => {
  await openTracker(page);
  const summary = page.getByRole('button', { name: 'Status summary for Glynn', exact: true });
  await summary.click();
  await expect(page.getByRole('dialog')).toHaveText("All LabelsWhat's Done");
  await page.getByRole('radio', { name: "What's Done", exact: true }).check();
  await expect(summary.getByRole('img')).toHaveAttribute('aria-label', '2 Done, 1 Not done');
  await expect(page.getByRole('button', { name: 'Change status: Drywall', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Priority summary for Glynn', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveText("All LabelsWhat's Done");
  await page.getByRole('radio', { name: "What's Done", exact: true }).check();
  await page.getByRole('button', { name: 'Priority summary for Glynn', exact: true }).click();
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
    if (fail) { fail = false; await route.fulfill({ status: 500, json: { message: 'Could not save. Try again.' } }); }
    else await route.fallback();
  });
  const state = page.getByRole('button', { name: 'Change status: Drywall', exact: true });
  await state.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Stuck', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Could not save. Try again.');
  await expect(state).toHaveText('Working on it');
  await page.getByRole('dialog').getByRole('button', { name: 'Stuck', exact: true }).click();
  await expect(state).toHaveText('Stuck');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('inline editors remain usable inside the horizontally scrolling mobile board', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTracker(page);
  await page.getByRole('button', { name: 'Change priority: Plumbing', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await dialog.getByRole('button', { name: 'High', exact: true }).click();
  await page.getByRole('button', { name: 'Edit timeline: Plumbing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save dates' })).toBeVisible();
  await page.screenshot({ path: 'test-results/tracker-mobile-calendar.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('edits notes in a dialog and USD amounts in the cell, retaining values and totals', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openTracker(page);
  await page.getByRole('button', { name: 'Hide menu', exact: true }).click();
  const subitems = await expandSubitems(page, 'Plumbing');
  const notes = subitems.locator('.jt-note-cell button').first();
  const cell = await notes.locator('..').boundingBox();
  const button = await notes.boundingBox();
  expect(button!.width).toBeGreaterThanOrEqual(cell!.width - 2);
  expect(button!.height).toBeGreaterThanOrEqual(cell!.height - 2);
  await notes.click();
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('First line\nSecond line');
  await expect(page.getByRole('dialog', { name: 'Description', exact: true })).toBeVisible();
  await expect(page.locator('.jt-note-cell textarea')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/tracker-notes-dialog.png' });
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(notes).toHaveText('First line Second line');
  const material = page.getByRole('button', { name: 'Edit materials: Plumbing', exact: true });
  await material.click();
  const input = page.getByRole('textbox', { name: 'Materials', exact: true });
  await input.fill('$1,234.56');
  const saved = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().endsWith('/plumbing/tracker'));
  await input.press('Enter');
  expect((await saved).postDataJSON()).toEqual({ materialCost: 1234.56 });
  await expect(material).toHaveText('$1,234.56');
  await expect(page.getByRole('table', { name: 'Jobs at Glynn', exact: true }).locator('tfoot')).toContainText('$5,084.56');
  await material.click();
  await input.fill('999');
  await input.press('Escape');
  await expect(material).toHaveText('$1,234.56');
  await page.reload();
  await page.getByRole('button', { name: 'Show menu', exact: true }).click();
  await page.getByLabel('Workspace sections').getByRole('button', { name: 'Job Tracker', exact: true }).click();
  await expect(material).toHaveText('$1,234.56');
  await expandSubitems(page, 'Plumbing');
  await notes.click();
  await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('First line\nSecond line');
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('');
  await expect(page.getByRole('button', { name: 'Save notes', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(notes).toHaveText('First line Second line');
});

test('notes dialog cancels drafts, keeps line breaks and allows retry after failed saves', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTracker(page);
  const subitems = await expandSubitems(page, 'Drywall');
  const notes = subitems.locator('.jt-note-cell button').first();
  await notes.click();
  const dialog = page.getByRole('dialog', { name: 'Description', exact: true });
  const bounds = await dialog.boundingBox();
  expect(bounds!.width).toBeGreaterThan(300);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  const text = dialog.getByRole('textbox', { name: 'Description', exact: true });
  await expect(text).toBeFocused();
  await text.fill('Discard this');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(notes).toHaveText('Finish walls in the living room.');
  await notes.click();
  await text.fill('Also discard');
  await text.press('Escape');
  await expect(dialog).toHaveCount(0);
  await notes.click();
  await text.fill('First line');
  await text.press('End');
  await text.press('Enter');
  await text.pressSequentially('Second line');
  await expect(text).toHaveValue('First line\nSecond line');
  let fail = true;
  await page.route('**/api/jobs/drywall/tracker', async (route) => {
    if (fail) { fail = false; await route.fulfill({ status: 500, json: { message: 'Try again' } }); }
    else await route.fallback();
  });
  await dialog.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Try again');
  await expect(text).toHaveValue('First line\nSecond line');
  await page.screenshot({ path: 'test-results/tracker-notes-mobile.png' });
  await dialog.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(notes).toHaveText('First line Second line');
});

test('viewers can read full notes without editing them', async ({ page }) => {
  await openTracker(page, sampleJobs, 'VIEWER');
  const subitems = await expandSubitems(page, 'Plumbing');
  await expect(subitems.getByRole('button', { name: 'Add subitem' })).toHaveCount(0);
  await expect(subitems.getByRole('button', { name: /^Delete subitem:/ })).toHaveCount(0);
  await expect(subitems.getByRole('button', { name: /^Change status:/ })).toHaveCount(0);
  await subitems.getByRole('button', { name: /^View notes:/ }).click();
  await expect(page.getByRole('textbox', { name: 'Description', exact: true })).toHaveJSProperty('readOnly', true);
  await expect(page.getByRole('button', { name: 'Save notes', exact: true })).toHaveCount(0);
});

test('summary tooltips show label, count and percentage for each segment', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openTracker(page, [job('plumbing', { priority: 'HIGH' }), job('drywall', { service: 'Drywall', priority: 'MEDIUM', status: 'IN_PROGRESS' }), job('cleaning', { service: 'Cleaning', priority: 'LOW' })]);
  await page.getByRole('button', { name: 'Hide menu', exact: true }).click();
  const priority = page.getByRole('button', { name: 'Priority summary for Glynn', exact: true });
  await priority.locator('.jt-summary-segment').first().hover();
  await expect(page.getByRole('tooltip')).toHaveText('High 1/3 33.3%');
  await page.screenshot({ path: 'test-results/tracker-summary-tooltip.png' });
  await priority.locator('.jt-summary-segment').nth(1).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Medium 1/3 33.3%');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await priority.click();
  await page.getByRole('radio', { name: "What's Done", exact: true }).check();
  await expect(page.getByRole('dialog')).toHaveText("All LabelsWhat's Done");
  await page.keyboard.press('Escape');
  await priority.locator('.jt-summary-segment').last().hover();
  await expect(page.getByRole('tooltip')).toHaveText('Not done 1/3 33.3%');
  await priority.focus();
  await priority.press('ArrowRight');
  await expect(page.getByRole('tooltip')).toContainText('1/3');
  const payment = page.getByRole('button', { name: 'Payment summary for Glynn', exact: true });
  await payment.hover();
  await expect(page.getByRole('tooltip').filter({ hasText: 'Paid 3/3' })).toContainText('100.0%');
  await page.getByRole('button', { name: 'Status summary for Glynn', exact: true }).locator('.jt-summary-segment').first().hover();
  await expect(page.getByRole('tooltip').filter({ hasText: 'Done' })).toHaveText('Done 2/3 66.7%');
});

test('renames headers across groups, persists them after reload and exports custom names', async ({ page }) => {
  await openTracker(page);
  const subitems = await expandSubitems(page, 'Plumbing');
  await expandSubitems(page, 'Electrical');
  const rename = page.getByRole('button', { name: 'Rename column: Description', exact: true });
  await rename.first().click();
  const input = page.getByRole('textbox', { name: 'Column name', exact: true });
  await input.fill('Work notes');
  const saved = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().endsWith('/columns/description'));
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saved).postDataJSON()).toEqual({ label: 'Work notes' });
  await expect(page.getByRole('button', { name: 'Rename column: Work notes', exact: true })).toHaveCount(2);
  await subitems.locator('.jt-note-cell button').first().click();
  await expect(page.getByRole('dialog', { name: 'Work notes', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByLabel('Workspace sections').getByRole('button', { name: 'Job Tracker', exact: true }).click();
  await expandSubitems(page, 'Plumbing');
  await expandSubitems(page, 'Electrical');
  await expect(page.getByRole('button', { name: 'Rename column: Work notes', exact: true })).toHaveCount(2);
  await page.getByRole('checkbox', { name: 'Select Plumbing', exact: true }).check();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export selection', exact: true }).click();
  const stream = await (await downloadPromise).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toContain('Work notes');
  await page.getByRole('button', { name: 'Rename column: Work', exact: true }).first().click();
  await input.fill('Task');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rename column: Task', exact: true })).toHaveCount(2);
  const taskCell = page.locator('.jt-task-cell').filter({ has: page.getByRole('button', { name: 'Collapse subitems: Plumbing', exact: true }) });
  await expect(taskCell.locator('.jt-task')).toHaveText('Kitchen');
  await expect(taskCell.getByRole('button')).toHaveCount(1);
  await taskCell.locator('.jt-task').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('header editing rejects blank names and retains the draft on a failed save', async ({ page }) => {
  await openTracker(page);
  await expandSubitems(page, 'Plumbing');
  await expandSubitems(page, 'Electrical');
  await page.getByRole('button', { name: 'Rename column: Description', exact: true }).first().click();
  const input = page.getByRole('textbox', { name: 'Column name', exact: true });
  await input.fill('  ');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await input.fill('Details');
  let fail = true;
  await page.route('**/api/job-tracker/columns/description', async (route) => {
    if (fail) { fail = false; await route.fulfill({ status: 500, json: { message: 'Try again' } }); }
    else await route.fallback();
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Try again');
  await expect(input).toHaveValue('Details');
  await expect(page.getByRole('button', { name: 'Rename column: Description', exact: true })).toHaveCount(2);
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Rename column: Details', exact: true }).first().click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rename column: Description', exact: true })).toHaveCount(2);
});

test('invalid amounts and failed saves keep the draft available for correction', async ({ page }) => {
  await openTracker(page);
  const labor = page.getByRole('button', { name: 'Edit labor: Drywall', exact: true });
  await labor.click();
  const input = page.getByRole('textbox', { name: 'Labor', exact: true });
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
  const owner = page.getByRole('button', { name: 'Edit owners: Cleaning', exact: true });
  await owner.click();
  await page.getByRole('checkbox', { name: 'Ryan Goertler', exact: true }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(owner.getByLabel('Ryan Goertler', { exact: true })).toBeVisible();
  const payment = page.getByRole('button', { name: 'Edit payment: Plumbing', exact: true });
  await payment.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Unpaid', exact: true }).click();
  await expect(payment).toHaveText('Unpaid');
  await payment.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Partial payment', exact: true }).click();
  await page.getByRole('textbox', { name: 'Advance (USD $)', exact: true }).fill('25.50');
  const saved = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().endsWith('/plumbing/tracker'));
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saved).postDataJSON()).toEqual({ paymentStatus: 'PARTIAL_PAYMENT', advanceCashApp: 25.5 });
  await expect(payment).toHaveText('Partial payment');
  await page.reload();
  await page.getByLabel('Workspace sections').getByRole('button', { name: 'Job Tracker', exact: true }).click();
  await expect(owner.getByLabel('Ryan Goertler', { exact: true })).toBeVisible();
  await expect(payment).toHaveText('Partial payment');
  await owner.click();
  await page.getByRole('button', { name: 'Unassigned', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(owner.getByLabel('Unassigned', { exact: true })).toBeVisible();
});

test('due dates update timeline duration on hover and can be cleared independently', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openTracker(page);
  await page.getByRole('button', { name: 'Hide menu', exact: true }).click();
  const timeline = page.getByRole('button', { name: 'Edit timeline: Plumbing', exact: true });
  await timeline.hover();
  await expect(timeline.locator('.jt-timeline-days')).toBeVisible();
  await expect(timeline.locator('.jt-timeline-days')).toHaveText('5d');
  const due = page.getByRole('button', { name: 'Edit due date: Plumbing', exact: true });
  await due.click();
  await page.getByRole('dialog', { name: 'Due date', exact: true }).getByLabel('Due date', { exact: true }).fill('2026-08-30');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(due).toHaveText('Aug 30');
  await timeline.hover();
  await expect(timeline.locator('.jt-timeline-days')).toHaveText('4d');
  await page.screenshot({ path: 'test-results/tracker-editable-duration.png' });
  await page.getByRole('heading', { name: 'Job Tracker', exact: true }).hover();
  await expect(timeline.locator('.jt-timeline-dates')).toBeVisible();
  await due.click();
  const saved = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().endsWith('/plumbing/tracker'));
  await page.getByRole('button', { name: 'Clear date', exact: true }).click();
  expect((await saved).postDataJSON()).toEqual({ dueDate: null });
  await expect(due).toHaveText('—');
  await expect(timeline.locator('.jt-timeline-dates')).toContainText('Aug 27');
  await expect(timeline.locator('.jt-timeline-days')).toHaveCount(0);
});

test('due date summary shows the full property range and inclusive days, then updates after edits', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-10T12:00:00Z'));
  await openTracker(page);
  const glynn = page.getByRole('table', { name: 'Jobs at Glynn', exact: true });
  const summary = glynn.getByRole('button', { name: /^Due date summary for Glynn:/ });
  await expect(summary.locator('.jt-date-summary-dates')).toHaveText('Aug 31 – Sep 19');
  expect(await summary.evaluate((element) => Number.parseFloat((element as HTMLElement).style.getPropertyValue('--jt-date-progress')))).toBeCloseTo(55);
  const dueColumn = glynn.locator(':scope > thead th').filter({ has: page.getByRole('button', { name: 'Rename column: Due date', exact: true }) });
  expect((await summary.boundingBox())!.x).toBeGreaterThanOrEqual((await dueColumn.boundingBox())!.x);
  await summary.hover();
  await expect(summary.locator('.jt-date-summary-days')).toBeVisible();
  await expect(summary.locator('.jt-date-summary-days')).toHaveText('20d');
  await page.screenshot({ path: 'test-results/tracker-due-summary.png' });
  await page.getByRole('heading', { name: 'Job Tracker', exact: true }).hover();
  await expect(summary.locator('.jt-date-summary-dates')).toBeVisible();
  await summary.focus();
  await summary.press('Enter');
  await expect(summary.locator('.jt-date-summary-days')).toBeVisible();
  await summary.press('Enter');
  await page.getByRole('button', { name: 'Edit due date: Drywall', exact: true }).click();
  await page.getByRole('button', { name: 'Clear date', exact: true }).click();
  await expect(summary.locator('.jt-date-summary-dates')).toHaveText('Aug 31');
  await summary.hover();
  await expect(summary.locator('.jt-date-summary-days')).toHaveText('1d');
  await expect(page.getByRole('button', { name: /^Due date summary for Saranac Rd:/ }).locator('.jt-date-summary-dates')).toHaveText('Sep 8');
});

test('areas, editable services and independent subitems persist without duplicating totals', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openTracker(page, [job('plumbing', { description: 'Inspect leaking meter.\n\nReplace piping.' })]);
  await page.getByRole('button', { name: 'Hide menu', exact: true }).click();
  const table = page.getByRole('table', { name: 'Jobs at Glynn', exact: true });
  await expect(table.locator('.jt-task')).toHaveText('Kitchen');
  await expect(table.locator('.jt-subitem-count')).toHaveText('2');
  await expect(page.getByRole('button', { name: 'Edit service: Plumbing', exact: true })).toHaveText('Plumbing');
  const subitems = await expandSubitems(page, 'Plumbing');
  await expect(subitems.locator('.jt-note-cell')).toHaveText(['Inspect leaking meter.', 'Replace piping.']);
  await subitems.getByRole('button', { name: 'Add subitem', exact: true }).click();
  await page.getByRole('textbox', { name: 'New subitem', exact: true }).fill('Pressure test water supply.');
  await page.getByRole('dialog').getByRole('button', { name: 'Add subitem', exact: true }).click();
  await expect(table.locator('.jt-subitem-count')).toHaveText('3');
  await subitems.getByRole('button', { name: 'Change status: Pressure test water supply.', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Working on it', exact: true }).click();
  await expect(subitems.getByRole('button', { name: 'Change status: Pressure test water supply.', exact: true })).toHaveText('Working on it');
  await subitems.getByRole('button', { name: 'Edit owners: Pressure test water supply.', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Ryan Goertler', exact: true }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await subitems.getByRole('button', { name: 'Edit due date: Pressure test water supply.', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Due date', { exact: true }).fill('2026-09-20');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(subitems.getByRole('button', { name: 'Edit due date: Pressure test water supply.', exact: true })).toHaveText('Sep 20');
  await expect(page.getByRole('button', { name: 'Change status: Plumbing', exact: true })).toHaveText('Done');
  await expect(table.locator('tfoot')).toContainText('$4,350.00');
  await expect(table.locator('.jt-date-summary-dates')).toHaveText('Aug 31');
  await page.screenshot({ path: 'test-results/tracker-subitems.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Show menu', exact: true }).click();
  await page.getByLabel('Workspace sections').getByRole('button', { name: 'Job Tracker', exact: true }).click();
  await expandSubitems(page, 'Plumbing');
  await expect(subitems.locator('.jt-note-cell')).toHaveCount(3);
  await expect(subitems.getByRole('button', { name: 'Edit owners: Pressure test water supply.', exact: true }).getByLabel('Ryan Goertler', { exact: true })).toBeVisible();
  await subitems.getByRole('button', { name: 'Delete subitem: Pressure test water supply.', exact: true }).click();
  await subitems.getByRole('button', { name: 'Delete subitem', exact: true }).click();
  await expect(subitems.locator('.jt-note-cell')).toHaveCount(2);
  await page.getByRole('button', { name: 'Edit service: Plumbing', exact: true }).click();
  await page.getByRole('textbox', { name: 'Services', exact: true }).fill('Water supply');
  await page.getByRole('button', { name: 'Save service', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Subitems for Water supply', exact: true })).toBeVisible();
  await expect(table.locator('.jt-task')).toHaveText('Kitchen');
  await expect(table.locator('tfoot')).toContainText('$4,350.00');
});

test('adds photos from an empty cell and keeps them after reload', async ({ page }) => {
  await openTracker(page);
  await page.getByRole('button', { name: 'After Drywall: 0 files', exact: true }).click();
  await page.getByLabel('Add photos', { exact: true }).setInputFiles({ name: 'repair.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64') });
  await expect(page.getByRole('dialog')).toContainText('repair.png');
  await expect(page.getByRole('button', { name: 'Eliminar archivo repair.png' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close files', exact: true }).click();
  await expect(page.getByRole('button', { name: 'After Drywall: 1 files', exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel('Workspace sections').getByRole('button', { name: 'Job Tracker', exact: true }).click();
  await page.getByRole('button', { name: 'After Drywall: 1 files', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('repair.png');
});
