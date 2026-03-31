import { useMemo, useState } from 'react';
import { paymentStatusColor, workStatusColor } from '../lib/statusVisuals';
import type { ChartDatum, DashboardPayload, JobRow, Tone } from '../types';
import { downloadCsv } from '../lib/csv';
import { formatMoney } from '../lib/format';
import { UiIcon, type UiIconName } from './UiIcon';

type DecoratedChartDatum = ChartDatum & {
  color: string;
};

type DonutChartItem = DecoratedChartDatum & {
  share: number;
  start: number;
  end: number;
};

export function DashboardView({
  dashboard,
  jobs,
  onCreateJob,
  onOpenSettings,
  canCreateJob,
  canOpenSettings,
}: {
  dashboard: DashboardPayload | null;
  jobs: JobRow[];
  onCreateJob: () => void;
  onOpenSettings: () => void;
  canCreateJob: boolean;
  canOpenSettings: boolean;
}) {
  const [chartPage, setChartPage] = useState(0);
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | '7' | '30'>('ALL');

  const stats = dashboard?.stats;
  const totalJobs = stats?.totalJobs ?? 0;
  const doneJobs = stats?.doneJobs ?? 0;
  const lateJobs = stats?.lateJobs ?? 0;
  const unpaidJobs = stats?.unpaidOrPartial ?? 0;
  const inProgressJobs = stats?.inProgressJobs ?? 0;
  const pendingJobs = stats?.pendingJobs ?? 0;
  const materialTotal = stats?.materialTotal ?? 0;
  const laborTotal = stats?.laborTotal ?? 0;
  const overallInvestment = materialTotal + laborTotal;

  const completionRate = ratio(doneJobs, totalJobs);
  const paymentRiskRate = ratio(unpaidJobs, totalJobs);
  const overdueRate = ratio(lateJobs, totalJobs);
  const avgTicket = totalJobs ? overallInvestment / totalJobs : 0;
  const healthScore = totalJobs
    ? clamp(
        Math.round(
          completionRate * 0.55 + (100 - overdueRate) * 0.3 + (100 - paymentRiskRate) * 0.15,
        ),
        0,
        100,
      )
    : 0;

  const statusChart = buildDonutChart(dashboard?.charts.status ?? [], workStatusColor);
  const paymentChart = buildDonutChart(dashboard?.charts.payment ?? [], paymentStatusColor);
  const workerTrendData = decorateChartData(dashboard?.charts.workers ?? [], (_, index) =>
    dashboardAccentColor(index),
  );
  const propertyTrendData = decorateChartData(dashboard?.charts.properties ?? [], (_, index) =>
    dashboardAccentColor(index + 3),
  );
  const timelineAreaData = decorateChartData(dashboard?.charts.timeline ?? [], (_, index) =>
    dashboardAccentColor(index + 6),
  );
  const topWorker = topItem(dashboard?.charts.workers ?? []);
  const topProperty = topItem(dashboard?.charts.properties ?? []);
  const timelineLead = topItem(dashboard?.charts.timeline ?? []);
  const filteredJobs = useMemo(
    () => jobs.filter((job) => matchesDashboardDateFilter(job, dateFilter)),
    [dateFilter, jobs],
  );
  const estimatedRevenue = sumJobValues(jobs, (job) => job.totalCost);
  const collectedRevenue = sumJobValues(jobs, jobCollectedAmount);
  const outstandingRevenue = sumJobValues(jobs, jobOutstandingAmount);
  const partialCashCollected = sumJobValues(
    jobs.filter((job) => job.paymentStatus === 'PARTIAL_PAYMENT'),
    (job) => Math.min(job.advanceCashApp, job.totalCost),
  );
  const uninvoicedRevenue = sumJobValues(
    jobs.filter((job) => job.invoiceStatus !== 'YES'),
    (job) => job.totalCost,
  );
  const overdueReceivable = sumJobValues(
    jobs.filter((job) => job.timeline.isLate && job.paymentStatus !== 'PAID'),
    jobOutstandingAmount,
  );
  const recoveryRate = estimatedRevenue ? ratio(collectedRevenue, estimatedRevenue) : 0;
  const receivableByProperty = decorateChartData(
    aggregateChartData(jobs, (job) => job.propertyName, jobOutstandingAmount)
      .filter((item) => item.value > 0)
      .slice(0, 8),
    (_, index) => dashboardAccentColor(index + 5),
  );
  const collectionHistogramItems = decorateChartData(
    [
      { label: 'Collected', value: collectedRevenue },
      { label: 'Outstanding', value: outstandingRevenue },
      { label: 'Partial cash', value: partialCashCollected },
      { label: 'Uninvoiced', value: uninvoicedRevenue },
    ],
    (_, index) => dashboardAccentColor(index + 2),
  );
  const topReceivableProperty = topItem(receivableByProperty);
  const missingWorkerJobs = filteredJobs.filter((job) => !job.workerIds.length).length;
  const missingInvoiceJobs = filteredJobs.filter((job) => job.invoiceStatus !== 'YES').length;
  const missingPhotoJobs = filteredJobs.filter(
    (job) => !job.files.before.length || !job.files.after.length,
  ).length;
  const missingDueDateJobs = filteredJobs.filter((job) => !job.dueDate).length;
  const workflowHistogramItems = [
    { label: 'Done', value: doneJobs, tone: 'success' as Tone },
    { label: 'In progress', value: inProgressJobs, tone: 'warning' as Tone },
    { label: 'Pending', value: pendingJobs, tone: 'orange' as Tone },
    { label: 'Overdue', value: lateJobs, tone: 'danger' as Tone },
  ];
  const financeHistogramItems = decorateChartData(
    [
      { label: 'Material', value: materialTotal },
      { label: 'Labor', value: laborTotal },
      { label: 'Average', value: avgTicket },
      { label: 'Portfolio', value: overallInvestment },
    ],
    (_, index) => dashboardAccentColor(index + 1),
  );
  const operationalGapAreaData = decorateChartData(
    [
      { label: 'No worker', value: missingWorkerJobs },
      { label: 'No invoice', value: missingInvoiceJobs },
      { label: 'No photos', value: missingPhotoJobs },
      { label: 'No due date', value: missingDueDateJobs },
    ],
    (_, index) => dashboardAccentColor(index + 8),
  );

  const workloadStateLabel =
    lateJobs > 0 ? 'Urgent attention needed' : inProgressJobs > 0 ? 'Active production' : 'Stable flow';
  const workloadStateTone = lateJobs > 0 ? 'danger' : inProgressJobs > 0 ? 'warning' : 'success';
  const exportDate = new Date().toISOString().slice(0, 10);
  const exportTimestamp = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());

  const exportJobsReport = () => {
    downloadCsv(`jobs-report-${exportDate}.csv`, [
      [
        'Property',
        'Story',
        'Unit',
        'Area',
        'Service',
        'Status',
        'Payment status',
        'Invoice status',
        'Advance cash',
        'Material',
        'Labor',
        'Total',
        'Workers',
        'Start date',
        'Due date',
      ],
      ...filteredJobs.map((job) => [
        job.propertyName,
        job.story,
        job.unit,
        job.area,
        job.service,
        job.statusLabel,
        job.paymentStatusLabel,
        job.invoiceStatusLabel,
        job.advanceCashApp,
        job.materialCost,
        job.laborCost,
        job.totalCost,
        job.workers.map((worker) => worker.name).join(' | '),
        job.startDate ?? '',
        job.dueDate ?? '',
      ]),
    ]);
  };

  const exportFinanceReport = () => {
    downloadCsv(`finance-summary-${exportDate}.csv`, [
      ['Report', 'Finance summary', '', ''],
      ['Generated at', exportTimestamp, '', ''],
      ['Date scope', dashboardDateFilterLabel(dateFilter), '', ''],
      ['Health score', `${healthScore}%`, '', ''],
      [],
      ['Section', 'Metric', 'Value', 'Notes'],
      ['Operations', 'Total jobs', totalJobs, 'Jobs included in the current dashboard scope.'],
      ['Operations', 'Completed jobs', doneJobs, 'Jobs already marked as done.'],
      ['Operations', 'In progress jobs', inProgressJobs, 'Jobs currently active in production.'],
      ['Operations', 'Pending jobs', pendingJobs, 'Jobs waiting to start or to be scheduled.'],
      ['Operations', 'Late jobs', lateJobs, 'Jobs that are already overdue.'],
      [
        'Performance',
        'Completion rate',
        `${completionRate}%`,
        'Completed jobs as a percentage of total jobs.',
      ],
      [
        'Performance',
        'Payment exposure',
        `${paymentRiskRate}%`,
        'Share of jobs that are unpaid or partially paid.',
      ],
      [
        'Performance',
        'Overdue rate',
        `${overdueRate}%`,
        'Share of jobs that are overdue.',
      ],
      ['Costs', 'Material total', formatMoney(materialTotal), 'Accumulated material spend.'],
      ['Costs', 'Labor total', formatMoney(laborTotal), 'Accumulated labor spend.'],
      ['Costs', 'Portfolio value', formatMoney(overallInvestment), 'Material plus labor investment.'],
      [
        'Revenue',
        'Estimated revenue',
        formatMoney(estimatedRevenue),
        'Projected billing across the current portfolio.',
      ],
      [
        'Revenue',
        'Collected revenue',
        formatMoney(collectedRevenue),
        'Revenue already secured through paid jobs and partial cash.',
      ],
      [
        'Revenue',
        'Outstanding revenue',
        formatMoney(outstandingRevenue),
        'Revenue still pending collection.',
      ],
      [
        'Collections',
        'Partial cash collected',
        formatMoney(partialCashCollected),
        'Advance cash already captured on partial-payment jobs.',
      ],
      [
        'Collections',
        'Uninvoiced revenue',
        formatMoney(uninvoicedRevenue),
        'Revenue tied to jobs that still need an invoice.',
      ],
      [
        'Collections',
        'Overdue receivable',
        formatMoney(overdueReceivable),
        'Pending balance that is already overdue.',
      ],
      [
        'Collections',
        'Recovery rate',
        `${recoveryRate}%`,
        'Collected revenue as a percentage of estimated revenue.',
      ],
    ]);
  };

  const chartCards = [
    <DonutInsightCard
      key="status"
      eyebrow="Operations"
      title="Status sectors"
      subtitle="Interactive sector view for current work states."
      chart={statusChart}
      icon="chart"
    />,
    <DonutInsightCard
      key="payment"
      eyebrow="Billing"
      title="Payment sectors"
      subtitle="Interactive sector view for payment pressure."
      chart={paymentChart}
      icon="receipt"
    />,
    <VerticalBarsCard
      key="flow"
      eyebrow="Workflow"
      title="Workload histogram"
      subtitle="Status volume grouped as an animated histogram."
      icon="activity"
      items={workflowHistogramItems}
    />,
    <CostBalanceCard
      key="costs"
      eyebrow="Finance"
      title="Cost histogram"
      subtitle="Financial load distributed across the main cost buckets."
      icon="dollar"
      items={financeHistogramItems}
    />,
    <CostBalanceCard
      key="collections"
      eyebrow="Collections"
      title="Collections histogram"
      subtitle="Collected, pending and uninvoiced balances across the workspace."
      icon="receipt"
      items={collectionHistogramItems}
    />,
    <RankChartCard
      key="workers"
      eyebrow="Team"
      title="Worker line chart"
      subtitle="Trend line of the crew members with the biggest load."
      icon="users"
      data={workerTrendData}
      emptyMessage="No worker workload data yet."
    />,
    <RankChartCard
      key="properties"
      eyebrow="Portfolio"
      title="Property line chart"
      subtitle="Line trend for the properties with the highest concentration."
      icon="home"
      data={propertyTrendData}
      emptyMessage="No property volume yet."
    />,
    <RankChartCard
      key="receivables"
      eyebrow="Receivables"
      title="Outstanding by property"
      subtitle="Properties carrying the biggest unpaid balance."
      icon="dollar"
      data={receivableByProperty}
      emptyMessage="No outstanding balances by property."
    />,
    <AreaChartCard
      key="timeline"
      eyebrow="Timeline"
      title="Timeline area chart"
      subtitle="Area view of the dominant schedule pressure."
      icon="calendar"
      data={timelineAreaData}
      emptyMessage="No timeline pressure data yet."
    />,
    <AreaChartCard
      key="gaps"
      eyebrow="Operations"
      title="Gaps area chart"
      subtitle="Operational gaps displayed as an animated area wave."
      icon="shield"
      data={operationalGapAreaData}
      emptyMessage="No operational gaps detected."
    />,
  ];

  const totalChartPages = Math.ceil(chartCards.length / 2);
  const safeChartPage = Math.min(chartPage, Math.max(totalChartPages - 1, 0));
  const visibleChartCards = chartCards.slice(safeChartPage * 2, safeChartPage * 2 + 2);

  return (
    <section className="tab-panel">
      <div className="panel dashboard-shell dashboard-shell--enhanced">
        <div className="dashboard-hero-grid">
          <div className="dashboard-hero-card dashboard-hero-card--main">
            <p className="page-kicker">Dashboard</p>
            <h2 className="title-with-icon">
              <UiIcon name="dashboard" />
              <span>Operations Overview</span>
            </h2>
            <p>
              Review portfolio health, payment exposure, crew activity and the jobs that need the
              next decision.
            </p>

            <div className="dashboard-hero-meta">
              <div className="dashboard-health-block">
                <span className="eyebrow">Portfolio Health</span>
                <strong>{healthScore}%</strong>
                <small>
                  {totalJobs === 0
                    ? 'No jobs yet'
                    : healthScore >= 78
                    ? 'Healthy pipeline'
                    : healthScore >= 58
                      ? 'Watch closely'
                      : 'Needs intervention'}
                </small>
              </div>

              <div className="dashboard-hero-actions">
                <button
                  type="button"
                  className="ghost-button dashboard-hero-button dashboard-hero-button--settings"
                  onClick={exportJobsReport}
                >
                  <UiIcon name="download" />
                  Export jobs CSV
                </button>
                <button
                  type="button"
                  className="ghost-button dashboard-hero-button dashboard-hero-button--settings"
                  onClick={exportFinanceReport}
                >
                  <UiIcon name="download" />
                  Export finance CSV
                </button>
                {canCreateJob ? (
                  <button
                    type="button"
                    className="dashboard-hero-button dashboard-hero-button--create"
                    onClick={onCreateJob}
                  >
                    <UiIcon name="plus" />
                    Create job
                  </button>
                ) : null}
                {canOpenSettings ? (
                  <button
                    type="button"
                    className="ghost-button dashboard-hero-button dashboard-hero-button--settings"
                    onClick={onOpenSettings}
                  >
                    <UiIcon name="settings" />
                    Open settings
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="dashboard-hero-card dashboard-hero-card--side">
            <span className="eyebrow">Live status</span>
            <strong>{workloadStateLabel}</strong>
            <p>
              {lateJobs} overdue, {inProgressJobs} in progress and {pendingJobs} pending jobs are
              shaping the current workload.
            </p>
            <span className={`pill tone-${workloadStateTone}`}>
              {lateJobs > 0 ? 'Action required' : 'On track'}
            </span>
          </div>
        </div>

        <div className="dashboard-summary-grid">
          <InsightCard label="Total jobs" value={totalJobs} note={`${doneJobs} already completed`} icon="briefcase" />
          <InsightCard label="Completion rate" value={`${completionRate}%`} note={`${inProgressJobs} still active`} icon="chart" />
          <InsightCard
            label="Average ticket"
            value={formatMoney(avgTicket)}
            note="Material + labor average per job"
            icon="dollar"
          />
          <InsightCard
            label="Payment exposure"
            value={`${paymentRiskRate}%`}
            note={`${unpaidJobs} unpaid / partial`}
            icon="receipt"
          />
          <InsightCard
            label="Overdue rate"
            value={`${overdueRate}%`}
            note={`${lateJobs} jobs need follow-up`}
            icon="calendar"
          />
          <InsightCard
            label="Portfolio value"
            value={formatMoney(overallInvestment)}
            note="Current labor and material volume"
            icon="home"
          />
          <InsightCard
            label="Collected estimate"
            value={formatMoney(collectedRevenue)}
            note="Paid jobs plus advance cash already secured"
            icon="dollar"
          />
          <InsightCard
            label="Outstanding balance"
            value={formatMoney(outstandingRevenue)}
            note="Amount still pending across unpaid or partial jobs"
            icon="receipt"
          />
          <InsightCard
            label="Recovery rate"
            value={`${recoveryRate}%`}
            note={`${formatMoney(overdueReceivable)} already overdue to collect`}
            icon="calendar"
          />
        </div>

        <div className="dashboard-note-grid dashboard-alert-grid">
          <ActionCard
            eyebrow="Alerts"
            title="Current blockers"
            icon="shield"
            items={[
              `${missingWorkerJobs} job(s) without worker assignment in the selected window.`,
              `${missingInvoiceJobs} job(s) still without invoice status marked as Yes.`,
              `${missingPhotoJobs} job(s) missing before or after evidence.`,
              `${missingDueDateJobs} job(s) still without due date.`,
            ]}
          />
          <article className="shell-section-card dashboard-action-card">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Date filter</p>
                <h3 className="title-with-icon title-with-icon--sm">
                  <UiIcon name="calendar" />
                  <span>Operational window</span>
                </h3>
                <p>Change the alert window to review the jobs you want to watch closely.</p>
              </div>
            </div>

            <div className="dashboard-filter-pills">
              {(['ALL', 'TODAY', '7', '30'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`ghost-button ${dateFilter === option ? 'is-active' : ''}`}
                  onClick={() => setDateFilter(option)}
                >
                  {option === 'ALL'
                    ? 'All'
                    : option === 'TODAY'
                      ? 'Today'
                      : option === '7'
                        ? 'Last 7 days'
                        : 'Last 30 days'}
                </button>
              ))}
            </div>
          </article>
        </div>

        <div className="dashboard-note-grid">
          <ActionCard
            eyebrow="Collections"
            title="Cashflow watch"
            icon="dollar"
            items={[
              `${formatMoney(collectedRevenue)} is already secured across paid jobs and registered advance cash.`,
              `${formatMoney(outstandingRevenue)} is still pending collection across the portfolio.`,
              uninvoicedRevenue > 0
                ? `${formatMoney(uninvoicedRevenue)} is tied to jobs that still need invoice issuance.`
                : 'Every current job already has invoice coverage.',
            ]}
          />
          <ActionCard
            eyebrow="Exposure"
            title="Receivable pressure"
            icon="receipt"
            items={[
              overdueReceivable > 0
                ? `${formatMoney(overdueReceivable)} is overdue and should be reviewed with urgency.`
                : 'No overdue receivable balance is active right now.',
              topReceivableProperty
                ? `${topReceivableProperty.label} carries the heaviest open balance right now.`
                : 'No property has outstanding receivables at the moment.',
              partialCashCollected > 0
                ? `${formatMoney(partialCashCollected)} has been captured as partial cash on active work.`
                : 'No partial cash has been registered yet.',
            ]}
          />
        </div>

        <div className="dashboard-chart-carousel">
          <div className="dashboard-chart-carousel-head">
            <div>
              <p className="eyebrow">Statistics</p>
              <h3 className="title-with-icon title-with-icon--sm">
                <UiIcon name="chart" />
                <span>Interactive chart board</span>
              </h3>
              <p>Eight animated dashboards shown two at a time. Move left or right to review the full board.</p>
            </div>

            <div className="dashboard-carousel-controls">
              <button
                type="button"
                className="ghost-button carousel-arrow"
                onClick={() =>
                  setChartPage((current) =>
                    current === 0 ? Math.max(totalChartPages - 1, 0) : current - 1,
                  )
                }
              >
                &lt;
              </button>
              <span className="pill tone-neutral">
                {totalChartPages ? `${safeChartPage + 1} / ${totalChartPages}` : '0 / 0'}
              </span>
              <button
                type="button"
                className="ghost-button carousel-arrow"
                onClick={() =>
                  setChartPage((current) =>
                    current >= totalChartPages - 1 ? 0 : current + 1,
                  )
                }
              >
                &gt;
              </button>
            </div>
          </div>

          <div className="dashboard-chart-carousel-grid">{visibleChartCards}</div>
        </div>

        <div className="dashboard-note-grid">
          <ActionCard
            eyebrow="Focus"
            title="What deserves attention"
            icon="spark"
            items={[
              lateJobs > 0
                ? `${lateJobs} overdue jobs should be reviewed in Job Tracker first.`
                : 'No overdue jobs right now, keep the schedule stable.',
              unpaidJobs > 0
                ? `${unpaidJobs} records still need payment follow-up or invoicing.`
                : 'Payments are clean right now.',
              pendingJobs > 0
                ? `${pendingJobs} pending jobs are waiting for scheduling or assignment.`
                : 'No pending backlog at the moment.',
            ]}
          />
          <ActionCard
            eyebrow="Highlights"
            title="Operational highlights"
            icon="dashboard"
            items={[
              topWorker
                ? `${topWorker.label} currently leads activity with ${topWorker.value} assigned records.`
                : 'No worker activity highlight yet.',
              topProperty
                ? `${topProperty.label} is the busiest property right now with ${topProperty.value} jobs.`
                : 'No property concentration detected yet.',
              timelineLead
                ? `${timelineLead.label} is the dominant timeline state in the board.`
                : 'Timeline state will appear here when there is data.',
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function ratio(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sumJobValues(jobs: JobRow[], getter: (job: JobRow) => number) {
  return jobs.reduce((total, job) => total + getter(job), 0);
}

function jobCollectedAmount(job: JobRow) {
  if (job.paymentStatus === 'PAID') {
    return job.totalCost;
  }

  if (job.paymentStatus === 'PARTIAL_PAYMENT') {
    return Math.min(job.advanceCashApp, job.totalCost);
  }

  return 0;
}

function jobOutstandingAmount(job: JobRow) {
  return Math.max(job.totalCost - jobCollectedAmount(job), 0);
}

function aggregateChartData(
  jobs: JobRow[],
  getLabel: (job: JobRow) => string,
  getValue: (job: JobRow) => number,
) {
  const totals = new Map<string, number>();

  jobs.forEach((job) => {
    const label = getLabel(job);
    const value = getValue(job);
    totals.set(label, (totals.get(label) ?? 0) + value);
  });

  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value);
}

function matchesDashboardDateFilter(job: JobRow, filter: 'ALL' | 'TODAY' | '7' | '30') {
  if (filter === 'ALL') return true;

  const rawDate = job.dueDate || job.startDate || job.createdAt;
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return true;

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const diffDays = Math.floor((startOfToday.getTime() - target.getTime()) / 86400000);

  if (filter === 'TODAY') {
    return diffDays === 0;
  }

  const limit = Number.parseInt(filter, 10);
  return diffDays >= 0 && diffDays < limit;
}

function dashboardDateFilterLabel(filter: 'ALL' | 'TODAY' | '7' | '30') {
  if (filter === 'ALL') return 'All jobs';
  if (filter === 'TODAY') return 'Today only';
  if (filter === '7') return 'Last 7 days';
  return 'Last 30 days';
}

function topItem(items: ChartDatum[]) {
  if (!items.length) return null;
  return [...items].sort((left, right) => right.value - left.value)[0] ?? null;
}

function buildDonutChart(
  data: ChartDatum[],
  colorForLabel: (label: string, index: number) => string,
) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (!data.length || total === 0) {
    return {
      total: 0,
      items: [] as DonutChartItem[],
      gradient: 'conic-gradient(#e9f2fb 0deg 360deg)',
    };
  }

  let currentAngle = 0;
  const items = data.map((item, index) => {
    const share = (item.value / total) * 100;
    const color = colorForLabel(item.label, index);
    const start = currentAngle;
    currentAngle += (item.value / total) * 360;

    return {
      label: item.label,
      value: item.value,
      color,
      share,
      start,
      end: currentAngle,
    };
  });

  return {
    total,
    items,
    gradient: `conic-gradient(${items.map((item) => `${item.color} ${item.start}deg ${item.end}deg`).join(', ')})`,
  };
}

function decorateChartData(
  data: ChartDatum[],
  colorForLabel: (label: string, index: number) => string,
): DecoratedChartDatum[] {
  return data.map((item, index) => ({
    ...item,
    color: colorForLabel(item.label, index),
  }));
}

function dashboardAccentColor(index: number) {
  const palette = [
    '#79c5ff',
    '#73ddb6',
    '#ffd17b',
    '#f7a8b8',
    '#bba8ff',
    '#8cd8ff',
    '#9fe08f',
    '#ffbf8a',
    '#7cc6c6',
    '#9aa9ff',
  ];

  return palette[index % palette.length];
}

function hexToRgba(color: string, alpha: number) {
  const normalized = color.replace('#', '');
  const safe = normalized.length === 3
    ? normalized.split('').map((item) => `${item}${item}`).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  const value = Number.parseInt(safe, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const radians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(radians),
    y: centerY + radius * Math.sin(radians),
  };
}

function describeDonutArc(
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const safeEndAngle = endAngle - 0.02;
  const outerStart = polarToCartesian(centerX, centerY, outerRadius, safeEndAngle);
  const outerEnd = polarToCartesian(centerX, centerY, outerRadius, startAngle);
  const innerStart = polarToCartesian(centerX, centerY, innerRadius, safeEndAngle);
  const innerEnd = polarToCartesian(centerX, centerY, innerRadius, startAngle);
  const largeArcFlag = safeEndAngle - startAngle <= 180 ? '0' : '1';

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

function buildTrendGeometry(
  data: Array<{ label: string; value: number; color: string }>,
  width: number,
  height: number,
  paddingX = 30,
  paddingY = 24,
) {
  const count = data.length;
  const maxValue = Math.max(...data.map((item) => item.value), 1);
  const bottom = height - paddingY;
  const top = paddingY;
  const usableHeight = bottom - top;
  const usableWidth = width - paddingX * 2;
  const stepX = count > 1 ? usableWidth / (count - 1) : 0;

  const points = data.map((item, index) => ({
    ...item,
    x: count > 1 ? paddingX + stepX * index : width / 2,
    y: bottom - (item.value / maxValue) * usableHeight,
  }));

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${bottom} L ${points[0].x} ${bottom} Z`
    : '';
  const gridLines = Array.from({ length: 4 }, (_, index) => top + (usableHeight / 3) * index);

  return { points, linePath, areaPath, gridLines, bottom };
}

function formatCompactMetric(value: number) {
  if (value >= 1000) {
    return Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: value >= 10000 ? 0 : 1,
    }).format(value);
  }

  return String(Math.round(value));
}

function InsightCard({
  label,
  value,
  note,
  icon = 'chart',
}: {
  label: string;
  value: string | number;
  note: string;
  icon?: UiIconName;
}) {
  return (
    <article className="metric-card dashboard-metric-card">
      <span className="field-label-inline">
        <UiIcon name={icon} size={15} />
        <span>{label}</span>
      </span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function DonutInsightCard({
  eyebrow,
  title,
  subtitle,
  chart,
  icon,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  chart: {
    total: number;
    items: DonutChartItem[];
    gradient: string;
  };
  icon: UiIconName;
}) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const activeItem = chart.items.find((item) => item.label === selectedLabel) ?? chart.items[0] ?? null;

  return (
    <article className="shell-section-card dashboard-donut-card">
      <div className="panel-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3 className="title-with-icon title-with-icon--sm">
            <UiIcon name={icon} />
            <span>{title}</span>
          </h3>
          <p>{subtitle}</p>
        </div>
      </div>

      {chart.items.length && activeItem ? (
        <div className="dashboard-sector-layout">
          <div className="dashboard-sector-visual">
            <svg viewBox="0 0 320 220" className="dashboard-sector-svg" role="img" aria-label={title}>
              {chart.items.map((item, index) => {
                const isActive = item.label === activeItem.label;
                const middleAngle = (item.start + item.end) / 2;
                const offset = isActive ? 8 : 0;
                const radians = ((middleAngle - 90) * Math.PI) / 180;
                const translateX = Math.cos(radians) * offset;
                const translateY = Math.sin(radians) * offset;

                return (
                  <g
                    key={item.label}
                    className={`dashboard-sector-slice-group ${isActive ? 'is-active' : ''}`}
                    onClick={() => setSelectedLabel(item.label)}
                    style={{ transform: `translate(${translateX}px, ${translateY}px)` }}
                  >
                    <path
                      className="dashboard-sector-slice"
                      d={describeDonutArc(160, 110, 82, 44, item.start, item.end)}
                      fill={item.color}
                      style={{ animationDelay: `${index * 90}ms` }}
                    />
                  </g>
                );
              })}
              <circle className="dashboard-sector-hole" cx="160" cy="110" r="40" />
              <text className="dashboard-sector-center-value" x="160" y="104" textAnchor="middle">
                {Math.round(activeItem.share)}%
              </text>
              <text className="dashboard-sector-center-label" x="160" y="126" textAnchor="middle">
                {activeItem.label}
              </text>
            </svg>
          </div>

          <div className="dashboard-sector-legend">
            {chart.items.map((item) => {
              const isActive = item.label === activeItem.label;
              return (
                <button
                  key={item.label}
                  type="button"
                  className={`dashboard-sector-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => setSelectedLabel(item.label)}
                  style={{
                    borderColor: hexToRgba(item.color, isActive ? 0.52 : 0.24),
                    background: `linear-gradient(180deg, ${hexToRgba(item.color, isActive ? 0.24 : 0.12)}, ${hexToRgba(item.color, isActive ? 0.1 : 0.04)})`,
                  }}
                >
                  <span className="dashboard-sector-swatch" style={{ backgroundColor: item.color }} />
                  <span className="dashboard-sector-copy">
                    <strong>{item.label}</strong>
                    <small>
                      {item.value} items | {Math.round(item.share)}%
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="empty-box">No chart data yet.</div>
      )}
    </article>
  );
}

