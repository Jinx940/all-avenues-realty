import { expect, test, type Page } from '@playwright/test';
import type { BootstrapPayload, GeneratedDocumentHistoryItem, JobRow, PropertySummary } from '../src/types';

const properties: PropertySummary[] = [{
  id: 'glynn', name: 'Glynn', address: '4256 E 119th St', cityLine: 'Cleveland, OH', notes: null, coverImageUrl: null, stories: [],
  totalJobs: 2, openJobs: 1, lateJobs: 0, floors: null, bedrooms: null, bathrooms: null, halfBathrooms: null,
  livingRooms: null, diningRooms: null, kitchens: null, sunroom: null, garages: null, attic: null, frontPorch: null, backPorch: null,
}];
const job = (id: string, service: string, area: string, labor: number, materials: number): JobRow => ({
  id, propertyId: 'glynn', propertyName: 'Glynn', story: 'Floor 1', unit: 'Unit 1', section: '', area, service,
  description: `Inspect the ${area.toLowerCase()} and complete the repairs.`, materialCost: materials, laborCost: labor, totalCost: labor + materials,
  status: 'DONE', statusLabel: 'Done', invoiceStatus: 'NO', invoiceStatusLabel: 'No', paymentStatus: 'UNPAID', paymentStatusLabel: 'Unpaid',
  advanceCashApp: 0, startDate: '2026-09-01', dueDate: '2026-09-10', completedAt: '2026-09-10',
  timeline: { label: 'Done', tone: 'success', isLate: false }, workers: [], workerIds: [],
  files: { before: [], after: [], progress: [], receipt: [], invoice: [], quote: [] }, createdAt: '2026-09-01', updatedAt: '2026-09-10',
});
const jobs = [job('plumbing', 'Water Meter Piping Repair', 'Kitchen', 2650, 450), job('drywall', 'Drywall patches', 'Living room', 450, 100)];
const bootstrap: BootstrapPayload = {
  properties, workers: [], inactiveWorkers: [], statuses: [{ value: 'DONE', label: 'Done' }],
  invoiceStatuses: [{ value: 'NO', label: 'No' }], paymentStatuses: [{ value: 'UNPAID', label: 'Unpaid' }],
};
const savedDocument: GeneratedDocumentHistoryItem = {
  id: 'saved', documentType: 'INVOICE', documentTypeLabel: 'Invoice', owner: 'RYAN', ownerLabel: 'Ryan Goertler', documentNumber: '4001',
  fileName: 'Invoice_Glynn_4001.pdf', propertyId: 'glynn', propertyName: 'Glynn', issueDate: '2026-09-10', createdAt: '2026-09-10', updatedAt: '2026-09-10',
  url: '/api/generated-documents/saved/file', printUrl: '/api/generated-documents/saved/print', linkedJobCount: 2, linkedJobs: [],
};

