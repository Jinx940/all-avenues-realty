import { expect, test, type Page } from '@playwright/test';

const property = { id: 'glynn', name: 'Glynn', address: '4256 E 119th St', cityLine: 'Cleveland, OH', notes: null, coverImageUrl: null, stories: [], totalJobs: 1, openJobs: 1, lateJobs: 1 };
const worker = { id: 'ryan', name: 'Ryan Goertler', status: 'ACTIVE', statusLabel: 'Active', totalJobCount: 1, linkedUserCount: 0, canDelete: false };
const job = {
  id: 'plumbing', propertyId: 'glynn', propertyName: 'Glynn', story: 'Floor 1', unit: 'Unit 1', section: '', area: 'Kitchen', service: 'Plumbing',
  description: 'Replace the supply line.\nTest the water pressure.', materialCost: 450, laborCost: 2650, totalCost: 3100,
  status: 'IN_PROGRESS', statusLabel: 'Working on it', invoiceStatus: 'NO', invoiceStatusLabel: 'No', paymentStatus: 'PARTIAL_PAYMENT', paymentStatusLabel: 'Partial Payment',
  advanceCashApp: 200, startDate: '2026-09-01', dueDate: '2026-09-09', completedAt: null,
  timeline: { label: '1 day late', tone: 'danger', isLate: true }, workers: [worker], workerIds: ['ryan'], subitems: [],
  files: { before: [], after: [], progress: [], receipt: [], invoice: [], quote: [] }, createdAt: '2026-09-01', updatedAt: '2026-09-10',
};
const user = { id: 'test', username: 'test', displayName: 'Preview User', role: 'ADMIN', status: 'ACTIVE', workerId: null };

async function openWorkspace(page: Page, mutableJobs?: Array<typeof job & { archivedAt?: string | null }>) {
  await page.clock.setFixedTime(new Date('2026-09-10T14:00:00Z'));
  await page.addInitScript(() => localStorage.setItem('aar-sidebar-expanded', 'true'));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (mutableJobs && path === '/api/properties/glynn/job-archive' && route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON() as { archived: boolean; jobIds: string[] };
      for (const item of mutableJobs) {
        if (payload.jobIds.includes(item.id)) item.archivedAt = payload.archived ? '2026-09-10T14:00:00Z' : null;
      }
      await route.fulfill({ json: { count: payload.jobIds.length } });
      return;
    }
    if (route.request().method() !== 'GET') throw new Error(`Unexpected write: ${path}`);
    const json = path === '/api/auth/session' ? { user }
      : path === '/api/bootstrap' ? { properties: [property], workers: [worker], inactiveWorkers: [], statuses: [{ value: 'IN_PROGRESS', label: 'Working on it' }, { value: 'DONE', label: 'Done' }], invoiceStatuses: [{ value: 'NO', label: 'No' }], paymentStatuses: [{ value: 'PARTIAL_PAYMENT', label: 'Partial Payment' }] }
      : path === '/api/jobs' ? mutableJobs ?? [job]
      : path === '/api/health' ? { status: 'ok', database: 'up', timestamp: '2026-09-10T14:00:00Z' }
      : path === '/api/client-portal/glynn' ? { property, jobs: [], documents: [], summary: { totalJobs: 1, completedJobs: 0, openJobs: 1, completionRate: 0 } }
      : path === '/api/admin/storage-backups/summary' ? { checkedAt: '2026-09-10', summary: { managedRefs: 0, backupRows: 0, unbackedManagedRefs: 0, compressionRatio: 0, totalStoredBytes: 0, totalOriginalBytes: 0, spaceSavedBytes: 0 } }
      : path === '/api/users' ? [user] : [];
    await route.fulfill({ json });
  });
  await page.goto('/');
  await expect(page.locator('.db-workspace')).toBeVisible();
}

async function navigate(page: Page, group: string, label: string) {
  if (await page.getByRole('button', { name: 'Show menu', exact: true }).isVisible()) await page.getByRole('button', { name: 'Show menu', exact: true }).click();
  const trigger = page.locator('.nav-group-trigger').filter({ hasText: group });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await page.locator('.nav-button').filter({ hasText: new RegExp(`^${label}$`) }).click();
  await expect(page.getByText('Loading panel...', { exact: true })).toHaveCount(0);
}

const sections = [
  ['Operations', 'Dashboard', '.db-workspace'], ['Operations', 'Schedule', '.schedule-shell'], ['Operations', 'Field Mode', '.field-mode-shell'],
  ['Operations', 'Alerts Center', '.alerts-center-shell'], ['Operations', 'Job Tracker', '.jt-board'],
  ['Properties', 'New Job', '.job-form-panel'], ['Properties', 'Property Info', '.tab-panel'], ['Properties', 'Property register', '.tab-panel'],
  ['Billing', 'Generate Invoice/Quote', '.iq-workspace'], ['Billing', 'Document Center', '.document-center-shell'],
  ['Team', 'Workers', '.workers-shell'], ['System', 'Settings', '.settings-shell'], ['Portal', 'Client Portal', '.client-portal-manager-shell'],
] as const;