function VerticalBarsCard({
  eyebrow,
  title,
  subtitle,
  items,
  icon,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  items: Array<{ label: string; value: number; tone: Tone }>;
  icon: UiIconName;
}) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const activeItem = items.find((item) => item.label === selectedLabel) ?? items[0] ?? null;
  const max = items.length ? Math.max(...items.map((item) => item.value), 1) : 1;

  return (
    <article className="shell-section-card dashboard-bars-card">
      <div className="panel-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3 className="title-with-icon title-with-icon--sm">
            <UiIcon name={icon} />
            <span>{title}</span>
          </h3>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="dashboard-histogram-grid">
        {items.map((item, index) => {
          const isActive = item.label === activeItem?.label;

          return (
            <button
              key={item.label}
              type="button"
              className={`dashboard-histogram-bar ${isActive ? 'is-active' : ''}`}
              onClick={() => setSelectedLabel(item.label)}
            >
              <span className="dashboard-histogram-value">{item.value}</span>
              <span className="dashboard-histogram-track">
                <span
                  className={`dashboard-histogram-fill dashboard-vertical-bar-fill--${item.tone}`}
                  style={{
                    height: `${Math.max((item.value / max) * 100, item.value ? 10 : 0)}%`,
                    animationDelay: `${index * 90}ms`,
                  }}
                />
              </span>
              <strong>{item.label}</strong>
            </button>
          );
        })}
      </div>

      {activeItem ? (
        <div className="dashboard-chart-note">
          <strong>{activeItem.label}</strong>
          <span>{activeItem.value} records selected</span>
        </div>
      ) : null}
    </article>
  );
}