async function openGenerator(page: Page) {
  let issued: Record<string, unknown> | null = null;
  await page.clock.setFixedTime(new Date('2026-09-10T14:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('aar-sidebar-expanded', 'false'));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST' && path === '/api/generated-documents') {
      issued = route.request().postDataJSON();
      await route.fulfill({ json: { id: 'new-doc', documentNumber: issued!.documentNumber } });
      return;
    }
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${path}`);
    const json = path === '/api/auth/session' ? { user: { id: 'test', username: 'test', displayName: 'Preview User', role: 'ADMIN', status: 'ACTIVE', workerId: null } }
      : path === '/api/bootstrap' ? bootstrap : path === '/api/jobs' ? jobs
      : path === '/api/generated-documents' ? [savedDocument]
      : path === '/api/health' ? { status: 'ok', database: 'up', timestamp: '2026-09-10T14:00:00Z' } : [];
    await route.fulfill({ json });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create Invoice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Generate Invoice / Quote', exact: true })).toBeVisible();
  await expect(page.locator('.iq-history')).toContainText('4001');
  return () => issued;
}

test('compact setup, selected services and live totals remain synchronized', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1020 });
  await openGenerator(page);
  const setup = page.locator('.iq-setup');
  const summary = page.getByRole('complementary', { name: 'Document summary' });
  await expect(page.locator('.iq-empty')).toContainText('Start with a property');
  await expect(summary.getByRole('button', { name: 'Generate PDF', exact: true })).toBeDisabled();
  await setup.getByRole('combobox', { name: 'Property', exact: true }).selectOption('glynn');
  await setup.getByPlaceholder('Enter number').fill('4010');
  await setup.getByPlaceholder('Customer name and address').fill('Crystal Sarich\nAll Avenues Realty');
  await expect(summary.locator('.iq-total')).toContainText('$3,650.00');
  await page.getByLabel('Advance Payment (optional)', { exact: true }).fill('200');
  await expect(summary.locator('.iq-total')).toContainText('$3,450.00');
  await page.screenshot({ path: 'test-results/invoice-quote-desktop.png', fullPage: true });
  await page.getByLabel('Include Drywall patches in Living room', { exact: true }).uncheck();
  await expect(summary.locator('.iq-total')).toContainText('$2,900.00');
  await page.getByRole('button', { name: 'Hide services', exact: true }).click();
  await expect(page.locator('.invoice-services-collapsed')).toContainText('1 service(s)');
  await summary.getByRole('button', { name: 'Cost breakdown' }).click();
  await expect(summary.locator('.iq-total')).toContainText('$2,900.00');
  await summary.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(summary.locator('.iq-total')).toContainText('$3,650.00');
  await page.getByRole('button', { name: /Document history/ }).click();
  await expect(page.getByRole('heading', { name: 'Invoice / Quote history' })).toBeFocused();
});

test('all owner templates open previews for invoices and quotes with selected descriptions', async ({ page }) => {
  await openGenerator(page);
  const setup = page.locator('.iq-setup');
  await setup.getByRole('combobox', { name: 'Property', exact: true }).selectOption('glynn');
  await setup.getByPlaceholder('Enter number').fill('4010');
  await page.getByLabel('Description for Water Meter Piping Repair', { exact: true }).fill('Replace the water meter and verify pressure.');
  for (const owner of ['Juan Azabache (AZE)', 'Ryan Goertler', 'Todd Goertler', 'Morales']) {
    await setup.getByRole('combobox', { name: 'Header / Owner', exact: true }).selectOption(owner);
    for (const type of ['Invoice', 'Quote']) {
      await setup.getByRole('combobox', { name: 'Document', exact: true }).selectOption(type);
      await page.getByRole('button', { name: 'Preview document', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: `${type} 4010`, exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('iframe').contentFrame().locator('body')).toContainText('Replace the water meter and verify pressure.');
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    }
  }
});

test('generates a valid PDF through the existing issue flow', async ({ page }) => {
  test.setTimeout(60000);
  const getIssued = await openGenerator(page);
  const setup = page.locator('.iq-setup');
  await setup.getByRole('combobox', { name: 'Property', exact: true }).selectOption('glynn');
  await setup.getByRole('combobox', { name: 'Header / Owner', exact: true }).selectOption('Ryan Goertler');
  await setup.getByPlaceholder('Enter number').fill('4010');
  await page.getByRole('button', { name: 'Generate PDF', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Issue and download PDF', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Invoice_Glynn_4010.pdf');
  const issued = getIssued()!;
  expect(issued).toMatchObject({ propertyId: 'glynn', jobIds: ['plumbing', 'drywall'], documentType: 'Invoice', ownerKey: 'ryan', documentNumber: '4010' });
  expect(Buffer.from(issued.content as string, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
  await expect(page.getByText('Invoice 4010 issued and downloaded as PDF.', { exact: true })).toBeVisible();
});

test('history filters and duplicate number feedback remain available on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGenerator(page);
  const setup = page.locator('.iq-setup');
  await setup.getByRole('combobox', { name: 'Property', exact: true }).selectOption('glynn');
  await setup.getByPlaceholder('Enter number').fill('4001');
  await expect(setup.getByPlaceholder('Enter number')).toHaveAttribute('aria-invalid', 'true');
  await expect(setup).toContainText('This number is already in use.');
  await setup.getByPlaceholder('Enter number').fill('4010');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/invoice-quote-mobile.png', fullPage: true });
  const history = page.locator('.iq-history');
  await history.getByRole('combobox', { name: 'Type', exact: true }).selectOption('QUOTE');
  await expect(history).toContainText('No saved invoices or quotes match these filters.');
  await history.getByRole('combobox', { name: 'Type', exact: true }).selectOption('ALL');
  await history.getByPlaceholder('Search by No., file or property').fill('4001');
  await expect(history.locator('.invoice-history-row:not(.invoice-history-row--header)')).toHaveCount(1);
  await expect(history.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
});
