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

async function openGenerator(page: Page, history: GeneratedDocumentHistoryItem[] = [savedDocument]) {
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
      : path === '/api/generated-documents' ? history
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
  for (const owner of ['Juan Azabache (AZE)', 'Ryan Goertler', 'Todd Goertler', 'Morales', 'Crystal Sarich']) {
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

test('history pages show ten documents and reset on search changes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGenerator(page, Array.from({ length: 21 }, (_, i) => ({ ...savedDocument, id: `saved-${i}`, documentNumber: String(4001 + i), fileName: `Invoice_${4001 + i}.pdf` })));
  const history = page.locator('.iq-history');
  const rows = history.locator('.invoice-history-row:not(.invoice-history-row--header)');
  const navigation = history.getByRole('navigation', { name: 'Document history pagination' });
  await expect(rows).toHaveCount(10);
  await expect(navigation).toContainText('1–10 of 21 documents');
  await expect(navigation.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await navigation.getByRole('button', { name: 'Next' }).click();
  await expect(rows).toHaveCount(10);
  await expect(navigation).toContainText('11–20 of 21 documents');
  await navigation.getByRole('button', { name: 'Next' }).click();
  await expect(rows).toHaveCount(1);
  await expect(navigation).toContainText('21–21 of 21 documents');
  await expect(navigation.getByRole('button', { name: 'Next' })).toBeDisabled();
  await history.getByPlaceholder('Search by No., file or property').fill('4001');
  await expect(navigation).toContainText('Page 1 of 1');
  await expect(rows).toHaveCount(1);
  await history.getByPlaceholder('Search by No., file or property').fill('missing');
  await expect(navigation).toContainText('0–0 of 0 documents');
  await history.getByPlaceholder('Search by No., file or property').fill('');
  await expect(rows).toHaveCount(10);
  await expect(navigation).toContainText('Page 1 of 3');
});

test('Crystal Sarich invoice previews and exports with its own owner and USD totals', async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 1100 });
  const getIssued = await openGenerator(page);
  const setup = page.locator('.iq-setup');
  await setup.getByRole('combobox', { name: 'Property', exact: true }).selectOption('glynn');
  await setup.getByRole('combobox', { name: 'Header / Owner', exact: true }).selectOption('Crystal Sarich');
  await setup.getByPlaceholder('Enter number').fill('4012');
  await setup.getByPlaceholder('Customer name and address').fill('Example Property Client\nCleveland, OH');
  await page.getByLabel('Advance Payment (optional)', { exact: true }).fill('200');
  await expect(page.locator('.iq-total')).toContainText('$3,450.00');
  await page.getByRole('button', { name: 'Preview document', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Invoice 4012', exact: true });
  const frame = dialog.locator('iframe').contentFrame();
  await expect(frame.locator('.cs-brand')).toContainText('CRYSTAL SARICH');
  await expect(frame.locator('.cs-meta')).toContainText('Example Property Client');
  await expect(frame.locator('.cs-total')).toContainText('$3,450.00');
  expect(await frame.locator('.cs-bottom').evaluate((element) => {
    const table = element.previousElementSibling!;
    return element.getBoundingClientRect().top - table.getBoundingClientRect().bottom;
  })).toBeLessThan(2);
  await frame.locator('.page').screenshot({ path: 'test-results/crystal-invoice-preview.png' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Generate PDF', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Issue and download PDF', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs('test-results/crystal-invoice.pdf');
  expect(getIssued()).toMatchObject({ ownerKey: 'crystal', documentType: 'Invoice', documentNumber: '4012', jobIds: ['plumbing', 'drywall'] });
  expect(Buffer.from(getIssued()!.content as string, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
});

test('Crystal continuation pages preserve long descriptions and fit within the page', async ({ page }) => {
  test.setTimeout(60000);
  await openGenerator(page);
  const setup = page.locator('.iq-setup');
  await setup.getByRole('combobox', { name: 'Property', exact: true }).selectOption('glynn');
  await setup.getByRole('combobox', { name: 'Header / Owner', exact: true }).selectOption('Crystal Sarich');
  await setup.getByPlaceholder('Enter number').fill('4013');
  const description = Array.from({ length: 22 }, (_, i) => `Inspection ${i + 1}: Verify the water connections, test pressure and document the completed repair.`).join('\n');
  await page.getByLabel('Description for Water Meter Piping Repair', { exact: true }).fill(description);
  await page.getByRole('button', { name: 'Preview document', exact: true }).click();
  const frame = page.getByRole('dialog').locator('iframe').contentFrame();
  await expect(frame.locator('body')).toContainText('Inspection 22:');
  const pages = frame.locator('.page');
  // Continuous descriptions use at most two pages.
  expect(await pages.count()).toBeLessThanOrEqual(2);
  await expect(frame.locator('thead')).toHaveCount(1);
  await expect(frame.locator('.cs-footer')).toHaveCount(0);
  const fits = await pages.evaluateAll((elements) => elements.every((element) => {
    const footerTop = element.getBoundingClientRect().bottom - 42;
    return [...element.querySelectorAll('tbody tr, .cs-bottom')].every((row) => row.getBoundingClientRect().bottom < footerTop);
  }));
  expect(fits).toBe(true);

  const firstPageGap = await pages.first().evaluate((element) => {
    const footer = { top: element.getBoundingClientRect().bottom - 42 };
    const table = element.querySelector('.cs-table')!.getBoundingClientRect();
    return footer.top - table.bottom;
  });
  if (await pages.count() > 1) expect(firstPageGap).toBeLessThan(90);
  // Merged descriptions now fit the first service on one page.
  await expect(frame.locator('tbody strong').filter({ hasText: 'Water Meter Piping Repair' })).toHaveCount(1);
  expect(await frame.locator('.cs-bottom').evaluate((element) => element.getBoundingClientRect().top - element.previousElementSibling!.getBoundingClientRect().bottom)).toBeLessThan(2);
  await expect(frame.locator('.cs-total')).toHaveCount(1);
  await expect(frame.locator('.cs-money').filter({ hasText: '$2,650.00' })).toHaveCount(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Generate PDF', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Issue and download PDF', exact: true }).click();
  await (await downloadPromise).saveAs('test-results/crystal-invoice-long.pdf');
});

test('Crystal fills intermediate pages with a tall billing address without clipping text', async ({ page }) => {
  await openGenerator(page);
  const setup = page.locator('.iq-setup');
  await setup.getByRole('combobox', { name: 'Property', exact: true }).selectOption('glynn');
  await setup.getByRole('combobox', { name: 'Header / Owner', exact: true }).selectOption('Crystal Sarich');
  await setup.getByPlaceholder('Enter number').fill('4014');
  await setup.getByPlaceholder('Customer name and address').fill('Example Client\nProperty Management\nAccounts Payable\nBuilding A\nSuite 200\n4256 E 119th St\nCleveland, OH\nUnited States');
  const descriptions = Array.from({ length: 75 }, (_, i) => `Inspection ${i + 1}: Verify the water connections, test pressure and document the completed repair.`);
  await page.getByLabel('Description for Water Meter Piping Repair', { exact: true }).fill(descriptions.join('\n'));
  await page.getByRole('button', { name: 'Preview document', exact: true }).click();
  const frame = page.getByRole('dialog').locator('iframe').contentFrame();
  const pages = frame.locator('.page');
  expect(await pages.count()).toBeGreaterThan(1);
  const geometry = await pages.evaluateAll((elements) => elements.map((element) => {
    const footer = { top: element.getBoundingClientRect().bottom - 42 };
    const table = element.querySelector('.cs-table')!.getBoundingClientRect();
    const summary = element.querySelector('.cs-bottom');
    return { gap: footer.top - table.bottom, fits: (summary ?? element.querySelector('.cs-table'))!.getBoundingClientRect().bottom < footer.top };
  }));
  expect(geometry.every((page) => page.fits)).toBe(true);
  expect(geometry.slice(0, -1).every((page) => page.gap < 100)).toBe(true);
  expect((await frame.locator('.cs-description').allTextContents()).join(' ')).toContain(descriptions.join(' '));
  await expect(frame.locator('.cs-total')).toHaveCount(1);
});