function CostBalanceCard({
  eyebrow,
  title,
  subtitle,
  items,
  icon,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  items: Array<{ label: string; value: number; color: string }>;
  icon: UiIconName;
}) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const activeItem = items.find((item) => item.label === selectedLabel) ?? items[0] ?? null;
  const max = items.length ? Math.max(...items.map((item) => item.value), 1) : 1;

  return (
    <article className="shell-section-card dashboard-finance-card">
      <div className="panel-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3 className="title-with-icon title-with-icon--sm">
            <UiIcon name={icon} />
            <span>{title}</span>
          </h3>
          <p>{subtitle}</p>
        </div>
      </div>

      {items.length ? (
        <>
          <div className="dashboard-histogram-grid dashboard-histogram-grid--finance">
            {items.map((item, index) => {
              const isActive = item.label === activeItem?.label;

              return (
                <button
                  key={item.label}
                  type="button"
                  className={`dashboard-histogram-bar dashboard-histogram-bar--finance ${isActive ? 'is-active' : ''}`}
                  onClick={() => setSelectedLabel(item.label)}
                >
                  <span className="dashboard-histogram-value">{formatCompactMetric(item.value)}</span>
                  <span className="dashboard-histogram-track">
                    <span
                      className="dashboard-histogram-fill dashboard-histogram-fill--custom"
                      style={{
                        height: `${Math.max((item.value / max) * 100, item.value ? 10 : 0)}%`,
                        background: `linear-gradient(180deg, ${hexToRgba(item.color, 0.98)}, ${hexToRgba(item.color, 0.74)})`,
                        animationDelay: `${index * 90}ms`,
                      }}
                    />
                  </span>
                  <strong>{item.label}</strong>
                </button>
              );
            })}
          </div>

          {activeItem ? (
            <div
              className="dashboard-chart-note dashboard-chart-note--finance"
              style={{
                borderColor: hexToRgba(activeItem.color, 0.28),
                background: `linear-gradient(180deg, ${hexToRgba(activeItem.color, 0.18)}, ${hexToRgba(activeItem.color, 0.08)})`,
              }}
            >
              <strong>{activeItem.label}</strong>
              <span>{formatMoney(activeItem.value)}</span>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-box">No finance data yet.</div>
      )}
    </article>
  );
}

function RankChartCard({
  eyebrow,
  title,
  subtitle,
  data,
  emptyMessage,
  icon,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  data: DecoratedChartDatum[];
  emptyMessage: string;
  icon: UiIconName;
}) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const activeItem = data.find((item) => item.label === selectedLabel) ?? data[0] ?? null;
  const geometry = buildTrendGeometry(data, 420, 230);

  return (
    <article className="shell-section-card dashboard-rank-card">
      <div className="panel-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3 className="title-with-icon title-with-icon--sm">
            <UiIcon name={icon} />
            <span>{title}</span>
          </h3>
          <p>{subtitle}</p>
        </div>
      </div>

      {data.length && activeItem ? (
        <div className="dashboard-line-shell">
          <div className="dashboard-line-stage">
            <svg viewBox="0 0 420 230" className="dashboard-line-svg" role="img" aria-label={title}>
              {geometry.gridLines.map((y) => (
                <line
                  key={`grid-${y}`}
                  className="dashboard-chart-gridline"
                  x1="30"
                  x2="390"
                  y1={y}
                  y2={y}
                />
              ))}
              <path className="dashboard-line-path" d={geometry.linePath} />
              {geometry.points.map((point) => {
                const isActive = point.label === activeItem.label;
                return (
                  <g key={point.label} onClick={() => setSelectedLabel(point.label)}>
                    <circle
                      className={`dashboard-line-point-glow ${isActive ? 'is-active' : ''}`}
                      cx={point.x}
                      cy={point.y}
                      r={isActive ? 12 : 8}
                      fill={hexToRgba(point.color, isActive ? 0.22 : 0.14)}
                    />
                    <circle
                      className={`dashboard-line-point ${isActive ? 'is-active' : ''}`}
                      cx={point.x}
                      cy={point.y}
                      r={isActive ? 6 : 4.6}
                      fill={point.color}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          <div
            className="dashboard-line-active-copy"
            style={{
              borderColor: hexToRgba(activeItem.color, 0.28),
              background: `linear-gradient(180deg, ${hexToRgba(activeItem.color, 0.16)}, ${hexToRgba(activeItem.color, 0.08)})`,
            }}
          >
            <strong>{activeItem.label}</strong>
            <span>{activeItem.value} records</span>
          </div>

          <div className="dashboard-line-chip-row">
            {data.map((item) => {
              const isActive = item.label === activeItem.label;
              return (
                <button
                  key={item.label}
                  type="button"
                  className={`dashboard-line-chip ${isActive ? 'is-active' : ''}`}
                  onClick={() => setSelectedLabel(item.label)}
                  style={{
                    borderColor: hexToRgba(item.color, isActive ? 0.44 : 0.2),
                    background: `linear-gradient(180deg, ${hexToRgba(item.color, isActive ? 0.18 : 0.08)}, ${hexToRgba(item.color, isActive ? 0.08 : 0.02)})`,
                  }}
                >
                  <span className="dashboard-line-chip-dot" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="empty-box">{emptyMessage}</div>
      )}
    </article>
  );
}

function AreaChartCard({
  eyebrow,
  title,
  subtitle,
  data,
  emptyMessage,
  icon,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  data: Array<{ label: string; value: number; color: string }>;
  emptyMessage: string;
  icon: UiIconName;
}) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const activeItem = data.find((item) => item.label === selectedLabel) ?? data[0] ?? null;
  const geometry = buildTrendGeometry(data, 420, 230);
  const fillColor = activeItem?.color ?? '#87debf';

  return (
    <article className="shell-section-card dashboard-action-card">
      <div className="panel-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3 className="title-with-icon title-with-icon--sm">
            <UiIcon name={icon} />
            <span>{title}</span>
          </h3>
          <p>{subtitle}</p>
        </div>
      </div>

      {data.length && activeItem ? (
        <div className="dashboard-area-shell">
          <div className="dashboard-area-stage">
            <svg viewBox="0 0 420 230" className="dashboard-area-svg" role="img" aria-label={title}>
              {geometry.gridLines.map((y) => (
                <line
                  key={`area-grid-${y}`}
                  className="dashboard-chart-gridline"
                  x1="30"
                  x2="390"
                  y1={y}
                  y2={y}
                />
              ))}
              <path
                className="dashboard-area-fill"
                d={geometry.areaPath}
                style={{ fill: hexToRgba(fillColor, 0.22) }}
              />
              <path
                className="dashboard-area-line"
                d={geometry.linePath}
                style={{ stroke: fillColor }}
              />
              {geometry.points.map((point) => {
                const isActive = point.label === activeItem.label;
                return (
                  <g key={point.label} onClick={() => setSelectedLabel(point.label)}>
                    <circle
                      className={`dashboard-area-point-ring ${isActive ? 'is-active' : ''}`}
                      cx={point.x}
                      cy={point.y}
                      r={isActive ? 11 : 8}
                      fill={hexToRgba(point.color, isActive ? 0.18 : 0.1)}
                    />
                    <circle
                      className={`dashboard-area-point ${isActive ? 'is-active' : ''}`}
                      cx={point.x}
                      cy={point.y}
                      r={isActive ? 5.5 : 4.4}
                      fill={point.color}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          <div
            className="dashboard-chart-note"
            style={{
              borderColor: hexToRgba(activeItem.color, 0.28),
              background: `linear-gradient(180deg, ${hexToRgba(activeItem.color, 0.16)}, ${hexToRgba(activeItem.color, 0.08)})`,
            }}
          >
            <strong>{activeItem.label}</strong>
            <span>{activeItem.value} records selected</span>
          </div>

          <div className="dashboard-line-chip-row">
            {data.map((item) => {
              const isActive = item.label === activeItem.label;
              return (
                <button
                  key={item.label}
                  type="button"
                  className={`dashboard-line-chip ${isActive ? 'is-active' : ''}`}
                  onClick={() => setSelectedLabel(item.label)}
                  style={{
                    borderColor: hexToRgba(item.color, isActive ? 0.44 : 0.2),
                    background: `linear-gradient(180deg, ${hexToRgba(item.color, isActive ? 0.18 : 0.08)}, ${hexToRgba(item.color, isActive ? 0.08 : 0.02)})`,
                  }}
                >
                  <span className="dashboard-line-chip-dot" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="empty-box">{emptyMessage}</div>
      )}
    </article>
  );
}

function ActionCard({
  eyebrow,
  title,
  items,
  icon,
}: {
  eyebrow: string;
  title: string;
  items: string[];
  icon: UiIconName;
}) {
  return (
    <article className="shell-section-card dashboard-action-card">
      <div className="panel-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3 className="title-with-icon title-with-icon--sm">
            <UiIcon name={icon} />
            <span>{title}</span>
          </h3>
        </div>
      </div>

      <ul className="dashboard-action-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}