for (const width of [1440, 390]) {
  test(`workspace sections remain usable at ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openWorkspace(page);
    for (const [group, label, selector] of sections) {
      await navigate(page, group, label);
      await expect(page.locator(selector).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label} should fit the viewport`).toBe(true);
      await page.screenshot({ path: `test-results/theme-${width}-${label.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`, fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}

test('confirmation traps focus, cancels with Escape and restores the trigger without deleting', async ({ page }) => {
  await openWorkspace(page);
  await navigate(page, 'Operations', 'Job Tracker');
  const trigger = page.getByRole('button', { name: 'Delete Plumbing', exact: true });
  await trigger.click();
  const dialog = page.locator('.workspace-confirm');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-describedby', /.+/);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.screenshot({ path: 'test-results/theme-confirmation.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toBeVisible();
  await page.locator('.advance-cash-bell-button').click();
  await expect(page.getByRole('dialog', { name: 'Advance Cash App alerts' })).toBeVisible();
  await expect(page.locator('.advance-cash-card')).toContainText('Kitchen / Plumbing');
  await page.screenshot({ path: 'test-results/theme-notifications.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Advance Cash App alerts' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.advance-cash-bell-button').click();
  const alerts = page.getByRole('dialog', { name: 'Advance Cash App alerts' });
  await expect(alerts).toBeVisible();
  expect(await alerts.evaluate((element) => { const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight; })).toBe(true);
  await page.screenshot({ path: 'test-results/theme-notifications-mobile.png' });
  await page.getByRole('button', { name: 'Close payment alerts' }).click();
  await expect(alerts).toHaveCount(0);
});

test('mobile navigation hides search and alerts until the menu closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  await expect(page.locator('.global-search')).toBeVisible();
  await page.locator('.advance-cash-bell-button').click();
  await expect(page.locator('.advance-cash-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Show menu', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.global-search')).toHaveCount(0);
  await expect(page.locator('.advance-cash-bell')).toHaveCount(0);
  await expect(page.locator('.advance-cash-panel')).toHaveCount(0);
  await expect(page.locator('.content')).toHaveAttribute('inert', '');
  await page.screenshot({ path: 'test-results/mobile-navigation-open.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Close navigation menu' }).click({ position: { x: 380, y: 400 } });
  await expect(page.locator('.global-search')).toBeVisible();
  await expect(page.locator('.advance-cash-bell-button')).toBeVisible();
  await expect(page.locator('.content')).not.toHaveAttribute('inert', '');
});

for (const width of [390, 844, 1440]) {
  test(`Job Tracker scrolls columns correctly at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkspace(page);
    await navigate(page, 'Operations', 'Job Tracker');
    const scroller = page.locator('.jt-table-scroll').first();
    const cells = scroller.locator('thead .jt-select-cell, thead th:nth-child(2), tbody .jt-select-cell, tbody .jt-task-cell');
    const before = await cells.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().left));
    expect(before.length).toBeGreaterThanOrEqual(4);
    await scroller.evaluate((element) => { element.scrollLeft = 350; });
    const distance = await scroller.evaluate((element) => element.scrollLeft);
    expect(distance).toBeGreaterThan(300);
    const after = await cells.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().left));
    after.forEach((left, index) => {
      if (width <= 900) expect(left).toBeCloseTo(before[index] - distance, 0);
      // Desktop cells may settle slightly onto their sticky inset after scrolling.
      else expect(Math.abs(left - before[index])).toBeLessThan(3);
    });
    await page.screenshot({ path: `test-results/tracker-scroll-${width}.png` });
  });
}

test('archive covers filtered property jobs, persists, preserves new jobs and restores history', async ({ page }) => {
  const records: Array<typeof job & { archivedAt?: string | null }> = [
    structuredClone(job), { ...structuredClone(job), id: 'electrical', service: 'Electrical' },
  ];
  await openWorkspace(page, records);
  await navigate(page, 'Operations', 'Job Tracker');
  await page.getByPlaceholder('Property, service or worker...').fill('Plumbing');
  await page.getByRole('button', { name: 'Archive jobs at Glynn', exact: true }).click();
  const confirmation = page.locator('.workspace-confirm');
  await expect(confirmation).toContainText('all 2 active jobs');
  await expect(confirmation).toContainText('2 unfinished; 2 not fully paid');
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(records.every((record) => !record.archivedAt)).toBe(true);
  await page.getByRole('button', { name: 'Archive jobs at Glynn', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Archive jobs', exact: true }).click();
  await expect(page.getByText('No active jobs match the current filters.')).toBeVisible();
  expect(records.every((record) => record.archivedAt && record.status === job.status && record.paymentStatus === job.paymentStatus && record.description === job.description && record.materialCost === job.materialCost)).toBe(true);
  await page.reload();
  await navigate(page, 'Operations', 'Job Tracker');
  await page.getByRole('button', { name: 'Archived', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore jobs at Glynn', exact: true })).toBeVisible();
  // A newly created job defaults to active, independently of older archived work.
  records.push({ ...structuredClone(job), id: 'new-job', service: 'New repair', archivedAt: null });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('button', { name: 'Active', exact: true }).click();
  await expect(page.locator('.jt-table')).toContainText('New repair');
  await expect(page.locator('.jt-table')).not.toContainText('Electrical');
  await page.getByRole('button', { name: 'Archived', exact: true }).click();
  await page.getByRole('button', { name: 'Restore jobs at Glynn', exact: true }).click();
  await expect(confirmation).toContainText('all 2 archived jobs');
  await confirmation.getByRole('button', { name: 'Restore jobs', exact: true }).click();
  await expect(page.getByText('No archived jobs match the current filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Active', exact: true }).click();
  await expect(page.locator('.jt-table')).toContainText('Electrical');
  await expect(page.locator('.jt-table')).toContainText('New repair');
  expect(records.every((record) => !record.archivedAt)).toBe(true);
});

test('login error uses the shared alert design', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ status: 401, json: { message: 'Invalid username or password.' } }));
  await page.goto('/');
  await page.getByPlaceholder('Enter your username').fill('preview');
  await page.getByPlaceholder('Enter your password').fill('test-password');
  await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.screenshot({ path: 'test-results/theme-login.png', fullPage: true });
});
